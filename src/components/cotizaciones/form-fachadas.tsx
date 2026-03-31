"use client";

import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CotizacionFormData } from "@/types/cotizacion-form";

const TIPO_PRODUCTO = [
  {
    key: "andamio_completo",
    title: "Andamio completo",
    description: "Estructura completa con bandeja fenólico, escaleras, tablones y mediasombra. Se cotiza por m².",
  },
  {
    key: "bandeja_peatonal",
    title: "Bandeja de protección peatonal",
    description: "Bandeja debajo del primer balcón para silleteros. Se cotiza por metro lineal.",
  },
];

export function FormFachadas() {
  const { register, watch, setValue } = useFormContext<CotizacionFormData>();
  const tipoProducto = (watch("metadata.tipo_producto_fachada" as any) as string) || "";

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Datos de fachada
      </h3>

      {/* Tipo de producto */}
      <div className="space-y-2">
        <Label>Tipo de producto *</Label>
        <div className="grid grid-cols-2 gap-3">
          {TIPO_PRODUCTO.map((tipo) => (
            <button
              key={tipo.key}
              type="button"
              className={cn(
                "rounded-lg border p-4 text-left transition-all hover:border-primary/50",
                tipoProducto === tipo.key
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border"
              )}
              onClick={() => setValue("metadata.tipo_producto_fachada" as any, tipo.key)}
            >
              <p className="font-medium text-sm">{tipo.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{tipo.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Campos según tipo de producto */}
      {tipoProducto === "andamio_completo" && (
        <div className="space-y-4 rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Andamio completo — Precio por m²
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Base / Frente (m)</Label>
              <Input
                type="number"
                step="0.1"
                min={0}
                {...register("metadata.fachada_base" as any, { valueAsNumber: true })}
                placeholder="Ej: 15"
                data-field="fachada_base"
              />
            </div>
            <div className="space-y-2">
              <Label>Altura (m)</Label>
              <Input
                type="number"
                step="0.1"
                min={0}
                {...register("metadata.fachada_altura" as any, { valueAsNumber: true })}
                placeholder="Ej: 12"
                data-field="fachada_altura"
              />
            </div>
            <div className="space-y-2">
              <Label>m² totales</Label>
              <Input
                type="number"
                step="0.1"
                value={
                  ((watch("metadata.fachada_base" as any) as number) || 0) *
                  ((watch("metadata.fachada_altura" as any) as number) || 0) || ""
                }
                readOnly
                className="bg-muted"
                data-field="metros_cuadrados"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de edificio</Label>
              <Select
                value={(watch("metadata.tipo_edificio" as any) as string) || ""}
                onValueChange={(val) => setValue("metadata.tipo_edificio" as any, val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="edificio_propiedad_horizontal">Edificio PH</SelectItem>
                  <SelectItem value="casa">Casa</SelectItem>
                  <SelectItem value="ph">PH</SelectItem>
                  <SelectItem value="comercial">Local comercial</SelectItem>
                  <SelectItem value="industrial">Nave industrial</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Pisos</Label>
              <Input
                type="number"
                min={1}
                {...register("metadata.pisos" as any, { valueAsNumber: true })}
                placeholder="Ej: 8"
                data-field="pisos"
              />
            </div>
          </div>
        </div>
      )}

      {tipoProducto === "bandeja_peatonal" && (
        <div className="space-y-4 rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Bandeja peatonal — Precio por metro lineal
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Metros lineales de frente *</Label>
              <Input
                type="number"
                step="0.1"
                min={0}
                {...register("metadata.metros_lineales" as any, { valueAsNumber: true })}
                placeholder="Ej: 20"
                data-field="metros_lineales"
              />
            </div>
            <div className="space-y-2">
              <Label>Altura bandeja (m)</Label>
              <Input
                type="number"
                step="0.1"
                min={0}
                {...register("metadata.altura_bandeja" as any, { valueAsNumber: true })}
                placeholder="Ej: 3.5"
              />
            </div>
          </div>
        </div>
      )}

      {/* Campos comunes fachada */}
      {tipoProducto && (
        <div className="grid grid-cols-2 gap-4">
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
          <div className="space-y-2">
            <Label>Ubicación / Dirección de obra</Label>
            <Input
              {...register("ubicacion")}
              placeholder="Ej: Av. Corrientes 1234, CABA"
              data-field="ubicacion"
            />
          </div>
        </div>
      )}
    </div>
  );
}
