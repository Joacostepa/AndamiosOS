// Los gestos del Pizarrón (gestos-pizarron.ts): cada soltar da las acciones existentes que
// manda la vista clásica, y aplicadas con optimista.ts dejan el día como se ve.

import { test } from "node:test";
import assert from "node:assert/strict";
import { soltar, type Gesto, type Soltar } from "./gestos-pizarron.ts";
import { aplicarOptimista, aplicarOptimistaAusencia, aplicarOptimistaViaje } from "./optimista.ts";
import { ausenciaDe, choferDe, hojaDe, hojaDeCuadrilla, vanDe, vehiculosDe } from "./estado.ts";
import { pizarron } from "./pizarron.ts";
import type { DiaHoja } from "./tipos.ts";
import { martesPrecargado, martesVacio, viaje, OT } from "./escenario.test-fixture.ts";

const F = "2026-10-13";
const T = -330; // lunes 18:30
const gs = (r: Soltar): Gesto[] => {
  assert.equal(r.k, "gestos", `esperaba acciones y vino ${JSON.stringify(r)}`);
  return r.k === "gestos" ? r.gestos : [];
};
/** Aplica las acciones como lo hace la pantalla (optimista) y devuelve el día. */
function aplicar(d: DiaHoja, g: Gesto[]): DiaHoja {
  let x = d;
  for (const y of g) {
    const r = y.k === "hoja" ? aplicarOptimista(x, y.a, { ahora: T }) : y.k === "viaje" ? aplicarOptimistaViaje(x, y.a, { ahora: T }) : aplicarOptimistaAusencia(x, y.a);
    assert.ok(r, `la acción ${JSON.stringify(y.a)} tiene que verse al instante`);
    x = r!;
  }
  return x;
}
const filaDe = (d: DiaHoja, c: number) => vehiculosDe(hojaDeCuadrilla(d, c))[0];

test("persona de Sin asignar a una cuadrilla → agregar", () => {
  const d = martesPrecargado();
  const g = gs(soltar(d, { k: "persona", pid: "paz" }, { k: "gente", c: 4 }, T));
  assert.deepEqual(g, [{ k: "hoja", a: { accion: "agregar", fecha: F, cuadrilla: 4, personaId: "paz", reemplaza: null } }]);
  assert.equal(hojaDe(aplicar(d, g), "paz"), 4);
  // Soltar en cualquier parte de la columna es lo mismo.
  assert.deepEqual(gs(soltar(d, { k: "persona", pid: "paz" }, { k: "columna", c: 4 }, T)), g);
});

test("persona de una cuadrilla a otra → agregar (pasa); a la misma → nada; encima de otra ficha → reemplaza", () => {
  const d = martesPrecargado();
  const de = hojaDe(d, "avila")!;
  const otra = de === 2 ? 3 : 2;
  assert.equal(gs(soltar(d, { k: "persona", pid: "avila" }, { k: "gente", c: otra }, T))[0].a.accion, "agregar");
  assert.deepEqual(soltar(d, { k: "persona", pid: "avila" }, { k: "gente", c: de }, T), { k: "nada" });
  const victima = hojaDeCuadrilla(d, otra)!.integrantes.find((i) => !i.aCargo)!.personaId;
  const g = gs(soltar(d, { k: "persona", pid: "paz" }, { k: "gente", c: otra, sobre: victima }, T));
  assert.deepEqual(g[0].a, { accion: "agregar", fecha: F, cuadrilla: otra, personaId: "paz", reemplaza: victima });
  const d2 = aplicar(d, g);
  assert.equal(hojaDe(d2, victima), null, "el reemplazado queda sin asignar");
});

test("columnas sin obra no aceptan gente, camiones ni contratistas", () => {
  const d0 = martesPrecargado();
  const d: DiaHoja = { ...d0, obras: d0.obras.filter((o) => o.cuadrillaOdooId !== 4) };
  const motivo = { k: "rechazo", motivo: "La 4 no tiene obra en el tablero" };
  assert.deepEqual(soltar(d, { k: "persona", pid: "paz" }, { k: "gente", c: 4 }, T), motivo);
  assert.deepEqual(soltar(d, { k: "camion", veh: "ab497", filaId: null, c: null }, { k: "camiones", c: 4 }, T), motivo);
  assert.deepEqual(soltar(d, { k: "contratista", kid: "quintana" }, { k: "columna", c: 4 }, T), motivo);
  // Un día pasado, nada.
  assert.equal(soltar(d0, { k: "persona", pid: "paz" }, { k: "gente", c: 3 }, 1500).k, "rechazo");
});

