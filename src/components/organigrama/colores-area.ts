// Color de ÁREA = identidad, nunca estado (docs/organigrama/propuesta.md § 3.4).
//
// ACÁ NO HAY COLORES: hay nombres de la paleta --tb-* de globals.css, que ya está calibrada en
// claro y en oscuro. Las clases van escritas enteras (no armadas con template strings) para que
// Tailwind las encuentre al escanear el código.
//
// - franja: el borde izquierdo de 3 px de cada tarjeta.
// - punto: el puntito que acompaña al nombre del área (siempre junto al texto).
// - encabezado: solo el encabezado de la columna lleva el tinte; las tarjetas quedan en bg-card,
//   así el ámbar de Operaciones no se confunde con el chip «aviso».
// - borde: el borde superior de la columna en la vista de impresión.

import type { ColorArea } from "@/lib/organigrama/tipos";

export type ClasesArea = { franja: string; punto: string; encabezado: string; borde: string };

export const COLOR_AREA: Record<ColorArea, ClasesArea> = {
  gris: {
    franja: "border-l-[color:var(--tb-gris-borde)]",
    punto: "bg-[var(--tb-gris-borde)]",
    encabezado: "bg-[var(--tb-gris-bg)] text-[var(--tb-gris-text)]",
    borde: "border-t-[color:var(--tb-gris-borde)]",
  },
  teal: {
    franja: "border-l-[color:var(--tb-teal-borde)]",
    punto: "bg-[var(--tb-teal-borde)]",
    encabezado: "bg-[var(--tb-teal-bg)] text-[var(--tb-teal-text)]",
    borde: "border-t-[color:var(--tb-teal-borde)]",
  },
  ambar: {
    franja: "border-l-[color:var(--tb-ambar-borde)]",
    punto: "bg-[var(--tb-ambar-borde)]",
    encabezado: "bg-[var(--tb-ambar-bg)] text-[var(--tb-ambar-text)]",
    borde: "border-t-[color:var(--tb-ambar-borde)]",
  },
  violeta: {
    franja: "border-l-[color:var(--tb-violeta-borde)]",
    punto: "bg-[var(--tb-violeta-borde)]",
    encabezado: "bg-[var(--tb-violeta-bg)] text-[var(--tb-violeta-text)]",
    borde: "border-t-[color:var(--tb-violeta-borde)]",
  },
  verde: {
    franja: "border-l-[color:var(--tb-verde-borde)]",
    punto: "bg-[var(--tb-verde-borde)]",
    encabezado: "bg-[var(--tb-verde-bg)] text-[var(--tb-verde-text)]",
    borde: "border-t-[color:var(--tb-verde-borde)]",
  },
  rosa: {
    franja: "border-l-[color:var(--tb-rosa-borde)]",
    punto: "bg-[var(--tb-rosa-borde)]",
    encabezado: "bg-[var(--tb-rosa-bg)] text-[var(--tb-rosa-text)]",
    borde: "border-t-[color:var(--tb-rosa-borde)]",
  },
  azul: {
    franja: "border-l-[color:var(--tb-azul-borde)]",
    punto: "bg-[var(--tb-azul-borde)]",
    encabezado: "bg-[var(--tb-azul-bg)] text-[var(--tb-azul-text)]",
    borde: "border-t-[color:var(--tb-azul-borde)]",
  },
};

export function clasesArea(color: ColorArea | undefined): ClasesArea {
  return COLOR_AREA[color ?? "gris"];
}
