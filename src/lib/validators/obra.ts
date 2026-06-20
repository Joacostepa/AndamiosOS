import { z } from "zod";

export const obraSchema = z.object({
  cliente_id: z.string().uuid("Seleccioná un cliente"),
  nombre: z.string().min(1, "El nombre es obligatorio"),
  direccion: z.string().optional(),
  localidad: z.string().optional(),
  provincia: z.string().optional(),
  tipo_obra: z.enum(["construccion", "fachada", "industria", "evento", "especial"]),
  tipo_andamio: z.enum(["multidireccional", "tubular", "colgante", "otro"]),
  unidad_negocio: z.string().optional(),
  fecha_inicio_estimada: z.string().optional(),
  fecha_fin_estimada: z.string().optional(),
  observaciones: z.string().optional(),
  condiciones_acceso: z.string().optional(),
  horario_permitido: z.string().optional(),
});

export type ObraFormData = z.infer<typeof obraSchema>;

// Estados alineados con el modelo Obra de Odoo (x_aba_obra.x_estado).
// La granularidad operativa "en proceso" vive en las OTs (en_curso), no acá.
export const ESTADO_OBRA_TRANSITIONS: Record<string, string[]> = {
  pendiente_armado: ["armado", "cancelada"],
  armado: ["pendiente_desarme", "cancelada"],
  pendiente_desarme: ["desarmado", "cancelada"],
  desarmado: [],
  cancelada: [],
};

export const ESTADO_OBRA_LABELS: Record<string, string> = {
  pendiente_armado: "Pendiente de Armado",
  armado: "Armado",
  pendiente_desarme: "Pendiente de Desarme",
  desarmado: "Desarmado",
  cancelada: "Cancelada",
};
