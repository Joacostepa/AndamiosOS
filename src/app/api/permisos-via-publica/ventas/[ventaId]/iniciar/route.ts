import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { abrirTramiteDeVenta } from "@/lib/permisos-via-publica/portal";

// POST /api/permisos-via-publica/ventas/:ventaId/iniciar — el botón "Iniciar trámite": abre
// el trámite y le manda el link al cliente. Desde ahí el proceso sigue solo.
//
// Se espera el mail antes de responder (y no en after) para poder decirle en el momento a
// quien apretó si el link salió o hay que mandarlo por WhatsApp. El proxy exige "editar".

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MOTIVO: Record<string, string> = {
  no_existe: "La venta no existe en Odoo.",
  no_confirmada: "La venta no está confirmada.",
  no_lleva_permiso: "La venta no tiene \"Lleva permiso de implantación = Sí\".",
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ ventaId: string }> }) {
  const ventaId = Number((await ctx.params).ventaId);
  if (!Number.isInteger(ventaId) || ventaId <= 0) return NextResponse.json({ error: "Venta inválida" }, { status: 400 });

  const { data: { user } } = await (await createClient()).auth.getUser();
  try {
    const r = await abrirTramiteDeVenta(createAdminClient(), ventaId, { origen: req.nextUrl.origin, userId: user?.id ?? null, manual: true });
    if (!r.tramiteId) return NextResponse.json({ error: MOTIVO[r.resultado] ?? "No se pudo iniciar" }, { status: 400 });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
