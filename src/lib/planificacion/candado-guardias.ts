// El candado de las guardias en las rutas que YA escribían asignaciones y tareas. SÓLO
// SERVIDOR.
//
// La regla (guardias-plan-tecnico.md §5): NINGUNA RUTA COMÚN PONE NADA EN LA CELDA DE UNA
// GUARDIA ACTIVA (de hoy en adelante). Si lo intenta, contesta 409 RechazoCandado con el
// mensaje en castellano y lo que habría que pedirle a JS. La única que reemplaza una guardia
// es /api/planificacion/guardias/usar, que lo hace en un lote que se deshace entero. El
// tablero, que evalúa el candado antes de soltar, nunca debería ver este 409: es la defensa
// contra un tablero viejo, otra pestaña o una llamada a mano.
//
// FALLA CERRADO, al revés que frenoDeRoles en asignaciones. Si no se puede leer Supabase (o
// Odoo, cuando hace falta saber en qué cuadrilla está una jornada), contesta 503 "No pude
// comprobar las guardias": el candado no puede abrirse por un error. La validación de roles
// protege contra un tablero desactualizado y por eso deja pasar; ésta protege una regla de
// JS, y dejar pasar sería exactamente lo que el contrato pide que no pase (§3).
//
// CUESTA UNA CONSULTA A SUPABASE (las guardias activas de esas fechas), y sólo si hay una
// guardia en alguna de esas fechas se lee Odoo para saber la celda exacta. Mover una tarjeta
// es el gesto que más se repite del módulo: casi siempre no hay guardia ese día y esto no le
// suma un viaje a Odoo.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { feriadosDelRango } from "@/lib/feriados/argentina";
import { avanceDeOts, celdasDeAsignaciones, leerOts } from "@/lib/odoo/asignaciones";
import { jornadasPlanTodas } from "@/lib/planificacion/jornadas-plan";
import { leerMarcados } from "@/lib/planificacion/comodines";
import { comodinDe, comodinPuedeIr } from "@/lib/tablero/comodines";
import { hoyBA, sumarDias } from "@/lib/tablero/dias-habiles";
import { claveCelda, duracionParaCandado, evaluarCandado, MENSAJE_OBRA_COMUN, otParaCandado } from "@/lib/tablero/guardias";
import type { GuardiaResumen, RanuraGuardia, RechazoCandado } from "@/lib/tablero/guardias-tipos";
import type { CambioAsignacion, MovimientoAsignacion } from "@/lib/tablero/tipos";

type Celda = { cuadrillaId: number | null; fecha: string };

/** Qué se sabe de lo que se quiere poner: la obra (si es una) o que es una tarea. */
export type ContextoCandado = { otId?: number; esApoyo?: boolean; tarea?: boolean };

const NO_PUDE = "No pude comprobar las guardias: probá de nuevo.";

function noPude(e: unknown): NextResponse {
  console.error("[candado-guardias] no se pudo comprobar", e);
  return NextResponse.json({ error: NO_PUDE }, { status: 503 });
}

/** Las guardias activas de esas fechas (cualquier cuadrilla), de hoy en adelante. */
async function activasDeFechas(fechas: string[]): Promise<GuardiaResumen[]> {
  const hoy = hoyBA();
  const utiles = [...new Set(fechas.filter((f) => f >= hoy))];
  if (utiles.length === 0) return [];
  const { data, error } = await createAdminClient()
    .from("tablero_tareas")
    .select("id, fecha, cuadrilla_odoo_id, guardia_semana, guardia_ranura, guardia_estado")
    .eq("tipo", "guardia")
    .eq("guardia_estado", "activa")
    .in("fecha", utiles);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: number; fecha: string; cuadrilla_odoo_id: number; guardia_semana: string; guardia_ranura: number }[]).map((f) => ({
    id: Number(f.id),
    fecha: f.fecha,
    cuadrillaId: Number(f.cuadrilla_odoo_id),
    semana: f.guardia_semana,
    ranura: Number(f.guardia_ranura) as RanuraGuardia,
    estado: "activa",
  }));
}

/**
 * Lo que se le dice al tablero: el 409 con el `pide` que corresponde. Si se sabe la obra, se
 * evalúa el candado de verdad (puede que la obra la pueda usar: entonces hay que pasar por
 * "usar", no por acá). Si la evaluación misma falla, se pide como obra común: sigue siendo
 * un 409, nunca un paso libre.
 */
