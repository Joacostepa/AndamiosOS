// Comodines: los desarmes que ya pueden ir cualquier día. TODO PURO. Ver
// docs/tablero-planificacion/guardias-contrato.md §2 (manda) y comodines.md.
//
// SE CALCULA, NO SE GUARDA. No hay campo nuevo en Odoo: un comodín es una OT que cumple
// todo esto al momento de mirarla (contrato §2.1):
//   · tipo desarme;
//   · pendiente o en proceso, con jornadas por planificar o planificadas sin hacer;
//   · urgencia que no es alta;
//   · dura 1 jornada o menos (la duración vigente: la que fijó Operaciones si la corrigió);
//   · su PISO ya llegó o llega antes del día donde se lo quiere poner. El piso es
//     `fechaDesde` ("a partir de"); sin piso cargado, el día en que se creó la OT;
//   · no lleva más de DIAS_MAX_COMODIN días hábiles esperando desde el piso. Pasado eso
//     deja de ser comodín y se muestra como urgente (sin escribir nada en Odoo).
//
// LOS DESARMES NO SE ADELANTAN; SE PUEDEN ATRASAR. Por eso "nunca antes del piso" es la
// única regla dura de dónde puede ir (comodinPuedeIr): si el desarme está cargado, el
// cliente lo pidió a partir de esa fecha.
//
// Las firmas son las que dejó el arquitecto el 18/10; los tests están en comodines.test.ts.

import { AVISO_COMODIN_DIAS, DIAS_MAX_COMODIN } from "./guardias-tipos.ts";
import { diasHabilesEntre, fechaBADeOdoo, type Feriados } from "./dias-habiles.ts";
import type { Comodin } from "./guardias-tipos";
import type { AsignacionTablero, OtTablero, ProgresoOt } from "./tipos";

export type EntradaComodines = {
  ots: readonly OtTablero[];
  /** Lo que el tablero tiene cargado: de acá sale dónde está hoy cada uno. */
  asignaciones: readonly AsignacionTablero[];
  progreso: readonly ProgresoOt[];
  /** Hoy en Buenos Aires. */
  hoy: string;
  feriados: Feriados;
  /** Duración vigente (la de Operaciones si la corrigió). Por defecto `ot.jornadas`. */
  duracionDe?: (ot: OtTablero) => number;
};

/**
 * Todos los desarmes que son (o fueron hasta hace poco) comodín, con `vencido` marcado,
 * ordenados por cuánto esperan (el que más espera primero). Incluye los que ya están en la
 * grilla: la bandeja los muestra en su grupo igual, con dónde están hoy. Los vencidos
 * vienen en la lista para que la pantalla los muestre como urgentes y la corrida de las 13 h
 * avise; el grupo "Comodines" los deja afuera.
 */
export function evaluarComodines(e: EntradaComodines): Comodin[] {
  // Los índices se arman una vez: con 50 OTs y 300 jornadas, buscarlos por OT dentro del
  // bucle sería recorrer el tablero entero cincuenta veces.
  const contexto = { ...e, indice: indexar(e) };
  const salida: Comodin[] = [];
  for (const ot of e.ots) {
    const c = calcular(ot, contexto);
    if (c) salida.push(c);
  }
  // El que más espera primero; a igual espera, el piso más viejo y después el número de
  // OT, para que el orden no baile entre una lectura y la siguiente.
  return salida.sort((a, b) => b.espera - a.espera || a.piso.localeCompare(b.piso) || a.otId - b.otId);
}

/** El mismo cálculo para una sola OT. null si no es comodín (ni vencido). */
export function comodinDe(ot: OtTablero, e: Omit<EntradaComodines, "ots">): Comodin | null {
  return calcular(ot, { ...e, indice: indexar(e) });
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

/**
 * La regla del contrato §2.1, punto por punto. Los VENCIDOS se devuelven igual (con
 * `vencido: true`): dejan de ser comodín pero siguen siendo un desarme que alguien tiene
 * que mirar ya, y la pantalla y el aviso de las 13 h los necesitan.
 */
function calcular(
  ot: OtTablero,
  e: Omit<EntradaComodines, "ots"> & { indice: Indice },
): Comodin | null {
  if (ot.tipo !== "desarme") return null;
  if (ot.estado !== "pendiente" && ot.estado !== "en_proceso") return null;
  // Urgencia alta no es comodín: ya tiene su propio camino (la guardia la toma como urgencia).
  if (ot.urgencia === "alta") return null;
  const jornadas = (e.duracionDe ?? ((o: OtTablero) => o.jornadas))(ot);
  if (!(jornadas <= 1)) return null;

  // "Con jornadas por planificar o planificadas que todavía no se hicieron": si ya se
  // cerraron tantos días como dura, el desarme está hecho aunque la OT siga abierta en Odoo
  // (la cierra Comercial, no el parte).
  const prog = e.indice.progreso.get(ot.id);
  if (prog && prog.cerradas >= Math.max(1, Math.ceil(jornadas))) return null;

  // EL PISO. Sin "a partir de" cargado, el día en que se creó la OT: un desarme cargado
  // es un desarme que el cliente pidió. Sin ninguno de los dos no hay desde cuándo contar,
  // y un comodín que no se sabe desde cuándo puede ir no se ofrece (falla cerrado).
  const pisoDeCreacion = !ot.fechaDesde;
  const piso = ot.fechaDesde ?? (ot.creadaEl ? fechaBADeOdoo(ot.creadaEl) : null);
  if (!piso) return null;

  const espera = diasHabilesEntre(piso, e.hoy, e.feriados);
  const quedan = DIAS_MAX_COMODIN - espera;
  return {
    otId: ot.id,
    piso,
    pisoDeCreacion,
    espera,
    quedan,
    vencido: espera > DIAS_MAX_COMODIN,
    jornadas,
    ubicacion: e.indice.primerDia.get(ot.id) ?? null,
  };
}

/** ¿Puede ir ese día? Nunca antes del piso. (Que la guardia lo acepte lo dice el candado.) */
export function comodinPuedeIr(c: Pick<Comodin, "piso" | "vencido">, fecha: string): boolean {
  return !c.vencido && c.piso <= fecha;
}

const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

/**
 * El chip de la tarjeta y de la bandeja: "comodín · desde 20/10", o "comodín · quedan 2 d"
 * cuando le quedan AVISO_COMODIN_DIAS días hábiles o menos. Vencido: "Esperando hace 8 días
 * hábiles" (va en rojo, como urgente).
 */
export function textoChipComodin(c: Pick<Comodin, "piso" | "espera" | "quedan" | "vencido">): string {
  if (c.vencido) return `Esperando hace ${c.espera} días hábiles`;
  if (c.quedan <= AVISO_COMODIN_DIAS) return `comodín · quedan ${Math.max(0, c.quedan)} d`;
  return `comodín · desde ${ddmm(c.piso)}`;
}
