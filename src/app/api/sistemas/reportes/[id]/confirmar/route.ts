import { NextRequest, NextResponse } from "next/server";
import { confirmarSchema, idValido } from "@/lib/sistemas/validar";
import { avisosConfirmar, enviarAvisos, revisoresActivos, type ResultadoConfirmar } from "@/lib/sistemas/servidor";
import type { ConfirmarRespuesta } from "@/lib/sistemas/tipos";
import { errorResponse, exigirSesion, invalido, leerJson, noExiste, sesion } from "../../../_comun";

// POST /api/sistemas/reportes/[id]/confirmar — { ok, texto? } → { estado, reabierto }
//
// La respuesta de quien reportó a uno resuelto: «Ya está, gracias» (ok) o «Sigue pasando»,
// que lo reabre a 'visto' y les avisa a los revisores. sis_confirmar chequea que sea suyo.

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const quien = await exigirSesion();
  if (quien instanceof NextResponse) return quien;
  const { id } = await ctx.params;
  if (!idValido(id)) return noExiste();
  const p = confirmarSchema.safeParse(await leerJson(req));
  if (!p.success) return invalido(p.error);

  try {
    const { data, error } = await (await sesion()).rpc("sis_confirmar", { p_id: id, p_ok: p.data.ok, p_texto: p.data.texto ?? null });
    if (error) throw error;
    const r = data as ResultadoConfirmar;
    if (r.reabierto) await enviarAvisos(avisosConfirmar(r, id, quien.userId, await revisoresActivos()));
    return NextResponse.json({ estado: r.estado, reabierto: r.reabierto } satisfies ConfirmarRespuesta);
  } catch (e) {
    return errorResponse(e);
  }
}
