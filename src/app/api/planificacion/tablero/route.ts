import { NextRequest, NextResponse } from "next/server";
import { fetchTablero } from "@/lib/odoo/asignaciones";
import { OdooError } from "@/lib/odoo/client";
import { createClient } from "@/lib/supabase/server";
import { tareasEnRango } from "@/lib/tablero/tareas";

// GET /api/planificacion/tablero?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
//
// Devuelve la semana completa en una sola llamada: cuadrillas activas, asignaciones
// del rango, OTs candidatas, partes diarios del rango y qué OTs ya están asignadas.
// Ruta protegida por sesión (no está en publicPaths del middleware).
//
// ACÁ SE JUNTAN LAS DOS BASES, y en ningún otro lado. Las obras vienen de Odoo y las
// tarjetas de operaciones de Supabase, y salen mezcladas en el mismo array de
// asignaciones: de acá para arriba —capacidad de la celda, armado de bloques, grilla—
// nadie sabe que hay dos fuentes. Ver src/lib/tablero/tareas.ts.

export const dynamic = "force-dynamic";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const desde = req.nextUrl.searchParams.get("desde");
  const hasta = req.nextUrl.searchParams.get("hasta");

  if (!desde || !hasta || !FECHA.test(desde) || !FECHA.test(hasta)) {
    return NextResponse.json({ error: "Parámetros 'desde' y 'hasta' (YYYY-MM-DD) requeridos" }, { status: 400 });
  }
  if (desde > hasta) {
    return NextResponse.json({ error: "'desde' no puede ser posterior a 'hasta'" }, { status: 400 });
  }

  try {
    const db = await createClient();
    // En paralelo: son dos servicios distintos y ninguno depende del otro. Odoo es el
    // lento de los dos, así que las tareas viajan gratis.
    const [payload, tareas] = await Promise.all([
      fetchTablero(desde, hasta),
      tareasEnRango(db, desde, hasta),
    ]);
    return NextResponse.json({
      ...payload,
      asignaciones: [...payload.asignaciones, ...tareas],
    });
  } catch (e) {
    const msg = e instanceof OdooError ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
