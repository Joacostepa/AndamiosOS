"use client";

import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CotizacionFormData } from "@/types/cotizacion-form";

const FRACCIONES = [10, 20, 30] as const;

export function FormHogareno() {
  const { register, watch, setValue } =
    useFormContext<CotizacionFormData>();
  const fraccion = watch("fraccion_dias");
  const ruedas = watch("metadata.ruedas" as any) as boolean | undefined;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Datos del alquiler hogareño
      </h3>

      <div className="space-y-2">
        <Label>Tipo de trabajo del cliente</Label>
        <Textarea
          {...register("tipo_trabajo_cliente")}
          rows={2}
          placeholder="Ej: Pintura de frente, reparación de balcón, limpieza de canaleta..."
          data-field="tipo_trabajo_cliente"
        />
      </div>

      <div className="space-y-2">
        <Label>Fracción de alquiler *</Label>
        <div className="flex gap-2">
          {FRACCIONES.map((f) => (
            <Button
              key={f}
              type="button"
              variant={fraccion === f ? "default" : "outline"}
              className={cn("flex-1")}
              onClick={() => setValue("fraccion_dias", f)}
              data-field="fraccion_dias"
            >
              {f} días
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Módulos - Tamaño</Label>
          <Input
            {...register("metadata.modulos_tamano" as any)}
            placeholder="Ej: 1.00m, 1.50m, 2.00m"
            data-field="modulos_tamano"
          />
        </div>
        <div className="space-y-2">
          <Label>Módulos - Cantidad</Label>
          <Input
            type="number"
            min={0}
            {...register("metadata.modulos_cantidad" as any, {
              valueAsNumber: true,
            })}
            placeholder="0"
            data-field="modulos_cantidad"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Tablones - Cantidad</Label>
        <Input
          type="number"
          min={0}
          {...register("metadata.tablones_cantidad" as any, {
            valueAsNumber: true,
          })}
          placeholder="0"
          data-field="tablones_cantidad"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Ruedas</Label>
          <p className="text-xs text-muted-foreground">
            Para andamio móvil
          </p>
        </div>
        <Switch
          checked={!!ruedas}
          onCheckedChange={(v) => setValue("metadata.ruedas" as any, v)}
          data-field="ruedas"
        />
      </div>

      {ruedas && (
        <div className="space-y-2">
          <Label>Cantidad de ruedas</Label>
          <Input
            type="number"
            min={0}
            {...register("metadata.ruedas_cantidad" as any, {
              valueAsNumber: true,
            })}
            placeholder="4"
            data-field="ruedas_cantidad"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>Zona de entrega</Label>
        <Input
          {...register("zona_entrega")}
          placeholder="Ej: Belgrano, Palermo, GBA Norte..."
          data-field="zona_entrega"
        />
      </div>
    </div>
  );
}
