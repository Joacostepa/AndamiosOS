// Geometría de Ciudad Armada: cuántas piezas tiene una pantalla y de qué lado de la fachada
// queda cada cosa. Si la normal se invierte, el andamio aparece adentro del edificio.

import { test } from "node:test";
import assert from "node:assert/strict";
import { alturaColumna, armarCapas, estructura, puntoDetras, seDibuja } from "./geometria.ts";
import type { ObraMapa } from "./tipos.ts";

const LNG = -58.4;
const LAT = -34.6;

function obra(extra: Partial<ObraMapa> = {}): ObraMapa {
  return {
    ventaId: 2758,
    venta: "S02758",
    cliente: null,
    direccion: "Av. Olazábal 2939, CABA",
    direccionCorta: "Av. Olazábal 2939",
    referencia: null,
    estado: "armada",
    lat: LAT,
    lng: LNG,
    ubicacion: "ok",
    fachada: { lng: LNG, lat: LAT, normal: [1, 0], calle: "Avenida Olazábal", coincideCalle: true },
    fechaArmado: "2026-09-01",
    fechaDeImportacion: false,
    fechaDesarme: null,
    desarmeProgramado: null,
    finEstimado: null,
    vencida: false,
    diasArmado: 41,
    tipo: "pantalla_proteccion",
    medidas: { largo: 9, ancho: 1.25, alto: 2.5, estimadas: false },
    queEstaArmado: null,
    queEstaArmadoFuente: null,
    queEstaArmadoFecha: null,
    fotos: [],
    url: "",
    ...extra,
  };
}

/** Centro del polígono en metros, proyectado sobre la normal (positivo = hacia el edificio). */
function haciaElEdificio(coords: number[][][], normal: [number, number]): number {
  const anillo = coords[0].slice(0, -1);
  const cx = anillo.reduce((s, p) => s + p[0], 0) / anillo.length;
  const cy = anillo.reduce((s, p) => s + p[1], 0) / anillo.length;
  const dx = (cx - LNG) * 111320 * Math.cos((LAT * Math.PI) / 180);
  const dy = (cy - LAT) * 110574;
  return dx * normal[0] + dy * normal[1];
}

test("pantalla de 9 × 1,25 × 2,5: 54 piezas", () => {
  const f = estructura(obra(), { color: "#2FBF84", tema: "noche" });
  // 5 marcos × (2 parantes + 2 travesaños) = 20 · 2 niveles × 4 (largueros, plataforma, baranda) = 8
  // · 2 cuerpos con diagonal × 2 tramos × 6 escalones = 24 · malla 1 · edificio aproximado 1.
  assert.equal(f.length, 54);
  assert.equal(f.filter((x) => x.properties.part === "n").length, 1);
  assert.equal(f.filter((x) => x.properties.part === "b").length, 1);
  assert.equal(f.filter((x) => x.properties.part === "p").length, 52);
  assert.equal(estructura(obra(), { color: "#2FBF84", tema: "noche", edificio: false }).length, 53);
});

for (const normal of [[1, 0], [0, 1], [-0.6, 0.8], [0.7071, -0.7071]] as [number, number][]) {
  test(`normal [${normal}]: la estructura del lado de la calle y el edificio del otro`, () => {
    const o = obra({ fachada: { lng: LNG, lat: LAT, normal, calle: null, coincideCalle: false } });
    const f = estructura(o, { color: "#2FBF84", tema: "dia" });
    for (const x of f.filter((x) => x.properties.part !== "b")) {
      assert.ok(haciaElEdificio(x.geometry.coordinates, normal) < 0, "pieza del andamio adentro del edificio");
    }
    const ed = f.find((x) => x.properties.part === "b");
    assert.ok(ed && haciaElEdificio(ed.geometry.coordinates, normal) > 5, "el edificio no quedó detrás de la fachada");
    const atras = puntoDetras(o, 5)!;
    assert.ok(haciaElEdificio([[atras, atras]], normal) > 4.9);
  });
}

test("sin fachada: el punto de Odoo y normal [0, 1]", () => {
  const f = estructura(obra({ fachada: null }), { color: "#2FBF84", tema: "noche" });
  const ed = f.find((x) => x.properties.part === "b")!;
  assert.ok(haciaElEdificio(ed.geometry.coordinates, [0, 1]) > 5);
});

test("sin ubicación o lejos no se dibuja; sin altura sí", () => {
  assert.equal(seDibuja(obra({ ubicacion: "sin_ubicacion", fachada: null, lat: null, lng: null })), false);
  assert.equal(seDibuja(obra({ ubicacion: "lejos" })), false);
  assert.equal(seDibuja(obra({ ubicacion: "sin_altura", fachada: null })), true);
  const capas = armarCapas(
    [
      { obra: obra({ ventaId: 1 }), categoria: "media", subtitulo: "41 días armada · pantalla" },
      { obra: obra({ ventaId: 2, ubicacion: "lejos" }), categoria: "media", subtitulo: "" },
    ],
    "noche",
    new Set([1]),
  );
  assert.equal(capas.puntos.features.length, 1);
  assert.equal(capas.columnas.features.length, 1);
  assert.equal(capas.estructura.features.length, 53, "con edificio de OSM no va el aproximado");
  assert.equal(capas.puntos.features[0].properties.c, "#E5A92A");
});

test("altura de la columna", () => {
  assert.equal(alturaColumna("pendiente", 10), 420);
  assert.equal(alturaColumna("desarmada", 300), 90);
  assert.equal(alturaColumna("reciente", 10), 92);
  assert.equal(alturaColumna("larga", 1000), 900);
});
