// Un turno del asistente como respuesta SSE (text/event-stream sobre un POST).
//
// SSE Y NO NDJSON: los proxies y la compresión dejan pasar event-stream sin juntar el cuerpo,
// y el latido cada 15 s evita que un intermediario corte una respuesta que tarda (Odoo lento,
// muchas herramientas). Si el vendedor corta o se va, se aborta el turno: lo ya guardado queda.

import { ejecutarTurno, type EntradaTurno } from "@/lib/asistente/turno";
import { sse } from "@/lib/asistente/eventos";
import type { SupabaseClient } from "@supabase/supabase-js";

export function respuestaDeTurno(req: Request, p: { db: SupabaseClient; conversacionId: string; usuarioId: string; entrada: EntradaTurno }): Response {
  const codificador = new TextEncoder();
  const corte = new AbortController();
  req.signal.addEventListener("abort", () => corte.abort());

  const cuerpo = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enviar = (s: string) => {
        try {
          controller.enqueue(codificador.encode(s));
        } catch {
          // El navegador ya se fue: no hay a quién mandarle.
        }
      };
      const latido = setInterval(() => enviar(": latido\n\n"), 15_000);
      try {
        for await (const ev of ejecutarTurno({ ...p, signal: corte.signal })) enviar(sse(ev));
      } catch (e) {
        enviar(sse({ t: "error", codigo: "interno", mensaje: e instanceof Error ? e.message : "Algo falló." }));
      } finally {
        clearInterval(latido);
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
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
