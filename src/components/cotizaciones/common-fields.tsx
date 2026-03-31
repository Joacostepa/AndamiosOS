"use client";

import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { useClientes, useCreateCliente } from "@/hooks/use-clientes";
import { useOportunidades } from "@/hooks/use-oportunidades";
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
import { Plus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import type { CotizacionFormData } from "@/types/cotizacion-form";

export function CommonFields() {
  const { register, watch, setValue } =
    useFormContext<CotizacionFormData>();
  const { data: clientes } = useClientes();
  const { data: oportunidades } = useOportunidades();
  const createCliente = useCreateCliente();

  const [showNewCliente, setShowNewCliente] = useState(false);
  const [newNombre, setNewNombre] = useState("");
  const [newTelefono, setNewTelefono] = useState("");

  async function handleCreateCliente() {
    if (!newNombre.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    try {
      const cliente = await createCliente.mutateAsync({
        razon_social: newNombre.trim(),
        telefono: newTelefono.trim() || undefined,
        estado: "activo",
      });
      setValue("cliente_id", cliente.id);
      setShowNewCliente(false);
      setNewNombre("");
      setNewTelefono("");
      toast.success("Cliente creado");
    } catch {
      toast.error("Error al crear cliente");
    }
  }

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
          <div className="flex items-center justify-between">
            <Label>Cliente</Label>
            {!showNewCliente && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-primary"
                onClick={() => setShowNewCliente(true)}
              >
                <Plus className="mr-1 h-3 w-3" />
                Nuevo
              </Button>
            )}
          </div>

          {showNewCliente ? (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Nuevo cliente
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => setShowNewCliente(false)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <Input
                value={newNombre}
                onChange={(e) => setNewNombre(e.target.value)}
                placeholder="Nombre completo *"
                className="h-8 text-sm"
              />
              <Input
                value={newTelefono}
                onChange={(e) => setNewTelefono(e.target.value)}
                placeholder="Teléfono"
                className="h-8 text-sm"
              />
              <Button
                type="button"
                size="sm"
                className="w-full h-7 text-xs"
                onClick={handleCreateCliente}
                disabled={createCliente.isPending}
              >
                {createCliente.isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="mr-1 h-3 w-3" />
                )}
                Crear y seleccionar
              </Button>
            </div>
          ) : (
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
          )}
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