test("persona a Sin asignar → sacar; a No vienen → pide el motivo y después crea la ausencia de ese día", () => {
  const d = martesPrecargado();
  const pid = hojaDeCuadrilla(d, 3)!.integrantes.find((i) => !i.aCargo)!.personaId;
  assert.deepEqual(gs(soltar(d, { k: "persona", pid }, { k: "sin" }, T)), [{ k: "hoja", a: { accion: "sacar", fecha: F, personaId: pid } }]);
  assert.deepEqual(soltar(d, { k: "persona", pid }, { k: "no" }, T), { k: "pedirMotivo", pid });
  const g = gs(soltar(d, { k: "persona", pid }, { k: "no", tipo: "enfermedad" }, T));
  assert.deepEqual(g, [{ k: "ausencia", a: { accion: "crear", personaId: pid, desde: F, hasta: F, tipo: "enfermedad" } }]);
  const d2 = aplicar(d, g);
  assert.equal(ausenciaDe(d2, pid)?.tipo, "enfermedad");
  assert.equal(hojaDe(d2, pid), null, "la ausencia lo saca de la hoja, como el servidor");
  assert.ok(pizarron(d2, T).noVienen.some((x) => x.pid === pid));
});

test("de No vienen a una cuadrilla → 'Ya tiene el alta' y agregar", () => {
  const d = martesPrecargado(); // Medina: ART de la asistencia (sin id)
  const g = gs(soltar(d, { k: "persona", pid: "medina" }, { k: "gente", c: 4 }, T));
  assert.deepEqual(g.map((x) => x.a.accion), ["alta", "agregar"]);
  const d2 = aplicar(d, g);
  assert.equal(ausenciaDe(d2, "medina"), null);
  assert.equal(hojaDe(d2, "medina"), 4);
});

test("persona encima de un camión de una cuadrilla → su chofer (vehiculo_cambiar); si no maneja, no", () => {
  const d = martesPrecargado();
  const f = filaDe(d, 3);
  const g = gs(soltar(d, { k: "persona", pid: "borda" }, { k: "camion", veh: f.vehiculoId, filaId: f.id, c: 3 }, T));
  assert.deepEqual(g, [{ k: "hoja", a: { accion: "vehiculo_cambiar", fecha: F, cuadrilla: 3, filaId: f.id, choferId: "borda" } }]);
  assert.equal(filaDe(aplicar(d, g), 3).choferId, "borda");
  assert.deepEqual(soltar(d, { k: "persona", pid: "paz" }, { k: "camion", veh: f.vehiculoId, filaId: f.id, c: 3 }, T), { k: "rechazo", motivo: "Paz no maneja" });
  // Conte (puede manejar) de la 2 al camión de la 3: sale de la 2 (una persona en un solo lugar).
  const g2 = gs(soltar(d, { k: "persona", pid: "conte" }, { k: "camion", veh: f.vehiculoId, filaId: f.id, c: 3 }, T));
  assert.deepEqual(g2.map((x) => x.a.accion), ["sacar", "vehiculo_cambiar"]);
});

test("persona encima de un camión libre → chofer_del_camion, que se ve al instante", () => {
  const d = martesVacio();
  const g = gs(soltar(d, { k: "persona", pid: "gomez" }, { k: "camion", veh: "ab497", filaId: null, c: null }, T));
  assert.deepEqual(g, [{ k: "viaje", a: { accion: "chofer_del_camion", fecha: F, vehiculoId: "ab497", choferId: "gomez" } }]);
  const d2 = aplicar(d, g);
  assert.equal(pizarron(d2, T).camionesLibres.find((k) => k.veh === "ab497")!.choferId, "gomez");
  assert.ok(!pizarron(d2, T).sinAsignar.some((x) => x.pid === "gomez"));
});

test("chofer_del_camion optimista: los viajes sin chofer guardado lo siguen solos y los de otro chofer pasan", () => {
  const d0 = martesVacio();
  const d: DiaHoja = { ...d0, viajes: [
    viaje("a", { tipo: "lleva_material", vehiculoId: "ab497", choferId: null, hacia: { otId: OT.gur, lugarId: null, texto: null }, hora: "8:00", orden: 480 }),
    viaje("b", { tipo: "trae_material", vehiculoId: "ab497", choferId: "nunez", hacia: { otId: OT.jur, lugarId: null, texto: null }, hora: "10:00", orden: 600 }),
  ] };
  const d2 = aplicarOptimistaViaje(d, { accion: "chofer_del_camion", fecha: F, vehiculoId: "ab497", choferId: "gomez" }, { ahora: T })!;
  assert.equal(d2.viajes.find((v) => v.id === "a")!.choferId, null, "el que no tenía chofer elegido no se escribe");
  assert.equal(choferDe(d2, d2.viajes.find((v) => v.id === "a")!), "gomez");
  assert.equal(d2.viajes.find((v) => v.id === "b")!.choferId, "gomez");
  assert.equal(aplicarOptimistaViaje(d, { accion: "hecho", viajeId: "a" }), null, "los demás gestos de viajes esperan al servidor");
});

