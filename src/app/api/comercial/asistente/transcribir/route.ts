import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerConversacion } from "@/lib/asistente/datos";
import { transcribir } from "@/lib/voz/elevenlabs";
import { errorResponse, exigirModulo, invalido } from "../../_comun";

// POST /api/comercial/asistente/transcribir { conversacionId, path } — un audio ya subido
// (grabado en la app, o reenviado de WhatsApp) → texto. El texto vuelve al cuadro de mensaje
// para que el vendedor lo mire antes de mandarlo.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const schema = z.object({ conversacionId: z.string().uuid(), path: z.string().startsWith("adjuntos/"), tipo: z.string() });

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const quien = await exigirModulo("asistente-comercial", "editar");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    const conv = await leerConversacion(db, parsed.data.conversacionId);
    if (!conv || conv.usuario_id !== quien.userId || !parsed.data.path.startsWith(`adjuntos/${conv.id}/`)) {
      return NextResponse.json({ error: "No existe ese audio." }, { status: 404 });
    }
    const { data, error } = await db.storage.from("comercial").download(parsed.data.path);
    if (error || !data) throw new Error("No se encontró el audio.");
    const r = await transcribir(Buffer.from(await data.arrayBuffer()), parsed.data.tipo, parsed.data.path.split("/").pop() ?? "audio");
    return NextResponse.json(r);
  } catch (e) {
    return errorResponse(e);
  }
}
