import { test } from "node:test";
import assert from "node:assert/strict";
import { agruparBloques, planDeObras, primerBloqueDeObra } from "./bloques.ts";
import type { AsignacionTablero } from "./tipos.ts";

let id = 1;
function asig(p: Partial<AsignacionTablero> & { otId: number; fecha: string; cuadrillaId: number | null }): AsignacionTablero {
  return {
    id: id++,
    fraccion: 1,
    estado: "tentativa",
    ordenDia: 0,
    notas: null,
    parteId: null,
    motivoFija: null,
    ...p,
  };
}

// Thames 1820: 3 días con la C2 (lun a mié); el martes la C3 va de apoyo, medio día.
const thames = () => [
  asig({ otId: 7, fecha: "2026-11-09", cuadrillaId: 2 }),
  asig({ otId: 7, fecha: "2026-11-10", cuadrillaId: 2 }),
  asig({ otId: 7, fecha: "2026-11-11", cuadrillaId: 2 }),
  asig({ otId: 7, fecha: "2026-11-10", cuadrillaId: 3, fraccion: 0.5, apoyo: true }),
];

test("agruparBloques: el apoyo es su propia tarjeta, no se pega a la principal", () => {
  const bloques = agruparBloques(thames());
  const principal = bloques.filter((b) => !b.apoyo);
  const apoyo = bloques.filter((b) => b.apoyo);
  assert.equal(principal.length, 1);
  assert.deepEqual(principal[0].fechas, ["2026-11-09", "2026-11-10", "2026-11-11"]);
  assert.equal(apoyo.length, 1);
  assert.equal(apoyo[0].cuadrillaId, 3);
  assert.deepEqual(apoyo[0].fechas, ["2026-11-10"]);
});

test("agruparBloques: aun en la misma cuadrilla, apoyo y principal no se mezclan", () => {
  const bloques = agruparBloques([
    asig({ otId: 8, fecha: "2026-11-09", cuadrillaId: 2 }),
    asig({ otId: 8, fecha: "2026-11-10", cuadrillaId: 2, apoyo: true }),
  ]);
  assert.equal(bloques.length, 2);
  assert.deepEqual(bloques.map((b) => b.apoyo).sort(), [false, true]);
});

test("agruparBloques: lo viejo (sin campo apoyo) sigue siendo principal", () => {
  const [b] = agruparBloques([asig({ otId: 9, fecha: "2026-11-09", cuadrillaId: 1 })]);
  assert.equal(b.apoyo, false);
});

test("planDeObras: la obra con apoyo sigue diciendo 3 días y un tramo", () => {
  const plan = planDeObras(agruparBloques(thames())).get(7);
  assert.deepEqual(plan, { dias: 3, tramos: 1, primerDia: "2026-11-09", ultimoDia: "2026-11-11" });
});

test("planDeObras: cuenta días distintos aunque haya dos principales el mismo día", () => {
  const plan = planDeObras(
    agruparBloques([
      asig({ otId: 5, fecha: "2026-11-09", cuadrillaId: 1 }),
      asig({ otId: 5, fecha: "2026-11-09", cuadrillaId: 4 }),
      asig({ otId: 5, fecha: "2026-11-12", cuadrillaId: 1 }),
    ]),
  ).get(5);
  assert.equal(plan?.dias, 2);
  assert.equal(plan?.tramos, 3);
  assert.equal(plan?.primerDia, "2026-11-09");
  assert.equal(plan?.ultimoDia, "2026-11-12");
});

test("planDeObras: una obra que sólo tiene apoyos en el rango no figura como planificada", () => {
  const plan = planDeObras(agruparBloques([asig({ otId: 6, fecha: "2026-11-09", cuadrillaId: 3, apoyo: true })]));
  assert.equal(plan.has(6), false);
});

test("primerBloqueDeObra: la ficha abre en la principal, nunca en el apoyo", () => {
  const bloques = agruparBloques([
    asig({ otId: 7, fecha: "2026-11-09", cuadrillaId: 3, apoyo: true }),
    asig({ otId: 7, fecha: "2026-11-10", cuadrillaId: 2 }),
  ]);
  const b = primerBloqueDeObra(bloques, 7);
  assert.equal(b?.apoyo, false);
  assert.equal(b?.cuadrillaId, 2);
  assert.equal(primerBloqueDeObra(bloques, 99), null);
});
