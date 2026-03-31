"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Factory,
  PartyPopper,
  Landmark,
  HardHat,
  Shapes,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SubVertical } from "@/types/cotizacion-form";

const SUB_RUBROS = [
  {
    key: "fachadas" as SubVertical,
    icon: Building2,
    title: "Fachadas",
    description: "Restauración de frentes, andamio completo o bandeja peatonal.",
  },
  {
    key: "industria" as SubVertical,
    icon: Factory,
    title: "Industria",
    description: "Plantas industriales, alto profesionalismo y exigencias de SyH.",
  },
  {
    key: "construccion" as SubVertical,
    icon: HardHat,
    title: "Construcción",
    description: "Obras nuevas, torres, plataformas, garage.",
  },
  {
    key: "obra_publica" as SubVertical,
    icon: Landmark,
    title: "Obra pública",
    description: "Licitaciones, organismos, plazos contractuales.",
  },
  {
    key: "eventos" as SubVertical,
    icon: PartyPopper,
    title: "Eventos",
    description: "Escenarios, tribunas, estructuras temporales.",
  },
  {
    key: "estructuras_especiales" as SubVertical,
    icon: Shapes,
    title: "Otros / Especiales",
    description: "Proyectos no estándar que requieren ingeniería a medida.",
  },
];

export function SubrubroSelector({
  onSelect,
  onBack,
}: {
  onSelect: (subrubro: SubVertical) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<SubVertical | null>(null);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Armado y desarme
        </h1>
        <p className="text-muted-foreground">
          Seleccioná el rubro del trabajo
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl w-full">
        {SUB_RUBROS.map((rubro) => (
          <Card
            key={rubro.key}
            className={cn(
              "cursor-pointer transition-all hover:border-primary/50 hover:shadow-md",
              selected === rubro.key &&
                "border-primary ring-2 ring-primary/20"
            )}
            onClick={() => setSelected(rubro.key)}
          >
            <CardContent className="p-5 space-y-3">
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg",
                  selected === rubro.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <rubro.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">{rubro.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {rubro.description}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          Volver
        </Button>
        <Button
          disabled={!selected}
          onClick={() => selected && onSelect(selected)}
        >
          Continuar
        </Button>
      </div>
    </div>
  );
}
