"use client";

import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormDatosComerciales } from "@/components/cotizaciones/form-datos-comerciales";
import { FormFachadas } from "@/components/cotizaciones/form-fachadas";
import { SUB_VERTICAL_LABELS } from "@/types/cotizacion-form";
import type { CotizacionFormData } from "@/types/cotizacion-form";

export function FormArmadoDesarme() {
  const { register, watch, setValue } = useFormContext<CotizacionFormData>();
  const subVertical = watch("sub_vertical");

  return (
    <div className="space-y-6">
      {/* Datos comerciales (común a todos los sub-rubros) */}
      <FormDatosComerciales />

      {/* Toggles de servicios incluidos */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Servicios incluidos
        </h3>
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
      </div>

      {/* Formulario específico por sub-rubro */}
      {subVertical === "fachadas" && <FormFachadas />}

      {subVertical === "industria" && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Datos de industria
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Plazo de alquiler (meses)</Label>
              <Input type="number" min={1} {...register("plazo_alquiler_meses", { valueAsNumber: true })} placeholder="Ej: 3" />
            </div>
            <div className="space-y-2">
              <Label>Ubicación / Planta</Label>
              <Input {...register("ubicacion")} placeholder="Ej: Planta Toyota, Zárate" />
            </div>
          </div>
          <div className="space-y-4 rounded-lg border p-4">
            <p className="text-xs font-medium text-muted-foreground">Requisitos especiales</p>
            <div className="space-y-2">
              <Label>Requisitos de seguridad</Label>
              <Textarea {...register("metadata.requisitos_seguridad" as any)} rows={2} placeholder="Requisitos SyH, elementos especiales..." />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={!!(watch("metadata.examenes_medicos" as any) as boolean)} onCheckedChange={(v) => setValue("metadata.examenes_medicos" as any, v)} />
              <Label className="text-sm">Requiere exámenes médicos</Label>
            </div>
            <div className="space-y-2">
              <Label>Exigencias de planta</Label>
              <Textarea {...register("metadata.exigencias_planta" as any)} rows={2} placeholder="Horarios, permisos, documentación..." />
            </div>
          </div>
        </div>
      )}

      {subVertical === "eventos" && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Datos del evento
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Ubicación</Label><Input {...register("ubicacion")} placeholder="Lugar del evento" /></div>
            <div className="space-y-2"><Label>Fecha del evento</Label><Input type="date" {...register("metadata.fecha_evento" as any)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Duración montado (días)</Label><Input type="number" {...register("metadata.duracion_dias" as any, { valueAsNumber: true })} placeholder="0" /></div>
            <div className="space-y-2"><Label>Horario montaje</Label><Input {...register("metadata.horario_montaje" as any)} placeholder="Ej: 8 a 18hs" /></div>
          </div>
        </div>
      )}

      {subVertical === "obra_publica" && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Datos de obra pública
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Ubicación</Label><Input {...register("ubicacion")} /></div>
            <div className="space-y-2"><Label>Plazo alquiler (meses)</Label><Input type="number" min={1} {...register("plazo_alquiler_meses", { valueAsNumber: true })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2"><Label>N° Licitación</Label><Input {...register("metadata.nro_licitacion" as any)} /></div>
            <div className="space-y-2"><Label>Organismo</Label><Input {...register("metadata.organismo" as any)} /></div>
            <div className="space-y-2"><Label>Plazo contractual (días)</Label><Input type="number" {...register("metadata.plazo_contractual" as any, { valueAsNumber: true })} /></div>
          </div>
        </div>
      )}

      {subVertical === "construccion" && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Datos de construcción
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Ubicación</Label><Input {...register("ubicacion")} /></div>
            <div className="space-y-2"><Label>Plazo alquiler (meses)</Label><Input type="number" min={1} {...register("plazo_alquiler_meses", { valueAsNumber: true })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Etapa de obra</Label>
              <Select value={(watch("metadata.etapa_obra" as any) as string) || ""} onValueChange={(val) => setValue("metadata.etapa_obra" as any, val)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="excavacion">Excavación</SelectItem>
                  <SelectItem value="estructura">Estructura</SelectItem>
                  <SelectItem value="cerramientos">Cerramientos</SelectItem>
                  <SelectItem value="terminaciones">Terminaciones</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Metros cubiertos</Label><Input type="number" step="0.1" {...register("metadata.metros_cubiertos" as any, { valueAsNumber: true })} /></div>
          </div>
        </div>
      )}

      {subVertical === "estructuras_especiales" && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Estructura especial
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Ubicación</Label><Input {...register("ubicacion")} /></div>
            <div className="space-y-2"><Label>Plazo alquiler (meses)</Label><Input type="number" min={1} {...register("plazo_alquiler_meses", { valueAsNumber: true })} /></div>
          </div>
          <div className="space-y-2">
            <Label>Descripción técnica</Label>
            <Textarea {...register("metadata.descripcion_tecnica" as any)} rows={3} placeholder="Describir la estructura requerida..." />
          </div>
        </div>
      )}
    </div>
  );
}
