// Capas de obras de Ciudad Armada sobre el mapa base. Portado de `addObraLayers()`, `pill()`,
// `addPills()`, `lblLayout()` y `themeObras()` de la maqueta aprobada
// (docs/mapa-obras/maqueta/ciudad-armada.html). Sólo se usa del lado del cliente.

import type { ExpressionSpecification, Map as MapLibreMap, SymbolLayerSpecification } from "maplibre-gl";
import { COLOR_CATEGORIA, type TemaMapa } from "@/lib/mapa-obras/colores";
import { CAPA_EDIFICIOS, colorPaleta, FUENTE_NEGRITA, FUENTE_REGULAR } from "@/lib/mapa-obras/estilo-mapa";

export const FUENTE_ESTRUCTURA = "ob-sc";
export const FUENTE_COLUMNAS = "ob-beam";
export const FUENTE_PUNTOS = "ob-pt";

export const CAPA = {
  columna: "beam",
  edificio: "sc-b",
  piezas: "sc-p",
  malla: "sc-n",
  halo: "halo",
  punto: "dot",
  etiqueta: "lbl",
  etiquetaSel: "lbl-sel",
} as const;

/** Capas donde un click selecciona la obra (estructura, columna, punto y etiqueta). */
export const CAPAS_CLICK = [
  CAPA.piezas,
  CAPA.malla,
  CAPA.edificio,
  CAPA.columna,
  CAPA.punto,
  CAPA.etiquetaSel,
  CAPA.etiqueta,
] as const;

const VACIO = { type: "FeatureCollection" as const, features: [] };

/** Chip redondeado que se estira detrás del texto de la etiqueta (`icon-text-fit`). */
function pildora(map: MapLibreMap, nombre: string, relleno: string, borde: string, grosor: number) {
  const r = 2;
  const W = 48 * r;
  const H = 32 * r;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const x = cv.getContext("2d");
  if (!x) return;
  const i = (grosor * r) / 2 + 1;
  const rad = 9 * r;
  const [x0, y0, x1, y1] = [i, i, W - i, H - i];
  x.beginPath();
  x.moveTo(x0 + rad, y0);
  x.arcTo(x1, y0, x1, y1, rad);
  x.arcTo(x1, y1, x0, y1, rad);
  x.arcTo(x0, y1, x0, y0, rad);
  x.arcTo(x0, y0, x1, y0, rad);
  x.closePath();
  x.fillStyle = relleno;
  x.fill();
  x.lineWidth = grosor * r;
  x.strokeStyle = borde;
  x.stroke();
  if (map.hasImage(nombre)) map.removeImage(nombre);
  map.addImage(nombre, x.getImageData(0, 0, W, H), {
    pixelRatio: r,
    stretchX: [[12 * r, 36 * r]],
    stretchY: [[12 * r, 20 * r]],
    content: [9 * r, 7 * r, 39 * r, 25 * r],
  });
}

function agregarPildoras(map: MapLibreMap) {
  pildora(map, "pill-n", "rgba(12,18,24,.92)", "rgba(160,175,186,.38)", 1);
  pildora(map, "pill-d", "rgba(255,255,255,.96)", "rgba(17,26,34,.2)", 1);
  pildora(map, "pill-sn", "rgba(12,18,24,.96)", "rgba(255,255,255,.92)", 1.6);
  pildora(map, "pill-sd", "rgba(255,255,255,1)", "rgba(17,26,34,.85)", 1.6);
}

/**
 * Etiqueta en chip: "• Dirección" en negrita con el punto del color de la categoría y, abajo,
 * el subtítulo. Va '•' (U+2022) y no '●': el círculo grande no está en los rangos de glifos
 * que se cargan y saldría un cuadradito.
 */
export function layoutEtiqueta(seleccionada: boolean, tema: TemaMapa): NonNullable<SymbolLayerSpecification["layout"]> {
  const noche = tema === "noche";
  const texto = [
    "format",
    "• ",
    { "text-color": ["get", "c"], "font-scale": 1.35 },
    ["get", "lab"],
    {},
    "\n",
    {},
    ["get", "sub"],
    { "font-scale": 0.84, "text-font": ["literal", [FUENTE_REGULAR]], "text-color": colorPaleta("sub", tema) },
  ] as unknown as ExpressionSpecification;
  return {
    "text-field": texto,
    "text-font": [FUENTE_NEGRITA],
    "text-size": seleccionada ? 14 : 12.5,
    "text-max-width": 22,
    "text-line-height": 1.3,
    "text-justify": "left",
    "icon-image": seleccionada ? (noche ? "pill-sn" : "pill-sd") : noche ? "pill-n" : "pill-d",
    "icon-text-fit": "both",
    "icon-text-fit-padding": [5, 10, 5, 9],
    "text-anchor": "bottom",
    "text-offset": [
      "interpolate",
      ["linear"],
      ["zoom"],
      15,
      ["literal", [0, -1.2]],
      19,
      ["literal", [0, seleccionada ? -7.5 : -6.5]],
    ],
    "text-allow-overlap": seleccionada,
    "text-ignore-placement": seleccionada,
    "icon-allow-overlap": seleccionada,
    "icon-ignore-placement": seleccionada,
  };
}

