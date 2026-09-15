import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET } from "@/lib/permisos-via-publica/endosos";
import { registrarDocumentoCliente, tramiteDeToken } from "@/lib/permisos-via-publica/portal";

// POST /api/public/permiso/:token/documentos/:docId — el cliente sube un documento de su
// legajo, en los mismos dos pasos que el portal del productor:
//
//   { accion: "url" }                  → URL firmada para subir directo al bucket
//   { accion: "listo", path, nombre }  → se registra como "cargado"
//
// Acepta PDF o foto: un DNI se saca con el celular.

export const dynamic = "force-dynamic";

const EXTENSIONES = ["pdf", "jpg", "jpeg", "png", "heic", "webp"] as const;

const schema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("url"), extension: z.enum(EXTENSIONES) }),
  z.object({ accion: z.literal("listo"), path: z.string().min(1).max(300), nombre: z.string().trim().min(1).max(200) }),
]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(docId)) return NextResponse.json({ error: "Documento inválido" }, { status: 400 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Tiene que ser un PDF o una foto" }, { status: 400 });

  const db = createAdminClient();
  const t = await tramiteDeToken(db, token);
  if (!t) return NextResponse.json({ error: "El link no es válido" }, { status: 404 });

  const { data: doc } = await db.from("pvp_documentos").select("id, tramite_id, clave, origen").eq("id", docId).maybeSingle();
  // Sólo documentos del legajo de ESTE trámite.
  if (!doc || doc.tramite_id !== t.id || doc.origen !== "cliente") {
    return NextResponse.json({ error: "El documento no existe" }, { status: 404 });
  }
  const prefijo = `tramites/${t.id}/${doc.clave}-`;

  if (parsed.data.accion === "url") {
    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(`${prefijo}${Date.now()}.${parsed.data.extension}`);
    if (error || !data) return NextResponse.json({ error: error?.message ?? "No se pudo preparar la subida" }, { status: 500 });
    return NextResponse.json({ path: data.path, token: data.token });
  }

  if (!parsed.data.path.startsWith(prefijo)) return NextResponse.json({ error: "Archivo inválido" }, { status: 400 });
  try {
    await registrarDocumentoCliente(db, docId, { path: parsed.data.path, nombre: parsed.data.nombre });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
