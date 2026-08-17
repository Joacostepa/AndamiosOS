// Tokens visuales del tablero. Mantiene la paleta de marca ABA ya usada en el módulo
// de planificación anterior (src/lib/planificacion/colores.ts): coral #D85A30 como
// acción, y los hex de tipo de OT como base de la paleta de cuadrillas.

import { CORAL, ACENTO_BG } from "@/lib/planificacion/colores";

export { CORAL, ACENTO_BG };

export type ColorCuadrilla = { bg: string; borde: string; text: string; suave: string };

// Una tarjeta se pinta con el color de SU cuadrilla (spec §2), no con el tipo de OT.
// La paleta cicla: alcanza para las ~8 filas del diseño y tolera las 15 cuadrillas
// activas que hoy tiene Odoo.
const PALETA: ColorCuadrilla[] = [
  { bg: "#E6F1FB", borde: "#378ADD", text: "#0C447C", suave: "#F4F9FE" }, // azul
  { bg: "#FAEEDA", borde: "#EF9F27", text: "#633806", suave: "#FEF9F1" }, // ámbar
  { bg: "#EAF3DE", borde: "#639922", text: "#27500A", suave: "#F6FAF0" }, // verde
  { bg: "#FBEAF0", borde: "#E06090", text: "#72243E", suave: "#FEF5F8" }, // rosa
  { bg: "#EDEAFB", borde: "#7B6BD8", text: "#332A72", suave: "#F8F7FE" }, // violeta
  { bg: "#DEF2F1", borde: "#2AA79E", text: "#0B4F4A", suave: "#F0FAF9" }, // teal
  { bg: "#FAECE7", borde: "#D85A30", text: "#993C1D", suave: "#FDF7F4" }, // coral
  { bg: "#EDEFF2", borde: "#6B7A8D", text: "#2E3A47", suave: "#F7F8FA" }, // gris azulado
];

export function colorCuadrilla(indice: number): ColorCuadrilla {
  return PALETA[((indice % PALETA.length) + PALETA.length) % PALETA.length];
}

// Semáforo de habilitación (x_hab_semaforo). Se ve como un punto en la esquina de la
// tarjeta: advierte, no bloquea — las obras sin habilitar entran igual al tablero.
export const SEMAFORO: Record<string, { color: string; label: string }> = {
  verde: { color: "#639922", label: "Habilitación al día" },
  amarillo: { color: "#EF9F27", label: "Habilitación próxima a vencer" },
  rojo: { color: "#D92D20", label: "Habilitación crítica" },
  vencida: { color: "#7A271A", label: "Habilitación vencida" },
  gris: { color: "#B4B4B4", label: "Sin datos de habilitación" },
};

export function semaforo(valor: string | null | undefined) {
  return SEMAFORO[valor ?? "gris"] ?? SEMAFORO.gris;
}

// Color de la barra de ocupación de la celda.
export function colorOcupacion(nivel: "libre" | "parcial" | "completa" | "sobre"): string {
  if (nivel === "sobre") return "#D92D20";
  if (nivel === "completa") return CORAL;
  if (nivel === "parcial") return "#EF9F27";
  return "transparent";
}

export const URGENCIA_ALTA_BORDE = "#D92D20";
