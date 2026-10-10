import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { avisarProductor, pedirEndoso, registrarEvento } from "@/lib/permisos-via-publica/endosos";
import { cuitValido, formatoCuit, nombreSospechoso } from "@/lib/permisos-via-publica/tipos";

// PATCH /api/permisos-via-publica/tramites/:id/dueno — corregir el dueño del lote desde la ficha
// (rediseño 09/10). Nace de Echeverría 2931: el cliente pegó el nombre del padrón con comillas y
// la codificación rota, y así iba a ir a Segucom y al CPAU. Con `mandarEndoso` pide el endoso en
// el mismo paso (el mail a Segucom sale después de responder). El proxy exige "editar".

export const dynamic = "force-dynamic";

const schema = z.object({
  nombre: z.string().trim().min(3).max(200),
  cuit: z.string().trim(),
  administradorNombre: z.string().trim().max(200).nullable(),
  administradorCuit: z.string().trim().nullable(),
  mandarEndoso: z.boolean(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Falta el nombre del dueño" }, { status: 400 });
  const d = parsed.data;
  const cuit = d.cuit.replace(/\D/g, "");
  if (!cuitValido(cuit)) return NextResponse.json({ error: "El CUIT del dueño no es válido" }, { status: 400 });
  const adminCuit = d.administradorCuit ? d.administradorCuit.replace(/\D/g, "") : null;
  if (adminCuit && !cuitValido(adminCuit)) return NextResponse.json({ error: "El CUIT del administrador no es válido" }, { status: 400 });
  const raro = nombreSospechoso(d.nombre);
  if (d.mandarEndoso && raro) return NextResponse.json({ error: `El nombre todavía ${raro}: corregilo antes de mandar el endoso.` }, { status: 400 });

  const { data: auth } = await (await createClient()).auth.getUser();
  const db = createAdminClient();
  const { data: t } = await db.from("pvp_tramites").select("titular_cargado_at, tipo_dueno").eq("id", id).maybeSingle();
  if (!t) return NextResponse.json({ error: "El trámite no existe" }, { status: 404 });
  if (!t.titular_cargado_at) return NextResponse.json({ error: "El cliente todavía no cargó el dueño del lote" }, { status: 400 });

  const conAdmin = t.tipo_dueno === "consorcio";
  const { error } = await db.from("pvp_tramites").update({
    titular_nombre: d.nombre, titular_cuit: cuit,
    ...(conAdmin ? { administrador_nombre: d.administradorNombre || null, administrador_cuit: adminCuit } : {}),
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await registrarEvento(db, id, "titular_cargado", `Se corrigió el dueño del lote: ${d.nombre} (CUIT ${formatoCuit(cuit)})${conAdmin && d.administradorNombre ? ` · administrador ${d.administradorNombre}` : ""}.`, { por: auth.user?.id ?? null }, "persona");

  if (!d.mandarEndoso) return NextResponse.json({ ok: true, endoso: false });
  try {
    await pedirEndoso(db, id, auth.user?.id ?? null);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  after(() => avisarProductor(db, req.nextUrl.origin));
  return NextResponse.json({ ok: true, endoso: true });
}