test("chofer de un camión a otro → lo saca del primero y lo pone en el segundo", () => {
  const d = martesPrecargado();
  const f3 = filaDe(d, 3);
  const g = gs(soltar(d, { k: "chofer", pid: f3.choferId!, veh: f3.vehiculoId, filaId: f3.id, c: 3 }, { k: "camion", veh: "ab497", filaId: null, c: null }, T));
  assert.deepEqual(g.map((x) => x.a.accion), ["vehiculo_cambiar", "chofer_del_camion"]);
  const d2 = aplicar(d, g);
  assert.equal(filaDe(d2, 3).choferId, null);
  // Al mismo camión: nada.
  assert.deepEqual(soltar(d, { k: "chofer", pid: f3.choferId!, veh: f3.vehiculoId, filaId: f3.id, c: 3 }, { k: "camion", veh: f3.vehiculoId, filaId: f3.id, c: 3 }, T), { k: "nada" });
  // A Sin asignar: sólo sale del camión.
  assert.deepEqual(gs(soltar(d, { k: "chofer", pid: f3.choferId!, veh: f3.vehiculoId, filaId: f3.id, c: 3 }, { k: "sin" }, T)).map((x) => x.a.accion), ["vehiculo_cambiar"]);
});

test("camión libre a una cuadrilla → vehiculo_sumar 'Todo el día' con el chofer que mostraba", () => {
  const d0 = martesPrecargado();
  const d: DiaHoja = { ...d0, camiones: d0.camiones.map((x) => (x.vehiculoId === "ab497" ? { ...x, choferId: "gomez" } : x)) };
  const g = gs(soltar(d, { k: "camion", veh: "ab497", filaId: null, c: null }, { k: "camiones", c: 4 }, T));
  assert.deepEqual(g, [{ k: "hoja", a: { accion: "vehiculo_sumar", fecha: F, cuadrilla: 4, modo: "todo_el_dia", choferId: "gomez", vehiculoId: "ab497" } }]);
  const d2 = aplicar(d, g);
  const k = pizarron(d2, T).columnas.find((c) => c.c === 4)!.camiones;
  assert.equal(k.length, 1);
  assert.equal(k[0].choferId, "gomez");
  assert.equal(k[0].modo, "todo_el_dia");
  assert.ok(!pizarron(d2, T).camionesLibres.some((x) => x.veh === "ab497"));
});

test("camión de una cuadrilla a otra → quitar el renglón y sumarlo (mismo modo y chofer); a libres → quitar", () => {
  const d = martesPrecargado();
  const f3 = filaDe(d, 3);
  const g = gs(soltar(d, { k: "camion", veh: f3.vehiculoId, filaId: f3.id, c: 3 }, { k: "camiones", c: 4 }, T));
  assert.deepEqual(g.map((x) => x.a.accion), ["vehiculo_quitar", "vehiculo_sumar"]);
  assert.equal((g[1].a as { modo: string }).modo, f3.modo);
  assert.equal((g[1].a as { choferId: string }).choferId, f3.choferId);
  const d2 = aplicar(d, g);
  assert.equal(vehiculosDe(hojaDeCuadrilla(d2, 3)).length, 0);
  assert.equal(filaDe(d2, 4).vehiculoId, f3.vehiculoId);
  assert.deepEqual(gs(soltar(d, { k: "camion", veh: f3.vehiculoId, filaId: f3.id, c: 3 }, { k: "libres" }, T)), [{ k: "hoja", a: { accion: "vehiculo_quitar", fecha: F, cuadrilla: 3, filaId: f3.id } }]);
  assert.deepEqual(soltar(d, { k: "camion", veh: f3.vehiculoId, filaId: f3.id, c: 3 }, { k: "camiones", c: 3 }, T), { k: "nada" });
});

test("contratista a una cuadrilla → contratista_sumar 1, y cuenta en '4 de 5'", () => {
  const d = martesPrecargado();
  const g = gs(soltar(d, { k: "contratista", kid: "quintana" }, { k: "columna", c: 5 }, T));
  assert.deepEqual(g, [{ k: "hoja", a: { accion: "contratista_sumar", fecha: F, cuadrilla: 5, contratistaId: "quintana", n: 1 } }]);
  const d2 = aplicar(d, g);
  assert.equal(vanDe(d2, 5), vanDe(d, 5) + 1);
  assert.equal(soltar(d, { k: "contratista", kid: "quintana" }, { k: "sin" }, T).k, "nada");
});
