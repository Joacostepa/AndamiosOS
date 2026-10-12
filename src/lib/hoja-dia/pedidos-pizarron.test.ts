// Pedidos en el pizarrón (rediseño F4): "otra dirección" con coordenadas, el hueco de menor
// desvío (el mismo en la pantalla y en el servidor), "¿Quién pasa cerca?" y los pedidos sin
// camión que el Recorrido propone sumar.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiaHoja, Punto } from "./tipos.ts";
import { calcVeh, distanciaTxt, desvioTxt, lugar, lugarDeKey, mejorHueco, planPonerPedido } from "./estado.ts";
import { pedidosParaSumar, quienPasaCerca } from "./recorrido.ts";
import { paresDelDia, puntoDeKey } from "./rutas.ts";
import { martesArmado, OT, pedido, viaje } from "./escenario.test-fixture.ts";

// Una dirección a 3 cuadras de Juramento 2145 (la 2 desarma ahí; Gómez carga desde las 10:15).
const CERCA_JUR: Punto = { otId: null, lugarId: null, texto: "Cramer 2190", lat: -34.5640, lng: -58.4590 };
const MANANA = -300; // el día se arma la tarde anterior: nada está "en curso"

const conPedido = (d: DiaHoja, p = pedido("p-cra", { que: "6 bases regulables", hacia: CERCA_JUR })): DiaHoja => ({ ...d, pedidos: [...d.pedidos, p] });

test("otra dirección con coordenadas: lugar, la clave y Maps las usan", () => {
  const d = conPedido(martesArmado());
  const L = lugar(d, { otId: null, lugarId: null, texto: "Cramer 2190" });
  assert.deepEqual([L.key, L.n, L.lat, L.lng], ["t:cramer 2190", "Cramer 2190", -34.564, -58.459], "las del día, aunque el punto no las traiga");
  const K = lugarDeKey(d, "t:cramer 2190");
  assert.deepEqual([K.n, K.lat], ["Cramer 2190", -34.564], "desde la clave vuelve el texto como se escribió");
  assert.deepEqual(puntoDeKey(d, "t:cramer 2190"), { lat: -34.564, lng: -58.459, dir: null });
  // Sin coordenadas, como antes: el texto.
  assert.equal(lugar(d, { otId: null, lugarId: null, texto: "Otra 123" }).lat, null);
});

test("un viaje a otra dirección con coordenadas pide su tramo a Google", () => {
  const d0 = martesArmado();
  const d: DiaHoja = { ...d0, viajes: [...d0.viajes, viaje("v-cra", { tipo: "lleva_material", vehiculoId: "ab799", hacia: CERCA_JUR, orden: 700 })] };
  const sin = new Set<string>();
  const pares = paresDelDia(d, sin);
  assert.ok(pares.some((p) => p.hacia === "t:cramer 2190" || p.desde === "t:cramer 2190"), "hay un tramo hacia o desde Cramer");
  assert.ok(![...sin].some((x) => /Cramer/.test(x)), "no figura sin coordenadas");
});

test("mejorHueco: Cramer va entre Gurruchaga y Juramento en el camión de Gómez", () => {
  const d = conPedido(martesArmado());
  const h = mejorHueco(d, "ab497", lugar(d, CERCA_JUR), MANANA);
  assert.ok(h);
  assert.deepEqual([h.prevId, h.nextId, h.n], ["v-gur", "v-jur", 2]);
  assert.ok(h.orden > 480 && h.orden < 615, "el orden queda entre los dos");
  assert.equal(h.viaKey, `o:${OT.jur}`, "pasa por Juramento, la más cerca");
  assert.equal(h.viaTxt, "de paso entre Gurruchaga 1650 y Juramento 2145");
  assert.ok(h.extraKm < 1, `desvío chico: ${h.extraKm}`);
  assert.equal(desvioTxt(h.min), h.min ? `+${h.min} min` : "sin desvío");
  assert.equal(distanciaTxt(h.dKm), "3 cuadras");
});

test("mejorHueco: hoy nunca antes de la parada en curso", () => {
  const d = conPedido(martesArmado());
  // 10:30: Gómez ya hizo Gurruchaga y está cargando en Juramento (10:15).
  const hechos: DiaHoja = { ...d, viajes: d.viajes.map((v) => (v.id === "v-gur" ? { ...v, estado: "hecho", hechoMin: 500 } : v)) };
  const h = mejorHueco(hechos, "ab497", lugar(hechos, CERCA_JUR), 630);
  assert.ok(h);
  assert.equal(h.prevId, "v-jur", "después de Juramento, no antes");
});

