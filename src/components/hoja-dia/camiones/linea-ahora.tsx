"use client";

// La línea "Ahora:" (§9): lo que pide atención en el despacho, cada cosa clickeable (lleva
// a la fila, la ficha o el pedido) y con su primer botón a mano. Más de 3: "+n más" y "Ver
// todo" la despliega con todos los botones.
//
// PARA UNIFICAR: es la versión de Camiones de la línea de chips de "Falta para mandar" de
// Cuadrillas; cuando haya una en components/hoja-dia/comunes, ésta debería usarla.

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ahoraItems, cap, diaSemana, fechaLarga, type Aviso } from "@/lib/hoja-dia/estado";
import { useCamiones } from "./contexto";
import { Botones, LineaAviso } from "./botones";

const MAX = 3;

export function LineaAhora() {
  const { dia, ahora, hoy, pasado, mostrar } = useCamiones();
  const its = useMemo(() => (pasado ? [] : ahoraItems(dia, ahora)), [dia, ahora, pasado]);
  const [abierta, setAbierta] = useState(false);

  if (pasado) {
    return (
      <div className="rounded-[10px] border bg-hd-card2 px-3.5 py-2 text-[13px]">
        <b className="font-semibold">{cap(fechaLarga(dia.fecha))}: sólo lectura.</b>
      </div>
    );
  }
  const lbl = hoy ? "Ahora:" : `${cap(diaSemana(dia.fecha))} ${Number(dia.fecha.slice(8, 10))}:`;
  const ir = (x: Aviso) => {
    if (x.ped) mostrar(`ped-${x.ped}`);
    else if (x.ids?.[0]) mostrar(`vf-${x.ids[0]}`);
    else if (x.veh) mostrar(`row-${x.veh}`);
    else if (x.k.startsWith("nadie-")) mostrar("row-sin");
    else if (x.k === "sug") mostrar("cola");
    else if (x.ch) {
      const veh = dia.camiones.find((c) => c.choferId === x.ch)?.vehiculoId;
      if (veh) mostrar(`row-${veh}`);
    }
  };

  return (
    <div role="region" aria-label="Lo que pide atención" className="rounded-[10px] border bg-hd-card2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 py-1.5 pr-2.5 pl-3.5 text-[13px]">
        <b className="font-semibold whitespace-nowrap">{lbl}</b>
        {its.length ? (
          <>
            <span className="whitespace-nowrap text-muted-foreground">
              <b className="text-foreground">{its.length}</b> {its.length === 1 ? "cosa pide" : "cosas piden"} atención
            </span>
            <span className="flex min-w-0 flex-[1_1_300px] flex-wrap items-center gap-1.5 max-md:basis-full">
              {its.slice(0, MAX).map((x) => (
                <span
                  key={x.k}
                  className={cn(
                    "inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-[7px] border bg-card py-0.5 pr-[3px] pl-2 max-md:min-h-10 max-md:w-full max-md:flex-wrap max-md:justify-between max-md:py-1.5 max-md:pr-1.5",
                    x.nivel === "rojo" && "border-[color-mix(in_oklch,var(--hd-rojo)_55%,transparent)]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => ir(x)}
                    className={cn(
                      "min-w-0 rounded text-left text-[13px] outline-none max-md:flex-[1_1_100%] hover:underline hover:underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring/60 max-md:text-sm",
                      x.nivel === "rojo" ? "text-hd-rojo" : x.nivel === "amb" ? "text-hd-ambar" : "text-muted-foreground",
                    )}
                  >
                    {x.t}
                  </button>
                  <Botones bs={x.bs} max={1} />
                </span>
              ))}
              {its.length > MAX && (
                <button type="button" onClick={() => setAbierta(true)} className="rounded-[7px] border bg-card px-2 py-1 text-[13px] outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60">
                  +{its.length - MAX} más
                </button>
              )}
            </span>
            {its.length > MAX && (
              <Button type="button" variant="ghost" size="sm" className="ml-auto" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}>
                {abierta ? "Plegar" : "Ver todo"}
              </Button>
            )}
          </>
        ) : (
          <span className="font-semibold text-hd-verde">{hoy ? "Todo en orden" : "Nada pendiente"}</span>
        )}
      </div>
      {abierta && its.length > MAX && (
        <div className="grid gap-0.5 border-t px-3.5 pt-1 pb-2.5">
          {its.map((x) => <LineaAviso key={x.k} a={x} className="bg-transparent px-0" />)}
        </div>
      )}
    </div>
  );
}
