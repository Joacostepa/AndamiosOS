// Correr un día entero: qué se mueve, qué se queda y qué se rompe.
//
// EL PROBLEMA: si la jornada arranca lloviendo se suspenden las obras del día y se
// posterga todo una jornada. A mano son treinta y pico de arrastres, uno por uno, un
// martes a las siete de la mañana. Esto lo hace de una.
//
// TODO EL CÁLCULO VIVE ACÁ Y ES PURO. No toca Odoo, ni React, ni la red: recibe el
// tablero y devuelve el plan completo. Por dos motivos:
//
//   · el diálogo muestra EXACTAMENTE lo que va a pasar antes de escribir nada, y como el
//     preview y la ejecución salen de la misma función no pueden discrepar;
//   · es la única parte de esto que se puede revisar leyéndola.
//
// LA REGLA, corta a propósito: lo único que no se mueve es lo que alguien fijó a mano y
// lo que ya tiene parte cargado. Todo lo demás se corre, y el daño colateral —las
// confirmadas que hay que avisar, las ventanas de cliente que se rompen, los días que
// quedan sobrecargados— se REPORTA, no se resuelve. Acomodar solo produciría un plan que
// nadie puede explicar; el que planifica mira la lista y decide.
//
// LAS TAREAS DE OPERACIONES NO SE CORREN. Viven en Supabase y no en Odoo, no se pueden
// fijar (así que no tendrían cómo quedarse), y son justamente lo que se hace cuando
// llueve: depósito, mantenimiento, capacitación. Sí cuentan para la carga del día —si una
// obra corrida cae encima de un traslado, el día aparece sobreasignado— y sí frenan la
// cascada, porque un día con una tarea es un día que la cuadrilla ya tiene tomado.
//
// LAS GUARDIAS SON LA EXCEPCIÓN A "SE SUMA" (guardias-contrato.md §1.4). Una guardia es una
// tarea (no se corre y frena la cascada, como cualquier tarea), pero lo que cae encima NO se
// suma: la CONSUME. Para eso existe: es la jornada que se reservó para lo que la lluvia
// empuja. La guardia pasa a "usada (lluvia)", su celda no aparece como sobrecargada y el
// deshacer la vuelve a "activa". Una guardia en el MISMO día suspendido no se toca: ese día
// no se trabaja, y la lluvia de hoy no consume la protección de hoy (se queda para lo que
// venga cuando escampe). Ver guardiasConsumidas.
//
// LAS CUADRILLAS DE APOYO VAN CON SU OBRA (apoyo.md, etapa 3). Un apoyo no se corre por la
// cadena de SU cuadrilla: se corre cuando se corre la principal de esa obra y ese día, al
// mismo día que ella, esté o no tildada la cuadrilla del apoyo. Si la principal NO se corre
// (su cuadrilla salió, o está fija) y la que se suspende es la del apoyo, el apoyo se QUITA
// —esa cuadrilla no va— y queda anotado en el historial con el motivo: "Thames 1820 se
// queda sin el apoyo de C3". El deshacer lo vuelve a crear. Dejarlo donde estaba diría que
// la C3 sale bajo la lluvia; correrlo solo lo dejaría colgado de un día sin su obra.

import { claveDia, esApoyo } from "./apoyo.ts";
import { esDomingo, siguienteDiaLaboral } from "./bloques.ts";
import { aFraccionStr } from "./fracciones.ts";
import { esGuardia } from "./guardias.ts";
import { violaTecho } from "./ventana.ts";
import type { EstadoBloque, RegistroApoyoCorrida, RegistroCorrida } from "./tipos-movimiento";
import type {
  AsignacionTablero,
  CuadrillaTablero,
  EstadoAsignacion,
  MovimientoAsignacion,
  NuevaAsignacion,
  OtTablero,
} from "./tipos";

/**
 * `dia`: se corre sólo lo de ese día, y el día siguiente queda con el doble.
 * `cascada`: se corre ese día y lo que sigue, hasta el primer día libre de cada cuadrilla.
 */
export type ModoCorrimiento = "dia" | "cascada";

/**
 * Tope de días que puede abarcar una cascada.
 *
 * No es una regla de negocio, es un cinturón: si una cuadrilla estuviera tomada sin un
 * solo hueco durante tres meses, el bucle no puede irse al infinito ni proponer mover
 * medio año por una lluvia. Cuando se toca, el diálogo lo dice (`truncado`) y el que
 * planifica decide si corre sólo el día.
 */
