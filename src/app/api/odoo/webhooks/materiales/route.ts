import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchProductById, mapProductToPieza } from "@/lib/odoo/products";

// POST /api/odoo/webhooks/materiales?secret=...
//
// Receptor del webhook saliente de Odoo (Automated Action sobre product.product).
// Re-lee el producto fresco desde Odoo y hace upsert en el espejo `catalogo_piezas`.
//
// RENDIMIENTO: el webhook corre DENTRO de la transacción que guarda el producto en Odoo,
// así que todo lo que tarde acá lo espera el usuario. Se contesta al validar el secret y
// el espejado va en `after()` (waitUntil). Ver el webhook de órdenes de trabajo.

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
        console.log(`[webhook material ${id}] ${await espejar(id)}`);
      } catch (e) {
        console.error(`[webhook material ${id}] falló el espejado`, e);
      }
    }
  });

  return NextResponse.json({ ok: true, encolados: ids }, { status: 202 });
}

/** El espejado propiamente dicho. Corre fuera del camino crítico del guardado en Odoo. */
async function espejar(id: number): Promise<string> {
  const now = new Date().toISOString();
  const product = await fetchProductById(id);
  if (!product || !product.active) {
    await supabase
      .from("catalogo_piezas")
      .update({ activo: false, odoo_synced_at: now })
      .eq("odoo_product_id", id);
    return "archivado";
  }

  const values = mapProductToPieza(product);
  const { data: existing } = await supabase
    .from("catalogo_piezas")
    .select("id")
    .eq("odoo_product_id", id)
    .maybeSingle();
  if (existing) {
    await supabase.from("catalogo_piezas").update({ ...values, odoo_synced_at: now }).eq("id", existing.id);
    return "actualizado";
  }
  await supabase.from("catalogo_piezas").insert({ ...values, odoo_synced_at: now });
  return "insertado";
}
