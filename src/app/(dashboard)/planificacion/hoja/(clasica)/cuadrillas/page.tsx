import { Suspense } from "react";
import { VistaCuadrillas } from "@/components/hoja-dia/cuadrillas/vista-cuadrillas";

// Hoja del día · Cuadrillas en su propia URL. Con el Pizarrón como pantalla principal,
// /planificacion/hoja lleva al pizarrón y la vista clásica queda acá (y en /camiones).

export default function HojaCuadrillasClasicaPage() {
  return (
    <Suspense fallback={null}>
      <VistaCuadrillas />
    </Suspense>
  );
}
