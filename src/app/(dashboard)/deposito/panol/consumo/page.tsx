"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { BarChart3, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Aviso } from "@/components/permisos-via-publica/ui";
import { formatoCantidad, formatoPesos, useConsumoPanol, type RespuestaConsumo } from "@/hooks/use-panol-catalogo";
import type { GrupoConsumo, PorConsumo } from "@/lib/panol/consumo";
import { hoyBA } from "@/lib/panol/estado";
import { cn } from "@/lib/utils";

// Consumo: qué se llevó cada obra, cuadrilla o persona en un período (docs/modulo-panol.md
// §10, artboard Oficina-Consumo). NETO: retiros menos sobrantes devueltos (que descuentan de
// la obra de la que vuelven), y lo anulado no cuenta. Valorizado con el último costo de
// compra cargado en el pañol; los costos de Odoo son de la fase 3.
//
// La cuenta la hace la ruta /api/panol/consumo con lib/panol/consumo.ts; acá sólo se elige
// el período y se despliega el detalle por artículo.

type Periodo = "mes" | "mes_anterior" | "90" | "otro";

function rango(p: Periodo, hoy: string, otro: { desde: string; hasta: string }): { desde: string; hasta: string; texto: string } {
  const [a, m] = hoy.split("-").map(Number);
  const mes = (anio: number, mes1: number) => new Date(Date.UTC(anio, mes1 - 1, 1)).toLocaleDateString("es-AR", { month: "long", timeZone: "UTC" });
  if (p === "mes") return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy, texto: `en ${mes(a, m)}` };
  if (p === "mes_anterior") {
    const fin = new Date(Date.UTC(a, m - 1, 0)); // último día del mes anterior
    const f = fin.toISOString().slice(0, 10);
    return { desde: `${f.slice(0, 7)}-01`, hasta: f, texto: `en ${mes(fin.getUTCFullYear(), fin.getUTCMonth() + 1)}` };
  }
  if (p === "90") {
    const d = new Date(hoy + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 89);
    return { desde: d.toISOString().slice(0, 10), hasta: hoy, texto: "en los últimos 90 días" };
  }
  return { desde: otro.desde, hasta: otro.hasta, texto: `del ${otro.desde.split("-").reverse().join("/")} al ${otro.hasta.split("-").reverse().join("/")}` };
}

const VISTAS: { v: PorConsumo; t: string; cada: string; col: string }[] = [
  { v: "obra", t: "Obra", cada: "cada obra", col: "Obra" },
  { v: "cuadrilla", t: "Cuadrilla", cada: "cada cuadrilla", col: "Cuadrilla" },
  { v: "persona", t: "Persona", cada: "cada persona", col: "Persona" },
];

export default function ConsumoPage() {
  const hoy = hoyBA();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [otro, setOtro] = useState({ desde: `${hoy.slice(0, 7)}-01`, hasta: hoy });
  const [por, setPor] = useState<PorConsumo>("obra");
  const [abierta, setAbierta] = useState<string | null>(null);
  const r = rango(periodo, hoy, otro);
  const valido = r.desde && r.hasta && r.desde <= r.hasta;
  const q = useConsumoPanol({ por, desde: r.desde, hasta: r.hasta });
  const vista = VISTAS.find((x) => x.v === por)!;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Consumo</h1>
        <p className="text-[13px] text-muted-foreground">Lo que se llevó {vista.cada} {r.texto}, neto de sobrantes.</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} aria-label="Período" className="h-9 rounded-md border bg-background px-2.5 text-[13px]">
          <option value="mes">Este mes (hasta hoy)</option>
          <option value="mes_anterior">El mes pasado</option>
          <option value="90">Últimos 90 días</option>
          <option value="otro">Otro período…</option>
        </select>
        {periodo === "otro" && (
          <>
            <Input type="date" value={otro.desde} max={otro.hasta} onChange={(e) => setOtro({ ...otro, desde: e.target.value })} aria-label="Desde" className="h-9 w-auto" />
            <Input type="date" value={otro.hasta} min={otro.desde} max={hoy} onChange={(e) => setOtro({ ...otro, hasta: e.target.value })} aria-label="Hasta" className="h-9 w-auto" />
          </>
        )}
        <div role="group" aria-label="Ver por" className="inline-flex overflow-hidden rounded-md border bg-background">
          {VISTAS.map((x, i) => (
            <button
              key={x.v}
              type="button"
              aria-pressed={por === x.v}
              onClick={() => { setPor(x.v); setAbierta(null); }}
              className={cn("h-9 px-3 text-[13px]", i > 0 && "border-l", por === x.v ? "bg-foreground font-semibold text-background" : "hover:bg-muted")}
            >
              {x.t}
            </button>
          ))}
        </div>
      </div>

      {!valido ? (
        <Aviso titulo="El período no es válido">Elegí un «desde» anterior al «hasta».</Aviso>
      ) : q.error ? (
        <Aviso tono="bloqueo" titulo="No se pudo calcular el consumo">{q.error instanceof Error ? q.error.message : "Error desconocido"}</Aviso>
      ) : q.isLoading || !q.data ? (
        <Skeleton className="h-80 w-full" />
      ) : (
        <>
          {q.data.odooError && (
            <Aviso titulo="No se pudieron traer los nombres de las obras de Odoo">Se muestran sólo los números de OT. ({q.data.odooError})</Aviso>
          )}
          {q.data.grupos.length === 0 ? (
            <EmptyState icon={BarChart3} title="No se retiró nada en este período" description="Probá con otro período." />
          ) : (
            <Tabla datos={q.data} col={vista.col} abierta={abierta} setAbierta={setAbierta} cargando={q.isFetching} />
          )}
          <p className="text-[12px] text-muted-foreground">
            * Valorizado con el último costo de compra cargado en el pañol (costos de Odoo: fase 3). Los sobrantes devueltos se
            descuentan de la obra de la que vuelven. Los retiros sin obra van a «Taller/Depósito». Lo anulado no cuenta.
            {q.data.sinCosto > 0 && " Lo marcado «sin costo» no tiene ningún ingreso de compra con precio: no suma al total."}
          </p>
        </>
      )}
    </div>
  );
}

