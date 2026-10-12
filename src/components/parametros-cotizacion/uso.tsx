"use client";

import Link from "next/link";
import { useState } from "react";
import { ThumbsDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useUsoAsistente } from "@/hooks/use-parametros-cotizacion";
import { ETIQUETA_MOTIVO, type MotivoFeedback } from "@/lib/asistente/feedback";

// Uso del asistente: cuánto se usa y cuánto cuesta, por persona y por mes, y el gasto de hoy
// contra el tope diario. Sale de asistente_mensajes.uso con costoUsd (src/lib/asistente/uso.ts).
// Lo ven un admin y quien edita parámetros: muestra lo que gasta cada uno.

const usd = (n: number | null) => (n === null ? "—" : `US$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const segundos = (s: number | null) => (s === null ? "—" : s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s` : `${s} s`);
const nombreMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
};

export function Uso() {
  const [meses, setMeses] = useState(6);
  const { data, isLoading, error } = useUsoAsistente(meses, true);
  if (isLoading) return <Skeleton className="h-60 w-full" />;
  if (error || !data) return <p className="text-sm text-destructive">{error instanceof Error ? error.message : "No se pudo leer el uso"}</p>;

  const porMes = new Map<string, typeof data.meses>();
  for (const f of data.meses) porMes.set(f.mes, [...(porMes.get(f.mes) ?? []), f]);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-[14px] font-medium">Hoy, contra el tope diario {data.tope !== null && <span className="text-muted-foreground">({usd(data.tope)} por persona)</span>}</h3>
        {!data.hoy.length && <p className="text-[13px] text-muted-foreground">Hoy nadie usó el asistente todavía.</p>}
        <div className="space-y-2">
          {data.hoy.map((h) => {
            const pct = data.tope ? Math.min(100, (h.usd / data.tope) * 100) : 0;
            const cerca = data.tope !== null && h.usd >= data.tope * 0.8;
            return (
              <div key={h.usuarioId} className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-3 text-[13px]">
                <span className="truncate">{h.nombre}</span>
                <div className="h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={data.tope ?? 0} aria-valuenow={h.usd} aria-label={`Gasto de hoy de ${h.nombre}`}>
                  <div className={`h-full rounded-full ${cerca ? "bg-orange-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                </div>
                <span className={`tabular-nums ${cerca ? "text-orange-400" : ""}`}>
                  {usd(h.usd)}
                  {cerca && " · cerca del tope"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[14px] font-medium">Por persona y por mes</h3>
          <select
            value={meses}
            onChange={(e) => setMeses(Number(e.target.value))}
            className="h-9 rounded-md border border-border bg-background px-2 text-[13px]"
            aria-label="Cuántos meses mostrar"
          >
            {[3, 6, 12, 24].map((n) => <option key={n} value={n}>Últimos {n} meses</option>)}
          </select>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Pedidos: llamadas al modelo. Presupuestos: guardados o re-emitidos en Odoo. Espera: de que el vendedor manda hasta la última respuesta del turno. Los US$ salen del uso que informa la API, con el precio del modelo de cada conversación.
        </p>
        {!data.meses.length && <p className="text-[13px] text-muted-foreground">Sin uso en estos meses.</p>}
        {[...porMes].map(([mes, filas]) => (
          <div key={mes} className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[46rem] text-[13px]">
              <thead className="bg-muted/40 text-left text-[12px] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium capitalize">{nombreMes(mes)}</th>
                  <th className="px-3 py-2 text-right font-medium">Pedidos</th>
                  <th className="px-3 py-2 text-right font-medium">Conversaciones</th>
                  <th className="px-3 py-2 text-right font-medium">Presupuestos</th>
                  <th className="px-3 py-2 text-right font-medium">US$</th>
                  <th className="px-3 py-2 text-right font-medium">US$ / presupuesto</th>
                  <th className="px-3 py-2 text-right font-medium">Espera mediana</th>
                  <th className="px-3 py-2 text-right font-medium">Turnos &gt; 60 s</th>
                  <th className="px-3 py-2 text-right font-medium">Estuvo mal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular-nums">
                {filas.map((f) => (
                  <tr key={f.usuarioId}>
                    <td className="px-3 py-2">{f.nombre}</td>
                    <td className="px-3 py-2 text-right">{f.pedidos}</td>
                    <td className="px-3 py-2 text-right">{f.conversaciones}</td>
                    <td className="px-3 py-2 text-right">{f.presupuestos}</td>
                    <td className="px-3 py-2 text-right">{usd(f.usd)}</td>
                    <td className="px-3 py-2 text-right">{usd(f.usdPorPresupuesto)}</td>
                    <td className="px-3 py-2 text-right">{segundos(f.esperaMedianaS)}</td>
                    <td className="px-3 py-2 text-right">{f.pctTurnosLargos === null ? "—" : `${f.pctTurnosLargos} % de ${f.turnos}`}</td>
                    <td className="px-3 py-2 text-right">{f.estuvoMal ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-[14px] font-medium"><ThumbsDown className="size-3.5" /> Últimos «estuvo mal»</h3>
        {data.ultimosEstuvoMal === null ? (
          <p className="text-[13px] text-muted-foreground">Falta aplicar la migración del botón «estuvo mal».</p>
        ) : !data.ultimosEstuvoMal.length ? (
          <p className="text-[13px] text-muted-foreground">Nadie marcó nada todavía.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {data.ultimosEstuvoMal.map((f) => (
              <li key={f.id} className="px-3 py-2 text-[13px]">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span>
                    <span className="font-medium">{ETIQUETA_MOTIVO[f.motivo as MotivoFeedback] ?? f.motivo}</span>
                    <span className="text-muted-foreground"> · {f.nombre} · {new Date(f.fecha).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</span>
                  </span>
                  <Link href={`/comercial/asistente?c=${f.conversacionId}`} className="truncate text-[12px] underline underline-offset-2">
                    {f.titulo ?? "Ver la conversación"}
                  </Link>
                </div>
                {f.texto && <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{f.texto}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
