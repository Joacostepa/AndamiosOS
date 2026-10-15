import { NextRequest, NextResponse } from "next/server";
import { contextoComputo, previaDesde } from "@/lib/tecnica/persistencia/servidor";
import { previaSchema } from "@/lib/tecnica/persistencia/validar";
import { fallo, guardia, idInvalido, idValido, invalido, leerJson, sesion, sinCache } from "../../../_comun";

// POST /api/tecnica/modelador/[id]/computo/previa — { obra_id, revision }
// → PreviaComputo: qué haría «Generar cómputo» (nuevo / cambia / quita / conflicto con lo editado a mano),
// qué líneas quedan afuera por no tener código, y si el cómputo está bloqueado (completado).
// No escribe nada. Recalcula el modelo EN EL SERVIDOR desde el diseño guardado.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardia("editar", { computos: true });
  if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  if (!idValido(id)) return idInvalido();
  const p = previaSchema.safeParse(await leerJson(req));
  if (!p.success) return invalido(p.error);
  try {
    const c = await contextoComputo(await sesion(), id, p.data.obra_id, p.data.revision);
    return NextResponse.json(previaDesde(c, id), { headers: sinCache });
  } catch (e) {
    return fallo(e);
  }
}
