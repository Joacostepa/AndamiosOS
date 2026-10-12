"use client";

// Personas (pestaña 2). ?persona=<id> abre la ficha (la pinta el layout); ?demo=… los estados.

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { EsqueletoLista, EstadoDemo, leerDemo } from "@/components/organigrama/estados-demo";
import { ListaPersonas } from "@/components/organigrama/lista-personas";
import { useOrg } from "@/components/organigrama/proveedor";

function VistaPersonas() {
  const demo = leerDemo(useSearchParams().get("demo"));
  const { puedeEditar } = useOrg();
  if (demo) return <EstadoDemo demo={demo} puedeEditar={puedeEditar} lista />;
  return <ListaPersonas />;
}

export default function PersonasPage() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <VistaPersonas />
    </Suspense>
  );
}
