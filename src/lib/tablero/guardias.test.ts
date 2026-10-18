import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aperturaRelleno,
  armadoAtrasado,
  candidatosRelleno,
  cuentaConGuardias,
  destinoValidoGuardia,
  duracionParaCandado,
  evaluarCandado,
  guardiaMasCercanaPara,
  lugarProtegido,
  MENSAJE_OBRA_COMUN,
  motivoCeldaNoApta,
  planearGuardiasSemana,
  tareaParaCapataz,
  textoAvisoColocacion,
  textoAvisoRelleno,
  urgenciaCumple,
  type EntradaCandado,
  type EntradaColocacion,
  type GrillaGuardias,
} from "./guardias.ts";
import { comodinDe, comodinPuedeIr } from "./comodines.ts";
import { hoyBA } from "./dias-habiles.ts";
import type { GuardiaResumen, OtParaCandado } from "./guardias-tipos.ts";
import type { AsignacionTablero, CuadrillaTablero, OtTablero, ProgresoOt } from "./tipos.ts";

// Las reglas de guardias-contrato.md, una por test. La semana que se cubre es la del 02/11
// (lunes 02 … sábado 07) y la corrida es la del viernes 23/10.

const C1 = 11, C2 = 12, C3 = 13, C4 = 14, C5 = 15;
const cuadrillas: CuadrillaTablero[] = [
  { id: C1, nombre: "CUADRILLA 1", tercerizada: false },
  { id: C2, nombre: "CUADRILLA 2", tercerizada: false },
  { id: C3, nombre: "CUADRILLA 3", tercerizada: false },
  { id: C4, nombre: "CUADRILLA 4", tercerizada: false },
  { id: C5, nombre: "CUADRILLA 5", tercerizada: true },
];
const propias = [C1, C2, C3, C4];

const SEMANA = "2026-11-02";
const LUN = "2026-11-02", MAR = "2026-11-03", MIE = "2026-11-04", JUE = "2026-11-05", VIE = "2026-11-06";
const HOY = "2026-10-23";

let proximoId = 1000;
function obra(cuadrillaId: number, fecha: string, otId = 50, extra: Partial<AsignacionTablero> = {}): AsignacionTablero {
  return {
    id: proximoId++,
    origen: "ot",
    otId,
    fecha,
    cuadrillaId,
    fraccion: 1,
    estado: "tentativa",
    ordenDia: 0,
    notas: null,
    parteId: null,
    motivoFija: null,
    ...extra,
  };
}
function tarea(cuadrillaId: number, fecha: string, tipo = "deposito", id = proximoId++): AsignacionTablero {
  return {
    id,
    origen: "tarea",
    otId: 0,
    tarea: { grupoId: id, titulo: tipo === "guardia" ? "Guardia" : "Depósito", tipo, hecha: false },
    fecha,
    cuadrillaId,
    fraccion: 1,
    estado: "confirmada",
    ordenDia: 0,
    notas: null,
    parteId: null,
    motivoFija: null,
  };
}
/**
 * Todas las cuadrillas propias ocupadas ese día, cada una con una obra distinta por día
 * (si fuera la misma obra todos los días, el día libre del medio quedaría "en medio de una
 * obra de varios días" y el test probaría otra regla).
 */
const lleno = (fecha: string, menos: number[] = []) =>
  propias.filter((c) => !menos.includes(c)).map((c) => obra(c, fecha, Number(fecha.slice(8, 10)) * 100 + c));

function grilla(asignaciones: AsignacionTablero[] = [], extra: Partial<GrillaGuardias> = {}): GrillaGuardias {
  return { asignaciones, cuadrillas, feriados: new Set(), suspendidas: new Set(), hoy: HOY, ...extra };
}
function colocacion(asignaciones: AsignacionTablero[] = [], extra: Partial<EntradaColocacion> = {}): EntradaColocacion {
  return { ...grilla(asignaciones), semana: SEMANA, guardiasSemana: [], rotacion: new Map(), ...extra };
}
function guardia(p: Partial<GuardiaResumen> & Pick<GuardiaResumen, "id" | "fecha" | "cuadrillaId">): GuardiaResumen {
  return { semana: SEMANA, ranura: 1, estado: "activa", ...p };
}

// ─── Colocación ──────────────────────────────────────────────────────────────────────────

test("con lugar: martes y jueves, la de menor número primero si nadie tuvo guardias", () => {
  const r = planearGuardiasSemana(colocacion());
  assert.deepEqual(
    r.poner.map((g) => [g.ranura, g.fecha, g.cuadrillaId]),
    [[1, MAR, C1], [2, JUE, C2]],
  );
  assert.deepEqual(r.faltan, []);
  assert.deepEqual(r.yaEstaban, []);
  assert.equal(r.poner[0].porQue, "Semana del 02/11: el martes le tocaba a la C1 por rotación.");
});

