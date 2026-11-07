import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerBorrador } from "@/lib/asistente/datos";
import { resumenCortoBorrador } from "@/lib/asistente/herramientas";
import { interpretarPegado } from "@/lib/cotizador-rapido/interpretar";
import { conversacionPropia } from "@/lib/cotizador-rapido/servidor";
import { errorResponse, exigirModulo, invalido } from "../../../../_comun";

// POST /api/comercial/asistente/cotizador/:conversacion/interpretar { texto, adjuntos } — lee lo
// pegado y devuelve los campos que encontró (no toca el borrador: la pantalla los pone en los
// campos vacíos y guarda como siempre).

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const schema = z.object({
  texto: z.string().max(20_000),
  adjuntos: z.array(z.object({ path: z.string().max(300), tipo: z.string().max(80), nombre: z.string().max(200) })).max(6).default([]),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return invalido("Id inválido");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  if (!parsed.data.texto.trim() && !parsed.data.adjuntos.length) return invalido("Pegá algo o adjuntá un archivo.");
  const quien = await exigirModulo("asistente-comercial", "editar");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    const conv = await conversacionPropia(db, id, quien.userId);
    if (!conv) return NextResponse.json({ error: "No existe ese presupuesto." }, { status: 404 });
    // Sólo los adjuntos de este presupuesto.
    if (parsed.data.adjuntos.some((a) => !a.path.startsWith(`adjuntos/${conv.id}/`))) return invalido("Ese archivo no es de este presupuesto.");
    const b = conv.borrador_id ? await leerBorrador(db, conv.borrador_id) : null;
    const actual = b?.resultado
      ? `${resumenCortoBorrador(b)}\nRenglones: ${b.resultado.lineas.map((l) => `${l.descripcion.split(" — ")[0]} ${l.importe}`).join(" · ")}`
      : null;
    const r = await interpretarPegado({ db, texto: parsed.data.texto, adjuntos: parsed.data.adjuntos, actual });
    return NextResponse.json(r);
  } catch (e) {
    return errorResponse(e);
  }
}
