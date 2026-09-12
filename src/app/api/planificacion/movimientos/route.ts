import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { movimientosDeOt, movimientosRecientes } from "@/lib/planificacion/movimientos";
import { confirmacionesRecientes } from "@/lib/planificacion/confirmaciones";
import type { EntradaActividad } from "@/lib/tablero/tipos-movimiento";

// GET /api/planificacion/movimientos            → la actividad del tablero entero
// GET /api/planificacion/movimientos?otId=1143  → sólo la de esa obra
//
// UNA LÍNEA DE TIEMPO CON DOS FUENTES. Los movimientos (mover, crear, quitar, fracción)
// viven en plan_movimientos y los cambios de estado en plan_confirmaciones, que existía
// antes y tiene su propia granularidad. Se mezclan ACÁ y no en la base: son conjuntos
// disjuntos —ninguna acción se anota en las dos— así que nada se ve repetido, y ninguna
// de las dos tablas tuvo que cambiar de forma para convivir.
//
// NO TOCA ODOO. El título de la obra viene denormalizado en el movimiento; una
// confirmación no lo tiene, así que se completa con el de cualquier movimiento de la
// misma OT y, si no hay ninguno, queda el número. Un RPC por línea para maquillar eso
// sería pagar ~800 ms por una pantalla que se abre de vez en cuando.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const crudo = req.nextUrl.searchParams.get("otId");
  const otId = crudo ? Number(crudo) : null;
  if (crudo && (!Number.isInteger(otId) || (otId ?? 0) <= 0)) {
    return NextResponse.json({ error: "Id de OT inválido" }, { status: 400 });
  }

  try {
    const db = await createClient();

    // La ficha de una obra: sólo sus movimientos. Las confirmaciones de esa obra ya las
    // muestra HistorialConfirmacion, que vive dos centímetros más arriba en el panel.
    if (otId) {
      const movimientos = await movimientosDeOt(db, otId);
      return NextResponse.json({
        actividad: movimientos.map((m) => ({ tipo: "movimiento" as const, movimiento: m })),
      });
    }

    const [movimientos, confirmaciones] = await Promise.all([
      movimientosRecientes(db),
      confirmacionesRecientes(db),
    ]);

    const titulos = new Map<number, string>();
    for (const m of movimientos) if (m.otTitulo) titulos.set(m.otId, m.otTitulo);

    const actividad: EntradaActividad[] = [
      ...movimientos.map((m) => ({ tipo: "movimiento" as const, movimiento: m })),
      ...confirmaciones.map((c) => ({
        tipo: "confirmacion" as const,
        confirmacion: { ...c, otTitulo: titulos.get(c.otId) ?? null },
      })),
    ].sort((a, b) => fechaDe(b).localeCompare(fechaDe(a)));

    return NextResponse.json({ actividad });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

function fechaDe(e: EntradaActividad): string {
  return e.tipo === "movimiento" ? e.movimiento.createdAt : e.confirmacion.createdAt;
}
