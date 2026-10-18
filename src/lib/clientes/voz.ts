// El saludo como nota de voz (pruebas del 17/10/2026, docs/sofia/handoff.md punto 14).
//
// Lo que eligió JS después de varias rondas de muestras (scripts/sofia-voz/):
//   · el texto de un audio suyo de referencia: «Hola, Jorge, acá Tomás de Andamios Buenos Aires.
//     ¿En qué te puedo ayudar?» (guionSaludoVoz en saludo.ts; el 18/10 cambió el cierre
//     «Contame... en qué te puedo ayudar.», que sonaba raro, por la pregunta sola);
//   · la voz «Gabi B» (mendocino) de ElevenLabs con Eleven v4: antes era «Tomás», que sonaba
//     a locutor; sin etiquetas de tono ([warmly] le sonó exagerado) y con estabilidad 0,2 (con
//     0,85 le dijeron que sonaba «demasiado perfecta»); acelerada ×1,50 (v4 no hace caso a
//     `speed`; era ×1,40 hasta el 18/10);
//   · que suene a un audio de WhatsApp grabado en la oficina y no a un micrófono prolijo: el fondo
//     «oficina + depósito» (voz/fondo-oficina-deposito.mp3, de la API de efectos) va debajo de
//     la voz ANTES del micrófono, bajo (a -43 LUFS: el 18/10 JS dijo que tapaba la voz, y el
//     transcriptor entendía «Pepín» por «Joaquín»; antes iba a -31); la voz con más voz directa
//     que eco de cuarto (6:4; hasta el 18/10 era 4:6, «a un metro»), el eco con 8 ms de retraso y
//     sin graves ni agudos de más; el micrófono del teléfono, el volumen automático que sube el
//     ruido en las pausas, y Opus a 24 kb/s y 16 kHz, el formato de las notas de voz de WhatsApp.
//
// Cada audio se genera una sola vez por nombre (claveSaludoVoz) y queda en Storage
// (comercial/voz/saludo/v5/; v1 a v4 eran voces, guiones y sonidos anteriores). Antes de guardarlo se
// transcribe la voz CRUDA (antes de acelerarla y procesarla) y se compara con el guion
// (audioDiceElGuion): si ElevenLabs se comió una sílaba, se genera de nuevo; si tampoco sale, no
// hay audio y el turno manda el texto. Se transcribe la cruda porque a ×1,40 o más el transcriptor
// confunde «Andamios» con «Andamis» aunque se entienda bien: la aceleración es siempre la misma y
// no cambia las palabras. Usa su propia clave de ElevenLabs (ELEVENLABS_VOZ_API_KEY, con permisos de
// voz y de speech-to-text), no la del asistente de voz.

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import ffmpeg from "ffmpeg-static";
import { audioDiceElGuion, claveSaludoVoz, guionSaludoVoz, nombreParaSaludo } from "./saludo.ts";

const correr = promisify(execFile);

const API = "https://api.elevenlabs.io/v1";
/** «Gabi B» (mendocino), de la biblioteca de voces de ElevenLabs. La eligió JS el 17/10. */
const VOZ = "xDZJO6bbSnscJEAbhpRF";
const MODELO = "eleven_v4";
const BUCKET = "comercial";
/** Si cambia la voz, el guion o el sonido, se sube la versión y los audios se generan de nuevo. */
const CARPETA = "voz/saludo/v5";
const FONDO = path.join(process.cwd(), "src/lib/clientes/voz/fondo-oficina-deposito.mp3");
const INTENTOS = 2;

export type AudioSaludo = { path: string; url: string; guion: string; mime: "audio/ogg" };

function clave(): string {
  const k = process.env.ELEVENLABS_VOZ_API_KEY;
  if (!k) throw new Error("Falta ELEVENLABS_VOZ_API_KEY.");
  return k;
}

