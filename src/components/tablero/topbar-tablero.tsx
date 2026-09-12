"use client";

import { CalendarX2, ChevronLeft, ChevronRight, History, Loader2, RefreshCw } from "lucide-react";
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
  onActividad,
  onCorrerDia,
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
  /** Abre el panel de actividad. Un ícono, en un lugar que ya estaba vacío. */
  onActividad: () => void;
  /** Abre el diálogo de suspender un día y correr lo que había. */
  onCorrerDia: () => void;
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
        {/* CON TEXTO Y NO CON ÍCONO, a diferencia de la actividad: es la acción más
            grande del tablero —un clic mueve treinta jornadas— y un ícono suelto se
            aprieta por accidente. Que haya que leer qué dice es parte del freno.
            NO VA EN EL ENCABEZADO DEL DÍA, que sería el lugar natural: ese ya es agarre
            para desplazar la grilla, botón para abrir el domingo y disparador del popover
            de notas. Un cuarto gesto ahí adentro no entra. */}
        <Button variant="outline" size="sm" onClick={onCorrerDia}>
          <CalendarX2 className="mr-1.5 h-4 w-4" />
          Correr un día
        </Button>
        {/* La actividad entra por un ícono y no por un panel fijo: en el tablero no
            sobra un píxel, y esto se consulta de vez en cuando. Al lado de Refrescar
            porque las dos son acciones sobre el tablero entero, no sobre una obra. */}
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={onActividad}
          aria-label="Actividad del tablero"
          title="Quién movió qué, y cuándo"
        >
          <History className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={onRefrescar} disabled={refrescando}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${refrescando ? "animate-spin" : ""}`} />
          Refrescar
        </Button>
      </div>
    </div>
  );
}
