import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apoyosAlEditarJornadas,
  apoyosDe,
  apoyosDeDias,
  arrastreDeApoyos,
  conflictosDeApoyo,
  estadoDespues,
  textoConflicto,
  type FilaRol,
} from "./apoyo.ts";

// Thames 1820 (OT 7): C2 principal lun y mar, C3 de apoyo el mar. Otra obra (OT 8) el mar
// con su propio apoyo, para comprobar que no se mezclan.
const C2 = 2;
const C3 = 3;
const C4 = 4;
const filas: FilaRol[] = [
  { id: 1, otId: 7, fecha: "2026-11-09", cuadrillaId: C2, apoyo: false },
  { id: 2, otId: 7, fecha: "2026-11-10", cuadrillaId: C2, apoyo: false },
  { id: 3, otId: 7, fecha: "2026-11-10", cuadrillaId: C3, apoyo: true },
  { id: 4, otId: 8, fecha: "2026-11-10", cuadrillaId: C4, apoyo: false },
  { id: 5, otId: 8, fecha: "2026-11-10", cuadrillaId: C3, apoyo: true },
];

test("apoyosDe: sólo los apoyos de esa obra ese día", () => {
  assert.deepEqual(apoyosDe(filas, 7, "2026-11-10").map((f) => f.id), [3]);
  assert.deepEqual(apoyosDe(filas, 7, "2026-11-09"), []);
  assert.deepEqual(apoyosDe(filas, 8, "2026-11-10").map((f) => f.id), [5]);
});

test("apoyosDe: una fila sin `apoyo` es principal (lo viejo)", () => {
  assert.deepEqual(apoyosDe([{ otId: 7, fecha: "2026-11-10" }], 7, "2026-11-10"), []);
});

test("apoyosDeDias: junta los de varios días del bloque", () => {
  assert.deepEqual(apoyosDeDias(filas, 7, ["2026-11-09", "2026-11-10"]).map((f) => f.id), [3]);
});

test("arrastreDeApoyos: el apoyo va con la principal a su nuevo día, en su cuadrilla", () => {
  const r = arrastreDeApoyos(
    filas,
    7,
    [
      { desde: "2026-11-09", hasta: "2026-11-11" },
      { desde: "2026-11-10", hasta: "2026-11-12" },
    ],
    C2,
  );
  assert.deepEqual(r.mover.map((m) => [m.apoyo.id, m.fecha]), [[3, "2026-11-12"]]);
  assert.deepEqual(r.choques, []);
});

test("arrastreDeApoyos: mismo día no mueve nada", () => {
  const r = arrastreDeApoyos(filas, 7, [{ desde: "2026-11-10", hasta: "2026-11-10" }], C4);
  assert.deepEqual(r.mover, []);
  assert.deepEqual(r.choques, []);
});

test("arrastreDeApoyos: la principal cae en la fila de su propio apoyo → choque", () => {
  const r = arrastreDeApoyos(filas, 7, [{ desde: "2026-11-10", hasta: "2026-11-10" }], C3);
  assert.deepEqual(r.choques.map((a) => a.id), [3]);
  assert.deepEqual(r.mover, []);
});

test("arrastreDeApoyos: sin cuadrilla destino no mira choques", () => {
  const r = arrastreDeApoyos(filas, 7, [{ desde: "2026-11-10", hasta: "2026-11-13" }], null);
  assert.deepEqual(r.mover.map((m) => m.apoyo.id), [3]);
});

function validar(cambios: Parameters<typeof estadoDespues>[1], base = filas) {
  const { despues, claves } = estadoDespues(base, cambios);
  return conflictosDeApoyo(base, despues, claves);
}

test("validar: mover la principal sola deja al apoyo sin principal", () => {
  const c = validar({ mover: [{ id: 2, fecha: "2026-11-12" }] });
  assert.deepEqual(c.map((x) => [x.tipo, x.fecha]), [["sin-principal", "2026-11-10"]]);
});

