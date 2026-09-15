import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { productorDeToken } from "@/lib/permisos-via-publica/endosos";
import type { ChequeoPoliza, EstadoDocumento, RevisionPoliza, Tramite } from "@/lib/permisos-via-publica/tipos";

// GET /api/public/endosos/:token
//
// Lo que ve el productor de seguros en su link: los endosos pendientes, los observados y los
// que quedaron listos en las últimas dos semanas (para que vea que llegaron). Sin sesión:
// lo protege el token. Devuelve sólo obra, titular, CUIT, fechas y el resultado de la
// revisión — nada del legajo del cliente.

export const dynamic = "force-dynamic";

export type FilaEndoso = {
  id: string;
  estado: EstadoDocumento;
  observacion: string | null;
  archivo_nombre: string | null;
  subido_at: string | null;
  pedido_at: string | null;
  chequeos: ChequeoPoliza[];
  direccion: string;
  titular_nombre: string | null;
  titular_cuit: string | null;
  permiso_hasta: string | null;
};

type Fila = {
  id: string;
  estado: EstadoDocumento;
  observacion: string | null;
  archivo_nombre: string | null;
  subido_at: string | null;
  pedido_at: string | null;
  revisado_at: string | null;
  revision: RevisionPoliza | null;
  pvp_tramites: Pick<Tramite, "direccion" | "titular_nombre" | "titular_cuit" | "permiso_hasta">;
};

const CATORCE_DIAS = 14 * 86_400_000;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const db = createAdminClient();
  const productor = await productorDeToken(db, token);
  if (!productor) return NextResponse.json({ error: "El link no es válido o ya no está activo" }, { status: 404 });

  const { data, error } = await db
    .from("pvp_documentos")
    .select("id, estado, observacion, archivo_nombre, subido_at, pedido_at, revisado_at, revision, pvp_tramites!inner(direccion, titular_nombre, titular_cuit, permiso_hasta)")
    .eq("clave", "poliza_rc")
    .in("estado", ["pedido", "revisando", "observado", "ok"])
    .order("pedido_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ahora = Date.now();
  const filas: FilaEndoso[] = ((data ?? []) as unknown as Fila[])
    .filter((f) => f.estado !== "ok" || (f.revisado_at && ahora - Date.parse(f.revisado_at) < CATORCE_DIAS))
    .map((f) => ({
      id: f.id,
      estado: f.estado,
      observacion: f.observacion,
      archivo_nombre: f.archivo_nombre,
      subido_at: f.subido_at,
      pedido_at: f.pedido_at,
      chequeos: f.revision?.chequeos ?? [],
      ...f.pvp_tramites,
    }));

  return NextResponse.json({ productor: productor.nombre, filas });
}
