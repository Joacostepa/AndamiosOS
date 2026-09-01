// Agrupación de asignaciones en "bloques" y colocación en la grilla semanal.
//
// Una obra de varias jornadas son N registros de asignación (uno por día). En el
// tablero se ven como UNA sola tarjeta que abarca las celdas contiguas: se arrastra
// completa y se mueven todos sus días juntos. Este módulo hace esa traducción.
//
// REGLA DE NEGOCIO: las obras se planifican en días corridos y el domingo no se
// trabaja, así que "el día siguiente" saltea el domingo. La discontinuidad real se
// registra después en los partes diarios, no acá.

import { addDays, format, parseISO } from "date-fns";
import type {
  AsignacionTablero,
  DatosTarea,
  EstadoAsignacion,
  OrigenAsignacion,
} from "./tipos";

export function esDomingo(fecha: string): boolean {
  return parseISO(fecha).getDay() === 0;
}

/** Día laboral siguiente (saltea domingo). */
export function siguienteDiaLaboral(fecha: string): string {
  const d = addDays(parseISO(fecha), 1);
  return format(d.getDay() === 0 ? addDays(d, 1) : d, "yyyy-MM-dd");
}

/**
 * ¿`b` sigue a `a` sin hueco? El domingo no cuenta como hueco —una obra de viernes a
 * lunes es continua— pero si ESE domingo se trabajó, tampoco lo corta: vale tanto el día
 * calendario siguiente como el día laboral siguiente.
 */
export function sonContiguas(a: string, b: string): boolean {
  return b === format(addDays(parseISO(a), 1), "yyyy-MM-dd") || b === siguienteDiaLaboral(a);
}

/**
 * Las N fechas corridas que ocuparía una obra que arranca en `inicio`.
 *
 * `permitirDomingo` sólo habilita ARRANCAR en domingo, y se pasa únicamente cuando el
 * drop cayó sobre una columna de domingo ya activa (la canaleta colapsada no acepta
 * drop). Los días siguientes siguen salteando el domingo: que a veces se trabaje el
 * domingo no lo vuelve un día laboral por defecto, y una obra de 4 jornadas soltada un
 * jueves no debería comerse el fin de semana sola.
 */
export function fechasDeJornadas(
  inicio: string,
  n: number,
  opts: { permitirDomingo?: boolean } = {},
): string[] {
  const fechas: string[] = [];
  // Si el drop cae en domingo, la obra arranca el lunes — salvo que se pida lo contrario.
  let f =
    esDomingo(inicio) && !opts.permitirDomingo
      ? format(addDays(parseISO(inicio), 1), "yyyy-MM-dd")
      : inicio;
  for (let i = 0; i < n; i++) {
    fechas.push(f);
    f = siguienteDiaLaboral(f);
  }
  return fechas;
}

export type Bloque = {
  /** Estable mientras no cambien los ids: sirve de key de React y de id de drag. */
  key: string;
  ids: number[];
  /**
   * De qué base salieron sus días. Un bloque es siempre homogéneo —la clave de
   * agrupación separa obras de tareas— así que alcanza con mirarlo una vez para saber
   * a qué backend mandar la escritura.
   */
  origen: OrigenAsignacion;
  /** 0 en un bloque de tarea. */
  otId: number;
  /** Presente sólo cuando `origen` es "tarea". */
  tarea?: DatosTarea;
  cuadrillaId: number | null;
  /** Fechas del bloque, ordenadas y corridas. */
  fechas: string[];
  /** Parte diario de cada día, en el mismo orden que `ids` y `fechas`. null = abierto. */
  partes: (number | null)[];
  /** Fracción que ocupa por día (un bloque multi-jornada ocupa 1,00 en cada día). */
  fraccion: number;
  /** La fracción real de cada día, que es la que se edita y la que suma capacidad. */
  fraccionesPorDia: number[];
  estado: EstadoAsignacion;
  ordenDia: number;
  notas: string | null;
  multiDia: boolean;
};

/**
 * Agrupa las asignaciones de una misma OT y cuadrilla en tramos de días corridos.
 * Dos tramos separados de la misma OT (p. ej. lunes y jueves) dan dos bloques: cada
 * uno se arrastra por su cuenta.
 */
