"use client";

// BarraTramos (antigüedad apilada, §8.3) y Ranking (concentración por cliente). Montos en
// la moneda elegida; las proporciones salen de los pesos (no cambian con la moneda).

import { cn } from "@/lib/utils";
import { montoEn, pct } from "@/lib/direccion/formato";
import type { Monto, NodoRef, Valor } from "@/lib/direccion/tipos";
import { useDireccion, useFormato } from "./contexto";

export type Tramo = { clave: string; etiqueta: string; monto: Monto };

const CLASES = ["dir-t0", "dir-t1", "dir-t2", "dir-t3", "dir-t4"];

/**
 * Barra apilada de 5 tramos (no vencido · 1–30 · 31–60 · 61–90 · +90), de neutro a rojo en
 * un solo matiz. Con `leyenda`, la leyenda debajo con el monto y el % de cada tramo.
 */
export function BarraTramos({ tramos, alto, leyenda, className }: { tramos: Tramo[]; alto?: boolean; leyenda?: boolean; className?: string }) {
  const f = useFormato();
  const tot = tramos.reduce((a, t) => a + Math.max(0, t.monto.ars), 0);
  const pc = (t: Tramo) => (tot > 0 ? (Math.max(0, t.monto.ars) / tot) * 100 : null);
  return (
    <div className={className}>
      <div
        role="img"
        aria-label={`Antigüedad: ${tramos.map((t) => `${t.etiqueta} ${pct(pc(t))}`).join(", ")}`}
        className={cn("flex gap-0.5 overflow-hidden", alto ? "h-[22px] rounded" : "h-2.5 rounded-[3px]")}
      >
        {tot > 0 &&
          tramos.map((t, i) => (
            <i
              key={t.clave}
              className={cn("block min-w-0.5", CLASES[Math.min(i, CLASES.length - 1)])}
              style={{ flex: Math.max(0, t.monto.ars) / tot }}
              title={`${t.etiqueta}: ${f.mon(t.monto)} (${pct(pc(t))})`}
            />
          ))}
      </div>
      {leyenda && (
        <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
          {tramos.map((t, i) => (
            <span key={t.clave} className="inline-flex items-center gap-1.5">
              <i className={cn("inline-block size-2.5 rounded-sm", CLASES[Math.min(i, CLASES.length - 1)])} aria-hidden />
              {t.etiqueta} <b className="font-semibold text-foreground tabular-nums">{f.mon(t.monto)}</b> {pct(pc(t))}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export type FilaRanking = {
  id: string;
  nombre: string;
  /** Lo que se muestra a la derecha. */
  valor: Valor;
  /** Para el largo de la barra (en pesos o en la unidad que sea, todas iguales). */
  peso: number;
  /** % del total (texto chico al lado). */
  pct?: number | null;
  /** Barra en rojo (el mayor deudor, lo que pide atención). */
  destacada?: boolean;
  /** Abre este desglose al tocar la fila. */
  hijo?: NodoRef;
};

/** Ranking de barras horizontales con % (concentración, principales clientes). */
export function Ranking({ filas, className }: { filas: FilaRanking[]; className?: string }) {
  const f = useFormato();
  const { abrirNodo } = useDireccion();
  const max = Math.max(0, ...filas.map((x) => x.peso));
  return (
    <div className={cn("grid grid-cols-[minmax(110px,200px)_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 text-[13px]", className)}>
      {filas.map((x) => {
        const nombre = x.hijo ? (
          <button type="button" onClick={() => abrirNodo(x.hijo!)} className="truncate text-left underline-offset-2 hover:underline">
            {x.nombre}
          </button>
        ) : (
          <span className="truncate">{x.nombre}</span>
        );
        return (
          <div key={x.id} className="contents">
            {nombre}
            <span
              className={cn("h-3.5 min-w-0.5 rounded-[3px]", x.destacada ? "bg-[color-mix(in_srgb,var(--hd-rojo)_70%,var(--dir-serie))]" : "bg-(--dir-serie)")}
              style={{ width: `${max > 0 ? Math.max(1, (x.peso / max) * 100) : 0}%` }}
              aria-hidden
            />
            <span className="text-right whitespace-nowrap tabular-nums">
              {f.valor(x.valor)}
              {x.pct != null && <small className="ml-1.5 text-muted-foreground">{pct(x.pct)}</small>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** El monto de un tramo en la moneda elegida (por si una pantalla necesita el número). */
export function useMontoEn() {
  const f = useFormato();
  return (m: Monto) => montoEn(m, f.moneda, f.tc);
}
