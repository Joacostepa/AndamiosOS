// WhatsApp de clientes: las lecturas de la bandeja (lista y detalle) y lo que cambia el
// estado de una charla (tomar, soltar, cerrar). Del lado del servidor, con service role,
// detrás de exigirModulo("clientes-whatsapp") en cada ruta.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdjuntoVista, CharlaListada, EstadoCharla, ItemHilo } from "./vista";
import { anotarEvento } from "./webhook";

/** Las cerradas que se muestran (las más recientes); las abiertas, todas. */
const CERRADAS_EN_LISTA = 60;
/** Lo último del hilo que se manda a la pantalla. */
const ITEMS_EN_DETALLE = 400;

// Los dos últimos salen de la ficha (sin columna nueva): gama alta y qué trabajo va a hacer el
// cliente. Un solo literal: así el cliente de Supabase entiende el select.
const COLUMNAS_CHARLA =
  "id, telefono, nombre_perfil, estado, motivo, asistente_id, ultimo_mensaje_at, ultimo_entrante_at, ultimo_resumen, sin_leer, opt_out, created_at, segmento:ficha->>segmento, tarea:ficha->>tarea";

type FilaCharla = {
  id: string;
  telefono: string;
  nombre_perfil: string | null;
  estado: EstadoCharla;
  motivo: string | null;
  asistente_id: string | null;
  ultimo_mensaje_at: string | null;
  ultimo_entrante_at: string | null;
  ultimo_resumen: string | null;
  sin_leer: number;
  opt_out: boolean;
  created_at: string;
  segmento: string | null;
  tarea: string | null;
};

/** id → nombre de pila (y apellido si hay dos con el mismo nombre). */
export async function nombresDe(db: SupabaseClient, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unicos.length) return new Map();
  const { data } = await db.from("user_profiles").select("id, nombre, apellido").in("id", unicos);
  const filas = (data ?? []) as { id: string; nombre: string; apellido: string }[];
  const repetidos = new Set(filas.map((f) => f.nombre).filter((n, i, a) => a.indexOf(n) !== i));
  return new Map(filas.map((f) => [f.id, repetidos.has(f.nombre) ? `${f.nombre} ${f.apellido}`.trim() : f.nombre]));
}

function aCharla(f: FilaCharla, nombres: Map<string, string>): CharlaListada {
  return {
    id: f.id,
    telefono: f.telefono,
    nombre: f.nombre_perfil,
    estado: f.estado,
    motivo: f.motivo,
    asistente: f.asistente_id ? { id: f.asistente_id, nombre: nombres.get(f.asistente_id) ?? "otra persona" } : null,
    ultimoMensajeAt: f.ultimo_mensaje_at,
    ultimoEntranteAt: f.ultimo_entrante_at,
    ultimoResumen: f.ultimo_resumen,
    sinLeer: f.sin_leer,
    optOut: f.opt_out,
    createdAt: f.created_at,
    segmento: f.segmento === "gama_alta" ? "gama_alta" : null,
    tarea: f.tarea?.trim() || null,
  };
}

export async function listarCharlas(db: SupabaseClient): Promise<CharlaListada[]> {
  const [abiertas, cerradas] = await Promise.all([
    db.from("cli_conversaciones").select(COLUMNAS_CHARLA).neq("estado", "cerrada").order("ultimo_mensaje_at", { ascending: false, nullsFirst: false }),
    db.from("cli_conversaciones").select(COLUMNAS_CHARLA).eq("estado", "cerrada").order("ultimo_mensaje_at", { ascending: false, nullsFirst: false }).limit(CERRADAS_EN_LISTA),
  ]);
  if (abiertas.error) throw new Error(abiertas.error.message);
  if (cerradas.error) throw new Error(cerradas.error.message);
  const filas = [...(abiertas.data ?? []), ...(cerradas.data ?? [])] as FilaCharla[];
  const nombres = await nombresDe(db, filas.map((f) => f.asistente_id));
  return filas.map((f) => aCharla(f, nombres));
}

export async function leerCharla(db: SupabaseClient, id: string): Promise<CharlaListada | null> {
  const { data, error } = await db.from("cli_conversaciones").select(COLUMNAS_CHARLA).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const f = data as FilaCharla;
  return aCharla(f, await nombresDe(db, [f.asistente_id]));
}