export function agruparBloques(asignaciones: AsignacionTablero[]): Bloque[] {
  const porGrupo = new Map<string, AsignacionTablero[]>();
  for (const a of asignaciones) {
    // Una tarea operativa se agrupa por su grupo_id, no por otId —que en ella es 0—:
    // si no, TODAS las tareas de una cuadrilla caerían en el mismo grupo y se leerían
    // como una sola tarjeta de varios días. El prefijo mantiene los dos espacios de id
    // separados: la obra 7 y la tarea 7 no son lo mismo.
    const propietario = a.tarea ? `t${a.tarea.grupoId}` : `o${a.otId}`;
    const k = `${propietario}:${a.cuadrillaId ?? "sin"}`;
    const lista = porGrupo.get(k);
    if (lista) lista.push(a);
    else porGrupo.set(k, [a]);
  }

  const bloques: Bloque[] = [];
  for (const lista of porGrupo.values()) {
    const ordenadas = [...lista].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id - b.id));
    let tramo: AsignacionTablero[] = [];

    const cerrar = () => {
      if (tramo.length === 0) return;
      const primera = tramo[0];
      bloques.push({
        // El prefijo va en la key porque es id de drag y key de React: sin él, la obra
        // y la tarea que compartieran número de id colisionarían en el DnD.
        key: `${primera.tarea ? "t" : "o"}${tramo.map((t) => t.id).join("-")}`,
        origen: (primera.origen ?? "ot") as OrigenAsignacion,
        tarea: primera.tarea,
        ids: tramo.map((t) => t.id),
        partes: tramo.map((t) => t.parteId),
        otId: primera.otId,
        cuadrillaId: primera.cuadrillaId,
        fechas: tramo.map((t) => t.fecha),
        fraccion: tramo.length > 1 ? 1 : primera.fraccion,
        fraccionesPorDia: tramo.map((t) => t.fraccion),
        // Un bloque es tentativo mientras alguno de sus días lo sea.
        estado: tramo.every((t) => t.estado === "confirmada") ? "confirmada" : "tentativa",
        ordenDia: primera.ordenDia,
        notas: primera.notas,
        multiDia: tramo.length > 1,
      });
      tramo = [];
    };

    for (const a of ordenadas) {
      const previa = tramo[tramo.length - 1];
      // Corta por hueco en el calendario Y por cambio de fracción.
      //
      // Lo segundo es por la altura: una tarjeta es UN rectángulo, y desde que el alto
      // dice cuánto ocupa la jornada no puede medir alto el lunes y bajo el miércoles.
      // Una obra de 2,5 jornadas se guarda como [1, 1, ½] y ahora se ve como lo que es:
      // una tarjeta de dos días llena y otra de media. El costo es que esos dos tramos
      // se arrastran por separado; en cinco meses de datos hay UNA obra así.
      if (previa && (!sonContiguas(previa.fecha, a.fecha) || previa.fraccion !== a.fraccion)) {
        cerrar();
      }
      tramo.push(a);
    }
    cerrar();
  }

  return bloques;
}

export type Colocacion = {
  /** Índice (0-based) de la primera columna visible que ocupa el bloque. */
  colInicio: number;
  /** Cantidad de columnas visibles que abarca. */
  span: number;
  /** El bloque empieza antes / termina después del rango visible. */
  vieneDeAntes: boolean;
  sigueDespues: boolean;
};

/**
 * Ubica un bloque sobre las columnas visibles. Si el domingo está oculto, un bloque
 * de viernes a lunes abarca tres columnas contiguas (vie, sáb, lun): el span se mide
 * sobre lo que se ve, no sobre el calendario.
 * Devuelve null si el bloque no toca el rango visible.
 */
export function colocarBloque(fechas: string[], fechasVisibles: string[]): Colocacion | null {
  const indices = fechas
    .map((f) => fechasVisibles.indexOf(f))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  if (indices.length === 0) return null;

  const colInicio = indices[0];
  const colFin = indices[indices.length - 1];
  return {
    colInicio,
    span: colFin - colInicio + 1,
    vieneDeAntes: fechas[0] < fechasVisibles[0],
    sigueDespues: fechas[fechas.length - 1] > fechasVisibles[fechasVisibles.length - 1],
  };
}

/**
 * Alto mínimo de una tarjeta, en fracción de jornada.
 *
 * La escala de fracciones va de 0,10 a 1: diez veces. Proporcional puro, con la celda en
 * 96px, una jornada "mín" mediría 9px y no entraría ni la dirección — y el 16% de las
 * jornadas son de ¼ o menos. Por debajo de este piso la altura deja de ser proporcional
 * y el glifo (¼, mín) es el que distingue. Vale un cuarto de celda a propósito:
 * así las cuatro tarjetas del día más cargado que existe en los datos entran justas sin
 * comprimir nada. Es una mentira consciente y acotada: sin ella
 * el 16% de las tarjetas serían ilegibles, que es peor que no poder distinguir ¼ de mín.
 */
const PISO_ALTO = 0.25;

export type Ubicacion = {
  bloque: Bloque;
  colocacion: Colocacion;
  /** Desde dónde arranca, en fracción de jornada (0 = borde de arriba de la celda). */
  top: number;
  /** Cuánto mide, en fracción de jornada. */
  alto: number;
};

