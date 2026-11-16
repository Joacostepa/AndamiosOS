import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { nombresDe } from "@/lib/clientes/bandeja";
import { cambiarPareja } from "@/lib/clientes/aprobar";
import { errorResponse, exigirModulo, invalido } from "../../../../_comun";

// POST /api/comercial/clientes/conversaciones/:id/pareja — { tecnico, asistente, avisar }:
// asignar o cambiar la pareja de la charla después de la tarjeta (JS, 16/11). Ver cambiarPareja.

export const dynamic = "force-dynamic";

const schema = z.object({
  tecnico: z.string().nullable(),
  asistente: z.string().nullable(),
  avisar: z.boolean(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return invalido("Id inválido");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const quien = await exigirModulo("clientes-whatsapp", "editar");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    const yo = { id: quien.userId, nombre: (await nombresDe(db, [quien.userId])).get(quien.userId) ?? "Alguien" };
    const r = await cambiarPareja(db, id, yo, { tecnico: parsed.data.tecnico, asistente: parsed.data.asistente }, parsed.data.avisar);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
    return NextResponse.json(r);
  } catch (e) {
    return errorResponse(e);
  }
}
