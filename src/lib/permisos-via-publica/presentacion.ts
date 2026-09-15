import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarEvento } from "./endosos";
import { normalizar, parcelaPorDireccion } from "./catastro";
import { FaltanDatos } from "./generacion";
import { NOMBRE_DOCUMENTO, type TipoDueno } from "./tipos";
import { leerSupervision } from "./supervision";
import { avisarPasoPendiente } from "./gestion";

// La presentación del permiso en TAD: qué documento va en cada casillero, cuándo un trámite
// está listo y los datos que necesita el robot de la Mac (robot/tad-presentar.mjs). La app
// nunca habla con TAD.
//
// AUTOMÁTICA (JS, 2026-09-15): apenas el trámite está listo se pide sola y el robot adjunta y
// confirma sin esperar a nadie. Los controles están en el robot (dirección contra catastro,
// formulario guardado, cada adjunto verificado) y ante cualquier duda frena.
//
// Mapa de casilleros: docs/modulo-gestoria-permisos.md § "Presentación en TAD — mapeo".

type Casillero = {
  /** Comienzo del texto del casillero en TAD (se busca por prefijo). */
  casillero: string;
  /** Claves de pvp_documentos que van en ese casillero, en orden; varias se unen en un PDF. */
  docs: (tipo: TipoDueno, inquilino: boolean) => string[];
};

/**
 * Los 12 casilleros de TAD con Persona Jurídica (EyE presenta como representante técnico) y
 * de dónde sale cada documento. Consorcio y empresa siguen el instructivo de Tamara (estatuto
 * → reglamento, autoridades y poder → acta de asamblea, apoderado → administrador).
 * PERSONA FÍSICA: a confirmar con Tamara; se usa título, DNI y nota de autorización.
 */
export const CASILLEROS: Casillero[] = [
  { casillero: "Nota de solicitud dirigida", docs: (t) => [t === "persona" ? "nota_autorizacion" : "nota_solicitud"] },
  { casillero: "Seguro de Responsabilidad Civil", docs: () => ["poliza_rc"] },
  { casillero: "Informe Técnico del andamio", docs: () => ["informe_tecnico"] },
  { casillero: "Certificado de Encomienda Profesional", docs: () => ["encomienda_cpau"] },
  { casillero: "Croquis del lugar a instalar", docs: () => ["croquis"] },
  { casillero: "Aviso de obra presentado", docs: () => ["aviso_obra"] },
  { casillero: "Copia autenticada del estatuto", docs: (t) => [({ consorcio: "reglamento", empresa: "estatuto", persona: "titulo_propiedad" } as const)[t]] },
  { casillero: "Copia autenticada del instrumento de designación de autoridades", docs: (t) => [({ consorcio: "acta_asamblea", empresa: "acta_directorio", persona: "dni" } as const)[t]] },
  { casillero: "Poder autenticado por escribano", docs: (t) => [({ consorcio: "acta_asamblea", empresa: "poder", persona: "nota_autorizacion" } as const)[t]] },
  { casillero: "Copia del DNI del apoderado", docs: (t) => [({ consorcio: "dni_administrador", empresa: "dni_apoderado", persona: "dni" } as const)[t]] },
  { casillero: "Otra documentación", docs: (_t, inquilino) => ["acta_compromiso", "constancia_cuit", ...(inquilino ? ["contrato_alquiler", "nota_dueno"] : [])] },
];

export type RequisitoCasillero = { casillero: string; documentos: { clave: string; nombre: string; ok: boolean }[]; ok: boolean };

export type EstadoPresentacion = {
  listo: boolean;
  /** Lo que falta, en palabras de persona. Vacío si está listo. */
  faltan: string[];
  casilleros: RequisitoCasillero[];
};

type TramitePresentacion = {
  id: string; direccion: string; titular_nombre: string | null; titular_cuit: string | null; tipo_dueno: TipoDueno | null;
  es_inquilino: boolean; permiso_hasta: string | null; expediente_id: string | null; es_prueba: boolean;
  odoo_venta_id: number | null; odoo_venta_nombre: string | null; cliente_nombre: string | null; estado: string;
};
type DocPresentacion = { clave: string; estado: string; archivo_path: string | null; archivo_nombre: string | null; revision: { leido?: Record<string, unknown> } | null };

async function leer(db: SupabaseClient, tramiteId: string) {
  const [{ data: t }, { data: docs }] = await Promise.all([
    db.from("pvp_tramites").select("id, direccion, titular_nombre, titular_cuit, tipo_dueno, es_inquilino, permiso_hasta, expediente_id, es_prueba, odoo_venta_id, odoo_venta_nombre, cliente_nombre, estado").eq("id", tramiteId).maybeSingle(),
    db.from("pvp_documentos").select("clave, estado, archivo_path, archivo_nombre, revision").eq("tramite_id", tramiteId),
  ]);
  return { t: t as TramitePresentacion | null, docs: (docs ?? []) as DocPresentacion[] };
}

