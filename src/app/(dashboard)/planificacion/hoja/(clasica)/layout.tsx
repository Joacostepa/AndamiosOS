import { Suspense } from "react";
import { EncabezadoHoja } from "@/components/hoja-dia/comunes/encabezado-hoja";
import { ProveedorHuecoHoja } from "@/components/hoja-dia/comunes/acciones-hoja";

// La Hoja del día clásica (Cuadrillas y Camiones): el encabezado compartido —título, las dos
// vistas, el día (`?dia=`) y un hueco a la derecha para las acciones de cada vista
// (<AccionesHoja> de components/hoja-dia/comunes)—. Cada página arma lo suyo debajo. Es un
// grupo de rutas: las URLs no cambian (/planificacion/hoja y /planificacion/hoja/camiones).
// El Pizarrón (/planificacion/hoja/pizarron) tiene su propio layout, sin este encabezado.
// La hora de corte la pone el layout de Planificación.

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
