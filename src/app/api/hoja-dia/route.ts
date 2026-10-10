import { NextRequest, NextResponse, after } from "next/server";
import { alertarDia, leerDia } from "@/lib/hoja-dia/servicio";
import { accionHoja, accionHojaSchema } from "@/lib/hoja-dia/acciones";
import { conPermiso, fallo, fechaValida, invalidoZod, sesion } from "./_comun";

// GET /api/hoja-dia?fecha=YYYY-MM-DD — el día entero para la pantalla (`DiaHoja`, ver
// src/lib/hoja-dia/tipos.ts): tablero de Odoo, hojas, gente, vehículos, ausencias (con las
// ART de la asistencia), pedidos, viajes, envíos y el día anterior para la precarga.
//
// POST (o PATCH) /api/hoja-dia — un cambio de una hoja: { accion, fecha, … } (ver
// accionHojaSchema). Devuelve { ok, texto, historialId } (historialId es el "Deshacer").

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guardia = await conPermiso(["hoja-dia"], "ver");
  if (guardia instanceof NextResponse) return guardia;
  const fecha = req.nextUrl.searchParams.get("fecha");
  if (!fechaValida(fecha)) return NextResponse.json({ error: "Falta la fecha (YYYY-MM-DD)" }, { status: 400 });
  try {
    const dia = await leerDia(fecha);
    // Los rojos a la campanita, después de responder (no hacen esperar a la pantalla).
    after(() => alertarDia(dia));
    return NextResponse.json(dia);
  } catch (e) {
    return fallo(e);
  }
}

async function cambiar(req: NextRequest) {
  const guardia = await conPermiso(["hoja-dia"], "editar");
  if (guardia instanceof NextResponse) return guardia;
  const parsed = accionHojaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidoZod(parsed.error);
  try {
    return NextResponse.json(await accionHoja(await sesion(), guardia.userId, parsed.data));
  } catch (e) {
    return fallo(e);
  }
}
export const POST = cambiar;
export const PATCH = cambiar;
