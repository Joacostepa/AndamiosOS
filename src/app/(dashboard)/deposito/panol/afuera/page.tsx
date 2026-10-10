import { AfueraOficina } from "@/components/panol/tablet/paginas";

// "¿Qué hay afuera?" en la oficina: la misma vista que la tablet del depósito.
// ?titular=<lugar> ("c:<id>", "p:<id>", "o:<ot>") deja sólo lo de ese titular; lo usan la
// bandeja y las fichas.
export default async function Page({ searchParams }: { searchParams: Promise<{ titular?: string | string[] }> }) {
  const { titular } = await searchParams;
  return <AfueraOficina titular={typeof titular === "string" ? titular : null} />;
}
