import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FaltanDatos } from "@/lib/permisos-via-publica/generacion";
import { pedirPresentacion } from "@/lib/permisos-via-publica/presentacion";

// POST /api/permisos-via-publica/tramites/:id/presentacion — pide la presentación en TAD.
// Normalmente se pide sola cuando el trámite queda listo; este botón es para volver a pedirla
// después de un error o para la prueba (que llena y guarda el formulario y borra el borrador,
// sin adjuntar ni presentar). El proxy exige nivel "editar". No espera al robot.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const { data: auth } = await (await createClient()).auth.getUser();
  try {
    return NextResponse.json(await pedirPresentacion(createAdminClient(), id, { userId: auth.user?.id ?? null }));
  } catch (e) {
    if (e instanceof FaltanDatos) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