test("rotación: la que menos guardias tuvo, y a igual cantidad la de menor número", () => {
  const rotacion = new Map([[C1, 2], [C2, 1], [C3, 0], [C4, 0]]);
  const r = planearGuardiasSemana(colocacion([], { rotacion }));
  assert.deepEqual(r.poner.map((g) => g.cuadrillaId), [C3, C4]);
});

test("repuestos en orden: el martes lleno va el miércoles; jueves lleno y miércoles tomado, el viernes", () => {
  const r = planearGuardiasSemana(colocacion([...lleno(MAR), ...lleno(JUE)]));
  assert.deepEqual(r.poner.map((g) => g.fecha), [MIE, VIE]);
  assert.match(r.poner[0].porQue, /el martes no había ninguna jornada libre; el miércoles le tocaba a la C1/);
  assert.match(r.poner[1].porQue, /el jueves no había ninguna jornada libre; el miércoles ya tiene la otra guardia; el viernes/);
});

test("repuesto de la ranura 1: martes y miércoles llenos, el lunes", () => {
  const r = planearGuardiasSemana(colocacion([...lleno(MAR), ...lleno(MIE)]));
  assert.deepEqual(r.poner.map((g) => g.fecha), [LUN, JUE]);
});

test("nunca las dos el mismo día", () => {
  const r = planearGuardiasSemana(colocacion([...lleno(MAR), ...lleno(JUE), ...lleno(VIE)]));
  assert.deepEqual(r.poner.map((g) => g.fecha), [MIE]);
  assert.equal(r.faltan.length, 1);
  assert.equal(r.faltan[0].ranura, 2);
  assert.match(r.faltan[0].motivo, /la del jueves no entró/);
  assert.match(r.faltan[0].motivo, /el miércoles ya tiene la otra guardia/);
});

test("una por cuadrilla por semana: si sólo la C2 tiene lugar, la segunda no entra", () => {
  const asignaciones = [MAR, MIE, JUE, VIE, LUN].flatMap((f) => lleno(f, [C2]));
  const r = planearGuardiasSemana(colocacion(asignaciones));
  assert.deepEqual(r.poner.map((g) => [g.fecha, g.cuadrillaId]), [[MAR, C2]]);
  assert.equal(r.faltan.length, 1);
  assert.match(r.faltan[0].motivo, /sólo había lugar en la C2, que ya tiene su guardia/);
  assert.match(r.poner[0].porQue, /la C2 era la única con lugar/);
});

test("la C5 tercerizada nunca lleva guardia", () => {
  const asignaciones = [LUN, MAR, MIE, JUE, VIE].flatMap((f) => lleno(f));
  const r = planearGuardiasSemana(colocacion(asignaciones));
  assert.deepEqual(r.poner, []);
  assert.equal(r.faltan.length, 2);
  assert.equal(motivoCeldaNoApta(grilla(), { cuadrillaId: C5, fecha: MAR }), "La C5 es tercerizada: no lleva guardias.");
});

test("no va en una celda con algo: obra, tarea o apoyo", () => {
  const asignaciones = [
    tarea(C1, MAR),
    obra(C2, MAR, 60, { apoyo: true, fraccion: 0.5 }),
    obra(C3, MAR, 61, { fraccion: 0.25 }),
  ];
  const r = planearGuardiasSemana(colocacion(asignaciones));
  assert.equal(r.poner[0].fecha, MAR);
  assert.equal(r.poner[0].cuadrillaId, C4);
  for (const c of [C1, C2, C3]) assert.match(motivoCeldaNoApta(grilla(asignaciones), { cuadrillaId: c, fecha: MAR }) ?? "", /ya tiene algo/);
});

test("no va en medio de una obra de varios días de esa cuadrilla", () => {
  const asignaciones = [obra(C1, LUN, 70), obra(C1, MIE, 70)];
  assert.match(motivoCeldaNoApta(grilla(asignaciones), { cuadrillaId: C1, fecha: MAR }) ?? "", /en medio de una obra/);
  // Obras distintas a cada lado no es "en medio".
  const distintas = [obra(C1, LUN, 70), obra(C1, MIE, 71)];
  assert.equal(motivoCeldaNoApta(grilla(distintas), { cuadrillaId: C1, fecha: MAR }), null);
  const r = planearGuardiasSemana(colocacion(asignaciones));
  assert.notEqual(r.poner[0].cuadrillaId, C1);
});

test("en medio de una obra también salteando el domingo", () => {
  const sab = "2026-10-31";
  const asignaciones = [obra(C1, "2026-10-30", 70), obra(C1, LUN, 70)];
  assert.match(motivoCeldaNoApta(grilla(asignaciones), { cuadrillaId: C1, fecha: sab }) ?? "", /en medio de una obra/);
});

