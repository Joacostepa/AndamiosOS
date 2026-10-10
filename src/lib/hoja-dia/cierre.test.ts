// La precarga de "Cerrar jornada" desde la hoja (I8 de la revisión): los horarios salen de
// las obras, el encuentro y el "busca", no de un 8 a 17 fijo para todos.

import { test } from "node:test";
import assert from "node:assert/strict";
import { horariosCierre } from "./estado.ts";
import type { DiaHoja } from "./tipos.ts";
import { OT, martesArmado } from "./escenario.test-fixture.ts";

test("I8: una cuadrilla con tres obras: cada obra va de su hora a la de la siguiente", () => {
  const d = martesArmado();
  assert.deepEqual(horariosCierre(d, 2, OT.jur), [{ personas: 5, desde: "7:00", hasta: "10:15" }]);
  assert.deepEqual(horariosCierre(d, 2, OT.cuba), [{ personas: 5, desde: "10:15", hasta: "13:00" }]);
  assert.deepEqual(horariosCierre(d, 2, OT.cab), [{ personas: 5, desde: "13:00", hasta: "17:00" }]);
});

test("I8: con lleva y trae, del encuentro al busca (no 8 a 17)", () => {
  assert.deepEqual(horariosCierre(martesArmado(), 3, OT.riv), [{ personas: 5, desde: "7:45", hasta: "16:30" }]);
});

test("I8: el ausente no cuenta y la parcial tiene su propia línea", () => {
  const d0 = martesArmado();
  const d: DiaHoja = {
    ...d0,
    ausencias: [
      ...d0.ausencias,
      { id: "a1", personaId: "avila", desde: d0.fecha, hasta: d0.fecha, tipo: "enfermedad", horaDesde: null, horaHasta: null, nota: null, origen: "planificador" },
      { id: "a2", personaId: "cabrera", desde: d0.fecha, hasta: d0.fecha, tipo: "tramite", horaDesde: null, horaHasta: "14:00", nota: null, origen: "planificador" },
    ],
  };
  assert.deepEqual(horariosCierre(d, 3, OT.riv), [
    { personas: 3, desde: "7:45", hasta: "16:30" },
    { personas: 1, desde: "7:45", hasta: "14:00" },
  ]);
});

test("I8: el chofer de todo el día suma; una obra que no es de la cuadrilla no sugiere nada", () => {
  const d = martesArmado();
  assert.equal(horariosCierre(d, 5, OT.sj)[0].personas, 4);
  assert.deepEqual(horariosCierre(d, 5, OT.riv), []);
});
