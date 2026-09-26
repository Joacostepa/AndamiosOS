import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { esAdmin } from "@/lib/auth/acceso";
import { leerBorrador, leerConversacion, leerMensajes, type Accion } from "@/lib/asistente/datos";
import { historialParaPantalla } from "@/lib/asistente/vista";
import { vistaBorrador } from "@/lib/asistente/herramientas";
import { vistaAccion } from "@/lib/asistente/acciones";
import { errorResponse, exigirModulo, invalido } from "../../../_comun";

// GET   /api/comercial/asistente/conversaciones/:id — la charla para mostrar, el borrador, las
//       acciones y los PDFs.
// PATCH /api/comercial/asistente/conversaciones/:id — renombrar o archivar.

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return invalido("Id inválido");
  const quien = await exigirModulo("asistente-comercial", "ver");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    const conv = await leerConversacion(db, id);
    if (!conv || (conv.usuario_id !== quien.userId && !esAdmin(quien.acceso))) {
      return NextResponse.json({ error: "No existe esa conversación." }, { status: 404 });
    }
    const [mensajes, borrador, acciones, pdfs] = await Promise.all([
      leerMensajes(db, id),
      conv.borrador_id ? leerBorrador(db, conv.borrador_id) : Promise.resolve(null),
      db.from("asistente_acciones").select("*").eq("conversacion_id", id).order("created_at", { ascending: false }).limit(20),
      conv.borrador_id
        ? db.from("cotizacion_pdfs").select("id, nombre, tipo, storage_path, borrador_version, created_at").eq("borrador_id", conv.borrador_id).order("created_at", { ascending: false }).limit(5)
        : Promise.resolve({ data: [] as { id: string; nombre: string; tipo: string; storage_path: string; borrador_version: number; created_at: string }[] }),
    ]);
    const conUrl = await Promise.all(
      (pdfs.data ?? []).map(async (p) => {
        const { data } = await db.storage.from("comercial").createSignedUrl(p.storage_path, 3600, { download: p.nombre });
        return { id: p.id, nombre: p.nombre, tipo: p.tipo as "preview" | "final", url: data?.signedUrl ?? "", version: p.borrador_version };
      }),
    );
    return NextResponse.json({
      conversacion: { id: conv.id, titulo: conv.titulo, modelo: conv.modelo, propia: conv.usuario_id === quien.userId },
      items: historialParaPantalla(mensajes),
      borrador: borrador ? vistaBorrador(borrador) : null,
      acciones: ((acciones.data ?? []) as Accion[]).map(vistaAccion),
      pdfs: conUrl,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

const schema = z.object({ titulo: z.string().trim().min(1).max(120).optional(), archivar: z.boolean().optional() });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const quien = await exigirModulo("asistente-comercial", "editar");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    const conv = await leerConversacion(db, id);
    if (!conv || conv.usuario_id !== quien.userId) return NextResponse.json({ error: "No existe esa conversación." }, { status: 404 });
    await db.from("asistente_conversaciones").update({
      ...(parsed.data.titulo ? { titulo: parsed.data.titulo } : {}),
      ...(parsed.data.archivar ? { estado: "archivada" } : {}),
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
