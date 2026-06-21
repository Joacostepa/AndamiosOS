"use client";

import { ChevronLeft, ChevronRight, Ban, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BoardTopbar({
  rangoLabel,
  vista,
  onVista,
  onPrev,
  onNext,
  onHoy,
  onBloquear,
  onAsignar,
}: {
  rangoLabel: string;
  vista: "semana" | "dia";
  onVista: (v: "semana" | "dia") => void;
  onPrev: () => void;
  onNext: () => void;
  onHoy: () => void;
  onBloquear: () => void;
  onAsignar: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 pb-3">
      <h1 className="text-[15px] font-medium">Planificación</h1>

      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="size-7" onClick={onPrev} aria-label="Semana anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[150px] text-center text-sm font-medium">{rangoLabel}</span>
        <Button variant="outline" size="icon" className="size-7" onClick={onNext} aria-label="Semana siguiente">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" className="ml-1" onClick={onHoy}>
          Hoy
        </Button>
      </div>

      {/* Toggle Semana | Día */}
      <div className="flex overflow-hidden rounded-md border">
        {(["semana", "dia"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onVista(v)}
            className={cn(
              "px-3 py-1 text-xs capitalize transition-colors",
              vista === v ? "text-white" : "text-muted-foreground hover:bg-muted",
            )}
            style={vista === v ? { backgroundColor: "#D85A30" } : undefined}
          >
            {v === "semana" ? "Semana" : "Día"}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onBloquear}>
          <Ban className="mr-1.5 h-4 w-4" />
          Bloquear horario
        </Button>
        <Button size="sm" onClick={onAsignar} style={{ backgroundColor: "#D85A30", color: "#fff" }}>
          <Plus className="mr-1.5 h-4 w-4" />
          Asignar OT
        </Button>
      </div>
    </div>
  );
}
