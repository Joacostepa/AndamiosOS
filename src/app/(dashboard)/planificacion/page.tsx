"use client";

// El Tablero de Planificación de Cuadrillas reemplaza al módulo anterior (que
// planificaba por horas contra Supabase). Este trabaja con fracciones de jornada y
// persiste en Odoo. El código del tablero viejo sigue en src/components/planificacion
// porque maneja camiones, viajes y bloqueos de franja, que acá quedan fuera de alcance.
import { TableroBoard } from "@/components/tablero/tablero-board";

export default function PlanificacionPage() {
  return <TableroBoard />;
}