async function rechazo(g: GuardiaResumen, ctx: ContextoCandado): Promise<NextResponse> {
  const cuerpo = (error: string, pide: RechazoCandado["pide"]): NextResponse =>
    NextResponse.json({ error, codigo: "guardia", guardiaId: g.id, pide } satisfies RechazoCandado, { status: 409 });

  if (ctx.tarea) {
    // Una tarea no tiene por qué pedírsele a JS: la guardia ya es "lugar para lo imprevisto".
    return cuerpo("Esa jornada es una guardia: no se le puede poner una tarea encima. Corré la guardia o pedile a JS que la saque.", null);
  }
  if (!ctx.otId) return cuerpo(MENSAJE_OBRA_COMUN, "obra_comun");

  try {
    const hoy = hoyBA();
    const adm = createAdminClient();
    const [ots, avances, planes, feriadosLista, marcados] = await Promise.all([
      leerOts([ctx.otId]),
      avanceDeOts([ctx.otId]),
      jornadasPlanTodas(adm),
      feriadosDelRango(sumarDias(hoy, -45), sumarDias(g.fecha, 1)),
      // Si es comodín lo dice la MARCA de Planificación (plan_comodines), no una regla
      // (contrato §2, 18/10). Si no se puede leer, el catch de abajo pide como obra común:
      // falla cerrado, igual que todo el candado.
      leerMarcados(adm, [ctx.otId]),
    ]);
    const ot = ots[0];
    if (!ot) return cuerpo(MENSAJE_OBRA_COMUN, "obra_comun");
    // La duración del candado (la mayor entre Odoo y el plan): ver duracionParaCandado.
    const duracion = duracionParaCandado(ot, planes.find((p) => p.otId === ot.id)?.jornadas);
    const avance = avances.get(ot.id) ?? null;
    const feriados = new Set(feriadosLista.map((f) => f.fecha));
    const comodin = comodinDe(ot, { marcados, asignaciones: [], progreso: avance ? [avance] : [], duracionDe: () => duracion });
    const d = evaluarCandado({
      guardia: g,
      ot: otParaCandado(ot, duracion),
      esApoyo: ctx.esApoyo === true,
      avance,
      ahora: new Date().toISOString(),
      feriados,
      esComodin: comodinPuedeIr(comodin, g.fecha, hoy),
    });
    if (d.libre) {
      return cuerpo(
        "Esa jornada es una guardia y esta obra la puede usar: volvé a soltarla con el tablero actualizado (la guardia se reemplaza y se puede deshacer).",
        null,
      );
    }
    return cuerpo(d.mensaje, d.pide);
  } catch (e) {
    console.error("[candado-guardias] no se pudo evaluar el candado; se pide como obra común", e);
    return cuerpo(MENSAJE_OBRA_COMUN, "obra_comun");
  }
}

/**
 * 409 RechazoCandado si alguna celda destino (fecha >= hoy en Buenos Aires) tiene una guardia
 * activa; 503 si no se pudo comprobar; null si se puede seguir.
 */
export async function frenoDeGuardias(celdas: readonly Celda[], ctx: ContextoCandado = {}): Promise<NextResponse | null> {
  const conCuadrilla = celdas.filter((c): c is { cuadrillaId: number; fecha: string } => c.cuadrillaId != null);
  if (conCuadrilla.length === 0) return null;
  let activas: GuardiaResumen[];
  try {
    activas = await activasDeFechas(conCuadrilla.map((c) => c.fecha));
  } catch (e) {
    return noPude(e);
  }
  const claves = new Set(conCuadrilla.map((c) => claveCelda(c.cuadrillaId, c.fecha)));
  const pisada = activas.find((g) => claves.has(claveCelda(g.cuadrillaId, g.fecha)));
  return pisada ? rechazo(pisada, ctx) : null;
}

/**
 * El candado de un PATCH que mueve jornadas. Un movimiento sin `cuadrillaId` se queda en la
 * suya, que se lee de Odoo SÓLO si ese día hay alguna guardia. Lo que no cambia de celda (un
 * reordenamiento dentro del día) no se frena.
 */
export async function frenoParaMover(movimientos: readonly MovimientoAsignacion[]): Promise<NextResponse | null> {
  let activas: GuardiaResumen[];
  try {
    activas = await activasDeFechas(movimientos.map((m) => m.fecha));
  } catch (e) {
    return noPude(e);
  }
  if (activas.length === 0) return null;
  let actuales;
  try {
    actuales = new Map((await celdasDeAsignaciones(movimientos.map((m) => m.id))).map((c) => [c.id, c]));
  } catch (e) {
    return noPude(e);
  }
  const claves = new Map(activas.map((g) => [claveCelda(g.cuadrillaId, g.fecha), g]));
  for (const m of movimientos) {
    const actual = actuales.get(m.id);
    const cuadrillaId = m.cuadrillaId !== undefined ? m.cuadrillaId : (actual?.cuadrillaId ?? null);
    if (actual && actual.cuadrillaId === cuadrillaId && actual.fecha === m.fecha) continue;
    const g = claves.get(claveCelda(cuadrillaId, m.fecha));
    if (g) return rechazo(g, { otId: actual?.otId ?? undefined, esApoyo: actual?.apoyo });
  }
  return null;
}

/** El candado de un PATCH que cambia fecha o cuadrilla de varios ids a la vez. */
export async function frenoParaActualizar(ids: readonly number[], cambio: Pick<CambioAsignacion, "fecha" | "cuadrillaId">): Promise<NextResponse | null> {
  if (cambio.fecha === undefined && cambio.cuadrillaId === undefined) return null;
  let actuales;
  try {
    actuales = await celdasDeAsignaciones([...ids]);
  } catch (e) {
    return noPude(e);
  }
  const movimientos = actuales
    .filter((a) => (cambio.fecha ?? a.fecha) != null)
    .map((a) => ({
      id: a.id,
      fecha: (cambio.fecha ?? a.fecha) as string,
      cuadrillaId: cambio.cuadrillaId !== undefined ? cambio.cuadrillaId : a.cuadrillaId,
    }));
  return frenoParaMover(movimientos);
}

/**
 * El trigger de la base (tablero_tareas_candado_guardia) también rechaza una tarea en la celda
 * de una guardia. Si una escritura de tareas llega hasta ahí, el error de Postgres se traduce
 * al mismo 409 del candado en vez de un 502 con el texto crudo.
 */
export function esErrorDelCandado(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /Esa jornada es una guardia/.test(msg) || /candado_guardia/.test(msg) || /guardias no se (insertan|editan|borran)/.test(msg);
}

export function rechazoDelTrigger(): NextResponse {
  return NextResponse.json(
    {
      error: "Esa jornada es una guardia: no se le puede poner una tarea encima. Corré la guardia o pedile a JS que la saque.",
      codigo: "guardia",
      guardiaId: 0,
      pide: null,
    } satisfies RechazoCandado,
    { status: 409 },
  );
}
