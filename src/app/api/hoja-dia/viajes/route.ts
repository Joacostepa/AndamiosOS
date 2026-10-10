import { NextRequest, NextResponse } from "next/server";
import { accionViaje, accionViajeSchema } from "@/lib/hoja-dia/acciones";
import { conPermiso, fallo, invalidoZod, sesion } from "../_comun";

// POST (o PATCH) /api/hoja-dia/viajes { accion, … } — los camiones (§9): crear un viaje
// (también taller/VTV y fletes de afuera), poner un pedido en un camión, mover, cambiar o
// fijar la hora, volver a la cola, anular, marcar hecho/no pude por el chofer, el chofer
// de cada camión, correr horas. Sólo con Hoja del día en editar: Planificación y el Pañol
// crean pedidos, pero no los ponen en un camión.

export const dynamic = "force-dynamic";

async function cambiar(req: NextRequest) {
  const guardia = await conPermiso(["hoja-dia"], "editar");
  if (guardia instanceof NextResponse) return guardia;
  const parsed = accionViajeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidoZod(parsed.error);
  try {
    return NextResponse.json(await accionViaje(await sesion(), guardia.userId, parsed.data));
  } catch (e) {
    return fallo(e);
  }
}
export const POST = cambiar;
export const PATCH = cambiar;
