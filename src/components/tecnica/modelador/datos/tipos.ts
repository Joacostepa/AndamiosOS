// DTOs de la API del modelador (arquitectura-produccion.md §8.3).
//
// La fuente de verdad es la persistencia (src/lib/tecnica/persistencia/tipos.ts): acá solo se
// reexportan, más las etiquetas de «Mis plantillas» que usa la pantalla.

import type { CATEGORIAS_PLANTILLA as CATEGORIAS_API } from "@/lib/tecnica/persistencia/validar";

export type {
  DecisionDiff, DiffLinea, LineaOmitida, ModeloFila, ModeloLista, PreviaComputo, RespuestaGenerar, ResumenModelo, TipoDiff,
} from "@/lib/tecnica/persistencia/tipos";
export type { FiltroModelos } from "@/hooks/use-modelador";

export type CategoriaPlantilla = (typeof CATEGORIAS_API)[number];

/** Categorías de "Mis plantillas" (las mismas que la galería). Los valores los valida la API. */
export const CATEGORIAS_PLANTILLA: readonly { valor: CategoriaPlantilla; etiqueta: string }[] = [
  { valor: "fachada", etiqueta: "Fachadas" },
  { valor: "bandeja", etiqueta: "Bandejas y pórticos" },
  { valor: "torre", etiqueta: "Torres" },
  { valor: "interior", etiqueta: "Interiores y escaleras" },
  { valor: "especial", etiqueta: "Especiales" },
];

/** Etiqueta para mostrar la categoría guardada (incluye las que no se ofrecen al guardar). */
export function etiquetaCategoria(c: string | null | undefined): string {
  if (!c) return "";
  if (c === "portico") return "Bandejas y pórticos";
  if (c === "libre") return "Estructura libre";
  return CATEGORIAS_PLANTILLA.find((x) => x.valor === c)?.etiqueta ?? c;
}
