import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { avisarProductor, pedirEndoso } from "@/lib/permisos-via-publica/endosos";

// POST /api/permisos-via-publica/tramites/:id/endoso — "Pedir endoso a Segucom" desde la ficha
// del trámite. En modo supervisado es la única forma de que salga el pedido: el cliente carga
// el dueño del lote, la app avisa y una persona lo revisa y aprieta. El mail sale después de
// responder, con copia al vendedor y a quien gestiona. El proxy exige "editar".

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const { data: auth } = await (await createClient()).auth.getUser();
  const db = createAdminClient();
  const { data: t } = await db.from("pvp_tramites").select("titular_cargado_at").eq("id", id).maybeSingle();
  if (!t) return NextResponse.json({ error: "El trámite no existe" }, { status: 404 });
  if (!t.titular_cargado_at) return NextResponse.json({ error: "El cliente todavía no cargó el dueño del lote" }, { status: 400 });

  try {
    await pedirEndoso(db, id, auth.user?.id ?? null);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  after(() => avisarProductor(db, req.nextUrl.origin));
  return NextResponse.json({ ok: true });
}
