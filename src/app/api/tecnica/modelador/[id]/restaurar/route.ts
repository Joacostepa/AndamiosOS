import { NextRequest, NextResponse } from "next/server";
import { traducirErrorDb } from "@/lib/tecnica/persistencia/servidor";
import { fallo, guardia, idInvalido, idValido, sesion } from "../../_comun";

// POST /api/tecnica/modelador/[id]/restaurar → 204
// Deshace el «Eliminar» de la lista: el modelo vuelve (DELETE lo archiva, no lo borra, porque un
// cómputo puede apuntar a él).

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardia("editar");
  if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  if (!idValido(id)) return idInvalido();
  try {
    const db = await sesion();
    const { data, error } = await db.from("tec_modelos").update({ archivado_at: null }).eq("id", id).not("archivado_at", "is", null).select("id").maybeSingle();
    if (error) throw traducirErrorDb(error, "No se pudo restaurar el modelo.");
    if (!data) return NextResponse.json({ error: "No encuentro el modelo eliminado." }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return fallo(e);
  }
}
