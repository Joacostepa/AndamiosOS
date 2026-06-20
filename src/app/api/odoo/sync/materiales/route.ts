import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchOdooGoods, buildReport, planSync, type PiezaRow } from "@/lib/odoo/products";

// POST /api/odoo/sync/materiales?mode=dry-run|apply
//
// Espejo de materiales desde Odoo (product.product, type=consu) → catalogo_piezas.
// - dry-run (default): NO escribe. Reporta cuántos entrarían y la distribución de categorías inferidas.
// - apply: inserta nuevos y refresca los ya vinculados (key = odoo_product_id).
//
// AUTH: server-to-server, header x-sync-secret (mismo patrón que /api/odoo/sync/clientes).

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function autorizado(req: NextRequest): boolean {
  const expected = process.env.ODOO_SYNC_SECRET;
  return !!expected && req.headers.get("x-sync-secret") === expected;
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const mode = req.nextUrl.searchParams.get("mode") ?? "dry-run";

  try {
    const odoo = await fetchOdooGoods();

    const cols = mode === "apply" ? "id, odoo_product_id" : "id";
    const { data, error } = await supabase.from("catalogo_piezas").select(cols);
    if (error) throw error;
    const app = (data ?? []) as unknown as PiezaRow[];

    const report = buildReport(odoo, app);

    if (mode !== "apply") {
      return NextResponse.json({ mode: "dry-run", report });
    }

    // ── apply ──
    const plan = planSync(odoo, app);
    const now = new Date().toISOString();

    let inserted = 0;
    if (plan.toInsert.length > 0) {
      const rows = plan.toInsert.map((v) => ({ ...v, odoo_synced_at: now }));
      const { error: ie } = await supabase.from("catalogo_piezas").insert(rows);
      if (ie) throw ie;
      inserted = rows.length;
    }

    let updated = 0;
    const CHUNK = 50;
    for (let i = 0; i < plan.toUpdate.length; i += CHUNK) {
      const chunk = plan.toUpdate.slice(i, i + CHUNK);
      const results = await Promise.all(
        chunk.map(({ id, values }) =>
          supabase.from("catalogo_piezas").update({ ...values, odoo_synced_at: now }).eq("id", id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
      updated += chunk.length;
    }

    return NextResponse.json({ mode: "apply", inserted, updated, report });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
