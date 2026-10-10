import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { armarFichaExpediente } from "@/lib/permisos-via-publica/ficha";

// GET /api/permisos-via-publica/:id — un expediente de TAD. Si tiene trámite en la app, la ficha
// es la del trámite (rediseño 09/10: una ficha por permiso) y la respuesta trae `tramiteId` para
// redirigir. Si no (de antes del robot, o presentado a mano sin venta), el mismo esqueleto: estado,
// datos del expediente, la venta en vivo y el historial. Carátula y permiso con URL firmada de 10
// minutos (el bucket es privado: el permiso tiene DNI y domicilio del titular).

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  try {
    const ficha = await armarFichaExpediente(await createClient(), createAdminClient(), id);
    if (!ficha) return NextResponse.json({ error: "El expediente no existe" }, { status: 404 });
    return NextResponse.json(ficha);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) }, { status: 500 });
  }
}
