"use client";

// La línea de la bandeja, arriba de la vista: "Falta para mandar: 5 para hacer vos [chip]
// [chip] [chip] +2 más · Ver todo" (Cuadrillas) o "Ahora: …" (Camiones). Cada chip es el
// problema en corto con el botón que lo arregla; "Ver todo" despliega los grupos enteros.

import type { ReactNode } from "react";
import type { Boton } from "@/lib/hoja-dia/estado";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ItemLinea = {
  k: string;
  /** El texto entero (en "Ver todo"). */
  t: string;
  /** El texto del chip. */
  corto?: string;
  tono?: "rojo" | "amb" | "gris" | "";
  bs: Boton[];
  /** Una aclaración en gris al lado ("· pasó la hora de alarma (6:30)"). */
  sub?: string;
  /** A qué se refiere (para ir al tocar el texto): una cuadrilla, un camión o un pedido. */
  c?: number | null;
  veh?: string;
  ped?: string;
};

export type GrupoLinea = { titulo: string; items: ItemLinea[]; vacio: string; soloTexto?: boolean };

const tonoTexto = { rojo: "text-hd-rojo", amb: "text-hd-ambar", gris: "text-muted-foreground", "": "" } as const;

export function BotonesDe({ bs, onBoton, max, grande }: { bs: Boton[]; onBoton: (b: Boton) => void; max?: number; grande?: boolean }) {
  return (
    <>
      {bs.slice(0, max ?? bs.length).map((b, i) => (
        <Button
          key={`${b.a}-${i}`}
          variant="outline"
          size="xs"
          onClick={() => onBoton(b)}
          className={cn("h-[22px] px-[7px] text-xs max-md:h-9 max-md:px-3 max-md:text-sm", grande && "h-6")}
        >
          {b.l}
        </Button>
      ))}
    </>
  );
}

export function ChipBandeja({ it, onIr, onBoton, bmax = 1 }: { it: ItemLinea; onIr: (it: ItemLinea) => void; onBoton: (b: Boton) => void; bmax?: number }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-[7px] border bg-card py-0.5 pr-[3px] pl-2 max-md:min-h-10 max-md:w-full max-md:justify-between",
        it.tono === "rojo" && "border-hd-rojo/55",
      )}
    >
      <button
        type="button"
        onClick={() => onIr(it)}
        className={cn("min-w-0 text-left text-[13px] underline-offset-[3px] outline-none hover:underline focus-visible:underline max-md:text-sm", tonoTexto[it.tono ?? ""])}
      >
        {it.corto ?? it.t}
      </button>
      <span className="flex shrink-0 gap-1">
        <BotonesDe bs={it.bs} onBoton={onBoton} max={bmax} />
      </span>
    </span>
  );
}

export function LineaBandeja({
  etiqueta,
  ariaLabel,
  resumen,
  chips,
  mas,
  ok,
  grupos,
  abierta,
  onToggle,
  onIr,
  onBoton,
}: {
  etiqueta: string;
  ariaLabel: string;
  resumen?: ReactNode;
  chips: { it: ItemLinea; bmax?: number }[];
  /** Cuántos más hay además de los chips ("+2 más"). */
  mas?: number;
  /** Lo que se dice cuando no hay nada ("Todo listo para mandar"). */
  ok?: ReactNode;
  grupos: GrupoLinea[];
  abierta: boolean;
  onToggle: () => void;
  onIr: (it: ItemLinea) => void;
  onBoton: (b: Boton) => void;
}) {
  return (
    <section role="region" aria-label={ariaLabel} className="rounded-[10px] border bg-hd-card2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 py-1.5 pr-2.5 pl-3.5 text-[13px]">
        <b className="font-semibold whitespace-nowrap">{etiqueta}</b>
        {resumen && <span className="whitespace-nowrap text-muted-foreground [&_b]:text-foreground">{resumen}</span>}
        {chips.length > 0 || mas ? (
          <span className="flex min-w-0 flex-[1_1_300px] flex-wrap items-center gap-x-1.5 gap-y-1 max-md:basis-full">
            {chips.map(({ it, bmax }) => (
              <ChipBandeja key={it.k} it={it} onIr={onIr} onBoton={onBoton} bmax={bmax} />
            ))}
            {!!mas && (
              <span className="inline-flex min-h-7 items-center rounded-[7px] border bg-card px-2">
                <button type="button" onClick={onToggle} className="text-[13px] outline-none hover:underline focus-visible:underline">
                  +{mas} más
                </button>
              </span>
            )}
          </span>
        ) : (
          ok
        )}
        <span className="ml-auto" />
        <Button variant="ghost" size="sm" onClick={onToggle} aria-expanded={abierta} className="text-muted-foreground">
          {abierta ? "Plegar" : "Ver todo"}
        </Button>
      </div>
      {abierta && (
        <div className="grid gap-0.5 border-t px-3.5 pt-1 pb-2.5">
          {grupos.map((g) => (
            <div key={g.titulo}>
              <div className="mt-2 mb-0.5 flex items-baseline gap-2 text-xs font-semibold tracking-[.06em] text-muted-foreground uppercase">
                {g.titulo} <span className="font-normal tracking-normal normal-case">({g.items.length})</span>
              </div>
              {g.items.length === 0 ? (
                <div className="py-1 text-[13px] text-muted-foreground">{g.vacio}</div>
              ) : g.soloTexto ? (
                <div className="py-1 text-[13px] text-muted-foreground">{g.items.map((x) => x.t).join(" · ")}</div>
              ) : (
                g.items.map((x) => (
                  <div key={x.k} className="flex flex-wrap items-center gap-2.5 border-b border-dashed py-1 text-[13px] last:border-b-0">
                    <span className={cn("min-w-[200px] flex-1", tonoTexto[x.tono ?? ""])}>
                      {x.t}
                      {x.sub && <span className="text-muted-foreground"> {x.sub}</span>}
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      <BotonesDe bs={x.bs} onBoton={onBoton} grande />
                    </span>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
