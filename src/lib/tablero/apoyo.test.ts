import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agruparApoyos,
  apoyosDelTramo,
  diasParaApoyo,
  diasPorOt,
  diasSiAchica,
  esApoyo,
  horarioSugeridoApoyo,
  planDeApoyos,
  textoChipApoyo,
  type DiaDeObra,
} from "./apoyo.ts";

test("diasPorOt: cuenta días distintos por obra, no registros", () => {
  const dias = diasPorOt([
    { otId: 1, fecha: "2026-11-10" },
    { otId: 1, fecha: "2026-11-11" },
    // Dos principales el mismo día (edición a mano en Odoo): sigue siendo un día de obra.
    { otId: 1, fecha: "2026-11-11" },
    { otId: 2, fecha: "2026-11-11" },
  ]);
  assert.equal(dias.get(1), 2);
  assert.equal(dias.get(2), 1);
});

test("diasPorOt: sin OT no cuenta; sin fecha cuenta como un día propio", () => {
  const dias = diasPorOt([
    { otId: null, fecha: "2026-11-10" },
    { otId: 3, fecha: null },
    { otId: 3, fecha: null },
    { otId: 3, fecha: "2026-11-10" },
  ]);
  assert.equal(dias.has(0), false);
  assert.equal(dias.get(3), 3);
});

test("esApoyo: ausente o false es principal", () => {
  assert.equal(esApoyo({}), false);
  assert.equal(esApoyo({ apoyo: false }), false);
  assert.equal(esApoyo({ apoyo: null }), false);
  assert.equal(esApoyo({ apoyo: true }), true);
});

test("agruparApoyos: Thames con C3 de apoyo el martes sale una vez, con el apoyo adentro", () => {
  const filas = [
    { id: 10, otId: 7, fecha: "2026-11-10", cuadrilla: "C2" },
    { id: 11, otId: 7, fecha: "2026-11-11", cuadrilla: "C2" },
    { id: 20, otId: 7, fecha: "2026-11-11", cuadrilla: "C3", apoyo: true },
    { id: 21, otId: 7, fecha: "2026-11-11", cuadrilla: "C4", apoyo: true },
    // Apoyo sin principal ese día: no se pierde, se devuelve aparte.
    { id: 30, otId: 7, fecha: "2026-11-12", cuadrilla: "C3", apoyo: true },
  ];
  const { principales, apoyosDe, huerfanos } = agruparApoyos(filas);
  assert.deepEqual(principales.map((p) => p.id), [10, 11]);
  assert.deepEqual(apoyosDe.get("7|2026-11-11")?.map((a) => a.id), [20, 21]);
  assert.equal(apoyosDe.has("7|2026-11-10"), false);
  assert.deepEqual(huerfanos.map((h) => h.id), [30]);
});

test("horarioSugeridoApoyo: día entero de 8 a 17, fracciones contadas desde la salida", () => {
  assert.deepEqual(horarioSugeridoApoyo(1), { horaDesde: 8, horaHasta: 17 });
  assert.deepEqual(horarioSugeridoApoyo(0.5), { horaDesde: 13, horaHasta: 17 });
  assert.deepEqual(horarioSugeridoApoyo(0.25), { horaDesde: 15, horaHasta: 17 });
  assert.deepEqual(horarioSugeridoApoyo(0.75), { horaDesde: 11, horaHasta: 17 });
  // 0,1 jornada = 48 minutos → 16:12, redondeado al cuarto de hora.
  assert.deepEqual(horarioSugeridoApoyo(0.1), { horaDesde: 16.25, horaHasta: 17 });
  assert.deepEqual(horarioSugeridoApoyo(Number.NaN), { horaDesde: 8, horaHasta: 17 });
});

test("planDeApoyos: los que fueron y los no mencionados se vinculan; los que no fueron se borran", () => {
  const plan = planDeApoyos(
    [
      { id: 20, parteId: null },
      { id: 21, parteId: null },
      { id: 22, parteId: null },
    ],
    [
      { asignacionId: 20, fue: true },
      { asignacionId: 21, fue: false },
    ],
    500,
  );
  assert.deepEqual(plan, { vincular: [20, 22], borrar: [21] });
});

test("planDeApoyos: no toca apoyos colgados de OTRO parte; los de este parte no se re-vinculan", () => {
  const plan = planDeApoyos(
    [
      { id: 20, parteId: 499 },
      { id: 21, parteId: 500 },
      { id: 22, parteId: 500 },
    ],
    [
      { asignacionId: 20, fue: false },
      { asignacionId: 22, fue: false },
    ],
    500,
  );
  assert.deepEqual(plan, { vincular: [], borrar: [22] });
});

