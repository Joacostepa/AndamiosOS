// Guardias: dónde van, quién las puede usar y cómo se cuentan. TODO PURO.
//
// Ver docs/tablero-planificacion/guardias-contrato.md (manda) y guardias-plan-tecnico.md.
//
// POR QUÉ PURO, igual que planearCorrimiento: la misma función decide en la corrida del
// viernes (servidor), en la ruta que valida el candado (servidor) y en el tablero antes de
// soltar (navegador). Si cada lado lo calculara por su cuenta, el tablero ofrecería "usar la
// guardia" y el servidor la rechazaría, o al revés. Y es la única parte de esto que se puede
// revisar leyéndola: "¿por qué el jueves a la C3?" tiene que tener una respuesta en este
// archivo, no en una IA ni en una consulta.
//
// NO TOCA ODOO, NI SUPABASE, NI REACT, NI LA RED. Recibe el tablero ya leído y devuelve
// decisiones. Los imports de código van con ruta relativa y extensión .ts (como
// corrimiento.ts) para que `npm test` los cargue sin el alias "@/".
//
// LO QUE NO DECIDE ESTE ARCHIVO: la lluvia. Que el corrimiento consuma la guardia vive en
// corrimiento.ts, que es donde se arma la cascada.
//
// Las firmas son las que dejó el arquitecto el 18/10 (las usan la pantalla y las rutas en
// paralelo); los tests de cada regla están en guardias.test.ts.

import {
  DIAS_DE_RANURA,
  DIAS_HABILES_URGENCIA,
  DIAS_INDICADOR,
  GUARDIAS_POR_SEMANA,
  HORA_RELLENO,
  TEXTO_GUARDIA_CAPATAZ,
  TIPO_GUARDIA,
} from "./guardias-tipos.ts";
import {
  anteriorDiaHabil,
  diaDeSemana,
  diaIso,
  diasHabilesEntre,
  fechaBADeOdoo,
  hoyBA,
  instanteBA,
  lunesDe,
  proximosDiasHabiles,
  siguienteDiaHabil,
  sumarDias,
  type Feriados,
} from "./dias-habiles.ts";
import { evaluarComodines } from "./comodines.ts";
import type {
  AvanceArmado,
  CandidatoRelleno,
  CuentaConGuardias,
  DecisionCandado,
  GuardiaAPoner,
  GuardiaResumen,
  LugarProtegido,
  OtParaCandado,
  RanuraGuardia,
  ResultadoColocacion,
  TareaParaCapataz,
  TipoSolicitud,
  UsoGuardia,
} from "./guardias-tipos";
import type { AsignacionTablero, CuadrillaTablero, OtTablero, ProgresoOt } from "./tipos";

// ─── Reconocerlas ──────────────────────────────────────────────────────────────────────

/** ¿Es una guardia (activa) en el payload del tablero? Las demás no viajan ahí. */
export function esGuardia(a: Pick<AsignacionTablero, "origen" | "tarea">): boolean {
  return a.origen === "tarea" && a.tarea?.tipo === TIPO_GUARDIA;
}

/** Clave de una celda, la misma en todo el módulo: "cuadrilla|fecha". */
export function claveCelda(cuadrillaId: number | null, fecha: string): string {
  return `${cuadrillaId ?? "sin"}|${fecha}`;
}

/** Las guardias activas que pisan estas jornadas (misma cuadrilla y mismo día). */
export function guardiasPisadas(
  jornadas: readonly { cuadrillaId: number | null; fecha: string }[],
  activas: readonly GuardiaResumen[],
): GuardiaResumen[] {
  const celdas = new Set(jornadas.map((j) => claveCelda(j.cuadrillaId, j.fecha)));
  return activas.filter((g) => g.estado === "activa" && celdas.has(claveCelda(g.cuadrillaId, g.fecha)));
}

/** Cuadrillas que pueden llevar guardia: activas (ya vienen así) y NO tercerizadas. La C5 nunca. */
export function esCuadrillaPropia(c: Pick<CuadrillaTablero, "tercerizada">): boolean {
  return !c.tercerizada;
}

/**
 * El número de la cuadrilla para desempatar la rotación ("la de menor número"): sale del
 * nombre ("CUADRILLA 3" → 3). Sin número en el nombre, el id: ordena igual y no inventa.
 */
export function numeroDeCuadrilla(c: Pick<CuadrillaTablero, "id" | "nombre">): number {
  const m = /(\d+)/.exec(c.nombre);
  return m ? Number(m[1]) : c.id;
}

/** "C3": cómo se nombra una cuadrilla en los avisos cortos. */
export function siglaCuadrilla(c: Pick<CuadrillaTablero, "id" | "nombre">): string {
  return `C${numeroDeCuadrilla(c)}`;
}

/**
 * Desde cuándo un comodín rellena esta guardia sin pedir nada: las 13 h (Argentina) del día
 * hábil anterior. Devuelve el instante en ISO UTC.
 */
export function aperturaRelleno(fechaGuardia: string, feriados: Feriados): string {
  return instanteBA(anteriorDiaHabil(fechaGuardia, feriados), HORA_RELLENO);
}

// ─── Cómo se nombran los días en los textos ────────────────────────────────────────────
//
// Los avisos y el "por qué está ahí" los lee una persona apurada: "mar 03/11", "el
// jueves". Van acá y no en un módulo de fechas genérico porque son el vocabulario de ESTOS
// textos (los del tablero dicen "Mar 3" y los de la Hoja otra cosa).

