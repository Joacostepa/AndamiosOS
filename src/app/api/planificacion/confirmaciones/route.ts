import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { historialDeOt } from "@/lib/planificacion/confirmaciones";

// Historial de confirmaciones de una obra.
//
//   GET ?otId=123 → quién confirmó (o desconfirmó) cada jornada, lo último primero
//
// Sólo LEE. El registro se escribe en el PATCH de /api/planificacion/asignaciones, en la
// misma request que cambia el estado, para que no se pueda cambiar sin dejar rastro.
//
// Ruta aparte y no un campo más del payload del tablero, por lo mismo que las notas
// fijadas de habilitaciones: el tablero trae ~50 OTs en la llamada que más se repite, y
// esto no hace falta hasta que alguien abre una tarjeta.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const otId = Number(req.nextUrl.searchParams.get("otId"));
  if (!Number.isInteger(otId) || otId <= 0) {
    return NextResponse.json({ error: "Parámetro 'otId' inválido" }, { status: 400 });
  }
  try {
    const db = await createClient();
    return NextResponse.json({ confirmaciones: await historialDeOt(db, otId) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
