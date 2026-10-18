// Comodines: las obras que Planificación MARCÓ como comodín. TODO PURO. Ver
// docs/tablero-planificacion/guardias-contrato.md §2 (manda).
//
// UN COMODÍN ES UNA DECISIÓN, NO UNA REGLA (JS, 18/10). La primera versión lo calculaba —desarme,
// una jornada o menos, sin urgencia alta, con el "a partir de" cumplido, vencido a los 7 días
// hábiles— y en producción se vio que no sirve: que una obra pueda ir "cuando haya lugar" depende
// de cosas que no están en Odoo (qué habló Comercial con el cliente, si el edificio deja entrar
// cualquier día, si el material ya volvió). Lo sabe quien planifica, obra por obra. Por eso ahora
// es una MARCA que pone o saca Planificación (tabla `plan_comodines`, ruta
// /api/planificacion/comodines) y este archivo sólo cruza esa marca con el tablero:
//   · cualquier tipo de OT, de cualquier urgencia y cualquier duración;
//   · pendiente o en proceso: una OT completada o cancelada no se ofrece aunque siga marcada;
//   · que le quede algo por hacer: si ya se cerraron con parte tantos días como dura, la obra
//     está hecha aunque la OT siga abierta en Odoo (la cierra Comercial, no el parte), y deja de
//     mostrarse como comodín. La marca queda guardada; simplemente no se muestra.
//
// SIN FECHAS. No hay piso (al marcarla "puede ir ya", a cualquier día que no haya pasado) ni
// vencimiento (es comodín hasta que alguien lo quite). Lo único que la hora sigue decidiendo es
// el CANDADO: un comodín usa una guardia sin pedir permiso desde las 13 h del día hábil anterior
// (evaluarCandado, en guardias.ts), y eso no cambió.
//
// ORDEN: por cuándo se marcó, el más viejo primero. Es el orden del grupo "Comodines" de la
// bandeja y de la propuesta de relleno de las 13 h: el que hace más tiempo que está esperando
// lugar es el primero que se ofrece, así la bandeja y el aviso dicen lo mismo.
//
// Los imports de código van con ruta relativa y extensión .ts para que `npm test` los cargue
// sin el alias "@/". Los tests están en comodines.test.ts.

import { hoyBA } from "./dias-habiles.ts";
import type { Comodin } from "./guardias-tipos";
import type { AsignacionTablero, OtTablero, ProgresoOt } from "./tipos";

/** Las marcas de Planificación: otId → cuándo se marcó (ISO, el `marcado_el` de la tabla). */
export type Marcados = ReadonlyMap<number, string>;

export type EntradaComodines = {
  ots: readonly OtTablero[];
  /** Lo que marcó Planificación (plan_comodines). Sin marca no hay comodín. */
  marcados: Marcados;
  /** Lo que el tablero tiene cargado: de acá sale dónde está hoy cada uno. */
  asignaciones: readonly AsignacionTablero[];
  progreso: readonly ProgresoOt[];
  /** Duración vigente (la del candado o la de Operaciones). Por defecto `ot.jornadas`. */
  duracionDe?: (ot: OtTablero) => number;
};

/**
 * Los comodines vigentes: marcados, con la OT pendiente o en proceso y algo por hacer. Incluye
 * los que ya están en la grilla (la bandeja los muestra en su grupo igual, con dónde están hoy).
 * Ordenados por cuándo se marcaron, el más viejo primero.
 */
export function evaluarComodines(e: EntradaComodines): Comodin[] {
  if (e.marcados.size === 0) return [];
  // Los índices se arman una vez: con 50 OTs y 300 jornadas, buscarlos por OT dentro del
  // bucle sería recorrer el tablero entero cincuenta veces.
  const contexto = { ...e, indice: indexar(e) };
  const salida: Comodin[] = [];
  for (const ot of e.ots) {
    const c = calcular(ot, contexto);
    if (c) salida.push(c);
  }
  // A igual momento (dos marcas en el mismo instante no deberían pasar, pero el orden no puede
  // bailar entre una lectura y la siguiente), el número de OT.
  return salida.sort((a, b) => a.marcadoEl.localeCompare(b.marcadoEl) || a.otId - b.otId);
}