const DIA_CORTO = ["", "lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const DIA_LARGO = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/** "03/11". */
export function ddmm(fecha: string): string {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
}

/** "mar 03/11": el día como lo dicen los avisos. */
export function diaCorto(fecha: string): string {
  return `${DIA_CORTO[diaIso(fecha)]} ${ddmm(fecha)}`;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** Une "a", "b" y "c" como se dice: "a, b y c". */
function enumerar(partes: readonly string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

// ─── Cómo se cuentan en la grilla ──────────────────────────────────────────────────────

/**
 * Lo ocupado y lo libre de un grupo de celdas, con las guardias APARTE: la guardia ocupa
 * capacidad (no está libre) pero no es trabajo, así que el encabezado dice "libre 0 ·
 * guardia 1" y la fila "5 de 6 j + 1 guardia". `capacidad` = cuántas jornadas caben (1 por
 * celda que se cuenta).
 */
export function cuentaConGuardias(
  asignaciones: readonly Pick<AsignacionTablero, "origen" | "tarea" | "fraccion">[],
  capacidad: number,
): CuentaConGuardias {
  let ocupado = 0;
  let guardias = 0;
  for (const a of asignaciones) {
    if (esGuardia(a)) guardias++;
    else ocupado += a.fraccion;
  }
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { ocupado: r(ocupado), libre: r(Math.max(0, capacidad - ocupado - guardias)), guardias };
}

// ─── Dónde van (la corrida del viernes y correrlas dentro de la semana) ───────────────

/** La grilla, como la necesitan las reglas de lugar. */
export type GrillaGuardias = {
  /**
   * Obras (principales y apoyos), tareas y guardias activas. Para saber si un día está "en
   * medio de una obra de varios días" tiene que traer también el día hábil anterior y el
   * siguiente al rango que se mira.
   */
  asignaciones: readonly AsignacionTablero[];
  /** Activas. Las que no llevan guardia se filtran con esCuadrillaPropia. */
  cuadrillas: readonly CuadrillaTablero[];
  feriados: Feriados;
  /** claveCelda(cuadrillaId, fecha) de los días suspendidos (plan_suspensiones). */
  suspendidas: ReadonlySet<string>;
  /** Hoy en Buenos Aires. Nada va en un día pasado. */
  hoy: string;
};

/** Lo que hay en una celda, sin la guardia que se está corriendo (si se pasa su id). */
function enCelda(
  asignaciones: readonly AsignacionTablero[],
  cuadrillaId: number,
  fecha: string,
  ignorarId?: number,
): AsignacionTablero[] {
  return asignaciones.filter(
    (a) =>
      a.cuadrillaId === cuadrillaId &&
      a.fecha === fecha &&
      // Los ids de las tareas y los de Odoo son dos espacios distintos: la guardia 7 y la
      // asignación 7 no son lo mismo. Por eso se ignora sólo la TAREA con ese id.
      !(ignorarId != null && a.origen === "tarea" && a.id === ignorarId),
  );
}

/** Las obras (de Odoo, principales o apoyos) que esa cuadrilla tiene ese día. */
function obrasDelDia(asignaciones: readonly AsignacionTablero[], cuadrillaId: number, fecha: string): Set<number> {
  const ots = new Set<number>();
  for (const a of asignaciones) {
    if ((a.origen ?? "ot") === "ot" && a.otId && a.cuadrillaId === cuadrillaId && a.fecha === fecha) ots.add(a.otId);
  }
  return ots;
}

/**
 * ¿Puede ir una guardia en esta celda? null si sí; si no, el motivo en castellano.
 *
 * "Dónde no van nunca" (contrato §1.2): una celda que no esté TOTALMENTE libre (sin
 * asignación, sin tarea, sin apoyo); en medio de una obra de varios días de esa cuadrilla
 * (el día hábil anterior y el siguiente tienen la misma OT); domingo, feriado o día
 * suspendido; una jornada ya cerrada o pasada (fecha < hoy); una cuadrilla tercerizada.
 *
 * `ignorarId`: la propia guardia, cuando se la corre (su celda de origen no cuenta como ocupada).
 *
 * EL ORDEN DE LAS PREGUNTAS ES EL DEL MOTIVO MÁS ÚTIL: "es feriado" explica más que "la
 * celda está ocupada" (que en un feriado casi nunca lo está), y el aviso del viernes junta
 * estos motivos para decir por qué no entró una guardia.
 *
 * "Jornada ya cerrada" no necesita pregunta propia: una jornada cerrada tiene su parte
 * colgado de una asignación, así que la celda ya no está libre; y una pasada (fecha < hoy)
 * se rechaza antes. Hoy SÍ vale: la celda de hoy todavía se puede proteger.
 */
export function motivoCeldaNoApta(
  grilla: GrillaGuardias,
  celda: { cuadrillaId: number; fecha: string },
  ignorarId?: number,
): string | null {
  const c = grilla.cuadrillas.find((x) => x.id === celda.cuadrillaId);
  if (!c) return "Esa cuadrilla no está activa.";
  const sigla = siglaCuadrilla(c);
  if (!esCuadrillaPropia(c)) return `La ${sigla} es tercerizada: no lleva guardias.`;
  const dia = diaCorto(celda.fecha);
  if (celda.fecha < grilla.hoy) return `El ${dia} ya pasó.`;
  if (diaIso(celda.fecha) === 7) return "El domingo no se trabaja.";
  if (grilla.feriados.has(celda.fecha)) return `El ${dia} es feriado.`;
  if (grilla.suspendidas.has(claveCelda(celda.cuadrillaId, celda.fecha))) {
    return `La ${sigla} tiene suspendido el ${dia}.`;
  }
  if (enCelda(grilla.asignaciones, celda.cuadrillaId, celda.fecha, ignorarId).length > 0) {
    return `La ${sigla} ya tiene algo el ${dia}: una guardia va sólo en una jornada totalmente libre.`;
  }
  // En medio de una obra de varios días: la cuadrilla la dejaría a mitad y volvería al día
  // siguiente. Se mira el día HÁBIL de cada lado (un feriado o el domingo en el medio no
  // cortan la obra), y cuentan también los apoyos: la cuadrilla igual está en esa obra.
  const antes = obrasDelDia(grilla.asignaciones, celda.cuadrillaId, anteriorDiaHabil(celda.fecha, grilla.feriados));
  if (antes.size > 0) {
    const despues = obrasDelDia(grilla.asignaciones, celda.cuadrillaId, siguienteDiaHabil(celda.fecha, grilla.feriados));
    for (const ot of despues) {
      if (antes.has(ot)) return `El ${dia} queda en medio de una obra de varios días de la ${sigla}.`;
    }
  }
  return null;
}

/** Lo que la corrida del viernes sabe de una semana. */
export type EntradaColocacion = GrillaGuardias & {
  /** El lunes de la semana a cubrir. */
  semana: string;
  /** Las guardias de esa semana en CUALQUIER estado (las sacadas ocupan su ranura: no se reponen). */
  guardiasSemana: readonly GuardiaResumen[];
  /**
   * Guardias no sacadas por cuadrilla en las SEMANAS_ROTACION semanas anteriores a `semana`,
   * incluidas las que esta misma corrida acaba de poner en la semana +1 (se cubre +1 y
   * después +2, y la rotación tiene que verlas).
   */
  rotacion: ReadonlyMap<number, number>;
};

/** El nombre de la ranura, por su día preferido: "la del martes", "la del jueves". */
function nombreRanura(ranura: RanuraGuardia): string {
  return DIA_LARGO[DIAS_DE_RANURA[ranura][0]];
}

/**
 * La regla del viernes (contrato §1.2), para UNA semana. Nunca mueve nada: sólo elige
 * celdas libres.
 *
 *   · 2 por semana (ranuras 1 y 2) salvo las que ya estén (cualquier estado);
 *   · ranura 1 el martes, si no miércoles, si no lunes; ranura 2 el jueves, si no
 *     miércoles, si no viernes (DIAS_DE_RANURA); nunca las dos el mismo día;
 *   · cuadrillas propias, como mucho una guardia por cuadrilla por semana;
 *   · entre las que tienen lugar ese día, la que menos guardias tuvo (rotacion); empate, la
 *     de menor número (numeroDeCuadrilla);
 *   · `porQue` en una línea ("Semana del 02/11: el jueves le tocaba a la C3 por rotación").
 *     Si cayó en un día de repuesto, lo dice ("el martes no había lugar").
 *   · lo que no entra va a `faltan` con el motivo, para el aviso y el indicador en ámbar.
 *
 * LA RANURA 1 ELIGE PRIMERO, y es a propósito aunque a veces le quite el miércoles a la 2:
 * es el orden que fijó el contrato y es el que se puede explicar en una línea. Buscar la
 * combinación "óptima" de las dos daría guardias que nadie sabe por qué están donde están.
 *
 * Una SACADA ocupa su ranura (no se repone: lo decidió JS) pero no ocupa día ni cuadrilla:
 * ya no es una guardia. Las usadas y rellenadas sí: fueron la guardia de esa semana.
 */
export function planearGuardiasSemana(e: EntradaColocacion): ResultadoColocacion {
  const ranuras: RanuraGuardia[] = [1, 2];
  const ocupadas = new Set(e.guardiasSemana.map((g) => g.ranura));
  const resultado: ResultadoColocacion = {
    semana: e.semana,
    poner: [],
    faltan: [],
    yaEstaban: ranuras.filter((r) => ocupadas.has(r)),
  };
  const libres = ranuras.filter((r) => !ocupadas.has(r)).slice(0, GUARDIAS_POR_SEMANA);
  if (libres.length === 0) return resultado;

  // La semana en curso nunca: lo que falta esta semana ya se vendió o se vende hoy, y una
  // guardia que aparece de golpe para mañana no protege nada (sólo le saca lugar a alguien).
  if (e.semana <= lunesDe(e.hoy)) {
    for (const ranura of libres) {
      resultado.faltan.push({ ranura, motivo: "es la semana en curso: las guardias se ponen con una semana de anticipación por lo menos" });
    }
    return resultado;
  }

  const vivas = e.guardiasSemana.filter((g) => g.estado !== "sacada");
  const diasTomados = new Set(vivas.map((g) => g.fecha));
  const cuadrillasTomadas = new Set(vivas.map((g) => g.cuadrillaId));
  const propias = e.cuadrillas.filter(esCuadrillaPropia);
  const rot = (c: CuadrillaTablero) => e.rotacion.get(c.id) ?? 0;
  const cabeza = `Semana del ${ddmm(e.semana)}`;

  for (const ranura of libres) {
    const descartes: string[] = [];
    let puesta: GuardiaAPoner | null = null;
    for (const iso of DIAS_DE_RANURA[ranura]) {
      const fecha = diaDeSemana(e.semana, iso);
      const nombre = DIA_LARGO[iso];
      if (diasTomados.has(fecha)) {
        descartes.push(`el ${nombre} ya tiene la otra guardia`);
        continue;
      }
      const conLugar = propias.filter((c) => motivoCeldaNoApta(e, { cuadrillaId: c.id, fecha }) === null);
      const candidatas = conLugar.filter((c) => !cuadrillasTomadas.has(c.id));
      if (candidatas.length === 0) {
        descartes.push(motivoDelDia(e, fecha, nombre, propias, conLugar));
        continue;
      }
      candidatas.sort(
        (a, b) => rot(a) - rot(b) || numeroDeCuadrilla(a) - numeroDeCuadrilla(b) || a.id - b.id,
      );
      const elegida = candidatas[0];
      const sigla = siglaCuadrilla(elegida);
      const quien =
        candidatas.length === 1
          ? `el ${nombre} la ${sigla} era la única con lugar`
          : `el ${nombre} le tocaba a la ${sigla} por rotación`;
      const previo = descartes.length > 0 ? `${descartes.join("; ")}; ` : "";
      puesta = { ranura, fecha, cuadrillaId: elegida.id, porQue: `${cabeza}: ${previo}${quien}.` };
      break;
    }
    if (puesta) {
      resultado.poner.push(puesta);
      diasTomados.add(puesta.fecha);
      cuadrillasTomadas.add(puesta.cuadrillaId);
    } else {
      resultado.faltan.push({ ranura, motivo: `la del ${nombreRanura(ranura)} no entró: ${enumerar(descartes)}` });
    }
  }
  return resultado;
}

/** Por qué un día no tiene ninguna celda para una guardia, en pocas palabras. */
function motivoDelDia(
  e: GrillaGuardias,
  fecha: string,
  nombre: string,
  propias: readonly CuadrillaTablero[],
  conLugar: readonly CuadrillaTablero[],
): string {
  if (propias.length === 0) return "no hay cuadrillas propias activas";
  if (e.feriados.has(fecha)) return `el ${nombre} es feriado`;
  if (fecha < e.hoy) return `el ${nombre} ya pasó`;
  if (conLugar.length > 0) {
    const siglas = conLugar.map(siglaCuadrilla);
    return `el ${nombre} sólo había lugar en ${plural(siglas.length, "la", "las")} ${enumerar(siglas)}, que ya ${plural(siglas.length, "tiene", "tienen")} su guardia`;
  }
  return `el ${nombre} no había ninguna jornada libre`;
}

/**
 * ¿Se puede correr la guardia a esta celda? (contrato §1.3, punto 5). null si sí.
 *
 * Misma semana (mismo lunes), otro día u otra cuadrilla propia, y las mismas reglas de
 * motivoCeldaNoApta. Además, como en la colocación: no el mismo día que la otra guardia
 * no sacada de la semana, ni en una cuadrilla que ya tiene otra guardia no sacada esa semana.
 */
export function destinoValidoGuardia(
  grilla: GrillaGuardias,
  guardia: GuardiaResumen,
  destino: { cuadrillaId: number; fecha: string },
  otrasDeLaSemana: readonly GuardiaResumen[],
): string | null {
  if (guardia.estado !== "activa") return "Esa guardia ya no está activa: no se puede correr.";
  if (guardia.fecha < grilla.hoy) return "Esa guardia es de un día que ya pasó.";
  if (destino.cuadrillaId === guardia.cuadrillaId && destino.fecha === guardia.fecha) return "La guardia ya está ahí.";
  // A HOY NO (revisión de seguridad del 18/10). Una guardia corrida a hoy a la tarde no la
  // usa nadie y la corrida de las 13 h la cierra como depósito: sería sacarla sin JS, y esa
  // semana no se repone. Hoy sí vale para COLOCARLA (motivoCeldaNoApta), no para correrla.
  if (destino.fecha <= grilla.hoy) return "Una guardia se corre a un día que todavía no empezó: hoy ya no.";
  // La semana es la de la guardia y no cambia nunca (la base lo exige con un CHECK): la
  // rotación y "dos por semana" se cuentan por semana, y correrla a otra desarmaría las dos.
  if (lunesDe(destino.fecha) !== guardia.semana) {
    return "Una guardia se corre sólo dentro de su semana.";
  }
  const motivo = motivoCeldaNoApta(grilla, destino, guardia.id);
  if (motivo) return motivo;
  for (const o of otrasDeLaSemana) {
    if (o.id === guardia.id || o.estado === "sacada") continue;
    if (o.fecha === destino.fecha) return `El ${diaCorto(destino.fecha)} ya tiene la otra guardia de la semana.`;
    if (o.cuadrillaId === destino.cuadrillaId) {
      const c = grilla.cuadrillas.find((x) => x.id === destino.cuadrillaId);
      return `La ${c ? siglaCuadrilla(c) : "cuadrilla"} ya tiene la otra guardia de esta semana.`;
    }
  }
  return null;
}

// ─── El candado ────────────────────────────────────────────────────────────────────────

/** Lo que el candado sabe de una obra que se quiere poner sobre una guardia. */
export type EntradaCandado = {
  guardia: GuardiaResumen;
  ot: OtParaCandado;
  /** La jornada que cae en la guardia es un apoyo (x_apoyo) a la principal de esa obra. */
  esApoyo: boolean;
  /** El avance del armado (para "apoyo a un armado atrasado"). null si no se sabe. */
  avance: AvanceArmado | null;
  /** Ahora (ISO). La hora importa: el comodín se libera a las 13 h del día hábil anterior. */
  ahora: string;
  feriados: Feriados;
  /** El comodín está en regla (piso, espera, duración): lo resuelve comodines.ts. */
  esComodin: boolean;
  /** Una solicitud aprobada por JS para esta guardia y esta OT, todavía sin usar. */
  aprobada?: TipoSolicitud | null;
};

/** El texto del 409 y del toast cuando hay que pedir: el contrato lo da casi literal. */
export const MENSAJE_OBRA_COMUN =
  "Esa jornada es una guardia: para usarla con una obra común hace falta la autorización de JS";

/** Qué uso deja una solicitud aprobada. "sacar" no es un uso: no habilita poner nada. */
const USO_APROBADO: Record<TipoSolicitud, UsoGuardia | null> = {
  obra_comun: "obra_comun",
  comodin_antes: "comodin",
  urgencia_fuera_regla: "urgencia",
  sacar: null,
};

/**
 * La duración con la que el CANDADO mira una obra: la MAYOR entre la estimación de Odoo y la
 * corrección de Operaciones (plan_jornadas_ot).
 *
 * POR QUÉ NO LA DEL PLAN A SECAS, como el resto del tablero: el plan lo escribe Planificación
 * (PUT /api/planificacion/jornadas-plan), que es justamente a quien el candado le pone el
 * límite. Bajarle a 1 la duración a un desarme de 3 j lo volvería comodín, y bajársela a un
 * armado en curso lo volvería "atrasado": dos maneras de abrir una guardia sin JS editando un
 * número. Con la mayor, corregir para ARRIBA (lo que de verdad pasa: la obra se alargó) sigue
 * valiendo, y corregir para abajo no abre nada. El costo: un desarme que Operaciones achicó a
 * 1 j no es comodín hasta que Comercial corrija la estimación en Odoo. Lo usan el tablero, la
 * ruta de usar, el 409 de las rutas comunes y la corrida de las 13 h: si cada uno mirara una
 * duración distinta, el tablero ofrecería "usar" y el servidor contestaría 409.
 */
export function duracionParaCandado(ot: OtTablero, plan?: number | null): number {
  return Math.max(ot.jornadas, plan ?? 0);
}

/**
 * Lo que el candado necesita de una OT del tablero. El tablero, la ruta que usa la guardia
 * y la corrida de las 13 h la arman igual: si cada una la armara a mano, una se olvidaría
 * de `creadaEl` y la urgencia dejaría de cumplir sólo de ese lado.
 */
export function otParaCandado(ot: OtTablero, duracion: number = ot.jornadas): OtParaCandado {
  return {
    id: ot.id,
    tipo: ot.tipo,
    estado: ot.estado,
    urgencia: ot.urgencia,
    creadaEl: ot.creadaEl ?? null,
    fechaDesde: ot.fechaDesde,
    jornadas: duracion,
  };
}

/**
 * ¿Planificación puede poner esta obra en esta guardia sin pedir nada? (contrato §1.3)
 *
 * En este orden:
 *   1. guardia que no está activa, o de un día pasado → { libre: false, pide: null };
 *   2. una solicitud aprobada → libre, con el uso que corresponde a lo que se pidió;
 *   3. apoyo (esApoyo) a un armado atrasado (armadoAtrasado) → uso 'atraso';
 *   4. urgencia alta o media y OT creada hace DIAS_HABILES_URGENCIA días hábiles o menos
 *      (urgenciaCumple) → uso 'urgencia'. Alta o media pero más vieja → pide
 *      'urgencia_fuera_regla' ("no era imprevista");
 *   5. comodín: desde aperturaRelleno → uso 'comodin'; antes → pide 'comodin_antes';
 *   6. cualquier otra → pide 'obra_comun'.
 *
 * `mensaje` va tal cual al toast y al 409: "Esa jornada es una guardia: para usarla con una
 * obra común hace falta la autorización de JS".
 *
 * UN MATIZ DEL PUNTO 4: una urgencia vieja que ADEMÁS es un comodín ya abierto (un desarme
 * de urgencia media que espera desde hace días) entra como comodín. La urgencia no cumple,
 * pero el comodín desde las 13 h no pide nada, y frenarlo por tener urgencia marcada
 * castigaría justo a la obra que más espera. Si el comodín todavía no abrió, lo que se pide
 * es la urgencia: es lo que la persona está alegando.
 */
export function evaluarCandado(e: EntradaCandado): DecisionCandado {
  const { guardia, ot } = e;
  if (guardia.estado !== "activa") {
    return { libre: false, pide: null, mensaje: "Esa guardia ya no está activa: refrescá el tablero." };
  }
  if (guardia.fecha < hoyBA(e.ahora)) {
    return { libre: false, pide: null, mensaje: "Esa guardia es de un día que ya pasó." };
  }

  const usoAprobado = e.aprobada ? USO_APROBADO[e.aprobada] : null;
  if (usoAprobado) return { libre: true, uso: usoAprobado, razon: "Lo autorizó JS." };

  if (e.esApoyo && armadoAtrasado(ot, e.avance)) {
    return { libre: true, uso: "atraso", razon: "Es un apoyo a un armado que se pasó de lo estimado." };
  }

  const urgente = ot.urgencia === "alta" || ot.urgencia === "media";
  if (urgente && urgenciaCumple(ot, e.ahora, e.feriados)) {
    return { libre: true, uso: "urgencia", razon: `Urgencia ${ot.urgencia} cargada hace ${DIAS_HABILES_URGENCIA} días hábiles o menos.` };
  }

  const apertura = aperturaRelleno(guardia.fecha, e.feriados);
  const comodinAbierto = e.esComodin && Date.parse(e.ahora) >= Date.parse(apertura);
  if (comodinAbierto) {
    return { libre: true, uso: "comodin", razon: "Es un comodín y ya pasaron las 13 h del día hábil anterior." };
  }

  if (urgente) {
    return {
      libre: false,
      pide: "urgencia_fuera_regla",
      mensaje: ot.creadaEl
        ? `Esa jornada es una guardia y esta urgencia no era imprevista (la OT se cargó hace más de ${DIAS_HABILES_URGENCIA} días hábiles): para usarla hace falta la autorización de JS`
        : "Esa jornada es una guardia y no se sabe cuándo se cargó la OT: para usarla con una urgencia hace falta la autorización de JS",
    };
  }

  if (e.esComodin) {
    const desde = anteriorDiaHabil(guardia.fecha, e.feriados);
    return {
      libre: false,
      pide: "comodin_antes",
      mensaje:
        `Esa jornada es una guardia: un comodín la rellena sin pedir nada desde las ${HORA_RELLENO} h del ${diaCorto(desde)}. ` +
        "Antes hace falta la autorización de JS",
    };
  }

  return { libre: false, pide: "obra_comun", mensaje: MENSAJE_OBRA_COMUN };
}

/**
 * Urgencia alta o media, y la OT se creó hace DIAS_HABILES_URGENCIA días hábiles o menos.
 *
 * "Hace cuántos días hábiles" se cuenta desde la fecha de Buenos Aires de la creación (Odoo
 * la guarda en UTC: una OT de las 22 h de acá ya es "mañana" en UTC). Creada el jueves, el
 * lunes todavía vale (viernes, sábado, lunes: 3). Sin `creadaEl` NO cumple: falla cerrado,
 * la decide JS.
 */
export function urgenciaCumple(ot: OtParaCandado, ahora: string, feriados: Feriados): boolean {
  if (ot.urgencia !== "alta" && ot.urgencia !== "media") return false;
  if (!ot.creadaEl) return false;
  const creada = fechaBADeOdoo(ot.creadaEl);
  return diasHabilesEntre(creada, hoyBA(ahora), feriados) <= DIAS_HABILES_URGENCIA;
}

/**
 * Un armado EN CURSO que ya se pasó de su duración estimada: tipo armado, estado en_proceso,
 * y ya se CERRARON tantos días como jornadas estimadas (y sigue en curso).
 *
 * SÓLO LO HECHO, NO LO PLANIFICADO. Antes contaba también "el plan ya tiene más días que lo
 * estimado" (`asignadas`), y eso lo podía provocar Planificación sola: agregarle un cuarto día
 * a un armado de tres —una celda libre cualquiera, sin pedir nada— lo volvía "atrasado" y desde
 * ahí cualquier apoyo de esa obra usaba cualquier guardia sin pasar por JS. El contrato habla
 * de un armado que "ya se pasó" de lo estimado: eso lo dicen los partes, no el plan.
 *
 * La estimación se redondea para arriba (un armado de 2,5 j se hace en 3 días) y tiene que
 * existir: con 0 jornadas cualquier armado estaría "atrasado" desde el primer día. La duración
 * que llega acá es la de duracionParaCandado (la mayor entre Odoo y el plan de Operaciones).
 */
export function armadoAtrasado(ot: OtParaCandado, avance: AvanceArmado | null): boolean {
  if (ot.tipo !== "armado" || ot.estado !== "en_proceso" || !avance) return false;
  const estimadas = Math.ceil(ot.jornadas);
  if (!(estimadas > 0)) return false;
  return avance.cerradas >= estimadas;
}

/**
 * La guardia activa más cercana (desde hoy) que esta OT puede usar: la primera libre según
 * evaluarCandado; si ninguna lo es, la más cercana con lo que habría que pedir. null si no
 * hay guardias activas por delante. Es lo que muestra "Meter urgente".
 */
export function guardiaMasCercanaPara(e: {
  ot: OtParaCandado;
  activas: readonly GuardiaResumen[];
  ahora: string;
  feriados: Feriados;
  esComodin: boolean;
  avance: AvanceArmado | null;
}): { guardia: GuardiaResumen; decision: DecisionCandado } | null {
  const hoy = hoyBA(e.ahora);
  const porDelante = e.activas
    .filter((g) => g.estado === "activa" && g.fecha >= hoy)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.cuadrillaId - b.cuadrillaId);
  let primeraPidiendo: { guardia: GuardiaResumen; decision: DecisionCandado } | null = null;
  for (const guardia of porDelante) {
    const decision = evaluarCandado({
      guardia,
      ot: e.ot,
      // "Meter urgente" habla de la obra, no de un apoyo: la guardia la recibe como principal.
      esApoyo: false,
      avance: e.avance,
      ahora: e.ahora,
      feriados: e.feriados,
      esComodin: e.esComodin,
    });
    if (decision.libre) return { guardia, decision };
    if (!primeraPidiendo && decision.pide) primeraPidiendo = { guardia, decision };
  }
  return primeraPidiendo;
}

// ─── El relleno de las 13 h ────────────────────────────────────────────────────────────

export type EntradaRelleno = {
  guardia: GuardiaResumen;
  ahora: string;
  feriados: Feriados;
  /** Desde hoy hasta, por lo menos, tres semanas adelante (las tentativas a adelantar). */
  asignaciones: readonly AsignacionTablero[];
  ots: ReadonlyMap<number, OtTablero>;
  progreso: ReadonlyMap<number, ProgresoOt>;
  cuadrillas: readonly CuadrillaTablero[];
  /** Duración vigente de una OT (la que fijó Operaciones si la corrigió). Por defecto ot.jornadas. */
  duracionDe?: (ot: OtTablero) => number;
};

/** Cuántas tentativas se ofrecen como mucho: más que eso ya no es un aviso, es un listado. */
const MAX_TENTATIVAS = 5;

/**
 * Los candidatos para rellenar una guardia que sigue libre, en el orden de la regla
 * (contrato §1.5): 1) apoyo a un armado atrasado; 2) comodín, primero el que más espera;
 * 3) adelantar una tentativa de las semanas siguientes si su piso lo permite (nunca antes
 * del piso; jornada de 1 o menos, o el primer día de una obra que entra sola); 4) depósito,
 * que SIEMPRE está al final. Sin IA: el orden lo da esto.
 *
 * Cada OT aparece una sola vez, en el primer grupo que la toma: un desarme de 1 j que es
 * comodín no se ofrece además como "adelantar una tentativa".
 */
export function candidatosRelleno(e: EntradaRelleno): CandidatoRelleno[] {
  const { guardia } = e;
  const hoy = hoyBA(e.ahora);
  const duracion = e.duracionDe ?? ((ot: OtTablero) => ot.jornadas);
  const siglaDe = (id: number | null) => {
    const c = id == null ? null : e.cuadrillas.find((x) => x.id === id);
    return c ? siglaCuadrilla(c) : "sin cuadrilla";
  };
  const donde = (fecha: string, cuadrillaId: number | null) => `${diaCorto(fecha)} ${siglaDe(cuadrillaId)}`;
  const usadas = new Set<number>();
  const salida: CandidatoRelleno[] = [];

  // 1. Apoyo a un armado atrasado que ESE día tiene su principal en otra cuadrilla: un apoyo
  //    va a ayudar a la principal, así que sin principal ese día no hay a quién ayudar. Si la
  //    cuadrilla de la guardia ya está de apoyo en esa obra, no se ofrece dos veces.
  const delDia = e.asignaciones.filter((a) => a.fecha === guardia.fecha && (a.origen ?? "ot") === "ot");
  const apoyos: { ot: OtTablero; cuadrillaId: number | null; avance: ProgresoOt }[] = [];
  for (const a of delDia) {
    if (a.apoyo === true || a.cuadrillaId === guardia.cuadrillaId || usadas.has(a.otId)) continue;
    const ot = e.ots.get(a.otId);
    const avance = e.progreso.get(a.otId);
    if (!ot || !avance || !armadoAtrasado(otParaCandado(ot, duracion(ot)), avance)) continue;
    const yaApoya = delDia.some((x) => x.otId === a.otId && x.cuadrillaId === guardia.cuadrillaId);
    if (yaApoya) continue;
    usadas.add(a.otId);
    apoyos.push({ ot, cuadrillaId: a.cuadrillaId, avance });
  }
  for (const { ot, cuadrillaId, avance } of apoyos) {
    salida.push({
      tipo: "apoyo",
      otId: ot.id,
      titulo: `Apoyo a ${ot.titulo}`,
      detalle: `armado con ${avance.cerradas} de ${Math.ceil(duracion(ot))} j estimadas ya cerradas; la principal va con la ${siglaDe(cuadrillaId)}`,
      desde: null,
    });
  }

  // 2. Comodines que pueden ir ese día (piso cumplido, no vencidos), el que más espera
  //    primero (evaluarComodines ya los ordena así). Uno que ya está en la grilla ANTES de la
  //    guardia no se ofrece: moverlo a la guardia sería atrasarlo, no rellenar.
  const comodines = evaluarComodines({
    ots: [...e.ots.values()],
    asignaciones: e.asignaciones,
    progreso: [...e.progreso.values()],
    hoy,
    feriados: e.feriados,
    duracionDe: e.duracionDe,
  });
  for (const c of comodines) {
    if (c.vencido || c.piso > guardia.fecha || usadas.has(c.otId)) continue;
    if (c.ubicacion && c.ubicacion.fecha <= guardia.fecha) continue;
    const ot = e.ots.get(c.otId);
    if (!ot) continue;
    usadas.add(c.otId);
    salida.push({
      tipo: "comodin",
      otId: c.otId,
      titulo: `Comodín ${ot.titulo}`,
      detalle:
        `espera ${c.espera} ${plural(c.espera, "día hábil", "días hábiles")} · ` +
        (c.ubicacion ? `hoy: ${donde(c.ubicacion.fecha, c.ubicacion.cuadrillaId)}` : "sin fecha"),
      desde: c.ubicacion,
    });
  }

  // 3. Tentativas de las semanas siguientes que entran en una jornada. Sólo tentativas (lo
  //    confirmado ya se le prometió al cliente), sin parte ni fijación, y nunca antes de su
  //    piso. "Entra sola": dura 1 j o menos, o es el único día que le queda en la grilla.
  const desdeSemana = sumarDias(lunesDe(guardia.fecha), 7);
  const principalesPorOt = new Map<number, AsignacionTablero[]>();
  for (const a of e.asignaciones) {
    if ((a.origen ?? "ot") !== "ot" || a.apoyo === true || a.parteId != null) continue;
    const lista = principalesPorOt.get(a.otId);
    if (lista) lista.push(a);
    else principalesPorOt.set(a.otId, [a]);
  }
  const tentativas = e.asignaciones
    .filter(
      (a) =>
        (a.origen ?? "ot") === "ot" &&
        a.apoyo !== true &&
        a.estado === "tentativa" &&
        a.parteId == null &&
        !a.motivoFija &&
        a.fecha >= desdeSemana,
    )
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
  let nTentativas = 0;
  for (const a of tentativas) {
    if (nTentativas >= MAX_TENTATIVAS) break;
    if (usadas.has(a.otId)) continue;
    const ot = e.ots.get(a.otId);
    if (!ot) continue;
    if (ot.fechaDesde && ot.fechaDesde > guardia.fecha) continue;
    const entraSola = duracion(ot) <= 1 || (principalesPorOt.get(a.otId)?.length ?? 0) === 1;
    if (!entraSola) continue;
    usadas.add(a.otId);
    nTentativas++;
    salida.push({
      tipo: "tentativa",
      otId: ot.id,
      titulo: `Adelantar ${ot.titulo}`,
      detalle: `hoy: ${donde(a.fecha, a.cuadrillaId)}${ot.fechaDesde ? ` · desde ${ddmm(ot.fechaDesde)}` : ""}`,
      desde: { fecha: a.fecha, cuadrillaId: a.cuadrillaId },
    });
  }

  // 4. Depósito, siempre, al final: es lo que pasa si nadie hace nada.
  salida.push({ tipo: "deposito", otId: null, titulo: "Depósito", detalle: "mantenimiento de material", desde: null });
  return salida;
}

/** Cuántos candidatos lista el aviso además del depósito. */
const MAX_EN_AVISO = 3;

/**
 * El aviso de las 13 h: "Mañana: guardia C3 libre. Para rellenar: …" con los candidatos
 * numerados (como mucho tres además del depósito).
 *
 * "MAÑANA" SÓLO SI ES MAÑANA. La corrida del sábado avisa la guardia del lunes (el día hábil
 * siguiente), y un "Mañana" leído el sábado hace pensar en el domingo. Con `hoy`, si la
 * guardia no es el día calendario siguiente, el título nombra el día ("Lun 20/10: guardia C3
 * libre"). Sin `hoy`, "Mañana" como antes.
 */
export function textoAvisoRelleno(
  guardia: GuardiaResumen,
  sigla: string,
  candidatos: readonly CandidatoRelleno[],
  hoy?: string,
): { titulo: string; descripcion: string } {
  const opciones = candidatos.filter((c) => c.tipo !== "deposito").slice(0, MAX_EN_AVISO);
  const lista = opciones.map((c, i) => `${i + 1}) ${c.titulo}${c.detalle ? ` (${c.detalle})` : ""}`);
  const partes = [
    `${diaCorto(guardia.fecha)}, ${sigla}.`,
    lista.length > 0 ? `Para rellenar: ${lista.join("; ")}.` : "No hay nada en la bandeja para rellenarla.",
    "Si no entra nada: Depósito.",
    `Desde las ${HORA_RELLENO} h un comodín la rellena sin pedir autorización.`,
  ];
  const cuando = hoy == null || sumarDias(hoy, 1) === guardia.fecha ? "Mañana" : mayuscula(diaCorto(guardia.fecha));
  return { titulo: `${cuando}: guardia ${sigla} libre`, descripcion: partes.join(" ") };
}

/**
 * El aviso del viernes: "Puse 2 guardias para la semana del 02/11: mar 03/11 C2, jue 05/11
 * C3". Si no pudo poner alguna, dice por qué. Una línea por semana cubierta.
 */
export function textoAvisoColocacion(
  resultados: readonly ResultadoColocacion[],
  sigla: (cuadrillaId: number) => string,
): { titulo: string; descripcion: string } {
  const cabezas: string[] = [];
  const lineas: string[] = [];
  for (const r of resultados) {
    const semana = `la semana del ${ddmm(r.semana)}`;
    const puestas = [...r.poner].sort((a, b) => a.fecha.localeCompare(b.fecha));
    let cabeza: string;
    if (puestas.length > 0) {
      const n = puestas.length;
      cabeza = `Puse ${n} ${plural(n, "guardia", "guardias")} para ${semana}`;
      cabeza += `: ${puestas.map((g) => `${diaCorto(g.fecha)} ${sigla(g.cuadrillaId)}`).join(", ")}`;
    } else if (r.faltan.length === 0) {
      cabeza = `${mayuscula(semana)} ya tenía sus guardias`;
    } else {
      cabeza = `No pude poner guardias para ${semana}`;
    }
    cabezas.push(cabeza);
    const motivos = r.faltan.map((f) => `${mayuscula(f.motivo)}.`);
    lineas.push([`${cabeza}.`, ...motivos].join(" "));
  }

  const puestas = resultados.reduce((s, r) => s + r.poner.length, 0);
  const faltan = resultados.reduce((s, r) => s + r.faltan.length, 0);
  let titulo: string;
  if (resultados.length === 1) {
    titulo = cabezas[0] ?? "Guardias";
  } else {
    const semanas = enumerar(resultados.map((r) => ddmm(r.semana)));
    titulo = `Guardias de las semanas del ${semanas}: puse ${puestas}`;
  }
  if (faltan > 0) titulo += ` · ${plural(faltan, "faltó 1", `faltaron ${faltan}`)}`;
  return { titulo, descripcion: lineas.join("\n") };
}

function mayuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── El indicador de arriba ────────────────────────────────────────────────────────────

/**
 * "Lugar protegido próximos 5 días hábiles: X de N j" (contrato §1.6). Mira DIAS_INDICADOR
 * días hábiles desde hoy (hoy incluido si es hábil). X = jornadas libres de cuadrillas
 * propias + guardias activas; N = las guardias puestas para esos días (no sacadas). Ámbar si
 * alguna no está activa o si alguna semana de esos días tiene menos de GUARDIAS_POR_SEMANA.
 *
 * X CUENTA LO LIBRE COMO "LIBRE": media celda libre suma 0,5. Es lo que de verdad queda
 * para lo imprevisto, protegido o no; la guardia es la parte que no se puede vender.
 *
 * Una SACADA hace faltar a su semana a propósito: la ranura no se repone (lo decidió JS),
 * pero el lugar protegido sí es menos, y el indicador tiene que decirlo.
 */
export function lugarProtegido(e: {
  hoy: string;
  feriados: Feriados;
  asignaciones: readonly AsignacionTablero[];
  /** Todas las activas; se filtran las propias. */
  cuadrillas: readonly CuadrillaTablero[];
  /** Las guardias de esos días y sus semanas, en cualquier estado. */
  guardias: readonly GuardiaResumen[];
}): LugarProtegido {
  const dias = proximosDiasHabiles(e.hoy, DIAS_INDICADOR, e.feriados);
  const enDias = new Set(dias);
  const propias = new Set(e.cuadrillas.filter(esCuadrillaPropia).map((c) => c.id));

  const porCelda = new Map<string, AsignacionTablero[]>();
  for (const a of e.asignaciones) {
    if (a.cuadrillaId == null || !propias.has(a.cuadrillaId) || !enDias.has(a.fecha)) continue;
    const k = claveCelda(a.cuadrillaId, a.fecha);
    const lista = porCelda.get(k);
    if (lista) lista.push(a);
    else porCelda.set(k, [a]);
  }
  let protegido = 0;
  for (const fecha of dias) {
    for (const cuadrillaId of propias) {
      const cuenta = cuentaConGuardias(porCelda.get(claveCelda(cuadrillaId, fecha)) ?? [], 1);
      protegido += cuenta.libre + cuenta.guardias;
    }
  }

  const esperadasLista = e.guardias.filter((g) => g.estado !== "sacada" && enDias.has(g.fecha));
  const activas = esperadasLista.filter((g) => g.estado === "activa").length;
  const semanas = new Set(dias.map(lunesDe));
  const falta = [...semanas].some(
    (s) => e.guardias.filter((g) => g.semana === s && g.estado !== "sacada").length < GUARDIAS_POR_SEMANA,
  );
  const esperadas = esperadasLista.length;
  return {
    dias,
    protegido: Math.round(protegido * 1000) / 1000,
    esperadas,
    activas,
    falta,
    nivel: activas === esperadas && !falta ? "gris" : "ambar",
  };
}

// ─── Lo que ve el capataz ──────────────────────────────────────────────────────────────

/**
 * Una tarea del tablero, como la recibe la cuadrilla (Hoja del día, pizarrón, Telegram).
 * La guardia activa (o rellenada con depósito) llega como "Depósito · mantenimiento de
 * material": la palabra "guardia" no sale de la oficina. Las tareas sin cuadrilla no van a
 * ninguna hoja (null). Una guardia usada por una obra tampoco (null): va la obra.
 */
export function tareaParaCapataz(
  a: Pick<AsignacionTablero, "id" | "origen" | "tarea" | "cuadrillaId" | "fraccion" | "notas">,
): TareaParaCapataz | null {
  if (a.origen !== "tarea" || !a.tarea || a.cuadrillaId == null) return null;
  if (a.tarea.tipo === TIPO_GUARDIA) {
    return { id: a.id, cuadrillaOdooId: a.cuadrillaId, titulo: TEXTO_GUARDIA_CAPATAZ, tipo: "deposito", fraccion: a.fraccion, notas: null };
  }
  return {
    id: a.id,
    cuadrillaOdooId: a.cuadrillaId,
    titulo: a.tarea.titulo,
    tipo: a.tarea.tipo,
    fraccion: a.fraccion,
    notas: a.notas,
  };
}
