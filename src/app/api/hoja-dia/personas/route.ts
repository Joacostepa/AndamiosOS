import { NextRequest, NextResponse } from "next/server";
import { accionPersona, accionPersonaSchema } from "@/lib/hoja-dia/acciones";
import { conPermiso, fallo, invalidoZod } from "../_comun";

// POST /api/hoja-dia/personas { accion: "celular", personaId, telefono } — "Cargar celular"
// desde la hoja (se guarda en Legajos) y { accion: "puede_estar_a_cargo", personaId, valor }.
// Escribe Legajos con la service role: `personal` lo editan por rol admin y operativo, y
// esto lo necesita quien arma la hoja. Queda en el historial.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guardia = await conPermiso(["hoja-dia"], "editar");
  if (guardia instanceof NextResponse) return guardia;
  const parsed = accionPersonaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidoZod(parsed.error);
  try {
    return NextResponse.json(await accionPersona(guardia.userId, parsed.data));
  } catch (e) {
    return fallo(e);
  }
}
