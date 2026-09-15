import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { abrirTramiteDeVenta } from "@/lib/permisos-via-publica/portal";

// POST /api/odoo/webhooks/ventas-permiso?secret=...
//
// Receptor del automatismo "AndamiosOS permisos de venta" (scripts/odoo-webhook-ventas-permiso.mjs):
// Odoo avisa cuando en una venta cambia `state` o `x_lleva_permiso`. Si la venta quedó
// confirmada con permiso de implantación, se abre el trámite y se le manda el link del
// portal al cliente (ver src/lib/permisos-via-publica/portal.ts).
//
// Como los demás webhooks de Odoo: es SÍNCRONO dentro del guardado de la venta, así que se
// contesta apenas se valida el secret y el trabajo va en after().

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function ids(body: unknown): number[] {
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
  const ventas = ids(await req.json().catch(() => ({})));
  if (ventas.length === 0) return NextResponse.json({ error: "Sin id en el payload" }, { status: 400 });

  const origen = req.nextUrl.origin;
  after(async () => {
    const db = createAdminClient();
    for (const id of ventas) {
      try {
        console.log(`[webhook venta ${id}] ${await abrirTramiteDeVenta(db, id, origen)}`);
      } catch (e) {
        console.error(`[webhook venta ${id}] no se pudo abrir el trámite`, e);
      }
    }
  });
  return NextResponse.json({ ok: true, encolados: ventas }, { status: 202 });
}
