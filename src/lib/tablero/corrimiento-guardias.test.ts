import { test } from "node:test";
import assert from "node:assert/strict";
import { invertirCorrimiento, planearCorrimiento, type EntradaCorrimiento } from "./corrimiento.ts";
import type { AsignacionTablero, CuadrillaTablero, OtTablero } from "./tipos.ts";

// El corrimiento consume las guardias (guardias-contrato.md §1.4): lo que la lluvia empuja
// sobre una guardia activa la reemplaza —no se suma—, la cascada se frena ahí y el deshacer
// la vuelve a "activa".
//
// Martes 10/11 llueve. La C2 tiene Thames 1820 (OT 7) el martes y su guardia el miércoles.

const C2 = 2;
const C3 = 3;
const MAR = "2026-11-10";
const MIE = "2026-11-11";
const JUE = "2026-11-12";
const VIE = "2026-11-13";

function obra(p: Partial<AsignacionTablero> & Pick<AsignacionTablero, "id" | "otId" | "fecha" | "cuadrillaId">): AsignacionTablero {
  return { origen: "ot", fraccion: 1, estado: "tentativa", ordenDia: 0, notas: null, parteId: null, motivoFija: null, ...p };
}
function tarea(id: number, fecha: string, cuadrillaId: number, tipo: string): AsignacionTablero {
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
const guardia = (id: number, fecha: string, cuadrillaId: number) => tarea(id, fecha, cuadrillaId, "guardia");

const cuadrillas = [
  { id: C2, nombre: "Cuadrilla 2" },
  { id: C3, nombre: "Cuadrilla 3" },
] as CuadrillaTablero[];

const ots = new Map<number, OtTablero>([
  [7, { id: 7, titulo: "Thames 1820", fechaAntesDe: null } as OtTablero],
  [8, { id: 8, titulo: "Callao 1810", fechaAntesDe: null } as OtTablero],
]);

function entrada(asignaciones: AsignacionTablero[], cuadrillaIds: number[], modo: "dia" | "cascada" = "dia"): EntradaCorrimiento {
  return { asignaciones, ots, cuadrillas, dia: MAR, cuadrillaIds, modo, hastaCargado: "2026-12-31" };
}

test("lo que cae sobre una guardia la consume y no suma sobrecarga", () => {
  const plan = planearCorrimiento(entrada([obra({ id: 1, otId: 7, fecha: MAR, cuadrillaId: C2 }), guardia(500, MIE, C2)], [C2]));
  assert.deepEqual(plan.movimientos, [{ id: 1, fecha: MIE }]);
  assert.deepEqual(plan.sobrecargas, []);
  assert.deepEqual(plan.guardiasConsumidas, [
    { id: 500, cuadrillaId: C2, cuadrillaNombre: "Cuadrilla 2", fecha: MIE, obras: [{ otId: 7, titulo: "Thames 1820" }] },
  ]);
});

test("con una tarea común en vez de la guardia, lo que cae se suma (como siempre)", () => {
  const plan = planearCorrimiento(entrada([obra({ id: 1, otId: 7, fecha: MAR, cuadrillaId: C2 }), tarea(500, MIE, C2, "deposito")], [C2]));
  assert.deepEqual(plan.guardiasConsumidas, []);
  assert.deepEqual(plan.sobrecargas.map((s) => [s.fecha, s.carga]), [[MIE, 2]]);
});

test("cascada: se frena en la guardia y lo de después no se mueve", () => {
  const plan = planearCorrimiento(
    entrada(
      [
        obra({ id: 1, otId: 7, fecha: MAR, cuadrillaId: C2 }),
        guardia(500, MIE, C2),
        obra({ id: 2, otId: 8, fecha: JUE, cuadrillaId: C2 }),
      ],
      [C2],
      "cascada",
    ),
  );
  assert.deepEqual(plan.movimientos, [{ id: 1, fecha: MIE }]);
  assert.deepEqual(plan.guardiasConsumidas.map((g) => g.id), [500]);
  assert.deepEqual(plan.sobrecargas, []);
});

test("cascada: la guardia del final de la cadena es la que se consume", () => {
  const plan = planearCorrimiento(
    entrada(
      [
        obra({ id: 1, otId: 7, fecha: MAR, cuadrillaId: C2 }),
        obra({ id: 2, otId: 7, fecha: MIE, cuadrillaId: C2 }),
        guardia(500, JUE, C2),
        obra({ id: 3, otId: 8, fecha: VIE, cuadrillaId: C2 }),
      ],
      [C2],
      "cascada",
    ),
  );
  assert.deepEqual(new Map(plan.movimientos.map((m) => [m.id, m.fecha])), new Map([[1, MIE], [2, JUE]]));
  assert.deepEqual(plan.guardiasConsumidas.map((g) => [g.id, g.fecha]), [[500, JUE]]);
  assert.deepEqual(plan.sobrecargas, []);
});

test("la guardia del día suspendido no se consume", () => {
  const plan = planearCorrimiento(entrada([guardia(500, MAR, C2), obra({ id: 1, otId: 7, fecha: MAR, cuadrillaId: C3 })], [C2, C3]));
  assert.deepEqual(plan.guardiasConsumidas, []);
  assert.deepEqual(plan.movimientos, [{ id: 1, fecha: MIE }]);
});

test("la guardia de otra cuadrilla no se toca", () => {
  const plan = planearCorrimiento(entrada([obra({ id: 1, otId: 7, fecha: MAR, cuadrillaId: C2 }), guardia(500, MIE, C3)], [C2]));
  assert.deepEqual(plan.guardiasConsumidas, []);
});

test("un apoyo que sigue a su principal también consume la guardia de su cuadrilla", () => {
  const plan = planearCorrimiento(
    entrada(
      [
        obra({ id: 1, otId: 7, fecha: MAR, cuadrillaId: C2 }),
        obra({ id: 2, otId: 7, fecha: MAR, cuadrillaId: C3, apoyo: true }),
        guardia(500, MIE, C3),
      ],
      [C2],
    ),
  );
  assert.deepEqual(plan.guardiasConsumidas.map((g) => [g.id, g.cuadrillaId]), [[500, C3]]);
  assert.deepEqual(plan.sobrecargas, []);
});

test("el id de la guardia no se confunde con el de una jornada de Odoo", () => {
  // La guardia 1 (tablero_tareas) y la jornada 1 (Odoo) son cosas distintas.
  const plan = planearCorrimiento(entrada([obra({ id: 1, otId: 7, fecha: MAR, cuadrillaId: C2 }), guardia(1, MIE, C2)], [C2]));
  assert.deepEqual(plan.guardiasConsumidas.map((g) => g.id), [1]);
  assert.deepEqual(plan.sobrecargas, []);
});

test("deshacer devuelve las guardias consumidas para reactivarlas", () => {
  const plan = planearCorrimiento(entrada([obra({ id: 1, otId: 7, fecha: MAR, cuadrillaId: C2 }), guardia(500, MIE, C2)], [C2]));
  const vuelta = invertirCorrimiento(plan.registros, plan.apoyosQuitados, plan.guardiasConsumidas);
  assert.deepEqual(vuelta.reactivarGuardias, [500]);
  assert.deepEqual(vuelta.movimientos, [{ id: 1, fecha: MAR }]);
});
