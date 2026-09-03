import { NextRequest, NextResponse } from "next/server";
import { climaDelRango } from "@/lib/clima/pronostico";

// GET /api/clima?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
//
// Lluvia y viento por día para el encabezado del tablero. Va por el servidor y no directo
// desde el browser por lo mismo que los feriados —el cacheado es UNO para todos, no uno
// por navegador— y por dos razones propias de esta fuente: MET Norway exige un User-Agent
// que identifique a la aplicación, que desde el browser no se puede fijar, y pide no
// machacar el servicio. Ruta protegida por sesión (no está en publicPaths del middleware).

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const desde = req.nextUrl.searchParams.get("desde");
  const hasta = req.nextUrl.searchParams.get("hasta");

  if (!desde || !hasta || !FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta) {
    return NextResponse.json({ error: "Parámetros 'desde' y 'hasta' (YYYY-MM-DD) requeridos" }, { status: 400 });
  }

  // Nunca falla: si el servicio no contesta, climaDelRango devuelve vacío y el encabezado
  // se queda sin chips. Que el tablero no cargue por el clima sería absurdo.
  return NextResponse.json({ clima: await climaDelRango(desde, hasta) });
}
