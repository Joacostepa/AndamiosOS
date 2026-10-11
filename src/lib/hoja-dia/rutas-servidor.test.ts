// El cliente de la Routes API (rutas-servidor.ts): el pedido, el parseo de una respuesta de
// ejemplo, cómo se agrupan los tramos y que la hoja nunca se rompe. Sin red: `fetch` falso.

import { test } from "node:test";
import assert from "node:assert/strict";
import { _reiniciarCache, cuerpoMatriz, errorGoogle, parsearMatriz, planDePedidos, tiemposDelDia } from "./rutas-servidor.ts";
import { paresDelDia, type ParTramo } from "./rutas.ts";
import { calcVeh } from "./estado.ts";
import { OT, martesArmado } from "./escenario.test-fixture.ts";

// Como la devuelve computeRouteMatrix (REST): un arreglo; el índice 0 no viene.
const RESPUESTA = [
  { destinationIndex: 1, status: {}, distanceMeters: 8123, duration: "1475s", condition: "ROUTE_EXISTS" },
  { originIndex: 1, status: {}, distanceMeters: 3021, duration: "605s", condition: "ROUTE_EXISTS" },
  { status: {}, distanceMeters: 5000, duration: "900s", condition: "ROUTE_EXISTS" },
  { originIndex: 1, destinationIndex: 1, status: {}, condition: "ROUTE_NOT_FOUND" },
  { originIndex: 2, destinationIndex: 0, status: { code: 3, message: "Invalid waypoint" } },
];

const SERVICE_DISABLED = JSON.stringify({
  error: { code: 403, message: "Routes API has not been used in project 261735489589 before or it is disabled.", status: "PERMISSION_DENIED", details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "SERVICE_DISABLED" }] },
});

test("cuerpoMatriz: auto con tránsito; departureTime sólo si es a futuro", () => {
  const c = cuerpoMatriz([{ lat: -34.6, lng: -58.5 }], [{ lat: -34.59, lng: -58.42 }], "2026-10-13T10:45:00.000Z");
  assert.deepEqual(c.origins, [{ waypoint: { location: { latLng: { latitude: -34.6, longitude: -58.5 } } } }]);
  assert.equal(c.travelMode, "DRIVE");
  assert.equal(c.routingPreference, "TRAFFIC_AWARE");
  assert.equal(c.departureTime, "2026-10-13T10:45:00.000Z");
  assert.equal("departureTime" in cuerpoMatriz([], [], null), false);
});

test("parsearMatriz: índices que faltan son 0, minutos redondeados; sin ruta o con error, afuera", () => {
  assert.deepEqual(parsearMatriz(RESPUESTA), [
    { oi: 0, di: 1, min: 25, m: 8123 },
    { oi: 1, di: 0, min: 10, m: 3021 },
    { oi: 0, di: 0, min: 15, m: 5000 },
  ]);
  assert.deepEqual(parsearMatriz({ error: {} }), []);
  assert.deepEqual(parsearMatriz([{ duration: "20s" }]), [{ oi: 0, di: 0, min: 1, m: null }], "al menos 1 minuto");
});

test("errorGoogle: el motivo en pocas palabras", () => {
  assert.equal(errorGoogle(403, SERVICE_DISABLED), "403 SERVICE_DISABLED");
  assert.equal(errorGoogle(400, JSON.stringify({ error: { status: "INVALID_ARGUMENT" } })), "400 INVALID_ARGUMENT");
  assert.equal(errorGoogle(502, "<html>"), "502");
});

test("planDePedidos: uno por franja; la matriz entera si son justo los tramos, si no uno por origen", () => {
  const A = { lat: -34.6, lng: -58.5 }, B = { lat: -34.59, lng: -58.42 }, C = { lat: -34.58, lng: -58.43 }, D = { lat: -34.57, lng: -58.44 };
  const par = (o: typeof A, d: typeof A, salida: number): ParTramo => ({ desde: "x", hacia: "y", o, d, salida });
  const antes = Date.parse("2026-10-12T20:00:00-03:00");
  // Misma franja, A→B y A→C: una matriz 1×2.
  const p1 = planDePedidos([par(A, B, 420), par(A, C, 425)], "2026-10-13", antes);
  assert.equal(p1.length, 1);
  assert.deepEqual([p1[0].origenes.length, p1[0].destinos.length, p1[0].franja, p1[0].tipo], [1, 2, 420, "habil"]);
  assert.equal(p1[0].salida, "2026-10-13T10:15:00.000Z");
  // Franjas distintas: dos pedidos.
  assert.equal(planDePedidos([par(A, B, 420), par(A, C, 480)], "2026-10-13", antes).length, 2);
  // A→B, C→D en la misma franja: la matriz 2×2 pagaría 4 por 2 tramos → uno por origen.
  // (A→B, A→C, C→B, C→C sí es una matriz 2×2: son los 4 que se piden.)
  const p3 = planDePedidos([par(A, B, 420), par(C, D, 420)], "2026-10-13", antes);
  assert.deepEqual(p3.map((p) => [p.origenes.length, p.destinos.length]), [[1, 1], [1, 1]]);
  // Ya pasó: sin departureTime (pero se guarda en su franja).
  const tarde = planDePedidos([par(A, B, 420)], "2026-10-13", Date.parse("2026-10-13T12:00:00-03:00"));
  assert.deepEqual([tarde[0].salida, tarde[0].franja], [null, 420]);
});

