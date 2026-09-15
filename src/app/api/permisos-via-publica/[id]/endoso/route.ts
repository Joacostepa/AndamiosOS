import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { avisarProductor, pedirEndoso } from "@/lib/permisos-via-publica/endosos";
import { cuitValido } from "@/lib/permisos-via-publica/tipos";

// POST /api/permisos-via-publica/:id/endoso
//
// Pide (o vuelve a pedir) el endoso de la póliza para el trámite de este expediente: abre
// el trámite si no existe, guarda el titular del lote y deja la póliza en "pedido". El mail
// a Segucom sale solo, después de responder (decidido: sin clic de aprobación).
//
// El titular lo carga una persona hasta que exista el portal del cliente. NO se toma del
// cliente de Odoo: muchas veces es la constructora y no el dueño del lote.
//
// Quién puede: el proxy exige nivel "editar" en el módulo para cualquier POST acá. Escribe
// con service role porque las tablas no tienen políticas de escritura para usuarios.

export const dynamic = "force-dynamic";

const schema = z.object({
  titularNombre: z.string().trim().min(3).max(200),
  titularCuit: z.string().trim(),
  permisoHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Faltan el nombre o el CUIT del titular" }, { status: 400 });
  const cuit = parsed.data.titularCuit.replace(/\D/g, "");
  if (!cuitValido(cuit)) return NextResponse.json({ error: "El CUIT no es válido" }, { status: 400 });

  const { data: { user } } = await (await createClient()).auth.getUser();
  const db = createAdminClient();

  const { data: exp } = await db.from("pvp_expedientes")
    .select("id, numero, direccion, odoo_venta_id, odoo_venta_nombre").eq("id", id).maybeSingle();
  if (!exp) return NextResponse.json({ error: "El expediente no existe" }, { status: 404 });

  const ahora = new Date().toISOString();
  const valores = {
    direccion: exp.direccion ?? `EX-${exp.numero}`,
    odoo_venta_id: exp.odoo_venta_id,
    odoo_venta_nombre: exp.odoo_venta_nombre,
    titular_nombre: parsed.data.titularNombre,
    titular_cuit: cuit,
    permiso_hasta: parsed.data.permisoHasta,
    updated_at: ahora,
  };

  try {
    const { data: previo } = await db.from("pvp_tramites").select("id").eq("expediente_id", id).maybeSingle();
    let tramiteId = previo?.id as string | undefined;
    if (tramiteId) {
      const { error } = await db.from("pvp_tramites").update(valores).eq("id", tramiteId);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await db.from("pvp_tramites")
        .insert({ ...valores, expediente_id: id, creado_por: user?.id ?? null }).select("id").single();
      if (error || !data) throw new Error(error?.message ?? "No se pudo abrir el trámite");
      tramiteId = data.id as string;
      await db.from("pvp_eventos").insert({
        tramite_id: tramiteId, expediente_id: id, tipo: "tramite_abierto", actor: "persona",
        detalle: `Titular del lote: ${parsed.data.titularNombre}`, datos: { por: user?.id ?? null },
      });
    }

    await pedirEndoso(db, tramiteId, user?.id ?? null);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  after(() => avisarProductor(db, req.nextUrl.origin));
  return NextResponse.json({ ok: true });
}
