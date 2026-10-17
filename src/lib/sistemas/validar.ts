/**
 * Sistemas: la validación de lo que entra a /api/sistemas/** (docs/sistemas/contrato.md §3).
 *
 * Repite las reglas de las RPC de la migración 20261022000001 para contestar ANTES de ir a la
 * base y con el mismo tono: los mensajes son para quien los lee en un toast. La base vuelve
 * a chequear todo (es la que manda).
 *
 * PURA: la usan las rutas y los tests de node:test.
 */

import { z } from "zod";
import {
  ESTADOS_REPORTE, LIMITES, MIMES_IMAGEN, MOTIVOS_DESCARTE, PRIORIDADES_REPORTE, TIPOS_REPORTE,
  type EstadoReporte, type RevisarBody, type TipoReporte,
} from "./tipos.ts";

/** Los mensajes de zod juntos, como los muestra el toast. */
export function mensajeZod(e: z.ZodError): string {
  return [...new Set(e.issues.map((i) => i.message))].join(" · ");
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const idValido = (id: string | null | undefined): id is string => !!id && UUID.test(id);

/** Un texto opcional: recortado y, si queda vacío, como si no hubiera venido. */
const textoOpcional = (max: number, mensajeLargo: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : v.trim()) : v),
    z.string().max(max, mensajeLargo).optional(),
  );

/** Recorta en vez de rechazar: un título de pestaña larguísimo no puede frenar un reporte. */
const textoRecortado = (max: number) =>
  z.preprocess((v) => (v == null ? "" : v), z.string().transform((s) => s.trim().slice(0, max)));

const MB = Math.round(LIMITES.bytesImagen / (1024 * 1024));

// ─── POST /api/sistemas/reportes/subidas ────────────────────────────────────────────────

export const pedidoSubidasSchema = z.object({
  archivos: z
    .array(
      z.object({
        mime: z.enum(MIMES_IMAGEN, { message: "Sólo se pueden mandar imágenes PNG, JPG o WEBP." }),
        bytes: z
          .number({ message: "Una de las imágenes llegó mal. Probá de nuevo." })
          .int()
          .min(1, "Una de las imágenes está vacía.")
          .max(LIMITES.bytesImagen, `Cada imagen puede pesar hasta ${MB} MB.`),
      }),
    )
    .min(1, "No hay imágenes para subir.")
    .max(LIMITES.imagenes, `Podés mandar hasta ${LIMITES.imagenes} imágenes por reporte.`),
});

// ─── POST /api/sistemas/reportes ────────────────────────────────────────────────────────

/** <uid>/<uuid>.<ext>: la RPC además exige que el uid sea el de quien reporta. */
const PATH_CAPTURA = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/;

export const capturaSubidaSchema = z.object({
  path: z.string().regex(PATH_CAPTURA, "Una de las imágenes tiene un nombre raro. Probá de nuevo."),
  mime: z.enum(MIMES_IMAGEN, { message: "Sólo se pueden mandar imágenes PNG, JPG o WEBP." }),
  bytes: z.number().int().min(1).max(LIMITES.bytesImagen, `Cada imagen puede pesar hasta ${MB} MB.`),
  ancho: z.number().int().min(1).max(10_000),
  alto: z.number().int().min(1).max(10_000),
});

export const crearReporteSchema = z.object({
  tipo: z.enum(TIPOS_REPORTE, { message: "Elegí si es un error, una corrección o una mejora." }),
  descripcion: z
    .string({ message: "Contá un poco más qué pasó." })
    .trim()
    .min(LIMITES.descripcionMin, "Contá un poco más qué pasó.")
    .max(LIMITES.descripcionMax, `El texto es muy largo: resumilo en menos de ${LIMITES.descripcionMax} letras.`),
  frena: z.boolean().default(false),
  ruta: textoRecortado(2000),
  tituloPantalla: textoRecortado(200),
  shaCliente: textoRecortado(64),
  // Se sanea en el servidor (contexto.ts): acá sólo se acepta lo que venga.
  contexto: z.unknown(),
  capturas: z
    .array(capturaSubidaSchema)
    .max(LIMITES.imagenes, `Podés mandar hasta ${LIMITES.imagenes} imágenes por reporte.`)
    .default([])
    .refine((l) => new Set(l.map((c) => c.path)).size === l.length, "Una de las imágenes está repetida."),
});
export type CrearReporteValido = z.infer<typeof crearReporteSchema>;

// ─── Comentarios y confirmar ────────────────────────────────────────────────────────────

export const comentarSchema = z.object({
  texto: z
    .string({ message: "Escribí algo antes de mandar." })
    .trim()
    .min(1, "Escribí algo antes de mandar.")
    .max(LIMITES.comentarioMax, `El mensaje es muy largo: resumilo en menos de ${LIMITES.comentarioMax} letras.`),
});

