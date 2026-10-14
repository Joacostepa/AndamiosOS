"use client";

// Lienzo (pestaña 1): la propuesta 2 del organigrama, el «Lienzo vivo» (docs/organigrama/
// propuesta.md § 7). Usa useSearchParams (?puesto= / ?persona= = foco): va dentro de <Suspense>.

import { Suspense } from "react";
import { Lienzo } from "@/components/organigrama/lienzo/lienzo";

export default function LienzoPage() {
  return (
    <Suspense fallback={<div className="h-[calc(100dvh-16.5rem)] min-h-[540px] animate-pulse rounded-xl border bg-card" />}>
      <Lienzo />
    </Suspense>
  );
}
