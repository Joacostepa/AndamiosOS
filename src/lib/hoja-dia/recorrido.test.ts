// El recorrido del camión (rediseño F3): paradas en orden (con la salida y la vuelta al
// depósito), horas aproximadas que no avisan choques, qué hace en cada parada, reordenar sin
// cambiar la escala de `orden`, y el "¿Adónde va?".

import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiaHoja } from "./tipos.ts";
import { accionDe, calcVeh, horaTxt, textoViaje, tipoDeAccion } from "./estado.ts";
import { accionPorDefecto, lugaresParaElegir, paradasDe, planReordenar, resumenRecorrido } from "./recorrido.ts";
import { aplicarOptimistaViaje } from "./optimista.ts";
import { martesArmado, OT } from "./escenario.test-fixture.ts";

const conViaje = (d: DiaHoja, id: string, o: Partial<DiaHoja["viajes"][number]>): DiaHoja => ({ ...d, viajes: d.viajes.map((v) => (v.id === id ? { ...v, ...o } : v)) });

test("paradas del Iveco AB 497 YY (Gómez): carga y sale del depósito, sus viajes y las vueltas", () => {
  const d = martesArmado();
  const ps = paradasDe(d, "ab497");
  assert.deepEqual(ps.map((p) => (p.k === "viaje" ? p.id : p.k)), ["salida", "v-gur", "v-jur", "vuelta", "v-riv", "vuelta"]);
  const sal = ps[0];
  assert.ok(sal.k === "salida");
  assert.deepEqual([sal.texto, sal.hora], ["Carga y sale del depósito", "7:30"]);
  const gur = ps[1];
  assert.ok(gur.k === "viaje");
  assert.deepEqual({ lugar: gur.lugar, accion: gur.accionTxt, fija: gur.fija, hora: gur.hora, deC: gur.deCuadrilla, pedido: gur.pedido }, {
    lugar: "Gurruchaga 1650", accion: "Deja material", fija: true, hora: "8:00", deC: false, pedido: "Material del armado",
  });
  assert.equal(resumenRecorrido(d, "ab497").startsWith("3 paradas · termina ~"), true);
});

test("un lleva de la cuadrilla se ve en el recorrido pero su lugar y qué hace son de la hoja", () => {
  const d = martesArmado();
  const ll = paradasDe(d, "af669").find((p) => p.k === "viaje" && p.id === "c2-lleva");
  assert.ok(ll && ll.k === "viaje");
  assert.equal(ll.deCuadrilla, true);
  assert.deepEqual(ll.editable, { lugar: false, accion: false, hora: true, quitar: true, mover: true });
  assert.equal(ll.accion, "lleva_gente");
});

test("hora aproximada: no avisa choque y la parada se corre a cuando llega; con candado sí avisa", () => {
  // Gómez carga en Juramento desde las 10:15 y vuelve al depósito: Rivadavia a las 10:00 no entra.
  const fija = conViaje(martesArmado(), "v-riv", { hora: "10:00", horaAprox: false });
  const rf = calcVeh(fija, "ab497").find((v) => v.id === "v-riv")!;
  assert.ok(rf.conflicto, "con candado avisa");
  assert.equal(horaTxt(rf), "10:00");
  const aprox = conViaje(martesArmado(), "v-riv", { hora: "10:00", horaAprox: true });
  const ra = calcVeh(aprox, "ab497").find((v) => v.id === "v-riv")!;
  assert.equal(ra.conflicto, null, "aproximada no avisa");
  assert.ok(ra.t > 600, "se corre a cuando llega");
  assert.match(horaTxt(ra), /^~/);
});