test("validar: mover la principal con su apoyo en la misma request está bien", () => {
  const c = validar({
    mover: [
      { id: 2, fecha: "2026-11-12" },
      { id: 3, fecha: "2026-11-12" },
    ],
  });
  assert.deepEqual(c, []);
});

test("validar: crear un apoyo un día sin principal", () => {
  const c = validar({ crear: [{ otId: 7, fecha: "2026-11-11", cuadrillaId: C3, apoyo: true }] });
  assert.deepEqual(c.map((x) => x.tipo), ["sin-principal"]);
});

test("validar: crear una segunda principal el mismo día", () => {
  const c = validar({ crear: [{ otId: 7, fecha: "2026-11-09", cuadrillaId: C4 }] });
  assert.deepEqual(c.map((x) => x.tipo), ["dos-principales"]);
});

test("validar: apoyo en la cuadrilla de la principal", () => {
  const c = validar({ crear: [{ otId: 7, fecha: "2026-11-09", cuadrillaId: C2, apoyo: true }] });
  assert.deepEqual(c.map((x) => [x.tipo, x.cuadrillaId]), [["misma-cuadrilla", C2]]);
  // Y pasar el apoyo existente a la fila de la principal, también.
  const d = validar({ mover: [{ id: 3, fecha: "2026-11-10", cuadrillaId: C2 }] });
  assert.deepEqual(d.map((x) => x.tipo), ["misma-cuadrilla"]);
});

test("validar: hacer principal intercambia en un solo gesto y queda sano", () => {
  const c = validar({ roles: [{ id: 2, apoyo: true }, { id: 3, apoyo: false }] });
  assert.deepEqual(c, []);
  // A medias (sólo uno de los dos) no: dos principales.
  const d = validar({ roles: [{ id: 3, apoyo: false }] });
  assert.deepEqual(d.map((x) => x.tipo), ["dos-principales"]);
});

test("validar: borrar la principal sin su apoyo lo deja huérfano; con él, no", () => {
  assert.deepEqual(validar({ borrar: [2] }).map((x) => x.tipo), ["sin-principal"]);
  assert.deepEqual(validar({ borrar: [2, 3] }), []);
});

test("validar: un día que ya venía roto no frena un gesto que no lo empeora", () => {
  const roto: FilaRol[] = [
    ...filas,
    // Huérfano viejo: apoyo el miércoles sin principal.
    { id: 9, otId: 7, fecha: "2026-11-11", cuadrillaId: C4, apoyo: true },
  ];
  // Quitar el huérfano, o mover la principal del martes ahí con su apoyo, no se frena.
  assert.deepEqual(validar({ borrar: [9] }, roto), []);
  assert.deepEqual(
    validar({ mover: [{ id: 2, fecha: "2026-11-11" }, { id: 3, fecha: "2026-11-11" }] }, roto),
    [],
  );
});

test("validar: otra obra el mismo día no cuenta", () => {
  // OT 8 tiene a C3 de apoyo el martes; que C3 sea principal de OT 7 ese día no choca.
  const c = validar({ crear: [{ otId: 7, fecha: "2026-11-09", cuadrillaId: C3, apoyo: true }] });
  assert.deepEqual(c, []);
});

test("textoConflicto: dice el día y qué hacer", () => {
  const t = textoConflicto(
    { tipo: "misma-cuadrilla", otId: 7, fecha: "2026-11-10", cuadrillaId: C2 },
    () => "Cuadrilla 2",
  );
  assert.match(t, /Cuadrilla 2/);
  assert.match(t, /mar 10\/11/);
  assert.match(textoConflicto({ tipo: "dos-principales", otId: 7, fecha: "2026-11-09", cuadrillaId: null }), /apoyo/);
});

// ── Editor de jornadas: sacar días y mover otros a la vez ───────────────────

