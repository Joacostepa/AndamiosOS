import { NextRequest, NextResponse } from "next/server";
import { fetchOrdenDetalle } from "@/lib/odoo/ordenes";
import { OdooError } from "@/lib/odoo/client";

// GET /api/ordenes-trabajo/:id — la ficha.

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const otId = Number(id);
  if (!Number.isInteger(otId) || otId <= 0) {
    return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  }
  try {
    const orden = await fetchOrdenDetalle(otId);
    if (!orden) return NextResponse.json({ error: "La orden no existe" }, { status: 404 });
    return NextResponse.json({ orden });
  } catch (e) {
    const msg = e instanceof OdooError ? e.message : e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
