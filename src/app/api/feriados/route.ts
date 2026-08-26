import { NextRequest, NextResponse } from "next/server";
import { feriadosDelRango } from "@/lib/feriados/argentina";

// GET /api/feriados?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
//
// Feriados nacionales del rango. Va por el servidor y no directo desde el browser para
// que el cacheado sea UNO para todos —los feriados son los mismos para cualquiera— y
// para que la app no dependa de que el navegador del usuario pueda salir a un tercero.
// Ruta protegida por sesión (no está en publicPaths del middleware).

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const desde = req.nextUrl.searchParams.get("desde");
  const hasta = req.nextUrl.searchParams.get("hasta");

  if (!desde || !hasta || !FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta) {
    return NextResponse.json({ error: "Parámetros 'desde' y 'hasta' (YYYY-MM-DD) requeridos" }, { status: 400 });
  }

  // Nunca falla: sin la API de terceros, feriadosDelRango cae al respaldo local. Que el
  // tablero se quede sin feriados es un detalle; que no cargue, no.
  return NextResponse.json({ feriados: await feriadosDelRango(desde, hasta) });
}
