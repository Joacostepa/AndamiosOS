"use client";

// El panel derecho del Pizarrón: los pedidos del día (por ahora en solo lectura, con el link a
// la vista Camiones clásica, que es donde se ponen en un camión; F4 los hace editables acá) y
// el mini-mapa con las obras del día.

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo } from "react";
import { Check, Package } from "lucide-react";
import type { DiaHoja } from "@/lib/hoja-dia/tipos";
import { choferDe, lugar, nombreDe, vehTxt } from "@/lib/hoja-dia/estado";
import type { VistaPizarron } from "@/lib/hoja-dia/pizarron";
import { colorCuadrilla } from "@/lib/tablero/colores";
import { cn } from "@/lib/utils";
import type { PuntoMapa } from "./mini-mapa";

// MapLibre sólo en el navegador (necesita window y WebGL).
const MiniMapa = dynamic(() => import("./mini-mapa").then((m) => m.MiniMapa), {
  ssr: false,
  loading: () => <div className="h-[220px] animate-pulse rounded-md bg-muted" aria-hidden />,
});

const RUTA_CAMIONES = "/planificacion/hoja/camiones";

export function PanelLateral({ dia, vista, rotulo, onFoco }: { dia: DiaHoja; vista: VistaPizarron; rotulo: string; onFoco: (c: number) => void }) {
  const pedidos = dia.pedidos.filter((p) => p.estado !== "anulado");
  const porHacer = pedidos.filter((p) => p.estado !== "hecho").length;
  const puntos = useMemo<PuntoMapa[]>(() => {
    const out: PuntoMapa[] = [];
    for (const col of vista.columnas) {
      const color = colorCuadrilla(col.color).borde;
      for (const o of dia.obras.filter((x) => x.cuadrillaOdooId === col.c && x.lat != null && x.lng != null)) {
        out.push({ k: `o:${o.otId}`, lat: o.lat!, lng: o.lng!, rotulo: col.rotulo, color, titulo: `${col.nombre} · ${o.corto}`, c: col.c });
      }
    }
    const dep = dia.lugares.find((l) => l.tipo === "deposito" && l.activo && l.lat != null && l.lng != null);
    if (dep) out.push({ k: "dep", lat: dep.lat!, lng: dep.lng!, rotulo: "D", color: "var(--muted-foreground)", titulo: `Depósito · ${dep.direccion ?? dep.nombre}`, c: null, deposito: true });
    return out;
  }, [dia.obras, dia.lugares, vista.columnas]);

  return (
    <aside className="grid min-w-0 content-start gap-3 @min-[700px]:@max-[1099px]:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
      <section aria-label={`Pedidos de ${rotulo}`} className="rounded-lg border bg-card p-3">
        <h2 className="mb-2 flex items-baseline justify-between gap-2 text-[17px] font-bold">
          Pedidos de {rotulo}
          <span className="text-xs font-medium text-muted-foreground">{pedidos.length ? (porHacer ? `${porHacer} por hacer` : "todos hechos") : "ninguno todavía"}</span>
        </h2>
        <ul className="grid gap-1.5">
          {pedidos.map((p) => {
            const v = p.viajeId ? dia.viajes.find((x) => x.id === p.viajeId) : null;
            const quien = v ? (v.fleteExterno ?? [vehTxt(dia, v.vehiculoId), nombreDe(dia, choferDe(dia, v))].filter(Boolean).join(" · ")) : null;
            const estado = p.estado === "hecho" ? "hecho" : p.estado === "esperando" ? `esperando${p.esperandoMotivo ? `: ${p.esperandoMotivo.toLowerCase()}` : ""}` : quien ? `lo lleva: ${quien}` : "sin camión";
            return (
              <li key={p.id}>
                <Link
                  href={`${RUTA_CAMIONES}?dia=${dia.fecha}&pedido=${p.id}`}
                  className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 rounded-md border bg-card px-2 py-2 shadow-xs hover:border-foreground/40", p.estado === "hecho" && "bg-muted shadow-none")}
                >
                  <span className="row-span-2 mt-0.5 text-muted-foreground">{p.estado === "hecho" ? <Check className="size-4 text-hd-verde" /> : <Package className="size-4" />}</span>
                  <span className={cn("text-[13.5px] leading-tight font-semibold", p.estado === "hecho" && "text-muted-foreground line-through")}>{p.que}</span>
                  <span className="text-xs text-muted-foreground">
                    {lugar(dia, p.hacia).n} · <span className={cn(!quien && p.estado !== "hecho" && "font-semibold text-hd-ambar")}>{estado}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <Link href={`${RUTA_CAMIONES}?dia=${dia.fecha}`} className="mt-2 inline-block text-[13px] font-semibold underline decoration-foreground/30 underline-offset-[3px] hover:decoration-current">
          Ver y poner en un camión (Camiones)
        </Link>
      </section>
      <section aria-label="Dónde están las obras" className="rounded-lg border bg-card p-3">
        <h2 className="mb-2 flex items-baseline justify-between gap-2 text-[17px] font-bold">
          Dónde están las obras <span className="text-xs font-medium text-muted-foreground">tocá una</span>
        </h2>
        <MiniMapa puntos={puntos} onTocar={onFoco} />
        {puntos.length === 0 && <p className="mt-1.5 text-xs text-muted-foreground">Las obras de este día no tienen coordenadas.</p>}
      </section>
    </aside>
  );
}
