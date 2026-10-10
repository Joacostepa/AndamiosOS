// Etiquetas QR del Pañol (etiquetas.ts): la grilla A4, el paginado y los nombres.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  A4, candidatos, grilla, ladoQr, matrizQr, paginar, pathQr, posicion, recortar, resumenHojas, urlCodigo,
  type Fuentes,
} from "./etiquetas.ts";

test("grilla: 25 mm entran 6 × 7 y 50 mm 3 × 4 en un A4 con 10 mm de margen", () => {
  const chica = grilla({ tamano: 25, margen: 10, separacion: 3 });
  assert.equal(chica.columnas, 6);
  assert.equal(chica.filas, 7);
  assert.equal(chica.porHoja, 42);
  const grande = grilla({ tamano: 50, margen: 10, separacion: 3 });
  assert.equal(grande.columnas, 3);
  assert.equal(grande.porHoja, 12);
});

test("grilla: nunca se sale de la hoja y queda centrada", () => {
  for (const tamano of [25, 50] as const) {
    for (const margen of [0, 5, 10, 20]) {
      for (const separacion of [0, 2, 5]) {
        const g = grilla({ tamano, margen, separacion });
        const ultima = posicion(g, g.porHoja - 1, separacion);
        assert.ok(ultima.x + g.celdaAncho <= A4.ancho - margen + 1e-9, `ancho ${tamano}/${margen}/${separacion}`);
        assert.ok(ultima.y + g.celdaAlto <= A4.alto - margen + 1e-9, `alto ${tamano}/${margen}/${separacion}`);
        const primera = posicion(g, 0, separacion);
        assert.ok(Math.abs(primera.x - (A4.ancho - (ultima.x + g.celdaAncho))) < 1e-9, "centrada");
      }
    }
  }
});

test("grilla: un margen absurdo deja al menos una etiqueta", () => {
  const g = grilla({ tamano: 50, margen: 200, separacion: 0 });
  assert.equal(g.porHoja, 1);
});

test("paginar reparte en hojas y respeta lo salteado", () => {
  assert.deepEqual(paginar([], 10), []);
  assert.deepEqual(paginar([1, 2, 3], 2), [[1, 2], [3]]);
  assert.deepEqual(paginar([1, 2, 3], 2, 1), [[null, 1], [2, 3]]);
  // Saltear toda la hoja no tiene sentido: se deja al menos un lugar.
  assert.deepEqual(paginar([1], 3, 9), [[null, null, 1]]);
  assert.equal(paginar(Array(43).fill(0), 42).length, 2);
});

test("resumenHojas", () => {
  assert.equal(resumenHojas(1, 42), "1 etiqueta en 1 hoja A4");
  assert.equal(resumenHojas(43, 42), "43 etiquetas en 2 hojas A4");
  assert.equal(resumenHojas(42, 42, 5), "42 etiquetas en 2 hojas A4");
});

test("urlCodigo no duplica la barra", () => {
  assert.equal(urlCodigo("https://os.andamios.com.ar/", "E7K2QX"), "https://os.andamios.com.ar/p/E7K2QX");
  assert.equal(urlCodigo("http://localhost:3000", "E7K2QX"), "http://localhost:3000/p/E7K2QX");
});

test("pathQr junta las rachas y respeta el margen", () => {
  const m = { size: 3, data: [1, 1, 0, 0, 0, 0, 1, 0, 1] };
  assert.equal(pathQr(m, 2), "M2 2h2v1h-2zM2 4h1v1h-1zM4 4h1v1h-1z");
  assert.equal(ladoQr(m, 2), 7);
});

test("matrizQr arma un QR de verdad, más grande con corrección H", () => {
  const url = urlCodigo("https://os.andamiosbuenosaires.com.ar", "E7K2QX");
  const q = matrizQr(url, "Q");
  const h = matrizQr(url, "H");
  assert.equal((q.size - 17) % 4, 0, "el lado es 17 + 4·versión");
  assert.ok(h.size >= q.size);
  assert.ok(pathQr(q).length > 100);
});

test("recortar", () => {
  assert.equal(recortar("  Tornillo   14x1 ", 30), "Tornillo 14x1");
  assert.equal(recortar("Disco de corte 115 mm para amoladora", 12), "Disco de co…");
});

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("candidatos: estantes con su estantería, cajón con su insumo, nuevas y anuladas", () => {
  const f: Fuentes = {
    ubicaciones: [
      { id: ID(1), padre_id: null, nombre: "Pañol", tipo: "panol", orden: 0, activo: true },
      { id: ID(2), padre_id: ID(1), nombre: "Estantería E3", tipo: "estanteria", orden: 0, activo: true },
      { id: ID(3), padre_id: ID(2), nombre: "Estante 2", tipo: "estante", orden: 2, activo: true },
      { id: ID(4), padre_id: ID(2), nombre: "Estante 1", tipo: "estante", orden: 1, activo: true },
      { id: ID(5), padre_id: ID(3), nombre: "C-07", tipo: "cajon", orden: 0, activo: true },
      { id: ID(6), padre_id: ID(3), nombre: "C-08", tipo: "cajon", orden: 1, activo: false },
    ],
    articulos: [{ id: ID(10), nombre: "Tornillo 14x1\"", ubicacion_id: ID(5), activo: true }],
    unidades: [
      { id: ID(20), articulo_id: ID(10), numero: "H-014", estado: "disponible", activo: true },
      { id: ID(21), articulo_id: ID(10), numero: "H-015", estado: "baja", activo: true },
    ],
    personas: [
      { tipo: "persona", id: ID(30), nombre: "Marcelo", apellido: "Ibáñez", activo: true },
      { tipo: "externa", id: ID(31), nombre: "Brian", apellido: "Sosa", activo: true },
      { tipo: "persona", id: ID(32), nombre: "Dado", apellido: "De Baja", activo: false },
    ],
    codigos: [
      { codigo: "AAAAAA", tipo: "ubicacion", entidad_id: ID(3), activo: true, impreso_at: "2026-10-01T00:00:00Z" },
      { codigo: "BBBBBB", tipo: "ubicacion", entidad_id: ID(4), activo: false, impreso_at: "2026-10-01T00:00:00Z" },
      { codigo: "CCCCCC", tipo: "ubicacion", entidad_id: ID(4), activo: true, impreso_at: null },
    ],
  };
  const est = candidatos("estantes", f);
  assert.deepEqual(est.map((c) => c.nombre), ["Estantería E3", "Estantería E3 · Estante 1", "Estantería E3 · Estante 2"]);
  assert.deepEqual(est.map((c) => [c.codigo, c.impreso]), [[null, false], ["CCCCCC", false], ["AAAAAA", true]]);

  assert.deepEqual(candidatos("cajones", f).map((c) => c.nombre), ["C-07 · Tornillo 14x1\""]);
  assert.deepEqual(candidatos("herramientas", f).map((c) => c.nombre), ["#H-014 · Tornillo 14x1\""]);
  const cred = candidatos("credenciales", f);
  assert.deepEqual(cred.map((c) => c.clave), [`externa:${ID(31)}`, `persona:${ID(30)}`]);
});