const TOPE_CASCADA = 60;

/** Una cuadrilla se queda con menos de esto y vale preguntarse si sale. Media jornada. */
const PISO_VALE_LA_PENA = 0.5;

export type LineaObra = { otId: number; titulo: string };

/**
 * Un apoyo que el corrimiento saca: su cuadrilla no sale el día suspendido y su principal
 * no se corre. Lleva todo lo que hace falta para volver a crearlo al deshacer, porque el
 * id se pierde con el borrado.
 */
export type ApoyoQuitado = LineaObra & {
  id: number;
  cuadrillaId: number;
  cuadrillaNombre: string;
  fecha: string;
  fraccion: number;
  estado: EstadoAsignacion;
  ordenDia: number;
  notas: string | null;
};

export type Corrimiento = {
  /** Lo que hay que escribir. Vacío = no hay nada para correr. */
  movimientos: MovimientoAsignacion[];
  /** Una fila de historial por obra y cuadrilla. */
  registros: RegistroCorrida[];
  /** Ids de los apoyos que se borran (ver ApoyoQuitado). */
  quitar: number[];
  /** Los mismos, para el diálogo y para el deshacer. */
  apoyosQuitados: ApoyoQuitado[];
  /** Una fila de historial por apoyo quitado, con la acción "quitar" y el motivo del lote. */
  registrosApoyo: RegistroApoyoCorrida[];
  /** Se quedan en su día. Es la lista que se lee bajo la lluvia. */
  fijas: (LineaObra & { fecha: string; motivo: string })[];
  /** Se movieron y tienen la fecha prometida al cliente: hay que llamar. */
  confirmadas: (LineaObra & { de: string; a: string })[];
  /** El corrimiento las empuja más allá de la fecha en que el cliente las pidió listas. */
  rompenTecho: (LineaObra & { termina: string; techo: string })[];
  /** Días que quedan pasados de una jornada. */
  sobrecargas: { cuadrillaId: number; cuadrillaNombre: string; fecha: string; carga: number }[];
  /** La cuadrilla se queda el día suspendido con casi nada: ¿la mandamos igual? */
  solas: { cuadrillaId: number; cuadrillaNombre: string; carga: number }[];
  /** Cuántas jornadas y cuántas obras distintas se mueven, para el botón. */
  jornadas: number;
  obras: number;
  /** Hasta qué día llega el corrimiento. null si no se mueve nada. */
  ultimoDia: string | null;
  /** La cascada se cortó por TOPE_CASCADA y no por haber encontrado lugar. */
  truncado: boolean;
  /**
   * La cascada llegó al borde de lo que el tablero tiene cargado y se frenó ahí.
   *
   * NO ES LO MISMO QUE HABER ENCONTRADO UN DÍA LIBRE, y es el único modo en que esta
   * función puede mentir: si una cuadrilla está tomada más allá del rango cargado, acá se
   * ve un hueco que no existe, y lo que se corre encima cae sobre trabajo que no se está
   * mirando. El que planifica tiene que enterarse y scrollear el tablero antes de correr.
   */
  alBorde: boolean;
  /**
   * Guardias que el corrimiento CONSUME (guardias-contrato.md §1.4): lo que cae sobre una
   * guardia activa la reemplaza —no se suma— y la guardia pasa a "usada (lluvia)". La
   * cascada ya se frena ahí sola (una guardia es una tarea: no hay nada movible que
   * empujar). El deshacer las vuelve a "activa" (invertirCorrimiento → reactivarGuardias).
   *
   * Es lo que VIO el tablero. La ruta no confía sólo en esto: vuelve a buscar guardias
   * activas en las celdas destino y consume las que encuentre (guardias-plan-tecnico.md §4.3).
   */
  guardiasConsumidas: GuardiaConsumida[];
};

/** Una guardia que el corrimiento consume. El id es el de su fila en tablero_tareas. */
export type GuardiaConsumida = {
  id: number;
  cuadrillaId: number;
  cuadrillaNombre: string;
  fecha: string;
  /** Las obras que caen sobre ella (para el diálogo: "Thames 1820 usa la guardia del jue 22"). */
  obras: LineaObra[];
};

