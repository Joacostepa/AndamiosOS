import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { tarjetasDeCharla } from "@/lib/clientes/aprobar";
import { iaClientesActiva } from "@/lib/clientes/interruptor";
import { errorResponse, exigirModulo, invalido } from "../../../../_comun";

// GET /api/comercial/clientes/conversaciones/:id/aprobaciones — las tarjetas de aprobación de
// la charla (paso 6, docs/clientes/crm-propuesta.md §7): lo que espera el OK de una persona y lo
// que quedó a medio camino (guardando, con error o «falta la plantilla»), con el precio
// recalculado con las tarifas de hoy, el mensaje exacto para el cliente y la racha de la etapa 2.

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return invalido("Id inválido");
  const quien = await exigirModulo("clientes-whatsapp", "ver");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    return NextResponse.json(await tarjetasDeCharla(db, id, await iaClientesActiva(db)));
  } catch (e) {
    return errorResponse(e);
  }
}
