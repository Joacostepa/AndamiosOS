"use client";

import { MousePointerClick } from "lucide-react";
import { QueueGroup, BlockedGroup } from "./queue-item";
import { otBucket } from "@/lib/planificacion/estado";
import type { ColaOT, JornadaColaRow } from "@/hooks/use-planificacion";

export type GrupoCola = { ot: ColaOT; jornadas: JornadaColaRow[] };

// Cola de OTs agrupadas por jornadas. Solo se muestran grupos con jornadas pendientes.
export function OtQueue({
  grupos,
  onAsignarFueraDeOrden,
}: {
  grupos: GrupoCola[];
  onAsignarFueraDeOrden: (ot: ColaOT, jornada: JornadaColaRow) => void;
}) {
  const conPendientes = grupos.filter((g) => g.jornadas.some((j) => j.estado === "pendiente"));
  const habilitadas = conPendientes.filter((g) => otBucket(g.ot) === "habilitada");
  const pendientes = conPendientes.filter((g) => otBucket(g.ot) === "pendiente_hab");
  const total = habilitadas.length + pendientes.length;

  return (
    <div className="flex h-full w-full flex-col gap-2 pl-3">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">Sin asignar</p>
        <span className="rounded-full px-1.5 text-[11px] font-medium" style={{ backgroundColor: "#FAEEDA", color: "#854F0B" }}>
          {total}
        </span>
      </div>

      {total > 0 ? (
        <>
          <div className="flex items-center gap-1.5 rounded-md border border-dashed p-1.5 text-[10px] text-muted-foreground">
            <MousePointerClick className="h-3 w-3" />
            Arrastrá una jornada al tablero
          </div>
          <div className="space-y-2 overflow-y-auto">
            {habilitadas.map((g) => (
              <QueueGroup key={g.ot.id} ot={g.ot} jornadas={g.jornadas} onAsignarFueraDeOrden={onAsignarFueraDeOrden} />
            ))}
            {pendientes.map((g) => (
              <BlockedGroup key={g.ot.id} ot={g.ot} />
            ))}
          </div>
        </>
      ) : (
        <p className="px-1 py-6 text-center text-[11px] text-muted-foreground">No hay jornadas sin asignar.</p>
      )}
    </div>
  );
}
