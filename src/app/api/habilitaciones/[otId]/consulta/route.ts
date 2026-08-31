import { NextResponse } from "next/server";
import { fetchGestionDe, registrarConsulta } from "@/lib/habilitaciones/servicio";
import { errorResponse, invalido, parseOtId, sesion, sincronizarLuego } from "../../_comun";

// POST /api/habilitaciones/:otId/consulta — registrar que ya se le preguntó al cliente
// qué documentación pide.
//
// TRIAR NO ES CONSULTAR. Antes el triage "Aplica" sellaba la fecha de consulta en el
// mismo gesto, y la obra saltaba a "esperando al cliente" sin que nadie lo hubiera
// llamado: la bandeja decía que la pelota la tenía el cliente cuando la teníamos
// nosotros. Decidir que la obra necesita habilitación y haber preguntado qué pide son
// dos cosas distintas, y sólo la segunda mueve la pelota de lado.
//
// Es lo único que hace pasar de la etapa `a` a la `b`.

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ otId: string }> }) {
  const otId = parseOtId((await ctx.params).otId);
  if (!otId) return invalido("Id de OT inválido");

  try {
    const { db, userId } = await sesion();
    await registrarConsulta(db, otId, userId);
    sincronizarLuego(db, otId);
    return NextResponse.json({ ok: true, gestion: await fetchGestionDe(db, otId) });
  } catch (e) {
    return errorResponse(e);
  }
}
