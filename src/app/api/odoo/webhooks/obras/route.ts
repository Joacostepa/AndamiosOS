import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchObraById, mapObraToApp, odooClientePartnerId } from "@/lib/odoo/obras";

// POST /api/odoo/webhooks/obras?secret=...
//
// Receptor del webhook de Odoo (Automated Action on_create_or_write sobre x_aba_obra).
// Odoo manda el/los id(s); re-leemos fresco desde Odoo y hacemos upsert por odoo_obra_id.
// El cliente se resuelve del espejo de clientes; sin cliente vinculable se omite. En el
// update NO se pisa `estado` (app-owned). AUTH: secret en el query string.

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Extrae ids del payload de Odoo de forma tolerante (objeto único, {id}, {ids}, lista).
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

async function resolveClienteId(partnerId: number | null): Promise<string | null> {
  if (!partnerId) return null;
  const { data } = await supabase
    .from("clientes").select("id").eq("odoo_partner_id", partnerId).maybeSingle();
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
      const obra = await fetchObraById(id);
      // Borrado en Odoo (x_aba_obra no tiene `active`) → no tocamos el espejo por seguridad de FK.
      if (!obra) {
        results.push({ id, action: "no_encontrada_en_odoo" });
        continue;
      }
      const clienteId = await resolveClienteId(odooClientePartnerId(obra));
      const values = mapObraToApp(obra, clienteId);
      if (!values) {
        results.push({ id, action: "omitida_sin_cliente" });
        continue;
      }
      const { data: existing } = await supabase
        .from("obras").select("id").eq("odoo_obra_id", id).maybeSingle();
      if (existing) {
        const refresh = { ...values, odoo_synced_at: now }; // estado app-owned → no se pisa
        delete (refresh as { estado?: unknown }).estado;
        await supabase.from("obras").update(refresh).eq("id", existing.id);
        results.push({ id, action: "actualizada" });
      } else {
        await supabase.from("obras").insert({ ...values, odoo_synced_at: now });
        results.push({ id, action: "insertada" });
      }
    }
    return NextResponse.json({ ok: true, results });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
