import { NextRequest, NextResponse } from "next/server";
import { idValido, revisarAParametros, revisarSchema } from "@/lib/sistemas/validar";
import { avisosRevision, enviarAvisos, leerDetalle, shaActual, type ResultadoRevisar } from "@/lib/sistemas/servidor";
import type { RevisarBody, RevisionDetalleRespuesta } from "@/lib/sistemas/tipos";
import { admin, errorResponse, exigirRevisor, invalido, leerJson, noExiste, sesion, sinCache } from "../../_comun";

// GET   /api/sistemas/revision/[id] — el detalle. Con ?abrir=1 (sólo el primer pedido, cuando el
//       revisor lo elige de la lista o llega por la campanita), si estaba 'nuevo' lo pasa a 'visto'
//       (sin aviso: quien reportó ve «Sistemas ya lo vio» en Mis reportes). Sin el parámetro no
//       toca nada: si no, cada refresco deshacía el «Nuevo» que el revisor eligió a mano.
// PATCH /api/sistemas/revision/[id] — { estado?, prioridad?, motivoDescarte?, duplicadoDe?, mensaje? }
//       → el detalle fresco. Avisa a quien reportó (y, al resolver un original, a sus duplicados).

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const quien = await exigirRevisor();
  if (quien instanceof NextResponse) return quien;
  const { id } = await ctx.params;
  if (!idValido(id)) return noExiste();

  try {
    const db = await sesion();
    const ad = admin();
    let reporte = await leerDetalle(db, ad, id);
    if (!reporte) return noExiste();
    if (reporte.estado === "nuevo" && req.nextUrl.searchParams.get("abrir") === "1") {
      const { error } = await db.rpc("sis_revisar_reporte", { p_id: id, p: { estado: "visto" } });
      if (error) throw error;
      reporte = (await leerDetalle(db, ad, id)) ?? reporte;
    }
    return NextResponse.json({ reporte, shaActual: shaActual() } satisfies RevisionDetalleRespuesta, { headers: sinCache });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const quien = await exigirRevisor();
  if (quien instanceof NextResponse) return quien;
  const { id } = await ctx.params;
  if (!idValido(id)) return noExiste();
  const p = revisarSchema.safeParse(await leerJson(req));
  if (!p.success) return invalido(p.error);

  try {
    const db = await sesion();
    const { data, error } = await db.rpc("sis_revisar_reporte", { p_id: id, p: revisarAParametros(p.data as RevisarBody) });
    if (error) throw error;
    await enviarAvisos(avisosRevision(data as ResultadoRevisar, quien.userId));
    const reporte = await leerDetalle(db, admin(), id);
    if (!reporte) return noExiste();
    return NextResponse.json({ reporte, shaActual: shaActual() } satisfies RevisionDetalleRespuesta, { headers: sinCache });
  } catch (e) {
    return errorResponse(e);
  }
}
