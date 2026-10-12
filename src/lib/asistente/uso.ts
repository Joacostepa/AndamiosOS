// La pestaña Uso de Parámetros: cuánto se usa el asistente y cuánto cuesta, por persona y por
// mes. Pura (sin base ni red), con tests en uso.test.ts: la ruta lee las filas y esto las cuenta.
//
// DE DÓNDE SALE CADA NÚMERO:
//   · pedidos al modelo: filas de asistente_mensajes con `uso` (una por llamada a la API);
//   · conversaciones: las que tuvieron al menos un pedido ese mes;
//   · presupuestos guardados: acciones guardar/re-emitir que terminaron ok;
//   · US$: costoUsd(uso, modelo DE LA CONVERSACIÓN) — con un respaldo, `costoUsd` ya suma cada
//     intento a su precio (por eso no se usa modelo_servido);
//   · espera por turno: de la primera a la última fila del turno (el mensaje del vendedor se
//     guarda al empezar y cada respuesta al llegar). Sólo turnos con algún pedido;
//   · «estuvo mal»: filas de asistente_feedback.
// El mes y el «hoy» son de Buenos Aires, como el tope diario (gastoDelDia).

import { costoUsd } from "./costo.ts";

export type FilaUso = { conversacion_id: string; turno_id: string | null; created_at: string; uso: Record<string, unknown> | null };
export type ConversacionUso = { id: string; usuario_id: string; modelo: string };
export type AccionUso = { usuario_id: string; tipo: string; estado: string; confirmada_at: string | null; created_at: string };
export type FeedbackUso = { usuario_id: string; motivo: string; created_at: string };

export type UsoMes = {
  usuarioId: string;
  mes: string; // AAAA-MM
  pedidos: number;
  conversaciones: number;
  presupuestos: number;
  usd: number;
  usdPorPresupuesto: number | null;
  turnos: number;
  esperaMedianaS: number | null;
  pctTurnosLargos: number | null;
  estuvoMal: number | null;
};

export type UsoHoy = { usuarioId: string; usd: number };

/** Lo que devuelve GET /api/comercial/parametros/uso. */
export type RespuestaUso = {
  meses: (UsoMes & { nombre: string })[];
  hoy: (UsoHoy & { nombre: string })[];
  tope: number | null;
  /** null: la tabla de feedback todavía no existe. */
  ultimosEstuvoMal: { id: number; nombre: string; motivo: string; texto: string | null; conversacionId: string; titulo: string | null; fecha: string }[] | null;
  /** AAAA-MM del primer mes incluido. */
  desde: string;
};

/** Turnos de más de esto cuentan como «largos» (la auditoría midió 16 en dos semanas). */
export const TURNO_LARGO_S = 60;
const GUARDADOS = new Set(["guardar_presupuesto", "reemitir_presupuesto"]);

const fechaBA = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
export const mesBA = (iso: string) => fechaBA(iso).slice(0, 7);

export function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

export function resumirUso(p: {
  mensajes: FilaUso[];
  conversaciones: ConversacionUso[];
  acciones: AccionUso[];
  /** null: la tabla todavía no existe (migración sin aplicar). */
  feedback: FeedbackUso[] | null;
  ahora: Date;
}): { meses: UsoMes[]; hoy: UsoHoy[] } {
  const conv = new Map(p.conversaciones.map((c) => [c.id, c]));
  const hoy = fechaBA(p.ahora.toISOString());
  const filas = new Map<string, UsoMes & { convs: Set<string>; esperas: number[] }>();
  const fila = (usuarioId: string, mes: string) => {
    const k = `${usuarioId}|${mes}`;
    let f = filas.get(k);
    if (!f) {
      f = {
        usuarioId, mes, pedidos: 0, conversaciones: 0, presupuestos: 0, usd: 0, usdPorPresupuesto: null, turnos: 0,
        esperaMedianaS: null, pctTurnosLargos: null, estuvoMal: p.feedback ? 0 : null, convs: new Set(), esperas: [],
      };
      filas.set(k, f);
    }
    return f;
  };

  const gastoHoy = new Map<string, number>();
  const turnos = new Map<string, { usuarioId: string; desde: number; hasta: number; pedidos: number }>();
  for (const m of p.mensajes) {
    const c = conv.get(m.conversacion_id);
    if (!c) continue;
    const t = new Date(m.created_at).getTime();
    if (m.turno_id) {
      const tu = turnos.get(m.turno_id) ?? { usuarioId: c.usuario_id, desde: t, hasta: t, pedidos: 0 };
      tu.desde = Math.min(tu.desde, t);
      tu.hasta = Math.max(tu.hasta, t);
      if (m.uso) tu.pedidos++;
      turnos.set(m.turno_id, tu);
    }
    if (!m.uso) continue;
    const usd = costoUsd(m.uso, c.modelo);
    const f = fila(c.usuario_id, mesBA(m.created_at));
    f.pedidos++;
    f.usd += usd;
    f.convs.add(c.id);
    if (fechaBA(m.created_at) === hoy) gastoHoy.set(c.usuario_id, (gastoHoy.get(c.usuario_id) ?? 0) + usd);
  }
  for (const tu of turnos.values()) {
    if (!tu.pedidos) continue;
    fila(tu.usuarioId, mesBA(new Date(tu.desde).toISOString())).esperas.push((tu.hasta - tu.desde) / 1000);
  }
  for (const a of p.acciones) {
    if (a.estado !== "ok" || !GUARDADOS.has(a.tipo)) continue;
    fila(a.usuario_id, mesBA(a.confirmada_at ?? a.created_at)).presupuestos++;
  }
  for (const f of p.feedback ?? []) {
    const r = fila(f.usuario_id, mesBA(f.created_at));
    r.estuvoMal = (r.estuvoMal ?? 0) + 1;
  }

  const meses: UsoMes[] = [...filas.values()]
    .map(({ convs, esperas, ...f }) => ({
      ...f,
      conversaciones: convs.size,
      usd: Math.round(f.usd * 100) / 100,
      usdPorPresupuesto: f.presupuestos ? Math.round((f.usd / f.presupuestos) * 100) / 100 : null,
      turnos: esperas.length,
      esperaMedianaS: esperas.length ? Math.round(mediana(esperas)!) : null,
      pctTurnosLargos: esperas.length ? Math.round((esperas.filter((s) => s > TURNO_LARGO_S).length / esperas.length) * 100) : null,
    }))
    .sort((a, b) => b.mes.localeCompare(a.mes) || b.usd - a.usd);
  const hoyUso = [...gastoHoy].map(([usuarioId, usd]) => ({ usuarioId, usd: Math.round(usd * 100) / 100 })).sort((a, b) => b.usd - a.usd);
  return { meses, hoy: hoyUso };
}