export type EntradaCorrimiento = {
  asignaciones: AsignacionTablero[];
  ots: Map<number, OtTablero>;
  cuadrillas: CuadrillaTablero[];
  /** El día que se suspende. */
  dia: string;
  /** Qué cuadrillas se corren. Las que sí salieron se destildan y no entran. */
  cuadrillaIds: number[];
  modo: ModoCorrimiento;
  /**
   * Último día que el tablero tiene cargado. Lo que hay más allá no está en
   * `asignaciones`, así que un día vacío de ahí en adelante no significa nada. Ver
   * `alBorde`.
   */
  hastaCargado: string;
};

/** Una asignación que este gesto puede mover. */
function esMovible(a: AsignacionTablero): boolean {
  return (
    (a.origen ?? "ot") !== "tarea" &&
    !a.motivoFija &&
    a.parteId == null &&
    a.cuadrillaId !== null
  );
}

/**
 * Un apoyo se corre con su principal AUNQUE ESTÉ FIJO. La regla es una sola en todo el
 * tablero (apoyo.md: "el apoyo va con la obra"): mover la tarjeta y el editor de jornadas
 * ya arrastran al apoyo sin mirar la fijación, y el tablero no deja fijar un apoyo. Si el
 * corrimiento la respetara, la principal se iría al día siguiente y el apoyo quedaría
 * huérfano en el día viejo —y esta ruta no valida roles, así que quedaría escrito—. Una
 * fijación en un apoyo sólo puede venir de una edición a mano en Odoo. Con parte, no.
 */
function apoyoMovible(a: AsignacionTablero): boolean {
  return (a.origen ?? "ot") !== "tarea" && a.parteId == null && a.cuadrillaId !== null;
}

/**
 * Lo que la cadena de una cuadrilla empuja por sí misma: lo movible que NO es apoyo. El
 * apoyo se mueve con su principal (paso 2b), así que para la cascada de su cuadrilla
 * cuenta como lo fijo: ocupa el día, pero no hay nada que empujar.
 */
function esMoviblePropia(a: AsignacionTablero): boolean {
  return esMovible(a) && !esApoyo(a);
}

