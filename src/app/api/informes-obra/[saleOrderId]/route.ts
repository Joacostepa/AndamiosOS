import { NextRequest, NextResponse } from "next/server";
import { fetchInforme, regenerarInforme } from "@/lib/informes-obra/servicio";
import { errorResponse, invalido, parseId, sesion, servicio } from "../_comun";

// GET  /api/informes-obra/:saleOrderId       → el informe vigente (o ?version=N)
// POST /api/informes-obra/:saleOrderId       → regenerar después de corregir datos
//
// La regeneración NUNCA PISA: crea `version = 2` y la 1 queda. Un informe que se puede
// reescribir no es evidencia de nada — y el sentido de congelarlo es poder decir cuánto
// costó la obra al cerrar, no cuánto costaría recalculada con la tarifa de hoy.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ saleOrderId: string }> }) {
  const id = parseId((await ctx.params).saleOrderId);
  if (!id) return invalido("Id de venta inválido");

  const versionRaw = req.nextUrl.searchParams.get("version");
  const version = versionRaw ? Number(versionRaw) : undefined;

  try {
    const { db } = await sesion();
    const res = await fetchInforme(db, id, version);
    if (!res) {
      return NextResponse.json({ error: "Esta obra no tiene informe generado" }, { status: 404 });
    }
    return NextResponse.json(res);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ saleOrderId: string }> }) {
  const id = parseId((await ctx.params).saleOrderId);
  if (!id) return invalido("Id de venta inválido");

  try {
    // El autor sale de la sesión, pero la escritura va con service role: la tabla no
    // tiene política de insert para `authenticated`.
    const { userId } = await sesion();
    const informe = await regenerarInforme(servicio(), id, userId);
    return NextResponse.json({ informe });
  } catch (e) {
    return errorResponse(e);
  }
}
