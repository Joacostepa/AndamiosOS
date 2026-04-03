"use client";

import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TituloClienteFields } from "@/components/cotizaciones/titulo-cliente-fields";
import { FormDatosComerciales } from "@/components/cotizaciones/form-datos-comerciales";
import { ServiceToggles } from "@/components/cotizaciones/service-toggles";
import { AIImproveButton } from "@/components/cotizaciones/ai-improve-button";
import type { CotizacionFormData } from "@/types/cotizacion-form";

const TIPO_PRODUCTO = [
  {
    key: "andamio_completo",
    title: "Andamio completo",
    description: "Estructura completa con bandeja fenólico, escaleras, tablones y mediasombra. Precio por m².",
  },
  {
    key: "bandeja_peatonal",
    title: "Bandeja de protección peatonal",
    description: "Bandeja debajo del primer balcón para silleteros. Precio por metro lineal.",
  },
];

export function FormFachadasFull() {
  const { register, watch, setValue } = useFormContext<CotizacionFormData>();
  const tipoProducto = (watch("metadata.tipo_producto_fachada" as any) as string) || "";

  return (
    <div className="space-y-6">
      {/* 1. Título + Cliente + Oportunidad */}
      <TituloClienteFields />

      {/* 2. Datos comerciales */}
      <FormDatosComerciales />

      {/* 3. Tareas del cliente */}
      <div className="space-y-2">
        <Label>Tareas que debe realizar el cliente</Label>
        <Textarea
          {...register("metadata.tareas_cliente" as any)}
          rows={2}
          placeholder="Ej: Pintura de frente completo, restauración de balcones, limpieza de fachada..."
          data-field="tareas_cliente"
        />
      </div>

      {/* 4. Tipo de producto + dimensiones */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Tipo de producto
        </h3>
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

        {tipoProducto === "andamio_completo" && (
          <div className="space-y-4 rounded-lg border p-4">
            <p className="text-xs font-medium text-muted-foreground">Andamio completo — Precio por m²</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Base / Frente (m)</Label>
                <Input type="number" step="0.1" min={0} {...register("metadata.fachada_base" as any, { valueAsNumber: true })} placeholder="Ej: 15" />
              </div>
              <div className="space-y-2">
                <Label>Altura (m)</Label>
                <Input type="number" step="0.1" min={0} {...register("metadata.fachada_altura" as any, { valueAsNumber: true })} placeholder="Ej: 12" />
              </div>
              <div className="space-y-2">
                <Label>m² totales</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={((watch("metadata.fachada_base" as any) as number) || 0) * ((watch("metadata.fachada_altura" as any) as number) || 0) || ""}
                  readOnly
                  className="bg-muted"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de edificio</Label>
                <Select value={(watch("metadata.tipo_edificio" as any) as string) || ""} onValueChange={(val) => setValue("metadata.tipo_edificio" as any, val)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
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
                <Input type="number" min={1} {...register("metadata.pisos" as any, { valueAsNumber: true })} placeholder="Ej: 8" />
              </div>
            </div>
          </div>
        )}

        {tipoProducto === "bandeja_peatonal" && (
          <div className="space-y-4 rounded-lg border p-4">
            <p className="text-xs font-medium text-muted-foreground">Bandeja peatonal — Precio por metro lineal</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Metros lineales de frente *</Label>
                <Input type="number" step="0.1" min={0} {...register("metadata.metros_lineales" as any, { valueAsNumber: true })} placeholder="Ej: 20" />
              </div>
              <div className="space-y-2">
                <Label>Altura bandeja (m)</Label>
                <Input type="number" step="0.1" min={0} {...register("metadata.altura_bandeja" as any, { valueAsNumber: true })} placeholder="Ej: 3.5" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Descripción breve del servicio */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Descripción breve del servicio</Label>
          <AIImproveButton
            currentText={watch("descripcion_servicio") || ""}
            fieldName="descripcion breve"
            context={watch() as Record<string, unknown>}
            onAccept={(text) => setValue("descripcion_servicio", text)}
          />
        </div>
        <Textarea
          {...register("descripcion_servicio")}
          rows={3}
          placeholder="Breve descripción de los alcances del trabajo..."
          data-field="descripcion_servicio"
        />
      </div>

      {/* 6. Descripción técnica del servicio */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Descripción técnica del servicio</Label>
          <AIImproveButton
            currentText={(watch("metadata.descripcion_tecnica" as any) as string) || ""}
            fieldName="descripcion tecnica"
            context={watch() as Record<string, unknown>}
            onAccept={(text) => setValue("metadata.descripcion_tecnica" as any, text)}
          />
        </div>
        <Textarea
          {...register("metadata.descripcion_tecnica" as any)}
          rows={4}
          placeholder="Detalle técnico: dimensiones, sistema de andamio, niveles de contención, materiales..."
          data-field="descripcion_tecnica"
        />
      </div>

      {/* 7. Condición de pago */}
      <div className="space-y-2">
        <Label>Condición de pago</Label>
        <Input
          {...register("condicion_pago")}
          placeholder="Ej: 50% anticipo, 50% finalización montaje"
          data-field="condicion_pago"
        />
      </div>

      {/* 8. Condiciones generales */}
      <div className="space-y-2">
        <Label>Condiciones generales</Label>
        <Textarea
          {...register("condiciones")}
          rows={3}
          placeholder="Condiciones del servicio..."
          data-field="condiciones"
        />
      </div>

      {/* 9. Servicios incluidos */}
      <ServiceToggles />

      {/* 10. Plazo + Ubicación */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Plazo de alquiler (meses)</Label>
          <Input type="number" min={1} {...register("plazo_alquiler_meses", { valueAsNumber: true })} placeholder="Ej: 3" />
        </div>
        <div className="space-y-2">
          <Label>Ubicación / Dirección de obra</Label>
          <Input {...register("ubicacion")} placeholder="Ej: Av. Corrientes 1234, CABA" />
        </div>
      </div>
    </div>
  );
}
