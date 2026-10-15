"use client";

// "Esta semana" (diseno.md §4.3, maqueta renderSemana): la narrativa armada por reglas en el
// servidor (calculo/narrativa.ts). Cada cifra es un botón que abre su desglose exacto.
// En el celular arranca colapsada (4 líneas) con "Leer todo ▾" y el atajo a Para decidir.
// El pie (retiros) sólo llega a quien tiene direccion-socios: el servidor ya lo recortó.

import { useState } from "react";
import { Lock } from "lucide-react";
import { cuerpoNarrativa, pieNarrativa } from "@/lib/direccion/calculo/narrativa";
import type { Oracion } from "@/lib/direccion/tipos";
import { cn } from "@/lib/utils";
import { TextoFrase } from "../piezas";

export function Narrativa({ oraciones, decisiones, idDecisiones, className }: { oraciones: Oracion[]; decisiones: number; idDecisiones: string; className?: string }) {
  const [abierta, setAbierta] = useState(false);
  const cuerpo = cuerpoNarrativa(oraciones);
  const pie = pieNarrativa(oraciones);
  return (
    <section aria-label="Esta semana" className={cn("min-w-0 rounded-lg border border-l-[3px] border-l-primary bg-card px-[18px] py-3.5 shadow-(--dir-sombra-1)", className)}>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Esta semana</h2>
      <p className={cn("mt-2 text-[17px] leading-[1.55] text-pretty max-md:text-base max-md:leading-[1.75]", !abierta && "max-md:line-clamp-4")}>
        {cuerpo.map((o, i) => (
          <span key={o.id}>
            {i > 0 && " "}
            <TextoFrase frase={o.frase} />
          </span>
        ))}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-2 text-xs text-muted-foreground">
        <button type="button" onClick={() => setAbierta((x) => !x)} className="font-medium text-primary md:hidden max-md:min-h-11" aria-expanded={abierta}>
          {abierta ? "Leer menos ▴" : "Leer todo ▾"}
        </button>
        <button
          type="button"
          onClick={() => document.getElementById(idDecisiones)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="font-medium text-primary md:hidden max-md:min-h-11"
        >
          {decisiones ? `${decisiones} ${decisiones === 1 ? "tema" : "temas"} para decidir ↓` : "Nada para decidir ✓"}
        </button>
        {pie.map((o) => (
          <span key={o.id} className="inline-flex items-center gap-1 rounded-full bg-(--dir-aten-bg) px-2 py-0.5 font-semibold text-(--dir-aten)">
            <Lock className="size-3" aria-hidden />
            <span className="sr-only">Sólo socios: </span>
            <TextoFrase frase={o.frase} />
          </span>
        ))}
      </div>
    </section>
  );
}
