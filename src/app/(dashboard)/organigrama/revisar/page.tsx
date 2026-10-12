"use client";

// Para revisar (pestaña 3, solo editores: admin o módulo «organigrama» en «editar»). Un lector
// que entra por URL directa ve el estado «sin permiso».

import Link from "next/link";
import { Aviso } from "@/components/permisos-via-publica/ui";
import { BandejaRevisar } from "@/components/organigrama/bandeja-revisar";
import { usePuedeEditarOrg } from "@/components/organigrama/proveedor";

export default function RevisarPage() {
  if (!usePuedeEditarOrg()) {
    return (
      <Aviso tono="bloqueo" titulo="No tenés acceso a esta sección">
        «Para revisar» es para quienes editan el organigrama.{" "}
        <Link href="/organigrama" className="font-medium underline">
          Volver al mapa
        </Link>
      </Aviso>
    );
  }
  return <BandejaRevisar />;
}
