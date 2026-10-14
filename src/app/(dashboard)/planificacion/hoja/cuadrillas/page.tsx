import { redirect } from "next/navigation";

// La vista Cuadrillas (la hoja clásica) se retiró: la reemplaza el Pizarrón, que ES la Hoja
// del día. Los links viejos llevan a /planificacion/hoja con el día.

export default async function CuadrillasViejaPage({ searchParams }: { searchParams: Promise<{ dia?: string | string[] }> }) {
  const dia = (await searchParams).dia;
  redirect(typeof dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? `/planificacion/hoja?dia=${dia}` : "/planificacion/hoja");
}
