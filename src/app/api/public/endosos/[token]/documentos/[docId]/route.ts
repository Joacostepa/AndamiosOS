import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET, productorDeToken, registrarSubida, revisarDocumento } from "@/lib/permisos-via-publica/endosos";

// POST /api/public/endosos/:token/documentos/:docId
//
// La subida de una póliza desde el portal del productor, en dos pasos:
//
//   { accion: "url" }                   → URL firmada para subir el PDF directo al bucket
//   { accion: "listo", path, nombre }   → se registra y se revisa
//
// POR QUÉ DIRECTO AL BUCKET: una póliza escaneada supera fácil los 4,5 MB que acepta el
// cuerpo de una función de Vercel. El archivo nunca pasa por acá.
//
// La revisión con IA tarda (~1 min) y corre DESPUÉS de responder (after): la página del
// productor muestra "Revisando…" y consulta hasta que termina.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const schema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("url") }),
  z.object({ accion: z.literal("listo"), path: z.string().min(1).max(300), nombre: z.string().trim().min(1).max(200) }),
]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(docId)) return NextResponse.json({ error: "Documento inválido" }, { status: 400 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });

  const db = createAdminClient();
  if (!(await productorDeToken(db, token))) {
    return NextResponse.json({ error: "El link no es válido o ya no está activo" }, { status: 404 });
  }

  const { data: doc } = await db.from("pvp_documentos").select("id, tramite_id, clave, estado").eq("id", docId).maybeSingle();
  // El productor sólo sube pólizas, y sólo las que se le pidieron.
  if (!doc || doc.clave !== "poliza_rc" || doc.estado === "falta") {
    return NextResponse.json({ error: "Este endoso no está pedido" }, { status: 404 });
  }
  const prefijo = `tramites/${doc.tramite_id}/poliza_rc-`;

  if (parsed.data.accion === "url") {
    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(`${prefijo}${Date.now()}.pdf`);
    if (error || !data) return NextResponse.json({ error: error?.message ?? "No se pudo preparar la subida" }, { status: 500 });
    return NextResponse.json({ path: data.path, token: data.token });
  }

  const { path, nombre } = parsed.data;
  if (!path.startsWith(prefijo)) return NextResponse.json({ error: "Archivo inválido" }, { status: 400 });
  try {
    await registrarSubida(db, docId, { path, nombre }, "productor");
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  after(() => revisarDocumento(db, docId));
  return NextResponse.json({ ok: true });
}
