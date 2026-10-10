import { Suspense } from "react";
import { EncabezadoHoja } from "@/components/hoja-dia/comunes/encabezado-hoja";
import { ProveedorHuecoHoja } from "@/components/hoja-dia/comunes/acciones-hoja";
import { ProveedorCorteHoja } from "@/components/hoja-dia/comunes/use-dia-hoja";
import { createAdminClient } from "@/lib/supabase/admin";
import { normHora, toMin } from "@/lib/hoja-dia/estado";

/** hora_corte_manana de hd_parametros, en minutos (15:00 si no está o falla). */
async function corteManana(): Promise<number> {
  try {
    const r = await createAdminClient().from("hd_parametros").select("valor").eq("clave", "hora_corte_manana").maybeSingle();
    return toMin(normHora(typeof r.data?.valor === "string" ? r.data.valor : null)) ?? 15 * 60;
  } catch {
    return 15 * 60;
  }
}

// Encabezado compartido de la Hoja del día (Cuadrillas y Camiones): título, las dos vistas,
// el día (`?dia=`) y un hueco a la derecha para las acciones de cada vista
// (<AccionesHoja> de components/hoja-dia/comunes). Cada página arma lo suyo debajo.

export default async function HojaDelDiaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Sólo un parámetro (no datos del usuario): el proxy ya exige la sesión para esta ruta.
  const corte = await corteManana();
  return (
    <ProveedorCorteHoja corteMin={corte}>
    <ProveedorHuecoHoja>
      <div className="hoja-dia flex min-h-0 flex-col">
        {/* useSearchParams necesita su Suspense para que el build no falle al prerenderizar. */}
        <Suspense fallback={<div className="h-[42px] pb-3" aria-hidden />}>
          <EncabezadoHoja />
        </Suspense>
        {children}
      </div>
    </ProveedorHuecoHoja>
    </ProveedorCorteHoja>
  );
}
