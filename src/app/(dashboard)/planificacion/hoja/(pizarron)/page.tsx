import { Suspense } from "react";
import { Pizarron } from "@/components/hoja-dia/pizarron/pizarron";

// El Pizarrón del día. El día viene en `?dia=` y lo lee el cliente (useDiaHoja): por eso el
// Suspense.

export default function PizarronPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-busy />}>
      <Pizarron />
    </Suspense>
  );
}
