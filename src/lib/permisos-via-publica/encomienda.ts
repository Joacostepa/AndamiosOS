import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarEvento } from "./endosos";
import { normalizar, parcelaPorDireccion } from "./catastro";
import { FaltanDatos } from "./generacion";
import type { TipoAndamio } from "./informe-tecnico";
import { formatoCuit } from "./tipos";

// La encomienda profesional del CPAU (RETP) de un trámite: arma los datos y le deja la tarea
// al robot de la Mac (robot/cpau-encomienda.mjs). La app nunca habla con el CPAU.
//
// SUPERVISADO (JS, 2026-09-15): el robot completa todo y frena en Confirmar; una persona
// revisa el resumen en la ficha y aprueba, y recién ahí el robot toca Finalizar. Firma, pago
// (tarjeta) y carga en tramites.cpau.org quedan a mano hasta ver esas pantallas con la
// primera encomienda real. Un trámite de prueba llega a Confirmar y nunca se finaliza.
//
// DE DÓNDE SALE CADA DATO:
//   propietario → el titular del lote que cargó el cliente en el portal
//   medidas     → las del informe técnico generado (las mismas de la venta de Odoo)
//   frente      → las puertas del lote en el catastro (EPOK) sobre la calle de la obra
//   superficie  → pantalla: ml × 4; estructura y torre: base × altura (igual que x_permiso_m2),
//                 redondeada para arriba. El importe es siempre el mismo (JS, 15/09).

export type PayloadEncomienda = {
  es_prueba: boolean;
  finalizar: boolean;
  direccion: string;
  tipo: TipoAndamio;
  base: number;
  alto: number;
  propietario: { nombre: string; cuit: string };
  frente: { calle: string; desde: number; hasta: number };
  superficie: string;
  descripcion: string;
  aprobada_por?: string | null;
  aprobada_at?: string;
};

// Sin catastro (la dirección de la prueba es inventada) la prueba usa el frente de Trelles,
// una encomienda real: así el circuito se puede ver hasta Confirmar.
const FRENTE_PRUEBA = { calle: "TRELLES, MANUEL R.", desde: 1084, hasta: 1088 };

const num = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

export function superficieEncomienda(tipo: TipoAndamio, base: number, alto: number): number {
  return Math.ceil((tipo === "pantalla" ? base * 4 : base * alto) - 1e-9);
}

export function descripcionEncomienda(tipo: TipoAndamio, base: number, alto: number): string {
  if (tipo === "pantalla") return `Pantalla de protección peatonal de ${num(base)} mts lineales.`;
  if (tipo === "estructura_pantalla") return `Estructura de ${num(base)} x ${num(alto)} mts con pantalla de protección peatonal.`;
  if (tipo === "torre") return `Torre de ${num(base)} x ${num(alto)} mts.`;
  return `Estructura de ${num(base)} x ${num(alto)} mts.`;
}

async function frenteDelLote(direccion: string): Promise<PayloadEncomienda["frente"] | null> {
  const n = await normalizar(direccion).catch(() => null);
  if (!n) return null;
  const parcela = await parcelaPorDireccion(n.codCalle, n.altura).catch(() => null);
  const puertas = (parcela?.puertas ?? []).filter((p) => p.codigo_calle === n.codCalle);
  if (!puertas.length) return null;
  const alturas = puertas.map((p) => p.altura);
  return { calle: puertas[0].calle, desde: Math.min(...alturas), hasta: Math.max(...alturas) };
}

export async function armarPayload(db: SupabaseClient, tramiteId: string): Promise<PayloadEncomienda> {
  const [{ data: t }, { data: informe }] = await Promise.all([
    db.from("pvp_tramites").select("direccion, titular_nombre, titular_cuit, es_prueba").eq("id", tramiteId).maybeSingle(),
    db.from("pvp_documentos").select("revision").eq("tramite_id", tramiteId).eq("clave", "informe_tecnico").maybeSingle(),
  ]);
  if (!t) throw new FaltanDatos("El trámite no existe.");
  if (!t.titular_nombre || !t.titular_cuit) throw new FaltanDatos("Falta el dueño del lote (nombre y CUIT): lo carga el cliente en el portal.");

  const leido = (informe?.revision as { leido?: { tipo?: TipoAndamio; base?: number; alto?: number; direccion?: string } } | null)?.leido;
  if (!leido?.tipo || !leido.base || !leido.alto) throw new FaltanDatos("Primero hay que generar el informe técnico: de ahí salen las medidas.");
  const direccion = leido.direccion || t.direccion;

  const frente = (await frenteDelLote(direccion)) ?? (t.es_prueba ? FRENTE_PRUEBA : null);
  if (!frente) throw new FaltanDatos(`No se encontraron las puertas del lote de ${direccion} en el catastro de la Ciudad: sin eso no se puede cargar el frente.`);

  return {
    es_prueba: !!t.es_prueba,
    finalizar: false,
    direccion,
    tipo: leido.tipo,
    base: leido.base,
    alto: leido.alto,
    propietario: { nombre: t.titular_nombre.trim().slice(0, 100), cuit: t.titular_cuit },
    frente,
    superficie: String(superficieEncomienda(leido.tipo, leido.base, leido.alto)),
    descripcion: descripcionEncomienda(leido.tipo, leido.base, leido.alto),
  };
}

