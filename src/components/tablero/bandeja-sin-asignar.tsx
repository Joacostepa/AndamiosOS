"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { MousePointerClick, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { semaforo, CORAL, ACENTO_BG, URGENCIA_ALTA_BORDE } from "@/lib/tablero/colores";
import { fraccionLabel } from "@/lib/tablero/fracciones";
import type { OtTablero } from "@/lib/tablero/tipos";

// Bandeja de obras sin asignar. Se arrastra desde acá a una celda de la grilla, y
// arrastrar una tarjeta de la grilla hasta acá la devuelve a la bandeja.
//
// REGLA DE NEGOCIO: las obras sin habilitar entran igual al tablero — la fecha se
// acuerda con el cliente mientras el trámite avanza en paralelo. El semáforo advierte.

export const ID_BANDEJA = "bandeja";

function TarjetaOt({ ot }: { ot: OtTablero }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `ot:${ot.id}`,
    data: { ot },
  });
  const sem = semaforo(ot.habSemaforo);
  const urgente = ot.urgencia === "alta";

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="cursor-grab rounded-md border bg-card p-1.5 active:cursor-grabbing"
      style={{
        opacity: isDragging ? 0.35 : 1,
        borderLeft: urgente ? `3px solid ${URGENCIA_ALTA_BORDE}` : undefined,
      }}
    >
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-[10px] font-medium" title={ot.titulo}>
          {ot.titulo}
        </span>
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: sem.color }}
          title={sem.label}
        />
      </div>
      <p className="truncate text-[9px] text-muted-foreground">
        {ot.jornadas >= 1
          ? `${ot.jornadas} jornada${ot.jornadas === 1 ? "" : "s"}`
          : `${fraccionLabel(ot.jornadas)} de jornada`}
        {ot.tecnico ? ` · ${ot.tecnico}` : ""}
        {ot.fechaProgramada
          ? ` · prev. ${format(parseISO(ot.fechaProgramada), "d MMM", { locale: es })}`
          : ""}
      </p>
    </div>
  );
}

export function BandejaSinAsignar({ ots, alto }: { ots: OtTablero[]; alto: number }) {
  const { setNodeRef, isOver, active } = useDroppable({ id: ID_BANDEJA });
  // Solo se resalta cuando lo que se arrastra es una tarjeta de la grilla.
  const soltando = isOver && String(active?.id ?? "").startsWith("bloque:");

  const ordenadas = [...ots].sort((a, b) => {
    if ((a.urgencia === "alta") !== (b.urgencia === "alta")) return a.urgencia === "alta" ? -1 : 1;
    return (a.fechaProgramada ?? "9999").localeCompare(b.fechaProgramada ?? "9999");
  });

  return (
    <div
      ref={setNodeRef}
      className={cn("flex shrink-0 flex-col gap-2 border-t p-3 transition-colors")}
      style={{
        height: alto,
        backgroundColor: soltando ? ACENTO_BG : undefined,
        outline: soltando ? `2px dashed ${CORAL}` : undefined,
        outlineOffset: "-4px",
      }}
    >
      <div className="flex items-center gap-2">
        <Inbox className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
          Sin asignar
        </p>
        <span
          className="rounded-full px-1.5 text-[11px] font-medium"
          style={{ backgroundColor: "#FAEEDA", color: "#854F0B" }}
        >
          {ordenadas.length}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <MousePointerClick className="h-3 w-3" />
          {soltando ? "Soltá para devolver a sin asignar" : "Arrastrá una obra a una celda"}
        </span>
      </div>

      {ordenadas.length > 0 ? (
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-1.5 overflow-y-auto">
          {ordenadas.map((ot) => (
            <TarjetaOt key={ot.id} ot={ot} />
          ))}
        </div>
      ) : (
        <p className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground">
          No quedan obras sin asignar.
        </p>
      )}
    </div>
  );
}
