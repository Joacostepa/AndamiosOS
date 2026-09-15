import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tramiteDeToken } from "@/lib/permisos-via-publica/portal";
import type { Documento, EstadoDocumento, TipoDueno } from "@/lib/permisos-via-publica/tipos";

// GET /api/public/permiso/:token — lo que ve el cliente en su portal: la obra, el dueño que
// cargó y sus documentos. Sólo los de origen "cliente": la póliza y lo que hace ABA no son
// cosa suya. Sin sesión: lo protege el token.

export const dynamic = "force-dynamic";

export type PortalCliente = {
  direccion: string;
  cliente_nombre: string | null;
  permiso_hasta: string | null;
  titular: {
    tipo: TipoDueno;
    esInquilino: boolean;
    nombre: string;
    cuit: string;
    /** Sólo en consorcios: la persona del administrador, que va como coasegurado. */
    administrador: { nombre: string; cuit: string } | null;
  } | null;
  /** Cada documento con un link temporal (10 min) para que el cliente pueda leerlo. */
  documentos: { id: string; clave: string; estado: EstadoDocumento; archivo_nombre: string | null; observacion: string | null; url: string | null }[];
};

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const db = createAdminClient();
  const t = await tramiteDeToken(db, token);
  if (!t) return NextResponse.json({ error: "El link no es válido" }, { status: 404 });

  const { data } = await db.from("pvp_documentos")
    .select("id, clave, estado, archivo_nombre, observacion, archivo_path")
    .eq("tramite_id", t.id).eq("origen", "cliente").order("created_at");

  // Link temporal para que el cliente pueda leer lo que subió y lo que firmó en el portal.
  const documentos = await Promise.all(((data ?? []) as (Pick<Documento, "id" | "clave" | "estado" | "archivo_nombre" | "observacion"> & { archivo_path: string | null })[])
    .map(async ({ archivo_path, ...d }) => ({
      ...d,
      url: archivo_path ? (await db.storage.from("permisos-via-publica").createSignedUrl(archivo_path, 600)).data?.signedUrl ?? null : null,
    })));

  const portal: PortalCliente = {
    direccion: t.direccion,
    cliente_nombre: t.cliente_nombre,
    permiso_hasta: t.permiso_hasta,
    titular: t.titular_cargado_at
      ? {
          tipo: t.tipo_dueno, esInquilino: t.es_inquilino, nombre: t.titular_nombre, cuit: t.titular_cuit,
          administrador: t.administrador_cuit ? { nombre: t.administrador_nombre, cuit: t.administrador_cuit } : null,
        }
      : null,
    documentos,
  };
  return NextResponse.json(portal);
}
