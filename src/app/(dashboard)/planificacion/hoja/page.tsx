import { Suspense } from "react";
import { VistaCuadrillas } from "@/components/hoja-dia/cuadrillas/vista-cuadrillas";

// Hoja del día · vista Cuadrillas (?dia=YYYY-MM-DD). El encabezado (vistas y día) es el
// layout; acá van la bandeja, las tarjetas y el panel Gente.

export default function HojaCuadrillasPage() {
  return (
    <Suspense fallback={null}>
      <VistaCuadrillas />
    </Suspense>
  );
}