test("no en feriado, domingo, día suspendido ni pasado", () => {
  const feriados = new Set([MAR]);
  assert.match(motivoCeldaNoApta(grilla([], { feriados }), { cuadrillaId: C1, fecha: MAR }) ?? "", /feriado/);
  assert.match(motivoCeldaNoApta(grilla(), { cuadrillaId: C1, fecha: "2026-11-08" }) ?? "", /domingo/);
  const suspendidas = new Set([`${C1}|${MAR}`]);
  assert.match(motivoCeldaNoApta(grilla([], { suspendidas }), { cuadrillaId: C1, fecha: MAR }) ?? "", /suspendido/);
  assert.match(motivoCeldaNoApta(grilla(), { cuadrillaId: C1, fecha: "2026-10-22" }) ?? "", /ya pasó/);

  // El martes feriado: la ranura 1 va el miércoles.
  const r = planearGuardiasSemana({ ...colocacion(), feriados });
  assert.equal(r.poner[0].fecha, MIE);
  assert.match(r.poner[0].porQue, /el martes es feriado/);
});

test("la semana en curso nunca", () => {
  const r = planearGuardiasSemana(colocacion([], { semana: "2026-10-19" }));
  assert.deepEqual(r.poner, []);
  assert.equal(r.faltan.length, 2);
  assert.match(r.faltan[0].motivo, /semana en curso/);
});

test("ranuras ya ocupadas no se reponen, tampoco la de una sacada", () => {
  const sacada = guardia({ id: 1, fecha: MAR, cuadrillaId: C1, ranura: 1, estado: "sacada" });
  const r = planearGuardiasSemana(colocacion([], { guardiasSemana: [sacada] }));
  assert.deepEqual(r.yaEstaban, [1]);
  assert.deepEqual(r.poner.map((g) => g.ranura), [2]);
  // La sacada ya no es una guardia: no le quita la semana a la C1.
  assert.equal(r.poner[0].cuadrillaId, C1);

  const usada = guardia({ id: 2, fecha: JUE, cuadrillaId: C1, ranura: 2, estado: "usada" });
  const r2 = planearGuardiasSemana(colocacion([], { guardiasSemana: [usada] }));
  assert.deepEqual(r2.yaEstaban, [2]);
  assert.deepEqual(r2.poner.map((g) => [g.ranura, g.fecha, g.cuadrillaId]), [[1, MAR, C2]]);

  const completa = planearGuardiasSemana(colocacion([], { guardiasSemana: [sacada, usada] }));
  assert.deepEqual(completa.poner, []);
  assert.deepEqual(completa.faltan, []);
});

test("sin lugar: faltan las dos con el motivo, y nunca se mueve nada", () => {
  const asignaciones = [LUN, MAR, MIE, JUE, VIE].flatMap((f) => lleno(f));
  const copia = structuredClone(asignaciones);
  const r = planearGuardiasSemana(colocacion(asignaciones));
  assert.deepEqual(r.poner, []);
  assert.deepEqual(r.faltan.map((f) => f.ranura), [1, 2]);
  assert.match(r.faltan[0].motivo, /la del martes no entró: el martes no había ninguna jornada libre, el miércoles no había ninguna jornada libre y el lunes/);
  assert.deepEqual(asignaciones, copia);
  // El resultado no trae nada para mover: sólo poner y faltan.
  assert.deepEqual(Object.keys(r).sort(), ["faltan", "poner", "semana", "yaEstaban"]);
});

test("el aviso del viernes dice qué puso y qué faltó", () => {
  const sigla = (id: number) => `C${id - 10}`;
  const t = textoAvisoColocacion(
    [
      { semana: "2026-10-26", poner: [{ ranura: 2, fecha: "2026-10-29", cuadrillaId: C3, porQue: "" }, { ranura: 1, fecha: "2026-10-27", cuadrillaId: C2, porQue: "" }], faltan: [], yaEstaban: [] },
      { semana: SEMANA, poner: [{ ranura: 1, fecha: MAR, cuadrillaId: C2, porQue: "" }], faltan: [{ ranura: 2, motivo: "la del jueves no entró: el jueves no había ninguna jornada libre" }], yaEstaban: [] },
    ],
    sigla,
  );
  const [l1, l2] = t.descripcion.split("\n");
  assert.equal(l1, "Puse 2 guardias para la semana del 26/10: mar 27/10 C2, jue 29/10 C3.");
  assert.equal(l2, "Puse 1 guardia para la semana del 02/11: mar 03/11 C2. La del jueves no entró: el jueves no había ninguna jornada libre.");
  assert.equal(t.titulo, "Guardias de las semanas del 26/10 y 02/11: puse 3 · faltó 1");

  const una = textoAvisoColocacion(
    [{ semana: SEMANA, poner: [{ ranura: 1, fecha: MAR, cuadrillaId: C2, porQue: "" }, { ranura: 2, fecha: JUE, cuadrillaId: C3, porQue: "" }], faltan: [], yaEstaban: [] }],
    sigla,
  );
  assert.equal(una.titulo, "Puse 2 guardias para la semana del 02/11: mar 03/11 C2, jue 05/11 C3");
});

