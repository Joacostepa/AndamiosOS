import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listarConversaciones } from "@/lib/asistente/datos";
import { abrirConversacion } from "@/lib/asistente/nueva-conversacion";
import { errorResponse, exigirModulo } from "../../_comun";

// GET  /api/comercial/asistente/conversaciones — las mías, lo último primero.
// POST /api/comercial/asistente/conversaciones — una nueva, con el prompt congelado al día de hoy.

export const dynamic = "force-dynamic";

export async function GET() {
  const quien = await exigirModulo("asistente-comercial", "ver");
  if (quien instanceof NextResponse) return quien;
  try {
    return NextResponse.json({ conversaciones: await listarConversaciones(createAdminClient(), quien.userId) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST() {
  const quien = await exigirModulo("asistente-comercial", "editar");
  if (quien instanceof NextResponse) return quien;
  try {
    const conv = await abrirConversacion(createAdminClient(), quien.userId);
    return NextResponse.json({ conversacion: { id: conv.id } });
  } catch (e) {
    return errorResponse(e);
  }
}
