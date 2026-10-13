// Ciudad Armada: el estilo del mapa base (noche y día). `style()` y `PAL` de la maqueta aprobada
// (docs/mapa-obras/maqueta/ciudad-armada.html), con los tiles pedidos directo a OpenFreeMap.
//
// Un estilo propio y no el positron/dark de OpenFreeMap: el dueño quiere ver calles, nombres
// de calles, barrios y alturas, y nada más. Sin POIs, sin comercios, sin íconos: el mapa es el
// fondo y las obras son lo que tiene que leerse.
//
// Cambiar de tema NO recarga el estilo (eso borraría las capas de obras): el componente
// recorre `estiloMapa(tema).layers` y aplica cada `paint` con `setPaintProperty`.

import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";
import type { TemaMapa } from "./colores.ts";

/** [día, noche] */
export const PALETA = {
  bg: ["#E7EAE6", "#0B1116"],
  park: ["#D6E5D3", "#0F1F19"],
  water: ["#B9D3E0", "#0C2433"],
  minor: ["#FFFFFF", "#202B33"],
  mid: ["#FFFFFF", "#2E3B46"],
  major: ["#F7DBA8", "#7A5B2E"],
  motor: ["#F1BE72", "#B98134"],
  rail: ["#C3C9CE", "#28323A"],
  bld: ["#D3D8DC", "#1F2930"],
  road_t: ["#4E5A66", "#8D9AA5"],
  halo: ["#FFFFFF", "#0B1116"],
  place: ["#6F7D88", "#71808C"],
  hn: ["#8A95A0", "#4F5D68"],
  lbl: ["#111A22", "#F2F5F7"],
  sub: ["#52606B", "#9AA8B3"],
  dotStroke: ["#FFFFFF", "#0B1116"],
} as const satisfies Record<string, readonly [string, string]>;

export type ClavePaleta = keyof typeof PALETA;

export const colorPaleta = (k: ClavePaleta, tema: TemaMapa): string => PALETA[k][tema === "noche" ? 1 : 0];

export const FUENTE_BASE = "omt";
export const FUENTE_REGULAR = "Noto Sans Regular";
export const FUENTE_NEGRITA = "Noto Sans Bold";
/** La capa de edificios de OSM: va DESPUÉS de las estructuras (ver el componente). */
export const CAPA_EDIFICIOS = "bld";

const ATRIBUCION =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> · ' +
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · ' +
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a>';

/** Ancho de las calles según el zoom. */
const ancho = (a: number, b: number): ExpressionSpecification => [
  "interpolate",
  ["exponential", 1.6],
  ["zoom"],
  10,
  a,
  18,
  b,
];

export function estiloMapa(tema: TemaMapa): StyleSpecification {
  const pc = (k: ClavePaleta) => colorPaleta(k, tema);
  const redondo = { "line-cap": "round", "line-join": "round" } as const;
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      [FUENTE_BASE]: {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
        // Las opciones explícitas le ganan a la del TileJSON.
        attribution: ATRIBUCION,
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": pc("bg") } },
      { id: "park", type: "fill", source: FUENTE_BASE, "source-layer": "park", paint: { "fill-color": pc("park") } },
      {
        id: "lc",
        type: "fill",
        source: FUENTE_BASE,
        "source-layer": "landcover",
        filter: ["in", ["get", "class"], ["literal", ["grass", "wood"]]],
        paint: { "fill-color": pc("park"), "fill-opacity": 0.7 },
      },
      { id: "water", type: "fill", source: FUENTE_BASE, "source-layer": "water", paint: { "fill-color": pc("water") } },
      {
        id: "waterway",
        type: "line",
        source: FUENTE_BASE,
        "source-layer": "waterway",
        paint: { "line-color": pc("water"), "line-width": 1.2 },
      },
      {
        id: "rail",
        type: "line",
        source: FUENTE_BASE,
        "source-layer": "transportation",
        filter: ["==", ["get", "class"], "rail"],
        paint: { "line-color": pc("rail"), "line-width": ancho(0.6, 2), "line-dasharray": [3, 2] },
      },
      {
        id: "r-minor",
        type: "line",
        source: FUENTE_BASE,
        "source-layer": "transportation",
        minzoom: 12,
        filter: ["in", ["get", "class"], ["literal", ["minor", "service"]]],
        layout: redondo,
        paint: { "line-color": pc("minor"), "line-width": ancho(0.4, 11) },
      },
      {
        id: "r-mid",
        type: "line",
        source: FUENTE_BASE,
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["tertiary", "secondary"]]],
        layout: redondo,
        paint: { "line-color": pc("mid"), "line-width": ancho(0.8, 15) },
      },
      {
        id: "r-major",
        type: "line",
        source: FUENTE_BASE,
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["primary", "trunk"]]],
        layout: redondo,
        paint: { "line-color": pc("major"), "line-width": ancho(1.2, 20) },
      },
      {
        id: "r-motor",
        type: "line",
        source: FUENTE_BASE,
        "source-layer": "transportation",
        filter: ["==", ["get", "class"], "motorway"],
        layout: redondo,
        paint: { "line-color": pc("motor"), "line-width": ancho(1.4, 22) },
      },
      {
        id: CAPA_EDIFICIOS,
        type: "fill-extrusion",
        source: FUENTE_BASE,
        "source-layer": "building",
        minzoom: 13.5,
        paint: {
          "fill-extrusion-color": pc("bld"),
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          // De cerca se vuelven translúcidos para ver la estructura sobre la vereda.
          "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 16.5, 0.92, 18, 0.16],
        },
      },
      {
        id: "r-name",
        type: "symbol",
        source: FUENTE_BASE,
        "source-layer": "transportation_name",
        minzoom: 13,
        layout: {
          "symbol-placement": "line",
          "text-field": ["get", "name"],
          "text-font": [FUENTE_REGULAR],
          "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10.5, 18, 14],
          "text-max-angle": 30,
        },
        paint: { "text-color": pc("road_t"), "text-halo-color": pc("halo"), "text-halo-width": 1.4 },
      },
      {
        id: "hn",
        type: "symbol",
        source: FUENTE_BASE,
        "source-layer": "housenumber",
        minzoom: 17.2,
        layout: { "text-field": ["get", "housenumber"], "text-font": [FUENTE_REGULAR], "text-size": 10.5 },
        paint: { "text-color": pc("hn"), "text-halo-color": pc("halo"), "text-halo-width": 1 },
      },
      {
        id: "place-b",
        type: "symbol",
        source: FUENTE_BASE,
        "source-layer": "place",
        minzoom: 11,
        maxzoom: 15.5,
        filter: ["in", ["get", "class"], ["literal", ["suburb", "neighbourhood", "quarter"]]],
        layout: {
          "text-field": ["upcase", ["get", "name"]],
          "text-font": [FUENTE_NEGRITA],
          "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10, 15, 13],
          "text-letter-spacing": 0.14,
          "text-max-width": 8,
        },
        paint: { "text-color": pc("place"), "text-halo-color": pc("halo"), "text-halo-width": 1.2 },
      },
      {
        id: "place-c",
        type: "symbol",
        source: FUENTE_BASE,
        "source-layer": "place",
        maxzoom: 12.5,
        filter: ["in", ["get", "class"], ["literal", ["city", "town"]]],
        layout: {
          "text-field": ["get", "name"],
          "text-font": [FUENTE_NEGRITA],
          "text-size": ["interpolate", ["linear"], ["zoom"], 8, 11, 12, 15],
        },
        paint: { "text-color": pc("road_t"), "text-halo-color": pc("halo"), "text-halo-width": 1.4 },
      },
    ],
  };
}
