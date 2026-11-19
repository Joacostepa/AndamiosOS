// Manda la imagen de referencia (referencias.ts): la copia en JPG del render y el envío.

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import ffmpeg from "ffmpeg-static";
import { mandarArchivo } from "./envio";
import { elegirRender, epigrafeReferencia, REFERENCIAS, type FilaRender, type ResultadoReferencia, type TipoReferencia } from "./referencias";

const correr = promisify(execFile);
const BUCKET = "comercial";
const CARPETA = "referencias";

/** La copia en JPG del render: la guardada, o una nueva. Devuelve la ruta en Storage. */
async function copiaJpg(db: SupabaseClient, render: FilaRender): Promise<string> {
  const destino = `${CARPETA}/${path.basename(render.path).replace(/\.[a-z0-9]+$/i, "")}.jpg`;
  const guardada = await db.storage.from(BUCKET).createSignedUrl(destino, 60);
  if (guardada.data?.signedUrl) return destino;

  const { data, error } = await db.storage.from(BUCKET).download(render.path);
  if (error || !data) throw new Error(`No se pudo bajar el render: ${error?.message ?? "vacío"}`);
  if (!ffmpeg) throw new Error("No está ffmpeg (ffmpeg-static).");
  const dir = await mkdtemp(path.join(tmpdir(), "referencia-"));
  try {
    const entrada = path.join(dir, `render${path.extname(render.path) || ".png"}`);
    const salida = path.join(dir, "referencia.jpg");
    await writeFile(entrada, Buffer.from(await data.arrayBuffer()));
    // Un PNG transparente saldría con fondo negro: se aplana sobre blanco (como en el PDF).
    await correr(ffmpeg, [
      "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=white", "-i", entrada,
      "-filter_complex", "[1:v]scale='min(1600,iw)':-2[r];[0:v][r]scale2ref[f][r2];[f][r2]overlay=shortest=1,format=yuvj420p",
      "-frames:v", "1", "-q:v", "4", salida,
    ], { timeout: 30_000 });
    const jpg = await readFile(salida);
    const { error: e } = await db.storage.from(BUCKET).upload(destino, jpg, { contentType: "image/jpeg", upsert: true });
    if (e) throw new Error(`No se pudo guardar la imagen de referencia: ${e.message}`);
    return destino;
  } finally {
    await rm(dir, { recursive: true, force: true });
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

  const jpg = await copiaJpg(db, render);
  await mandarArchivo(db, charla.id, charla.telefono, { path: jpg, mime: "image/jpeg", nombre: ref.nombre }, epigrafeReferencia(tipo, trato), { autor: "ia" });
  return "enviada";
}