function Tabla({ datos, col, abierta, setAbierta, cargando }: {
  datos: RespuestaConsumo;
  col: string;
  abierta: string | null;
  setAbierta: (c: string | null) => void;
  cargando: boolean;
}) {
  const nombre = (c: string) => datos.nombres[c] ?? c;
  const bajada = (g: GrupoConsumo): string | null => {
    if (datos.por === "obra") {
      const top = g.quienes.slice(0, 2).map((x) => `${nombre(x.clave)} (${x.retiros})`);
      return top.length ? `Quién más retiró: ${top.join(" y ")}` : null;
    }
    if (g.obras.length === 0) return "Sin obra: Taller/Depósito";
    return `Obras: ${g.obras.slice(0, 4).map((o) => `OT ${o}`).join(", ")}${g.obras.length > 4 ? ` y ${g.obras.length - 4} más` : ""}`;
  };

  return (
    <div className={cn("overflow-x-auto rounded-md border bg-card transition-opacity", cargando && "opacity-60")}>
      <table className="w-full min-w-[44rem] text-[13px]">
        <thead className="text-left text-[12px] text-muted-foreground">
          <tr className="border-b">
            <th className="px-3 py-2 font-medium">{col}</th>
            <th className="px-3 py-2 text-right font-medium">Retiros</th>
            <th className="px-3 py-2 font-medium">Lo que más se llevó</th>
            <th className="px-3 py-2 text-right font-medium">Valorizado*</th>
          </tr>
        </thead>
        <tbody>
          {datos.grupos.map((g) => {
            const ab = abierta === g.clave;
            const top = g.lineas[0];
            const b = bajada(g);
            return (
              <Fragment key={g.clave}>
                <tr className={cn("border-b", ab && "bg-muted/50")}>
                  <td className="px-3 py-2">
                    <button type="button" aria-expanded={ab} onClick={() => setAbierta(ab ? null : g.clave)} className="flex items-start gap-1.5 text-left">
                      <ChevronRight aria-hidden className={cn("mt-0.5 size-4 shrink-0 transition-transform", ab && "rotate-90")} />
                      <span>
                        <span className="font-medium">{nombre(g.clave)}</span>
                        {b && <span className="block text-[12px] text-muted-foreground">{b}</span>}
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.retiros}</td>
                  <td className="px-3 py-2 text-foreground/80">{top ? `${top.nombre} · ${formatoCantidad(top.cantidad)} ${top.unidad}` : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">
                    {formatoPesos(g.valor)}
                    {g.sinCosto > 0 && <span className="block text-[12px] font-normal text-muted-foreground">{g.sinCosto} sin costo</span>}
                  </td>
                </tr>
                {ab && (
                  <tr className="border-b bg-muted/30">
                    <td colSpan={4} className="px-3 py-2 pl-9">
                      <ul className="divide-y divide-border/60">
                        {g.lineas.map((l) => (
                          <li key={l.articuloId} className="flex items-baseline justify-between gap-3 py-1.5">
                            <Link href={`/deposito/panol/stock/${l.articuloId}`} className="min-w-0 underline-offset-2 hover:underline">{l.nombre}</Link>
                            <span className="ml-auto shrink-0 tabular-nums text-foreground/80">{formatoCantidad(l.cantidad)} {l.unidad}</span>
                            <span className="w-28 shrink-0 text-right tabular-nums">{l.valor === null ? <span className="text-muted-foreground">sin costo</span> : formatoPesos(l.valor)}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td className="px-3 py-2">Total</td>
            <td className="px-3 py-2 text-right tabular-nums">{datos.retiros}</td>
            <td />
            <td className="px-3 py-2 text-right tabular-nums">{formatoPesos(datos.valor)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
