import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mandarLinkCliente } from "@/lib/permisos-via-publica/portal";

// POST /api/permisos-via-publica/tramites/:id/link — reenvía el link del portal al mail del
// cliente (después de corregirlo en Odoo, por ejemplo). El proxy exige nivel "editar".
//
// El mail se relee de Odoo antes de mandar: si alguien lo corrigió allá, el reenvío usa el
// nuevo y no el que quedó guardado cuando se abrió el trámite.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  const db = createAdminClient();

  const { data: t } = await db.from("pvp_tramites").select("odoo_venta_id").eq("id", id).maybeSingle();
  if (!t) return NextResponse.json({ error: "El trámite no existe" }, { status: 404 });

  try {
    if (t.odoo_venta_id) {
      const { read } = await import("@/lib/odoo/client");
      const [venta] = await read<{ partner_id: [number, string] | false }>("sale.order", [t.odoo_venta_id], ["partner_id"]);
      if (venta?.partner_id) {
        const [p] = await read<{ name: string; email: string | false }>("res.partner", [venta.partner_id[0]], ["name", "email"]);
        if (p) await db.from("pvp_tramites").update({ cliente_nombre: p.name, cliente_email: p.email || null }).eq("id", id);
      }
    }
    const enviado = await mandarLinkCliente(db, id, req.nextUrl.origin);
    return NextResponse.json({ ok: enviado });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
