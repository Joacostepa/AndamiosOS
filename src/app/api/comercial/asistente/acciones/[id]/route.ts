import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerAccion } from "@/lib/asistente/datos";
import { exigirModulo, invalido } from "../../../_comun";
import { respuestaDeTurno } from "../../_stream";

// POST /api/comercial/asistente/acciones/:id — el botón Confirmar / Descartar de la tarjeta.
// Ejecuta (o descarta) y el asistente sigue la charla con el resultado, en SSE.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const schema = z.object({ decision: z.enum(["confirmar", "rechazar"]) });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return invalido("Id inválido");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const quien = await exigirModulo("asistente-comercial", "editar");
  if (quien instanceof NextResponse) return quien;

  const db = createAdminClient();
  const accion = await leerAccion(db, id);
  if (!accion || accion.usuario_id !== quien.userId) return NextResponse.json({ error: "No existe esa acción." }, { status: 404 });

  return respuestaDeTurno(req, {
    db,
    conversacionId: accion.conversacion_id,
    usuarioId: quien.userId,
    entrada: { tipo: "boton", accionId: id, decision: parsed.data.decision, canal: "web" },
  });
}
