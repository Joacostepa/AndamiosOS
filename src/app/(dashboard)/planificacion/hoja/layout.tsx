import { Suspense } from "react";
import { EncabezadoHoja } from "@/components/hoja-dia/comunes/encabezado-hoja";
import { ProveedorHuecoHoja } from "@/components/hoja-dia/comunes/acciones-hoja";

// Encabezado compartido de la Hoja del día (Cuadrillas y Camiones): título, las dos vistas,
// el día (`?dia=`) y un hueco a la derecha para las acciones de cada vista
// (<AccionesHoja> de components/hoja-dia/comunes). Cada página arma lo suyo debajo.

export default function HojaDelDiaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProveedorHuecoHoja>
      <div className="hoja-dia flex min-h-0 flex-col">
        {/* useSearchParams necesita su Suspense para que el build no falle al prerenderizar. */}
        <Suspense fallback={<div className="h-[42px] pb-3" aria-hidden />}>
          <EncabezadoHoja />
        </Suspense>
        {children}
      </div>
    </ProveedorHuecoHoja>
  );
}
