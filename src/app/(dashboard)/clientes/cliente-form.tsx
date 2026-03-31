"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { clienteSchema, type ClienteFormData } from "@/lib/validators/cliente";
import { Button } from "@/components/ui/button";
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
import { Loader2 } from "lucide-react";
import type { Cliente } from "@/hooks/use-clientes";

interface ClienteFormProps {
  defaultValues?: Cliente;
  onSubmit: (data: ClienteFormData) => void;
  loading?: boolean;
}

export function ClienteForm({
  defaultValues,
  onSubmit,
  loading,
}: ClienteFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ClienteFormData>({
    resolver: zodResolver(clienteSchema),
    defaultValues: defaultValues
      ? {
          razon_social: defaultValues.razon_social,
          cuit: defaultValues.cuit || "",
          domicilio_fiscal: defaultValues.domicilio_fiscal || "",
          telefono: defaultValues.telefono || "",
          email: defaultValues.email || "",
          condicion_iva: defaultValues.condicion_iva || "",
          estado: defaultValues.estado,
          notas: defaultValues.notas || "",
        }
      : {
          estado: "activo",
        },
  });

  const estado = watch("estado");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="razon_social">Razon social *</Label>
        <Input
          id="razon_social"
          {...register("razon_social")}
          placeholder="Nombre o razon social"
        />
        {errors.razon_social && (
          <p className="text-sm text-destructive">
            {errors.razon_social.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cuit">CUIT</Label>
          <Input
            id="cuit"
            {...register("cuit")}
            placeholder="XX-XXXXXXXX-X"
          />
          {errors.cuit && (
            <p className="text-sm text-destructive">{errors.cuit.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="condicion_iva">Condicion IVA</Label>
          <Input
            id="condicion_iva"
            {...register("condicion_iva")}
            placeholder="Responsable Inscripto"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="domicilio_fiscal">Domicilio fiscal</Label>
        <Input
          id="domicilio_fiscal"
          {...register("domicilio_fiscal")}
          placeholder="Direccion"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="telefono">Telefono</Label>
          <Input
            id="telefono"
            {...register("telefono")}
            placeholder="+54 11 XXXX-XXXX"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            {...register("email")}
            placeholder="email@empresa.com"
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Estado</Label>
        <Select
          value={estado}
          onValueChange={(val) =>
            val && setValue("estado", val as "activo" | "inactivo")
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="activo">Activo</SelectItem>
            <SelectItem value="inactivo">Inactivo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notas">Notas</Label>
        <Textarea
          id="notas"
          {...register("notas")}
          placeholder="Notas adicionales..."
          rows={3}
        />
      </div>

      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {defaultValues ? "Guardar cambios" : "Crear cliente"}
        </Button>
      </div>
    </form>
  );
}
