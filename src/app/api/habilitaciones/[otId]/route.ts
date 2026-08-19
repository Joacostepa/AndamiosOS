import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchFicha } from "@/lib/habilitaciones/servicio";
import { errorResponse, invalido, parseOtId, sesion, sincronizarLuego } from "../_comun";

// GET   /api/habilitaciones/:otId — la ficha: los dos trámites, requisitos, notas e historial.
// PATCH /api/habilitaciones/:otId — el vencimiento de la habilitación.
//
// El vencimiento es el único input de Odoo que no se deriva de los requisitos: lo pone
// Agustina cuando el cliente le dice hasta cuándo vale la documentación. Odoo se encarga
// del resto — pasada la fecha computa el semáforo `vencida` y la etapa `e` solo.

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ otId: string }> }) {
  const otId = parseOtId((await ctx.params).otId);
  if (!otId) return invalido("Id de OT inválido");

  try {
    const { db } = await sesion();
    const ficha = await fetchFicha(db, otId);
    if (!ficha) return NextResponse.json({ error: "La OT no existe en Odoo" }, { status: 404 });
    return NextResponse.json({ ficha });
  } catch (e) {
    return errorResponse(e);
  }
}

const schema = z.object({
  vencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ otId: string }> }) {
  const otId = parseOtId((await ctx.params).otId);
  if (!otId) return invalido("Id de OT inválido");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido("Fecha de vencimiento inválida");

  try {
    const { db } = await sesion();
    const { error } = await db
      .from("hab_ots")
      .update({ hab_vencimiento: parsed.data.vencimiento, sync_estado: "pendiente" })
      .eq("odoo_ot_id", otId);
    if (error) throw new Error(error.message);
    sincronizarLuego(db, otId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
