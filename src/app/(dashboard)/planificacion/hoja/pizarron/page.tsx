import { redirect } from "next/navigation";

// El Pizarrón estuvo un tiempo en /planificacion/hoja/pizarron (mientras convivía con la vista
// Cuadrillas). Ahora ES la Hoja del día: los links viejos llevan a /planificacion/hoja con el día.

export default async function PizarronViejoPage({ searchParams }: { searchParams: Promise<{ dia?: string | string[] }> }) {
  const dia = (await searchParams).dia;
  redirect(typeof dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? `/planificacion/hoja?dia=${dia}` : "/planificacion/hoja");
}