type FilaEditor = FilaRol & { parteId: number | null };
const lun = "2026-11-09", mar = "2026-11-10", mie = "2026-11-11", jue = "2026-11-12";
const obra: FilaEditor[] = [
  { id: 10, otId: 7, fecha: lun, cuadrillaId: C2, apoyo: false, parteId: null },
  { id: 11, otId: 7, fecha: mar, cuadrillaId: C2, apoyo: false, parteId: null },
  { id: 12, otId: 7, fecha: mie, cuadrillaId: C2, apoyo: false, parteId: null },
  { id: 21, otId: 7, fecha: mar, cuadrillaId: C3, apoyo: true, parteId: null },
  { id: 22, otId: 7, fecha: mie, cuadrillaId: C3, apoyo: true, parteId: null },
];
const principalesObra = obra.filter((f) => !f.apoyo).map((f) => ({ id: f.id, fecha: f.fecha as string }));

test("apoyosAlEditarJornadas: saco el martes y junto los días — el apoyo del martes se borra y el del miércoles llega", () => {
  const r = apoyosAlEditarJornadas(obra, 7, principalesObra, [11], [{ asignacionId: 12, fecha: mar }]);
  assert.deepEqual(r.borrar.map((a) => a.id), [21]);
  assert.deepEqual(r.mover.map((m) => [m.apoyo.id, m.fecha]), [[22, mar]]);
  // Y así el borrado, que sale primero y solo, no deja ningún apoyo sin principal.
  const { despues, claves } = estadoDespues(obra, { borrar: [11, 21] });
  assert.deepEqual(conflictosDeApoyo(obra, despues, claves), []);
});

test("apoyosAlEditarJornadas: el apoyo de un día que sigue quieto se queda", () => {
  const r = apoyosAlEditarJornadas(obra, 7, principalesObra, [], [{ asignacionId: 10, fecha: jue }]);
  assert.deepEqual(r.mover, []);
  assert.deepEqual(r.borrar, []);
});

test("apoyosAlEditarJornadas: nunca dos apoyos de la misma cuadrilla el mismo día", () => {
  // Dos principales el martes (dato roto de Odoo): una se queda, la del miércoles llega.
  const filas: FilaEditor[] = [...obra, { id: 13, otId: 7, fecha: mar, cuadrillaId: C4, apoyo: false, parteId: null }];
  const principales = filas.filter((f) => !f.apoyo).map((f) => ({ id: f.id, fecha: f.fecha as string }));
  const r = apoyosAlEditarJornadas(filas, 7, principales, [11], [{ asignacionId: 12, fecha: mar }]);
  // El martes sigue con principal quieta (13), así que su apoyo C3 se queda; el C3 del
  // miércoles que llegaría se borra en vez de duplicarse.
  assert.deepEqual(r.mover, []);
  assert.deepEqual(r.borrar.map((a) => a.id), [22]);
});

test("apoyosAlEditarJornadas: un apoyo con parte no se toca", () => {
  const filas = obra.map((f) => (f.id === 21 ? { ...f, parteId: 99 } : f));
  const r = apoyosAlEditarJornadas(filas, 7, principalesObra, [11], []);
  assert.deepEqual(r.borrar, []);
});

test("conflictosDeApoyo: la misma cuadrilla dos veces de apoyo el mismo día", () => {
  const antes: FilaRol[] = [
    { id: 1, otId: 7, fecha: mar, cuadrillaId: C2, apoyo: false },
    { id: 2, otId: 7, fecha: mar, cuadrillaId: C3, apoyo: true },
    { id: 3, otId: 7, fecha: mar, cuadrillaId: C4, apoyo: true },
  ];
  const { despues, claves } = estadoDespues(antes, { mover: [{ id: 3, fecha: mar, cuadrillaId: C3 }] });
  assert.deepEqual(conflictosDeApoyo(antes, despues, claves).map((c) => c.tipo), ["apoyo-duplicado"]);
  assert.match(textoConflicto({ tipo: "apoyo-duplicado", otId: 7, fecha: mar, cuadrillaId: C3 }, () => "Cuadrilla 3"), /ya es apoyo/);
});
