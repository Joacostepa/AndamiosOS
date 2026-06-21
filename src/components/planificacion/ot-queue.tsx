"use client";

import { MousePointerClick } from "lucide-react";
import { QueueItem } from "./queue-item";
import { otBucket } from "@/lib/planificacion/estado";
import type { ColaOT } from "@/hooks/use-planificacion";

// Cola de OTs sin asignar: habilitadas (arrastrables) + pendientes de habilitación (candado).
export function OtQueue({ ots }: { ots: ColaOT[] }) {
  const habilitadas = ots.filter((o) => otBucket(o) === "habilitada");
  const pendientes = ots.filter((o) => otBucket(o) === "pendiente_hab");
  const total = habilitadas.length + pendientes.length;

  return (
    <div className="flex w-[172px] shrink-0 flex-col gap-2 border-l pl-3">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
          Sin asignar
        </p>
        <span
          className="rounded-full px-1.5 text-[11px] font-medium"
          style={{ backgroundColor: "#FAEEDA", color: "#854F0B" }}
        >
          {total}
        </span>
      </div>

      {total > 0 ? (
        <>
          <div className="flex items-center gap-1.5 rounded-md border border-dashed p-1.5 text-[10px] text-muted-foreground">
            <MousePointerClick className="h-3 w-3" />
            Arrastrá al tablero
          </div>
          <div className="space-y-1.5 overflow-y-auto">
            {habilitadas.map((ot) => (
              <QueueItem key={ot.id} ot={ot} bloqueada={false} />
            ))}
            {pendientes.map((ot) => (
              <QueueItem key={ot.id} ot={ot} bloqueada />
            ))}
          </div>
        </>
      ) : (
        <p className="px-1 py-6 text-center text-[11px] text-muted-foreground">
          No hay OTs sin asignar.
        </p>
      )}
    </div>
  );
}
