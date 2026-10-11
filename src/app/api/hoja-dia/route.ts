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
//
// Odoo (el tablero y la asistencia) sale de un caché en memoria por fecha (servicio.ts):
// `&fresco=1` lo saltea. La pantalla lo pide cuando llega el aviso en vivo del TABLERO
// (alguien movió una obra); para los demás refrescos alcanza con lo guardado.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guardia = await conPermiso(["hoja-dia"], "ver");
  if (guardia instanceof NextResponse) return guardia;
  const fecha = req.nextUrl.searchParams.get("fecha");
  if (!fechaValida(fecha)) return NextResponse.json({ error: "Falta la fecha (YYYY-MM-DD)" }, { status: 400 });
  try {
    const dia = await leerDia(fecha, { fresco: req.nextUrl.searchParams.get("fresco") === "1" });
    // Los rojos a la campanita, después de responder (no hacen esperar a la pantalla). Un
    // día pasado no alerta (alertasDelDia → diaAlertable).
    after(() => alertarDia(dia));
    // El token de cada link es la llave del celular del capataz o del chofer (con él se marca
    // "Hecho"): no viaja a la pantalla. El link se arma en el servidor (envíos).
    return NextResponse.json({ ...dia, envios: dia.envios.map((e) => ({ ...e, token: "" })) });
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
