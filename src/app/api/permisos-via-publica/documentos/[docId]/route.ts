import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET, registrarSubida, revisarDocumento } from "@/lib/permisos-via-publica/endosos";

// POST /api/permisos-via-publica/documentos/:docId  (multipart: archivo)
//
// Alguien de ABA sube el PDF de un documento del trámite. El caso de hoy: Gonzalo mandó la
// póliza por mail en vez de usar su link. Pasa por la MISMA revisión que la del portal.
//
// Por el cuerpo de la función (límite de Vercel ~4,5 MB): alcanza para una póliza, que
// pesa unos cientos de KB. El portal del productor sube directo al bucket.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: NextRequest, ctx: { params: Promise<{ docId: string }> }) {
  const { docId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(docId)) return NextResponse.json({ error: "Documento inválido" }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  if (!(archivo instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  if (archivo.type !== "application/pdf" && !archivo.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Tiene que ser un PDF" }, { status: 400 });
  }
  if (archivo.size > MAX_BYTES) return NextResponse.json({ error: "El PDF pesa más de 4 MB" }, { status: 400 });

  const db = createAdminClient();
  const { data: doc } = await db.from("pvp_documentos").select("tramite_id, clave").eq("id", docId).maybeSingle();
  if (!doc) return NextResponse.json({ error: "El documento no existe" }, { status: 404 });

  const path = `tramites/${doc.tramite_id}/${doc.clave}-${Date.now()}.pdf`;
  const { error } = await db.storage.from(BUCKET).upload(path, Buffer.from(await archivo.arrayBuffer()), { contentType: "application/pdf" });
  if (error) return NextResponse.json({ error: `No se pudo guardar: ${error.message}` }, { status: 500 });

  try {
    await registrarSubida(db, docId, { path, nombre: archivo.name }, "persona");
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  after(() => revisarDocumento(db, docId));
  return NextResponse.json({ ok: true });
}
