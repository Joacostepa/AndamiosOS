"use client";

import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

// Celda droppable recurso×día. Acepta drops de la cola (DndContext) y muestra los bloques.
export function GridCell({
  recursoTipo,
  recursoId,
  fecha,
  esHoy,
  canAdd,
  onAdd,
  children,
}: {
  recursoTipo: "cuadrilla" | "camion";
  recursoId: string;
  fecha: string;
  esHoy: boolean;
  canAdd: boolean;
  onAdd?: () => void;
  children?: React.ReactNode;
}) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `cell:${recursoTipo}:${recursoId}:${fecha}`,
    data: { recursoTipo, recursoId, fecha },
  });
  const dropActivo = isOver && !!active;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/cell relative min-h-[90px] space-y-1 border-b border-r p-1",
      )}
      style={{
        backgroundColor: dropActivo
          ? "#FAECE7"
          : esHoy
            ? "rgba(216,90,48,0.03)"
            : undefined,
        outline: dropActivo ? "2px dashed #D85A30" : undefined,
        outlineOffset: "-2px",
      }}
    >
      {children}
      {canAdd && onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="hidden h-[22px] w-full items-center justify-center rounded border border-dashed text-[10px] text-muted-foreground group-hover/cell:flex hover:bg-muted/60"
        >
          <Plus className="mr-0.5 h-3 w-3" />
          OT
        </button>
      )}
    </div>
  );
}
