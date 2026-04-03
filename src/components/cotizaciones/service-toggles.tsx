"use client";

import { useFormContext } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { CotizacionFormData } from "@/types/cotizacion-form";

const SERVICES = [
  { key: "incluye_montaje", label: "Montaje" },
  { key: "incluye_desarme", label: "Desarme" },
  { key: "incluye_transporte", label: "Transporte" },
  { key: "metadata.incluye_ingenieria", label: "Ingeniería" },
  { key: "metadata.incluye_permiso", label: "Gestoría permiso" },
  { key: "metadata.incluye_syh", label: "Seguridad e higiene" },
];

export function ServiceToggles() {
  const { watch, setValue } = useFormContext<CotizacionFormData>();

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Servicios incluidos
      </h3>
      <div className="flex gap-4 flex-wrap">
        {SERVICES.map((svc) => (
          <div key={svc.key} className="flex items-center gap-2">
            <Switch
              checked={!!(watch(svc.key as any) as boolean)}
              onCheckedChange={(v) => setValue(svc.key as any, v)}
            />
            <Label className="text-sm">{svc.label}</Label>
          </div>
        ))}
      </div>
    </div>
  );
}
