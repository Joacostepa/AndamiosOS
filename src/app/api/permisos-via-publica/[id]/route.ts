import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { read } from "@/lib/odoo/client";
import { urlOdooVenta } from "@/lib/odoo/habilitaciones";
import type { Documento, Evento, Expediente, FichaExpediente, Tramite, VentaOdoo } from "@/lib/permisos-via-publica/tipos";

// GET /api/permisos-via-publica/:id
//
// Un expediente con su historial y, si ya salió, el permiso para descargar (URL firmada de
// 10 minutos: el bucket es privado porque el permiso tiene DNI y domicilio del titular).
//
// Si tiene venta vinculada, la trae de Odoo EN VIVO: para confirmar un vínculo hay que ver
// la dirección y el cliente de la venta al lado de los de la carátula, y después de
// confirmado, lo que la venta dice hoy. Si Odoo no responde la ficha igual se muestra.

export const dynamic = "force-dynamic";

type FilaVenta = {
  id: number;
  name: string;
  x_direccion_obra: string | false;
  partner_id: [number, string] | false;
  date_order: string | false;
  x_permiso_modalidad: string | false;
  x_tramite_estado: string | false;
  x_expediente_nro: string | false;
  x_permiso_fecha: string | false;
};

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

async function ventaDeOdoo(ventaId: number): Promise<{ venta: VentaOdoo | null; ventaError: string | null }> {
  try {
    const [v] = await read<FilaVenta>("sale.order", [ventaId], [
      "name", "x_direccion_obra", "partner_id", "date_order", "x_permiso_modalidad",
      "x_tramite_estado", "x_expediente_nro", "x_permiso_fecha",
    ]);
    if (!v) return { venta: null, ventaError: "La venta ya no existe en Odoo" };
    return {
      venta: {
        id: v.id,
        nombre: v.name,
        direccion: str(v.x_direccion_obra),
        cliente: v.partner_id ? v.partner_id[1] : null,
        fecha: str(v.date_order)?.slice(0, 10) ?? null,
        modalidad: str(v.x_permiso_modalidad),
        tramite: str(v.x_tramite_estado),
        expedienteNro: str(v.x_expediente_nro),
        permisoFecha: str(v.x_permiso_fecha),
        url: urlOdooVenta(v.id),
      },
      ventaError: null,
    };
  } catch (e) {
    return { venta: null, ventaError: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const db = await createClient();
  const [exp, eventos] = await Promise.all([
    db.from("pvp_expedientes").select("*").eq("id", id).maybeSingle(),
    db.from("pvp_eventos").select("*").eq("expediente_id", id).order("created_at", { ascending: false }),
  ]);
  if (exp.error) return NextResponse.json({ error: exp.error.message }, { status: 500 });
  if (!exp.data) return NextResponse.json({ error: "El expediente no existe" }, { status: 404 });

  const expediente = exp.data as Expediente;
  const firmar = (path: string | null) =>
    path
      ? db.storage.from("permisos-via-publica").createSignedUrl(path, 600).then((f) => f.data?.signedUrl ?? null)
      : Promise.resolve(null);

  const [permisoUrl, caratulaUrl, odoo, tramite] = await Promise.all([
    firmar(expediente.permiso_path),
    firmar(expediente.caratula_path),
    expediente.odoo_venta_id ? ventaDeOdoo(expediente.odoo_venta_id) : Promise.resolve({ venta: null, ventaError: null }),
    db.from("pvp_tramites").select("*").eq("expediente_id", id).maybeSingle().then((r) => (r.data as Tramite | null) ?? null),
  ]);
  const { data: docs } = tramite
    ? await db.from("pvp_documentos").select("*").eq("tramite_id", tramite.id).order("created_at")
    : { data: [] };
  const documentos = await Promise.all(
    ((docs ?? []) as Documento[]).map(async (d) => ({ ...d, url: await firmar(d.archivo_path) })),
  );

  const ficha: FichaExpediente = { expediente, eventos: (eventos.data ?? []) as Evento[], permisoUrl, caratulaUrl, ...odoo, tramite, documentos };
  return NextResponse.json(ficha);
}
