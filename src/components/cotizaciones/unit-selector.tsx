"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Home, Layers, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UnidadCotizacion } from "@/types/cotizacion-form";

const UNITS = [
  {
    key: "hogareno" as UnidadCotizacion,
    icon: Home,
    title: "Alquiler hogareño",
    description:
      "Módulos, tablones y ruedas para trabajos en el hogar. Precio por lista según fracción de días + flete.",
  },
  {
    key: "multidireccional" as UnidadCotizacion,
    icon: Layers,
    title: "Multidireccional",
    description:
      "Alquiler de andamio multidireccional por tonelada. Precio por lista con ajustes según urgencia y cliente.",
  },
  {
    key: "armado_desarme" as UnidadCotizacion,
    icon: Wrench,
    title: "Armado y desarme",
    description:
      "Servicio completo: armado, desarme y alquiler. Fachadas, industria, eventos, obra pública y más.",
  },
];

export function UnitSelector({
  onSelect,
}: {
  onSelect: (unidad: UnidadCotizacion) => void;
}) {
  const [selected, setSelected] = useState<UnidadCotizacion | null>(null);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Nueva cotización</h1>
        <p className="text-muted-foreground">
          Seleccioná el tipo de servicio para comenzar
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl w-full">
        {UNITS.map((unit) => (
          <Card
            key={unit.key}
            className={cn(
              "cursor-pointer transition-all hover:border-primary/50 hover:shadow-md",
              selected === unit.key && "border-primary ring-2 ring-primary/20"
            )}
            onClick={() => setSelected(unit.key)}
          >
            <CardContent className="p-6 text-center space-y-4">
              <div
                className={cn(
                  "mx-auto flex h-14 w-14 items-center justify-center rounded-xl",
                  selected === unit.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <unit.icon className="h-7 w-7" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">{unit.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {unit.description}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button
        size="lg"
        disabled={!selected}
        onClick={() => selected && onSelect(selected)}
      >
        Continuar
      </Button>
    </div>
  );
}
