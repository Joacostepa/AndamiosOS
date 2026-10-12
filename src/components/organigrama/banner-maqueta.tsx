"use client";

// Banner fijo de la maqueta: deja claro que los datos son de ejemplo y trae el «Ver como»,
// que reemplaza al permiso real para mostrar qué ve cada perfil.

import { Chip } from "@/components/permisos-via-publica/ui";
import { OPCIONES_VER_COMO } from "@/lib/organigrama/datos-maqueta";
import type { VerComo } from "@/lib/organigrama/tipos";
import { useOrg } from "./proveedor";

export function BannerMaqueta() {
  const { verComo, setVerComo } = useOrg();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-dashed px-3 py-2 text-[12.5px] text-muted-foreground">
      <Chip tono="prueba">Maqueta</Chip>
      <span className="min-w-0 flex-1">Datos de ejemplo. Nada de lo que hagas acá se guarda.</span>
      <label className="flex items-center gap-2">
        <span>Ver como</span>
        <select
          value={verComo}
          onChange={(e) => setVerComo(e.target.value as VerComo)}
          className="h-9 rounded-md border bg-background px-2 text-[13px] text-foreground max-sm:h-10 dark:[color-scheme:dark]"
        >
          {OPCIONES_VER_COMO.map((o) => (
            <option key={o.id} value={o.id}>
              {o.titulo}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
