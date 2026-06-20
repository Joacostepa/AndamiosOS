import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pushAdicionalToOdoo } from "@/lib/odoo/push-ot";

// POST /api/odoo/push/ordenes-trabajo  body: { id }
//
// Empuja una OT adicional (creada en la app) a Odoo. La OT ya está guardada en
// Supabase: este push es el paso de background; si falla, la OT queda con
// odoo_sync_estado='error' y se puede reintentar. NUNCA bloquea al operario.
// Ruta protegida por sesión (no está en publicPaths del middleware).

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  const { data: ot, error } = await supabase
    .from("ordenes_trabajo")
    .select("id, tipo, descripcion, observaciones, motivo_adicional, fecha_programada, obras(odoo_obra_id)")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!ot) return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });

  const obra = ot.obras as unknown as { odoo_obra_id: number | null } | null;
  const obraOdooId = obra?.odoo_obra_id;
  if (!obraOdooId) {
    await supabase.from("ordenes_trabajo")
      .update({ odoo_sync_estado: "error", odoo_sync_error: "La obra no está sincronizada con Odoo" })
      .eq("id", id);
    return NextResponse.json({ error: "La obra no tiene odoo_obra_id" }, { status: 409 });
  }

  try {
    const odooOtId = await pushAdicionalToOdoo({
      id: ot.id,
      tipo: ot.tipo,
      descripcion: ot.descripcion,
      observaciones: ot.observaciones,
      motivo_adicional: ot.motivo_adicional,
      fecha_programada: ot.fecha_programada,
      obra_odoo_id: Number(obraOdooId),
    });
    await supabase.from("ordenes_trabajo")
      .update({ odoo_ot_id: odooOtId, odoo_sync_estado: "sincronizado", odoo_sync_error: null })
      .eq("id", id);
    return NextResponse.json({ ok: true, odoo_ot_id: odooOtId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("ordenes_trabajo")
      .update({ odoo_sync_estado: "error", odoo_sync_error: msg })
      .eq("id", id);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
