import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { esAdmin } from "@/lib/auth/acceso";
import { urlDePdf } from "@/lib/asistente/pdf";
import { errorResponse, exigirModulo, invalido } from "../../../_comun";

// GET /api/comercial/asistente/pdfs/:id — link firmado (1 h) para ver, descargar o compartir.

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return invalido("Id inválido");
  const quien = await exigirModulo("asistente-comercial", "ver");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    const { data } = await db.from("cotizacion_pdfs").select("borrador:cotizacion_borradores(usuario_id)").eq("id", id).maybeSingle();
    const dueno = (data?.borrador as unknown as { usuario_id: string } | null)?.usuario_id;
    if (!dueno || (dueno !== quien.userId && !esAdmin(quien.acceso))) return NextResponse.json({ error: "No existe ese PDF." }, { status: 404 });
    const r = await urlDePdf(db, id);
    return r ? NextResponse.json(r) : NextResponse.json({ error: "No se encontró el archivo." }, { status: 404 });
  } catch (e) {
    return errorResponse(e);
  }
}
