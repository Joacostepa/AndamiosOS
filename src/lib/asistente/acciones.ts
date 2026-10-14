// Acciones: todo lo que el asistente escribe afuera, siempre con confirmación.
//
// CICLO: propuesta → presentada (el turno terminó y el vendedor la vio/escuchó) → ejecutando →
// ok | error | incierto. Salidas: rechazada, vencida (cambió el borrador o pasaron 30 min),
// reemplazada (se propuso otra en la misma conversación).
//
// DOS FORMAS DE CONFIRMAR, UNA SOLA EJECUCIÓN:
//   · botón → la ruta /acciones/[id] llama a ejecutarAccion();
//   · "sí, dale" → el modelo llama a confirmar_accion y el SERVIDOR verifica (verificar()):
//     que la acción sea de esta conversación, que se haya presentado en el turno
//     inmediatamente anterior, que el borrador no haya cambiado, que no haya vencido y que el
//     mensaje del vendedor sea un sí claro (esConfirmacion).
// El paso a "ejecutando" es un UPDATE condicionado: botón y voz a la vez ejecutan una vez; el
// segundo recibe el resultado del primero.

import type { SupabaseClient } from "@supabase/supabase-js";
import { esConfirmacion, type Veredicto } from "./confirmacion";
import { eventoAccion, type Accion } from "./datos";
import type { AccionVista } from "./eventos";

const VIGENCIA_MIN = 30;

export function vistaAccion(a: Accion): AccionVista {
  return {
    id: a.id, numero: a.numero, tipo: a.tipo, estado: a.estado, nivel: a.nivel, resumen: a.resumen,
    resultado: a.resultado, error: a.error, venceAt: a.vence_at,
  };
}