export function planearCorrimiento(entrada: EntradaCorrimiento): Corrimiento {
  const { asignaciones, ots, cuadrillas, dia, modo } = entrada;
  const enFoco = new Set(entrada.cuadrillaIds);
  const nombre = new Map(cuadrillas.map((c) => [c.id, c.nombre]));

  // Índice por cuadrilla y día. Se arma una vez: la cascada lo consulta día por día y sin
  // esto sería un recorrido del tablero entero por cada paso.
  const porCelda = new Map<string, AsignacionTablero[]>();
  const celda = (c: number | null, f: string) => `${c ?? "sin"}|${f}`;
  for (const a of asignaciones) {
    const k = celda(a.cuadrillaId, a.fecha);
    const lista = porCelda.get(k);
    if (lista) lista.push(a);
    else porCelda.set(k, [a]);
  }
  const enDia = (c: number, f: string) => porCelda.get(celda(c, f)) ?? [];
  const moviblesDe = (c: number, f: string) => enDia(c, f).filter(esMoviblePropia);

  // ── 1. Qué días se corren, por cuadrilla ───────────────────────────────────
  //
  // LA CADENA SE CALCULA CONTRA EL PLAN ORIGINAL y recién después se mueve todo junto. Si
  // se moviera día por día, lo que acaba de caer en el viernes se volvería a mover al
  // sábado: una obra de dos jornadas se correría dos días en vez de uno.
  //
  // EL FRENO es el primer día laboral siguiente que no tenga nada MOVIBLE. Un día vacío
  // absorbe el corrimiento, y uno que sólo tiene obras fijas o tareas también: no hay nada
  // que empujar más adelante, así que la cadena termina ahí y lo que viene después —la
  // semana que viene, el mes que viene— no se entera. Correr todo sin frenarse empujaría
  // trabajo de octubre por una lluvia de septiembre.
  let truncado = false;
  let alBorde = false;
  const cadenas = new Map<number, string[]>();
  for (const cuadrillaId of enFoco) {
    const cadena = [dia];
    if (modo === "cascada") {
      let d = dia;
      while (cadena.length < TOPE_CASCADA) {
        const sig = siguienteDiaLaboral(d);
        // El hueco que frena la cascada tiene que ser un hueco DE VERDAD. Más allá de lo
        // cargado no hay datos, así que todos los días parecen libres: ahí no se frena
        // porque haya lugar, se frena porque no se ve.
        if (sig > entrada.hastaCargado) {
          if (moviblesDe(cuadrillaId, d).length > 0) alBorde = true;
          break;
        }
        if (moviblesDe(cuadrillaId, sig).length === 0) break;
        cadena.push(sig);
        d = sig;
      }
      if (cadena.length >= TOPE_CASCADA) truncado = true;
    }
    cadenas.set(cuadrillaId, cadena);
  }

  // ── 2. Los movimientos ─────────────────────────────────────────────────────
  const movimientos: MovimientoAsignacion[] = [];
  const movidas: { a: AsignacionTablero; nueva: string }[] = [];
  const fijas: Corrimiento["fijas"] = [];

  for (const [cuadrillaId, cadena] of cadenas) {
    for (const fecha of cadena) {
      for (const a of enDia(cuadrillaId, fecha)) {
        // El apoyo no lo corre su cuadrilla: va con su principal (abajo), aunque tenga
        // una fijación (ver apoyoMovible).
        if (esApoyo(a)) continue;
        if (esMoviblePropia(a)) {
          const nueva = siguienteDiaLaboral(a.fecha);
          movimientos.push({ id: a.id, fecha: nueva });
          movidas.push({ a, nueva });
          continue;
        }
        // Lo que se queda y tiene motivo escrito es la lista que importa: son las
        // decisiones que alguien ya tomó y que hoy chocan con la lluvia. Lo que se queda
        // por tener parte cargado no se reporta: ya se ejecutó, no hay nada que decidir.
        if (a.motivoFija) {
          fijas.push({
            otId: a.otId,
            titulo: ots.get(a.otId)?.titulo ?? `OT ${a.otId}`,
            fecha: a.fecha,
            motivo: a.motivoFija,
          });
        }
      }
    }
  }

  // ── 2b. Los apoyos, detrás de su principal ─────────────────────────────────
  //
  // Se resuelven DESPUÉS de saber qué principales se mueven, contra el plan original: un
  // apoyo del jueves sigue a la principal del jueves aunque ésta haya caído en el viernes
  // por la cascada de otra cuadrilla.
  const destinoDePrincipal = new Map<string, string>();
  for (const { a, nueva } of movidas) {
    const k = claveDia(a.otId, a.fecha);
    if (!destinoDePrincipal.has(k)) destinoDePrincipal.set(k, nueva);
  }
  const apoyosQuitados: ApoyoQuitado[] = [];
  for (const a of asignaciones) {
    if (!esApoyo(a) || !apoyoMovible(a)) continue;
    const nueva = destinoDePrincipal.get(claveDia(a.otId, a.fecha));
    if (nueva) {
      movimientos.push({ id: a.id, fecha: nueva });
      movidas.push({ a, nueva });
      continue;
    }
    // La principal se queda (salió, o está fija o con parte) y la cuadrilla del apoyo no
    // sale ese día: el apoyo no va. Sólo el día suspendido: en los días de la cascada la
    // cuadrilla trabaja, y lo que le cae encima se reporta como sobrecarga.
    if (a.fecha === dia && a.cuadrillaId !== null && enFoco.has(a.cuadrillaId)) {
      apoyosQuitados.push({
        id: a.id,
        otId: a.otId,
        titulo: ots.get(a.otId)?.titulo ?? `OT ${a.otId}`,
        cuadrillaId: a.cuadrillaId,
        cuadrillaNombre: nombre.get(a.cuadrillaId) ?? `Cuadrilla ${a.cuadrillaId}`,
        fecha: a.fecha,
        fraccion: a.fraccion,
        estado: a.estado,
        ordenDia: a.ordenDia,
        notas: a.notas,
      });
    }
  }
  const quitados = new Set(apoyosQuitados.map((q) => q.id));

  // ── 3. El daño colateral ───────────────────────────────────────────────────

  // Confirmadas: se mueven igual —si no se puede trabajar, dejarlas donde están sería
  // mentir— pero alguien tiene que llamar al cliente. Una línea por obra, con el primer
  // día: es lo que el cliente preguntó.
  const confirmadas = new Map<number, Corrimiento["confirmadas"][number]>();
  for (const { a, nueva } of movidas) {
    // El apoyo no agrega a quién llamar: la obra ya está en la lista por su principal.
    if (a.estado !== "confirmada" || esApoyo(a)) continue;
    const ya = confirmadas.get(a.otId);
    if (!ya || a.fecha < ya.de) {
      confirmadas.set(a.otId, {
        otId: a.otId,
        titulo: ots.get(a.otId)?.titulo ?? `OT ${a.otId}`,
        de: a.fecha,
        a: nueva,
      });
    }
  }

  // Techo del cliente: se mide contra el ÚLTIMO día de la obra ENTERA, no contra el bloque
  // que se movió, porque lo que el cliente pidió es el trabajo terminado (ver ventana.ts).
  //
  // SÓLO LAS QUE ROMPE ESTE CORRIMIENTO. Una obra que ya se pasaba antes es un problema
  // que existe igual, y meterla en esta lista la llenaría de cosas que no cambiaron —y
  // entonces no se lee ninguna.
  const nuevaFechaPorId = new Map(movidas.map((m) => [m.a.id, m.nueva]));
  const ultimoPorOt = new Map<number, { antes: string; despues: string }>();
  for (const a of asignaciones) {
    if ((a.origen ?? "ot") === "tarea" || esApoyo(a)) continue;
    const despues = nuevaFechaPorId.get(a.id) ?? a.fecha;
    const ya = ultimoPorOt.get(a.otId);
    ultimoPorOt.set(a.otId, {
      antes: !ya || a.fecha > ya.antes ? a.fecha : ya.antes,
      despues: !ya || despues > ya.despues ? despues : ya.despues,
    });
  }
  const rompenTecho: Corrimiento["rompenTecho"] = [];
  for (const otId of new Set(movidas.map((m) => m.a.otId))) {
    const ot = ots.get(otId);
    const dias = ultimoPorOt.get(otId);
    if (!ot?.fechaAntesDe || !dias) continue;
    if (violaTecho(ot, dias.antes)) continue;
    if (!violaTecho(ot, dias.despues)) continue;
    rompenTecho.push({
      otId,
      titulo: ot.titulo,
      termina: dias.despues,
      techo: ot.fechaAntesDe,
    });
  }

  // Guardias que se consumen: las activas de las celdas donde cae algo. Se resuelven ANTES de
  // la carga final porque la guardia consumida deja de ocupar: lo que cae la reemplaza. El
  // día suspendido mismo nunca es destino (todo se corre hacia adelante), así que su guardia
  // no puede consumirse; la condición explícita queda por si algún día cambia la cascada.
  const tocadas = new Set(movidas.map((m) => celda(m.a.cuadrillaId, m.nueva)));
  const guardiasConsumidas: GuardiaConsumida[] = [];
  const consumidas = new Set<number>();
  for (const a of asignaciones) {
    if (!esGuardia(a) || a.cuadrillaId === null || a.fecha === dia) continue;
    if (!tocadas.has(celda(a.cuadrillaId, a.fecha))) continue;
    const obras = new Map<number, LineaObra>();
    for (const m of movidas) {
      if (m.a.cuadrillaId !== a.cuadrillaId || m.nueva !== a.fecha || obras.has(m.a.otId)) continue;
      obras.set(m.a.otId, { otId: m.a.otId, titulo: ots.get(m.a.otId)?.titulo ?? `OT ${m.a.otId}` });
    }
    consumidas.add(a.id);
    guardiasConsumidas.push({
      id: a.id,
      cuadrillaId: a.cuadrillaId,
      cuadrillaNombre: nombre.get(a.cuadrillaId) ?? `Cuadrilla ${a.cuadrillaId}`,
      fecha: a.fecha,
      obras: [...obras.values()],
    });
  }
  guardiasConsumidas.sort((x, y) => x.fecha.localeCompare(y.fecha) || x.cuadrillaId - y.cuadrillaId);

  // Sobrecarga: cómo queda cada día tocado una vez aplicado todo. Cuenta las tareas y las
  // fijas, que no se movieron pero siguen ocupando la cuadrilla. Las guardias consumidas NO:
  // dejaron de existir como reserva en el mismo gesto. (Los ids de tareas y de Odoo son
  // espacios distintos: por eso la guardia se reconoce con esGuardia y no sólo por id.)
  const cargaFinal = new Map<string, number>();
  for (const a of asignaciones) {
    const esTarea = (a.origen ?? "ot") === "tarea";
    if (a.cuadrillaId === null || (!esTarea && quitados.has(a.id))) continue;
    if (esGuardia(a) && consumidas.has(a.id)) continue;
    // Una tarea nunca se mueve: si su id coincide con el de una jornada de Odoo corrida, no
    // es ella la que se corrió.
    const fecha = esTarea ? a.fecha : (nuevaFechaPorId.get(a.id) ?? a.fecha);
    const k = celda(a.cuadrillaId, fecha);
    cargaFinal.set(k, (cargaFinal.get(k) ?? 0) + a.fraccion);
  }
  const sobrecargas: Corrimiento["sobrecargas"] = [];
  for (const k of tocadas) {
    const carga = cargaFinal.get(k) ?? 0;
    if (carga <= 1 + 1e-6) continue;
    const [c, fecha] = k.split("|");
    sobrecargas.push({
      cuadrillaId: Number(c),
      cuadrillaNombre: nombre.get(Number(c)) ?? `Cuadrilla ${c}`,
      fecha,
      carga,
    });
  }
  sobrecargas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.cuadrillaId - b.cuadrillaId);

  // La cuadrilla se queda el día suspendido con una obra fija de ¼ y nada más. No es un
  // error, es LA decisión del día: ¿se manda la cuadrilla por tres horas bajo la lluvia, o
  // se llama para reprogramar la grúa? Hoy eso se descubre a las siete de la mañana.
  const solas: Corrimiento["solas"] = [];
  for (const cuadrillaId of enFoco) {
    const carga = cargaFinal.get(celda(cuadrillaId, dia)) ?? 0;
    if (carga <= 0 || carga >= PISO_VALE_LA_PENA) continue;
    solas.push({
      cuadrillaId,
      cuadrillaNombre: nombre.get(cuadrillaId) ?? `Cuadrilla ${cuadrillaId}`,
      carga,
    });
  }

  // ── 4. El historial: una fila por obra y cuadrilla ─────────────────────────
  //
  // Por obra Y cuadrilla porque el "antes/después" del registro habla de un bloque, y un
  // bloque tiene una sola cuadrilla. Una obra repartida entre dos cuadrillas deja dos
  // filas del mismo lote, que es lo correcto: son dos cosas que se movieron.
  //
  // El apoyo va en su propia fila (con `apoyo: true`): una cuadrilla puede ser principal de
  // la obra un día y apoyo otro, y mezclarlas haría que el historial no pueda decir cuál.
  const porBloque = new Map<string, { a: AsignacionTablero; nueva: string }[]>();
  for (const m of movidas) {
    const k = `${m.a.otId}|${m.a.cuadrillaId}|${esApoyo(m.a) ? "a" : "p"}`;
    const lista = porBloque.get(k);
    if (lista) lista.push(m);
    else porBloque.set(k, [m]);
  }
  const registros: Corrimiento["registros"] = [];
  for (const sinOrden of porBloque.values()) {
    // ORDENADO POR FECHA DE ORIGEN, y no es cosmético: es lo que hace que el índice de
    // `asignacionIds` empareje con el de `antes.fechas`, que es de donde invertirCorrimiento
    // saca a qué día devolver cada jornada al deshacer.
    const lista = [...sinOrden].sort((x, y) => x.a.fecha.localeCompare(y.a.fecha));
    const primera = lista[0].a;
    const cuadrillaId = primera.cuadrillaId;
    const cuadrillaNombre = cuadrillaId == null ? null : (nombre.get(cuadrillaId) ?? null);
    const apoyo = esApoyo(primera) ? { apoyo: true } : {};
    registros.push({
      otId: primera.otId,
      otTitulo: ots.get(primera.otId)?.titulo ?? null,
      asignacionIds: lista.map((m) => m.a.id),
      antes: {
        fechas: lista.map((m) => m.a.fecha).sort(),
        cuadrillaId,
        cuadrillaNombre,
        fraccion: primera.fraccion,
        ...apoyo,
      },
      despues: {
        fechas: lista.map((m) => m.nueva).sort(),
        cuadrillaId,
        cuadrillaNombre,
        fraccion: primera.fraccion,
        ...apoyo,
      },
    });
  }

  // Una fila por apoyo quitado: "Quitó el apoyo de C3 mar 16 — Lluvia".
  const registrosApoyo: RegistroApoyoCorrida[] = apoyosQuitados.map((q) => ({
    otId: q.otId,
    otTitulo: ots.get(q.otId)?.titulo ?? null,
    accion: "quitar",
    asignacionIds: [q.id],
    antes: estadoDeQuitado(q),
    despues: null,
  }));

  const fechasDestino = movidas.map((m) => m.nueva).sort();

  return {
    movimientos,
    registros,
    quitar: apoyosQuitados.map((q) => q.id),
    apoyosQuitados,
    registrosApoyo,
    fijas,
    confirmadas: [...confirmadas.values()].sort((a, b) => a.de.localeCompare(b.de)),
    rompenTecho,
    sobrecargas,
    solas,
    jornadas: movimientos.length,
    obras: new Set(movidas.map((m) => m.a.otId)).size,
    ultimoDia: fechasDestino.at(-1) ?? null,
    truncado,
    alBorde,
    guardiasConsumidas,
  };
}