/** Deja la encomienda en la cola del robot. Una abierta por trámite: la segunda es "ya_pedida". */
export async function pedirEncomienda(
  db: SupabaseClient,
  tramiteId: string,
  opts: { userId?: string | null } = {},
): Promise<{ resultado: "pedida" | "ya_pedida"; payload: PayloadEncomienda }> {
  const payload = await armarPayload(db, tramiteId);
  const { error } = await db.from("pvp_tareas").insert({ tipo: "cpau_encomienda", tramite_id: tramiteId, payload, pedida_por: opts.userId ?? null });
  if (error?.code === "23505") return { resultado: "ya_pedida", payload };
  if (error) throw new Error(error.message);

  const ahora = new Date().toISOString();
  await db.from("pvp_documentos").upsert(
    { tramite_id: tramiteId, clave: "encomienda_cpau", origen: "aba", estado: "pedido", pedido_at: ahora, observacion: "El robot la está completando en el CPAU (la Mac tiene que estar prendida).", updated_at: ahora },
    { onConflict: "tramite_id,clave" },
  );
  await registrarEvento(
    db, tramiteId, "encomienda_cpau",
    `Se pidió la encomienda del CPAU: ${payload.superficie} m² · ${payload.frente.calle} ${payload.frente.desde}–${payload.frente.hasta} · ${payload.propietario.nombre} (CUIT ${formatoCuit(payload.propietario.cuit)}).`,
    { payload }, opts.userId ? "persona" : "sistema",
  );
  return { resultado: "pedida", payload };
}

/** "Finalizar en el CPAU": la persona revisó el resumen. Vuelve la tarea a la cola con finalizar. */
export async function aprobarEncomienda(db: SupabaseClient, tramiteId: string, userId: string | null): Promise<void> {
  const { data: tarea } = await db.from("pvp_tareas").select("id, payload")
    .eq("tipo", "cpau_encomienda").eq("tramite_id", tramiteId).eq("estado", "esperando_aprobacion").maybeSingle();
  if (!tarea) throw new FaltanDatos("No hay una encomienda lista para finalizar.");
  const payload = tarea.payload as PayloadEncomienda;
  if (payload.es_prueba) throw new FaltanDatos("Es un trámite de prueba: la encomienda nunca se finaliza.");

  const ahora = new Date().toISOString();
  const { data, error } = await db.from("pvp_tareas")
    .update({ estado: "pendiente", tomada_at: null, payload: { ...payload, finalizar: true, aprobada_por: userId, aprobada_at: ahora } })
    .eq("id", tarea.id).eq("estado", "esperando_aprobacion").select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new FaltanDatos("La encomienda cambió mientras tanto: recargá la ficha.");

  await db.from("pvp_documentos").update({ observacion: "Aprobada: el robot la está finalizando en el CPAU.", updated_at: ahora })
    .eq("tramite_id", tramiteId).eq("clave", "encomienda_cpau");
  await registrarEvento(db, tramiteId, "encomienda_cpau", "Se aprobó el resumen: el robot va a tocar Finalizar en el CPAU.", { tarea_id: tarea.id, por: userId }, "persona");
}

/** Descarta la encomienda que espera aprobación (o que todavía no tomó el robot) para pedirla de nuevo. */
export async function descartarEncomienda(db: SupabaseClient, tramiteId: string, userId: string | null): Promise<void> {
  const ahora = new Date().toISOString();
  const { data, error } = await db.from("pvp_tareas")
    .update({ estado: "error", error: "Descartada por una persona desde la ficha.", terminada_at: ahora })
    .eq("tipo", "cpau_encomienda").eq("tramite_id", tramiteId).in("estado", ["esperando_aprobacion", "pendiente"]).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new FaltanDatos("No hay una encomienda para descartar (si el robot la está completando, esperá a que termine).");

  await db.from("pvp_documentos").update({ estado: "falta", observacion: null, updated_at: ahora })
    .eq("tramite_id", tramiteId).eq("clave", "encomienda_cpau");
  await registrarEvento(db, tramiteId, "encomienda_cpau", "Se descartó la encomienda sin finalizar.", { por: userId }, "persona");
}