export async function proponerAccion(
  db: SupabaseClient,
  p: {
    conversacionId: string;
    usuarioId: string;
    borradorId: string | null;
    borradorVersion: number | null;
    tipo: Accion["tipo"];
    nivel: Accion["nivel"];
    payload: Record<string, unknown>;
    resumen: string;
    resumenVoz: string;
    turnoId: string;
    toolUseId: string;
  },
): Promise<Accion> {
  // Una sola acción abierta por conversación: la anterior queda reemplazada.
  const { data: previas } = await db
    .from("asistente_acciones")
    .update({ estado: "reemplazada", updated_at: new Date().toISOString() })
    .eq("conversacion_id", p.conversacionId)
    .in("estado", ["propuesta", "presentada"])
    .select("id");
  for (const a of previas ?? []) await eventoAccion(db, a.id, "reemplazada");

  const { data, error } = await db
    .from("asistente_acciones")
    .insert({
      conversacion_id: p.conversacionId,
      usuario_id: p.usuarioId,
      borrador_id: p.borradorId,
      borrador_version: p.borradorVersion,
      tipo: p.tipo,
      nivel: p.nivel,
      estado: "propuesta",
      payload: p.payload,
      resumen: p.resumen,
      resumen_voz: p.resumenVoz,
      turno_id: p.turnoId,
      tool_use_id: p.toolUseId,
      vence_at: new Date(Date.now() + VIGENCIA_MIN * 60_000).toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(`No se pudo registrar la acción: ${error.message}`);
  await eventoAccion(db, data.id, "propuesta");
  return data as Accion;
}

/** Al terminar el turno: lo propuesto en él ya se le mostró al vendedor. */
export async function presentarAcciones(db: SupabaseClient, conversacionId: string, turnoId: string): Promise<Accion[]> {
  const { data } = await db
    .from("asistente_acciones")
    .update({ estado: "presentada", updated_at: new Date().toISOString() })
    .eq("conversacion_id", conversacionId)
    .eq("turno_id", turnoId)
    .eq("estado", "propuesta")
    .select("*");
  for (const a of data ?? []) await eventoAccion(db, a.id, "presentada");
  return (data ?? []) as Accion[];
}

/** Un turno cortado a la mitad: lo que se propuso en él no llegó a mostrarse entero. */
export async function vencerAccionesDelTurno(db: SupabaseClient, conversacionId: string, turnoId: string): Promise<void> {
  const { data } = await db
    .from("asistente_acciones")
    .update({ estado: "vencida", updated_at: new Date().toISOString() })
    .eq("conversacion_id", conversacionId)
    .eq("turno_id", turnoId)
    .eq("estado", "propuesta")
    .select("id");
  for (const a of data ?? []) await eventoAccion(db, a.id, "vencida", { motivo: "el turno se interrumpió" });
}

/** La confirmación por texto o voz. Lo decide el servidor, no el modelo. */
export function verificarConfirmacion(
  a: Accion,
  ctx: { conversacionId: string; borradorVersion: number | null; turnoAnteriorId: string | null; textoVendedor: string | null },
): Veredicto {
  if (a.conversacion_id !== ctx.conversacionId) return { ok: false, motivo: "Esa acción no es de esta conversación." };
  if (a.estado === "ok") return { ok: false, motivo: "Esa acción ya se ejecutó." };
  if (a.estado !== "presentada") {
    const por: Record<string, string> = {
      propuesta: "Todavía no se la mostraste al vendedor: primero leéle el resumen y esperá su respuesta.",
      vencida: "La acción venció (cambió el presupuesto o pasaron más de 30 minutos): proponela de nuevo.",
      reemplazada: "Esa acción fue reemplazada por otra más nueva.",
      rechazada: "El vendedor la rechazó.",
    };
    return { ok: false, motivo: por[a.estado] ?? `La acción está ${a.estado}.` };
  }
  if (a.turno_id !== ctx.turnoAnteriorId) {
    return { ok: false, motivo: "La confirmación tiene que llegar en la respuesta inmediata a la propuesta. Volvé a leerle el resumen y preguntale." };
  }
  if (a.borrador_version !== null && ctx.borradorVersion !== null && a.borrador_version !== ctx.borradorVersion) {
    return { ok: false, motivo: "El presupuesto cambió después de proponer: proponé la acción de nuevo con los datos actuales." };
  }
  if (new Date(a.vence_at).getTime() < Date.now()) return { ok: false, motivo: "La acción venció (30 minutos): proponela de nuevo." };
  return esConfirmacion(ctx.textoVendedor ?? "", a.nivel);
}

export type ResultadoEjecucion = { ok: boolean; accion: Accion; yaEjecutada?: boolean };

/**
 * Toma la acción para ejecutarla (UPDATE condicionado) y corre el ejecutor. Si otro ya la
 * tomó, devuelve el estado actual sin ejecutar de nuevo.
 */
export async function ejecutarAccion(
  db: SupabaseClient,
  accionId: string,
  via: "boton" | "texto" | "voz" | "whatsapp",
  quien: { usuarioId: string; texto: string | null },
  ejecutor: (a: Accion) => Promise<{ resultado: Record<string, unknown>; pasos?: Record<string, unknown> }>,
): Promise<ResultadoEjecucion> {
  const { data: tomada } = await db
    .from("asistente_acciones")
    .update({
      estado: "ejecutando",
      confirmada_via: via,
      confirmacion_texto: quien.texto,
      confirmada_por: quien.usuarioId,
      confirmada_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", accionId)
    .in("estado", ["propuesta", "presentada"])
    .gt("vence_at", new Date().toISOString())
    .select("*")
    .maybeSingle();

  if (!tomada) {
    const { data: actual } = await db.from("asistente_acciones").select("*").eq("id", accionId).single();
    return { ok: actual?.estado === "ok", accion: actual as Accion, yaEjecutada: true };
  }
  await eventoAccion(db, accionId, "ejecutando", { via, texto: quien.texto });

  try {
    const r = await ejecutor(tomada as Accion);
    const { data } = await db
      .from("asistente_acciones")
      .update({ estado: "ok", resultado: r.resultado, pasos: r.pasos ?? {}, updated_at: new Date().toISOString() })
      .eq("id", accionId)
      .select("*")
      .single();
    await eventoAccion(db, accionId, "ok", r.resultado);
    return { ok: true, accion: data as Accion };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    // Un timeout en medio de escrituras deja la duda de qué se hizo: "incierto", no "error".
    const incierto = /no respondió en/.test(mensaje);
    const pasos = (e as { pasos?: Record<string, unknown> }).pasos ?? {};
    const { data } = await db
      .from("asistente_acciones")
      .update({ estado: incierto ? "incierto" : "error", error: mensaje, pasos, updated_at: new Date().toISOString() })
      .eq("id", accionId)
      .select("*")
      .single();
    await eventoAccion(db, accionId, incierto ? "incierto" : "error", { error: mensaje, pasos });
    return { ok: false, accion: data as Accion };
  }
}

export async function rechazarAccion(db: SupabaseClient, accionId: string, conversacionId: string): Promise<Accion | null> {
  const { data } = await db
    .from("asistente_acciones")
    .update({ estado: "rechazada", updated_at: new Date().toISOString() })
    .eq("id", accionId)
    .eq("conversacion_id", conversacionId)
    .in("estado", ["propuesta", "presentada"])
    .select("*")
    .maybeSingle();
  if (data) await eventoAccion(db, accionId, "rechazada");
  return (data as Accion) ?? null;
}
