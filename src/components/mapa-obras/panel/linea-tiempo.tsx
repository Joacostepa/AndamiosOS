"use client";

import { useMemo } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PuntoCurva } from "@/lib/mapa-obras/tipos";
import { fmtFecha, mesCorto } from "@/lib/mapa-obras/categorias";
import { foco, vidrio } from "./estilos";

// Línea de tiempo del histórico: la curva de cuántas obras había en la calle cada semana,
// un selector semanal y play. Al mover la fecha, el mapa muestra lo que estaba armado.

export function LineaTiempo({
  curva,
  indice,
  onIndice,
  reproduciendo,
  onReproducir,
  className,
}: {
  curva: PuntoCurva[];
  indice: number;
  onIndice: (i: number) => void;
  reproduciendo: boolean;
  onReproducir: () => void;
  className?: string;
}) {
  const { linea, meses } = useMemo(() => {
    if (curva.length < 2) return { linea: "", meses: [] as string[] };
    const mx = Math.max(1, ...curva.map((p) => p.enLaCalle)) * 1.1;
    const pts = curva.map((p, i) => [(i / (curva.length - 1)) * 1000, 30 - (p.enLaCalle / mx) * 28]);
    const linea = "M" + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L");
    const vistos = new Set<string>();
    const meses: string[] = [];
    for (const p of curva) {
      const k = p.fecha.slice(0, 7);
      if (!vistos.has(k)) {
        vistos.add(k);
        meses.push(mesCorto(p.fecha));
      }
    }
    return { linea, meses };
  }, [curva]);

  const punto = curva[indice];

  return (
    <div className={cn(vidrio, "flex items-center gap-3 py-2 pl-2 pr-3", className)}>
      <button
        type="button"
        onClick={onReproducir}
        aria-label={reproduciendo ? "Pausar" : "Reproducir"}
        className={cn("grid size-9 shrink-0 place-items-center rounded-full border border-white/12 hover:border-white/35", foco)}
      >
        {reproduciendo ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
      </button>
      <div className="relative h-14 min-w-0 flex-1">
        <svg viewBox="0 0 1000 30" preserveAspectRatio="none" aria-hidden className="absolute left-0 top-0 h-[30px] w-full text-primary">
          {linea && (
            <>
              <path d={`${linea}L1000,30L0,30Z`} fill="currentColor" fillOpacity={0.16} />
              <path d={linea} fill="none" stroke="currentColor" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>
        <input
          type="range"
          min={0}
          max={Math.max(0, curva.length - 1)}
          step={1}
          value={indice}
          onChange={(e) => onIndice(Number(e.target.value))}
          aria-label="Fecha"
          aria-valuetext={punto ? `${fmtFecha(punto.fecha)}, ${punto.enLaCalle} obras en la calle` : undefined}
          className={cn("absolute inset-x-0 top-6 m-0 h-4 w-full accent-primary", foco)}
        />
        <div className="pointer-events-none absolute inset-x-0 top-[42px] flex justify-between font-mono text-[9.5px] text-muted-foreground/70">
          {meses.map((m, i) => (
            <span key={`${m}-${i}`}>{m}</span>
          ))}
        </div>
      </div>
      <div className="w-[190px] shrink-0 text-right max-md:w-[110px]">
        <b className="block text-base font-semibold leading-tight max-md:text-[13px]">{fmtFecha(punto?.fecha)}</b>
        <span className="text-xs text-muted-foreground">{punto ? `${punto.enLaCalle} obras en la calle` : ""}</span>
      </div>
    </div>
  );
}
