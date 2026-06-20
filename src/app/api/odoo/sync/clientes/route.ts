import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchOdooCustomers, reconcile, planSync, type ClienteRow } from "@/lib/odoo/partners";

// POST /api/odoo/sync/clientes?mode=dry-run|apply
//
// Sincroniza el espejo de clientes desde Odoo (res.partner, customer_rank > 0).
// - mode=dry-run (default): NO escribe. Devuelve el reporte de reconciliación por CUIT.
// - mode=apply: inserta nuevos y vincula/refresca matches (requiere la migración aplicada).
//
// AUTENTICACIÓN: endpoint server-to-server, protegido por el header `x-sync-secret`
// (no por sesión de usuario). Por eso está en publicPaths del middleware pero validado acá.
// Usa service_role para escribir saltando RLS, igual que /api/fichadas.

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
    const odoo = await fetchOdooCustomers();

    // En dry-run no asumimos la columna odoo_partner_id (puede correr antes de la migración).
    const cols = mode === "apply" ? "id, razon_social, cuit, odoo_partner_id" : "id, razon_social, cuit";
    const { data, error } = await supabase.from("clientes").select(cols);
    if (error) throw error;
    const app = (data ?? []) as unknown as ClienteRow[];

    const report = reconcile(odoo, app);

    if (mode !== "apply") {
      return NextResponse.json({ mode: "dry-run", report });
    }

    // ── modo apply ──
    const plan = planSync(odoo, app);
    const now = new Date().toISOString();

    let inserted = 0;
    if (plan.toInsert.length > 0) {
      const rows = plan.toInsert.map((v) => ({ ...v, odoo_synced_at: now }));
      const { error: ie } = await supabase.from("clientes").insert(rows);
      if (ie) throw ie;
      inserted = rows.length;
    }

    let updated = 0;
    const CHUNK = 50;
    for (let i = 0; i < plan.toUpdate.length; i += CHUNK) {
      const chunk = plan.toUpdate.slice(i, i + CHUNK);
      const results = await Promise.all(
        chunk.map(({ id, values }) =>
          supabase.from("clientes").update({ ...values, odoo_synced_at: now }).eq("id", id),
        ),
      );
      const failed = results.find((res) => res.error);
      if (failed?.error) throw failed.error;
      updated += chunk.length;
    }

    return NextResponse.json({
      mode: "apply", inserted, updated,
      sin_cuit_insertados: plan.sin_cuit_insertados,
      ambiguos_omitidos: plan.ambiguos_omitidos,
      report,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