test("mejorHueco: sin coordenadas o sin viajes, null", () => {
  const d = martesArmado();
  assert.equal(mejorHueco(d, "ab497", { lat: null, lng: null }, MANANA), null);
  assert.equal(mejorHueco(d, "ah410", lugar(d, CERCA_JUR), MANANA), null);
});

test("poner un pedido sin hora: el servidor lo pone en el hueco de menor desvío", () => {
  const d = conPedido(martesArmado());
  const ped = d.pedidos.find((p) => p.id === "p-cra")!;
  const plan = planPonerPedido(d, ped, "ab497", MANANA);
  assert.ok("nuevo" in plan);
  assert.ok(plan.nuevo.orden > 480 && plan.nuevo.orden < 615);
  assert.deepEqual(plan.nuevo.hacia, CERCA_JUR, "con sus coordenadas");
  // Con la vuelta de Juramento no se mete: el lleva va antes del trae.
  assert.equal(plan.cederVueltaDe, null);
  // Con hora fija, a su hora (como siempre).
  const fijo = planPonerPedido(d, { ...ped, horaFija: "13:00" }, "ab497", MANANA);
  assert.ok("nuevo" in fijo && fijo.nuevo.orden === 780);
});

test("hoy, un orden pedido antes de lo hecho no vale: va después de la parada en curso", () => {
  const d0 = conPedido(martesArmado());
  const d: DiaHoja = { ...d0, viajes: d0.viajes.map((v) => (v.id === "v-gur" ? { ...v, estado: "hecho", hechoMin: 500 } : v)) };
  const ped = d.pedidos.find((p) => p.id === "p-cra")!;
  const plan = planPonerPedido(d, ped, "ab497", 630, { orden: 400 });
  assert.ok("nuevo" in plan);
  assert.ok(plan.nuevo.orden > 615, `después de Juramento: ${plan.nuevo.orden}`);
  const ts = calcVeh({ ...d, viajes: [...d.viajes, viaje("x", { ...plan.nuevo, id: "x" } as never)] }, "ab497");
  assert.ok(ts.findIndex((v) => v.id === "x") > ts.findIndex((v) => v.id === "v-jur"));
});

test("¿Quién pasa cerca?: del que menos se desvía al que más; los libres al final; los que no sirven aparte", () => {
  const d = conPedido(martesArmado());
  const ped = d.pedidos.find((p) => p.id === "p-cra")!;
  const q = quienPasaCerca(d, ped, MANANA);
  assert.equal(q.donde, "Cramer 2190");
  // Kiska lleva a la 2 a Juramento a las 7:00 y Cramer le queda de paso; Gómez carga en Juramento a las 10:15.
  assert.deepEqual(q.si.slice(0, 2).map((x) => x.veh), ["af669", "ab497"]);
  assert.equal(q.si[0].hueco?.viaTxt, "antes de Juramento 2145");
  assert.match(q.si[0].linea, /^Kiska · pasa por Juramento 2145 a las 7:00 · a 3 cuadras · 6 paradas$/);
  assert.equal(q.si[1].linea, "Gómez · pasa por Juramento 2145 a las ~10:15 · a 3 cuadras");
  const mins = q.si.filter((x) => !x.libre && x.min != null).map((x) => x.extraKm!);
  assert.deepEqual(mins, [...mins].sort((a, b) => a - b));
  const iLibre = q.si.findIndex((x) => x.libre);
  if (iLibre >= 0) assert.ok(q.si.slice(iLibre).every((x) => x.libre || x.min == null), "los libres después de los que tienen recorrido");
  assert.ok(q.no.some((x) => x.veh === "ab831"), "la hidrogrúa de todo el día no sirve");
});

test("Recorrido: los pedidos sin camión que se pueden sumar, con su desvío", () => {
  const d = conPedido(conPedido(martesArmado()), pedido("p-lej", { que: "2 escaleras", hacia: { otId: OT.sj, lugarId: null, texto: null } }));
  const ps = pedidosParaSumar(d, "ab497", MANANA);
  assert.deepEqual(ps.map((x) => x.p.id), ["p-cra", "p-lej"], "Cramer primero (menos desvío)");
  // Los que ya tienen camión o una hora fija no.
  assert.ok(!ps.some((x) => x.p.id === "p-gur"));
});
