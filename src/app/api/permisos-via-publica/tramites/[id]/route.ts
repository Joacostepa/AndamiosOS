import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { linkCliente } from "@/lib/permisos-via-publica/portal";
import { PRODUCTOR_PRUEBA, linkProductor } from "@/lib/permisos-via-publica/endosos";
import { estadoPresentacion } from "@/lib/permisos-via-publica/presentacion";
import type { Documento, EncomiendaFicha, Evento, FichaTramite, PresentacionFicha, Tramite } from "@/lib/permisos-via-publica/tipos";

// GET /api/permisos-via-publica/tramites/:id — la ficha de un trámite abierto desde una
// venta (todavía sin expediente): el link del portal para copiar, el dueño que cargó el
// cliente, su legajo, la póliza y el historial. Con la sesión del usuario.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const db = await createClient();
  const [t, docs, eventos, tareas] = await Promise.all([
    db.from("pvp_tramites").select("*").eq("id", id).maybeSingle(),
    db.from("pvp_documentos").select("*").eq("tramite_id", id).order("created_at"),
    db.from("pvp_eventos").select("*").eq("tramite_id", id).order("created_at", { ascending: false }),
    db.from("pvp_tareas").select("id, estado, payload, resultado, error, created_at, terminada_at")
      .eq("tipo", "cpau_encomienda").eq("tramite_id", id).order("created_at", { ascending: false }).limit(1),
  ]);
  const [presentaciones, requisitos] = await Promise.all([
    db.from("pvp_tareas").select("id, estado, payload, resultado, error, created_at, terminada_at")
      .eq("tipo", "tad_presentar").eq("tramite_id", id).order("created_at", { ascending: false }).limit(1),
    estadoPresentacion(db, id),
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

  // La última encomienda del CPAU, con las capturas del robot firmadas por 10 minutos.
  const tarea = tareas.data?.[0] as Omit<EncomiendaFicha, "capturas"> & { resultado: { capturas?: string[] } | null } | undefined;
  const encomienda: EncomiendaFicha | null = tarea
    ? {
        ...tarea,
        capturas: await Promise.all((tarea.resultado?.capturas ?? []).map(async (path) => ({
          nombre: path.split("/").pop()!.replace(/^\d+-[cf]\d+-/, "").replace(/\.png$/, "").replace(/-/g, " "),
          url: (await db.storage.from("permisos-via-publica").createSignedUrl(path, 600)).data?.signedUrl ?? null,
        }))),
      }
    : null;

  // La última presentación en TAD y qué falta para poder presentar.
  const tareaTad = presentaciones.data?.[0] as Omit<NonNullable<PresentacionFicha["tarea"]>, "capturas"> & { resultado: { capturas?: string[] } | null } | undefined;
  const presentacion: PresentacionFicha = {
    estado: requisitos,
    tarea: tareaTad
      ? {
          ...tareaTad,
          capturas: await Promise.all((tareaTad.resultado?.capturas ?? []).map(async (path) => ({
            nombre: path.split("/").pop()!.replace(/^\d+-\d+-/, "").replace(/\.png$/, "").replace(/-/g, " "),
            url: (await db.storage.from("permisos-via-publica").createSignedUrl(path, 600)).data?.signedUrl ?? null,
          }))),
        }
      : null,
  };

  const ficha: FichaTramite = {
    tramite,
    documentos,
    encomienda,
    presentacion,
    eventos: (eventos.data ?? []) as Evento[],
    linkCliente: linkCliente(tramite.token_cliente, req.nextUrl.origin),
    // El token del productor sólo lo lee la service role: se arma acá y sólo para pruebas.
    linkProductorPrueba: tramite.es_prueba ? await linkProductor(createAdminClient(), PRODUCTOR_PRUEBA, req.nextUrl.origin) : null,
  };
  return NextResponse.json(ficha);
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
