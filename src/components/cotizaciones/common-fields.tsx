"use client";

import { useFormContext } from "react-hook-form";
import { useClientes } from "@/hooks/use-clientes";
import { useOportunidades } from "@/hooks/use-oportunidades";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CotizacionFormData } from "@/types/cotizacion-form";

export function CommonFields() {
  const { register, watch, setValue } =
    useFormContext<CotizacionFormData>();
  const { data: clientes } = useClientes();
  const { data: oportunidades } = useOportunidades();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Título *</Label>
        <Input
          {...register("titulo", { required: true })}
          placeholder="Ej: Andamio fachada edificio Belgrano"
          data-field="titulo"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Cliente</Label>
          <Select
            value={watch("cliente_id") || ""}
            onValueChange={(val) => val && setValue("cliente_id", val)}
          >
            <SelectTrigger data-field="cliente_id">
              <SelectValue placeholder="Seleccionar cliente..." />
            </SelectTrigger>
            <SelectContent>
              {clientes?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.razon_social}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Oportunidad</Label>
          <Select
            value={watch("oportunidad_id") || ""}
            onValueChange={(val) => val && setValue("oportunidad_id", val)}
          >
            <SelectTrigger data-field="oportunidad_id">
              <SelectValue placeholder="Vincular oportunidad..." />
            </SelectTrigger>
            <SelectContent>
              {oportunidades?.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.codigo} — {o.titulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Descripción del servicio</Label>
        <Textarea
          {...register("descripcion_servicio")}
          rows={3}
          placeholder="Detalle del servicio a cotizar..."
          data-field="descripcion_servicio"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Condición de pago</Label>
          <Input
            {...register("condicion_pago")}
            placeholder="Ej: 50% anticipo, 50% contra entrega"
            data-field="condicion_pago"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Condiciones generales</Label>
        <Textarea
          {...register("condiciones")}
          rows={3}
          placeholder="Condiciones del servicio..."
          data-field="condiciones"
        />
      </div>
    </div>
  );
}
