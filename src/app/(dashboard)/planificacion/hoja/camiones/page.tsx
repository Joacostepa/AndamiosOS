import { Suspense } from "react";
import { VistaCamiones } from "@/components/hoja-dia/camiones/vista-camiones";

// Hoja del día · Camiones: el despacho en vivo (docs/equipos-del-dia/modulo.md §9). El día
// viene en `?dia=` (lo maneja el encabezado del layout); la vista lo lee del lado del
// cliente, por eso el Suspense.

export default function HojaCamionesPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-busy />}>
      <VistaCamiones />
    </Suspense>
  );
}
