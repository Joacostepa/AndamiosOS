// Manda la imagen de referencia (referencias.ts): la copia en JPG del render y el envío.

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import ffmpeg from "ffmpeg-static";
import { mandarArchivo } from "./envio";
import { elegirRender, epigrafeReferencia, FILTRO_COPIA, REFERENCIAS, type FilaRender, type ResultadoReferencia, type TipoReferencia } from "./referencias";

const correr = promisify(execFile);
const BUCKET = "comercial";
const CARPETA = "referencias";

/** Ruta de la copia en JPG de un render en Storage. */
export function rutaCopiaJpg(renderPath: string): string {
  return `${CARPETA}/${path.basename(renderPath).replace(/\.[a-z0-9]+$/i, "")}.jpg`;
}


/** La copia en JPG del render: la guardada, o una nueva. Devuelve la ruta en Storage. */
async function copiaJpg(db: SupabaseClient, render: FilaRender, original: Buffer): Promise<string> {
  if (!ffmpeg) throw new Error("No está ffmpeg (ffmpeg-static).");
  const destino = rutaCopiaJpg(render.path);
  const dir = await mkdtemp(path.join(tmpdir(), "referencia-"));
  try {
    const entrada = path.join(dir, `render${path.extname(render.path) || ".png"}`);
    const salida = path.join(dir, "referencia.jpg");
    await writeFile(entrada, original);
    const { stderr } = await correr(ffmpeg, [
      "-loglevel", "warning", "-y", "-i", entrada, "-filter_complex", FILTRO_COPIA,
      "-frames:v", "1", "-update", "1", "-q:v", "4", salida,
    ], { timeout: 30_000 });
    const jpg = await readFile(salida).catch(() => null);
    if (!jpg?.length) throw new Error(`ffmpeg no armó la copia: ${stderr.trim().slice(0, 300) || "sin detalle"}`);
    const { error: e } = await db.storage.from(BUCKET).upload(destino, jpg, { contentType: "image/jpeg", upsert: true });
    if (e) throw new Error(`No se pudo guardar la imagen de referencia: ${e.message}`);
    return destino;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** WhatsApp acepta fotos de hasta 5 MB. */
const MAX_FOTO = 5 * 1024 * 1024;

/**
 * La copia en JPG (la guardada o una nueva). Si no se puede armar, el render original, si es
 * PNG o JPG y entra en WhatsApp: la imagen sale igual (pesa más, nada más).
 */
async function imagenParaMandar(db: SupabaseClient, render: FilaRender): Promise<{ path: string; mime: string }> {
  const destino = rutaCopiaJpg(render.path);
  const guardada = await db.storage.from(BUCKET).createSignedUrl(destino, 60);
  if (guardada.data?.signedUrl) return { path: destino, mime: "image/jpeg" };

  const { data, error } = await db.storage.from(BUCKET).download(render.path);
  if (error || !data) throw new Error(`No se pudo bajar el render: ${error?.message ?? "vacío"}`);
  const original = Buffer.from(await data.arrayBuffer());
  try {
    return { path: await copiaJpg(db, render, original), mime: "image/jpeg" };
  } catch (e) {
    const mime = /\.png$/i.test(render.path) ? "image/png" : /\.jpe?g$/i.test(render.path) ? "image/jpeg" : null;
    if (!mime || original.length > MAX_FOTO) throw e;
    console.error("[sofia] copia de la imagen de referencia; sale el original", render.path, e);
    return { path: render.path, mime };
  }
}

/** Las que Tomás todavía atiende: una tomada, derivada o cerrada no recibe nada de él. */
const ATIENDE_TOMAS = new Set(["bot", "espera_ok"]);

/**
 * Manda la imagen de referencia de ese tipo, si todavía no salió en esta charla. Sale a mitad del
 * turno: por eso mira el estado (una derivación de este mismo turno ya quedó escrita).
 */
export async function mandarReferencia(
  db: SupabaseClient,
  charla: { id: string; telefono: string },
  tipo: TipoReferencia,
  trato: "vos" | "usted" | null,
): Promise<ResultadoReferencia> {
  const ref = REFERENCIAS[tipo];
  const [{ data: conv, error: e1 }, { data: previas, error: e2 }] = await Promise.all([
    db.from("cli_conversaciones").select("estado").eq("id", charla.id).maybeSingle(),
    db.from("cli_hilo").select("id").eq("conversacion_id", charla.id).eq("direccion", "saliente").eq("adjunto->>nombre", ref.nombre).neq("estado", "error").limit(1),
  ]);
  if (e1 || e2) throw new Error(`No se pudo revisar la charla: ${(e1 ?? e2)!.message}`);
  if (!conv || !ATIENDE_TOMAS.has(conv.estado as string)) return "charla_tomada";
  if (previas?.length) return "ya_enviada";

  const { data: filas, error } = await db.from("cotizacion_renders").select("id, path, por_defecto, created_at").eq("tipo", tipo);
  if (error) throw new Error(`No se pudo leer la biblioteca de renders: ${error.message}`);
  const render = elegirRender((filas ?? []) as FilaRender[]);
  if (!render) return "sin_imagen";

  const archivo = await imagenParaMandar(db, render);
  await mandarArchivo(db, charla.id, charla.telefono, { ...archivo, nombre: ref.nombre }, epigrafeReferencia(tipo, trato), { autor: "ia" });
  return "enviada";
}
