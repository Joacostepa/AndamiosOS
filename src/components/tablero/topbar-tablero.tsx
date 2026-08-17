"use client";

import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectorCuadrillas } from "./selector-cuadrillas";
import type { CuadrillaTablero } from "@/lib/tablero/tipos";

export function TopbarTablero({
  rangoLabel,
  cuadrillas,
  visibles,
  conAsignaciones,
  guardando,
  refrescando,
  onCuadrillas,
  onPrev,
  onNext,
  onHoy,
  onRefrescar,
}: {
  rangoLabel: string;
  cuadrillas: CuadrillaTablero[];
  visibles: number[];
  conAsignaciones: Set<number>;
  guardando: boolean;
  refrescando: boolean;
  onCuadrillas: (ids: number[]) => void;
  onPrev: () => void;
  onNext: () => void;
  onHoy: () => void;
  onRefrescar: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 pb-3">
      <h1 className="text-[15px] font-medium">Planificación</h1>

      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="size-7" onClick={onPrev} aria-label="Semana anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[170px] text-center text-sm font-medium">{rangoLabel}</span>
        <Button variant="outline" size="icon" className="size-7" onClick={onNext} aria-label="Semana siguiente">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" className="ml-1" onClick={onHoy}>
          Hoy
        </Button>
      </div>

      <SelectorCuadrillas
        cuadrillas={cuadrillas}
        visibles={visibles}
        conAsignaciones={conAsignaciones}
        onChange={onCuadrillas}
      />

      <div className="ml-auto flex items-center gap-3">
        {/* Las escrituras van a Odoo de a una; este es el único indicador de que algo viaja. */}
        {guardando && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Guardando en Odoo…
          </span>
        )}
        <Button variant="outline" size="sm" onClick={onRefrescar} disabled={refrescando}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${refrescando ? "animate-spin" : ""}`} />
          Refrescar
        </Button>
      </div>
    </div>
  );
}