test("qué hace: la del tipo por defecto, la elegida si hay; y el texto para el chofer", () => {
  const d = martesArmado();
  const jur = d.viajes.find((v) => v.id === "v-jur")!;
  assert.equal(accionDe(jur), "carga");
  assert.equal(accionDe({ ...jur, accion: "descarga" }), "descarga");
  assert.equal(textoViaje(d, { ...jur, accion: "espera", carga: "que bajen lo de los pisos" }, true), "Esperá en Juramento 2145: que bajen lo de los pisos");
  assert.equal(textoViaje(d, { ...jur, accion: "descarga" }, true), "Descargá lo desarmado en Juramento 2145");
  // Para una parada nueva: el tipo según lo que hace y adónde va.
  const obra = { otId: OT.cab, lugarId: null, texto: null };
  assert.equal(tipoDeAccion(d, "carga", obra), "trae_material");
  assert.equal(tipoDeAccion(d, "deja_material", obra), "lleva_material");
  assert.equal(tipoDeAccion(d, "espera", { otId: null, lugarId: "vtv", texto: null }), "taller");
  assert.equal(tipoDeAccion(d, "deja_material", { otId: null, lugarId: "dep", texto: null }), "entre_depositos");
  assert.equal(accionPorDefecto(d, { otId: null, lugarId: "sanz", texto: null }, true), "compra");
});

test("reordenar: reparte los mismos `orden` y escribe sólo los que cambiaron de lugar", () => {
  const d = martesArmado();
  assert.deepEqual(planReordenar(d, "ab497", ["v-jur", "v-gur", "v-riv"]), [{ id: "v-jur", orden: 480 }, { id: "v-gur", orden: 615 }]);
  assert.deepEqual(planReordenar(d, "ab497", ["v-gur", "v-jur", "v-riv"]), []);
  // Si no son exactamente los planeados del camión (otro gesto cambió el recorrido), no.
  assert.equal(planReordenar(d, "ab497", ["v-jur", "v-gur"]), null);
  assert.equal(planReordenar(d, "ab497", ["v-jur", "v-gur", "v-sanz"]), null);
});

test("al instante: reordenar y editar una parada", () => {
  const d = martesArmado();
  const r = aplicarOptimistaViaje(d, { accion: "reordenar", fecha: d.fecha, vehiculoId: "ab497", ids: ["v-jur", "v-gur", "v-riv"] })!;
  assert.deepEqual(calcVeh(r, "ab497").map((v) => v.id), ["v-jur", "v-gur", "v-riv"]);
  const e = aplicarOptimistaViaje(d, { accion: "parada_editar", viajeId: "v-jur", queHace: "espera", carga: "lo de los pisos 6 a 3", hora: "11:00", horaAprox: true })!;
  const j = e.viajes.find((v) => v.id === "v-jur")!;
  assert.deepEqual({ accion: j.accion, carga: j.carga, hora: j.hora, aprox: j.horaAprox, orden: j.orden }, { accion: "espera", carga: "lo de los pisos 6 a 3", hora: "11:00", aprox: true, orden: 615 });
  // Con candado, la hora ordena (como en Camiones).
  const f = aplicarOptimistaViaje(d, { accion: "parada_editar", viajeId: "v-jur", hora: "16:00", horaAprox: false })!;
  assert.equal(f.viajes.find((v) => v.id === "v-jur")!.orden, 960);
  // Anular: el pedido vuelve a la cola.
  const a = aplicarOptimistaViaje(d, { accion: "anular", viajeId: "v-gur", motivo: "se sacó del recorrido" })!;
  assert.equal(a.viajes.find((v) => v.id === "v-gur")!.estado, "anulado");
  assert.deepEqual([a.pedidos.find((p) => p.id === "p-gur")!.estado, a.pedidos.find((p) => p.id === "p-gur")!.viajeId], ["sin_camion", null]);
});

test("¿Adónde va?: el depósito primero, las obras del día, los lugares y «otra dirección»", () => {
  const d = martesArmado();
  const todo = lugaresParaElegir(d, "", 50);
  assert.equal(todo[0].tag, "D");
  assert.ok(todo.some((x) => x.grupo === "obra" && x.n === "Juramento 2145"));
  assert.deepEqual(lugaresParaElegir(d, "sanz").map((x) => x.n), ["Galvanizados Sanz"]);
  const libre = lugaresParaElegir(d, "Thames 1820");
  assert.deepEqual(libre.at(-1)?.punto, { otId: null, lugarId: null, texto: "Thames 1820" });
});
