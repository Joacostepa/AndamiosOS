import { NextRequest, NextResponse } from "next/server";
import { comentarSchema, idValido } from "@/lib/sistemas/validar";
import { avisosComentario, enviarAvisos, perfiles, type ResultadoComentar } from "@/lib/sistemas/servidor";
import type { ComentarRevisionRespuesta } from "@/lib/sistemas/tipos";
import { admin, errorResponse, exigirRevisor, invalido, leerJson, noExiste, sesion } from "../../../_comun";

// POST /api/sistemas/revision/[id]/comentarios — { texto } → { evento }
//
// Un mensaje de Sistemas a quien reportó (en su pantalla se firma «Sistemas», nunca con el
// nombre de quien escribe). Si el reporte estaba 'nuevo', sis_comentar lo pasa a 'visto'.

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const quien = await exigirRevisor();
  if (quien instanceof NextResponse) return quien;
  const { id } = await ctx.params;
  if (!idValido(id)) return noExiste();
  const p = comentarSchema.safeParse(await leerJson(req));
  if (!p.success) return invalido(p.error);

  try {
    const { data, error } = await (await sesion()).rpc("sis_comentar", { p_id: id, p_texto: p.data.texto, p_como: "sistemas" });
    if (error) throw error;
    const r = data as ResultadoComentar;
    await enviarAvisos(avisosComentario(r, quien.userId, []));
    const yo = (await perfiles(admin(), [quien.userId])).get(quien.userId);
    const respuesta: ComentarRevisionRespuesta = {
      evento: {
        id: Number(r.id),
        tipo: "comentario",
        lado: "sistemas",
        de: null,
        a: null,
        texto: p.data.texto,
        createdAt: new Date().toISOString(),
        autorNombre: yo ? [yo.nombre, yo.apellido].filter(Boolean).join(" ") : null,
      },
    };
    return NextResponse.json(respuesta, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
