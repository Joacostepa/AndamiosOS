// Los apoyos en la pantalla de Partes: la lógica pura, sin Odoo ni React.
//
// Ver docs/tablero-planificacion/apoyo.md. La obra sale UNA vez en el listado, con la
// jornada de la principal; sus cuadrillas de apoyo van adentro (JornadaListado.apoyos).
// El parte es uno solo y lleva un renglón de mano de obra por cuadrilla.
//
// Sólo `import type` a propósito: los tests corren con node --experimental-strip-types,
// que no resuelve los alias "@/…" pero borra los imports de tipos.

import type { ApoyoListado } from "@/lib/tablero/tipos-jornada";
import type { ApoyoDelCierre, DatosCierre, LineaManoObra, ParteCargado } from "@/lib/tablero/tipos-parte";

/**
 * Los apoyos de un parte YA CARGADO a los que les falta su gente.
 *
 * Es el caso de "sumar el apoyo después de cargar el parte": el apoyo queda vinculado al
 * parte (o se vincula al editarlo), pero el parte no se toca solo — inventaría personas y
 * horas que van al costo de la obra. La pantalla avisa "sumá la gente de C3 al parte".
 *
 * Cuenta como "le falta" un apoyo que no tiene NINGÚN renglón con su cuadrilla. Sólo se
 * miran los sin parte o los de ESTE parte: uno colgado de otro parte es historia (los
 * casos viejos de dos cuadrillas con dos partes) y no se le pide nada. Un parte "no
 * ejecutado" no tiene gente que sumar.
 */
export function apoyosSinGente(parte: ParteCargado, apoyos: ApoyoListado[]): ApoyoListado[] {
  if (parte.estado !== "ejecutado") return [];
  const conRenglon = new Set(parte.manoObra.map((l) => l.cuadrillaId ?? parte.cuadrillaId));
  return apoyos.filter(
    (a) => (a.parteId === null || a.parteId === parte.id) && !(a.cuadrillaId !== null && conRenglon.has(a.cuadrillaId)),
  );
}

/**
 * Un parte ya cargado, vuelto a escribir tal como está más lo que se le suma.
 *
 * El PATCH reemplaza TODAS las líneas (comandosLineas con `reemplazar`), así que lo que no
 * viaja se borra: cada renglón se manda con su cuadrilla, el flete y las incidencias tal
 * como se leyeron. Las fotos no viajan —ya están en Odoo y `crearFotos` sólo sube las
 * nuevas— y el as-built tampoco: es de la OT y se escribe sólo al cerrarla.
 */
export function datosDeParteCargado(
  parte: ParteCargado,
  cambios: { lineaExtra?: LineaManoObra | null; apoyos: ApoyoDelCierre[] },
): DatosCierre {
  const manoObra: LineaManoObra[] = parte.manoObra.map(({ tarea, personas, horaDesde, horaHasta, cuadrillaId }) => ({
    tarea,
    personas,
    horaDesde,
    horaHasta,
    // Un renglón viejo sin cuadrilla es de la del parte: es lo que hubo hasta el apoyo.
    cuadrillaId: cuadrillaId ?? parte.cuadrillaId,
  }));
  if (cambios.lineaExtra) manoObra.push(cambios.lineaExtra);
  return {
    fecha: parte.fecha,
    cuadrillaId: parte.cuadrillaId,
    punteroId: parte.punteroId,
    camionEnObra: parte.camionEnObra,
    estado: parte.estado,
    motivoNoEjec: parte.motivoNoEjec as DatosCierre["motivoNoEjec"],
    sector: parte.sector,
    clima: parte.clima,
    objetivo: parte.objetivo,
    tareas: parte.tareas,
    observaciones: parte.observaciones,
    manoObra,
    flete: parte.flete,
    // Y las líneas de flete de más (el camión del apoyo): sin ellas, el PATCH las borraría.
    fletesExtra: parte.fletesExtra ?? [],
    incidencias: parte.incidencias as DatosCierre["incidencias"],
    fotos: [],
    ejecutadoReal: null,
    apoyos: cambios.apoyos,
  };
}

/** Lo que el borrador de una fila sabe de cada apoyo, ya traducido a números. */
export type ApoyoCargado = {
  asignacionId: number;
  cuadrillaId: number | null;
  fue: boolean;
  personas: number;
  horaDesde: number;
  horaHasta: number;
};

/**
 * Lo que viaja al parte por los apoyos: el "fue / no fue" de cada uno y un renglón de
 * mano de obra por cada apoyo que fue.
 *
 *  - No ejecutado: nadie trabajó, no hay renglones. Los apoyos quedan registrados con el
 *    mismo parte, igual que la principal: es la jornada perdida de la obra, no un apoyo
 *    que "no fue" (ese sí se borra, decisión 4 del 17/10).
 *  - Un apoyo que fue sin personas no lleva renglón: la pantalla no deja guardarlo así
 *    (erroresDe), y si llegara, un renglón de 0 personas rebota en la API.
 */
export function apoyosAlParte(
  apoyos: ApoyoCargado[],
  ejecutado: boolean,
  tarea: string,
): { lineas: LineaManoObra[]; apoyos: ApoyoDelCierre[] } {
  if (!ejecutado) {
    return { lineas: [], apoyos: apoyos.map((a) => ({ asignacionId: a.asignacionId, fue: true })) };
  }
  return {
    lineas: apoyos
      .filter((a) => a.fue && a.personas > 0)
      .map((a) => ({
        tarea,
        personas: a.personas,
        horaDesde: a.horaDesde,
        horaHasta: a.horaHasta,
        cuadrillaId: a.cuadrillaId,
      })),
    apoyos: apoyos.map((a) => ({ asignacionId: a.asignacionId, fue: a.fue })),
  };
}
