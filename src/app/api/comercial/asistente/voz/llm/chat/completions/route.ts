import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { ejecutarTurno } from "@/lib/asistente/turno";
import { verificarSesionVoz } from "@/lib/voz/sesion";

// POST …/voz/llm/chat/completions — el "cerebro" del agente de voz de ElevenLabs.
//
// ElevenLabs escucha, maneja los turnos y habla; cuando el vendedor termina una frase, llama
// acá como si fuéramos un LLM con la API de OpenAI (Chat Completions en streaming). Acá corre
// EL MISMO asistente que en el chat (mismo turno, mismas herramientas, mismo borrador), con el
// canal en "voz", y se devuelve sólo el texto para decir.
//
// PÚBLICA (la llama ElevenLabs, sin cookie): la protegen dos cosas —el secreto del agente en
// Authorization y nuestro token firmado en elevenlabs_extra_body (quién habla, en qué charla)—.
//
// De la historia que manda ElevenLabs se usa sólo el último mensaje del vendedor: la verdad de
// la conversación está en nuestra base, con las herramientas y los resultados que ElevenLabs no ve.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type MensajeOpenAI = { role: string; content: string | { type: string; text?: string }[] | null };

function autorizado(req: NextRequest): boolean {
  const esperado = process.env.ELEVENLABS_LLM_SECRETO;
  const recibido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!esperado || !recibido || recibido.length !== esperado.length) return false;
  return timingSafeEqual(Buffer.from(recibido), Buffer.from(esperado));
}

// Sin "Dale": el asistente ya arranca muchas respuestas así y quedaba "Dale, dejame ver... Dale, …".
const PRIMERA_ESPERA = ["A ver... ", "Dejame ver... ", "Un segundito... ", "Ahí lo miro... ", "Ya te digo... "];
const ESPERA_LARGA = ["Sigo con eso... ", "Ya casi lo tengo... ", "Un momento más... "];
// Hasta la primera palabra tarda 2,5 a 4,5 s (medido el 26/09). Con la espera a los 3 s casi
// toda respuesta arrancaba con "a ver...", y eso es lo que más sonaba a robot: sale sólo si de
// verdad tarda (herramientas, Odoo).
const PRIMERA_ESPERA_MS = 4_500;
// Si ElevenLabs descartó el pedido anterior (el vendedor siguió hablando), ese turno puede tardar
// unos segundos en soltar el candado: se lo espera callado (la frase de espera tapa el silencio).
const ESPERA_OCUPADO_MS = 12_000;

/** Lo que se va a decir: sin markdown (asteriscos, numerales, viñetas) que el TTS leería. */
function paraDecir(t: string): string {
  return t.replace(/\*\*|__|`/g, "").replace(/^#{1,6}\s*/gm, "").replace(/^[*\-•]\s+/gm, "").replace(/\|/g, " ");
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { messages?: MensajeOpenAI[]; elevenlabs_extra_body?: { asistente?: string } } | null;
  const sesion = verificarSesionVoz(body?.elevenlabs_extra_body?.asistente);
  if (!sesion) return NextResponse.json({ error: "sesión de voz inválida o vencida" }, { status: 401 });

  const ultimo = [...(body?.messages ?? [])].reverse().find((m) => m.role === "user");
  const texto = typeof ultimo?.content === "string"
    ? ultimo.content
    : (ultimo?.content ?? []).map((c) => c.text ?? "").join(" ");

  const db = createAdminClient();
  const codificador = new TextEncoder();
  const id = `chatcmpl-${crypto.randomUUID()}`;
  const creado = Math.floor(Date.now() / 1000);
  const chunk = (delta: Record<string, unknown>, fin: string | null = null) =>
    codificador.encode(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: creado, model: "asistente-aba", choices: [{ index: 0, delta, finish_reason: fin }] })}\n\n`);

  const corte = new AbortController();
  req.signal.addEventListener("abort", () => corte.abort());

  const cuerpo = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enviar = (b: Uint8Array) => {
        try {
          controller.enqueue(b);
        } catch {
          // ElevenLabs cortó (el vendedor interrumpió): no hay a quién mandarle.
        }
      };
      enviar(chunk({ role: "assistant", content: "" }));

      // Silencios. Por teléfono, unos segundos callado parece que se cortó: si a los 4,5 s no dijo
      // nada va una frase de espera corta, y mientras siga trabajando, otra cada 20 s de silencio
      // (máx. 4 en total). Terminan en "... " para que la voz las diga con entonación de pausa.
      let dijoAlgo = false;
      let rellenos = 0;
      let ultimoDicho = Date.now();
      // Entre dos tandas de texto (antes y después de una herramienta) no viene espacio: sin él
      // la voz leería "Odoo.Ojo" de corrido.
      let nuevaTanda = false;
      let ultimoCaracter = "";
      const decir = (t: string) => {
        if (!t) return;
        const texto = nuevaTanda && ultimoCaracter && !/\s/.test(ultimoCaracter) && !/^\s/.test(t) ? ` ${t}` : t;
        nuevaTanda = false;
        ultimoCaracter = texto.slice(-1);
        ultimoDicho = Date.now();
        enviar(chunk({ content: texto }));
      };
      const rellenar = () => {
        if (rellenos >= 4) return;
        decir(rellenos === 0 ? PRIMERA_ESPERA[Math.floor(Math.random() * PRIMERA_ESPERA.length)] : ESPERA_LARGA[(rellenos - 1) % ESPERA_LARGA.length]);
        rellenos++;
      };
      const reloj = setInterval(() => {
        if (Date.now() - ultimoDicho >= (dijoAlgo || rellenos > 0 ? 20_000 : PRIMERA_ESPERA_MS)) rellenar();
      }, 500);

      try {
        // Sin nada del vendedor (p. ej. si el agente no tiene saludo configurado) no se corre un turno.
        if (!texto.trim()) {
          decir("Te escucho.");
          return;
        }
        // Si el turno anterior todavía está soltando el candado (interrupción), se reintenta.
        let ocupado = false;
        for (let intento = 0; intento < ESPERA_OCUPADO_MS / 500; intento++) {
          ocupado = false;
          for await (const ev of ejecutarTurno({ db, conversacionId: sesion.conversacionId, usuarioId: sesion.usuarioId, entrada: { tipo: "mensaje", texto, adjuntos: [], canal: "voz" }, signal: corte.signal })) {
            if (ev.t !== "texto") nuevaTanda = true;
            if (ev.t === "texto") {
              dijoAlgo = true;
              decir(paraDecir(ev.d));
            } else if (ev.t === "continuar") {
              decir(" Me está llevando más de lo pensado. Decime «seguí» y continúo.");
            } else if (ev.t === "error") {
              if (ev.codigo === "ocupado") {
                ocupado = true;
                break;
              }
              decir(` ${paraDecir(ev.mensaje)}`);
            }
          }
          if (!ocupado) break;
          await new Promise((r) => setTimeout(r, 500));
        }
        // Otro turno de la misma charla sigue corriendo (p. ej. uno escrito en el chat).
        if (ocupado) decir("Todavía estoy terminando lo anterior. Repetime en un segundo.");
      } catch (e) {
        decir(` Perdón, algo falló: ${e instanceof Error ? e.message : "error"}.`);
      } finally {
        clearInterval(reloj);
        enviar(chunk({}, "stop"));
        enviar(codificador.encode("data: [DONE]\n\n"));
        try {
          controller.close();
        } catch {
          // ya cerrado
        }
      }
    },
    cancel() {
      corte.abort();
    },
  });

  return new Response(cuerpo, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
