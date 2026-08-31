// Listado de partes diarios — la consulta que lo deriva.
//
// SOLO server-side. Se consume desde /api/planificacion/jornadas.
//
// EL PUNTO CENTRAL: no hay tabla de "partes pendientes". El listado se DERIVA de las
// asignaciones del tablero, y ningún parte existe en Odoo hasta que alguien lo guarda.
//
// Materializarlo obligaría a sincronizar en cinco direcciones (confirmar → crear, volver
// a tentativa → borrar, borrar la asignación → borrar, mover de fecha → mover, cambiar de
// cuadrilla → actualizar) y la segunda no tiene respuesta buena: con medio parte cargado,
// o se pierde el trabajo o queda un parte huérfano. Derivándolo, el comportamiento sale
// gratis: la jornada se confirma y aparece; vuelve a tentativa y desaparece, sin borrar
// nada, porque dejó de cumplir el filtro.

import { searchRead, executeKw, create, read } from "./client";
import { consultasDeAvance } from "./asignaciones";
import { fetchPartes } from "./partes";
import type { JornadaListado, ListadoJornadas } from "@/lib/tablero/tipos-jornada";

type M2O = [number, string] | false;

function m2oId(v: M2O | undefined): number | null {
  return Array.isArray(v) ? v[0] : null;
}
function str(v: string | false | null | undefined): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

type FilaAsig = {
  id: number;
  x_ot_id: M2O;
  x_fecha: string | false;
  x_cuadrilla_id: M2O;
  x_fraccion: string | false;
  x_estado: string | false;
  x_parte_id: M2O;
};

const CAMPOS_ASIG = ["x_ot_id", "x_fecha", "x_cuadrilla_id", "x_fraccion", "x_estado", "x_parte_id"];