type FilaHilo = {
  id: string;
  direccion: ItemHilo["direccion"];
  autor: ItemHilo["autor"];
  autor_id: string | null;
  tipo: string;
  texto: string | null;
  adjunto: Record<string, unknown> | null;
  transcripcion: string | null;
  estado: ItemHilo["estado"];
  error_codigo: number | null;
  error_detalle: string | null;
  momento: string;
};

function aAdjunto(id: string, a: Record<string, unknown> | null): AdjuntoVista | null {
  if (!a) return null;
  if (typeof a.lat === "number" && typeof a.lng === "number") {
    return { tipo: "ubicacion", lat: a.lat, lng: a.lng, nombre: (a.nombre as string) ?? null, direccion: (a.direccion as string) ?? null };
  }
  const pendiente = a.pendiente === true;
  const path = typeof a.path === "string" ? a.path : null;
  // Si se pudo bajar pero falló la transcripción, el adjunto está bien: el error va aparte.
  const error = !path && typeof a.error === "string" ? a.error : null;
  return {
    tipo: "archivo",
    mime: (a.mime as string) ?? null,
    nombre: (a.nombre as string) ?? "archivo",
    url: path ? `/api/comercial/clientes/medios/${id}` : null,
    pendiente,
    error,
  };
}

export async function leerHilo(db: SupabaseClient, conversacionId: string): Promise<ItemHilo[]> {
  const { data, error } = await db
    .from("cli_hilo")
    .select("id, direccion, autor, autor_id, tipo, texto, adjunto, transcripcion, estado, error_codigo, error_detalle, momento")
    .eq("conversacion_id", conversacionId)
    .order("momento", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(ITEMS_EN_DETALLE);
  if (error) throw new Error(error.message);
  const filas = ((data ?? []) as FilaHilo[]).reverse();
  const nombres = await nombresDe(db, filas.map((f) => f.autor_id));
  return filas.map((f) => ({
    id: f.id,
    direccion: f.direccion,
    autor: f.autor,
    autorNombre: f.autor_id ? nombres.get(f.autor_id) ?? null : null,
    tipo: f.tipo,
    texto: f.texto,
    adjunto: aAdjunto(f.id, f.adjunto),
    transcripcion: f.transcripcion,
    estado: f.estado,
    errorCodigo: f.error_codigo,
    errorDetalle: f.error_detalle,
    momento: f.momento,
  }));
}

/** El último wamid del cliente (para las tildes azules al abrir la charla). */
export async function ultimoEntrante(db: SupabaseClient, conversacionId: string): Promise<string | null> {
  const { data } = await db
    .from("cli_hilo")
    .select("wamid")
    .eq("conversacion_id", conversacionId)
    .eq("direccion", "entrante")
    .not("wamid", "is", null)
    .order("momento", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.wamid as string | undefined) ?? null;
}

export type Accion = "tomar" | "soltar" | "cerrar" | "devolver";

/**
 * Tomar, soltar, cerrar o devolver a Sofía. Devuelve null si se pudo, o el motivo si no.
 * - tomar: si la tiene otra persona, hace falta `forzar` (la pantalla pregunta antes).
 * - soltar: sólo quien la tiene; queda sin tomar.
 * - cerrar: cualquiera con el módulo en «editar». Si el cliente vuelve a escribir, se reabre
 *   y vuelve a quien la tenía.
 * - devolver: la charla vuelve a Sofía («bot»), con una nota opcional que ella lee en su próximo
 *   turno (queda como evento de la persona en el hilo). Si la tiene otra persona, no. La ruta
 *   chequea antes que Sofía esté prendida.
 */
export async function cambiarEstado(
  db: SupabaseClient,
  charla: CharlaListada,
  accion: Accion,
  yo: { id: string; nombre: string },
  forzar = false,
  nota: string | null = null,
): Promise<string | null> {
  const ahora = new Date().toISOString();
  const mia = charla.estado === "humano" && charla.asistente?.id === yo.id;
  if (accion === "tomar") {
    if (mia) return null;
    const deOtro = charla.estado === "humano" && charla.asistente && charla.asistente.id !== yo.id ? charla.asistente : null;
    if (deOtro && !forzar) return `La tiene ${deOtro.nombre}.`;
    let q = db
      .from("cli_conversaciones")
      .update({ estado: "humano", asistente_id: yo.id, tomada_at: ahora, cerrada_at: null, cerrada_por: null, updated_at: ahora })
      .eq("id", charla.id)
      .eq("estado", charla.estado);
    // Que nadie la haya tomado entre que se leyó y ahora.
    q = charla.asistente ? q.eq("asistente_id", charla.asistente.id) : q.is("asistente_id", null);
    const { data, error } = await q.select("id");
    if (error) {
      if (error.code === "23505") return "El cliente ya tiene otra charla abierta: seguí en esa.";
      throw new Error(error.message);
    }
    if (!data?.length) return "Alguien la cambió recién. Volvé a mirar.";
    await anotarEvento(db, charla.id, deOtro ? `${yo.nombre} tomó la charla (la tenía ${deOtro.nombre}).` : `${yo.nombre} tomó la charla.`, yo.id);
    return null;
  }
  if (accion === "soltar") {
    if (!mia) return "Sólo la puede soltar quien la tiene.";
    const { data, error } = await db
      .from("cli_conversaciones")
      .update({ estado: "derivada", asistente_id: null, tomada_at: null, updated_at: ahora })
      .eq("id", charla.id)
      .eq("estado", "humano")
      .eq("asistente_id", yo.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return "Alguien la cambió recién. Volvé a mirar.";
    await anotarEvento(db, charla.id, `${yo.nombre} soltó la charla: queda sin tomar.`, yo.id);
    return null;
  }
  if (accion === "devolver") {
    if (charla.estado === "bot") return null;
    if (charla.estado === "cerrada") return "La charla está cerrada: si el cliente vuelve a escribir, se reabre.";
    if (charla.estado === "humano" && charla.asistente && charla.asistente.id !== yo.id) return `La tiene ${charla.asistente.nombre}: que la devuelva ella.`;
    let q = db
      .from("cli_conversaciones")
      .update({ estado: "bot", asistente_id: null, tomada_at: null, motivo: null, updated_at: ahora })
      .eq("id", charla.id)
      .eq("estado", charla.estado);
    q = charla.asistente ? q.eq("asistente_id", charla.asistente.id) : q.is("asistente_id", null);
    const { data, error } = await q.select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return "Alguien la cambió recién. Volvé a mirar.";
    const n = nota?.trim();
    await anotarEvento(db, charla.id, `${yo.nombre} devolvió la charla a Tomás.${n ? ` Nota para Tomás: ${n}` : ""}`, yo.id);
    return null;
  }
  // cerrar
  if (charla.estado === "cerrada") return null;
  const { data, error } = await db
    .from("cli_conversaciones")
    .update({ estado: "cerrada", cerrada_at: ahora, cerrada_por: yo.id, sin_leer: 0, updated_at: ahora })
    .eq("id", charla.id)
    .neq("estado", "cerrada")
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) return "Alguien la cambió recién. Volvé a mirar.";
  await anotarEvento(db, charla.id, `${yo.nombre} cerró la charla.`, yo.id);
  return null;
}

/**
 * Borra una charla entera, para volver a probar desde cero (pedido de JS, 16/10). Sólo admin.
 * En cascada se van el hilo, la historia de Sofía (cli_api_mensajes) y las aprobaciones; los
 * registros crudos de whatsapp_entrantes quedan, sin el vínculo. También borra los adjuntos de
 * Storage (clientes/<id>/). NO toca Odoo (una orden que se aprobó queda) ni el WhatsApp del
 * cliente: lo que ya le llegó sigue en su celular.
 */
export async function borrarCharla(db: SupabaseClient, id: string): Promise<void> {
  const carpeta = `clientes/${id}`;
  const { data: archivos } = await db.storage.from("comercial").list(carpeta, { limit: 1000 });
  const paths = (archivos ?? []).map((a) => `${carpeta}/${a.name}`);
  if (paths.length) await db.storage.from("comercial").remove(paths);
  const { error } = await db.from("cli_conversaciones").delete().eq("id", id);
  if (error) throw new Error(`No se pudo borrar la charla: ${error.message}`);
}
