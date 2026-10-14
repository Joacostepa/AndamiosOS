import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerConversacion } from "@/lib/asistente/datos";
import { exigirModulo, invalido } from "../../_comun";
import { respuestaDeTurno } from "../_stream";

// POST /api/comercial/asistente/chat — un mensaje del vendedor; la respuesta llega en SSE.
// { conversacionId, texto, adjuntos?, canal? } o { conversacionId, continuar: true } cuando el
// turno anterior avisó "continuar" (se cortó por tiempo en medio de muchas herramientas).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const adjunto = z.object({
  path: z.string().startsWith("adjuntos/").max(300),
  tipo: z.string().regex(/^(image\/(png|jpeg|webp|gif)|application\/pdf)$/, "Tipo de adjunto no admitido"),
  nombre: z.string().max(200),
});

const schema = z.union([
  z.object({
    conversacionId: z.string().uuid(),
    texto: z.string().max(20_000),
    adjuntos: z.array(adjunto).max(8).optional(),
    canal: z.enum(["web", "voz"]).optional(),
  }),
  z.object({ conversacionId: z.string().uuid(), continuar: z.literal(true), canal: z.enum(["web", "voz"]).optional() }),
]);

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const quien = await exigirModulo("asistente-comercial", "editar");
  if (quien instanceof NextResponse) return quien;

  const db = createAdminClient();
  const conv = await leerConversacion(db, parsed.data.conversacionId);
  // Se chatea sólo en las conversaciones propias (admin puede mirar las de otros, no escribir).
  if (!conv || conv.usuario_id !== quien.userId) return NextResponse.json({ error: "No existe esa conversación." }, { status: 404 });

  const b = parsed.data;
  const entrada = "continuar" in b
    ? { tipo: "continuar" as const, canal: b.canal ?? "web" }
    : { tipo: "mensaje" as const, texto: b.texto, adjuntos: (b.adjuntos ?? []).filter((a) => a.path.startsWith(`adjuntos/${conv.id}/`)), canal: b.canal ?? "web" };
  if (entrada.tipo === "mensaje" && !entrada.texto.trim() && !entrada.adjuntos.length) return invalido("El mensaje está vacío.");

  return respuestaDeTurno(req, { db, conversacionId: conv.id, usuarioId: quien.userId, entrada });
}
