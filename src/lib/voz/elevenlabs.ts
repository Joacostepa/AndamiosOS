// Voz con ElevenLabs: transcripción de audios (Scribe) y la sesión de voz en vivo (Agents).
// SOLO server-side: la clave (ELEVENLABS_API_KEY) nunca llega al navegador.
//
// POR QUÉ ELEVENLABS: Claude no escucha ni habla. Para la voz hace falta alguien que pase el
// audio a texto y el texto a audio; el que piensa sigue siendo el mismo asistente (Claude) con
// las mismas herramientas. Scribe entiende bien castellano rioplatense y acepta "keyterms"
// para la jerga de obra, que es lo que más se equivoca un transcriptor genérico.

const API = "https://api.elevenlabs.io/v1";

/** Palabras de la casa: sesgan la transcripción hacia cómo se habla en ABA. */
const TERMINOS = [
  "andamio", "andamios", "multidireccional", "bandeja", "pantalla de protección", "concertina", "fenólico", "media sombra",
  "tablones", "escalera escotilla", "silleteros", "fachada", "metros lineales", "metro cuadrado", "renovación", "canon",
  "Odoo", "CUIT", "UOCRA", "CAC", "gestoría", "permiso de vía pública", "GCBA", "consorcio", "presupuesto", "propuesta",
  "Gabriel", "Jorge", "Joaquín", "Sandra", "Rocío", "Tamara", "Agustina", "Andamios Buenos Aires", "ABA", "IVA",
];

export function hayVoz(): { transcripcion: boolean; vozEnVivo: boolean } {
  const clave = !!process.env.ELEVENLABS_API_KEY;
  return { transcripcion: clave, vozEnVivo: clave && !!process.env.ELEVENLABS_AGENT_ID };
}

export async function transcribir(audio: Buffer, mime: string, nombre: string): Promise<{ texto: string; confianza: number | null }> {
  const clave = process.env.ELEVENLABS_API_KEY;
  if (!clave) throw new Error("La transcripción de audios no está configurada (falta ELEVENLABS_API_KEY).");
  const form = new FormData();
  form.set("model_id", "scribe_v2");
  form.set("language_code", "spa");
  form.set("tag_audio_events", "false");
  form.set("file", new Blob([new Uint8Array(audio)], { type: mime }), nombre);
  for (const t of TERMINOS) form.append("keyterms", t);
  const res = await fetch(`${API}/speech-to-text`, { method: "POST", headers: { "xi-api-key": clave }, body: form, signal: AbortSignal.timeout(90_000) });
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    throw new Error(`ElevenLabs no pudo transcribir el audio (${res.status}): ${cuerpo.slice(0, 200)}`);
  }
  const j = (await res.json()) as { text?: string; language_probability?: number };
  return { texto: (j.text ?? "").trim(), confianza: j.language_probability ?? null };
}

/** Token de corta vida para que el navegador abra la sesión de voz en vivo (WebRTC) sin ver la clave. */
export async function tokenDeConversacion(): Promise<string> {
  const clave = process.env.ELEVENLABS_API_KEY;
  const agente = process.env.ELEVENLABS_AGENT_ID;
  if (!clave || !agente) throw new Error("La voz en vivo no está configurada (faltan ELEVENLABS_API_KEY y ELEVENLABS_AGENT_ID).");
  const res = await fetch(`${API}/convai/conversation/token?agent_id=${encodeURIComponent(agente)}`, {
    headers: { "xi-api-key": clave },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs no dio el token de la sesión de voz (${res.status}).`);
  const j = (await res.json()) as { token?: string };
  if (!j.token) throw new Error("ElevenLabs no devolvió el token de la sesión de voz.");
  return j.token;
}
