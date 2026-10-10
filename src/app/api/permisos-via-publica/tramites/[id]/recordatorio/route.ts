import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordarAlCliente } from "@/lib/permisos-via-publica/portal";
import { quienSoy } from "@/lib/permisos-via-publica/lista";

// POST /api/permisos-via-publica/tramites/:id/recordatorio — recordarle al cliente lo que falta.
//   { como: "mail" }      le escribe al mail de Odoo con el link, lo que falta y lo que hay que corregir
//   { como: "whatsapp" }  anota que alguien de la oficina le avisó por WhatsApp
// Los dos cuentan como contacto: la lista deja de pedir que se lo persiga hasta el próximo umbral.
// El proxy exige "editar".

export const dynamic = "force-dynamic";

const schema = z.object({ como: z.enum(["mail", "whatsapp"]) });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  const admin = createAdminClient();
  const yo = await quienSoy(await createClient(), admin, []);
  const r = await recordarAlCliente(admin, id, { como: parsed.data.como, quien: yo.nombre, origen: req.nextUrl.origin });
  return NextResponse.json(r);
}