// ─── Correrla dentro de la semana ──────────────────────────────────────────────────────

const G = guardia({ id: 5000, fecha: MAR, cuadrillaId: C1, ranura: 1 });
const OTRA = guardia({ id: 5001, fecha: JUE, cuadrillaId: C2, ranura: 2 });
const conGuardias = (extra: AsignacionTablero[] = []) =>
  grilla([tarea(C1, MAR, "guardia", G.id), tarea(C2, JUE, "guardia", OTRA.id), ...extra]);

test("mover: misma semana, a una celda libre, se puede (su propia celda no cuenta)", () => {
  assert.equal(destinoValidoGuardia(conGuardias(), G, { cuadrillaId: C3, fecha: MIE }, [G, OTRA]), null);
  assert.equal(destinoValidoGuardia(conGuardias(), G, { cuadrillaId: C1, fecha: MIE }, [G, OTRA]), null);
});

test("mover: a otra semana no", () => {
  assert.match(destinoValidoGuardia(conGuardias(), G, { cuadrillaId: C3, fecha: "2026-11-10" }, [G, OTRA]) ?? "", /dentro de su semana/);
});

test("mover: a una celda ocupada no (aunque una jornada de Odoo tenga el mismo id que la guardia)", () => {
  const ocupada = obra(C3, MIE, 80, { id: G.id });
  assert.match(destinoValidoGuardia(conGuardias([ocupada]), G, { cuadrillaId: C3, fecha: MIE }, [G, OTRA]) ?? "", /ya tiene algo/);
});

test("mover: al mismo día que la otra guardia no; a la cuadrilla que ya tiene la otra tampoco", () => {
  assert.match(destinoValidoGuardia(conGuardias(), G, { cuadrillaId: C3, fecha: JUE }, [G, OTRA]) ?? "", /ya tiene la otra guardia de la semana/);
  assert.match(destinoValidoGuardia(conGuardias(), G, { cuadrillaId: C2, fecha: MIE }, [G, OTRA]) ?? "", /La C2 ya tiene la otra guardia/);
  // Si la otra está sacada, ya no cuenta.
  const sacada = { ...OTRA, estado: "sacada" as const };
  assert.equal(destinoValidoGuardia(grilla([tarea(C1, MAR, "guardia", G.id)]), G, { cuadrillaId: C2, fecha: JUE }, [G, sacada]), null);
});

test("mover: a hoy no (sería sacarla sin JS: la corrida de las 13 h la cierra como depósito)", () => {
  // La guardia del martes, mirada el lunes: el lunes mismo ya no; el miércoles sí.
  const elLunes = { ...conGuardias(), hoy: LUN };
  assert.match(destinoValidoGuardia(elLunes, G, { cuadrillaId: C3, fecha: LUN }, [G, OTRA]) ?? "", /hoy ya no/);
  assert.equal(destinoValidoGuardia(elLunes, G, { cuadrillaId: C3, fecha: MIE }, [G, OTRA]), null);
});

test("mover: una guardia que no está activa no se corre", () => {
  assert.match(destinoValidoGuardia(conGuardias(), { ...G, estado: "usada" }, { cuadrillaId: C3, fecha: MIE }, [OTRA]) ?? "", /ya no está activa/);
});

// ─── El candado ──────────────────────────────────────────────────────────────────────────

// La guardia del jueves 29/10 de la C3. Las 13 h del miércoles 28 son las 16 UTC.
const GJ = guardia({ id: 7000, fecha: "2026-10-29", cuadrillaId: C3, semana: "2026-10-26", ranura: 2 });
const SIN_FERIADOS = new Set<string>();

function ot(p: Partial<OtParaCandado> = {}): OtParaCandado {
  return { id: 3001, tipo: "armado", estado: "pendiente", urgencia: "baja", creadaEl: "2026-10-01 12:00:00", fechaDesde: null, jornadas: 1, ...p };
}
function candado(p: Partial<EntradaCandado> = {}): ReturnType<typeof evaluarCandado> {
  return evaluarCandado({
    guardia: GJ,
    ot: ot(),
    esApoyo: false,
    avance: null,
    ahora: "2026-10-28T12:00:00Z",
    feriados: SIN_FERIADOS,
    esComodin: false,
    ...p,
  });
}

test("urgencia alta o media cargada hace 3 hábiles o menos: libre", () => {
  // Creada el lunes 26; el jueves 29 lleva 3 (martes, miércoles, jueves).
  const d = candado({ ot: ot({ urgencia: "alta", creadaEl: "2026-10-26 13:00:00" }), ahora: "2026-10-29T11:00:00Z" });
  assert.deepEqual(d.libre && d.uso, "urgencia");
  const media = candado({ ot: ot({ urgencia: "media", creadaEl: "2026-10-27 13:00:00" }) });
  assert.equal(media.libre, true);
});