test("planDeApoyos: sin lista de la pantalla, cierra todos los apoyos sueltos", () => {
  assert.deepEqual(planDeApoyos([{ id: 1, parteId: null }], undefined, 9), { vincular: [1], borrar: [] });
});

test("apoyosDelTramo: junta por cuadrilla los apoyos de los días del tramo", () => {
  const filas = [
    { otId: 1, fecha: "2026-11-10", cuadrillaId: 2, fraccion: 1 },
    { otId: 1, fecha: "2026-11-11", cuadrillaId: 2, fraccion: 1 },
    { otId: 1, fecha: "2026-11-12", cuadrillaId: 2, fraccion: 1 },
    { otId: 1, fecha: "2026-11-11", cuadrillaId: 3, fraccion: 0.5, apoyo: true },
    { otId: 1, fecha: "2026-11-12", cuadrillaId: 3, fraccion: 0.5, apoyo: true },
    { otId: 1, fecha: "2026-11-12", cuadrillaId: 4, fraccion: 1, apoyo: true },
    // Otra obra el mismo día: no se mezcla.
    { otId: 9, fecha: "2026-11-11", cuadrillaId: 5, fraccion: 1, apoyo: true },
  ];
  const { apoyosDe } = agruparApoyos(filas);
  const r = apoyosDelTramo(1, ["2026-11-10", "2026-11-11"], apoyosDe);
  assert.deepEqual(r, [{ cuadrillaId: 3, fechas: ["2026-11-11"], fracciones: [0.5] }]);
  const todo = apoyosDelTramo(1, ["2026-11-10", "2026-11-11", "2026-11-12"], apoyosDe);
  assert.deepEqual(todo.map((x) => [x.cuadrillaId, x.fechas.length]), [[3, 2], [4, 1]]);
});

test("textoChipApoyo: fracción sólo si es pareja, días sólo si es parcial", () => {
  assert.equal(textoChipApoyo("C3", [0.5], 1), "+C3 ½");
  assert.equal(textoChipApoyo("C3", [1], 1), "+C3");
  assert.equal(textoChipApoyo("C3", [0.5], 3), "+C3 ½ (1d)");
  assert.equal(textoChipApoyo("C3", [1, 1, 1], 3), "+C3");
  assert.equal(textoChipApoyo("C3", [1, 0.5], 2), "+C3");
});

test("diasParaApoyo: saltea sin principal, misma cuadrilla, duplicado y no ejecutado", () => {
  const dias: DiaDeObra[] = [
    { fecha: "2026-11-09", cuadrillaId: 2, estado: "confirmada", conParte: true, parteNoEjecutado: true },
    { fecha: "2026-11-10", cuadrillaId: 2, estado: "confirmada", conParte: true },
    { fecha: "2026-11-11", cuadrillaId: 2, estado: "confirmada", conParte: false },
    { fecha: "2026-11-12", cuadrillaId: 3, estado: "tentativa", conParte: false },
    { fecha: "2026-11-13", cuadrillaId: 2, estado: "tentativa", conParte: false },
  ];
  const r = diasParaApoyo(
    ["2026-11-13", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-14", "2026-11-11"],
    dias,
    3,
    [{ fecha: "2026-11-13", cuadrillaId: 3 }],
  );
  // El día con parte cargado SÍ entra (apoyo.md: "sumar el apoyo después de cargar el
  // parte"), marcado para que la pantalla avise que queda vinculado.
  assert.deepEqual(r.sumar.map((d) => [d.fecha, d.conParte]), [["2026-11-10", true], ["2026-11-11", false]]);
  assert.deepEqual(r.saltados.map((s) => s.fecha), ["2026-11-09", "2026-11-12", "2026-11-13", "2026-11-14"]);
  assert.match(r.saltados[0].motivo, /no ejecutado/);
  assert.match(r.saltados[1].motivo, /principal/);
  assert.match(r.saltados[2].motivo, /ya es apoyo/);
  assert.match(r.saltados[3].motivo, /no tiene cuadrilla principal/);
});

test("diasSiAchica: ofrece achicar sólo cuando achica", () => {
  assert.equal(diasSiAchica(4, 1), 2);
  assert.equal(diasSiAchica(4, 0.5), 3);
  assert.equal(diasSiAchica(3, 1), 2);
  assert.equal(diasSiAchica(1, 1), null);
  assert.equal(diasSiAchica(2, 0.25), null);
  assert.equal(diasSiAchica(4, 0), null);
});
