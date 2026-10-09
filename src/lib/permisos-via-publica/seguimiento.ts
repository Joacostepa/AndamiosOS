import type { SupabaseClient } from "@supabase/supabase-js";

// Seguimiento: cada trámite como una línea de 7 etapas, para saber de un vistazo en qué está,
// quién lo tiene que mover y cuándo debería salir. Todo sale de lo que ya escriben la app y el
// robot (pvp_tramites, pvp_documentos, pvp_tareas, pvp_expedientes, pvp_eventos): no hay
// estado propio que mantener.
//
// LA FECHA ESTIMADA es la mediana de los trámites que ya pasaron cada tramo: de abierto a
// presentado y de presentado a permiso emitido. Con pocos permisos emitidos es aproximada.

export const ETAPAS = [
  { clave: "abierto", nombre: "Abierto" },
  { clave: "legajo", nombre: "Legajo del cliente" },
  { clave: "poliza", nombre: "Póliza" },
  { clave: "encomienda", nombre: "Encomienda CPAU" },
  { clave: "tad", nombre: "Presentado en TAD" },
  { clave: "gcba", nombre: "GCBA" },
  { clave: "permiso", nombre: "Permiso" },
] as const;

export type ClaveEtapa = (typeof ETAPAS)[number]["clave"];
export type EstadoEtapa = "hecho" | "curso" | "trabado" | "pendiente";
/** Quién tiene que mover la etapa. "ABA" = alguien de la oficina. */
export type Quien = "Cliente" | "Segucom" | "CPAU" | "Robot" | "GCBA" | "ABA";

export type Etapa = {
  clave: ClaveEtapa;
  estado: EstadoEtapa;
  /** Cuándo se completó (hecho). */
  fecha?: string | null;
  /** Desde cuándo está en curso o trabada. */
  desde?: string | null;
  quien?: Quien;
  detalle?: string;
  motivo?: string | null;
};

export type FilaSeguimiento = {
  id: string;
  venta: string | null;
  direccion: string;
  cliente: string | null;
  administrador: string | null;
  vendedora: string | null;
  inquilino: boolean;
  abierto: string;
  expediente: string | null;
  expedienteId: string | null;
  etapas: Etapa[];
  eventos: { fecha: string; actor: string; detalle: string }[];
};

export type Seguimiento = {
  filas: FilaSeguimiento[];
  /** Medianas en días y de cuántos trámites salen. */
  tipico: { aPresentar: number | null; gcba: number | null; nPresentados: number; nEmitidos: number };
  generado: string;
};

const NOMBRE_DOC: Record<string, string> = {
  dni: "DNI", acta_compromiso: "Acta de compromiso", constancia_cuit: "Constancia de CUIT", titulo_propiedad: "Título de propiedad",
  nota_autorizacion: "Nota de autorización", nota_dueno: "Nota del dueño", nota_solicitud: "Nota de solicitud", aviso_obra: "Aviso de obra",
  acta_asamblea: "Acta de asamblea", reglamento: "Reglamento", dni_administrador: "DNI del administrador", estatuto: "Estatuto", poder: "Poder",
  contrato_alquiler: "Contrato de alquiler", acta_directorio: "Acta de directorio", dni_apoderado: "DNI del apoderado",
};
const nombreDoc = (clave: string) => NOMBRE_DOC[clave] ?? clave;

export type Doc = { tramite_id: string; clave: string; origen: string; estado: string; observacion: string | null; updated_at: string | null; revisado_at: string | null; pedido_at: string | null };
export type Tarea = { tramite_id: string; tipo: string; estado: string; error: string | null; created_at: string; terminada_at: string | null; resultado: Record<string, unknown> | null };
type Cierre = { etapa?: string; plataforma?: { enviada_at?: string }; pago?: { operacion?: string; aprobado_at?: string } };
export type Exp = { id: string; numero: string; odoo_venta_id: number | null; tarea_pendiente: boolean; estado_tad: string | null; creado_tad: string | null; estado_desde: string | null; motivo_subsanacion: string | null; permiso_emitido_el: string | null; permiso_vence: string | null };