function fraccionNum(v: string | false | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Viajes sugeridos para UN día.
 *
 * La regla "N jornadas → N+1 viajes" es de la obra entera, no de la jornada: aplicada al
 * parte de un día daba 9 viajes en una obra de 8 jornadas. Medido sobre las 966 líneas de
 * flete cargadas, 720 (74,5%) tienen un solo viaje. El default es 1 y se corrige a mano
 * el día que se lleva o se retira material.
 */
const FLETES_SUGERIDOS_POR_DIA = 1;

/**
 * Hasta dónde se mira atrás buscando tentativas sin confirmar, y cuántas se traen.
 *
 * POR QUÉ HAY UN LÍMITE: el filtro es "fecha < hoy, tentativa, sin parte", que no lo
 * cumple nadie por un rato — lo cumple para siempre. Toda tentativa vieja que el
 * planificador nunca confirmó ni borró se queda en la lista, así que la consulta y el
 * `read` de OTs que viene después crecen mes a mes hasta volver lenta una pantalla que
 * arrancó rápida.
 *
 * Dos meses es más que suficiente: una jornada que se trabajó y nadie cargó en ese plazo
 * ya no se va a cargar de memoria. El tope de 50 es la red de contención para la primera
 * vez que alguien abra esto con años de tentativas acumuladas.
 */
const DIAS_ATRAS_SIN_CONFIRMAR = 60;
const MAX_SIN_CONFIRMAR = 50;

/** `hoy` menos N días, en YYYY-MM-DD. */
function diasAntes(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/**
 * El listado de un día.
 *
 * Dos orígenes, a propósito:
 *  1. Las jornadas confirmadas de ESA fecha, si la fecha ya llegó. Una jornada de la
 *     semana que viene no es un parte pendiente.
 *  2. Las tentativas de días pasados sin parte, en una sección aparte. Confirmar es un
 *     gesto del planificador y se olvida; sin esta sección, una jornada que se trabajó
 *     pero nadie confirmó no tendría dónde cargarse.
 */
export async function fetchListadoJornadas(fecha: string, hoy: string): Promise<ListadoJornadas> {
  const dominioDelDia =
    fecha <= hoy
      ? [["x_fecha", "=", fecha], ["x_estado", "=", "confirmada"]]
      : // Fecha futura: no hay nada para cargar. Se devuelve vacío en vez de esconder la
        // navegación, así se puede mirar adelante sin que parezca que faltan partes.
        [["id", "=", 0]];

  const [asigsDia, asigsSinConfirmar, cuadrillasRaw, otsDisponiblesRaw, gruposTomadas, gruposHechas] =
    await Promise.all([
      searchRead<FilaAsig>("x_aba_asignacion", dominioDelDia, CAMPOS_ASIG, {
        order: "x_cuadrilla_id, x_orden_dia, id",
      }),
      searchRead<FilaAsig>(
        "x_aba_asignacion",
        [
          ["x_fecha", "<", hoy],
          ["x_fecha", ">=", diasAntes(hoy, DIAS_ATRAS_SIN_CONFIRMAR)],
          ["x_estado", "=", "tentativa"],
          ["x_parte_id", "=", false],
        ],
        CAMPOS_ASIG,
        { order: "x_fecha desc, id", limit: MAX_SIN_CONFIRMAR },
      ),
      searchRead<{ id: number; x_name: string | false }>(
        "x_aba_cuadrilla",
        [["x_activa", "=", true]],
        ["x_name"],
        { order: "x_name" },
      ),
      // Para "agregar jornada no planificada": el trabajo de urgencia que pasó sin estar
      // en el tablero. Mismo dominio que usa la bandeja del tablero.
      searchRead<{ id: number; x_name: string | false; x_tipo: string | false }>(
        "x_aba_orden_trabajo",
        [["x_estado", "in", ["pendiente", "en_proceso"]], ["x_order_id.x_studio_tipo_de_contrato", "=", "Obra "]],
        ["x_name", "x_tipo"],
        { order: "x_name" },
      ),
      // Mismo avance que usa la bandeja del tablero, de la misma fuente: son la misma
      // pregunta —cuánto le queda a la obra— y contestarlas distinto es cuestión de
      // tiempo (ver consultasDeAvance: una jornada no ejecutada no cuenta como hecha).
      ...consultasDeAvance(),
    ]);

  const todas = [...asigsDia, ...asigsSinConfirmar];
  const otIds = [...new Set(todas.map((a) => m2oId(a.x_ot_id)).filter((x): x is number => !!x))];

  const ots = otIds.length
    ? await read<{
        id: number;
        x_name: string | false;
        x_tipo: string | false;
        x_personal_por_jornada: number | false;
        x_duracion_est: string | false;
        x_jornadas_num: number | false;
        x_detalle_tecnico: string | false;
      }>("x_aba_orden_trabajo", otIds, [
        "x_name", "x_tipo", "x_personal_por_jornada", "x_duracion_est", "x_jornadas_num",
        "x_detalle_tecnico",
      ])
    : [];
  const otPorId = new Map(ots.map((o) => [o.id, o]));

  // Los partes se traen por el VÍNCULO de la asignación (x_parte_id) y no por OT+fecha.
  // Buscar por OT+fecha haría que una jornada se apropie de un parte histórico cargado
  // directamente en Odoo; ya pasó una vez y borró líneas. cerrarJornada avisa si detecta
  // un duplicado, que es la mitad segura de ese chequeo.
  //
  // Se leen TODOS de una: fetchPartes agrupa por `in` y son 5 llamadas fijas, no 5 por
  // parte. De a uno, un día con cinco jornadas cargadas eran 25 round-trips.
  const parteIds = [...new Set(todas.map((a) => m2oId(a.x_parte_id)).filter((x): x is number => !!x))];
  const partePorId = await fetchPartes(parteIds);

  const tomadasPorOt = new Map(gruposTomadas.map((g) => [m2oId(g.x_ot_id) ?? 0, g.__count]));
  const hechasPorOt = new Map(gruposHechas.map((g) => [m2oId(g.x_ot_id) ?? 0, g.__count]));

  const mapear = (a: FilaAsig, tentativaVencida: boolean): JornadaListado => {
    const otId = m2oId(a.x_ot_id) ?? 0;
    const ot = otPorId.get(otId);
    const dur = Number(ot?.x_duracion_est);
    const jornadasOt =
      Number.isFinite(dur) && dur > 0 ? dur : Number(ot?.x_jornadas_num) || 1;
    const asignadas = tomadasPorOt.get(otId) ?? 0;
    const hechas = hechasPorOt.get(otId) ?? 0;
    const parteId = m2oId(a.x_parte_id);

    return {
      asignacionId: a.id,
      fecha: str(a.x_fecha) ?? "",
      otId,
      titulo: str(ot?.x_name) ?? `OT #${otId}`,
      tipo: str(ot?.x_tipo) ?? "otro",
      cuadrillaId: m2oId(a.x_cuadrilla_id),
      fraccion: fraccionNum(a.x_fraccion),
      estadoAsignacion: a.x_estado === "confirmada" ? "confirmada" : "tentativa",
      // 0 cuando la OT no tiene dotación cargada. El formulario deja el campo VACÍO en
      // ese caso: un default de 1 persona es plausible, no se nota, y va derecho al costo
      // de mano de obra inventando horas-hombre.
      personalPrevisto: Number(ot?.x_personal_por_jornada) || 0,
      fleteSugerido: FLETES_SUGERIDOS_POR_DIA,
      parte: parteId ? (partePorId.get(parteId) ?? null) : null,
      // Falta cerrar sólo ésta, y la obra no tiene jornadas sin planificar.
      ultimaDeLaOt: asignadas - hechas === 1 && Math.ceil(jornadasOt) <= asignadas,
      // Precarga del as-built cuando se cierra la OT. Viaja acá y no en una llamada
      // aparte porque el listado ya lee la OT entera: es un campo más de un read que ya
      // se hace.
      detalleTecnico: str(ot?.x_detalle_tecnico),
      tentativaVencida,
    };
  };

  return {
    fecha,
    jornadas: asigsDia.map((a) => mapear(a, false)),
    sinConfirmar: asigsSinConfirmar.map((a) => mapear(a, true)),
    cuadrillas: cuadrillasRaw.map((c) => ({ id: c.id, nombre: str(c.x_name) ?? `Cuadrilla ${c.id}` })),
    otsDisponibles: otsDisponiblesRaw.map((o) => ({
      id: o.id,
      titulo: str(o.x_name) ?? `OT #${o.id}`,
      tipo: str(o.x_tipo) ?? "otro",
    })),
  };
}

/** Cuántas jornadas quedaron sin parte hasta ayer. Es el badge del sidebar. */
export async function contarPendientes(hoy: string): Promise<number> {
  return executeKw<number>("x_aba_asignacion", "search_count", [
    [["x_fecha", "<", hoy], ["x_parte_id", "=", false], ["x_estado", "=", "confirmada"]],
  ]);
}

/**
 * Jornada que pasó sin estar planificada (un trabajo de urgencia). Crea la asignación
 * para que el parte tenga de dónde colgar; el parte lo escribe después cerrarJornada.
 */
export async function crearJornadaNoPlanificada(datos: {
  otId: number;
  fecha: string;
  cuadrillaId: number | null;
  fraccion: string;
}): Promise<number> {
  const [ot] = await read<{ id: number; x_name: string | false }>(
    "x_aba_orden_trabajo", [datos.otId], ["x_name"],
  );
  return create("x_aba_asignacion", {
    x_name: `${str(ot?.x_name) ?? `OT #${datos.otId}`} · ${datos.fecha}`,
    x_ot_id: datos.otId,
    x_fecha: datos.fecha,
    x_cuadrilla_id: datos.cuadrillaId ?? false,
    x_fraccion: datos.fraccion,
    // Nace confirmada: no es un plan, es algo que ya pasó.
    x_estado: "confirmada",
    x_orden_dia: 0,
  });
}

/**
 * Reprogramar una jornada que no se ejecutó: CREA una nueva en la fecha elegida.
 *
 * La original NO se mueve. Mover la asignación al día nuevo borraría la evidencia de que
 * ese día se fue a la obra y no se pudo trabajar, y dejaría x_motivo_no_ejec sin ningún
 * uso: no se puede medir cuántas jornadas se pierden por lluvia si el registro se muda de
 * fecha cada vez. La jornada perdida es un hecho del calendario, no un plan que se corrige.
 *
 * Nace TENTATIVA: es una fecha nueva que el planificador todavía tiene que mirar contra
 * la capacidad de esa cuadrilla.
 */
export async function reprogramarJornada(asignacionId: number, nuevaFecha: string): Promise<number> {
  const [orig] = await read<FilaAsig>("x_aba_asignacion", [asignacionId], CAMPOS_ASIG);
  if (!orig) throw new Error("La asignación no existe");
  const otId = m2oId(orig.x_ot_id);
  if (!otId) throw new Error("La asignación no tiene orden de trabajo");

  const [ot] = await read<{ id: number; x_name: string | false }>(
    "x_aba_orden_trabajo", [otId], ["x_name"],
  );
  return create("x_aba_asignacion", {
    x_name: `${str(ot?.x_name) ?? `OT #${otId}`} · ${nuevaFecha}`,
    x_ot_id: otId,
    x_fecha: nuevaFecha,
    x_cuadrilla_id: m2oId(orig.x_cuadrilla_id) ?? false,
    x_fraccion: orig.x_fraccion || "1",
    x_estado: "tentativa",
    x_orden_dia: 0,
  });
}
