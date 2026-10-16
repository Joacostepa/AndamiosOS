import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerCharla } from "@/lib/clientes/bandeja";
import { errorResponse, exigirModulo, invalido } from "../../../../_comun";

// POST /api/comercial/clientes/conversaciones/:id/adjuntos — URL firmada para subir una foto
// o un documento que se le va a mandar al cliente. El archivo NO pasa por acá (el proxy corta
// cuerpos de más de 10 MB y Vercel de más de 4,5 MB): va directo a Storage, y después
// /responder lo manda por WhatsApp con un link firmado.

export const dynamic = "force-dynamic";

/** Lo que WhatsApp acepta como foto (jpg, png) o como documento (hasta 100 MB). */
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
};

const schema = z.object({ tipo: z.string().max(120) });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return invalido("Id inválido");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const ext = EXT[parsed.data.tipo.split(";")[0].trim()];
  if (!ext) return invalido("Por WhatsApp se pueden mandar fotos (JPG o PNG), PDF, Word, Excel o texto.");
  const quien = await exigirModulo("clientes-whatsapp", "editar");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    if (!(await leerCharla(db, id))) return NextResponse.json({ error: "No existe esa charla." }, { status: 404 });
    const path = `clientes/${id}/salientes/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const { data, error } = await db.storage.from("comercial").createSignedUploadUrl(path);
    if (error) throw error;
    return NextResponse.json({ path: data.path, token: data.token });
  } catch (e) {
    return errorResponse(e);
  }
}
