import { test } from "node:test";
import assert from "node:assert/strict";
import { invertirCorrimiento, planearCorrimiento, type EntradaCorrimiento } from "./corrimiento.ts";
import type { AsignacionTablero, CuadrillaTablero, OtTablero } from "./tipos.ts";

// Correr el día con cuadrillas de apoyo (apoyo.md, etapa 3).
//
// Thames 1820 (OT 7): C2 principal mar 10 y mié 11; C3 de apoyo el mar 10. La C3 además
// tiene su propia obra (OT 9) el mar 10 a la mañana.

const C2 = 2;
const C3 = 3;
const MAR = "2026-11-10";
const MIE = "2026-11-11";
const JUE = "2026-11-12";

function asig(p: Partial<AsignacionTablero> & Pick<AsignacionTablero, "id" | "otId" | "fecha" | "cuadrillaId">): AsignacionTablero {
  return {
    fraccion: 1,
    estado: "tentativa",
    ordenDia: 0,
    notas: null,
    parteId: null,
    motivoFija: null,
    ...p,
  };
}

const cuadrillas = [
  { id: C2, nombre: "Cuadrilla 2" },
  { id: C3, nombre: "Cuadrilla 3" },
] as CuadrillaTablero[];

const ots = new Map<number, OtTablero>([
  [7, { id: 7, titulo: "Thames 1820", fechaAntesDe: null } as OtTablero],
  [9, { id: 9, titulo: "Callao 1810", fechaAntesDe: null } as OtTablero],
]);

function entrada(asignaciones: AsignacionTablero[], cuadrillaIds: number[], modo: "dia" | "cascada" = "dia"): EntradaCorrimiento {
  return { asignaciones, ots, cuadrillas, dia: MAR, cuadrillaIds, modo, hastaCargado: "2026-12-31" };
}

const base = (): AsignacionTablero[] => [
  asig({ id: 1, otId: 7, fecha: MAR, cuadrillaId: C2 }),
  asig({ id: 2, otId: 7, fecha: MIE, cuadrillaId: C2 }),
  asig({ id: 3, otId: 7, fecha: MAR, cuadrillaId: C3, apoyo: true, fraccion: 0.5, estado: "confirmada", ordenDia: 1 }),
  asig({ id: 4, otId: 9, fecha: MAR, cuadrillaId: C3, fraccion: 0.5 }),
];

test("se suspende la principal: el apoyo se corre con ella aunque su cuadrilla salga", () => {
  const plan = planearCorrimiento(entrada(base(), [C2]));
  const destino = new Map(plan.movimientos.map((m) => [m.id, m.fecha]));
  assert.equal(destino.get(1), MIE);
  assert.equal(destino.get(3), MIE, "el apoyo va al mismo día que su principal");
  assert.equal(destino.has(4), false, "la obra propia de la C3 no se toca");
  assert.deepEqual(plan.quitar, []);
});

test("se suspenden las dos: el apoyo va con su principal y no por la cadena de su cuadrilla", () => {
  const plan = planearCorrimiento(entrada(base(), [C2, C3]));
  const destino = new Map(plan.movimientos.map((m) => [m.id, m.fecha]));
  assert.equal(destino.get(3), MIE);
  assert.equal(destino.get(4), MIE);
  // Una sola vez: no lo mueve también la cadena de la C3.
  assert.equal(plan.movimientos.filter((m) => m.id === 3).length, 1);
  assert.deepEqual(plan.quitar, []);
});

test("se suspende sólo el apoyo: se quita y queda anotado", () => {
  const plan = planearCorrimiento(entrada(base(), [C3]));
  assert.deepEqual(plan.quitar, [3]);
  assert.equal(plan.apoyosQuitados[0].titulo, "Thames 1820");
  assert.equal(plan.apoyosQuitados[0].cuadrillaNombre, "Cuadrilla 3");
  assert.equal(plan.movimientos.some((m) => m.id === 3), false);
  // Su obra propia sí se corre.
  assert.deepEqual(plan.movimientos.map((m) => m.id), [4]);
  assert.equal(plan.registrosApoyo.length, 1);
  assert.equal(plan.registrosApoyo[0].accion, "quitar");
  assert.equal(plan.registrosApoyo[0].antes?.apoyo, true);
  assert.equal(plan.registrosApoyo[0].despues, null);
});

test("el apoyo quitado no cuenta en la carga del día", () => {
  // La C3 sólo tiene el apoyo: sin él, el día queda vacío y no aparece como "sola".
  const asignaciones = base().filter((a) => a.id !== 4);
  const plan = planearCorrimiento(entrada(asignaciones, [C3]));
  assert.deepEqual(plan.quitar, [3]);
  assert.equal(plan.jornadas, 0);
  assert.deepEqual(plan.solas, []);
});

test("la principal fija se queda: el apoyo de una cuadrilla suspendida se quita", () => {
  const asignaciones = base().map((a) => (a.id === 1 ? { ...a, motivoFija: "grúa alquilada" } : a));
  const plan = planearCorrimiento(entrada(asignaciones, [C2, C3]));
  assert.deepEqual(plan.quitar, [3]);
  assert.equal(plan.movimientos.some((m) => m.id === 1), false);
});

