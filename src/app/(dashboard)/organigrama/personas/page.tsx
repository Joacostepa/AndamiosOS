"use client";

// Personas (pestaña 2). ?persona=<id> abre la ficha (la pinta el layout).

import { Suspense } from "react";
import { EsqueletoLista } from "@/components/organigrama/estados";
import { ListaPersonas } from "@/components/organigrama/lista-personas";

export default function PersonasPage() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <ListaPersonas />
    </Suspense>
  );
}
