// El saludo como nota de voz (pruebas del 17/10/2026, docs/sofia/handoff.md punto 14).
//
// Lo que eligió JS después de varias rondas de muestras (scripts/sofia-voz/):
//   · el guion «H»: «Jorge, buen día. Tomás, de Andamios Buenos Aires, ¿en qué te ayudo?»
//     (guionSaludoVoz en saludo.ts);
//   · la voz «Tomás» de ElevenLabs con Eleven v4, estabilidad 0,85 y sin etiquetas de tono
//     ([warmly] le sonó exagerado), acelerada ×1,15 (v4 no hace caso a `speed`);
//   · que suene a un audio de WhatsApp grabado en la oficina y no a un micrófono prolijo: el fondo
//     «oficina + depósito» (voz/fondo-oficina-deposito.mp3, de la API de efectos) va debajo de
//     la voz ANTES del micrófono, la voz lejos del celular (más eco de cuarto, menos agudos), el
//     micrófono del teléfono, el volumen automático que sube el ruido en las pausas, y Opus a
//     24 kb/s y 16 kHz, el formato de las notas de voz de WhatsApp. Es la misma cadena que
//     audio-whatsapp.py con armar(1.15, "ofidep-1", -16, "lejos").
//
// Cada audio se genera una sola vez por momento del día y nombre (claveSaludoVoz) y queda en
// Storage (comercial/voz/saludo/v1/). Antes de guardarlo se transcribe y se compara con el guion
// (audioDiceElGuion): si no coincide, se genera de nuevo; si tampoco, no hay audio y el turno
// manda sólo el texto. Usa su propia clave de ElevenLabs (ELEVENLABS_VOZ_API_KEY, con permisos de
// voz y de speech-to-text), no la del asistente de voz.

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import ffmpeg from "ffmpeg-static";
import { audioDiceElGuion, claveSaludoVoz, guionSaludoVoz } from "./saludo.ts";

const correr = promisify(execFile);

const API = "https://api.elevenlabs.io/v1";
/** «Tomás - Argentina & Uruguaya», de la biblioteca de voces de ElevenLabs. */
const VOZ = "QK4xDwo9ESPHA4JNUpX3";
const MODELO = "eleven_v4";
const BUCKET = "comercial";
/** Si cambia la voz, el guion o el sonido, se sube la versión y los audios se generan de nuevo. */
const CARPETA = "voz/saludo/v1";
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
    body: JSON.stringify({ text: texto, model_id: MODELO, voice_settings: { stability: 0.85 } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs no generó la voz (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

async function transcribir(audio: Buffer): Promise<string> {
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("language_code", "es");
  form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/ogg" }), "saludo.ogg");
  const res = await fetch(`${API}/speech-to-text`, { method: "POST", headers: { "xi-api-key": clave() }, body: form, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`ElevenLabs no transcribió el saludo (${res.status}).`);
  const j = (await res.json()) as { text?: string };
  return j.text ?? "";
}

/**
 * La cadena de audio-whatsapp.py en un solo ffmpeg. Entradas: 0 la voz, 1 el eco de un cuarto
 * (ruido que se apaga en unos 0,4 s), 2 el siseo del celular, 3 el fondo.
 */
const FILTRO = [
  "[0:a]atempo=1.15,loudnorm=I=-18:TP=-2,aresample=44100,adelay=350:all=1,apad=pad_dur=0.6,asplit[d][w]",
  "[w][1:a]afir=dry=0:wet=1[r]",
  "[d]lowpass=f=4500[dd]",
  "[dd][r]amix=inputs=2:weights=5 5:normalize=1:duration=first[v]",
  "[2:a]lowpass=f=1200[s]",
  "[3:a]loudnorm=I=-34:TP=-4,aresample=44100[f]",
  "[v][s][f]amix=inputs=3:normalize=0:duration=first," +
    "highpass=f=130,lowpass=f=6800,equalizer=f=250:t=q:w=1:g=-2,equalizer=f=3000:t=q:w=1.2:g=3," +
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
      "-f", "lavfi", "-i", "anoisesrc=d=0.6:c=pink:r=44100:a=1,volume='exp(-t*10)':eval=frame,lowpass=f=5000",
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

/** El audio del saludo para este perfil y esta hora: el guardado, o uno nuevo verificado. */
export async function audioSaludo(db: SupabaseClient, perfil: string | null, ahora: Date): Promise<AudioSaludo> {
  const guion = guionSaludoVoz(perfil, ahora);
  const archivo = `${CARPETA}/${claveSaludoVoz(perfil, ahora)}.ogg`;
  const firmar = () => db.storage.from(BUCKET).createSignedUrl(archivo, 3600);

  const guardado = await firmar();
  if (guardado.data?.signedUrl) return { path: archivo, url: guardado.data.signedUrl, guion, mime: "audio/ogg" };

  let ultimo = "";
  for (let i = 0; i < INTENTOS; i++) {
    const ogg = await procesar(await hablar(guion));
    const dijo = await transcribir(ogg);
    if (!audioDiceElGuion(guion, dijo)) {
      ultimo = dijo;
      continue;
    }
    const { error } = await db.storage.from(BUCKET).upload(archivo, ogg, { contentType: "audio/ogg", upsert: true });
    if (error) throw new Error(`No se pudo guardar el audio: ${error.message}`);
    const firmado = await firmar();
    if (!firmado.data?.signedUrl) throw new Error(`No se pudo preparar el audio: ${firmado.error?.message ?? "sin URL"}`);
    return { path: archivo, url: firmado.data.signedUrl, guion, mime: "audio/ogg" };
  }
  throw new Error(`El audio no dijo el saludo (${INTENTOS} intentos; el último: «${ultimo.slice(0, 120)}»).`);
}
