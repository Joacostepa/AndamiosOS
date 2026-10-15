/**
 * Validación de lo que entra por /api/tecnica/modelador/**. Los bodies con zod; el diseño, con el
 * núcleo (validarDiseno, que además migra esquemas viejos) y un tope de tamaño de 2 MB.
 */
import { z } from 'zod';
import { validarDiseno, type Diseno } from '../modelo/index.ts';

export const TOPE_DISENO_BYTES = 2_000_000;
export const TOPE_IMAGEN_BYTES = 5 * 1024 * 1024;

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Id inválido');
const nombre = z.string().trim().min(1, 'Falta el nombre').max(120, 'El nombre es muy largo (máximo 120)');
const descripcion = z.string().trim().max(2000, 'La descripción es muy larga').nullable();
const cotizacion = z.string().trim().max(60, 'La referencia de cotización es muy larga').nullable();

export const CATEGORIAS_PLANTILLA = ['fachada', 'bandeja', 'torre', 'portico', 'interior', 'especial', 'libre'] as const;

const resumen = z.looseObject({
  m2: z.number(),
  ml: z.number(),
  alturaMax: z.number(),
  pesoKg: z.number(),
  pesoParcial: z.boolean(),
  piezas: z.number().int().nonnegative(),
});

export const crearSchema = z.union([
  z.object({
    nombre,
    descripcion: descripcion.optional(),
    obra_id: uuid.nullable().optional(),
    cotizacion_ref: cotizacion.optional(),
    diseno: z.unknown(),
    resumen: resumen.nullable().optional(),
  }),
  z.object({
    desdePlantilla: uuid,
    nombre: nombre.optional(),
    obra_id: uuid.nullable().optional(),
    cotizacion_ref: cotizacion.optional(),
  }),
]);

export const patchSchema = z.object({
  revision: z.number().int().min(1).optional(),
  diseno: z.unknown().optional(),
  nombre: nombre.optional(),
  descripcion: descripcion.optional(),
  obra_id: uuid.nullable().optional(),
  cotizacion_ref: cotizacion.optional(),
  resumen: resumen.nullable().optional(),
}).refine((b) => b.diseno === undefined || b.revision !== undefined, {
  message: 'Para guardar el diseño hace falta la revisión que leíste.',
  path: ['revision'],
}).refine((b) => Object.keys(b).some((k) => k !== 'revision'), { message: 'No hay nada para guardar.' });

export const plantillaSchema = z.object({
  nombre,
  descripcion: descripcion.optional(),
  categoria: z.enum(CATEGORIAS_PLANTILLA, { message: 'Elegí una categoría' }),
});

export const duplicarSchema = z.object({
  nombre: nombre.optional(),
  obra_id: uuid.nullable().optional(),
});

export const previaSchema = z.object({
  obra_id: uuid,
  revision: z.number().int().min(1),
});

export const generarSchema = previaSchema.extend({
  decisiones: z.record(z.string(), z.enum(['mantener', 'modelo', 'sumar', 'borrar'])).default({}),
  /** El cómputo de la obra salió de otro modelo y se acepta reemplazarlo. */
  reemplazarOtroModelo: z.boolean().default(false),
  /** Confirmación explícita de que hay líneas sin código que NO van a entrar al cómputo. */
  aceptoOmitidas: z.boolean().default(false),
});

export const listarSchema = z.object({
  obra: uuid.optional(),
  plantillas: z.enum(['0', '1']).optional(),
  q: z.string().trim().max(80).optional(),
  sinObra: z.enum(['0', '1']).optional(),
});

export const esUuid = (s: string | null | undefined): s is string => !!s && uuid.safeParse(s).success;

/** Chequea tamaño y forma del diseño (y lo migra al esquema actual). */
export function validarDisenoEntrante(json: unknown): { ok: true; diseno: Diseno } | { ok: false; error: string } {
  let tam = 0;
  try {
    tam = new TextEncoder().encode(JSON.stringify(json) ?? '').length;
  } catch {
    return { ok: false, error: 'El diseño no se puede leer.' };
  }
  if (tam > TOPE_DISENO_BYTES) return { ok: false, error: `El diseño pesa ${(tam / 1e6).toFixed(1).replace('.', ',')} MB: el tope es 2 MB.` };
  const v = validarDiseno(json);
  if (!v.ok) return { ok: false, error: v.errores.join(' · ') };
  return { ok: true, diseno: v.diseno };
}

/** El PNG empieza con su firma (no alcanza con el Content-Type que manda el navegador). */
export function esPng(bytes: Uint8Array): boolean {
  const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return bytes.length > 8 && firma.every((b, i) => bytes[i] === b);
}

export function mensajeZod(e: z.ZodError): string {
  return e.issues.map((i) => i.message).join(' · ');
}