test("urgencia cargada hace 4 hábiles: pide urgencia_fuera_regla", () => {
  // Creada el viernes 23; el miércoles 28 lleva 4 (sábado, lunes, martes, miércoles).
  const d = candado({ ot: ot({ urgencia: "alta", creadaEl: "2026-10-23 13:00:00" }) });
  assert.equal(d.libre, false);
  assert.equal(!d.libre && d.pide, "urgencia_fuera_regla");
  assert.equal(urgenciaCumple(ot({ urgencia: "alta", creadaEl: "2026-10-23 13:00:00" }), "2026-10-28T12:00:00Z", SIN_FERIADOS), false);
});

test("urgencia sin fecha de creación: pide (falla cerrado)", () => {
  const d = candado({ ot: ot({ urgencia: "alta", creadaEl: null }) });
  assert.equal(!d.libre && d.pide, "urgencia_fuera_regla");
});

test("comodín: a las 12:59 del hábil anterior pide; a las 13:00 rellena", () => {
  const antes = candado({ esComodin: true, ot: ot({ tipo: "desarme" }), ahora: "2026-10-28T15:59:00Z" });
  assert.equal(!antes.libre && antes.pide, "comodin_antes");
  assert.match(!antes.libre ? antes.mensaje : "", /desde las 13 h del mié 28\/10/);
  const justo = candado({ esComodin: true, ot: ot({ tipo: "desarme" }), ahora: "2026-10-28T16:00:00Z" });
  assert.deepEqual(justo.libre && justo.uso, "comodin");
});

test("comodín MARCADO (18/10): cualquier tipo y fecha; antes de las 13 h del hábil anterior pide, después rellena", () => {
  // Un armado de 3 j con un "a partir de" posterior a la guardia: con la regla vieja nunca
  // hubiera sido comodín. Marcado, lo es, y el candado lo trata igual que a cualquier comodín.
  const otTab = otTablero({ id: 3001, titulo: "Armado marcado", tipo: "armado", jornadas: 3, fechaDesde: "2026-11-20" });
  const marcados = new Map([[3001, "2026-10-20T15:00:00Z"]]);
  const esComodinA = (ahora: string) =>
    comodinPuedeIr(comodinDe(otTab, { marcados, asignaciones: [], progreso: [] }), GJ.fecha, hoyBA(ahora));
  const antes = candado({ esComodin: esComodinA("2026-10-28T15:59:00Z"), ot: ot({ jornadas: 3, fechaDesde: "2026-11-20" }), ahora: "2026-10-28T15:59:00Z" });
  assert.equal(!antes.libre && antes.pide, "comodin_antes");
  const despues = candado({ esComodin: esComodinA("2026-10-28T16:00:00Z"), ot: ot({ jornadas: 3, fechaDesde: "2026-11-20" }), ahora: "2026-10-28T16:00:00Z" });
  assert.deepEqual(despues.libre && despues.uso, "comodin");
  // Sin la marca, la misma obra es una obra común: pide autorización a JS.
  const sinMarca = comodinPuedeIr(comodinDe(otTab, { marcados: new Map(), asignaciones: [], progreso: [] }), GJ.fecha, "2026-10-28");
  const comun = candado({ esComodin: sinMarca, ot: ot({ jornadas: 3 }), ahora: "2026-10-28T16:00:00Z" });
  assert.equal(!comun.libre && comun.pide, "obra_comun");
});

test("comodín con guardia el lunes: la apertura es el sábado a las 13 h", () => {
  assert.equal(aperturaRelleno(LUN, SIN_FERIADOS), "2026-10-31T16:00:00.000Z");
  // Con el sábado feriado, el viernes.
  assert.equal(aperturaRelleno(LUN, new Set(["2026-10-31"])), "2026-10-30T16:00:00.000Z");
});

test("apoyo a un armado atrasado: libre como atraso; al día pide obra común", () => {
  const armado = ot({ tipo: "armado", estado: "en_proceso", jornadas: 3 });
  const atrasado = candado({ ot: armado, esApoyo: true, avance: { asignadas: 4, cerradas: 3 } });
  assert.deepEqual(atrasado.libre && atrasado.uso, "atraso");
  const cerroTodo = candado({ ot: armado, esApoyo: true, avance: { asignadas: 3, cerradas: 3 } });
  assert.equal(cerroTodo.libre, true);
  const alDia = candado({ ot: armado, esApoyo: true, avance: { asignadas: 3, cerradas: 1 } });
  assert.equal(!alDia.libre && alDia.pide, "obra_comun");
  // No es apoyo: aunque el armado esté atrasado, poner la principal sobre la guardia pide.
  const principal = candado({ ot: armado, esApoyo: false, avance: { asignadas: 4, cerradas: 3 } });
  assert.equal(principal.libre, false);
});