const ultima = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).sort().at(-1) ?? null;
const primeraLinea = (s: string | null | undefined) => (s ?? "").split("\n")[0].slice(0, 200);
/** Las fechas de TAD vienen sin hora: se toman a las 12 de Buenos Aires. */
const diaTad = (d: string) => `${d}T15:00:00Z`;

/**
 * Las 7 etapas de un trámite. La usan Seguimiento y la bandeja (para "en qué está y quién lo
 * tiene"). Un paso que espera un botón del modo supervisado queda "pendiente" con quien = ABA:
 * no está trabado, pero no avanza hasta que alguien de la oficina lo toque.
 */
export function etapasDe(t: Record<string, unknown> & { id: string; created_at: string }, docs: Doc[], tareas: Tarea[], e: Exp | undefined): Etapa[] {
  const etapas: Etapa[] = [{ clave: "abierto", estado: "hecho", fecha: t.created_at, detalle: t.link_enviado_at ? "Link del portal enviado" : "Link del portal sin enviar" }];

  // Legajo del cliente
  const cli = docs.filter((d) => d.origen === "cliente");
  const ok = cli.filter((d) => d.estado === "ok");
  const obs = cli.filter((d) => d.estado === "observado");
  const faltan = cli.filter((d) => d.estado !== "ok" && d.estado !== "observado");
  if (!t.titular_cargado_at) {
    etapas.push({ clave: "legajo", estado: "curso", desde: t.created_at, quien: "Cliente", detalle: "Falta que el cliente cargue el dueño del lote" });
  } else if (cli.length && !obs.length && !faltan.length) {
    etapas.push({ clave: "legajo", estado: "hecho", fecha: ultima(cli.map((d) => d.revisado_at ?? d.updated_at)), detalle: `${ok.length} documentos ok` });
  } else if (obs.length) {
    etapas.push({ clave: "legajo", estado: "trabado", desde: ultima(obs.map((d) => d.updated_at)), quien: "Cliente", detalle: `Observado: ${obs.map((d) => nombreDoc(d.clave)).join(", ")}`, motivo: obs[0].observacion });
  } else {
    const lista = faltan.map((d) => nombreDoc(d.clave));
    etapas.push({ clave: "legajo", estado: "curso", desde: t.titular_cargado_at as string, quien: "Cliente", detalle: `${ok.length} de ${cli.length} ok · faltan ${lista.slice(0, 3).join(", ")}${lista.length > 3 ? "…" : ""}` });
  }

  const legajoHecho = etapas[1].estado === "hecho";

  // Póliza
  const pol = docs.find((d) => d.clave === "poliza_rc");
  // Modo supervisado: con el dueño cargado, el pedido a Segucom sale con el botón de la ficha.
  if (!pol && t.titular_cargado_at) etapas.push({ clave: "poliza", estado: "pendiente", desde: t.titular_cargado_at as string, quien: "ABA", detalle: "Falta tocar «Pedir endoso a Segucom»" });
  else if (!pol) etapas.push({ clave: "poliza", estado: "pendiente" });
  else if (pol.estado === "ok") etapas.push({ clave: "poliza", estado: "hecho", fecha: pol.revisado_at ?? pol.updated_at, detalle: "Endoso revisado ok" });
  else if (pol.estado === "observado") etapas.push({ clave: "poliza", estado: "trabado", desde: pol.updated_at, quien: "Segucom", detalle: "Póliza observada", motivo: pol.observacion });
  else etapas.push({ clave: "poliza", estado: "curso", desde: pol.pedido_at ?? pol.updated_at, quien: "Segucom", detalle: "Endoso pedido a Segucom" });

  // Encomienda del CPAU
  const enc = docs.find((d) => d.clave === "encomienda_cpau");
  const te = tareas.filter((x) => x.tipo === "cpau_encomienda").at(-1);
  const cierre = te?.resultado?.cierre as Cierre | undefined;
  const datosEnc = [te?.resultado?.registro && `R.Nro ${te.resultado.registro}`, cierre?.pago?.aprobado_at && `pago ${cierre.pago.operacion}`].filter(Boolean).join(" · ");
  if (enc?.estado === "ok") {
    etapas.push({ clave: "encomienda", estado: "hecho", fecha: enc.revisado_at ?? enc.updated_at, detalle: `Certificado recibido${datosEnc ? ` · ${datosEnc}` : ""}` });
  } else if (te?.estado === "error") {
    etapas.push({ clave: "encomienda", estado: "trabado", desde: te.terminada_at ?? te.created_at, quien: "ABA", detalle: "El robot se frenó", motivo: primeraLinea(te.error) });
  } else if (cierre?.etapa === "cargada") {
    etapas.push({ clave: "encomienda", estado: "curso", desde: cierre.plataforma?.enviada_at ?? te?.created_at, quien: "CPAU", detalle: `Cargada, espera el visado y el certificado por mail${datosEnc ? ` · ${datosEnc}` : ""}` });
  } else if (te && ["pendiente", "tomada"].includes(te.estado)) {
    etapas.push({ clave: "encomienda", estado: "curso", desde: te.created_at, quien: "Robot", detalle: cierre?.etapa ? `Cierre en «${cierre.etapa}»` : "El robot la está armando" });
  } else if (te?.estado === "esperando_aprobacion") {
    etapas.push({ clave: "encomienda", estado: "pendiente", desde: te.terminada_at ?? te.created_at, quien: "ABA", detalle: "El robot frenó en Confirmar: falta «Finalizar en el CPAU»" });
  } else if (enc?.estado === "observado") {
    etapas.push({ clave: "encomienda", estado: "trabado", desde: enc.updated_at, quien: "ABA", detalle: "Observada", motivo: enc.observacion });
  } else if (enc && t.titular_cargado_at) {
    etapas.push({ clave: "encomienda", estado: "pendiente", desde: enc.updated_at, quien: "ABA", detalle: "Falta tocar «Armar la encomienda»" });
  } else if (legajoHecho && !te && !enc) {
    // Legajo completo: se generan solos el informe técnico y el croquis y, en modo supervisado,
    // la encomienda espera el botón. Sin informe, la generación falló y hay que hacerla a mano.
    const informe = docs.find((d) => d.clave === "informe_tecnico" && d.estado === "ok");
    etapas.push(informe
      ? { clave: "encomienda", estado: "pendiente", desde: informe.updated_at, quien: "ABA", detalle: "Falta tocar «Armar la encomienda»" }
      : { clave: "encomienda", estado: "pendiente", desde: etapas[1].fecha, quien: "ABA", detalle: "Faltan el informe técnico y el croquis: generalos desde la ficha" });
  } else {
    etapas.push({ clave: "encomienda", estado: "pendiente" });
  }

  // Presentación en TAD
  const tp = tareas.filter((x) => x.tipo === "tad_presentar").at(-1);
  if (e?.creado_tad) etapas.push({ clave: "tad", estado: "hecho", fecha: diaTad(e.creado_tad), detalle: `EX-${e.numero}` });
  else if (t.estado === "presentado") etapas.push({ clave: "tad", estado: "hecho", fecha: tp?.terminada_at ?? null, detalle: "Presentado, número de expediente en espera" });
  else if (tp?.estado === "error") etapas.push({ clave: "tad", estado: "trabado", desde: tp.terminada_at, quien: "ABA", detalle: "La presentación se frenó", motivo: primeraLinea(tp.error) });
  else if (tp && ["pendiente", "tomada"].includes(tp.estado)) etapas.push({ clave: "tad", estado: "curso", desde: tp.created_at, quien: "Robot", detalle: "Programada (se presenta de 19 a 7)" });
  else if (etapas.slice(1, 4).every((x) => x.estado === "hecho") && !tp) {
    // Modo supervisado: con todo listo, se presenta con el botón de la ficha.
    etapas.push({ clave: "tad", estado: "pendiente", desde: ultima(etapas.slice(1, 4).map((x) => x.fecha)), quien: "ABA", detalle: "Listo para presentar: falta tocar «Presentar ahora»" });
  } else etapas.push({ clave: "tad", estado: "pendiente" });

  // GCBA y permiso
  if (!e) {
    etapas.push({ clave: "gcba", estado: "pendiente" }, { clave: "permiso", estado: "pendiente" });
  } else if (e.permiso_emitido_el) {
    const vence = e.permiso_vence ? `Vence el ${e.permiso_vence.split("-").reverse().join("/")}` : "Emitido";
    etapas.push({ clave: "gcba", estado: "hecho", fecha: diaTad(e.permiso_emitido_el), detalle: "Aprobado" }, { clave: "permiso", estado: "hecho", fecha: diaTad(e.permiso_emitido_el), detalle: vence });
  } else if (e.tarea_pendiente) {
    // SUBSANACIÓN ≠ hay que corregir: manda la tarea pendiente de TAD.
    etapas.push(
      { clave: "gcba", estado: "trabado", desde: e.estado_desde, quien: "ABA", detalle: "Subsanación: hay que corregir y volver a presentar", motivo: e.motivo_subsanacion },
      { clave: "permiso", estado: "pendiente" },
    );
  } else {
    const detalle = e.estado_tad === "SUBSANACION" ? "Subsanado, espera que el GCBA revise la corrección" : e.estado_tad === "TRAMITACION" ? "En tramitación" : "En iniciación";
    etapas.push(
      { clave: "gcba", estado: "curso", desde: e.estado_tad === "SUBSANACION" ? e.estado_desde : e.creado_tad ? diaTad(e.creado_tad) : e.estado_desde, quien: "GCBA", detalle },
      { clave: "permiso", estado: "pendiente" },
    );
  }

  // Presentado por fuera de la app (a mano en TAD): lo que quedó sin terminar acá ya no traba nada.
  if (e?.creado_tad) {
    for (const x of etapas.slice(1, 4)) {
      if (x.estado !== "hecho") Object.assign(x, { estado: "hecho", fecha: null, desde: null, quien: undefined, motivo: null, detalle: "Se presentó a mano, sin terminar esta etapa en la app" });
    }
  }
  return etapas;
}

