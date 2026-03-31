"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { obraSchema, type ObraFormData } from "@/lib/validators/obra";
import { useClientes } from "@/hooks/use-clientes";
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

interface ObraFormProps {
  onSubmit: (data: ObraFormData) => void;
  loading?: boolean;
}

export function ObraForm({ onSubmit, loading }: ObraFormProps) {
  const { data: clientes } = useClientes();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ObraFormData>({
    resolver: zodResolver(obraSchema),
    defaultValues: {
      provincia: "Buenos Aires",
      tipo_obra: "construccion",
      tipo_andamio: "multidireccional",
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label>Cliente *</Label>
        <Select
          value={watch("cliente_id") || ""}
          onValueChange={(val) => val && setValue("cliente_id", val)}
        >
          <SelectTrigger>
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
        {errors.cliente_id && (
          <p className="text-sm text-destructive">
            {errors.cliente_id.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre de obra *</Label>
        <Input
          id="nombre"
          {...register("nombre")}
          placeholder="Ej: Montaje fachada Av. Corrientes 1234"
        />
        {errors.nombre && (
          <p className="text-sm text-destructive">{errors.nombre.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="direccion">Direccion</Label>
        <Input
          id="direccion"
          {...register("direccion")}
          placeholder="Direccion de la obra"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="localidad">Localidad</Label>
          <Input id="localidad" {...register("localidad")} placeholder="CABA" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="provincia">Provincia</Label>
          <Input id="provincia" {...register("provincia")} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Unidad de negocio</Label>
        <Select value={(watch as any)("unidad_negocio") || ""} onValueChange={(val) => val && (setValue as any)("unidad_negocio", val)}>
          <SelectTrigger><SelectValue placeholder="Seleccionar unidad..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="fachadas">Fachadas</SelectItem>
            <SelectItem value="particulares">Particulares</SelectItem>
            <SelectItem value="multidireccional">Multidireccional</SelectItem>
            <SelectItem value="industria">Industria</SelectItem>
            <SelectItem value="construccion">Construccion</SelectItem>
            <SelectItem value="obra_publica">Obra publica</SelectItem>
            <SelectItem value="eventos">Eventos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tipo de obra</Label>
          <Select
            value={watch("tipo_obra")}
            onValueChange={(val) => val && setValue("tipo_obra", val as ObraFormData["tipo_obra"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="construccion">Construccion</SelectItem>
              <SelectItem value="fachada">Fachada</SelectItem>
              <SelectItem value="industria">Industria</SelectItem>
              <SelectItem value="evento">Evento</SelectItem>
              <SelectItem value="especial">Especial</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Tipo de andamio</Label>
          <Select
            value={watch("tipo_andamio")}
            onValueChange={(val) =>
              val && setValue("tipo_andamio", val as ObraFormData["tipo_andamio"])
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="multidireccional">Multidireccional</SelectItem>
              <SelectItem value="tubular">Tubular</SelectItem>
              <SelectItem value="colgante">Colgante</SelectItem>
              <SelectItem value="otro">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="fecha_inicio_estimada">Fecha inicio estimada</Label>
          <Input
            id="fecha_inicio_estimada"
            type="date"
            {...register("fecha_inicio_estimada")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fecha_fin_estimada">Fecha fin estimada</Label>
          <Input
            id="fecha_fin_estimada"
            type="date"
            {...register("fecha_fin_estimada")}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="condiciones_acceso">Condiciones de acceso</Label>
        <Textarea
          id="condiciones_acceso"
          {...register("condiciones_acceso")}
          placeholder="Acceso difícil, calle angosta, etc."
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="horario_permitido">Horario permitido</Label>
        <Input
          id="horario_permitido"
          {...register("horario_permitido")}
          placeholder="Ej: 7:00 a 17:00"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="observaciones">Observaciones</Label>
        <Textarea
          id="observaciones"
          {...register("observaciones")}
          rows={3}
        />
      </div>

      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Crear obra
        </Button>
      </div>
    </form>
  );
}