test("armadoAtrasado: planificarle un día de más no lo vuelve atrasado (cuenta lo hecho, no lo planificado)", () => {
  // 3 j estimadas, 2 hechas y 4 días en el plan: Planificación le sumó un cuarto día en una
  // celda libre. Eso no abre ninguna guardia; recién cuando se cierre el tercero.
  const armado = ot({ tipo: "armado", estado: "en_proceso", jornadas: 3 });
  assert.equal(armadoAtrasado(armado, { asignadas: 4, cerradas: 2 }), false);
  assert.equal(armadoAtrasado(armado, { asignadas: 9, cerradas: 2 }), false);
  assert.equal(armadoAtrasado(armado, { asignadas: 4, cerradas: 3 }), true);
});

test("duracionParaCandado: la mayor entre Odoo y el plan (achicar la duración no abre nada)", () => {
  const desarme = otTablero({ id: 1, titulo: "Desarme", tipo: "desarme", jornadas: 3 });
  // Bajarla a 1 en el plan no la vuelve comodín para el candado.
  assert.equal(duracionParaCandado(desarme, 1), 3);
  // Corregirla para arriba sí vale (la obra se alargó).
  assert.equal(duracionParaCandado(desarme, 5), 5);
  assert.equal(duracionParaCandado(desarme, null), 3);
  assert.equal(duracionParaCandado(desarme), 3);
});

test("armadoAtrasado: sin estimación o sin avance no lo está", () => {
  assert.equal(armadoAtrasado(ot({ tipo: "armado", estado: "en_proceso", jornadas: 0 }), { asignadas: 2, cerradas: 2 }), false);
  assert.equal(armadoAtrasado(ot({ tipo: "armado", estado: "en_proceso", jornadas: 2 }), null), false);
  assert.equal(armadoAtrasado(ot({ tipo: "desarme", estado: "en_proceso", jornadas: 1 }), { asignadas: 2, cerradas: 2 }), false);
  // 2,5 j estimadas son 3 días.
  assert.equal(armadoAtrasado(ot({ tipo: "armado", estado: "en_proceso", jornadas: 2.5 }), { asignadas: 3, cerradas: 2 }), false);
});

test("obra común: pide, con el mensaje del contrato", () => {
  const d = candado();
  assert.equal(!d.libre && d.pide, "obra_comun");
  assert.equal(!d.libre && d.mensaje, MENSAJE_OBRA_COMUN);
});

test("solicitud aprobada por JS: libre con el uso de lo que se pidió", () => {
  assert.deepEqual(candado({ aprobada: "obra_comun" }), { libre: true, uso: "obra_comun", razon: "Lo autorizó JS." });
  const c = candado({ aprobada: "comodin_antes", esComodin: true, ahora: "2026-10-27T12:00:00Z" });
  assert.deepEqual(c.libre && c.uso, "comodin");
  // "Sacar" no habilita poner una obra.
  assert.equal(candado({ aprobada: "sacar" }).libre, false);
});

test("guardia que no está activa o de un día pasado: no se puede ni pidiendo", () => {
  const usada = candado({ guardia: { ...GJ, estado: "usada" }, aprobada: "obra_comun" });
  assert.equal(!usada.libre && usada.pide, null);
  const pasada = candado({ ahora: "2026-10-30T15:00:00Z", ot: ot({ urgencia: "alta", creadaEl: "2026-10-29 12:00:00" }) });
  assert.equal(!pasada.libre && pasada.pide, null);
});

test("una urgencia vieja que además es un comodín abierto entra como comodín", () => {
  const d = candado({ ot: ot({ tipo: "desarme", urgencia: "media", creadaEl: "2026-10-01 12:00:00" }), esComodin: true, ahora: "2026-10-28T17:00:00Z" });
  assert.deepEqual(d.libre && d.uso, "comodin");
});

test("guardia más cercana: la primera libre; si ninguna, la más cercana con lo que hay que pedir", () => {
  const g1 = guardia({ id: 1, fecha: MAR, cuadrillaId: C1 });
  const g2 = guardia({ id: 2, fecha: JUE, cuadrillaId: C2, ranura: 2 });
  const desarme = ot({ tipo: "desarme" });
  // Lunes 02 a las 12 de acá: ninguna abrió todavía para el comodín.
  const pidiendo = guardiaMasCercanaPara({ ot: desarme, activas: [g2, g1], ahora: "2026-11-02T15:00:00Z", feriados: SIN_FERIADOS, esComodin: true, avance: null });
  assert.equal(pidiendo?.guardia.id, 1);
  assert.equal(pidiendo && !pidiendo.decision.libre && pidiendo.decision.pide, "comodin_antes");
  // Miércoles 04 a las 14 de acá: la del martes ya pasó y la del jueves abrió.
  const libre = guardiaMasCercanaPara({ ot: desarme, activas: [g2, g1], ahora: "2026-11-04T17:00:00Z", feriados: SIN_FERIADOS, esComodin: true, avance: null });
  assert.equal(libre?.guardia.id, 2);
  assert.equal(libre?.decision.libre, true);
  assert.equal(guardiaMasCercanaPara({ ot: desarme, activas: [], ahora: "2026-11-04T17:00:00Z", feriados: SIN_FERIADOS, esComodin: true, avance: null }), null);
});

