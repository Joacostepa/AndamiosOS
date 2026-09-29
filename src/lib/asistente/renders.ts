// El render propio de una propuesta, desde una foto del chat, y guardarlo en la biblioteca
// (JS, 28/09: "no siempre lleva renders de la base de datos").
//
// Las fotos del chat ya están en Storage (adjuntos/<conversación>/), pero el modelo las ve por
// la Files API y no conoce la ruta: por eso la elige el servidor ("la última", "la anterior"),
// y sólo entre las de ESTA conversación.

import type { SupabaseClient } from "@supabase/supabase-js";
import { accesoDeFila, nivelEn } from "@/lib/auth/acceso";
import type { TipoRender } from "@/lib/parametros-cotizacion/tipos";

const BUCKET = "comercial";
const IMAGEN = /\.(jpe?g|png|webp|gif)$/i;
/** El PDF (pdf.ts, dimensionesImagen) lee sólo JPG y PNG. */
const PARA_PDF = /\.(jpe?g|png)$/i;

export type FotoDelChat = { path: string; nombre: string; subida: string | null };

/** La foto número `desdeElFinal` contando desde la última (1 = la última) de la conversación. */
export async function fotoDelChat(db: SupabaseClient, conversacionId: string, desdeElFinal: number): Promise<FotoDelChat | { error: string }> {
  const carpeta = `adjuntos/${conversacionId}`;
  const { data, error } = await db.storage.from(BUCKET).list(carpeta, { limit: 200, sortBy: { column: "name", order: "desc" } });
  if (error) return { error: `No se pudieron leer las fotos del chat: ${error.message}` };
  // El nombre empieza con Date.now(): ordenado por nombre es ordenado por hora.
  const fotos = (data ?? []).filter((f) => IMAGEN.test(f.name));
  if (!fotos.length) return { error: "No hay fotos en esta conversación: pedile al vendedor que mande el render por el chat (con el clip o pegándolo)." };
  const f = fotos[desdeElFinal - 1];
  if (!f) return { error: `En esta conversación hay ${fotos.length} foto${fotos.length === 1 ? "" : "s"}: no hay una número ${desdeElFinal} contando desde la última.` };
  if (!PARA_PDF.test(f.name)) return { error: "Esa imagen no es JPG ni PNG y el PDF no la puede llevar: pedile que la mande en uno de esos formatos (una captura pegada sale en PNG)." };
  return { path: `${carpeta}/${f.name}`, nombre: f.name, subida: f.created_at ?? null };
}

/** Cargar renders en la biblioteca es de Parámetros de cotización: admin o permiso de edición. */
export async function puedeEditarRenders(db: SupabaseClient, usuarioId: string): Promise<boolean> {
  const { data } = await db.from("user_profiles").select("rol, activo, permisos, debe_cambiar_clave").eq("id", usuarioId).maybeSingle();
  return nivelEn(accesoDeFila(data), "parametros-cotizacion") === "editar";
}

/**
 * Copia la imagen a renders/ (la biblioteca borra su archivo al borrar el render, y la foto del
 * chat sigue siendo la del presupuesto) y la da de alta. Corre con service role: el permiso lo
 * chequea antes quien llama (puedeEditarRenders), porque cotizacion_render_guardar mira
 * auth.uid() y acá no hay sesión.
 */
export async function guardarRenderEnBiblioteca(
  db: SupabaseClient,
  p: { pathOrigen: string; tipo: TipoRender; nombre: string; porDefecto: boolean; usuarioId: string },
): Promise<{ id: string } | { error: string }> {
  const { data: igual } = await db.from("cotizacion_renders").select("id").eq("tipo", p.tipo).ilike("nombre", p.nombre).maybeSingle();
  if (igual) return { error: `Ya hay un render «${p.nombre}» de ese tipo en la biblioteca: elegí otro nombre.` };

  const extension = (p.pathOrigen.match(/\.([a-z]+)$/i)?.[1] ?? "png").toLowerCase();
  const destino = `renders/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`;
  const { error: errCopia } = await db.storage.from(BUCKET).copy(p.pathOrigen, destino);
  if (errCopia) return { error: `No se pudo copiar la imagen: ${errCopia.message}` };

  if (p.porDefecto) {
    await db.from("cotizacion_renders").update({ por_defecto: false }).eq("tipo", p.tipo).eq("por_defecto", true);
  }
  const { data, error } = await db
    .from("cotizacion_renders")
    .insert({ tipo: p.tipo, nombre: p.nombre, path: destino, por_defecto: p.porDefecto, autor_id: p.usuarioId })
    .select("id")
    .single();
  if (error || !data) {
    await db.storage.from(BUCKET).remove([destino]);
    return { error: `No se pudo guardar en la biblioteca: ${error?.message ?? "sin respuesta"}` };
  }
  return { id: data.id as string };
}
