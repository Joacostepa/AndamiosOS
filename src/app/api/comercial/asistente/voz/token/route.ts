import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerConversacion } from "@/lib/asistente/datos";
import { tokenDeConversacion } from "@/lib/voz/elevenlabs";
import { firmarSesionVoz } from "@/lib/voz/sesion";
import { errorResponse, exigirModulo, invalido } from "../../../_comun";

// POST /api/comercial/asistente/voz/token { conversacionId } — para arrancar la voz en vivo:
// el token de ElevenLabs (la clave nunca llega al navegador) y el nuestro firmado, que
// ElevenLabs nos devuelve en cada pedido para saber de quién es la charla.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const parsed = z.object({ conversacionId: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const quien = await exigirModulo("asistente-comercial", "editar");
  if (quien instanceof NextResponse) return quien;
  try {
    const conv = await leerConversacion(createAdminClient(), parsed.data.conversacionId);
    if (!conv || conv.usuario_id !== quien.userId) return NextResponse.json({ error: "No existe esa conversación." }, { status: 404 });
    return NextResponse.json({
      conversationToken: await tokenDeConversacion(),
      sesion: firmarSesionVoz(conv.id, quien.userId),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
