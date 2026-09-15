import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Evento, Expediente, FichaExpediente } from "@/lib/permisos-via-publica/tipos";

// GET /api/permisos-via-publica/:id
//
// Un expediente con su historial y, si ya salió, el permiso para descargar (URL firmada de
// 10 minutos: el bucket es privado porque el permiso tiene DNI y domicilio del titular).

export const dynamic = "force-dynamic";

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
  let permisoUrl: string | null = null;
  if (expediente.permiso_path) {
    const firmado = await db.storage.from("permisos-via-publica").createSignedUrl(expediente.permiso_path, 600);
    permisoUrl = firmado.data?.signedUrl ?? null;
  }

  const ficha: FichaExpediente = { expediente, eventos: (eventos.data ?? []) as Evento[], permisoUrl };
  return NextResponse.json(ficha);
}
