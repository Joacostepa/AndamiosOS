// Los audios que graba alguien del equipo desde la bandeja (JS, 26/11). El navegador graba en
// lo que puede (Chrome y Firefox: WebM u Ogg con Opus; Safari y el iPhone: MP4 con AAC) y
// WhatsApp, para que llegue como nota de voz (con la onda y el botón de play), quiere Ogg con
// Opus y mono. Se pasa siempre por ffmpeg, como el saludo con voz (voz.ts).

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpeg from "ffmpeg-static";

const correr = promisify(execFile);

/** Lo que puede grabar un navegador → la extensión con que se guarda. */
export const AUDIOS_GRABADOS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
};

/** Hasta 5 minutos: lo mismo que corta la grabación en la pantalla, con un margen. */
export const MAX_SEGUNDOS_AUDIO = 5 * 60;

/** Los argumentos de ffmpeg: Opus mono a 32 kb/s, pensado para voz. */
export function argumentosNotaDeVoz(entrada: string, salida: string): string[] {
  return [
    "-loglevel", "error", "-y", "-i", entrada, "-vn", "-t", String(MAX_SEGUNDOS_AUDIO + 15),
    "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "32k", "-application", "voip", salida,
  ];
}

/** El audio grabado → Ogg con Opus, mono. Falla si ffmpeg no devuelve nada. */
export async function aNotaDeVoz(audio: Buffer, ext: string): Promise<Buffer> {
  if (!ffmpeg) throw new Error("No está ffmpeg (ffmpeg-static).");
  const dir = await mkdtemp(path.join(tmpdir(), "audio-"));
  try {
    const entrada = path.join(dir, `grabado.${ext.replace(/[^a-z0-9]/gi, "") || "webm"}`);
    const salida = path.join(dir, "nota.ogg");
    await writeFile(entrada, audio);
    await correr(ffmpeg, argumentosNotaDeVoz(entrada, salida), { timeout: 45_000 });
    const ogg = await readFile(salida).catch(() => null);
    if (!ogg?.length) throw new Error("No se pudo preparar el audio para WhatsApp.");
    return ogg;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
