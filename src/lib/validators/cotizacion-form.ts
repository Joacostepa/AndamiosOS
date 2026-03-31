import { z } from "zod";
import type { UnidadCotizacion } from "@/types/cotizacion-form";

const itemSchema = z.object({
  tipo: z.string().min(1),
  concepto: z.string().min(1, "El concepto es requerido"),
  detalle: z.string().optional(),
  cantidad: z.number().min(0.01, "La cantidad debe ser mayor a 0"),
  unidad: z.string().min(1),
  precio_unitario: z.number().min(0),
});

const baseSchema = z.object({
  titulo: z.string().min(1, "El título es requerido"),
  cliente_id: z.string().optional(),
  oportunidad_id: z.string().optional(),
  descripcion_servicio: z.string().optional().default(""),
  condiciones: z.string().optional().default(""),
  condicion_pago: z.string().optional().default(""),
  items: z.array(itemSchema).min(1, "Agregá al menos un item"),
});

const hogarenoSchema = baseSchema.extend({
  unidad_cotizacion: z.literal("hogareno"),
  fraccion_dias: z.union([z.literal(10), z.literal(20), z.literal(30)]),
  zona_entrega: z.string().optional(),
  tipo_trabajo_cliente: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const multidireccionalSchema = baseSchema.extend({
  unidad_cotizacion: z.literal("multidireccional"),
  tonelaje_estimado: z.number().min(0.1, "El tonelaje es requerido"),
  plazo_alquiler_meses: z.number().optional(),
  urgencia: z.string().optional(),
  ubicacion: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const armadoDesarmeSchema = baseSchema.extend({
  unidad_cotizacion: z.literal("armado_desarme"),
  sub_vertical: z.enum([
    "fachadas",
    "industria",
    "eventos",
    "obra_publica",
    "construccion",
    "estructuras_especiales",
  ]),
  plazo_alquiler_meses: z.number().optional(),
  incluye_montaje: z.boolean().optional(),
  incluye_desarme: z.boolean().optional(),
  incluye_transporte: z.boolean().optional(),
  ubicacion: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export function getCotizacionSchema(unidad: UnidadCotizacion) {
  switch (unidad) {
    case "hogareno":
      return hogarenoSchema;
    case "multidireccional":
      return multidireccionalSchema;
    case "armado_desarme":
      return armadoDesarmeSchema;
  }
}
