// Los buffers circulares del contexto automático (captura-cliente.ts): que se mantengan
// cortos, que la URL salga sin query, y que los envoltorios de fetch y console nunca cambien
// lo que la app recibe (la MISMA Response, el original de console siempre llamado).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  anotarRuta,
  crearBuffers,
  describir,
  empujarCircular,
  esPedidoIgnorado,
  instalarEn,
  rutaDeUrl,
  textoDeConsola,
  urlSinQuery,
  type VentanaInstalable,
} from "./captura-cliente.ts";
import { LIMITES } from "./tipos.ts";

test("empujarCircular: guarda los últimos `max` y tira los más viejos", () => {
  const l: number[] = [];
  for (let i = 1; i <= 35; i++) empujarCircular(l, i, 30);
  assert.equal(l.length, 30);
  assert.equal(l[0], 6);
  assert.equal(l[29], 35);
});

test("urlSinQuery: misma página → ruta sin query ni hash; otro sitio → con origen", () => {
  const o = "https://os.andamios.com.ar";
  assert.equal(urlSinQuery("/api/obras?token=abc&x=1#y", o), "/api/obras");
  assert.equal(urlSinQuery("https://os.andamios.com.ar/api/partes?id=3", o), "/api/partes");
  assert.equal(urlSinQuery("https://xyz.supabase.co/rest/v1/obras?select=*&apikey=k", o), "https://xyz.supabase.co/rest/v1/obras");
  assert.equal(urlSinQuery("/api/x?y=1"), "/api/x");
});

test("urlSinQuery: recorta las URL larguísimas", () => {
  const larga = `/api/${"a".repeat(800)}`;
  assert.ok(urlSinQuery(larga, "https://os.x").length <= 500);
});

test("rutaDeUrl: conserva la query (el servidor saca lo sensible) y tira el hash", () => {
  assert.equal(rutaDeUrl("https://os.x/sistemas/mis-reportes?id=1#a", "https://os.x"), "/sistemas/mis-reportes?id=1");
  assert.equal(rutaDeUrl("/obras"), "/obras");
});

test("esPedidoIgnorado: lo del propio módulo no se anota", () => {
  assert.equal(esPedidoIgnorado("/api/sistemas/reportes"), true);
  assert.equal(esPedidoIgnorado("/api/sistemas"), true);
  assert.equal(esPedidoIgnorado("https://xyz.supabase.co/storage/v1/object/upload/sign/sistemas/u/a.webp"), true);
  assert.equal(esPedidoIgnorado("/api/sistemasx"), false);
  assert.equal(esPedidoIgnorado("/api/partes"), false);
});

test("anotarRuta: no repite la misma pantalla seguida y guarda las últimas 10", () => {
  const b = crearBuffers();
  anotarRuta(b, "/obras");
  anotarRuta(b, "/obras");
  anotarRuta(b, "/partes");
  assert.deepEqual(b.rutas.map((r) => r.ruta), ["/obras", "/partes"]);
  for (let i = 0; i < 20; i++) anotarRuta(b, `/p${i}`);
  assert.equal(b.rutas.length, LIMITES.rutas);
  assert.equal(b.rutas[b.rutas.length - 1]?.ruta, "/p19");
});

test("textoDeConsola: arma el %s de React y saca el stack del Error", () => {
  const err = new Error("se rompió");
  const r = textoDeConsola(["Falló %s en %s", "guardar", "parte", err]);
  assert.match(r.mensaje, /^Falló guardar en parte Error: se rompió$/);
  assert.ok(r.stack?.includes("se rompió"));
  assert.equal(textoDeConsola(["%chola", "color:red"]).mensaje, "hola");
});

test("describir: tolera cualquier cosa sin tirar", () => {
  const circular: Record<string, unknown> = {};
  circular.yo = circular;
  assert.equal(describir(undefined), "undefined");
  assert.equal(describir({ a: 1 }), '{"a":1}');
  assert.equal(describir(circular), "[sin texto]");
  assert.equal(describir(new TypeError("x")), "TypeError: x");
});

