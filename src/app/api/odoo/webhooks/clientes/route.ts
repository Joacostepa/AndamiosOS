import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchPartnerById, mapPartnerToCliente } from "@/lib/odoo/partners";

// POST /api/odoo/webhooks/clientes?secret=...
//
// Receptor del webhook saliente de Odoo (Automated Action on_create_or_write/on_unlink
// sobre res.partner). Odoo manda el/los id(s) del registro que cambió; acá lo re-leemos
// fresco desde Odoo y hacemos upsert en el espejo `clientes`.
//
// AUTH: el webhook de Odoo no manda headers custom → el secret va en el query string.

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Extrae ids del payload de Odoo de forma tolerante (objeto único, {id}, {ids}, lista).
function extractIds(body: unknown): number[] {
  const pick = (r: unknown) =>
    Number((r as { id?: unknown })?.id ?? r) || 0;
  if (Array.isArray(body)) return body.map(pick).filter(Boolean);
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (Array.isArray(b.records)) return b.records.map(pick).filter(Boolean);
    if (Array.isArray(b.ids)) return b.ids.map((x) => Number(x)).filter(Boolean);
    const id = Number(b.id ?? b._id ?? b.record_id) || 0;
    return id ? [id] : [];
  }
  return [];
}

export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get("secret") !== process.env.ODOO_SYNC_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const ids = extractIds(body);
  if (ids.length === 0) {
    return NextResponse.json({ error: "Sin id en el payload" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const results: Array<{ id: number; action: string }> = [];

  try {
    for (const id of ids) {
      const partner = await fetchPartnerById(id);
      // Borrado o archivado en Odoo → marcamos inactivo el espejo (no borramos por FK).
      if (!partner || !partner.active) {
        await supabase
          .from("clientes")
          .update({ estado: "inactivo", odoo_synced_at: now })
          .eq("odoo_partner_id", id);
        results.push({ id, action: "archivado" });
        continue;
      }
      const values = mapPartnerToCliente(partner);
      const { data: existing } = await supabase
        .from("clientes")
        .select("id")
        .eq("odoo_partner_id", id)
        .maybeSingle();
      if (existing) {
        await supabase.from("clientes").update({ ...values, odoo_synced_at: now }).eq("id", existing.id);
        results.push({ id, action: "actualizado" });
      } else {
        await supabase.from("clientes").insert({ ...values, odoo_synced_at: now });
        results.push({ id, action: "insertado" });
      }
    }
    return NextResponse.json({ ok: true, results });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
