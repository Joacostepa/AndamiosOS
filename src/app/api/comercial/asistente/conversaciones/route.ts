import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esAdmin } from "@/lib/auth/acceso";
import { buscarConversaciones, listarConversaciones } from "@/lib/asistente/datos";
import { abrirConversacion } from "@/lib/asistente/nueva-conversacion";
import { errorResponse, exigirModulo } from "../../_comun";

// GET  /api/comercial/asistente/conversaciones — las mías, lo último primero.
//      ?q=texto — buscar (también en los mensajes y en las archivadas). Un admin busca en las
//      de todos.
// POST /api/comercial/asistente/conversaciones — una nueva, con el prompt congelado al día de hoy.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const quien = await exigirModulo("asistente-comercial", "ver");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    const q = req.nextUrl.searchParams.get("q")?.trim().slice(0, 100) ?? "";
    const conversaciones = q.length >= 2
      ? await buscarConversaciones(db, quien.userId, q, esAdmin(quien.acceso))
      : await listarConversaciones(db, quien.userId);
    return NextResponse.json({ conversaciones });
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
