// Los textos de la vista Cuadrillas con el escenario de la maqueta (martes 13/10).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chipsDe, cuadrillaDeTecla, horasLlevaTrae, instruccionesDe, materialDe, opcionesChofer, opcionesHasta, quienesVan,
  rangoAusencia, resumenChofer, sugerenciasAgregar, textoChofer, textoMover, textoNoDisponible, textoVehiculo, ultimoViernes,
} from "./vista-cuadrillas.ts";
import { martesArmado, martesVacio, MEDINA_ART } from "./escenario.test-fixture.ts";

const linea = (r: ReturnType<typeof resumenChofer>) => r.k + r.resto.map((x) => x.t).join("");

test("la línea del chofer dice el modo, el chofer, la patente y las horas", () => {
  const d = martesArmado();
  assert.equal(linea(resumenChofer(d, 1)), "Todo el día · Borda · hidrogrúa AB 831 LC");
  assert.equal(linea(resumenChofer(d, 3)), "Lleva y trae · Kiska · AF 669 ZL · 7:45 → 16:30");
  assert.equal(linea(resumenChofer(d, 4)), "Sin chofer · van por su cuenta");
  assert.equal(horasLlevaTrae(d, 3).lleva, "7:45");
  assert.equal(horasLlevaTrae(d, 3).busca, "16:30");
});

test("sin el busca, vuelven solos", () => {
  const d = martesArmado();
  const sinBusca = { ...d, viajes: d.viajes.filter((v) => v.id !== "c3-busca") };
  assert.match(linea(resumenChofer(sinBusca, 3)), /7:45 → vuelven solos$/);
});

test("material de la cuadrilla", () => {
  const d = martesArmado();
  assert.equal(materialDe(d, 4), "Material: Gómez lleva 8:00");
  assert.match(materialDe(d, 2) ?? "", /^Material: Gómez trae ~10:15 \(Juramento/);
  assert.equal(materialDe(d, 1), null);
});

test("los nombres: a cargo primero, y los que no vienen marcados", () => {
  const d = martesArmado();
  const c3 = chipsDe(d, 3);
  assert.equal(c3[0].nombre, "Ortega");
  assert.equal(c3[0].tag, "a cargo");
  assert.deepEqual(quienesVan(d, 1), { van: 5, prevista: 5, con: "Borda" });
  const conAus = { ...d, ausencias: [...d.ausencias, { ...MEDINA_ART, personaId: "avila", tipo: "enfermedad" as const, id: "a1", origen: "planificador" as const, hasta: "2026-10-13" }] };
  assert.equal(chipsDe(conAus, 3).find((x) => x.pid === "avila")?.tag, "no viene");
});

test("+ Agregar sugiere primero los sin asignar y no deja agregar a los que no vienen", () => {
  const d = martesArmado();
  const s = sugerenciasAgregar(d, 3, "ra");
  assert.equal(s[0].nombre, "Ramírez");
  assert.equal(s[0].s, "sin asignar");
  const m = sugerenciasAgregar(d, 3, "medi");
  assert.equal(m[0].deshabilitada, true);
  assert.equal(m[0].s, "no viene (ART)");
  assert.deepEqual(sugerenciasAgregar(d, 3, "  "), []);
});

test("teclas 1–5 por número de cuadrilla", () => {
  assert.equal(cuadrillaDeTecla(martesArmado(), 4), 4);
  assert.equal(cuadrillaDeTecla(martesVacio(), 4), null);
});

test("selector de chofer y panel", () => {
  const d = martesArmado();
  const o = opcionesChofer(d, 4);
  assert.match(o.find((x) => x.value === "borda")!.label, /^Borda · todo el día con la 1/);
  assert.match(o.find((x) => x.value === "kiska")!.label, /^Kiska · lleva a la 2 y la 3/);
  assert.equal(textoChofer(d, "borda").t, "todo el día con la 1");
  assert.equal(textoVehiculo(d, "ah410").t, "camión · VTV vencida desde el 02/10");
  assert.equal(textoVehiculo(d, "ah410").tono, "amb");
});

test("No viene…: sólo hoy, hasta el viernes, 1 semana", () => {
  assert.equal(ultimoViernes("2026-10-13"), "2026-10-16");
  assert.deepEqual(opcionesHasta("2026-10-13", 400).map((x) => x.l), ["Sólo hoy", "Hasta el viernes 16/10", "1 semana"]);
  assert.deepEqual(opcionesHasta("2026-10-16", -300).map((x) => x.l), ["Sólo el viernes", "1 semana"]);
});

test("textos de ausencias", () => {
  const d = martesArmado();
  assert.equal(textoNoDisponible(d, MEDINA_ART), "ART · sin fecha de alta (según la asistencia)");
  assert.equal(rangoAusencia({ ...MEDINA_ART, hasta: "2026-10-16" }), "del 13/10 al 16/10");
  assert.equal(rangoAusencia({ ...MEDINA_ART, horaHasta: "14:00" }), "se retira a las 14:00 · 13/10");
});

test("¿Lo pasás a la 3?", () => {
  const d = martesArmado();
  const t = textoMover(d, "paz", 4, 3, null);
  assert.equal(t.titulo, "Paz está en la Cuadrilla 4. ¿Lo pasás a la 3?");
  assert.match(t.texto, /La 4 queda con 4 de 5\.$/);
});

test("instrucciones: la nota va primero", () => {
  const d = martesArmado();
  assert.equal(instruccionesDe(d, 3).n, 0);
  const conNota = { ...d, hojas: d.hojas.map((h) => (h.cuadrillaOdooId === 3 ? { ...h, nota: "Llevar arnés" } : h)) };
  assert.deepEqual(instruccionesDe(conNota, 3), { n: 1, lineas: [{ k: "Nota:", t: "Llevar arnés" }] });
});
