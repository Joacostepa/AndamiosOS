import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorResponse, exigirModulo, invalido } from "../../../_comun";

// GET /api/comercial/clientes/medios/:id — el adjunto de un mensaje del hilo (foto, audio,
// video, documento): redirige a una URL firmada de Storage por 10 minutos. ?descargar=1 la
// pide como descarga, con el nombre original.
//
// Por qué una ruta y no la URL firmada en el detalle: la pantalla consulta el detalle cada
// pocos segundos, y una URL firmada nueva en cada consulta hacía recargar fotos y audios.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return invalido("Id inválido");
  const quien = await exigirModulo("clientes-whatsapp", "ver");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    const { data: fila } = await db.from("cli_hilo").select("adjunto").eq("id", id).maybeSingle();
    const adj = fila?.adjunto as { path?: string; nombre?: string } | null;
    if (!adj?.path) return NextResponse.json({ error: "Ese archivo no está (o todavía se está bajando)." }, { status: 404 });
    const descargar = req.nextUrl.searchParams.get("descargar") === "1";
    const { data, error } = await db.storage
      .from("comercial")
      .createSignedUrl(adj.path, 600, descargar ? { download: adj.nombre ?? true } : undefined);
    if (error || !data?.signedUrl) throw error ?? new Error("No se pudo firmar el archivo.");
    return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    return errorResponse(e);
  }
}
