import { NextRequest, NextResponse } from "next/server";
import { exigirPermisoDeApi } from "@/lib/auth/servidor";
import { createClient } from "@/lib/supabase/server";
import { leerGuardias, respuestaDeError } from "@/lib/planificacion/guardias";

// GET /api/planificacion/guardias?desde=AAAA-MM-DD&hasta=AAAA-MM-DD → GuardiasPayload.
//
// Las guardias del rango en TODOS sus estados, con su historia y sus pedidos a JS. Va en una
// query key propia del tablero (["guardias-tablero", desde, hasta]) y NUNCA bajo ["tablero"]:
// las ACTIVAS ya viajan en el payload del tablero como tareas (ocupan la celda); esto es lo
// que hace falta para dibujar el chip "de guardia", la ficha y el indicador de arriba.
//
// Las rutas que escriben guardias son las de esta carpeta (usar, deshacer, mover, sacar,
// solicitudes, autorizar). Contrato: docs/tablero-planificacion/guardias-contrato.md.

export const dynamic = "force-dynamic";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
/** Un tablero muestra unas semanas; un año entero de historia por pedido no tiene sentido. */
const MAX_DIAS = 120;

export async function GET(req: NextRequest) {
  const quien = await exigirPermisoDeApi(req);
  if (quien instanceof NextResponse) return quien;

  const desde = req.nextUrl.searchParams.get("desde") ?? "";
  const hasta = req.nextUrl.searchParams.get("hasta") ?? "";
  if (!FECHA.test(desde) || !FECHA.test(hasta)) {
    return NextResponse.json({ error: "Faltan 'desde' y 'hasta' (AAAA-MM-DD)." }, { status: 400 });
  }
  if (desde > hasta) return NextResponse.json({ error: "'desde' no puede ser posterior a 'hasta'." }, { status: 400 });
  if ((Date.parse(hasta) - Date.parse(desde)) / 86_400_000 > MAX_DIAS) {
    return NextResponse.json({ error: `El rango no puede pasar de ${MAX_DIAS} días.` }, { status: 400 });
  }

  try {
    return NextResponse.json(await leerGuardias(await createClient(), desde, hasta));
  } catch (e) {
    return respuestaDeError(e, "no se pudieron leer las guardias");
  }
}
