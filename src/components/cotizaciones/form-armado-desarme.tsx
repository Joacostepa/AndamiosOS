"use client";

import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  CotizacionFormData,
  SubVertical,
  SUB_VERTICAL_LABELS,
} from "@/types/cotizacion-form";
import { SUB_VERTICAL_LABELS as LABELS } from "@/types/cotizacion-form";

export function FormArmadoDesarme() {
  const { register, watch, setValue } =
    useFormContext<CotizacionFormData>();
  const subVertical = watch("sub_vertical");

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Armado y desarme
      </h3>

      {/* Sub-vertical selector */}
      <div className="space-y-2">
        <Label>Rubro *</Label>
        <div className="grid grid-cols-3 gap-2">
          {(Object.entries(LABELS) as [SubVertical, string][]).map(
            ([key, label]) => (
              <Button
                key={key}
                type="button"
                variant={subVertical === key ? "default" : "outline"}
                size="sm"
                className="text-xs"
                onClick={() => setValue("sub_vertical", key)}
                data-field="sub_vertical"
              >
                {label}
              </Button>
            )
          )}
        </div>
      </div>

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
          <Label>Ubicación / Zona</Label>
          <Input
            {...register("ubicacion")}
            placeholder="Ej: CABA, GBA Norte..."
            data-field="ubicacion"
          />
        </div>
      </div>

      {/* Toggles */}
      <div className="flex gap-6">
        <div className="flex items-center gap-2">
          <Switch
            checked={!!watch("incluye_montaje")}
            onCheckedChange={(v) => setValue("incluye_montaje", v)}
          />
          <Label className="text-sm">Montaje</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={!!watch("incluye_desarme")}
            onCheckedChange={(v) => setValue("incluye_desarme", v)}
          />
          <Label className="text-sm">Desarme</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={!!watch("incluye_transporte")}
            onCheckedChange={(v) => setValue("incluye_transporte", v)}
          />
          <Label className="text-sm">Transporte</Label>
        </div>
      </div>

      {/* Campos condicionales por sub-vertical */}
      {subVertical === "fachadas" && (
        <div className="space-y-4 rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Datos de fachada
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Tipo edificio</Label>
              <Select
                value={
                  (watch("metadata.tipo_edificio" as any) as string) || ""
                }
                onValueChange={(val) =>
                  setValue("metadata.tipo_edificio" as any, val)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="edificio">Edificio</SelectItem>
                  <SelectItem value="casa">Casa</SelectItem>
                  <SelectItem value="ph">PH</SelectItem>
                  <SelectItem value="comercial">Comercial</SelectItem>
                  <SelectItem value="industrial">Industrial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Metros lineales</Label>
              <Input
                type="number"
                step="0.1"
                {...register("metadata.metros_lineales" as any, {
                  valueAsNumber: true,
                })}
                placeholder="0"
                data-field="metros_lineales"
              />
            </div>
            <div className="space-y-2">
              <Label>Pisos / Altura</Label>
              <Input
                type="number"
                {...register("metadata.pisos" as any, {
                  valueAsNumber: true,
                })}
                placeholder="0"
                data-field="pisos"
              />
            </div>
          </div>
        </div>
      )}

      {subVertical === "industria" && (
        <div className="space-y-4 rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Datos de industria
          </p>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Requisitos de seguridad</Label>
              <Textarea
                {...register("metadata.requisitos_seguridad" as any)}
                rows={2}
                placeholder="Requisitos SyH, elementos de seguridad especiales..."
                data-field="requisitos_seguridad"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={
                  !!(watch("metadata.examenes_medicos" as any) as boolean)
                }
                onCheckedChange={(v) =>
                  setValue("metadata.examenes_medicos" as any, v)
                }
              />
              <Label className="text-sm">Requiere exámenes médicos</Label>
            </div>
            <div className="space-y-2">
              <Label>Exigencias de planta</Label>
              <Textarea
                {...register("metadata.exigencias_planta" as any)}
                rows={2}
                placeholder="Horarios de ingreso, permisos especiales, documentación..."
                data-field="exigencias_planta"
              />
            </div>
          </div>
        </div>
      )}

      {subVertical === "eventos" && (
        <div className="space-y-4 rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Datos del evento
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Fecha del evento</Label>
              <Input
                type="date"
                {...register("metadata.fecha_evento" as any)}
                data-field="fecha_evento"
              />
            </div>
            <div className="space-y-2">
              <Label>Duración montado (días)</Label>
              <Input
                type="number"
                {...register("metadata.duracion_dias" as any, {
                  valueAsNumber: true,
                })}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Horario montaje</Label>
              <Input
                {...register("metadata.horario_montaje" as any)}
                placeholder="Ej: 8 a 18hs"
              />
            </div>
          </div>
        </div>
      )}

      {subVertical === "obra_publica" && (
        <div className="space-y-4 rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Datos de obra pública
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>N° Licitación</Label>
              <Input
                {...register("metadata.nro_licitacion" as any)}
                placeholder="N° de licitación"
              />
            </div>
            <div className="space-y-2">
              <Label>Organismo</Label>
              <Input
                {...register("metadata.organismo" as any)}
                placeholder="Organismo contratante"
              />
            </div>
            <div className="space-y-2">
              <Label>Plazo contractual (días)</Label>
              <Input
                type="number"
                {...register("metadata.plazo_contractual" as any, {
                  valueAsNumber: true,
                })}
                placeholder="0"
              />
            </div>
          </div>
        </div>
      )}

      {subVertical === "construccion" && (
        <div className="space-y-4 rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Datos de construcción
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Etapa de obra</Label>
              <Select
                value={
                  (watch("metadata.etapa_obra" as any) as string) || ""
                }
                onValueChange={(val) =>
                  setValue("metadata.etapa_obra" as any, val)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="excavacion">Excavación</SelectItem>
                  <SelectItem value="estructura">Estructura</SelectItem>
                  <SelectItem value="cerramientos">Cerramientos</SelectItem>
                  <SelectItem value="terminaciones">Terminaciones</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Metros cubiertos</Label>
              <Input
                type="number"
                step="0.1"
                {...register("metadata.metros_cubiertos" as any, {
                  valueAsNumber: true,
                })}
                placeholder="0"
              />
            </div>
          </div>
        </div>
      )}

      {subVertical === "estructuras_especiales" && (
        <div className="space-y-4 rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Estructura especial
          </p>
          <div className="space-y-2">
            <Label>Descripción técnica</Label>
            <Textarea
              {...register("metadata.descripcion_tecnica" as any)}
              rows={3}
              placeholder="Describir la estructura especial requerida..."
              data-field="descripcion_tecnica"
            />
          </div>
        </div>
      )}
    </div>
  );
}
