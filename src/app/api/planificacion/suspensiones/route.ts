import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { borrarSuspension, suspensionesEnRango } from "@/lib/planificacion/suspensiones";

// Días suspendidos del tablero (plan_suspensiones).
//
//   GET    ?desde&hasta  → las marcas de ese rango
//   DELETE { id }        → quitar una marca puesta por error
//
// Se crean y se levantan solas desde /api/planificacion/corrimiento: correr el día pone
// la marca y deshacerlo la saca. Acá no hay POST a propósito: una suspensión sin
// corrimiento sería un día marcado con el trabajo todavía adentro.

export const dynamic = "force-dynamic";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD");

function errorResponse(e: unknown) {
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
}

export async function GET(req: NextRequest) {
  const desde = req.nextUrl.searchParams.get("desde") ?? "";
  const hasta = req.nextUrl.searchParams.get("hasta") ?? "";
  if (!fecha.safeParse(desde).success || !fecha.safeParse(hasta).success) {
    return NextResponse.json({ error: "Parámetros 'desde' y 'hasta' inválidos" }, { status: 400 });
  }
  try {
    const db = await createClient();
    return NextResponse.json({ suspensiones: await suspensionesEnRango(db, desde, hasta) });
  } catch (e) {
    return errorResponse(e);
  }
}

const borrarSchema = z.object({ id: z.string().uuid() });

export async function DELETE(req: NextRequest) {
  const parsed = borrarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Suspensión inválida" }, { status: 400 });
  try {
    const db = await createClient();
    await borrarSuspension(db, parsed.data.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
