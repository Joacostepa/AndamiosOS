export type UnidadCotizacion = "hogareno" | "multidireccional" | "armado_desarme";

export type SubVertical =
  | "fachadas"
  | "industria"
  | "eventos"
  | "obra_publica"
  | "construccion"
  | "estructuras_especiales";

export type CotizacionItemFormData = {
  tipo: string;
  concepto: string;
  detalle?: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number;
};

export type CotizacionFormData = {
  // Comunes
  titulo: string;
  cliente_id?: string;
  oportunidad_id?: string;
  descripcion_servicio: string;
  condiciones: string;
  condicion_pago: string;
  unidad_cotizacion: UnidadCotizacion;

  // Hogareño
  fraccion_dias?: 10 | 20 | 30;
  zona_entrega?: string;
  tipo_trabajo_cliente?: string;

  // Multidireccional
  tonelaje_estimado?: number;
  plazo_alquiler_meses?: number;
  urgencia?: string;

  // Armado/desarme
  sub_vertical?: SubVertical;
  incluye_montaje?: boolean;
  incluye_desarme?: boolean;
  incluye_transporte?: boolean;
  ubicacion?: string;
  metadata?: Record<string, unknown>;

  // Items
  items: CotizacionItemFormData[];
};

export const UNIDAD_LABELS: Record<UnidadCotizacion, string> = {
  hogareno: "Alquiler hogareño",
  multidireccional: "Multidireccional",
  armado_desarme: "Armado y desarme",
};

export const SUB_VERTICAL_LABELS: Record<SubVertical, string> = {
  fachadas: "Fachadas",
  industria: "Industria",
  eventos: "Eventos",
  obra_publica: "Obra pública",
  construccion: "Construcción",
  estructuras_especiales: "Estructuras especiales",
};

export const ITEM_TYPES_BY_UNIDAD: Record<UnidadCotizacion, string[]> = {
  hogareno: ["alquiler_fraccion", "flete", "extra", "descuento"],
  multidireccional: ["alquiler_mensual", "transporte", "extra", "descuento"],
  armado_desarme: [
    "alquiler_mensual",
    "montaje",
    "desarme",
    "transporte",
    "permiso",
    "ingenieria",
    "extra",
    "descuento",
  ],
};

export const ITEM_TYPE_LABELS: Record<string, string> = {
  alquiler_mensual: "Alquiler mensual",
  alquiler_fraccion: "Alquiler por fracción",
  montaje: "Montaje",
  desarme: "Desarme",
  transporte: "Transporte",
  flete: "Flete",
  permiso: "Permiso",
  ingenieria: "Ingeniería",
  extra: "Extra",
  descuento: "Descuento",
};
