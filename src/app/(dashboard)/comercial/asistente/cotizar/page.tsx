"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Inicio } from "@/components/cotizador/inicio";
import { Editor } from "@/components/cotizador/editor";

// Comercial → Asistente → Cotizar. El cotizador rápido: pantalla con campos y botones sobre el
// mismo presupuesto del asistente (docs/asistente-comercial/cotizador-rapido.md). Sin ?c=, la
// entrada (pegar o elegir el tipo); con ?c=<conversación>, el presupuesto.

function Cotizar() {
  const c = useSearchParams().get("c");
  return c ? <Editor key={c} id={c} /> : <Inicio />;
}

export default function CotizarPage() {
  return (
    <Suspense>
      <Cotizar />
    </Suspense>
  );
}