// ─── El relleno de las 13 h ────────────────────────────────────────────────────────────

function otTablero(p: Partial<OtTablero> & Pick<OtTablero, "id" | "titulo" | "tipo">): OtTablero {
  return {
    estado: "pendiente", urgencia: "baja", jornadas: 1, fechaDesde: null, fechaAntesDe: null,
    creadaEl: "2026-10-01 12:00:00", ...p,
  } as OtTablero;
}

test("candidatos: apoyo atrasado, comodines marcados (el más viejo primero), tentativa y depósito al final", () => {
  const gJue = guardia({ id: 9000, fecha: JUE, cuadrillaId: C3, ranura: 2 });
  const ots = new Map<number, OtTablero>([
    [1, otTablero({ id: 1, titulo: "Armado Thames", tipo: "armado", estado: "en_proceso", jornadas: 2 })],
    [2, otTablero({ id: 2, titulo: "Desarme Callao", tipo: "desarme", fechaDesde: "2026-11-20" })],
    [3, otTablero({ id: 3, titulo: "Desarme Corrientes", tipo: "desarme" })],
    [4, otTablero({ id: 4, titulo: "Desarme sin marcar", tipo: "desarme", fechaDesde: "2026-10-01" })],
    [5, otTablero({ id: 5, titulo: "Ampliación marcada", tipo: "ampliacion", jornadas: 2 })],
    [6, otTablero({ id: 6, titulo: "Desarme ya puesto antes", tipo: "desarme" })],
    [7, otTablero({ id: 7, titulo: "Ampliación Rivadavia", tipo: "ampliacion" })],
    [8, otTablero({ id: 8, titulo: "Ampliación con piso", tipo: "ampliacion", fechaDesde: "2026-11-09" })],
    [9, otTablero({ id: 9, titulo: "Armado largo", tipo: "armado", jornadas: 4 })],
  ]);
  // La marca manda, no el tipo ni las fechas: el 2 tiene un "a partir de" futuro y va igual
  // (contrato §2, 18/10), el 4 es un desarme viejo sin marcar y no va, el 5 es una ampliación
  // de 2 j y va. El 6 está marcado pero ya está en la grilla el martes: no se atrasa.
  const marcados = new Map<number, string>([
    [3, "2026-10-28T15:00:00Z"],
    [2, "2026-10-20T15:00:00Z"],
    [5, "2026-10-25T15:00:00Z"],
    [6, "2026-10-01T15:00:00Z"],
  ]);
  const progreso = new Map<number, ProgresoOt>([[1, { otId: 1, asignadas: 3, cerradas: 2 }]]);
  const asignaciones = [
    obra(C1, JUE, 1),
    obra(C4, "2026-11-03", 6),
    obra(C2, "2026-11-12", 7),
    obra(C2, "2026-11-13", 8),
    obra(C4, "2026-11-12", 9),
    obra(C4, "2026-11-13", 9),
  ];
  const c = candidatosRelleno({
    guardia: gJue,
    ahora: "2026-11-04T16:30:00Z",
    feriados: SIN_FERIADOS,
    asignaciones,
    ots,
    progreso,
    cuadrillas,
    marcados,
  });
  assert.deepEqual(
    c.map((x) => [x.tipo, x.otId]),
    [["apoyo", 1], ["comodin", 2], ["comodin", 5], ["comodin", 3], ["tentativa", 7], ["deposito", null]],
  );
  assert.equal(c[1].detalle, "marcado el 20/10 · sin fecha");
  assert.equal(c[2].detalle, "marcado el 25/10 · 2 j · sin fecha");
  assert.equal(c[4].detalle, "hoy: jue 12/11 C2");
  assert.ok(c.every((x) => !/vencid|espera|quedan/.test(`${x.titulo} ${x.detalle ?? ""}`)));

  const aviso = textoAvisoRelleno(gJue, "C3", c);
  assert.equal(aviso.titulo, "Mañana: guardia C3 libre");
  assert.match(aviso.descripcion, /^jue 05\/11, C3\. Para rellenar: 1\) Apoyo a Armado Thames .*; 2\) Comodín Desarme Callao .*; 3\) Comodín Ampliación marcada/);
  assert.match(aviso.descripcion, /Si no entra nada: Depósito\./);
  assert.doesNotMatch(aviso.descripcion, /Rivadavia/, "como mucho tres además del depósito");
});

