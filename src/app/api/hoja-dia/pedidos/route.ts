import { NextRequest, NextResponse } from "next/server";
import { accionPedido, accionPedidoSchema } from "@/lib/hoja-dia/acciones";
import { conPermiso, fallo, invalidoZod, sesion } from "../_comun";

// POST (o PATCH) /api/hoja-dia/pedidos { accion, … } — la cola (§7).
//
// "crear" lo pueden hacer Hoja del día, Planificación (el "Pasar a pedido" del cajón) y el
// Pañol (el depósito pide un viaje), en editar. Todo lo demás (esperar, pasar a mañana,
// anular, los sugeridos) es del coordinador: Hoja del día en editar.

export const dynamic = "force-dynamic";

async function cambiar(req: NextRequest) {
  const parsed = accionPedidoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidoZod(parsed.error);
  const guardia = await conPermiso(parsed.data.accion === "crear" ? ["hoja-dia", "planificacion", "panol"] : ["hoja-dia"], "editar");
  if (guardia instanceof NextResponse) return guardia;
  try {
    return NextResponse.json(await accionPedido(await sesion(), guardia.userId, parsed.data));
  } catch (e) {
    return fallo(e);
  }
}
export const POST = cambiar;
export const PATCH = cambiar;
