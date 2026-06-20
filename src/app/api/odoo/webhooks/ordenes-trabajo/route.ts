import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchOTById, mapOTToApp, odooOTObraId } from "@/lib/odoo/ordenes-trabajo";

// POST /api/odoo/webhooks/ordenes-trabajo?secret=...
//
// Receptor del webhook de Odoo (Automated Action on_create_or_write sobre x_aba_orden_trabajo).
// Odoo manda el/los id(s); re-leemos fresco y hacemos upsert por odoo_ot_id. La obra se
// resuelve del espejo de obras; si la Obra no está espejada aún, se omite (Obras sincroniza
// primero). En el update NO se pisa `estado` ni la habilitación (app-owned). AUTH: secret en query.

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function extractIds(body: unknown): number[] {
  const pick = (r: unknown) => Number((r as { id?: unknown })?.id ?? r) || 0;
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

async function resolveObraId(obraOdooId: number | null): Promise<string | null> {
  if (!obraOdooId) return null;
  const { data } = await supabase
    .from("obras").select("id").eq("odoo_obra_id", obraOdooId).maybeSingle();
  return (data?.id as string) ?? null;
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
      const ot = await fetchOTById(id);
      if (!ot) {
        results.push({ id, action: "no_encontrada_en_odoo" });
        continue;
      }
      const obraId = await resolveObraId(odooOTObraId(ot));
      const values = mapOTToApp(ot, obraId);
      if (!values) {
        results.push({ id, action: "omitida_sin_obra" });
        continue;
      }
      // Buscar la OT en la app por odoo_ot_id; si no, por x_andamios_id (echo de una
      // adicional creada en la app que aún no tenía odoo_ot_id) → evita duplicar.
      let existing = (await supabase
        .from("ordenes_trabajo").select("id").eq("odoo_ot_id", id).maybeSingle()).data;
      if (!existing && ot.x_andamios_id) {
        existing = (await supabase
          .from("ordenes_trabajo").select("id").eq("id", ot.x_andamios_id).maybeSingle()).data;
      }
      if (existing) {
        const refresh = { ...values, odoo_synced_at: now }; // estado/habilitación app-owned → no se pisan
        delete (refresh as { estado?: unknown }).estado;
        await supabase.from("ordenes_trabajo").update(refresh).eq("id", existing.id);
        results.push({ id, action: "actualizada" });
      } else {
        await supabase.from("ordenes_trabajo").insert({ ...values, odoo_synced_at: now });
        results.push({ id, action: "insertada" });
      }
    }
    return NextResponse.json({ ok: true, results });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
