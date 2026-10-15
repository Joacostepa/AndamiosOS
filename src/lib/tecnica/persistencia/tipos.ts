/**
 * DTOs de la persistencia del modelador (API /api/tecnica/modelador/** y hooks de use-modelador).
 * Contrato: docs/oficina-tecnica/modelador/arquitectura-produccion.md §8.2–§8.3.
 */
import type { Diseno, Familia, Medidas } from '../modelo/index.ts';

/** Lo que se guarda en tec_modelos.resumen para mostrar la lista sin construir. */
export interface ResumenModelo {
  m2: number;
  ml: number;
  alturaMax: number;
  pesoKg: number;
  pesoParcial: boolean;
  piezas: number;
  piezasAjuste: number;
  estructuras: number;
  tipologias: string[];
  sinCodigo: { clave: string; familia: Familia; medidas: Medidas; cantidad: number }[];
  avisos: { errores: number; avisos: number };
  texto: string;
  motorVersion: string;
}

export interface ObraRef {
  id: string;
  codigo: string;
  nombre: string;
}

/** Fila de la lista (sin el diseño). */
export interface ModeloLista {
  id: string;
  nombre: string;
  descripcion: string | null;
  obra_id: string | null;
  obra: ObraRef | null;
  cotizacion_ref: string | null;
  es_plantilla: boolean;
  plantilla_categoria: string | null;
  revision: number;
  resumen: ResumenModelo | null;
  imagen_path: string | null;
  /** URL firmada (10 min) de la portada, si hay. */
  imagen_url: string | null;
  updated_at: string;
  created_at: string;
  autor: string | null;
}

/** Modelo completo (con el diseño). */
export interface ModeloFila extends ModeloLista {
  diseno: Diseno;
  esquema: number;
  motor_version: string;
  /** El último cómputo de la obra generado desde este modelo, si hay. */
  computo: { id: string; estado: string; modelo_revision: number | null; desactualizado: boolean } | null;
}

export type PlantillaFila = ModeloLista;

/** Una fila actual de computo_items, lo mínimo para comparar. */
export interface ItemComputoActual {
  pieza_id: string;
  cantidad_requerida: number;
  origen: OrigenItem;
  modelo_cantidad: number | null;
  codigo?: string | null;
  descripcion?: string | null;
}

export type OrigenItem = 'modelo' | 'modelo_editado' | 'manual';

/** Una línea que el modelo quiere en el cómputo (ya agrupada por pieza). */
export interface LineaComputo {
  pieza_id: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
}

/** Línea de la BOM que NO entra al cómputo (sin código o sin pieza en catalogo_piezas). */
export interface LineaOmitida {
  clave: string;
  codigo: string | null;
  descripcion: string;
  familia: Familia;
  cantidad: number;
  unidad: string;
  motivo: 'sin_codigo' | 'sin_pieza';
}

export type TipoDiff =
  | 'nuevo'             // el modelo la agrega
  | 'cambia'            // fila del modelo con otra cantidad: se actualiza sola
  | 'igual'             // nada que hacer
  | 'quita'             // fila del modelo que el modelo ya no tiene: se borra sola
  | 'conflicto_manual'  // fila editada a mano o manual, y el modelo dice otra cantidad: hay que decidir
  | 'quita_editado'     // fila editada a mano que el modelo ya no tiene: hay que decidir
  | 'manual';           // fila manual que el modelo no tiene: no se toca

export type DecisionDiff = 'mantener' | 'modelo' | 'sumar' | 'borrar';

export interface DiffLinea {
  pieza_id: string;
  codigo: string | null;
  descripcion: string | null;
  tipo: TipoDiff;
  origenActual: OrigenItem | null;
  actual: number | null;
  modelo: number | null;
  /** Lo que queda si se aplica la decisión por defecto. */
  resultado: number | null;
  /** Decisiones posibles (solo en conflicto_manual y quita_editado). */
  opciones: DecisionDiff[];
  decisionPorDefecto: DecisionDiff | null;
}

export interface MetricasComputo {
  m2: number;
  ml: number;
  alturaMax: number;
  /** computos.tipo_sistema_andamio */
  sistema: 'multidireccional' | 'tubular' | null;
}

export interface PreviaComputo {
  computo: { id: string | null; estado: string | null; bloqueado: boolean; motivoBloqueo: string | null; otroModelo: boolean };
  diff: DiffLinea[];
  omitidas: LineaOmitida[];
  metricas: MetricasComputo;
  revision: number;
  totales: { nuevas: number; cambian: number; quitan: number; conflictos: number; iguales: number };
}

export interface RespuestaGenerar {
  computo_id: string;
  creado: boolean;
  insertadas: number;
  actualizadas: number;
  borradas: number;
  conservadas: number;
  iguales: number;
  omitidas: LineaOmitida[];
}
