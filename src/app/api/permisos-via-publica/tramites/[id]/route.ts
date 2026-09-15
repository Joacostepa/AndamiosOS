import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { linkCliente } from "@/lib/permisos-via-publica/portal";
import type { Documento, Evento, FichaTramite, Tramite } from "@/lib/permisos-via-publica/tipos";

// GET /api/permisos-via-publica/tramites/:id — la ficha de un trámite abierto desde una
// venta (todavía sin expediente): el link del portal para copiar, el dueño que cargó el
// cliente, su legajo, la póliza y el historial. Con la sesión del usuario.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const db = await createClient();
  const [t, docs, eventos] = await Promise.all([
    db.from("pvp_tramites").select("*").eq("id", id).maybeSingle(),
    db.from("pvp_documentos").select("*").eq("tramite_id", id).order("created_at"),
    db.from("pvp_eventos").select("*").eq("tramite_id", id).order("created_at", { ascending: false }),
  ]);
  if (t.error) return NextResponse.json({ error: t.error.message }, { status: 500 });
  if (!t.data) return NextResponse.json({ error: "El trámite no existe" }, { status: 404 });

  const tramite = t.data as Tramite;
  const documentos = await Promise.all(
    ((docs.data ?? []) as Documento[]).map(async (d) => ({
      ...d,
      url: d.archivo_path
        ? (await db.storage.from("permisos-via-publica").createSignedUrl(d.archivo_path, 600)).data?.signedUrl ?? null
        : null,
    })),
  );

  const ficha: FichaTramite = {
    tramite,
    documentos,
    eventos: (eventos.data ?? []) as Evento[],
    linkCliente: linkCliente(tramite.token_cliente, req.nextUrl.origin),
  };
  return NextResponse.json(ficha);
}