async function hablar(texto: string): Promise<Buffer> {
  const res = await fetch(`${API}/text-to-speech/${VOZ}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": clave(), "Content-Type": "application/json" },
    body: JSON.stringify({ text: texto, model_id: MODELO, voice_settings: { stability: 0.2 } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs no generó la voz (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

async function transcribir(audio: Buffer): Promise<string> {
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("language_code", "es");
  form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), "saludo.mp3");
  const res = await fetch(`${API}/speech-to-text`, { method: "POST", headers: { "xi-api-key": clave() }, body: form, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`ElevenLabs no transcribió el saludo (${res.status}).`);
  const j = (await res.json()) as { text?: string };
  return j.text ?? "";
}

/**
 * La cadena de audio-whatsapp.py en un solo ffmpeg. Entradas: 0 la voz, 1 el eco de un cuarto
 * (ruido que se apaga en unos 0,6 s y llega 8 ms tarde: las paredes), 2 el siseo del celular, 3 el fondo.
 */
const FILTRO = [
  "[0:a]atempo=1.50,loudnorm=I=-18:TP=-2,aresample=44100,adelay=350:all=1,apad=pad_dur=0.6,asplit[d][w]",
  "[w][1:a]afir=dry=0:wet=1[r]",
  "[d]lowpass=f=4000,highpass=f=180[dd]",
  "[dd][r]amix=inputs=2:weights=6 4:normalize=1:duration=first[v]",
  "[2:a]lowpass=f=1200[s]",
  "[3:a]loudnorm=I=-43:TP=-4,aresample=44100[f]",
  "[v][s][f]amix=inputs=3:normalize=0:duration=first," +
    "highpass=f=130,lowpass=f=6800,equalizer=f=250:t=q:w=1:g=-4,equalizer=f=3000:t=q:w=1.2:g=3," +
    "dynaudnorm=f=120:g=11:m=12:p=0.9,acompressor=threshold=-22dB:ratio=4:attack=3:release=60:makeup=2," +
    "loudnorm=I=-16:TP=-1.5,aresample=16000[o]",
].join(";");

async function procesar(voz: Buffer): Promise<Buffer> {
  if (!ffmpeg) throw new Error("No está ffmpeg (ffmpeg-static).");
  const dir = await mkdtemp(path.join(tmpdir(), "saludo-"));
  try {
    const entrada = path.join(dir, "voz.mp3");
    const salida = path.join(dir, "saludo.ogg");
    await writeFile(entrada, voz);
    await correr(ffmpeg, [
      "-loglevel", "error", "-y",
      "-i", entrada,
      "-f", "lavfi", "-i", "anoisesrc=d=0.6:c=pink:r=44100:a=1,volume='exp(-t*6)':eval=frame,lowpass=f=5000,adelay=8",
      "-f", "lavfi", "-i", "anoisesrc=d=30:c=brown:r=44100:a=0.012",
      "-i", FONDO,
      "-filter_complex", FILTRO, "-map", "[o]",
      "-ac", "1", "-c:a", "libopus", "-b:a", "24k", "-application", "voip", salida,
    ], { timeout: 30_000 });
    return await readFile(salida);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** El audio del saludo para este perfil: el guardado, o uno nuevo verificado. */
export async function audioSaludo(db: SupabaseClient, perfil: string | null): Promise<AudioSaludo> {
  const guion = guionSaludoVoz(perfil);
  const archivo = `${CARPETA}/${claveSaludoVoz(perfil)}.ogg`;
  const firmar = () => db.storage.from(BUCKET).createSignedUrl(archivo, 3600);

  const guardado = await firmar();
  if (guardado.data?.signedUrl) return { path: archivo, url: guardado.data.signedUrl, guion, mime: "audio/ogg" };

  let ultimo = "";
  for (let i = 0; i < INTENTOS; i++) {
    const voz = await hablar(guion);
    const dijo = await transcribir(voz);
    if (!audioDiceElGuion(guion, dijo, nombreParaSaludo(perfil))) {
      ultimo = dijo;
      continue;
    }
    const ogg = await procesar(voz);
    const { error } = await db.storage.from(BUCKET).upload(archivo, ogg, { contentType: "audio/ogg", upsert: true });
    if (error) throw new Error(`No se pudo guardar el audio: ${error.message}`);
    const firmado = await firmar();
    if (!firmado.data?.signedUrl) throw new Error(`No se pudo preparar el audio: ${firmado.error?.message ?? "sin URL"}`);
    return { path: archivo, url: firmado.data.signedUrl, guion, mime: "audio/ogg" };
  }
  throw new Error(`El audio no dijo el saludo (${INTENTOS} intentos; el último: «${ultimo.slice(0, 120)}»).`);
}
