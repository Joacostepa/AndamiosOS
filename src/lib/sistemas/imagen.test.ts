// Las cuentas de las imágenes del reporte (imagen.ts) y la detección de captura «toda igual»
// (captura-pantalla.ts). Lo que toca el navegador (canvas, toBlob) no se prueba acá.

import { test } from "node:test";
import assert from "node:assert/strict";
import { aCoordenadasImagen, escalaParaCaber, grosorTrazo, medidasAjustadas, mimeAceptado, planDeIntentos, rectEntre } from "./imagen.ts";
import { esCasiUniforme } from "./captura-pantalla.ts";
import { tituloDePantalla } from "./contexto-cliente.ts";

test("medidasAjustadas: el lado largo queda en 1920 y nunca agranda", () => {
  assert.deepEqual(medidasAjustadas(3840, 2160), { ancho: 1920, alto: 1080, escala: 0.5 });
  assert.deepEqual(medidasAjustadas(1170, 2532).alto, 1920);
  assert.equal(medidasAjustadas(1170, 2532).ancho, 887);
  assert.deepEqual(medidasAjustadas(800, 600), { ancho: 800, alto: 600, escala: 1 });
  assert.deepEqual(medidasAjustadas(0, 0), { ancho: 1, alto: 1, escala: 1 });
});

test("planDeIntentos: arranca en WebP 0,85 y termina más chica", () => {
  const p = planDeIntentos(1920);
  assert.deepEqual(p[0], { mime: "image/webp", calidad: 0.85, ladoMax: 1920 });
  assert.ok(p.slice(1).every((i) => i.mime === "image/jpeg"));
  assert.ok(p[p.length - 1]!.ladoMax < 1920);
});

test("mimeAceptado: sólo los tres que acepta el bucket", () => {
  assert.equal(mimeAceptado("image/webp"), "image/webp");
  assert.equal(mimeAceptado("IMAGE/PNG"), "image/png");
  assert.equal(mimeAceptado("image/gif"), null);
  assert.equal(mimeAceptado(""), null);
});

test("escalaParaCaber: entra entera sin deformarse ni agrandar (salvo las muy chicas)", () => {
  // captura de escritorio en un celular: manda el ancho
  assert.deepEqual(escalaParaCaber(1920, 1080, 366, 600), { ancho: 366, alto: 205, escala: 366 / 1920 });
  // captura de celular en la compu: manda el alto
  const r = escalaParaCaber(780, 1688, 1000, 700);
  assert.equal(r.alto, 700);
  assert.equal(r.ancho, Math.floor(780 * (700 / 1688)));
  // ya entra: 1:1
  assert.equal(escalaParaCaber(600, 400, 1000, 800).escala, 1);
  // muy chica: se agranda para poder marcarla con el dedo
  assert.equal(escalaParaCaber(200, 100, 400, 400).ancho, 400);
  assert.equal(escalaParaCaber(100, 100, 0, 400).escala, 0);
});

test("grosorTrazo: 3 px como mínimo, más en las capturas grandes", () => {
  assert.equal(grosorTrazo(400, 300), 3);
  assert.equal(grosorTrazo(1920, 1080), 5);
  assert.equal(grosorTrazo(780, 1688), 5);
});

test("rectEntre: ordena los puntos y recorta a la imagen", () => {
  assert.deepEqual(rectEntre([50, 80], [10, 20], { ancho: 100, alto: 100 }), { x: 10, y: 20, ancho: 40, alto: 60 });
  assert.deepEqual(rectEntre([-20, 90], [130, 120], { ancho: 100, alto: 100 }), { x: 0, y: 90, ancho: 100, alto: 10 });
});

test("aCoordenadasImagen: de la pantalla a los píxeles de la imagen", () => {
  const caja = { left: 10, top: 20, width: 200, height: 100 };
  assert.deepEqual(aCoordenadasImagen({ x: 110, y: 70 }, caja, { ancho: 1000, alto: 500 }), [500, 250]);
  assert.deepEqual(aCoordenadasImagen({ x: 0, y: 500 }, caja, { ancho: 1000, alto: 500 }), [0, 500], "recorta afuera");
});

function pixeles(n: number, color: (i: number) => [number, number, number, number]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) d.set(color(i), i * 4);
  return d;
}

test("esCasiUniforme: en blanco, en negro o transparente → sí; una pantalla real → no", () => {
  assert.equal(esCasiUniforme(pixeles(1200, () => [255, 255, 255, 255])), true);
  assert.equal(esCasiUniforme(pixeles(1200, () => [0, 0, 0, 255])), true);
  assert.equal(esCasiUniforme(pixeles(1200, () => [0, 0, 0, 0])), true, "transparente = blanco");
  assert.equal(esCasiUniforme(pixeles(1200, (i) => (i % 7 === 0 ? [30, 30, 30, 255] : [250, 250, 250, 255]))), false);
  // la barra lateral oscura y el resto claro
  assert.equal(esCasiUniforme(pixeles(1200, (i) => (i % 40 < 8 ? [24, 24, 27, 255] : [255, 255, 255, 255]))), false);
  assert.equal(esCasiUniforme(new Uint8ClampedArray(0)), true);
});

test("tituloDePantalla: el h1 manda; si no, document.title sin «| AndamiosOS»", () => {
  assert.equal(tituloDePantalla("  Hoja del día \n", "x"), "Hoja del día");
  assert.equal(tituloDePantalla(null, "Partes | AndamiosOS"), "Partes");
  assert.equal(tituloDePantalla("", "AndamiosOS"), "AndamiosOS");
  assert.equal(tituloDePantalla(null, null), "");
  assert.ok(tituloDePantalla("a".repeat(500), "").length <= 200);
});
