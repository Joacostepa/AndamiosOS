import { Suspense } from "react";
import { redirect } from "next/navigation";
import { VistaCuadrillas } from "@/components/hoja-dia/cuadrillas/vista-cuadrillas";
import { leerParametrosPantalla } from "@/lib/hoja-dia/parametros-pantalla";
import { RUTA_PIZARRON } from "@/lib/hoja-dia/modo-pizarron";

// Hoja del día · vista Cuadrillas (?dia=YYYY-MM-DD). El encabezado (vistas y día) es el
// layout; acá van la bandeja, las tarjetas y el panel Gente.
//
// Con el Pizarrón como pantalla principal (hd_parametros.pizarron = "principal"), esta URL
// lleva al pizarrón con el mismo día; Cuadrillas sigue en /planificacion/hoja/cuadrillas.

export default async function HojaCuadrillasPage({ searchParams }: { searchParams: Promise<{ dia?: string | string[] }> }) {
  const { pizarron } = await leerParametrosPantalla();
  if (pizarron === "principal") {
    const dia = (await searchParams).dia;
    redirect(typeof dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? `${RUTA_PIZARRON}?dia=${dia}` : RUTA_PIZARRON);
  }
  return (
    <Suspense fallback={null}>
      <VistaCuadrillas />
    </Suspense>
  );
}
