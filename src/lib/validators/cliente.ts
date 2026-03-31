import { z } from "zod";

export const clienteSchema = z.object({
  razon_social: z.string().min(1, "La razón social es obligatoria"),
  cuit: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^\d{2}-?\d{8}-?\d{1}$/.test(val.replace(/-/g, "")),
      "Formato de CUIT inválido"
    ),
  domicilio_fiscal: z.string().optional(),
  telefono: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  condicion_iva: z.string().optional(),
  estado: z.enum(["activo", "inactivo"]),
  notas: z.string().optional(),
});

export type ClienteFormData = z.infer<typeof clienteSchema>;
