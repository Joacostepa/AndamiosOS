// El link para compartir una charla (JS, 16/11): una página pública, /charla/<token>, con la
// ficha, las fotos, los audios, los videos y la charla entera. Lo abre cualquiera que tenga el
// link hasta que vence (LINK_DIAS); después muestra que venció y se genera otro desde la charla.
// Se puede cortar antes. Del lado del servidor, con service role.

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { leerCharla, leerHilo } from "./bandeja";
import { leerFicha } from "./herramientas";
import { claseArchivo, filasCliente, filasEquipo, filasServicio, type DatosSlack, type FilaFicha } from "./para-slack";
import { pastilla, telefonoLegible, type ItemHilo } from "./vista";

export const LINK_DIAS = 30;
/** Cuánto duran las URLs firmadas de los archivos dentro de la página (se firman en cada visita). */
const ARCHIVOS_SEGUNDOS = 6 * 3600;

export type LinkCharla = { id: string; token: string; venceAt: string; createdAt: string; visitas: number };

export const urlDelLink = (origen: string, token: string) => `${origen.replace(/\/$/, "")}/charla/${token}`;

/** El link vigente de la charla (el último sin cortar y sin vencer), o null. */
export async function linkVigente(db: SupabaseClient, conversacionId: string): Promise<LinkCharla | null> {
  const { data, error } = await db
    .from("cli_links")
    .select("id, token, vence_at, created_at, visitas")
    .eq("conversacion_id", conversacionId)
    .is("revocado_at", null)
    .gt("vence_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const f = data as { id: string; token: string; vence_at: string; created_at: string; visitas: number };
  return { id: f.id, token: f.token, venceAt: f.vence_at, createdAt: f.created_at, visitas: f.visitas };
}

/** El vigente, o uno nuevo por LINK_DIAS días. */
export async function crearLink(db: SupabaseClient, conversacionId: string, userId: string): Promise<LinkCharla> {
  const vigente = await linkVigente(db, conversacionId);
  if (vigente) return vigente;
  const token = randomBytes(24).toString("base64url");
  const vence = new Date(Date.now() + LINK_DIAS * 86_400_000).toISOString();
  const { data, error } = await db
    .from("cli_links")
    .insert({ token, conversacion_id: conversacionId, creado_por: userId, vence_at: vence })
    .select("id, token, vence_at, created_at, visitas")
    .single();
  if (error || !data) throw new Error(`No se pudo crear el link: ${error?.message ?? "sin detalle"}`);
  const f = data as { id: string; token: string; vence_at: string; created_at: string; visitas: number };
  return { id: f.id, token: f.token, venceAt: f.vence_at, createdAt: f.created_at, visitas: f.visitas };
}

/** Corta todos los links vigentes de la charla. Devuelve cuántos cortó. */
export async function cortarLinks(db: SupabaseClient, conversacionId: string, userId: string): Promise<number> {
  const { data, error } = await db
    .from("cli_links")
    .update({ revocado_at: new Date().toISOString(), revocado_por: userId })
    .eq("conversacion_id", conversacionId)
    .is("revocado_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

// ── La página ───────────────────────────────────────────────────────────────────────────

export type ArchivoCompartido = {
  itemId: string;
  numero: number;
  clase: string;
  /** image | video | audio | pdf | otro */
  tipo: "image" | "video" | "audio" | "pdf" | "otro";
  nombre: string;
  url: string;
  urlDescarga: string;
  de: string;
  momento: string;
};

export type CharlaCompartida = {
  nombre: string;
  telefono: string;
  telefonoLegible: string;
  estado: string;
  etiquetas: string[];
  desde: string | null;
  hasta: string | null;
  mensajes: number;
  cliente: FilaFicha[];
  servicio: FilaFicha[];
  ojo: string | null;
  tarea: string | null;
  equipo: FilaFicha[];
  archivos: ArchivoCompartido[];
  items: ItemHilo[];
  /** id del renglón del hilo → archivo, para mostrarlo dentro de la charla. */
  archivoDe: Record<string, ArchivoCompartido>;
  venceAt: string;
  compartidoPor: string | null;
  mapa: string | null;
};

export type ResultadoLink = { estado: "ok"; charla: CharlaCompartida } | { estado: "vencido" | "cortado" | "no_existe" };

function tipoDe(tipo: string, mime: string | null): ArchivoCompartido["tipo"] {
  const m = mime ?? "";
  if ((tipo === "image" || tipo === "sticker" || m.startsWith("image/")) && m !== "image/svg+xml") return "image";
  if (tipo === "video" || m.startsWith("video/")) return "video";
  if (tipo === "audio" || m.startsWith("audio/")) return "audio";
  if (m === "application/pdf") return "pdf";
  return "otro";
}

/** Lo que muestra /charla/<token>. Cuenta la visita. */
export async function leerCharlaCompartida(db: SupabaseClient, token: string): Promise<ResultadoLink> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { estado: "no_existe" };
  const { data: link } = await db.from("cli_links").select("id, conversacion_id, vence_at, revocado_at, creado_por").eq("token", token).maybeSingle();
  if (!link) return { estado: "no_existe" };
  const l = link as { id: string; conversacion_id: string; vence_at: string; revocado_at: string | null; creado_por: string | null };
  if (l.revocado_at) return { estado: "cortado" };
  if (new Date(l.vence_at).getTime() <= Date.now()) return { estado: "vencido" };

  const charla = await leerCharla(db, l.conversacion_id);
  if (!charla) return { estado: "no_existe" };
  const [items, extra, adjuntos, quien] = await Promise.all([
    leerHilo(db, l.conversacion_id),
    db.from("cli_conversaciones").select("ficha, pareja_tecnico, pareja_asistente").eq("id", l.conversacion_id).maybeSingle(),
    db.from("cli_hilo").select("id, adjunto").eq("conversacion_id", l.conversacion_id).not("adjunto->>path", "is", null),
    l.creado_por ? db.from("user_profiles").select("nombre").eq("id", l.creado_por).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  void db.rpc("cli_link_visita", { p_id: l.id }).then(() => {}, () => {});

  const fila = extra.data as { ficha: unknown; pareja_tecnico: string | null; pareja_asistente: string | null } | null;
  const ficha = leerFicha(fila?.ficha ?? null, charla.telefono);
  const datos: DatosSlack = {
    charla,
    ficha,
    pareja: { tecnico: fila?.pareja_tecnico ?? null, asistente: fila?.pareja_asistente ?? null },
    items,
    links: new Map(),
    vencen: new Date(l.vence_at),
  };

  // Las URLs firmadas: una para ver y otra para bajar, por archivo, en dos pedidos a Storage.
  const conPath = ((adjuntos.data ?? []) as { id: string; adjunto: { path?: string; nombre?: string } | null }[]).filter((f) => typeof f.adjunto?.path === "string");
  const ver = new Map<string, string>();
  const bajar = new Map<string, string>();
  if (conPath.length) {
    const paths = conPath.map((f) => f.adjunto!.path!);
    const [a, b] = await Promise.all([
      db.storage.from("comercial").createSignedUrls(paths, ARCHIVOS_SEGUNDOS),
      db.storage.from("comercial").createSignedUrls(paths, ARCHIVOS_SEGUNDOS, { download: true }),
    ]);
    (a.data ?? []).forEach((s, i) => s.signedUrl && ver.set(conPath[i].id, s.signedUrl));
    (b.data ?? []).forEach((s, i) => s.signedUrl && bajar.set(conPath[i].id, s.signedUrl));
  }

  const nombreCliente = ficha.nombre ?? charla.nombre ?? telefonoLegible(charla.telefono);
  const primero = nombreCliente.split(" ")[0];
  const archivos: ArchivoCompartido[] = [];
  const archivoDe: Record<string, ArchivoCompartido> = {};
  for (const it of items) {
    if (it.adjunto?.tipo !== "archivo") continue;
    const url = ver.get(it.id);
    if (!url) continue;
    const a: ArchivoCompartido = {
      itemId: it.id,
      numero: archivos.length + 1,
      clase: claseArchivo(it.tipo, it.adjunto.mime),
      tipo: tipoDe(it.tipo, it.adjunto.mime),
      nombre: it.adjunto.nombre,
      url,
      urlDescarga: bajar.get(it.id) ?? url,
      de: it.direccion === "entrante" ? primero : it.autor === "ia" ? "Tomás" : it.autor === "persona" ? it.autorNombre ?? "ABA" : "ABA",
      momento: it.momento,
    };
    archivos.push(a);
    archivoDe[it.id] = a;
  }

  const servicio = filasServicio(datos);
  const ojo = servicio.find((f) => f.etiqueta === "Ojo")?.valor ?? null;
  const etiquetas = [pastilla(charla, "").texto];
  if (ficha.trabajo === "alquiler_simple") etiquetas.push("Alquiler simple");
  if (ficha.segmento === "gama_alta") etiquetas.push("Gama alta");
  if (ficha.alquiler?.cotizacion) etiquetas.push(`Presupuesto N° ${ficha.alquiler.cotizacion.numero}${ficha.alquiler.aceptado ? " aceptado" : " enviado"}`);
  const direccion = ficha.alquiler?.ubicacion?.normalizada || ficha.direccion;
  const conversados = items.filter((i) => i.direccion !== "evento");

  return {
    estado: "ok",
    charla: {
      nombre: nombreCliente,
      telefono: charla.telefono,
      telefonoLegible: telefonoLegible(charla.telefono),
      estado: charla.estado,
      etiquetas,
      desde: conversados[0]?.momento ?? null,
      hasta: conversados.at(-1)?.momento ?? null,
      mensajes: conversados.length,
      cliente: filasCliente(datos),
      servicio: servicio.filter((f) => f.etiqueta !== "Ojo" && f.etiqueta !== "Para qué"),
      ojo,
      tarea: ficha.tarea,
      equipo: filasEquipo(datos).filter((f) => f.etiqueta !== "La charla"),
      archivos,
      items,
      archivoDe,
      venceAt: l.vence_at,
      compartidoPor: (quien.data as { nombre?: string } | null)?.nombre ?? null,
      mapa: direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}` : null,
    },
  };
}