test("candidatos: sin marcas no hay comodines, aunque haya desarmes de un día esperando", () => {
  const gJue = guardia({ id: 9001, fecha: JUE, cuadrillaId: C3, ranura: 2 });
  const ots = new Map<number, OtTablero>([[2, otTablero({ id: 2, titulo: "Desarme Callao", tipo: "desarme", fechaDesde: "2026-10-28" })]]);
  const c = candidatosRelleno({
    guardia: gJue, ahora: "2026-11-04T16:30:00Z", feriados: SIN_FERIADOS, asignaciones: [], ots, progreso: new Map(), cuadrillas, marcados: new Map(),
  });
  assert.deepEqual(c.map((x) => x.tipo), ["deposito"]);
});

test("candidatos: sin nada para rellenar, sólo el depósito", () => {
  const gJue = guardia({ id: 9000, fecha: JUE, cuadrillaId: C3, ranura: 2 });
  const c = candidatosRelleno({ guardia: gJue, ahora: "2026-11-04T16:30:00Z", feriados: SIN_FERIADOS, asignaciones: [], ots: new Map(), progreso: new Map(), cuadrillas, marcados: new Map() });
  assert.deepEqual(c.map((x) => x.tipo), ["deposito"]);
  assert.match(textoAvisoRelleno(gJue, "C3", c).descripcion, /No hay nada en la bandeja/);
});

test("aviso de las 13 h: el sábado no dice «Mañana» de la guardia del lunes", () => {
  const gLun = guardia({ id: 9001, fecha: "2026-11-09", cuadrillaId: C3, ranura: 1 });
  const c = candidatosRelleno({ guardia: gLun, ahora: "2026-11-07T16:30:00Z", feriados: SIN_FERIADOS, asignaciones: [], ots: new Map(), progreso: new Map(), cuadrillas, marcados: new Map() });
  assert.equal(textoAvisoRelleno(gLun, "C3", c, "2026-11-07").titulo, "Lun 09/11: guardia C3 libre");
  assert.equal(textoAvisoRelleno(gLun, "C3", c, "2026-11-08").titulo, "Mañana: guardia C3 libre");
});

// ─── Cómo se cuentan y el indicador ─────────────────────────────────────────────────────

test("cuentaConGuardias: la guardia ocupa pero se cuenta aparte", () => {
  const celda = [tarea(C1, MAR, "guardia"), obra(C2, MAR, 1, { fraccion: 0.5 })];
  assert.deepEqual(cuentaConGuardias(celda, 2), { ocupado: 0.5, libre: 0.5, guardias: 1 });
});

test("lugar protegido: gris con todas activas; ámbar si una se usó o falta una en la semana", () => {
  // Lunes 02 a viernes 06: la C1 y la C2 llenas; la C3 con su guardia del martes y libre el
  // resto; la C4 con su guardia del jueves y llena el resto.
  const asignaciones = [
    ...[LUN, MAR, MIE, JUE, VIE].flatMap((f) => [obra(C1, f, 1), obra(C2, f, 2)]),
    tarea(C3, MAR, "guardia", 1),
    tarea(C4, JUE, "guardia", 2),
    ...[LUN, MAR, MIE, VIE].map((f) => obra(C4, f, 4)),
    obra(C5, LUN, 5),
  ];
  const g1 = guardia({ id: 1, fecha: MAR, cuadrillaId: C3 });
  const g2 = guardia({ id: 2, fecha: JUE, cuadrillaId: C4, ranura: 2 });
  const base = { hoy: LUN, feriados: SIN_FERIADOS, asignaciones, cuadrillas };
  const todas = lugarProtegido({ ...base, guardias: [g1, g2] });
  assert.deepEqual(todas.dias, [LUN, MAR, MIE, JUE, VIE]);
  // C3: 4 días libres + 1 guardia; C4: 1 guardia. La C5 no cuenta.
  assert.equal(todas.protegido, 6);
  assert.equal(todas.esperadas, 2);
  assert.equal(todas.activas, 2);
  assert.equal(todas.nivel, "gris");

  const unaUsada = lugarProtegido({ ...base, guardias: [g1, { ...g2, estado: "usada" }] });
  assert.equal(unaUsada.activas, 1);
  assert.equal(unaUsada.nivel, "ambar");

  const falta = lugarProtegido({ ...base, guardias: [g1] });
  assert.equal(falta.falta, true);
  assert.equal(falta.nivel, "ambar");
});

// ─── El capataz ─────────────────────────────────────────────────────────────────────────

test("el capataz recibe la guardia como depósito, nunca como guardia", () => {
  const t = tareaParaCapataz(tarea(C3, MAR, "guardia", 77));
  assert.equal(t?.titulo, "Depósito · mantenimiento de material");
  assert.equal(t?.tipo, "deposito");
  assert.doesNotMatch(JSON.stringify(t), /guardia/i);
  assert.equal(tareaParaCapataz({ ...tarea(C3, MAR), cuadrillaId: null }), null);
});
