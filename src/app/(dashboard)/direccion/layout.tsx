// Dirección (docs/direccion/diseno.md): el tablero de los socios. Contrato para quien
// construye las pantallas: docs/direccion/implementacion.md.
//
// El layout pone el encabezado (pregunta, "Datos de Odoo al…", dólar, moneda, actualizar),
// las pestañas (escritorio) o la barra inferior (celular), y el panel de desglose al lado
// del contenido. Chequea el acceso en el servidor: el proxy ya rebota a quien no tiene el
// módulo, pero el layout no muestra nada sin él.

import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { AvisoSinAcceso, BarraInferior, DireccionProvider, EncabezadoDireccion, EstadoVacio, PanelDesglose } from "@/components/direccion";
import { sesionPaginaDireccion } from "@/lib/direccion/permisos-servidor";
import { obtenerDolarHoy } from "@/lib/direccion/servidor";
import { definicionesReservadas } from "@/lib/direccion/diccionario-socios";
import "@/components/direccion/direccion.css";

export default async function DireccionLayout({ children }: { children: React.ReactNode }) {
  const s = await sesionPaginaDireccion();
  if (!s) {
    return (
      <EstadoVacio
        icono="candado"
        titulo="No tenés acceso a Dirección"
        texto="Pedíselo a un socio."
        acciones={<Button variant="outline" nativeButton={false} render={<Link href="/" />}>Ir al inicio</Button>}
      />
    );
  }
  const tc = await obtenerDolarHoy();
  return (
    <DireccionProvider conSocios={s.conSocios} puedeEditar={s.puedeEditar} tcLayout={tc} defsReservadas={s.conSocios ? definicionesReservadas() : undefined}>
      <div className="dir flex min-h-full flex-col pb-20 md:pb-0">
        <Suspense fallback={null}>
          <EncabezadoDireccion />
          <AvisoSinAcceso />
        </Suspense>
        <div className="mt-4 flex min-w-0 flex-1 items-start">
          <div className="min-w-0 flex-1 space-y-4">{children}</div>
          <PanelDesglose />
        </div>
        <Suspense fallback={null}>
          <BarraInferior />
        </Suspense>
      </div>
    </DireccionProvider>
  );
}

// Calcula en vivo contra Odoo: La semana y Ventas pueden pasar los 10–15 s del límite por defecto de Vercel.
export const maxDuration = 300;
