import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { FaltanDatos, generarDocumentosAba } from "@/lib/permisos-via-publica/generacion";

// POST /api/permisos-via-publica/tramites/:id/generar — genera el informe técnico y el croquis
// del trámite con las medidas de la venta de Odoo y la plancheta del catastro de la Ciudad.
// Un trámite sin venta (el de prueba) manda tipo y medidas en el cuerpo. El proxy exige "editar".
//
// Tarda: unas decenas de pedidos al catastro para dibujar la manzana, más dos PDF con 12
// láminas. Se espera la respuesta para mostrar el resultado en la ficha.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const schema = z.object({
  tipo: z.enum(["pantalla", "estructura_pantalla", "estructura", "torre"]),
  base: z.number().positive().max(500),
  alto: z.number().positive().max(200),
}).nullable();

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  const cuerpo = await req.json().catch(() => null);
  const parsed = schema.safeParse(cuerpo && Object.keys(cuerpo).length ? cuerpo : null);
  if (!parsed.success) return NextResponse.json({ error: "Medidas inválidas" }, { status: 400 });

  try {
    return NextResponse.json(await generarDocumentosAba(createAdminClient(), id, parsed.data));
  } catch (e) {
    if (e instanceof FaltanDatos) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
