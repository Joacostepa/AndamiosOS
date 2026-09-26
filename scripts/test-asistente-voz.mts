// Prueba del "cerebro" de la voz en vivo del Asistente Comercial, sin ElevenLabs: se hace pasar
// por ElevenLabs y llama al endpoint Custom LLM (…/voz/llm/chat/completions) como lo haría el
// agente, con el secreto y el token de sesión firmado. Claude, Odoo y la base son los reales.
//
// Cubre: rechazo con otro secreto, el formato del stream (chat.completion.chunk + [DONE]), la
// frase de espera antes de los 3,5 s, que lo dicho no traiga markdown ni tandas pegadas, y que
// el turno quede guardado con canal "voz". Borra la conversación al final.
//
// Cuesta ~US$ 0,50 de API.
//
// Correr: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/test-asistente-voz.mts

import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { crearConversacion } from "@/lib/asistente/datos";
import { construirSistema } from "@/lib/asistente/prompt";
import { firmarSesionVoz } from "@/lib/voz/sesion";

process.env.ELEVENLABS_LLM_SECRETO = "secreto-de-prueba-local-123";
const { POST } = await import("@/app/api/comercial/asistente/voz/llm/chat/completions/route");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: yo } = await db.from("user_profiles").select("id").eq("email", "js@andamiosbuenosaires.com.ar").single();
const sis = await construirSistema(db);
const conv = await crearConversacion(db, {
  usuario_id: yo!.id, canal: "web", modelo: "claude-opus-5", esfuerzo: "high", system_snapshot: sis.bloques, system_hash: sis.hash,
  criterio_version: sis.criterioVersion, parametros_version: sis.parametrosVersion, titulo: "[PRUEBA VOZ] asistente",
});
const sesion = firmarSesionVoz(conv.id, yo!.id);
const fallas: string[] = [];
const ok = (cond: unknown, que: string) => { console.log(`${cond ? "✓" : "✗"} ${que}`); if (!cond) fallas.push(que); };

async function hablar(texto: string, secreto = process.env.ELEVENLABS_LLM_SECRETO!) {
  console.log(`\n── VENDEDOR (voz): ${texto}`);
  const req = new NextRequest("http://localhost/api/comercial/asistente/voz/llm/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${secreto}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "custom", stream: true, messages: [{ role: "system", content: "x" }, { role: "user", content: texto }], elevenlabs_extra_body: { asistente: sesion } }),
  });
  const t0 = Date.now();
  const res = await POST(req);
  const r = { status: res.status, dicho: "", primera: null as number | null, fin: false, done: false, rara: false };
  if (!res.body || res.status !== 200) return r;
  const lector = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const linea = buf.slice(0, i).trim();
      buf = buf.slice(i + 2);
      if (!linea.startsWith("data: ")) { r.rara = true; continue; }
      if (linea === "data: [DONE]") { r.done = true; continue; }
      const j = JSON.parse(linea.slice(6));
      if (j.object !== "chat.completion.chunk") r.rara = true;
      const d = j.choices[0].delta;
      if (d.content) {
        r.primera ??= (Date.now() - t0) / 1000;
        r.dicho += d.content;
      }
      if (j.choices[0].finish_reason === "stop") r.fin = true;
    }
  }
  console.log(`── ASISTENTE (primera palabra ${r.primera?.toFixed(1)} s, total ${((Date.now() - t0) / 1000).toFixed(1)} s): ${r.dicho}`);
  return r;
}

try {
  const malo = await hablar("hola", "secreto-malo-de-prueba-local");
  ok(malo.status === 401, "con otro secreto: 401");

  const r = await hablar("¿Qué presupuestos le hicimos al Consorcio Moldes 3556? Decime el último nomás.");
  ok(r.status === 200 && !r.rara, "stream con el formato de OpenAI (chat.completion.chunk)");
  ok(r.fin && r.done, "termina con finish_reason stop y [DONE]");
  ok(r.primera !== null && r.primera < 3.5, `algo dicho antes de los 3,5 s (${r.primera?.toFixed(1)} s)`);
  ok(!/\*\*|^#|\|/m.test(r.dicho), "sin markdown");
  ok(!/[a-záéíóúñ][.?!][A-ZÁÉÍÓÚÑ¿]/.test(r.dicho), "sin tandas pegadas (\"Odoo.Ojo\")");
  ok(/S0\d{4}/.test(r.dicho), "nombra el presupuesto");

  const { data: filas } = await db.from("asistente_mensajes").select("rol, tipo, canal").eq("conversacion_id", conv.id).order("seq");
  ok(filas?.some((f) => f.tipo === "humano" && f.canal === "voz"), "el mensaje quedó guardado con canal voz");
  ok(filas?.at(-1)?.rol === "assistant", "la respuesta quedó guardada");
} finally {
  const { data: borradores } = await db.from("cotizacion_borradores").select("id").eq("conversacion_id", conv.id);
  for (const b of borradores ?? []) {
    const { data: files } = await db.storage.from("comercial").list(`propuestas/${b.id}`);
    if (files?.length) await db.storage.from("comercial").remove(files.map((f) => `propuestas/${b.id}/${f.name}`));
  }
  await db.from("cotizacion_borradores").delete().eq("conversacion_id", conv.id);
  await db.from("asistente_conversaciones").delete().eq("id", conv.id);
  console.log("\n── limpieza hecha");
}
console.log(fallas.length ? `\n✗ ${fallas.length} fallas: ${fallas.join(" · ")}` : "\n✓ todo OK");
process.exit(fallas.length ? 1 : 0);
