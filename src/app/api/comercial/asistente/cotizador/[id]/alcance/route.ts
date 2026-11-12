import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerBorrador } from "@/lib/asistente/datos";
import { mejorarAlcance } from "@/lib/cotizador-rapido/alcance";
import { conversacionPropia } from "@/lib/cotizador-rapido/servidor";
import { errorResponse, exigirModulo, invalido } from "../../../../_comun";

// POST /api/comercial/asistente/cotizador/:conversacion/alcance { texto } — «Mejorar con IA» del
// alcance del desglosado: devuelve el texto mejorado (o redactado con los renglones, si viene
// vacío). No toca el borrador: la pantalla lo muestra y el vendedor decide si lo usa.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({ texto: z.string().max(4000) });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return invalido("Id inválido");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const quien = await exigirModulo("asistente-comercial", "editar");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    const conv = await conversacionPropia(db, id, quien.userId);
    if (!conv) return NextResponse.json({ error: "No existe ese presupuesto." }, { status: 404 });
    const b = conv.borrador_id ? await leerBorrador(db, conv.borrador_id) : null;
    // Los conceptos de los renglones, sin montos: la IA no necesita precios para el alcance.
    const renglones = (b?.datos.lineasManuales ?? []).map((l) => `${l.descripcion}${l.seccion === "opcional" ? " (opcional)" : ""}`);
    if (!parsed.data.texto.trim() && !renglones.length) return invalido("Escribí qué le vamos a brindar, o agregá renglones, y después mejoralo con IA.");
    const r = await mejorarAlcance({ texto: parsed.data.texto, renglones, tipoObra: b?.datos.trabajo.tipoObra ?? null });
    return NextResponse.json(r);
  } catch (e) {
    return errorResponse(e);
  }
}