/**
 * Agrega fuentes y capas de obras y las ordena. EL ORDEN IMPORTA: los edificios de OSM (`bld`)
 * se dibujan DESPUÉS de las estructuras; si no, las tapan aunque sean translúcidos. Queda:
 * … beam, sc-p, sc-n, sc-b, bld, halo, dot, lbl, lbl-sel.
 */
export function agregarCapasObras(map: MapLibreMap, tema: TemaMapa) {
  agregarPildoras(map);
  map.addSource(FUENTE_ESTRUCTURA, { type: "geojson", data: VACIO });
  map.addSource(FUENTE_COLUMNAS, { type: "geojson", data: VACIO });
  map.addSource(FUENTE_PUNTOS, { type: "geojson", data: VACIO });

  const extrusion = {
    "fill-extrusion-color": ["get", "c"] as ExpressionSpecification,
    "fill-extrusion-height": ["get", "t"] as ExpressionSpecification,
    "fill-extrusion-base": ["get", "b"] as ExpressionSpecification,
  };

  // De lejos, una columna por obra (base de 70 m) que se hunde al acercarse.
  map.addLayer({
    id: CAPA.columna,
    type: "fill-extrusion",
    source: FUENTE_COLUMNAS,
    maxzoom: 16,
    paint: {
      "fill-extrusion-color": ["get", "c"],
      "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.9, 15, 0.75, 16, 0],
      "fill-extrusion-height": [
        "interpolate",
        ["linear"],
        ["zoom"],
        9,
        ["*", ["get", "h"], 3],
        12,
        ["*", ["get", "h"], 1.2],
        14.5,
        ["*", ["get", "h"], 0.35],
        15.6,
        0,
      ],
      "fill-extrusion-base": 0,
    },
  });
  // De cerca, la estructura.
  map.addLayer({
    id: CAPA.edificio,
    type: "fill-extrusion",
    source: FUENTE_ESTRUCTURA,
    minzoom: 15,
    filter: ["==", ["get", "part"], "b"],
    paint: { ...extrusion, "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 16.5, 0.9, 18, 0.16] },
  });
  map.addLayer({
    id: CAPA.piezas,
    type: "fill-extrusion",
    source: FUENTE_ESTRUCTURA,
    minzoom: 15,
    filter: ["==", ["get", "part"], "p"],
    paint: { ...extrusion, "fill-extrusion-opacity": 1, "fill-extrusion-vertical-gradient": false },
  });
  map.addLayer({
    id: CAPA.malla,
    type: "fill-extrusion",
    source: FUENTE_ESTRUCTURA,
    minzoom: 15,
    filter: ["==", ["get", "part"], "n"],
    paint: { ...extrusion, "fill-extrusion-opacity": 0.32 },
  });
  map.addLayer({
    id: CAPA.halo,
    type: "circle",
    source: FUENTE_PUNTOS,
    filter: ["==", ["get", "cat"], "pendiente"],
    paint: {
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": COLOR_CATEGORIA.pendiente,
      "circle-stroke-width": 2,
      "circle-radius": 14,
      "circle-stroke-opacity": 0.6,
      "circle-pitch-alignment": "map",
    },
  });
  map.addLayer({
    id: CAPA.punto,
    type: "circle",
    source: FUENTE_PUNTOS,
    paint: {
      "circle-color": ["get", "c"],
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 13, 5.5, 16, 7, 19, 9],
      "circle-stroke-color": colorPaleta("dotStroke", tema),
      "circle-stroke-width": 1.5,
      "circle-pitch-alignment": "map",
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 16, 1, 17.2, 0],
      "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 16, 1, 17.2, 0],
    },
  });
  map.addLayer({
    id: CAPA.etiqueta,
    type: "symbol",
    source: FUENTE_PUNTOS,
    minzoom: 13.6,
    layout: layoutEtiqueta(false, tema),
    paint: { "text-color": colorPaleta("lbl", tema) },
  });
  map.addLayer({
    id: CAPA.etiquetaSel,
    type: "symbol",
    source: FUENTE_PUNTOS,
    filter: ["==", ["get", "id"], -1],
    layout: layoutEtiqueta(true, tema),
    paint: { "text-color": colorPaleta("lbl", tema) },
  });

  map.moveLayer(CAPA.edificio, CAPA.halo);
  if (map.getLayer(CAPA_EDIFICIOS)) map.moveLayer(CAPA_EDIFICIOS, CAPA.halo);
}

/** Los colores de las capas de obras que dependen del tema (el resto sale del style). */
export function temaCapasObras(map: MapLibreMap, tema: TemaMapa) {
  map.setPaintProperty(CAPA.punto, "circle-stroke-color", colorPaleta("dotStroke", tema));
  for (const [capa, sel] of [
    [CAPA.etiqueta, false],
    [CAPA.etiquetaSel, true],
  ] as const) {
    map.setPaintProperty(capa, "text-color", colorPaleta("lbl", tema));
    const L = layoutEtiqueta(sel, tema);
    map.setLayoutProperty(capa, "text-field", L["text-field"]);
    map.setLayoutProperty(capa, "icon-image", L["icon-image"]);
  }
}

/** La etiqueta de la seleccionada se ve grande y la normal se oculta. */
export function marcarSeleccionada(map: MapLibreMap, ventaId: number | null) {
  const id = ventaId ?? -1;
  map.setFilter(CAPA.etiquetaSel, ["==", ["get", "id"], id]);
  map.setFilter(CAPA.etiqueta, ["!=", ["get", "id"], id]);
}
