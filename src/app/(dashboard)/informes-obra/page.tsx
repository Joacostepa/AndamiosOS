"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { FileBarChart, TriangleAlert } from "lucide-react";
import { useInformesObra } from "@/hooks/use-informes-obra";
import { ChipsInformes } from "@/components/informes-obra/chips-informes";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { FiltroInformes, InformeListado } from "@/lib/informes-obra/tipos";

// Lista de informes de obra.
//
// Es la pantalla que hace visible un problema que hoy no ve nadie: las obras que se
// cerraron mal costeadas —sin OT, sin armado o sin desarme— suman $183 millones
// facturados con márgenes que no son reales. Sin esta lista, esas obras no aparecen en
// ningún lado.
//
// Ruta propia y no /obras/[saleOrderId]/informe: /obras/[id] es la pantalla legacy de
// Supabase y su [id] es un UUID de la tabla `obras`. Meter un entero de sale.order en el
// mismo segmento dinámico serían dos espacios de identificadores bajo el mismo parámetro.

const money = new Intl.NumberFormat("es-AR", {
  style: "currency", currency: "ARS", maximumFractionDigits: 0,
});
const usd = new Intl.NumberFormat("es-AR", {
  style: "currency", currency: "USD", maximumFractionDigits: 0,
});

export default function InformesObraPage() {
  const { data, isLoading, error } = useInformesObra();
  const [filtro, setFiltro] = useState<FiltroInformes>("todas");

  const visibles = useMemo(() => {
    const todos = data?.informes ?? [];
    if (filtro === "inconsistencias") return todos.filter((i) => i.inconsistencias > 0);
    if (filtro === "mal_costeadas") return todos.filter((i) => i.estadoCosteo !== "completo");
    if (filtro === "desvio") {
      return todos.filter(
        (i) =>
          (i.desvioVisitas !== null && Math.abs(i.desvioVisitas) > 50) ||
          (i.desvioHoras !== null && Math.abs(i.desvioHoras) > 50),
      );
    }
    return todos;
  }, [data, filtro]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Informes de obra" description="No se pudo leer la lista" />
        <EmptyState
          icon={TriangleAlert}
          title="Error al leer los informes"
          description={error instanceof Error ? error.message : "Error desconocido"}
        />
      </div>
    );
  }

  const total = data?.conteos.todas ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Informes de obra"
        description={`${total} obra(s) cerradas · se generan solas al pasar a Desarmado`}
      />

      {data && (
        <ChipsInformes activo={filtro} conteos={data.conteos} onCambiar={setFiltro} />
      )}

      {visibles.length === 0 ? (
        <EmptyState
          icon={FileBarChart}
          title={total === 0 ? "Todavía no hay informes" : "Nada en este filtro"}
          description={
            total === 0
              ? "Se generan solos cuando una venta de tipo Obra pasa a Desarmado."
              : "Probá con otro chip."
          }
        />
      ) : (
        <div className="rounded-md border">
          {visibles.map((i) => (
            <Fila key={`${i.odooSaleOrderId}-${i.version}`} informe={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function Fila({ informe: i }: { informe: InformeListado }) {
  const malCosteada = i.estadoCosteo !== "completo";

  return (
    <Link
      href={`/informes-obra/${i.odooSaleOrderId}`}
      className="flex items-center gap-3 border-b px-3 py-2 text-[13px] last:border-b-0 hover:bg-muted/40"
      style={malCosteada ? { backgroundColor: "#FDECEA" } : undefined}
    >
      {/* El punto rojo es la señal de que hay algo para mirar acá adentro. */}
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: i.inconsistencias > 0 ? "#D92D20" : "transparent" }}
        title={i.inconsistencias > 0 ? `${i.inconsistencias} inconsistencia(s)` : undefined}
      />

      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{i.direccion ?? i.venta}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {[i.cliente, i.venta].filter(Boolean).join(" · ")}
          {i.version > 1 && ` · v${i.version}`}
        </span>
      </span>

      {malCosteada && (
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: "#FEE4E2", color: "#912018" }}
        >
          {i.estadoCosteo}
        </span>
      )}

      {/* "sin estimación" no es un hueco: es el estado real del 99% de las obras
          históricas, y decirlo es más honesto que mostrar un guión. */}
      <span className="w-32 shrink-0 text-right text-[11px] text-muted-foreground">
        {i.desvioVisitas === null && i.desvioHoras === null ? (
          "sin estimación"
        ) : (
          <>
            {i.desvioVisitas !== null && <Desvio valor={i.desvioVisitas} sufijo="visitas" />}
            {i.desvioHoras !== null && <Desvio valor={i.desvioHoras} sufijo="hh" />}
          </>
        )}
      </span>

      <span className="w-24 shrink-0 text-right tabular-nums">
        {i.visitas} visita{i.visitas === 1 ? "" : "s"}
      </span>

      {/* Se lista en USD, que es lo comparable entre obras de meses distintos; los pesos
          van abajo en chico para no perder el número con el que se factura. */}
      <span className="w-28 shrink-0 text-right tabular-nums">
        {i.facturadoUsd !== null ? usd.format(i.facturadoUsd) : money.format(i.facturado)}
        <span className="block text-[10px] text-muted-foreground">
          {money.format(i.facturado)}
        </span>
      </span>

      <span className="w-20 shrink-0 text-right text-[12px] tabular-nums">
        {(i.margenPctUsd ?? i.margenPct).toFixed(1)}%
        {i.margenPctUsd !== null && (
          <span className="block text-[10px] text-muted-foreground">
            {i.margenPct.toFixed(1)}% ARS
          </span>
        )}
      </span>

      <span className="w-20 shrink-0 text-right text-[11px] text-muted-foreground">
        {i.cierre ? format(parseISO(i.cierre), "d MMM yy", { locale: es }) : "—"}
      </span>
    </Link>
  );
}

function Desvio({ valor, sufijo }: { valor: number; sufijo: string }) {
  const fuerte = Math.abs(valor) > 50;
  return (
    <span className="block" style={fuerte ? { color: "#B42318", fontWeight: 600 } : undefined}>
      {valor > 0 ? "+" : ""}
      {valor}% {sufijo}
    </span>
  );
}
