"use client";

import { useFormContext } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CotizacionFormData } from "@/types/cotizacion-form";

function useUserProfiles() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["user_profiles_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("id, nombre, apellido, rol")
        .eq("activo", true)
        .order("nombre");
      if (error) throw error;
      return data as { id: string; nombre: string; apellido: string; rol: string }[];
    },
  });
}

export function FormDatosComerciales() {
  const { watch, setValue } = useFormContext<CotizacionFormData>();
  const { data: usuarios } = useUserProfiles();

  const vendedores = usuarios || [];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Datos comerciales
      </h3>

      {/* Técnico-vendedor */}
      <div className="space-y-2">
        <Label>Técnico-vendedor responsable</Label>
        <Select
          value={watch("responsable_id") || ""}
          onValueChange={(val) => val && setValue("responsable_id", val)}
        >
          <SelectTrigger data-field="responsable_id">
            <SelectValue placeholder="Asignar responsable..." />
          </SelectTrigger>
          <SelectContent>
            {vendedores.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.nombre} {u.apellido}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Perfil del cliente */}
        <div className="space-y-2">
          <Label>¿Qué busca el cliente?</Label>
          <Select
            value={(watch("metadata.tipo_cliente_perfil" as any) as string) || ""}
            onValueChange={(val) =>
              val && setValue("metadata.tipo_cliente_perfil" as any, val)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="busca_profesionalismo">Profesionalismo</SelectItem>
              <SelectItem value="busca_precio">Precio</SelectItem>
              <SelectItem value="busca_velocidad">Velocidad de respuesta</SelectItem>
              <SelectItem value="busca_seguridad">Seguridad</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Etapa del cliente */}
        <div className="space-y-2">
          <Label>Etapa del cliente</Label>
          <Select
            value={(watch("metadata.etapa_cliente" as any) as string) || ""}
            onValueChange={(val) =>
              val && setValue("metadata.etapa_cliente" as any, val)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cotizando">Recién cotizando</SelectItem>
              <SelectItem value="contratado">Tiene trabajo contratado</SelectItem>
              <SelectItem value="licitacion">Participando de licitación</SelectItem>
              <SelectItem value="listo_contratar">Listo para contratar</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Rol del contacto */}
        <div className="space-y-2">
          <Label>Rol del contacto</Label>
          <Select
            value={(watch("metadata.rol_contacto" as any) as string) || ""}
            onValueChange={(val) =>
              val && setValue("metadata.rol_contacto" as any, val)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="decide">Decide solo</SelectItem>
              <SelectItem value="traslada">Traslada el precio</SelectItem>
              <SelectItem value="influye">Influye en la decisión</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Fecha proyectada */}
        <div className="space-y-2">
          <Label>Fecha proyectada de inicio</Label>
          <Input
            type="date"
            value={(watch("metadata.fecha_proyectada" as any) as string) || ""}
            onChange={(e) =>
              setValue("metadata.fecha_proyectada" as any, e.target.value)
            }
            data-field="fecha_proyectada"
          />
        </div>
      </div>

      {/* Competencia */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>¿Hay competencia?</Label>
          <p className="text-xs text-muted-foreground">
            Otro proveedor está cotizando
          </p>
        </div>
        <Switch
          checked={!!(watch("metadata.hay_competencia" as any) as boolean)}
          onCheckedChange={(v) =>
            setValue("metadata.hay_competencia" as any, v)
          }
        />
      </div>
    </div>
  );
}
