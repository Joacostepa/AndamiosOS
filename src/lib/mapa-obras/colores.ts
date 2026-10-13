// Colores de Ciudad Armada: los de la maqueta aprobada (docs/mapa-obras/maqueta/ciudad-armada.html).
// Los usa el mapa para pintar y la página para la leyenda y la lista, así que viven acá y en
// un solo lugar: si un color cambia, cambia en los tres.

import type { CategoriaMapa } from "./tipos.ts";

export const COLOR_CATEGORIA: Record<CategoriaMapa, string> = {
  reciente: "#2FBF84", // ≤ 30 días
  media: "#E5A92A", // 31–90
  larga: "#F0546A", // > 90
  importacion: "#D08AA8", // fecha de armado = la importación
  sinFecha: "#9AA3AD",
  pendiente: "#A98BFF", // pendiente de desarme (con pulso)
  sigue: "#5FB3D9", // histórico: hoy sigue en la calle
  desarmada: "#A7B0BA", // histórico: ya se desarmó
};

export type TemaMapa = "noche" | "dia";

/** Colores de la estructura que no dependen de la categoría. */
export const COLOR_ESTRUCTURA = {
  /** Tablones de las plataformas. */
  plataforma: { noche: "#8A6E48", dia: "#B08A58" },
  /** Edificio aproximado cuando OpenStreetMap no tiene uno detrás. */
  edificio: { noche: "#2E3A44", dia: "#D5DADF" },
} as const;
