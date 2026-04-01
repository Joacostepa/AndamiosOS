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

export const ESTADO_OBRA_TRANSITIONS: Record<string, string[]> = {
  presupuestada: ["aprobada", "cancelada"],
  aprobada: ["en_proyecto", "cancelada", "suspendida"],
  en_proyecto: ["proyecto_aprobado", "cancelada", "suspendida"],
  proyecto_aprobado: ["lista_para_ejecutar", "en_proyecto", "suspendida"],
  lista_para_ejecutar: ["en_montaje", "suspendida"],
  en_montaje: ["montada", "suspendida"],
  montada: ["en_uso"],
  en_uso: ["en_desarme", "en_espera"],
  en_desarme: ["desarmada"],
  desarmada: ["en_devolucion"],
  en_devolucion: ["cerrada_operativamente"],
  suspendida: ["aprobada", "cancelada"],
  en_espera: ["en_uso", "en_desarme"],
};

export const ESTADO_OBRA_LABELS: Record<string, string> = {
  presupuestada: "Presupuestada",
  aprobada: "Aprobada",
  en_proyecto: "En proyecto",
  proyecto_aprobado: "Proyecto aprobado",
  lista_para_ejecutar: "Lista para ejecutar",
  en_montaje: "En montaje",
  montada: "Montada",
  en_uso: "En uso",
  en_desarme: "En desarme",
  desarmada: "Desarmada",
  en_devolucion: "En devolucion",
  cerrada_operativamente: "Cerrada",
  cancelada: "Cancelada",
  suspendida: "Suspendida",
  en_espera: "En espera",
};
