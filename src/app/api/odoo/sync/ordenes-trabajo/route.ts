import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchOdooOTs, mapOTToApp, odooOTObraId } from "@/lib/odoo/ordenes-trabajo";

// POST /api/odoo/sync/ordenes-trabajo?mode=dry-run|apply
//
// Importación inicial / reconciliación del espejo de OTs desde Odoo (x_aba_orden_trabajo).
// El FK obra_id se resuelve contra el espejo de obras (odoo_obra_id → obras.id). Una OT
// cuya Obra todavía no está espejada se OMITE (sincronizar Obras primero). En el update
// NO se pisa `estado` ni la habilitación (app-owned). AUTH por header x-sync-secret.

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
    const odoo = await fetchOdooOTs();

    const { data: obras, error: oe } = await supabase
      .from("obras").select("id, odoo_obra_id").not("odoo_obra_id", "is", null);
    if (oe) throw oe;
    const obraByOdoo = new Map<number, string>();
    for (const o of obras ?? []) obraByOdoo.set(Number(o.odoo_obra_id), o.id as string);

    const { data: ots, error: te } = await supabase
      .from("ordenes_trabajo").select("id, odoo_ot_id").not("odoo_ot_id", "is", null);
    if (te) throw te;
    const otByOdoo = new Map<number, string>();
    for (const t of ots ?? []) otByOdoo.set(Number(t.odoo_ot_id), t.id as string);

    const toInsert: ReturnType<typeof mapOTToApp>[] = [];
    const toUpdate: Array<{ id: string; values: NonNullable<ReturnType<typeof mapOTToApp>> }> = [];
    const omitidos: Array<{ odoo_id: number; motivo: string }> = [];

    for (const ot of odoo) {
      const obraOdooId = odooOTObraId(ot);
      const obraId = obraOdooId ? obraByOdoo.get(obraOdooId) ?? null : null;
      const values = mapOTToApp(ot, obraId);
      if (!values) {
        omitidos.push({ odoo_id: ot.id, motivo: obraOdooId ? "obra no espejada" : "sin obra en Odoo" });
        continue;
      }
      const existingId = otByOdoo.get(ot.id);
      if (existingId) toUpdate.push({ id: existingId, values });
      else toInsert.push(values);
    }

    const report = {
      odoo_ots: odoo.length,
      a_insertar: toInsert.length,
      a_actualizar: toUpdate.length,
      omitidos_sin_obra: omitidos.length,
      omitidos_sample: omitidos.slice(0, 8),
    };

    if (mode !== "apply") {
      return NextResponse.json({ mode: "dry-run", report });
    }

    const now = new Date().toISOString();
    let inserted = 0;
    if (toInsert.length > 0) {
      const rows = toInsert.map((v) => ({ ...v!, odoo_synced_at: now }));
      const { error: ie } = await supabase.from("ordenes_trabajo").insert(rows);
      if (ie) throw ie;
      inserted = rows.length;
    }

    let updated = 0;
    const CHUNK = 50;
    for (let i = 0; i < toUpdate.length; i += CHUNK) {
      const chunk = toUpdate.slice(i, i + CHUNK);
      const results = await Promise.all(
        chunk.map(({ id, values }) => {
          // NO pisamos `estado` ni la habilitación (app-owned).
          const refresh = { ...values, odoo_synced_at: now };
          delete (refresh as { estado?: unknown }).estado;
          return supabase.from("ordenes_trabajo").update(refresh).eq("id", id);
        }),
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
