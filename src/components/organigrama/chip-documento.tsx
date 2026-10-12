"use client";

// «RS · emite»: el documento que toca una tarea y en qué rol. Al tocarlo se busca ese código
// («¿quién más toca el RS?»): se cierra la hoja y el buscador del mapa muestra la respuesta.

import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import type { DocTarea } from "@/lib/organigrama/tipos";
import { useOrg } from "./proveedor";

export function ChipDocumento({ doc, interactivo = true }: { doc: DocTarea; interactivo?: boolean }) {
  const { setBusqueda, documentos } = useOrg();
  const router = useRouter();
  const nombre = documentos.find((d) => d.codigo === doc.codigo)?.nombre ?? doc.codigo;
  const contenido = (
    <>
      <FileText aria-hidden className="size-3" />
      <span className="font-mono font-semibold">{doc.codigo}</span>
      <span>· {doc.rol}</span>
    </>
  );
  const clases = "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border bg-background px-2 text-[12px] text-foreground";
  if (!interactivo) return <span className={clases}>{contenido}</span>;
  return (
    <button
      type="button"
      title={`${nombre}: ¿quién más lo toca?`}
      aria-label={`${doc.codigo} (${nombre}), ${doc.rol}. Buscar quién más lo toca`}
      onClick={() => {
        setBusqueda(doc.codigo);
        router.push("/organigrama", { scroll: false });
      }}
      className={`${clases} hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring max-sm:h-8`}
    >
      {contenido}
    </button>
  );
}