/**
 * Ubica los bloques de una fila con ALTURA PROPORCIONAL A LA FRACCIÓN.
 *
 * LA CELDA VALE 1,00 JORNADA y las tarjetas se reparten adentro: una jornada completa la
 * llena, media ocupa la mitad, y el hueco que queda se ve. Antes todas medían lo mismo y
 * la única diferencia era un glifo de 9px en la esquina — el canal más débil que hay para
 * un dato que se mira todo el tiempo, y una de cada cuatro jornadas es parcial.
 *
 * El orden de apilado sigue representando el orden previsto del día (x_orden_dia), igual
 * que cuando esto repartía carriles.
 *
 * La fila NO CRECE cuando un día se pasa de 1,00 (pasa en el 20% de las celdas, con un
 * máximo visto de 3,00): las tarjetas se comprimen para entrar y la celda ya se marca en
 * rojo. Es el mismo criterio que el riel de ocupación —"pasado el 100% importa QUE se
 * pasó, no cuánto"— y mantiene todas las filas de la misma altura, que es lo que permite
 * comparar cuadrillas sin scrollear.
 *
 * Devuelve todo en fracciones de jornada, no en píxeles: cuánto mide una jornada en
 * pantalla lo decide la grilla.
 */
export function repartirPorAltura(bloques: Bloque[], fechasVisibles: string[]): Ubicacion[] {
  const ubicados = bloques
    .map((bloque) => ({ bloque, colocacion: colocarBloque(bloque.fechas, fechasVisibles) }))
    .filter((x): x is { bloque: Bloque; colocacion: Colocacion } => x.colocacion !== null)
    .sort(
      (a, b) =>
        a.colocacion.colInicio - b.colocacion.colInicio ||
        a.bloque.ordenDia - b.bloque.ordenDia ||
        a.bloque.ids[0] - b.bloque.ids[0],
    );

  const columnasDe = (c: Colocacion) =>
    Array.from({ length: c.span }, (_, i) => c.colInicio + i);

  // 1. Alto que le tocaría a cada uno por su fracción, con el piso aplicado.
  const natural = ubicados.map(({ bloque }) => Math.max(bloque.fraccion, PISO_ALTO));

  // 2. Cuánto se pide en cada columna. Si un día pide más de una jornada, todo lo de ESE
  //    día se comprime por igual. Se calcula por columna y no por fila entera para que un
  //    lunes sobreasignado no achique también la tarjeta del viernes.
  const pedido = new Map<number, number>();
  ubicados.forEach(({ colocacion }, i) => {
    for (const c of columnasDe(colocacion)) pedido.set(c, (pedido.get(c) ?? 0) + natural[i]);
  });

  // 3. Un bloque de varios días toma la compresión MÁS FUERTE de los días que toca: tiene
  //    que entrar en todos, y es un solo rectángulo.
  const alto = ubicados.map(({ colocacion }, i) => {
    const escala = Math.min(
      1,
      ...columnasDe(colocacion).map((c) => 1 / Math.max(1, pedido.get(c) ?? 1)),
    );
    return natural[i] * escala;
  });

  // 4. Apilado: cada bloque baja hasta el primer hueco libre entre los que comparten
  //    alguna columna con él. Es lo mismo que hacían los carriles, pero con alturas
  //    distintas en vez de con casilleros iguales.
  const puestos: { columnas: number[]; top: number; alto: number }[] = [];
  const tops = ubicados.map(({ colocacion }, i) => {
    const columnas = columnasDe(colocacion);
    const vecinos = puestos.filter((p) => p.columnas.some((c) => columnas.includes(c)));
    // Candidatos: el borde de arriba y el pie de cada vecino. Gana el primero donde entre.
    const candidatos = [0, ...vecinos.map((v) => v.top + v.alto)].sort((a, b) => a - b);
    const libre = (top: number) =>
      vecinos.every((v) => top + alto[i] <= v.top + 1e-6 || top >= v.top + v.alto - 1e-6);
    const top = candidatos.find(libre) ?? candidatos[candidatos.length - 1];
    puestos.push({ columnas, top, alto: alto[i] });
    return top;
  });

  // 5. Red de seguridad: si el apilado igual se pasó del alto de la celda —puede pasar con
  //    bloques de varios días que no encajan perfecto— se baja todo a escala. La fila
  //    nunca crece.
  const fondo = Math.max(1, ...tops.map((t, i) => t + alto[i]));
  const ajuste = fondo > 1 ? 1 / fondo : 1;

  return ubicados.map(({ bloque, colocacion }, i) => ({
    bloque,
    colocacion,
    top: tops[i] * ajuste,
    alto: alto[i] * ajuste,
  }));
}
