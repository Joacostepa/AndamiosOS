"use client";

// Las dos puertas de "¿Qué hay afuera?": el kiosco (firma el encargado identificado) y la
// oficina (firma el usuario, con Pañol en editar).

import { PackageOpen } from "lucide-react";
import { usePuedeEditar } from "@/components/providers/acceso-provider";
import { useMiLegajo } from "@/hooks/use-panol-tablet";
import { VistaAfuera } from "./afuera";
import { CabeceraTablet, useEncargadoKiosco } from "./comun";

export function AfueraKiosco({ titular }: { titular: string | null }) {
  const { identidad, puede, token } = useEncargadoKiosco();
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <CabeceraTablet titulo="Pañol · Depósito" icono={<PackageOpen />} quien={identidad?.nombre} rol={puede ? "a cargo" : "identificado"} />
      <VistaAfuera
        tablet
        firma={{ kiosco: true, token }}
        puedeActuar={puede}
        sinPermiso={identidad ? "Para pasar algo a otro titular, tiene que identificarse alguien a cargo del pañol." : "Para pasar algo a otro titular, identificate en el kiosco como encargado."}
        titular={titular}
        hrefTodo="/kiosco/afuera"
      />
    </div>
  );
}

export function AfueraOficina({ titular }: { titular: string | null }) {
  const puede = usePuedeEditar("panol");
  const legajo = useMiLegajo();
  return (
    <VistaAfuera
      firma={{ kiosco: false, quien: legajo ? { tipo: "persona", id: legajo.id } : null }}
      puedeActuar={puede}
      titular={titular}
      hrefTodo="/deposito/panol/afuera"
    />
  );
}
