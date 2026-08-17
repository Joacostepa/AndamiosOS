"use client";

import { Users, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { colorCuadrilla } from "@/lib/tablero/colores";
import type { CuadrillaTablero } from "@/lib/tablero/tipos";

// Qué cuadrillas se ven como filas del tablero.
//
// POR QUÉ EXISTE: en Odoo conviven las cuadrillas nominales (punteros históricos, que
// aparecen en los partes viejos) con las numeradas, que son las que se planifican hoy.
// Ninguna se borra, así que la elección de filas es del usuario y se recuerda.

export function SelectorCuadrillas({
  cuadrillas,
  visibles,
  conAsignaciones,
  onChange,
}: {
  cuadrillas: CuadrillaTablero[];
  visibles: number[];
  /** ids con carga en la semana visible: se marcan para no esconder trabajo por error. */
  conAsignaciones: Set<number>;
  onChange: (ids: number[]) => void;
}) {
  function alternar(id: number) {
    onChange(visibles.includes(id) ? visibles.filter((v) => v !== id) : [...visibles, id]);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm">
            <Users className="mr-1.5 h-4 w-4" />
            Cuadrillas ({visibles.length}/{cuadrillas.length})
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="max-h-[70vh] w-64 overflow-y-auto">
        <DropdownMenuLabel>Filas del tablero</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {cuadrillas.map((c, i) => {
          const marcada = visibles.includes(c.id);
          return (
            <DropdownMenuItem
              key={c.id}
              closeOnClick={false}
              onClick={() => alternar(c.id)}
              className="gap-2"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colorCuadrilla(i).borde }}
              />
              <span className="min-w-0 flex-1 truncate">
                {c.nombre}
                {c.tercerizada ? " · terc." : ""}
              </span>
              {conAsignaciones.has(c.id) && !marcada && (
                <span className="text-[10px] text-muted-foreground">con carga</span>
              )}
              {marcada && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onChange(cuadrillas.map((c) => c.id))}>
          Mostrar todas
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onChange([...conAsignaciones])}>
          Solo las que tienen carga
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