export const confirmarSchema = z.object({
  ok: z.boolean({ message: "Falta decir si quedó bien." }),
  texto: textoOpcional(LIMITES.confirmarTextoMax, `El mensaje es muy largo: resumilo en menos de ${LIMITES.confirmarTextoMax} letras.`),
});

// ─── PATCH /api/sistemas/revision/[id] ──────────────────────────────────────────────────

export const revisarSchema = z
  .object({
    estado: z.enum(ESTADOS_REPORTE, { message: "Estado desconocido." }).optional(),
    // Presente con null = «Sin definir»; ausente = no se toca.
    prioridad: z.enum(PRIORIDADES_REPORTE, { message: "Prioridad desconocida." }).nullable().optional(),
    motivoDescarte: z.enum(MOTIVOS_DESCARTE, { message: "Elegí por qué se descarta." }).optional(),
    duplicadoDe: z.string().regex(UUID, "Elegí de qué reporte es duplicado.").optional(),
    mensaje: textoOpcional(LIMITES.comentarioMax, `El mensaje es muy largo: resumilo en menos de ${LIMITES.comentarioMax} letras.`),
  })
  .superRefine((b, ctx) => {
    if (b.estado === "descartado" && !b.motivoDescarte) {
      ctx.addIssue({ code: "custom", path: ["motivoDescarte"], message: "Elegí por qué se descarta." });
    }
    if (b.motivoDescarte && b.estado !== "descartado") {
      ctx.addIssue({ code: "custom", path: ["motivoDescarte"], message: "El motivo va sólo al descartar." });
    }
    if (b.motivoDescarte === "duplicado" && !b.duplicadoDe) {
      ctx.addIssue({ code: "custom", path: ["duplicadoDe"], message: "Elegí de qué reporte es duplicado." });
    }
    if (b.duplicadoDe && b.motivoDescarte !== "duplicado") {
      ctx.addIssue({ code: "custom", path: ["duplicadoDe"], message: "El original va sólo al marcar duplicado." });
    }
    if (b.estado === undefined && b.prioridad === undefined && b.mensaje === undefined) {
      ctx.addIssue({ code: "custom", message: "No hay nada para cambiar." });
    }
  });

/** El body de la bandeja → el `p` de sis_revisar_reporte (snake_case, sólo lo que vino). */
export function revisarAParametros(b: RevisarBody): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (b.estado !== undefined) p.estado = b.estado;
  // La clave presente con null es «Sin definir»: no se puede perder en el camino.
  if (Object.prototype.hasOwnProperty.call(b, "prioridad") && b.prioridad !== undefined) p.prioridad = b.prioridad;
  if (b.motivoDescarte !== undefined) p.motivo_descarte = b.motivoDescarte;
  if (b.duplicadoDe !== undefined) p.duplicado_de = b.duplicadoDe;
  if (b.mensaje !== undefined) p.mensaje = b.mensaje;
  return p;
}

// ─── GET /api/sistemas/revision ─────────────────────────────────────────────────────────

export type FiltrosRevision = { estado: EstadoReporte; tipo: TipoReporte | null; frena: boolean; q: string };

/** Los filtros de la bandeja desde la query. Lo que no se entiende se ignora (no es un error). */
export function filtrosDeQuery(sp: URLSearchParams): FiltrosRevision {
  const estado = sp.get("estado");
  const tipo = sp.get("tipo");
  return {
    estado: (ESTADOS_REPORTE as readonly string[]).includes(estado ?? "") ? (estado as EstadoReporte) : "nuevo",
    tipo: (TIPOS_REPORTE as readonly string[]).includes(tipo ?? "") ? (tipo as TipoReporte) : null,
    frena: sp.get("frena") === "1" || sp.get("frena") === "true",
    q: (sp.get("q") ?? "").trim().slice(0, 100),
  };
}

/**
 * La búsqueda partida: «#12» busca sólo el número; «12», el número o el texto; el resto,
 * texto (sin los caracteres que rompen un filtro de PostgREST).
 */
export function partirBusqueda(q: string): { numero: number | null; texto: string | null } {
  const t = q.trim();
  if (!t) return { numero: null, texto: null };
  const conNumeral = t.match(/^#\s*(\d{1,12})$/);
  if (conNumeral) return { numero: Number(conNumeral[1]), texto: null };
  const texto = t.replace(/[,()*%\\:"'.]/g, " ").replace(/\s+/g, " ").trim() || null;
  return { numero: /^\d{1,12}$/.test(t) ? Number(t) : null, texto };
}