/** Días en una etapa a partir de los cuales se pinta ámbar y rojo. */
export const LIMITE: Partial<Record<ClaveEtapa, [number, number]>> = { legajo: [2, 5], poliza: [2, 4], encomienda: [1, 3], tad: [1, 2], gcba: [14, 21] };

export const NOMBRE_ETAPA = Object.fromEntries(ETAPAS.map((e) => [e.clave, e.nombre])) as Record<ClaveEtapa, string>;

/**
 * En qué está un trámite: la etapa trabada si hay una; si no, el botón que espera a ABA; si no,
 * lo que está en curso; si no, lo próximo. Y quiénes lo tienen que mover (póliza y encomienda
 * corren en paralelo: pueden ser dos).
 */
export function resumirEtapas(etapas: Etapa[]) {
  const trabada = etapas.find((e) => e.estado === "trabado");
  const enCurso = etapas.filter((e) => e.estado === "curso");
  const porTocar = etapas.find((e) => e.estado === "pendiente" && e.quien === "ABA");
  const actual = trabada ?? porTocar ?? enCurso[0] ?? etapas.find((e) => e.estado === "pendiente");
  const fuente = trabada ? [trabada] : porTocar ? [porTocar, ...enCurso] : enCurso;
  const quienes = [...new Set(fuente.map((e) => e.quien).filter((q): q is Quien => !!q))];
  return { trabada, enCurso, porTocar, actual, quienes };
}

