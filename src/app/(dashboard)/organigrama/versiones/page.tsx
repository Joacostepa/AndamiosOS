"use client";

// Versiones (pestaña 4, solo editores): el borrador y las versiones publicadas.

import Link from "next/link";
import { Aviso } from "@/components/permisos-via-publica/ui";
import { ListaVersiones } from "@/components/organigrama/lista-versiones";
import { usePuedeEditarOrg } from "@/components/organigrama/proveedor";

export default function VersionesPage() {
  if (!usePuedeEditarOrg()) {
    return (
      <Aviso tono="bloqueo" titulo="No tenés acceso a esta sección">
        Las versiones las ven quienes editan el organigrama.{" "}
        <Link href="/organigrama" className="font-medium underline">
          Volver al mapa
        </Link>
      </Aviso>
    );
  }
  return <ListaVersiones />;
}
