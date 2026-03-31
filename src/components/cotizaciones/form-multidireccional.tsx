"use client";

import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CotizacionFormData } from "@/types/cotizacion-form";

export function FormMultidireccional() {
  const { register, watch, setValue } =
    useFormContext<CotizacionFormData>();

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Datos del alquiler multidireccional
      </h3>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tonelaje estimado *</Label>
          <Input
            type="number"
            step="0.1"
            min={0}
            {...register("tonelaje_estimado", { valueAsNumber: true })}
            placeholder="Ej: 5.5"
            data-field="tonelaje_estimado"
          />
        </div>
        <div className="space-y-2">
          <Label>Plazo de alquiler (meses)</Label>
          <Input
            type="number"
            min={1}
            {...register("plazo_alquiler_meses", { valueAsNumber: true })}
            placeholder="Ej: 3"
            data-field="plazo_alquiler_meses"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tipo de cliente</Label>
          <Select
            value={watch("metadata.tipo_cliente" as any) as string || ""}
            onValueChange={(val) =>
              val && setValue("metadata.tipo_cliente" as any, val)
            }
          >
            <SelectTrigger data-field="tipo_cliente">
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="directo">Directo</SelectItem>
              <SelectItem value="constructora">Constructora</SelectItem>
              <SelectItem value="subcontratista">Subcontratista</SelectItem>
              <SelectItem value="industria">Industria</SelectItem>
              <SelectItem value="gobierno">Gobierno</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Urgencia</Label>
          <Select
            value={watch("urgencia") || ""}
            onValueChange={(val) => val && setValue("urgencia", val)}
          >
            <SelectTrigger data-field="urgencia">
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
              <SelectItem value="muy_urgente">Muy urgente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Ubicación / Zona</Label>
        <Input
          {...register("ubicacion")}
          placeholder="Ej: Planta Toyota Zárate, CABA Centro..."
          data-field="ubicacion"
        />
      </div>
    </div>
  );
}