function evaluar(t: TramitePresentacion | null, docs: DocPresentacion[]): EstadoPresentacion {
  if (!t) return { listo: false, faltan: ["El trámite no existe."], casilleros: [] };
  const faltan: string[] = [];
  if (t.expediente_id) faltan.push("Ya está presentado (tiene expediente).");
  if (!t.tipo_dueno || !t.titular_cuit) faltan.push("El cliente todavía no cargó el dueño del lote.");
  if (!t.permiso_hasta) faltan.push("Falta la fecha hasta la que se pide el permiso.");

  const porClave = new Map(docs.map((d) => [d.clave, d]));
  const casilleros: RequisitoCasillero[] = t.tipo_dueno
    ? CASILLEROS.map((c) => {
        const documentos = c.docs(t.tipo_dueno!, t.es_inquilino).map((clave) => {
          const d = porClave.get(clave);
          return { clave, nombre: NOMBRE_DOCUMENTO[clave] ?? clave, ok: !!d && d.estado === "ok" && !!d.archivo_path };
        });
        return { casillero: c.casillero, documentos, ok: documentos.every((x) => x.ok) };
      })
    : [];
  const docsFaltantes = [...new Set(casilleros.flatMap((c) => c.documentos.filter((d) => !d.ok).map((d) => d.nombre)))];
  if (docsFaltantes.length) faltan.push(`Documentos sin archivo o sin revisar: ${docsFaltantes.join(", ")}.`);

  const poliza = porClave.get("poliza_rc")?.revision?.leido;
  if (porClave.get("poliza_rc")?.estado === "ok" && (!poliza?.compania || !poliza?.vigencia_hasta)) {
    faltan.push("La revisión de la póliza no leyó la compañía o el vencimiento.");
  }
  return { listo: faltan.length === 0, faltan, casilleros };
}

export async function estadoPresentacion(db: SupabaseClient, tramiteId: string): Promise<EstadoPresentacion> {
  const { t, docs } = await leer(db, tramiteId);
  return evaluar(t, docs);
}

const RELLENO = new Set(["AV", "AVDA", "AVENIDA", "DR", "GRAL", "ING", "PJE", "PASAJE", "DE", "DEL", "LA", "LOS", "LAS"]);
const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const dd = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/** "Compañía de Seguros La Mercantil Andina S.A." → "LA MERCANTIL ANDINA" (así lo carga Tamara). */
function compania(nombre: string): string {
  return plano(nombre).replace(/\b(COMPANIA|CIA)\b( DE)? SEGUROS?\b/g, "").replace(/\bS ?A\b|\bS ?R ?L\b|\bSOCIEDAD ANONIMA\b/g, "").replace(/\s+/g, " ").trim();
}

export type PayloadPresentacion = {
  es_prueba: boolean;
  tramite_id: string;
  direccion: string;
  odoo_venta_id: number | null;
  odoo_venta_nombre: string | null;
  cliente_nombre: string | null;
  /** Calle con el nombre del catastro (igual al de TAD), primera palabra para buscar, altura y SMP esperado. */
  obra: { calle: string; buscar: string; altura: number; smp: string };
  /** dd/mm/aaaa. "Desde" lo pone el robot el día que presenta. */
  hasta: string;
  seguro: { compania: string; vencimiento: string };
  adjuntos: { casillero: string; archivos: { clave: string; path: string; nombre: string }[] }[];
};