/** Lo mismo para una sola OT. null si no está marcada o si ya no corresponde mostrarla. */
export function comodinDe(ot: OtTablero, e: Omit<EntradaComodines, "ots">): Comodin | null {
  if (!e.marcados.has(ot.id)) return null;
  return calcular(ot, { ...e, indice: indexar(e) });
}

/**
 * ¿Se le puede ofrecer a la guardia de ese día? Si es comodín, a cualquier día que no haya
 * pasado: ya no hay piso. (Que la guardia lo acepte sin pedir nada lo dice el candado.)
 */
export function comodinPuedeIr(c: Comodin | null | undefined, fecha: string, hoy: string): boolean {
  return c != null && fecha >= hoy;
}

/** ¿Esta OT se puede marcar? Pendiente o en proceso (contrato §2). La regla la repite el servidor. */
export function otMarcable(ot: Pick<OtTablero, "estado">): boolean {
  return ot.estado === "pendiente" || ot.estado === "en_proceso";
}

/** Lo que dice el chip, en la grilla, la bandeja y la ficha. Sin fechas ni cuentas atrás. */
export const TEXTO_CHIP_COMODIN = "comodín";

const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

/** El tooltip del chip: desde cuándo está marcada y qué quiere decir. */
export function tituloComodin(c: Pick<Comodin, "marcadoEl">): string {
  const dia = c.marcadoEl ? hoyBA(c.marcadoEl) : null;
  return (
    `${dia ? `Marcada como comodín el ${ddmm(dia)}` : "Marcada como comodín"}: puede ir cualquier día. ` +
    "Sirve para rellenar una guardia o un hueco."
  );
}

type Indice = {
  progreso: Map<number, ProgresoOt>;
  /** El primer día de cada OT en la grilla (sin apoyos ni jornadas ya cerradas). */
  primerDia: Map<number, { fecha: string; cuadrillaId: number | null }>;
};

function indexar(e: Pick<EntradaComodines, "asignaciones" | "progreso">): Indice {
  const primerDia = new Map<number, { fecha: string; cuadrillaId: number | null }>();
  for (const a of e.asignaciones) {
    // Un apoyo no dice dónde está la obra, y una jornada con parte ya se hizo: "dónde está
    // hoy" es el próximo día que la cuadrilla todavía tiene que ir.
    if ((a.origen ?? "ot") !== "ot" || a.apoyo === true || a.parteId != null || !a.otId) continue;
    const ya = primerDia.get(a.otId);
    if (!ya || a.fecha < ya.fecha) primerDia.set(a.otId, { fecha: a.fecha, cuadrillaId: a.cuadrillaId });
  }
  return { progreso: new Map(e.progreso.map((p) => [p.otId, p])), primerDia };
}

function calcular(
  ot: OtTablero,
  e: Omit<EntradaComodines, "ots"> & { indice: Indice },
): Comodin | null {
  const marcadoEl = e.marcados.get(ot.id);
  if (marcadoEl === undefined) return null;
  if (!otMarcable(ot)) return null;
  const jornadas = (e.duracionDe ?? ((o: OtTablero) => o.jornadas))(ot);

  // "Que le quede algo por hacer": si ya se cerraron tantos días como dura, la obra está hecha
  // aunque la OT siga abierta en Odoo. Con duración 0 (sin estimar) cuenta como un día.
  const prog = e.indice.progreso.get(ot.id);
  if (prog && prog.cerradas >= Math.max(1, Math.ceil(jornadas))) return null;

  return {
    otId: ot.id,
    jornadas,
    ubicacion: e.indice.primerDia.get(ot.id) ?? null,
    marcadoEl,
  };
}