test("tiemposDelDia: sin clave, nada (y no llama a nadie)", async () => {
  _reiniciarCache();
  const prev = { g: process.env.GOOGLE_MAPS_API_KEY, n: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY, f: globalThis.fetch };
  delete process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  let llamadas = 0;
  globalThis.fetch = (async () => { llamadas++; throw new Error("no"); }) as typeof fetch;
  try {
    assert.deepEqual(await tiemposDelDia(martesArmado()), {});
    assert.equal(llamadas, 0);
  } finally {
    globalThis.fetch = prev.f;
    if (prev.g) process.env.GOOGLE_MAPS_API_KEY = prev.g;
    if (prev.n) process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY = prev.n;
  }
});

test("tiemposDelDia: con Google contestando, los tramos del día; la segunda vez, del caché", async () => {
  _reiniciarCache();
  const prev = { g: process.env.GOOGLE_MAPS_API_KEY, f: globalThis.fetch };
  process.env.GOOGLE_MAPS_API_KEY = "clave-de-prueba";
  const cuerpos: { origins: unknown[]; destinations: unknown[] }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if (!String(url).startsWith("https://routes.googleapis.com/")) throw new Error(`no: ${url}`);
    assert.equal((init.headers as Record<string, string>)["X-Goog-Api-Key"], "clave-de-prueba");
    const b = JSON.parse(String(init.body));
    cuerpos.push(b);
    // 20 minutos para todo lo que pidan.
    const els = b.origins.flatMap((_: unknown, oi: number) => b.destinations.map((_d: unknown, di: number) => ({ originIndex: oi, destinationIndex: di, duration: "1200s", distanceMeters: 7000, condition: "ROUTE_EXISTS" })));
    return new Response(JSON.stringify(els), { status: 200 });
  }) as typeof fetch;
  try {
    const d = martesArmado();
    const t = await tiemposDelDia(d, 2000);
    const pares = paresDelDia(martesArmado());
    assert.equal(Object.keys(t).length, pares.length, "todos los tramos del día");
    assert.deepEqual(t[`l:dep>o:${OT.jur}`], { min: 20, m: 7000, fuente: "google" });
    const elementos = cuerpos.reduce((s, c) => s + c.origins.length * c.destinations.length, 0);
    assert.ok(elementos <= pares.length, `no paga de más (${elementos} elementos por ${pares.length} tramos)`);
    // El día con los tiempos: el lleva de la 2 dura 20 + 10.
    assert.equal(calcVeh({ ...d, tiempos: t }, "af669")[0].dur, 30);
    // Segunda lectura: todo del caché, sin llamar.
    const n = cuerpos.length;
    assert.deepEqual(await tiemposDelDia(martesArmado(), 2000), t);
    assert.equal(cuerpos.length, n);
  } finally {
    globalThis.fetch = prev.f;
    if (prev.g) process.env.GOOGLE_MAPS_API_KEY = prev.g; else delete process.env.GOOGLE_MAPS_API_KEY;
  }
});

test("tiemposDelDia: 403 SERVICE_DISABLED o Google colgado → {} sin tirar y sin pasar el tope", async () => {
  _reiniciarCache();
  const prev = { g: process.env.GOOGLE_MAPS_API_KEY, f: globalThis.fetch, w: console.warn };
  process.env.GOOGLE_MAPS_API_KEY = "clave-de-prueba";
  console.warn = () => {};
  let llamadas = 0;
  globalThis.fetch = (async () => { llamadas++; return new Response(SERVICE_DISABLED, { status: 403 }); }) as typeof fetch;
  try {
    assert.deepEqual(await tiemposDelDia(martesArmado(), 500), {});
    const n = llamadas;
    assert.ok(n > 0);
    // Apagado por un rato: la próxima lectura no vuelve a llamar.
    assert.deepEqual(await tiemposDelDia(martesArmado(), 500), {});
    assert.equal(llamadas, n);

    _reiniciarCache();
    globalThis.fetch = (() => new Promise(() => {})) as typeof fetch;
    const t0 = Date.now();
    assert.deepEqual(await tiemposDelDia(martesArmado(), 300), {});
    assert.ok(Date.now() - t0 < 1500, "no espera más que el tope");
  } finally {
    globalThis.fetch = prev.f;
    console.warn = prev.w;
    if (prev.g) process.env.GOOGLE_MAPS_API_KEY = prev.g; else delete process.env.GOOGLE_MAPS_API_KEY;
    _reiniciarCache();
  }
});
