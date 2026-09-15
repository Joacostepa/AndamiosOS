import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { searchRead } from "@/lib/odoo/client";

// POST /api/permisos-via-publica/:id/vinculo
//
// La única escritura de una persona en este módulo: decir cuál es la venta de Odoo de un
// expediente. Todo lo demás lo escribe el robot.
//
//   { accion: "confirmar" }                  la venta que propuso el robot es la correcta
//   { accion: "descartar" }                  no lo es: se suelta y no se vuelve a proponer
//   { accion: "vincular", venta: "S02419" }  elegirla a mano (carátula sin altura, o la
//                                            propuesta era otra venta)
//
// POR QUÉ HACE FALTA: con el vínculo confirmado el robot escribe en la venta el estado del
// trámite, y de eso depende el candado del tablero. Uno equivocado le abriría el candado a
// la obra de otro.
//
// Pasa por funciones de la base (pvp_resolver_vinculo, pvp_vincular_a_mano) que vuelven a
// chequear el permiso de edición: la tabla sigue siendo de sólo lectura para los usuarios.
// Confirmar deja una tarea odoo_sincronizar que el robot toma en ~20 s si la Mac está prendida.

export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("confirmar") }),
  z.object({ accion: z.literal("descartar") }),
  z.object({ accion: z.literal("vincular"), venta: z.string().trim().min(1).max(40) }),
]);

type FilaVenta = { id: number; name: string; partner_id: [number, string] | false };

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  const body = parsed.data;
  const db = await createClient();

  if (body.accion !== "vincular") {
    const { error } = await db.rpc("pvp_resolver_vinculo", { p_id: id, p_confirmar: body.accion === "confirmar" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // "2419", "s2419" y "S02419" son la misma venta para quien la tipea.
  const numero = body.venta.toUpperCase().replace(/^S?0*(\d+)$/, (_, n: string) => `S${n.padStart(5, "0")}`);
  try {
    const [venta] = await searchRead<FilaVenta>("sale.order", [["name", "=", numero]], ["name", "partner_id"], { limit: 1 });
    if (!venta) return NextResponse.json({ error: `No existe la venta ${numero} en Odoo` }, { status: 404 });
    const { error } = await db.rpc("pvp_vincular_a_mano", {
      p_id: id,
      p_venta_id: venta.id,
      p_venta_nombre: venta.name,
      p_cliente: venta.partner_id ? venta.partner_id[1] : null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
