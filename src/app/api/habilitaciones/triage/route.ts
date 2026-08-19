import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { triar } from "@/lib/habilitaciones/servicio";
import { errorResponse, invalido, sesion, sincronizarLuego } from "../_comun";

// POST /api/habilitaciones/triage — resuelve varias obras de un clic.
//
// Acepta lote a propósito: con ~68 entradas por mes, si el triage no es de un clic la
// bandeja se llena de ruido y deja de significar algo, que es exactamente lo que le pasó
// a la planilla que este módulo reemplaza.
//
// Escribe en Supabase y contesta; Odoo se sincroniza en after(). Cuatro obras contra
// Odoo serían 4 × 800 ms en la acción más frecuente del módulo.

export const dynamic = "force-dynamic";

const schema = z.object({
  otIds: z.array(z.number().int().positive()).min(1).max(100),
  // `pendiente` deshace el triage y devuelve la obra a "Recién llegadas".
  decision: z.enum(["aplica", "no_aplica", "pendiente"]),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error.issues.map((i) => i.message).join(" · "));

  try {
    const { db, userId } = await sesion();
    await triar(db, parsed.data.otIds, parsed.data.decision, userId);
    sincronizarLuego(db, parsed.data.otIds);
    return NextResponse.json({ ok: true, resueltas: parsed.data.otIds.length });
  } catch (e) {
    return errorResponse(e);
  }
}
