import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchObraById, mapObraToApp, odooClientePartnerId } from "@/lib/odoo/obras";

// POST /api/odoo/webhooks/obras?secret=...
//
// Receptor del webhook de Odoo (Automated Action on_create_or_write sobre x_aba_obra).
// Odoo manda el/los id(s); re-leemos fresco desde Odoo y hacemos upsert por odoo_obra_id.
// El cliente se resuelve del espejo de clientes; sin cliente vinculable se omite. En el
// update NO se pisa `estado` (app-owned). AUTH: secret en el query string.
//
// RENDIMIENTO: el webhook corre DENTRO de la transacción que guarda la obra en Odoo, así
// que todo lo que tarde acá lo espera el usuario. Se contesta al validar el secret y el
// espejado va en `after()` (waitUntil). Ver el webhook de órdenes de trabajo.

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

/** El espejado propiamente dicho. Corre fuera del camino crítico del guardado en Odoo. */
async function espejar(id: number): Promise<string> {
  const now = new Date().toISOString();
  const obra = await fetchObraById(id);
  // Borrado en Odoo (x_aba_obra no tiene `active`) → no tocamos el espejo por seguridad de FK.
  if (!obra) return "no_encontrada_en_odoo";

  const clienteId = await resolveClienteId(odooClientePartnerId(obra));
  const values = mapObraToApp(obra, clienteId);
  if (!values) return "omitida_sin_cliente";

  const { data: existing } = await supabase
    .from("obras").select("id").eq("odoo_obra_id", id).maybeSingle();
  if (existing) {
    const refresh = { ...values, odoo_synced_at: now }; // estado app-owned → no se pisa
    delete (refresh as { estado?: unknown }).estado;
    await supabase.from("obras").update(refresh).eq("id", existing.id);
    return "actualizada";
  }
  await supabase.from("obras").insert({ ...values, odoo_synced_at: now });
  return "insertada";
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

  after(async () => {
    for (const id of ids) {
      try {
        console.log(`[webhook obra ${id}] ${await espejar(id)}`);
      } catch (e) {
        console.error(`[webhook obra ${id}] falló el espejado`, e);
      }
    }
  });

  return NextResponse.json({ ok: true, encolados: ids }, { status: 202 });
}
