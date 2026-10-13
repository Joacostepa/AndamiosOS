import { test } from "node:test";
import assert from "node:assert/strict";
import { FuenteTiles, calcularFachada, mismaCalle, tilesAlrededor, type Linea } from "./fachada.ts";

// Una manzana de mentira en Recoleta: Av. Santa Fe corre de oeste a este sobre lat0, Uriburu
// corre de sur a norte sobre lng0.
const lat0 = -34.595, lng0 = -58.395;
const mLat = 1 / 110_574, mLng = 1 / (111_320 * Math.cos((lat0 * Math.PI) / 180));
const santaFe: Linea = { nombre: "Avenida Santa Fe", clase: "primary", coords: [[lng0 - 300 * mLng, lat0], [lng0 + 300 * mLng, lat0]] };
const uriburu: Linea = { nombre: "José Evaristo Uriburu", clase: "minor", coords: [[lng0, lat0 - 300 * mLat], [lng0, lat0 + 300 * mLat]] };

test("la calle de la dirección, aunque haya otra más cerca", () => {
  // La obra está 30 m al norte de Santa Fe y 10 m al este de Uriburu: gana la calle de la dirección.
  const f = calcularFachada(lat0 + 30 * mLat, lng0 + 10 * mLng, "AV SANTA FE 1476 CABA", { calles: [santaFe, uriburu], nombres: [santaFe, uriburu] });
  assert.ok(f);
  assert.equal(f.calle, "Avenida Santa Fe");
  assert.equal(f.coincideCalle, true);
  assert.deepEqual(f.normal, [0, 1]); // hacia el norte, el lado de la obra
  // Media calzada de una primary (12 m) + 1,5 m de vereda.
  assert.ok(Math.abs((f.lat - lat0) / mLat - 13.5) < 0.05);
  assert.ok(Math.abs((f.lng - lng0) / mLng - 10) < 0.05);
});

test("del otro lado de la calle, la normal se da vuelta", () => {
  const f = calcularFachada(lat0 - 20 * mLat, lng0, "Santa Fe 1476", { calles: [santaFe], nombres: [santaFe] });
  assert.deepEqual(f?.normal, [0, -1]);
});

test("si la calle de la dirección no aparece, la más cercana a menos de 90 m", () => {
  const f = calcularFachada(lat0 + 30 * mLat, lng0 + 10 * mLng, "Palacio Sarmiento, Pje. Pizzurno 935", { calles: [santaFe, uriburu], nombres: [santaFe, uriburu] });
  assert.equal(f?.calle, "José Evaristo Uriburu");
  assert.equal(f?.coincideCalle, false);
  // La capa de calles no trae nombre: se toma el de transportation_name que pasa por ahí.
  const sinNombre = { ...uriburu, nombre: null };
  const g = calcularFachada(lat0 + 30 * mLat, lng0 + 10 * mLng, "Pizzurno 935", { calles: [sinNombre], nombres: [uriburu] });
  assert.equal(g?.calle, "José Evaristo Uriburu");
  assert.deepEqual(f?.normal, [1, 0]);
  assert.equal(calcularFachada(lat0 + 120 * mLat, lng0 + 120 * mLng, "Pizzurno 935", { calles: [santaFe, uriburu], nombres: [] }), null);
});

test("comparar nombres por palabras enteras", () => {
  assert.equal(mismaCalle("Avenida Santa Fe", "santa fe"), true);
  assert.equal(mismaCalle("Avenida General Las Heras", "las heras"), true);
  assert.equal(mismaCalle("La Rioja", "rio"), false);
  assert.equal(mismaCalle("Profesor J. Mariño", "profesor marino"), true);
  assert.equal(mismaCalle("General Lucio Norberto Mansilla", "mansilla"), true);
  assert.equal(mismaCalle("137 - Avenida Rivadavia", "rivadavia"), true);
  assert.equal(mismaCalle("Avenida 9 de Julio", "9 de julio"), true);
  assert.equal(mismaCalle("Avenida de Mayo", "25 de mayo"), false);
  assert.equal(mismaCalle("25 de Mayo", "de mayo"), false);
  assert.equal(mismaCalle("Avenida del Libertador", "libertador"), true);
  assert.equal(mismaCalle("Avenida General Las Heras", "las heras"), true);
  assert.equal(mismaCalle(null, "santa fe"), false);
});

test("tiles: casi siempre uno; cerca del borde, más", () => {
  assert.equal(tilesAlrededor(lat0, lng0).length >= 1, true);
  assert.equal(tilesAlrededor(lat0, lng0).length <= 4, true);
});

test("FuenteTiles: la URL sale del TileJSON y cada tile se baja una sola vez", async () => {
  const pedidas: string[] = [];
  const fuente = new FuenteTiles({
    fetch: async (url: string) => {
      pedidas.push(url);
      if (url.endsWith("/planet")) return new Response(JSON.stringify({ tiles: ["https://t/v9/{z}/{x}/{y}.pbf"] }));
      return new Response(new Uint8Array(0));
    },
    tilejson: "https://t/planet",
  });
  const [a, b] = await Promise.all([fuente.alrededor(lat0, lng0), fuente.alrededor(lat0, lng0)]);
  assert.deepEqual(a, { calles: [], nombres: [] });
  assert.deepEqual(b, a);
  assert.equal(pedidas.filter((u) => u.endsWith("/planet")).length, 1);
  const tiles = pedidas.filter((u) => u.endsWith(".pbf"));
  assert.equal(new Set(tiles).size, tiles.length);
  assert.match(tiles[0], /^https:\/\/t\/v9\/14\/\d+\/\d+\.pbf$/);
});

test("FuenteTiles: un tile que falla tira ErrorTiles y no se recuerda", async () => {
  let fallar = true;
  const fuente = new FuenteTiles({
    fetch: async (url: string) => {
      if (url.endsWith("/planet")) return new Response(JSON.stringify({ tiles: ["https://t/{z}/{x}/{y}.pbf"] }));
      return fallar ? new Response("", { status: 503 }) : new Response(new Uint8Array(0));
    },
    tilejson: "https://t/planet",
  });
  await assert.rejects(fuente.alrededor(lat0, lng0), { name: "ErrorTiles" });
  fallar = false;
  assert.deepEqual(await fuente.alrededor(lat0, lng0), { calles: [], nombres: [] });
});