export async function armarPayloadPresentacion(db: SupabaseClient, tramiteId: string): Promise<PayloadPresentacion> {
  const { t, docs } = await leer(db, tramiteId);
  const estado = evaluar(t, docs);
  if (!t) throw new FaltanDatos("El trámite no existe.");
  // La prueba no adjunta ni presenta: sólo necesita dirección, fechas y seguro.
  if (!t.es_prueba && !estado.listo) throw new FaltanDatos(`Todavía no se puede presentar. ${estado.faltan.join(" ")}`);

  const informe = docs.find((d) => d.clave === "informe_tecnico")?.revision?.leido as { direccion?: string } | undefined;
  const direccion = informe?.direccion || t.direccion;
  const n = await normalizar(direccion).catch(() => null);
  const parcela = n ? await parcelaPorDireccion(n.codCalle, n.altura).catch(() => null) : null;
  // La prueba usa Trelles 1086 si su dirección no existe (como la encomienda).
  const obra = n && parcela
    ? { calle: n.calle, buscar: plano(n.calle).split(" ").find((p) => p.length > 2 && !RELLENO.has(p)) ?? plano(n.calle), altura: n.altura, smp: parcela.smp.toUpperCase() }
    : t.es_prueba ? { calle: "TRELLES, MANUEL R.", buscar: "TRELLES", altura: 1086, smp: "057-035-001A" } : null;
  if (!obra) throw new FaltanDatos(`La dirección ${direccion} no se encontró en el catastro de la Ciudad: sin sección, manzana y parcela no se presenta.`);

  const poliza = docs.find((d) => d.clave === "poliza_rc")?.revision?.leido as { compania?: string; vigencia_hasta?: string } | undefined;
  const seguro = poliza?.compania && poliza?.vigencia_hasta
    ? { compania: compania(poliza.compania), vencimiento: dd(poliza.vigencia_hasta) }
    : t.es_prueba ? { compania: "LA MERCANTIL ANDINA", vencimiento: "30/06/2027" } : null;
  if (!seguro) throw new FaltanDatos("La revisión de la póliza no leyó la compañía o el vencimiento.");

  const porClave = new Map(docs.map((d) => [d.clave, d]));
  const adjuntos = t.tipo_dueno
    ? CASILLEROS.map((c) => ({
        casillero: c.casillero,
        archivos: c.docs(t.tipo_dueno!, t.es_inquilino)
          .map((clave) => porClave.get(clave))
          .filter((d): d is DocPresentacion => !!d?.archivo_path)
          .map((d) => ({ clave: d.clave, path: d.archivo_path!, nombre: d.archivo_nombre ?? d.clave })),
      }))
    : [];

  const hasta = t.permiso_hasta && t.permiso_hasta > new Date().toISOString().slice(0, 10)
    ? dd(t.permiso_hasta)
    : dd(new Date(new Date().setMonth(new Date().getMonth() + 6)).toISOString());

  return {
    es_prueba: t.es_prueba, tramite_id: t.id, direccion, odoo_venta_id: t.odoo_venta_id, odoo_venta_nombre: t.odoo_venta_nombre,
    cliente_nombre: t.cliente_nombre, obra, hasta, seguro, adjuntos,
  };
}

/** Deja la presentación en la cola del robot. Una abierta por trámite. */
export async function pedirPresentacion(
  db: SupabaseClient,
  tramiteId: string,
  opts: { userId?: string | null } = {},
): Promise<{ resultado: "pedida" | "ya_pedida" }> {
  const payload = await armarPayloadPresentacion(db, tramiteId);
  const { error } = await db.from("pvp_tareas").insert({ tipo: "tad_presentar", tramite_id: tramiteId, payload, pedida_por: opts.userId ?? null });
  if (error?.code === "23505") return { resultado: "ya_pedida" };
  if (error) throw new Error(error.message);

  if (!payload.es_prueba) await db.from("pvp_tramites").update({ estado: "listo_para_presentar", updated_at: new Date().toISOString() }).eq("id", tramiteId);
  await registrarEvento(
    db, tramiteId, "presentacion_tad",
    payload.es_prueba
      ? `Prueba de presentación pedida: el robot llena y guarda el formulario en TAD (${payload.obra.calle} ${payload.obra.altura}) y borra el borrador. No adjunta ni presenta.`
      : `Listo para presentar: el robot presenta en TAD (${payload.obra.calle} ${payload.obra.altura}, SMP ${payload.obra.smp}, ${payload.adjuntos.length} casilleros).`,
    { tramite_id: tramiteId }, opts.userId ? "persona" : "sistema",
  );
  return { resultado: "pedida" };
}

/**
 * Si el trámite quedó listo, pide la presentación sola. Una sola vez por trámite: si ya hubo
 * una (aunque haya fallado), no la vuelve a pedir — un reintento a ciegas puede duplicar
 * adjuntos (cada uno es un IF oficial) o presentar dos veces. Nunca tira. Las pruebas no.
 */
export async function siListoPresentar(db: SupabaseClient, tramiteId: string): Promise<boolean> {
  try {
    const { t, docs } = await leer(db, tramiteId);
    if (!t || t.es_prueba || !evaluar(t, docs).listo) return false;
    const { count } = await db.from("pvp_tareas").select("id", { count: "exact", head: true }).eq("tipo", "tad_presentar").eq("tramite_id", tramiteId);
    if (count) return false;
    if (!(await leerSupervision(db)).presentacionAutomatica) {
      // Modo supervisado: se presenta con el botón de la ficha; se le avisa a quien gestiona.
      await avisarPasoPendiente(db, tramiteId, "presentacion");
      return false;
    }
    return (await pedirPresentacion(db, tramiteId)).resultado === "pedida";
  } catch (e) {
    console.error("[presentacion] no se pudo pedir la presentación", tramiteId, e instanceof Error ? e.message : e);
    return false;
  }
}

/** Para el cron: todos los trámites reales sin expediente que puedan haber quedado listos. */
export async function barridoPresentaciones(db: SupabaseClient): Promise<number> {
  const { data } = await db.from("pvp_tramites").select("id").is("expediente_id", null).eq("es_prueba", false).not("estado", "in", "(presentado,cancelado,cerrado)");
  let pedidas = 0;
  for (const { id } of data ?? []) if (await siListoPresentar(db, id)) pedidas++;
  return pedidas;
}
