"use client";

import { useFormContext } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { CotizacionFormData } from "@/types/cotizacion-form";

export function ServiceToggles() {
  const { watch, setValue } = useFormContext<CotizacionFormData>();

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Servicios incluidos
      </h3>
      <div className="flex gap-6">
        <div className="flex items-center gap-2">
          <Switch checked={!!watch("incluye_montaje")} onCheckedChange={(v) => setValue("incluye_montaje", v)} />
          <Label className="text-sm">Montaje</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={!!watch("incluye_desarme")} onCheckedChange={(v) => setValue("incluye_desarme", v)} />
          <Label className="text-sm">Desarme</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={!!watch("incluye_transporte")} onCheckedChange={(v) => setValue("incluye_transporte", v)} />
          <Label className="text-sm">Transporte</Label>
        </div>
      </div>
    </div>
  );
}
