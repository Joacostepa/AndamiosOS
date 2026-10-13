"use client";

import { cn } from "@/lib/utils";
import type { CategoriaMapa } from "@/lib/mapa-obras/tipos";
import { COLOR_CATEGORIA, LEYENDA, type Vista } from "@/lib/mapa-obras/categorias";
import { foco, vidrio } from "./estilos";

// Arriba al centro: las dos vistas y la leyenda. La leyenda TAMBIÉN filtra: cada chip dice
// cuántas hay y al tocarlo se ocultan en el mapa y en la lista.

export function SelectorVista({ vista, onCambiar }: { vista: Vista; onCambiar: (v: Vista) => void }) {
  return (
    <div role="group" aria-label="Vista" className={cn(vidrio, "flex gap-0.5 rounded-[10px] p-[3px]")}>
      {(
        [
          ["calle", "En la calle"],
          ["historico", "Histórico"],
        ] as const
      ).map(([v, t]) => (
        <button
          key={v}
          type="button"
          aria-pressed={vista === v}
          onClick={() => onCambiar(v)}
          className={cn(
            "whitespace-nowrap rounded-[7px] px-3.5 py-[7px] text-[13px] font-semibold uppercase leading-none tracking-wide text-muted-foreground transition-colors max-md:px-2.5 max-md:text-xs",
            "aria-pressed:bg-primary aria-pressed:text-primary-foreground hover:text-foreground aria-pressed:hover:text-primary-foreground",
            foco,
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function Leyenda({
  vista,
  conteos,
  ocultas,
  onAlternar,
  className,
}: {
  vista: Vista;
  conteos: Map<CategoriaMapa, number>;
  ocultas: Set<CategoriaMapa>;
  onAlternar: (c: CategoriaMapa) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap justify-center gap-[5px]", className)} role="group" aria-label="Leyenda y filtro">
      {LEYENDA[vista].map(({ categoria, etiqueta }) => {
        const n = conteos.get(categoria) ?? 0;
        if (!n && categoria === "sinFecha") return null;
        const visible = !ocultas.has(categoria);
        return (
          <button
            key={categoria}
            type="button"
            aria-pressed={visible}
            onClick={() => onAlternar(categoria)}
            title={visible ? `Ocultar: ${etiqueta}` : `Mostrar: ${etiqueta}`}
            className={cn(
              vidrio,
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs leading-tight transition-opacity hover:border-white/30",
              !visible && "opacity-40",
              foco,
            )}
          >
            <i
              aria-hidden
              className="size-[9px] shrink-0 rounded-full"
              style={
                visible
                  ? { background: COLOR_CATEGORIA[categoria] }
                  : { boxShadow: "inset 0 0 0 1.5px rgba(160,170,180,.8)" }
              }
            />
            {etiqueta}
            <span className="font-mono text-[11px] text-muted-foreground">{n}</span>
          </button>
        );
      })}
    </div>
  );
}