test("un apoyo con parte no se mueve ni se quita", () => {
  const asignaciones = base().map((a) => (a.id === 3 ? { ...a, parteId: 50 } : a));
  const plan = planearCorrimiento(entrada(asignaciones, [C3]));
  assert.deepEqual(plan.quitar, []);
  assert.equal(plan.movimientos.some((m) => m.id === 3), false);
});

test("cascada: el apoyo del día siguiente sigue a su principal", () => {
  const asignaciones = [
    ...base(),
    asig({ id: 5, otId: 7, fecha: MIE, cuadrillaId: C3, apoyo: true }),
  ];
  const plan = planearCorrimiento(entrada(asignaciones, [C2], "cascada"));
  const destino = new Map(plan.movimientos.map((m) => [m.id, m.fecha]));
  assert.equal(destino.get(2), JUE);
  assert.equal(destino.get(5), JUE);
});

test("cascada: el apoyo no estira la cadena de su cuadrilla", () => {
  // La C3 suspendida el martes; el miércoles sólo tiene un apoyo de una obra que NO se
  // corre (la C2 salió). La cadena de la C3 se frena ahí: el apoyo no se empuja.
  const asignaciones = [
    asig({ id: 4, otId: 9, fecha: MAR, cuadrillaId: C3 }),
    asig({ id: 2, otId: 7, fecha: MIE, cuadrillaId: C2 }),
    asig({ id: 5, otId: 7, fecha: MIE, cuadrillaId: C3, apoyo: true }),
  ];
  const plan = planearCorrimiento(entrada(asignaciones, [C3], "cascada"));
  assert.deepEqual(plan.movimientos, [{ id: 4, fecha: MIE }]);
  assert.deepEqual(plan.quitar, [], "el apoyo del miércoles no es del día suspendido");
  // El miércoles la C3 queda con su obra y el apoyo: se avisa, no se acomoda.
  assert.equal(plan.sobrecargas.some((s) => s.cuadrillaId === C3 && s.fecha === MIE), true);
});

test("el apoyo corrido va en su propia fila del historial, marcado como apoyo", () => {
  const plan = planearCorrimiento(entrada(base(), [C2]));
  const delApoyo = plan.registros.find((r) => r.antes.cuadrillaId === C3);
  assert.ok(delApoyo);
  assert.equal(delApoyo.antes.apoyo, true);
  assert.deepEqual(delApoyo.asignacionIds, [3]);
  const dePrincipal = plan.registros.find((r) => r.antes.cuadrillaId === C2);
  assert.equal(dePrincipal?.antes.apoyo, undefined);
});

test("el apoyo no repite la obra en la lista de confirmadas", () => {
  const asignaciones = base().map((a) => (a.otId === 7 ? { ...a, estado: "confirmada" as const } : a));
  const plan = planearCorrimiento(entrada(asignaciones, [C2]));
  assert.equal(plan.confirmadas.filter((c) => c.otId === 7).length, 1);
});

test("deshacer: vuelve a crear los apoyos quitados, como estaban", () => {
  const plan = planearCorrimiento(entrada(base(), [C3]));
  const vuelta = invertirCorrimiento(plan.registros, plan.apoyosQuitados);
  assert.deepEqual(vuelta.movimientos, [{ id: 4, fecha: MAR }]);
  assert.deepEqual(vuelta.crear, [
    { otId: 7, fecha: MAR, cuadrillaId: C3, fraccion: "0.50", estado: "confirmada", ordenDia: 1, notas: null, apoyo: true },
  ]);
  assert.equal(vuelta.registrosApoyo.length, 1);
  assert.equal(vuelta.registrosApoyo[0].accion, "crear");
  assert.equal(vuelta.registrosApoyo[0].despues?.apoyo, true);
});

test("deshacer sin apoyos quitados: igual que antes", () => {
  const plan = planearCorrimiento(entrada(base(), [C2]));
  const vuelta = invertirCorrimiento(plan.registros);
  assert.deepEqual(vuelta.crear, []);
  assert.deepEqual(
    new Map(vuelta.movimientos.map((m) => [m.id, m.fecha])),
    new Map([[1, MAR], [3, MAR]]),
  );
});

test("un apoyo fijo igual se corre con su principal: no queda huérfano", () => {
  // La fijación de un apoyo sólo puede venir de Odoo a mano: el tablero no deja fijarlo, y
  // mover la tarjeta ya lo arrastra sin mirarla. El corrimiento sigue la misma regla.
  const asignaciones = base().map((a) => (a.id === 3 ? { ...a, motivoFija: "a mano en Odoo" } : a));
  const plan = planearCorrimiento(entrada(asignaciones, [C2]));
  const destino = new Map(plan.movimientos.map((m) => [m.id, m.fecha]));
  assert.equal(destino.get(1), MIE);
  assert.equal(destino.get(3), MIE);
  assert.equal(plan.fijas.some((f) => f.motivo === "a mano en Odoo"), false);
});
