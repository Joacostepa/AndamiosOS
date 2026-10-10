import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { armarFicha } from "@/lib/permisos-via-publica/ficha";

// GET /api/permisos-via-publica/tramites/:id — la ficha única del permiso (rediseño 09/10): el
// estado (la misma cuenta que la fila de la lista), los papeles, todos los intentos del robot, el
// expediente, la venta en vivo y el historial de trámite y expediente juntos. La arma armarFicha
// (lib/permisos-via-publica/ficha.ts) con la sesión del usuario.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  try {
    const ficha = await armarFicha(await createClient(), createAdminClient(), id, req.nextUrl.origin);
    if (!ficha) return NextResponse.json({ error: "El trámite no existe" }, { status: 404 });
    return NextResponse.json(ficha);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) }, { status: 500 });
  }
}

// DELETE /api/permisos-via-publica/tramites/:id — borra un trámite DE PRUEBA con sus
// documentos, historial y archivos. Un trámite real no se borra desde acá.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  const db = createAdminClient();

  const { data: t } = await db.from("pvp_tramites").select("es_prueba").eq("id", id).maybeSingle();
  if (!t) return NextResponse.json({ error: "El trámite no existe" }, { status: 404 });
  if (!t.es_prueba) return NextResponse.json({ error: "Sólo se pueden borrar trámites de prueba" }, { status: 400 });

  const carpeta = `tramites/${id}`;
  const { data: archivos } = await db.storage.from("permisos-via-publica").list(carpeta, { limit: 1000 });
  if (archivos?.length) await db.storage.from("permisos-via-publica").remove(archivos.map((a) => `${carpeta}/${a.name}`));

  // Documentos y eventos se van en cascada con el trámite.
  const { error } = await db.from("pvp_tramites").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
