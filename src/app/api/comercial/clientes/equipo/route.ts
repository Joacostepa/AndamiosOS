import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { equipoBandeja } from "@/lib/clientes/bandeja";
import { parejasValidas } from "@/lib/clientes/aprobar";
import { errorResponse, exigirModulo } from "../../_comun";

// GET /api/comercial/clientes/equipo — para «Asignar» en la charla (JS, 16/11): la gente a la
// que se le puede pasar una charla (la bandeja en «editar») y las parejas que se pueden elegir.

export const dynamic = "force-dynamic";

export async function GET() {
  const quien = await exigirModulo("clientes-whatsapp", "editar");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    return NextResponse.json({ personas: await equipoBandeja(db), parejas: parejasValidas() });
  } catch (e) {
    return errorResponse(e);
  }
}
