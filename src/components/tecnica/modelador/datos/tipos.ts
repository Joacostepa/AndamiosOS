// DTOs de la API del modelador (arquitectura-produccion.md §8.3).
//
// La persistencia (src/lib/tecnica/persistencia/tipos.ts) la escribe otro agente en paralelo.
// Mientras no exista, la pantalla usa ESTOS tipos, que siguen el contrato del plan al pie de la
// letra. Cuando esté, alcanza con reexportar desde allá (ver el handoff de la pantalla).

import type { Diseno } from "@/lib/tecnica/modelo";

/** Resumen guardado junto al modelo, para la lista (sin construir el diseño). */
export interface ResumenModelo {
  m2?: number;
  ml?: number;
  alturaMax?: number;
  pesoKg?: number;
  pesoParcial?: boolean;
  piezas?: number;
  estructuras?: number;
  sinCodigo?: number;
  texto?: string;
}

/** Fila de la lista: sin `diseno`. */
export interface ModeloLista {
  id: string;
  nombre: string;
  descripcion: string | null;
  obra_id: string | null;
  obra?: { id: string; codigo: string; nombre: string } | null;
  cotizacion_ref: string | null;
  es_plantilla: boolean;
  plantilla_categoria: string | null;
  revision: number;
  resumen: ResumenModelo | null;
  imagen_url: string | null;
  updated_at: string;
  created_at: string;
}

/** Modelo completo (con el diseño). */
export interface ModeloFila extends ModeloLista {
  diseno: Diseno;
  esquema: number;
  motor_version: string;
}

export type TipoDiff = "nuevo" | "cambia" | "igual" | "quita" | "conflicto_manual";

/** Una línea de la previa del cómputo: qué dice el modelo contra lo que hay. */
export interface DiffLinea {
  pieza_id: string;
  codigo: string;
  descripcion: string;
  tipo: TipoDiff;
  /** Cantidad que hay hoy en computo_items (null si no hay fila). */
  actual: number | null;
  /** Cantidad que dice el modelo (null si el modelo ya no la tiene). */
  modelo: number | null;
  origen: "modelo" | "modelo_editado" | "manual" | null;
}

/** Qué hacer con una línea editada a mano o manual. */
export type DecisionDiff = "modelo" | "mantener" | "sumar" | "borrar";

export interface PreviaComputo {
  computo: { id: string | null; estado: string | null; bloqueado: boolean };
  diff: DiffLinea[];
  omitidas: { clave: string; descripcion: string; cantidad: number }[];
  metricas: { superficie: number; metros_lineales: number; altura_maxima: number; tipo_sistema_andamio: string };
}

export interface RespuestaGenerar {
  computo_id: string;
  insertadas: number;
  actualizadas: number;
  borradas: number;
  conservadas: number;
  omitidas_sin_codigo: number;
}

export interface FiltroModelos {
  obra?: string | null;
  plantillas?: boolean;
  q?: string;
}

/** Categorías de "Mis plantillas" (las mismas que la galería). */
export const CATEGORIAS_PLANTILLA = [
  { valor: "fachada", etiqueta: "Fachadas" },
  { valor: "bandeja", etiqueta: "Bandejas y pórticos" },
  { valor: "torre", etiqueta: "Torres" },
  { valor: "interior", etiqueta: "Interiores y escaleras" },
  { valor: "especial", etiqueta: "Especiales" },
] as const;
