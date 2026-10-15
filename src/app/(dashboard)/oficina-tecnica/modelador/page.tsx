"use client";

import { use } from "react";
import { ListaModelos } from "@/components/tecnica/modelador/lista-modelos";

// Modelador ABA: lista de modelos. Con ?obra=<id> (desde la obra o el cómputo) filtra por esa
// obra y la precarga en el modelo nuevo.

export default function ModeladorPage({ searchParams }: { searchParams: Promise<{ obra?: string | string[] }> }) {
  const sp = use(searchParams);
  const obra = typeof sp.obra === "string" && sp.obra ? sp.obra : null;
  return <ListaModelos obraId={obra} />;
}
