import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerCharla, leerHilo } from "@/lib/clientes/bandeja";
import { leerFicha } from "@/lib/clientes/herramientas";
import { LINKS_DIAS, textoParaSlack } from "@/lib/clientes/para-slack";
import { errorResponse, exigirModulo, invalido } from "../../../../_comun";

// GET /api/comercial/clientes/conversaciones/:id/slack — «Copiar para Slack» (JS, 16/11): la
// charla entera en un texto para pegar en Slack (datos del cliente, el servicio, la pareja, los
// archivos y la charla). Los archivos de Storage son privados: van con un link firmado que dura
// LINKS_DIAS días, así se ven desde Slack sin entrar a la app.

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return invalido("Id inválido");
  const quien = await exigirModulo("clientes-whatsapp", "ver");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    const charla = await leerCharla(db, id);
    if (!charla) return NextResponse.json({ error: "No existe esa charla." }, { status: 404 });
    const [items, extra, adjuntos] = await Promise.all([
      leerHilo(db, id),
      db.from("cli_conversaciones").select("ficha, pareja_tecnico, pareja_asistente").eq("id", id).maybeSingle(),
      db.from("cli_hilo").select("id, adjunto").eq("conversacion_id", id).not("adjunto->>path", "is", null),
    ]);
    if (extra.error) throw new Error(extra.error.message);
    if (adjuntos.error) throw new Error(adjuntos.error.message);

    // Un link por archivo, todos en un solo pedido a Storage.
    const conPath = ((adjuntos.data ?? []) as { id: string; adjunto: { path?: string } | null }[]).filter((f) => typeof f.adjunto?.path === "string");
    const links = new Map<string, string>();
    if (conPath.length) {
      const { data, error } = await db.storage.from("comercial").createSignedUrls(conPath.map((f) => f.adjunto!.path!), LINKS_DIAS * 86_400);
      if (error) throw error;
      (data ?? []).forEach((s, i) => {
        if (s.signedUrl) links.set(conPath[i].id, s.signedUrl);
      });
    }

    const fila = extra.data as { ficha: unknown; pareja_tecnico: string | null; pareja_asistente: string | null } | null;
    const texto = textoParaSlack({
      charla,
      ficha: leerFicha(fila?.ficha ?? null, charla.telefono),
      pareja: { tecnico: fila?.pareja_tecnico ?? null, asistente: fila?.pareja_asistente ?? null },
      items,
      links,
      vencen: new Date(Date.now() + LINKS_DIAS * 86_400_000),
    });
    return NextResponse.json({ texto }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
