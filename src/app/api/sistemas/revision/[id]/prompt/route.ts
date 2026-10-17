import { NextRequest, NextResponse } from "next/server";
import { idValido } from "@/lib/sistemas/validar";
import { leerDetalle, shaActual } from "@/lib/sistemas/servidor";
import { armarPrompt } from "@/lib/sistemas/prompt-claude";
import { docsDeModulo } from "@/lib/sistemas/rutas";
import { LIMITES, type PromptRespuesta } from "@/lib/sistemas/tipos";
import { admin, errorResponse, exigirRevisor, noExiste, sesion, sinCache } from "../../../_comun";

// GET /api/sistemas/revision/[id]/prompt — «Copiar para Claude Code»: el texto armado
// (src/lib/sistemas/prompt-claude.ts) con las capturas firmadas por 1 hora, el tiempo de
// pegarlo y que Claude Code las baje con curl. No cambia el estado del reporte.

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const quien = await exigirRevisor();
  if (quien instanceof NextResponse) return quien;
  const { id } = await ctx.params;
  if (!idValido(id)) return noExiste();

  try {
    const reporte = await leerDetalle(await sesion(), admin(), id, LIMITES.urlFirmadaPromptSeg);
    if (!reporte) return noExiste();
    const urls = reporte.capturas.map((c) => c.url);
    const vence = new Date(Date.now() + LIMITES.urlFirmadaPromptSeg * 1000).toISOString();
    const texto = armarPrompt(reporte, { shaActual: shaActual(), urlsCapturas: urls, docs: docsDeModulo(reporte.modulo, reporte.ruta) });
    return NextResponse.json({ texto, capturas: urls.map((url) => ({ url, vence })) } satisfies PromptRespuesta, { headers: sinCache });
  } catch (e) {
    return errorResponse(e);
  }
}
