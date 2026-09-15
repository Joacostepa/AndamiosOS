import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRODUCTOR_PRUEBA, productorDeToken } from "@/lib/permisos-via-publica/endosos";
import type { ChequeoPoliza, EstadoDocumento, RevisionPoliza, Tramite } from "@/lib/permisos-via-publica/tipos";

// GET /api/public/endosos/:token
//
// Lo que ve el productor de seguros en su link: los endosos pendientes, los observados y los
// que quedaron listos en las últimas dos semanas (para que vea que llegaron). Sin sesión:
// lo protege el token. Devuelve sólo obra, titular, CUIT, administrador (en consorcios), fechas
// y el resultado de la revisión — nada del legajo del cliente.

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
  administrador_nombre: string | null;
  administrador_cuit: string | null;
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
  pvp_tramites: Pick<Tramite, "direccion" | "titular_nombre" | "titular_cuit" | "administrador_nombre" | "administrador_cuit" | "permiso_hasta" | "es_prueba">;
};

const CATORCE_DIAS = 14 * 86_400_000;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const db = createAdminClient();
  const productor = await productorDeToken(db, token);
  if (!productor) return NextResponse.json({ error: "El link no es válido o ya no está activo" }, { status: 404 });

  const { data, error } = await db
    .from("pvp_documentos")
    .select("id, estado, observacion, archivo_nombre, subido_at, pedido_at, revisado_at, revision, pvp_tramites!inner(direccion, titular_nombre, titular_cuit, administrador_nombre, administrador_cuit, permiso_hasta, es_prueba)")
    .eq("clave", "poliza_rc")
    .in("estado", ["pedido", "revisando", "observado", "ok"])
    .order("pedido_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // El link real de Segucom nunca muestra pruebas, y el de prueba sólo muestra pruebas.
  const esPrueba = productor.id === PRODUCTOR_PRUEBA;
  const ahora = Date.now();
  const filas: FilaEndoso[] = ((data ?? []) as unknown as Fila[])
    .filter((f) => f.pvp_tramites.es_prueba === esPrueba)
    .filter((f) => f.estado !== "ok" || (f.revisado_at && ahora - Date.parse(f.revisado_at) < CATORCE_DIAS))
    .map((f) => ({
      id: f.id,
      estado: f.estado,
      observacion: f.observacion,
      archivo_nombre: f.archivo_nombre,
      subido_at: f.subido_at,
      pedido_at: f.pedido_at,
      chequeos: f.revision?.chequeos ?? [],
      direccion: f.pvp_tramites.direccion,
      titular_nombre: f.pvp_tramites.titular_nombre,
      titular_cuit: f.pvp_tramites.titular_cuit,
      administrador_nombre: f.pvp_tramites.administrador_nombre,
      administrador_cuit: f.pvp_tramites.administrador_cuit,
      permiso_hasta: f.pvp_tramites.permiso_hasta,
    }));

  return NextResponse.json({ productor: productor.nombre, filas });
}
