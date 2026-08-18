// Tokens visuales del tablero. Mantiene la paleta de marca ABA ya usada en el módulo
// de planificación anterior (src/lib/planificacion/colores.ts): coral #D85A30 como
// acción, y los hex de tipo de OT como base de la paleta de cuadrillas.

import { CORAL, ACENTO_BG } from "@/lib/planificacion/colores";

export { CORAL, ACENTO_BG };

export type ColorCuadrilla = { bg: string; borde: string; text: string; suave: string };

// El color de cuadrilla identifica la FILA, no la tarjeta (v3 invierte el criterio de
// spec §2). Las filas ya son las cuadrillas: una tarjeta que está en la fila de
// Cuadrilla 3 no puede ser de otra, así que el fondo —el canal más fuerte que hay—
// estaba gastado en repetir lo que la posición ya decía. Ahora codifica el tipo de OT,
// que es lo que el jefe de obra necesita leer rápido. Ver TIPO_OT más abajo.
//
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

// ── Tipo de OT ───────────────────────────────────────────────────────────────
//
// El tipo se distingue por DIRECCIÓN antes que por color: armado sube, desarme baja.
// Una franja de 3px de color no alcanza —se pierde a la escala de la tarjeta y no
// funciona para daltónicos— así que la señal primaria es la forma y el color acompaña.

export type ColorTipo = { bg: string; text: string; icono: "arriba" | "abajo" | "otro" };

// Medido contra Odoo (1003 OTs): desarme 444 (44,3%), armado 315 (31,4%), otro 244 (24,3%).
// mantenimiento / ampliacion / desmonte_parcial existen en el modelo pero no se usan:
// caen en el gris neutro hasta que aparezcan.
export const TIPO_OT: Record<string, ColorTipo> = {
  armado: { bg: "#E6F1FB", text: "#0C447C", icono: "arriba" },
  desarme: { bg: "#FAEEDA", text: "#633806", icono: "abajo" },
};

export const TIPO_OT_NEUTRO: ColorTipo = { bg: "#F1EFE8", text: "#5F5E5A", icono: "otro" };

export function colorTipo(tipo: string | null | undefined): ColorTipo {
  return TIPO_OT[tipo ?? ""] ?? TIPO_OT_NEUTRO;
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

// La barra es UNA sola señal: cuánto de la capacidad diaria está ocupado, y si se pasó.
// Antes el parcial iba en ámbar, que competía con el ámbar de desarme dentro de la misma
// celda y además marcaba como alerta algo que no lo es: una celda al 50% está bien.
// Parcial y completa comparten color; lo que cambia es el ancho del relleno.
export function colorOcupacion(nivel: "libre" | "parcial" | "completa" | "sobre"): string {
  if (nivel === "sobre") return "#D92D20";
  if (nivel === "libre") return "transparent";
  return "#B4B2A9";
}

/** Riel de la barra de ocupación: se dibuja siempre, a ancho completo de la celda. */
export const RIEL_OCUPACION = "#E8E6DF";

export const URGENCIA_ALTA_BORDE = "#D92D20";
