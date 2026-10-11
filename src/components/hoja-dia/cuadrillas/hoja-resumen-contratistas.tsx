"use client";

// "Contratistas · octubre": cuánta gente puso cada contratista en el mes, para pagarle
// (decisión 4 del 10/10: por persona y jornada). Jornadas-persona = la suma de las
// cantidades de cada día y cuadrilla; si tiene valor por jornada, el total estimado. El
// detalle por día y el prorrateo por obra (por la fracción de cada obra del día).
//
// La cuenta es resumenMes (src/lib/hoja-dia/contratistas.ts); esto sólo la muestra.

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { mesTexto, pesos } from "@/lib/hoja-dia/contratistas";
import { useResumenContratistas } from "@/hooks/use-hoja-dia";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Caja, HojaLateral } from "@/components/hoja-dia/comunes/hoja-lateral";

const otroMes = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const num = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

export function HojaResumenContratistas({ abierta, onCerrar, mesInicial }: { abierta: boolean; onCerrar: () => void; mesInicial: string }) {
  const [mes, setMes] = useState(mesInicial);
  const q = useResumenContratistas(abierta ? mes : null);
  const r = q.data?.mes === mes ? q.data : null;
  const total = r?.resumen.reduce((s, x) => s + (x.total ?? 0), 0) ?? 0;
  const sinValor = r?.resumen.filter((x) => x.total == null) ?? [];
  return (
    <HojaLateral
      abierta={abierta}
      onCerrar={onCerrar}
      titulo={`Contratistas · ${mesTexto(mes).split(" ")[0]}`}
      sub="Jornadas-persona: la suma de cuántos fueron cada día, en cada cuadrilla. Un contratista en dos cuadrillas el mismo día suma las dos."
      pie={
        r && r.resumen.length > 0 ? (
          <span className="mr-auto text-[13px] text-muted-foreground">
            {total > 0 ? <>Total estimado del mes: <b className="font-semibold text-foreground">{pesos(total)}</b></> : "Sin valores por jornada cargados"}
            {total > 0 && sinValor.length > 0 ? ` (sin ${sinValor.map((x) => x.nombre).join(", ")}: no tiene valor)` : ""}
          </span>
        ) : undefined
      }
    >
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="icon-sm" aria-label="Mes anterior" onClick={() => setMes((x) => otroMes(x, -1))}>
          <ChevronLeft />
        </Button>
        <span className="min-w-36 text-center text-sm font-semibold capitalize" aria-live="polite">{mesTexto(mes)}</span>
        <Button variant="outline" size="icon-sm" aria-label="Mes siguiente" onClick={() => setMes((x) => otroMes(x, 1))}>
          <ChevronRight />
        </Button>
      </div>

      {q.isError && !r && (
        <div className="grid justify-items-start gap-2 text-[13px]">
          <p>No se pudo armar el resumen: {(q.error as Error).message}</p>
          <Button size="sm" variant="outline" onClick={() => q.refetch()}>Reintentar</Button>
        </div>
      )}
      {!r && !q.isError && (
        <div className="grid gap-2" aria-busy="true" aria-label="Cargando el resumen">
          <Skeleton className="h-24 rounded-[10px]" />
          <Skeleton className="h-24 rounded-[10px]" />
        </div>
      )}
      {r && !r.resumen.length && <p className="text-[13px] text-muted-foreground">En {mesTexto(mes)} no fue gente de contratistas.</p>}
      {r?.sinTablero && (
        <p className="rounded-[7px] bg-hd-ambar-bg px-2.5 py-1.5 text-[13px]">
          Odoo no contestó: faltan los nombres de las cuadrillas y el reparto por obra. Las jornadas están bien.
        </p>
      )}

      {r?.resumen.map((x) => (
        <Caja
          key={x.id}
          titulo={
            <>
              <span>{x.nombre}</span>
              <span className="ml-auto text-sm font-semibold tabular-nums">{num(x.jornadas)} {x.jornadas === 1 ? "jornada-persona" : "jornadas-persona"}</span>
            </>
          }
        >
          <p className="text-[13px] text-muted-foreground">
            {x.dias === 1 ? "1 día" : `${x.dias} días`}
            {x.referente ? ` · ${x.referente}` : ""}
            {x.valorJornada != null ? ` · ${pesos(x.valorJornada)} por persona y jornada` : ""}
          </p>
          <p className="text-[13px]">
            {x.total != null ? <>Total estimado: <b className="font-semibold tabular-nums">{pesos(x.total)}</b></> : <span className="text-muted-foreground">Sin valor por jornada: cargalo en «Administrar» para ver el total.</span>}
          </p>
          {x.sinCantidad > 0 && (
            <p className="text-[13px] text-hd-ambar">
              {x.sinCantidad === 1 ? "1 día" : `${x.sinCantidad} días`} sin cantidad cargada: no suman hasta que se cargue cuántos fueron.
            </p>
          )}
          <details className="text-[13px]">
            <summary className="cursor-pointer text-muted-foreground underline underline-offset-[3px]">Por día</summary>
            <table className="mt-1.5 w-full text-left">
              <thead className="text-xs text-muted-foreground">
                <tr><th className="py-0.5 font-medium">Día</th><th className="font-medium">Cuadrilla</th><th className="text-right font-medium">Van</th></tr>
              </thead>
              <tbody>
                {x.detalle.map((d, i) => (
                  <tr key={i} className="border-t align-top">
                    <td className="py-1 pr-2 whitespace-nowrap">{d.dia}</td>
                    <td className="py-1 pr-2">
                      {d.cuadrilla}
                      <div className="text-xs text-muted-foreground">{d.obras}</div>
                    </td>
                    <td className="py-1 text-right tabular-nums">{d.cantidad > 0 ? d.cantidad : <span className="text-hd-ambar">¿?</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          {!r.sinTablero && (
            <details className="text-[13px]">
              <summary className="cursor-pointer text-muted-foreground underline underline-offset-[3px]">Por obra</summary>
              <p className="mt-1 text-xs text-muted-foreground">Un día con varias obras se reparte por la fracción de cada una (2 personas en ½ + ½ jornada = 1 en cada obra).</p>
              <table className="mt-1 w-full text-left">
                <tbody>
                  {x.porObra.map((o) => (
                    <tr key={o.otId ?? "-"} className="border-t">
                      <td className="py-1 pr-2">{o.nombre}{o.otId != null && <span className="text-xs text-muted-foreground"> · OT {o.otId}</span>}</td>
                      <td className="py-1 text-right tabular-nums">{num(o.jornadas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </Caja>
      ))}
      {r && r.resumen.length > 0 && <p className="text-xs text-muted-foreground">Es una estimación con lo que dicen las hojas: lo que se paga lo confirma quien liquida.</p>}
    </HojaLateral>
  );
}
