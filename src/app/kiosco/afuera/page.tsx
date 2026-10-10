import { AfueraKiosco } from "@/components/panol/tablet/paginas";

// "¿Qué hay afuera?" en la tablet del depósito (docs §6.9). ?titular=<lugar> filtra.
export default async function Page({ searchParams }: { searchParams: Promise<{ titular?: string | string[] }> }) {
  const { titular } = await searchParams;
  return <AfueraKiosco titular={typeof titular === "string" ? titular : null} />;
}
