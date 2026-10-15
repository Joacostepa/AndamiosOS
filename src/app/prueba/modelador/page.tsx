import { notFound } from "next/navigation";
import { ArnesModelador } from "@/components/tecnica/modelador/arnes-prueba";

// El modelador montado SIN sesión ni Supabase, para probarlo con Playwright. Sólo en
// desarrollo: en producción es un 404 (y el proxy tampoco la deja pasar sin sesión).

export const dynamic = "force-dynamic";

export default async function PruebaModeladorPage({ searchParams }: { searchParams: Promise<{ vacio?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { vacio } = await searchParams;
  return <ArnesModelador vacio={vacio === "1"} />;
}
