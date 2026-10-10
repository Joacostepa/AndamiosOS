import { NextRequest, NextResponse } from "next/server";
import { precargar, precargaSchema } from "@/lib/hoja-dia/acciones";
import { conPermiso, fallo, invalidoZod, sesion } from "../_comun";

// POST /api/hoja-dia/precarga { fecha, modo: "hoy" | "plantel" | "vacio" } — "Empezar como
// hoy", "con el plantel base" o "vacío" (§8). Crea las hojas de las cuadrillas con obras
// que todavía no tienen. Devuelve { ok, texto, historialId, avisos[] }: los avisos son lo
// que la pantalla muestra ("Medina no entra: ART desde el 13/10…").

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guardia = await conPermiso(["hoja-dia"], "editar");
  if (guardia instanceof NextResponse) return guardia;
  const parsed = precargaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidoZod(parsed.error);
  try {
    return NextResponse.json(await precargar(await sesion(), guardia.userId, parsed.data.fecha, parsed.data.modo));
  } catch (e) {
    return fallo(e);
  }
}
