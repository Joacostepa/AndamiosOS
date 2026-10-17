import { NextRequest, NextResponse } from "next/server";
import { comentarSchema, idValido } from "@/lib/sistemas/validar";
import { avisosComentario, enviarAvisos, revisoresActivos, type ResultadoComentar } from "@/lib/sistemas/servidor";
import type { ComentarRespuesta } from "@/lib/sistemas/tipos";
import { errorResponse, exigirSesion, invalido, leerJson, noExiste, sesion } from "../../../_comun";

// POST /api/sistemas/reportes/[id]/comentarios — { texto } → { evento }
//
// Quien reportó le suma algo a Sistemas mientras el reporte no esté cerrado. sis_comentar
// (lado 'usuario') chequea que sea suyo: si no, «Ese reporte no existe.» (404). Les avisa a
// los revisores por la campanita.

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const quien = await exigirSesion();
  if (quien instanceof NextResponse) return quien;
  const { id } = await ctx.params;
  if (!idValido(id)) return noExiste();
  const p = comentarSchema.safeParse(await leerJson(req));
  if (!p.success) return invalido(p.error);

  try {
    const { data, error } = await (await sesion()).rpc("sis_comentar", { p_id: id, p_texto: p.data.texto, p_como: "usuario" });
    if (error) throw error;
    const r = data as ResultadoComentar;
    await enviarAvisos(avisosComentario(r, quien.userId, await revisoresActivos()));
    const respuesta: ComentarRespuesta = {
      evento: { id: Number(r.id), tipo: "comentario", lado: "usuario", de: null, a: null, texto: p.data.texto, createdAt: new Date().toISOString() },
    };
    return NextResponse.json(respuesta, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
