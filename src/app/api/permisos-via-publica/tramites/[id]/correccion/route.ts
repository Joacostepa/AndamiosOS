import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { pedirCorreccionAlCliente } from "@/lib/permisos-via-publica/portal";

// POST /api/permisos-via-publica/tramites/:id/correccion { documentoId } — le vuelve a pedir al
// cliente que corrija un documento observado del legajo. El mail sale solo cuando la revisión lo
// observa; esto es para reenviarlo (p. ej. después de corregir el mail del cliente en Odoo, como
// en S01826 el 16/09). El proxy exige nivel "editar".
//
// Como el link, relee de Odoo el mail del cliente antes de mandar.

export const dynamic = "force-dynamic";

const schema = z.object({ documentoId: z.string().uuid() });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Falta el documento" }, { status: 400 });
  const db = createAdminClient();

  const { data: t } = await db.from("pvp_tramites").select("odoo_venta_id").eq("id", id).maybeSingle();
  if (!t) return NextResponse.json({ error: "El trámite no existe" }, { status: 404 });
  const { data: doc } = await db.from("pvp_documentos").select("id").eq("id", body.data.documentoId).eq("tramite_id", id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "El documento no es de este trámite" }, { status: 404 });

  try {
    if (t.odoo_venta_id) {
      const { read } = await import("@/lib/odoo/client");
      const [venta] = await read<{ partner_id: [number, string] | false }>("sale.order", [t.odoo_venta_id], ["partner_id"]);
      if (venta?.partner_id) {
        const [p] = await read<{ name: string; email: string | false }>("res.partner", [venta.partner_id[0]], ["name", "email"]);
        if (p) await db.from("pvp_tramites").update({ cliente_nombre: p.name, cliente_email: p.email || null }).eq("id", id);
      }
    }
    const r = await pedirCorreccionAlCliente(db, doc.id, { origen: req.nextUrl.origin, forzar: true });
    return r.enviado ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.motivo ?? "No se pudo mandar" }, { status: 422 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
