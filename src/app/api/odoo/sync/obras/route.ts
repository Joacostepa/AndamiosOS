import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchOdooObras, mapObraToApp, odooClientePartnerId } from "@/lib/odoo/obras";

// POST /api/odoo/sync/obras?mode=dry-run|apply
//
// Importación inicial / reconciliación del espejo de Obras desde Odoo (x_aba_obra).
// - mode=dry-run (default): NO escribe. Reporta cuántas se insertarían/actualizarían/omitirían.
// - mode=apply: inserta nuevas y refresca las ya vinculadas (por odoo_obra_id).
//
// El FK cliente_id se resuelve contra el espejo de clientes (odoo_partner_id → clientes.id).
// Una Obra sin cliente vinculable se OMITE (cliente_id es NOT NULL). En el update NO se
// pisa `estado` (lo gobierna la app). AUTH server-to-server por header x-sync-secret.

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
    const odoo = await fetchOdooObras();

    // Mapas de resolución desde los espejos ya existentes.
    const { data: clientes, error: ce } = await supabase
      .from("clientes").select("id, odoo_partner_id").not("odoo_partner_id", "is", null);
    if (ce) throw ce;
    const clienteByOdoo = new Map<number, string>();
    for (const c of clientes ?? []) clienteByOdoo.set(Number(c.odoo_partner_id), c.id as string);

    const { data: obras, error: oe } = await supabase
      .from("obras").select("id, odoo_obra_id").not("odoo_obra_id", "is", null);
    if (oe) throw oe;
    const obraByOdoo = new Map<number, string>();
    for (const o of obras ?? []) obraByOdoo.set(Number(o.odoo_obra_id), o.id as string);

    const toInsert: ReturnType<typeof mapObraToApp>[] = [];
    const toUpdate: Array<{ id: string; values: NonNullable<ReturnType<typeof mapObraToApp>> }> = [];
    const omitidos: Array<{ odoo_id: number; motivo: string }> = [];

    for (const o of odoo) {
      const partnerId = odooClientePartnerId(o);
      const clienteId = partnerId ? clienteByOdoo.get(partnerId) ?? null : null;
      const values = mapObraToApp(o, clienteId);
      if (!values) {
        omitidos.push({ odoo_id: o.id, motivo: partnerId ? "cliente no espejado" : "sin cliente en Odoo" });
        continue;
      }
      const existingId = obraByOdoo.get(o.id);
      if (existingId) toUpdate.push({ id: existingId, values });
      else toInsert.push(values);
    }

    const report = {
      odoo_obras: odoo.length,
      a_insertar: toInsert.length,
      a_actualizar: toUpdate.length,
      omitidos_sin_cliente: omitidos.length,
      omitidos_sample: omitidos.slice(0, 8),
    };

    if (mode !== "apply") {
      return NextResponse.json({ mode: "dry-run", report });
    }

    const now = new Date().toISOString();
    let inserted = 0;
    if (toInsert.length > 0) {
      const rows = toInsert.map((v) => ({ ...v!, odoo_synced_at: now }));
      const { error: ie } = await supabase.from("obras").insert(rows);
      if (ie) throw ie;
      inserted = rows.length;
    }

    let updated = 0;
    const CHUNK = 50;
    for (let i = 0; i < toUpdate.length; i += CHUNK) {
      const chunk = toUpdate.slice(i, i + CHUNK);
      const results = await Promise.all(
        chunk.map(({ id, values }) => {
          // NO pisamos `estado` (app-owned). Refrescamos solo datos comerciales/identidad.
          const refresh = { ...values, odoo_synced_at: now };
          delete (refresh as { estado?: unknown }).estado;
          return supabase.from("obras").update(refresh).eq("id", id);
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
