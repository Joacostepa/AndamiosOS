"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowDown, ArrowUp, MoreHorizontal, Search } from "lucide-react";
import { useOrdenesOdoo } from "@/hooks/use-ordenes-odoo";
import { ChipsFiltro } from "@/components/ordenes/chips-filtro";
import { PageHeader } from "@/components/shared/page-header";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { colorTipo, semaforo } from "@/lib/tablero/colores";
import { partesTitulo, normalizar } from "@/lib/tablero/titulo";
import type { FiltroOrdenes, OrdenListado } from "@/lib/tablero/tipos-orden";

// Listado de Órdenes de Trabajo, leído de Odoo.
//
// Antes leía la tabla `ordenes_trabajo` de Supabase mientras el tablero leía
// x_aba_orden_trabajo: dos listas de OT que no se veían entre sí, con el mismo
// desdoblamiento que ya habíamos resuelto entre /planificacion y /tablero.
//
// NO se emiten OTs desde acá. Las emite Comercial en Odoo y nada más.
//
// Antes había dos altas en la app y las dos eran un agujero: una OT es trabajo que va a
// generar costo de mano de obra y de fletes, así que emitirla sin que Comercial la haya
// cotizado es trabajo que se hace y no se cobra. La de /obras/[id] era peor todavía:
// escribía en Supabase sin empujar a Odoo, o sea que la OT quedaba invisible para
// Comercial, para la facturación, para el tablero y para este mismo listado.

const ICONO_TIPO = { arriba: ArrowUp, abajo: ArrowDown, otro: MoreHorizontal } as const;


function Fila({ ot }: { ot: OrdenListado }) {
  const tipo = colorTipo(ot.tipo);
  const IconoTipo = ICONO_TIPO[tipo.icono];
  const sem = semaforo(ot.habSemaforo);
  const partes = partesTitulo(ot.titulo);
  const critica = ot.habAlerta === "critica";
  const sinFecha = ot.grupoProg === "b_sin";

  return (
    <Link
      href={`/ordenes-trabajo/${ot.id}`}
      className="flex items-center gap-2 border-b px-3 py-2 text-[13px] hover:bg-muted/40"
      style={{
        backgroundColor: critica
          ? "#FDECEA"
          : sinFecha
            ? "color-mix(in oklch, var(--foreground) 2.5%, transparent)"
            : undefined,
      }}
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: sem.color }}
        title={sem.label}
      />
      <IconoTipo className="h-3.5 w-3.5 shrink-0" style={{ color: tipo.text }} aria-hidden />

      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{partes.principal}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {[partes.numero, partes.cliente].filter(Boolean).join(" · ")}
        </span>
      </span>

      <span className="w-28 shrink-0 text-right text-[12px]">
        {ot.fechaProgramada ? (
          <>
            {format(parseISO(ot.fechaProgramada), "d MMM", { locale: es })}
            {ot.fechaFirmeza && (
              <span
                className="ml-1 rounded px-1 text-[10px] font-semibold"
                style={
                  ot.fechaFirmeza === "confirmada"
                    ? { backgroundColor: "#EAF3DE", color: "#27500A" }
                    : { backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }
                }
                title={ot.fechaFirmeza === "confirmada" ? "Fecha firme" : "Fecha tentativa"}
              >
                {ot.fechaFirmeza === "confirmada" ? "F" : "t"}
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">sin fecha</span>
        )}
      </span>

      <span className="w-24 shrink-0 truncate text-[11px] text-muted-foreground">
        {ot.cuadrillaPrevista ?? "—"}
      </span>
      <span className="w-12 shrink-0 text-right text-[12px] tabular-nums">{ot.jornadas || "—"}</span>
      <span className="w-10 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">
        {ot.cantDocs || "—"}
      </span>
    </Link>
  );
}

export default function OrdenesTrabajoPage() {
  const [filtro, setFiltro] = useState<FiltroOrdenes>("abiertas");
  const [busqueda, setBusqueda] = useState("");
  const { data, isLoading, isFetching } = useOrdenesOdoo(filtro);

  const ordenes = useMemo(() => {
    const lista = data?.ordenes ?? [];
    const q = normalizar(busqueda.trim());
    if (!q) return lista;
    return lista.filter((o) => normalizar(o.titulo).includes(q));
  }, [data, busqueda]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Órdenes de Trabajo"
        description={
          data
            ? `${data.conteos.abiertas} abiertas · ${data.conteos.cerradas} cerradas${isFetching ? " · actualizando…" : ""}`
            : "Cargando…"
        }
      />

      <ChipsFiltro activo={filtro} conteos={data?.conteos} onCambio={setFiltro} />

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar obra, cliente o número…"
          className="h-8 pl-8 text-[12px]"
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="rounded-md border">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="w-2.5 shrink-0" title="Habilitación" />
            <span className="w-3.5 shrink-0" title="Tipo" />
            <span className="min-w-0 flex-1">Obra</span>
            <span className="w-28 shrink-0 text-right">Fecha</span>
            <span className="w-24 shrink-0">Cuadrilla</span>
            <span className="w-12 shrink-0 text-right">Jorn</span>
            <span className="w-10 shrink-0 text-right">Doc</span>
          </div>
          {ordenes.length > 0 ? (
            ordenes.map((ot) => <Fila key={ot.id} ot={ot} />)
          ) : (
            <p className="px-3 py-8 text-center text-[12px] text-muted-foreground">
              {busqueda ? "Ninguna orden coincide con la búsqueda." : "No hay órdenes en este filtro."}
            </p>
          )}
        </div>
      )}

    </div>
  );
}
