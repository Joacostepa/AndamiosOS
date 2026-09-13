import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PosponerInvalido, posponer, reactivar } from "@/lib/habilitaciones/servicio";
import { errorResponse, invalido, parseOtId, sesion } from "../../_comun";

// POST /api/habilitaciones/:otId/posponer — sacar la obra de la cola hasta una fecha, o
// traerla de vuelta (`hasta: null`).
//
// No toca Odoo: posponer es una decisión de cuándo trabajar el trámite, no un estado de
// la habilitación. El semáforo y el candado del tablero siguen igual.

export const dynamic = "force-dynamic";

const schema = z.object({
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").nullable(),
  motivo: z.string().trim().max(500).nullable().optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ otId: string }> }) {
  const otId = parseOtId((await ctx.params).otId);
  if (!otId) return invalido("Id de OT inválido");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error.issues.map((i) => i.message).join(" · "));

  try {
    const { db, userId } = await sesion();
    if (parsed.data.hasta === null) {
      await reactivar(db, otId, userId);
      return NextResponse.json({ ok: true, hasta: null });
    }
    const { hasta } = await posponer(db, otId, {
      hasta: parsed.data.hasta,
      motivo: parsed.data.motivo?.trim() || null,
      autorId: userId,
    });
    return NextResponse.json({ ok: true, hasta });
  } catch (e) {
    if (e instanceof PosponerInvalido) return invalido(e.message);
    return errorResponse(e);
  }
}
