import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esAdmin } from "@/lib/auth/acceso";
import { auditoria } from "@/lib/clientes/aprobar";
import { errorResponse, exigirModulo } from "../../_comun";

// GET /api/comercial/clientes/revisar — «Revisar charlas», el auditor (§7, sólo admin): las
// aprobaciones decididas con lo propuesto contra lo enviado, las charlas donde intervino una
// persona y la racha de la etapa 2 (20 seguidos sin cambios de importe, metros o piezas).

export const dynamic = "force-dynamic";

export async function GET() {
  const quien = await exigirModulo("clientes-whatsapp", "ver");
  if (quien instanceof NextResponse) return quien;
  if (!esAdmin(quien.acceso)) return NextResponse.json({ error: "«Revisar charlas» es sólo para administradores." }, { status: 403 });
  try {
    return NextResponse.json(await auditoria(createAdminClient()));
  } catch (e) {
    return errorResponse(e);
  }
}