/** "" a tiempo, "tarde" pasado el primer umbral, "muy" pasado el segundo. */
export function demoraEtapa(e: Pick<Etapa, "clave" | "desde"> | undefined, ahora: number): "" | "tarde" | "muy" {
  const lim = e && LIMITE[e.clave];
  if (!e?.desde || !lim) return "";
  const d = (ahora - Date.parse(e.desde)) / 86_400_000;
  return d > lim[1] ? "muy" : d > lim[0] ? "tarde" : "";
}

function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export async function armarSeguimiento(db: SupabaseClient): Promise<Seguimiento> {
  const { data: tramites, error } = await db.from("pvp_tramites")
    .select("id, odoo_venta_id, odoo_venta_nombre, direccion, cliente_nombre, titular_nombre, administrador_nombre, vendedor_nombre, es_inquilino, estado, created_at, titular_cargado_at, link_enviado_at, expediente_id")
    .eq("es_prueba", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const ids = (tramites ?? []).map((t) => t.id);
  const expIds = (tramites ?? []).map((t) => t.expediente_id).filter(Boolean);
  const ventaIds = (tramites ?? []).map((t) => t.odoo_venta_id).filter(Boolean);
  const [docs, tareas, exps, eventos] = await Promise.all([
    db.from("pvp_documentos").select("tramite_id, clave, origen, estado, observacion, updated_at, revisado_at, pedido_at").in("tramite_id", ids),
    db.from("pvp_tareas").select("tramite_id, tipo, estado, error, created_at, terminada_at, resultado").in("tramite_id", ids).in("tipo", ["cpau_encomienda", "tad_presentar"]).order("created_at"),
    // También los de la misma venta sin vincular al trámite: los que se presentaron a mano en TAD.
    db.from("pvp_expedientes").select("id, numero, odoo_venta_id, tarea_pendiente, estado_tad, creado_tad, estado_desde, motivo_subsanacion, permiso_emitido_el, permiso_vence")
      .eq("historico", false).or(`id.in.(${expIds.join(",") || "00000000-0000-0000-0000-000000000000"}),odoo_venta_id.in.(${ventaIds.join(",") || 0})`),
    db.from("pvp_eventos").select("tramite_id, tipo, detalle, actor, created_at").in("tramite_id", ids).order("created_at", { ascending: false }).limit(2000),
  ]);
  for (const r of [docs, tareas, exps, eventos]) if (r.error) throw r.error;

  const filas: FilaSeguimiento[] = (tramites ?? []).map((t) => {
    const e = (exps.data as Exp[]).find((x) => x.id === t.expediente_id)
      ?? (exps.data as Exp[]).filter((x) => t.odoo_venta_id && x.odoo_venta_id === t.odoo_venta_id).sort((a, b) => String(b.creado_tad).localeCompare(String(a.creado_tad)))[0];
    return {
      id: t.id,
      venta: t.odoo_venta_nombre,
      direccion: String(t.direccion ?? "").replace(/,\s*CABA$/i, ""),
      cliente: t.titular_nombre ?? t.cliente_nombre,
      administrador: t.administrador_nombre,
      vendedora: t.vendedor_nombre,
      inquilino: !!t.es_inquilino,
      abierto: t.created_at,
      expediente: e ? `EX-${e.numero}` : null,
      expedienteId: e?.id ?? null,
      etapas: etapasDe(t, (docs.data as Doc[]).filter((d) => d.tramite_id === t.id), (tareas.data as Tarea[]).filter((x) => x.tramite_id === t.id), e),
      eventos: (eventos.data ?? []).filter((x) => x.tramite_id === t.id).slice(0, 8).map((x) => ({ fecha: x.created_at, actor: x.actor, detalle: String(x.detalle).replace(/\s+/g, " ").slice(0, 240) })),
    };
  });

  const DIA = 86_400_000;
  const aPresentar: number[] = [];
  const gcba: number[] = [];
  for (const f of filas) {
    const fecha = (k: ClaveEtapa) => f.etapas.find((x) => x.clave === k && x.estado === "hecho")?.fecha;
    const pres = fecha("tad");
    const permiso = fecha("permiso");
    if (pres) aPresentar.push(Math.max(0, (Date.parse(pres) - Date.parse(f.abierto)) / DIA));
    if (pres && permiso) gcba.push(Math.max(0, (Date.parse(permiso) - Date.parse(pres)) / DIA));
  }
  return {
    filas,
    tipico: { aPresentar: mediana(aPresentar), gcba: mediana(gcba), nPresentados: aPresentar.length, nEmitidos: gcba.length },
    generado: new Date().toISOString(),
  };
}