function estadoDeQuitado(q: ApoyoQuitado): EstadoBloque {
  return {
    fechas: [q.fecha],
    cuadrillaId: q.cuadrillaId,
    cuadrillaNombre: q.cuadrillaNombre,
    fraccion: q.fraccion,
    apoyo: true,
  };
}

/**
 * El corrimiento al revés, para deshacerlo.
 *
 * Se arma desde los registros y no recalculando: deshacer tiene que devolver cada jornada
 * al día del que salió, aunque el plan haya cambiado de forma en el medio. Quién puede y
 * quién no deshacer lo decide la guarda del tablero, que comprueba que las asignaciones
 * sigan existiendo y nadie las haya tocado.
 *
 * Los apoyos quitados se VUELVEN A CREAR (con ids nuevos: los viejos ya no existen), como
 * estaban. `crear[i]` y `registrosApoyo[i]` van emparejados: la ruta le pone a cada fila
 * del historial el id que Odoo le dio a su apoyo.
 */
export function invertirCorrimiento(
  registros: Corrimiento["registros"],
  apoyosQuitados: ApoyoQuitado[] = [],
  guardiasConsumidas: GuardiaConsumida[] = [],
): {
  movimientos: MovimientoAsignacion[];
  registros: Corrimiento["registros"];
  crear: NuevaAsignacion[];
  registrosApoyo: RegistroApoyoCorrida[];
  /** Las guardias que el corrimiento consumió, para volverlas a "activa". */
  reactivarGuardias: number[];
} {
  const movimientos: MovimientoAsignacion[] = [];
  for (const r of registros) {
    // `antes.fechas` y `asignacionIds` están los dos ordenados por fecha de origen, así
    // que el índice empareja cada jornada con el día del que salió.
    r.asignacionIds.forEach((id, i) => {
      const fecha = r.antes.fechas[i];
      if (fecha) movimientos.push({ id, fecha });
    });
  }
  return {
    movimientos,
    registros: registros.map((r) => ({ ...r, antes: r.despues, despues: r.antes })),
    crear: apoyosQuitados.map((q) => ({
      otId: q.otId,
      fecha: q.fecha,
      cuadrillaId: q.cuadrillaId,
      fraccion: aFraccionStr(q.fraccion),
      estado: q.estado,
      ordenDia: q.ordenDia,
      notas: q.notas,
      apoyo: true,
    })),
    registrosApoyo: apoyosQuitados.map((q) => ({
      otId: q.otId,
      otTitulo: q.titulo,
      accion: "crear",
      asignacionIds: [],
      antes: null,
      despues: estadoDeQuitado(q),
    })),
    reactivarGuardias: guardiasConsumidas.map((g) => g.id),
  };
}

/** ¿Se puede correr este día? El domingo no se trabaja, así que no hay nada que suspender. */
export function diaCorrible(dia: string): string | null {
  return esDomingo(dia) ? "El domingo no se trabaja: no hay jornada que suspender." : null;
}
