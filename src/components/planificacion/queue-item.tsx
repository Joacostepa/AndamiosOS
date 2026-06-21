"use client";

import { useDraggable } from "@dnd-kit/core";
import { Clock, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { TIPO_OT_TOKENS } from "@/lib/planificacion/colores";
import { tipoOtKey } from "@/lib/planificacion/estado";
import { otDuracionDias } from "@/lib/planificacion/jornada";
import type { ColaOT } from "@/hooks/use-planificacion";

export function QueueItem({ ot, bloqueada }: { ot: ColaOT; bloqueada: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `ot:${ot.id}`,
    data: { ot },
    disabled: bloqueada,
  });

  const key = tipoOtKey(ot.tipo, ot.es_adicional);
  const t = TIPO_OT_TOKENS[key];
  const dias = otDuracionDias(ot.horas_estimadas);

  if (bloqueada) {
    return (
      <div
        title="Habilitaciones aún no aprobó esta OT"
        className="cursor-not-allowed rounded-md border bg-card p-2 opacity-60"
      >
        <div className="flex items-center justify-between gap-1">
          <p className="min-w-0 truncate text-[11px] font-medium">{ot.obras?.nombre ?? ot.codigo}</p>
          <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <span
            className="rounded px-1.5 py-0.5 text-[9px] font-medium"
            style={{ backgroundColor: t.bg, color: t.text }}
          >
            {t.label}
          </span>
          <span className="text-[9px] text-muted-foreground">Esperando hab.</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab rounded-md border bg-card p-2 transition-colors hover:border-[#D85A30]",
        isDragging && "opacity-40",
      )}
    >
      <p className="truncate text-[11px] font-medium">{ot.obras?.nombre ?? ot.codigo}</p>
      <div className="mt-1 flex items-center justify-between gap-1.5">
        <span
          className="rounded px-1.5 py-0.5 text-[9px] font-medium"
          style={{ backgroundColor: t.bg, color: t.text }}
        >
          {t.label}
        </span>
        {dias && (
          <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            {dias} {dias === 1 ? "día" : "días"}
          </span>
        )}
      </div>
    </div>
  );
}
