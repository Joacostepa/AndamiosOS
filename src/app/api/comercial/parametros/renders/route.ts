import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { TIPOS_RENDER, type Render } from "@/lib/parametros-cotizacion/tipos";
import { db, errorResponse, exigirModulo, invalido } from "../../_comun";

// GET    /api/comercial/parametros/renders — la biblioteca, con URLs firmadas para verla.
// POST   { accion: "subir", extension } — URL firmada para subir la imagen directo a Storage.
// POST   { accion: "registrar", tipo, nombre, path, por_defecto } — darla de alta.
// PATCH  { id } — marcarla como la de por defecto de su tipo.
// DELETE ?id= — borrarla (la fila y el archivo).
//
// La imagen viaja directo del navegador a Storage: el proxy corta cuerpos de más de 10 MB y
// Vercel de más de 4,5 MB, y un render bueno los pasa.

export const dynamic = "force-dynamic";

const BUCKET = "comercial";
const PREFIJO = "renders/";

export async function GET() {
  try {
    const cliente = await db();
    const { data, error } = await cliente
      .from("cotizacion_renders")
      .select("id, tipo, nombre, path, por_defecto")
      .order("tipo")
      .order("created_at");
    if (error) throw error;
    const filas = data ?? [];
    let urls: Record<string, string> = {};
    if (filas.length) {
      const { data: firmadas } = await createAdminClient()
        .storage.from(BUCKET)
        .createSignedUrls(filas.map((r) => r.path), 3600);
      urls = Object.fromEntries((firmadas ?? []).filter((f) => f.signedUrl).map((f) => [f.path, f.signedUrl]));
    }
    const renders: Render[] = filas.map((r) => ({ ...r, url: urls[r.path] ?? null }));
    return NextResponse.json({ renders });
  } catch (e) {
    return errorResponse(e);
  }
}

const tipos = Object.keys(TIPOS_RENDER) as [keyof typeof TIPOS_RENDER, ...(keyof typeof TIPOS_RENDER)[]];

const schema = z.discriminatedUnion("accion", [
  // Sólo PNG y JPG: son los que el PDF de la propuesta sabe dibujar.
  z.object({ accion: z.literal("subir"), extension: z.enum(["png", "jpg", "jpeg"]) }),
  z.object({
    accion: z.literal("registrar"),
    tipo: z.enum(tipos),
    nombre: z.string().trim().min(2).max(120),
    path: z.string().startsWith(PREFIJO).max(300),
    por_defecto: z.boolean(),
  }),
]);

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const quien = await exigirModulo("parametros-cotizacion", "editar");
  if (quien instanceof NextResponse) return quien;
  try {
    if (parsed.data.accion === "subir") {
      const path = `${PREFIJO}${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${parsed.data.extension}`;
      const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) throw error;
      return NextResponse.json({ path: data.path, token: data.token });
    }
    const { tipo, nombre, path, por_defecto } = parsed.data;
    const { data, error } = await (await db()).rpc("cotizacion_render_guardar", {
      p_tipo: tipo, p_nombre: nombre, p_path: path, p_por_defecto: por_defecto,
    });
    if (error) throw error;
    return NextResponse.json({ id: data });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  try {
    const { error } = await (await db()).rpc("cotizacion_render_por_defecto", { p_id: parsed.data.id });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) return invalido("Id inválido");
  const quien = await exigirModulo("parametros-cotizacion", "editar");
  if (quien instanceof NextResponse) return quien;
  try {
    const { data: path, error } = await (await db()).rpc("cotizacion_render_borrar", { p_id: id });
    if (error) throw error;
    // El archivo se borra después de la fila: si esto falla queda un huérfano en Storage,
    // que no molesta; al revés quedaría una fila apuntando a nada.
    if (typeof path === "string" && path) await createAdminClient().storage.from(BUCKET).remove([path]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