function ventanaFalsa(fetchFalso: typeof fetch) {
  const escuchas = new Map<string, (e: unknown) => void>();
  const llamadas: { nivel: string; args: unknown[] }[] = [];
  const w: VentanaInstalable = {
    fetch: fetchFalso,
    console: {
      error: (...args: unknown[]) => llamadas.push({ nivel: "error", args }),
      warn: (...args: unknown[]) => llamadas.push({ nivel: "warn", args }),
    },
    addEventListener: (t, f) => escuchas.set(t, f),
    location: { origin: "https://os.x", pathname: "/hoja-dia", search: "?f=1" },
    performance: { now: () => 0 },
  };
  return { w, escuchas, llamadas };
}

test("instalarEn: fetch devuelve la MISMA Response y anota sólo las fallidas", async () => {
  const ok = new Response("hola", { status: 200 });
  const mal = new Response("no", { status: 500, headers: { "x-vercel-id": "gru1::abc" } });
  const cola = [ok, mal, new Response("x", { status: 404 })];
  const { w } = ventanaFalsa((async () => cola.shift()!) as typeof fetch);
  const b = crearBuffers();
  instalarEn(w, b);

  const r1 = await w.fetch!("/api/obras?token=s");
  assert.equal(r1, ok, "la misma Response, sin clonar");
  assert.equal(await r1.text(), "hola", "el body sigue sin leer");
  const r2 = await w.fetch!(new URL("https://os.x/api/partes?id=9"), { method: "post" });
  assert.equal(r2, mal);
  await w.fetch!("/api/sistemas/reportes", { method: "POST" });

  assert.equal(b.pedidos.length, 1);
  assert.deepEqual({ ...b.pedidos[0], at: "" }, { metodo: "POST", url: "/api/partes", status: 500, duracionMs: 0, vercelId: "gru1::abc", at: "" });
  assert.deepEqual(b.rutas.map((r) => r.ruta), ["/hoja-dia?f=1"], "anota la pantalla en la que arrancó");
});

test("instalarEn: un error de red se anota con status 0 y se vuelve a tirar; cancelar no se anota", async () => {
  const errores: unknown[] = [new TypeError("Failed to fetch"), Object.assign(new Error("cancelado"), { name: "AbortError" })];
  const { w } = ventanaFalsa((async () => {
    throw errores.shift();
  }) as typeof fetch);
  const b = crearBuffers();
  instalarEn(w, b);
  await assert.rejects(w.fetch!("/api/obras"), /Failed to fetch/);
  await assert.rejects(w.fetch!("/api/obras"), /cancelado/);
  assert.equal(b.pedidos.length, 1);
  assert.equal(b.pedidos[0]?.status, 0);
});

test("instalarEn: console.error llama siempre al original y anota; no se envuelve dos veces", () => {
  const { w, llamadas } = ventanaFalsa((async () => new Response()) as typeof fetch);
  const b = crearBuffers();
  instalarEn(w, b);
  instalarEn(w, b);
  w.console.error("algo", 1);
  w.console.warn("cuidado");
  assert.deepEqual(llamadas, [
    { nivel: "error", args: ["algo", 1] },
    { nivel: "warn", args: ["cuidado"] },
  ]);
  assert.deepEqual(b.errores.map((e) => [e.tipo, e.mensaje]), [
    ["console.error", "algo 1"],
    ["console.warn", "cuidado"],
  ]);
});

test("instalarEn: window error y unhandledrejection quedan en el buffer, hasta 30", () => {
  const { w, escuchas } = ventanaFalsa((async () => new Response()) as typeof fetch);
  const b = crearBuffers();
  instalarEn(w, b);
  escuchas.get("error")?.({ message: "x is undefined", filename: "https://os.x/_next/a.js", lineno: 3, colno: 7, error: new Error("x is undefined") });
  escuchas.get("unhandledrejection")?.({ reason: "nada" });
  assert.equal(b.errores[0]?.tipo, "error");
  assert.equal(b.errores[0]?.fuente, "https://os.x/_next/a.js:3:7");
  assert.equal(b.errores[1]?.mensaje, "nada");
  for (let i = 0; i < 40; i++) escuchas.get("unhandledrejection")?.({ reason: `r${i}` });
  assert.equal(b.errores.length, LIMITES.errores);
});
