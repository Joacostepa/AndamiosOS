import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { guardarSupervision, leerSupervision } from "@/lib/permisos-via-publica/supervision";

// GET/PUT /api/permisos-via-publica/supervision — los interruptores del modo supervisado (link
// al cliente, endoso, encomienda y presentación automáticos). GET con la sesión; PUT exige
// "editar" en el proxy y escribe con service role.

export const dynamic = "force-dynamic";

const schema = z.object({
  linkAlCliente: z.boolean(),
  endosoAutomatico: z.boolean(),
  encomiendaAutomatica: z.boolean(),
  presentacionAutomatica: z.boolean(),
}).partial();

export async function GET() {
  return NextResponse.json(await leerSupervision(await createClient()));
}

export async function PUT(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { data: auth } = await (await createClient()).auth.getUser();
  try {
    return NextResponse.json(await guardarSupervision(createAdminClient(), parsed.data, auth.user?.id ?? null));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
