"use client";

import { MoreVertical, Pencil, ArrowLeftRight, RotateCcw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// Menú contextual de un bloque de OT en el tablero (gesto aparte del clic).
export function BlockContextMenu({
  onEditar,
  onMover,
  onVolver,
}: {
  onEditar: () => void;
  onMover: () => void;
  onVolver: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="rounded p-0.5 text-current/70 hover:bg-black/5 hover:text-current"
            aria-label="Opciones"
          />
        }
      >
        <MoreVertical className="h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onEditar}>
          <Pencil className="mr-2 h-4 w-4" />
          Editar jornada
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onMover}>
          <ArrowLeftRight className="mr-2 h-4 w-4" />
          Mover a otro día
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onVolver} style={{ color: "#D85A30" }}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Volver OT a pendiente
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
