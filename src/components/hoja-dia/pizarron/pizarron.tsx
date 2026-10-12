"use client";

// El Pizarrón del día (F0: el lugar; F1 lo llena). Ver docs/equipos-del-dia/rediseno-plan.md.

import { PestanasPlanificacion } from "@/components/hoja-dia/comunes/pestanas-planificacion";

export function Pizarron() {
  return (
    <div className="grid gap-3">
      <PestanasPlanificacion className="self-start" />
      <p className="text-sm text-muted-foreground">El Pizarrón del día está en construcción.</p>
    </div>
  );
}
