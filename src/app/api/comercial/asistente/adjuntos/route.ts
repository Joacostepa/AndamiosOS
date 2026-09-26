import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerConversacion } from "@/lib/asistente/datos";
import { errorResponse, exigirModulo, invalido } from "../../_comun";

// POST /api/comercial/asistente/adjuntos — URL firmada para subir una foto, un plano (PDF) o un
// audio directo a Storage. El archivo NO pasa por acá: el proxy corta cuerpos de más de 10 MB
// y Vercel de más de 4,5 MB, y una foto del celular o un plano los pasan.

export const dynamic = "force-dynamic";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf",
  "audio/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-m4a": "m4a",
};

const schema = z.object({ conversacionId: z.string().uuid(), tipo: z.string() });

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const ext = EXT[parsed.data.tipo.split(";")[0]];
  if (!ext) return invalido("Sólo fotos (JPG, PNG, WEBP), PDF o audios.");
  const quien = await exigirModulo("asistente-comercial", "editar");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    const conv = await leerConversacion(db, parsed.data.conversacionId);
    if (!conv || conv.usuario_id !== quien.userId) return NextResponse.json({ error: "No existe esa conversación." }, { status: 404 });
    const path = `adjuntos/${conv.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const { data, error } = await db.storage.from("comercial").createSignedUploadUrl(path);
    if (error) throw error;
    return NextResponse.json({ path: data.path, token: data.token });
  } catch (e) {
    return errorResponse(e);
  }
}
