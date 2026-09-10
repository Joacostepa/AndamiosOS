"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, MapPin, Search, TriangleAlert, X } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { normalizar } from "@/lib/tablero/titulo";
import {
  antiguedadDe, contarPorTramo, textoDias, tramoDe, TRAMOS,
  type ObraEnMapa, type TramoAntiguedad,
} from "@/lib/mapa-obras/antiguedad";

// Mapa de Obras: dónde está, hoy, todo lo que tenemos armado.
//
// LA PREGUNTA QUE CONTESTA no es "dónde queda esta obra" —eso ya está en la ficha— sino
// "qué tenemos parado en la calle y desde cuándo". Una obra armada hace 160 días es una
// renta excelente o una estructura que nadie se acordó de bajar, y hasta esta pantalla no
// había forma de distinguirlas sin abrir las ventas de a una.
//
// Por eso el color es la ANTIGÜEDAD y no el tipo de trabajo: el tipo ya se ve en el tablero.

const MapaObras = dynamic(
  () => import("@/components/mapa-obras/mapa-obras").then((m) => m.MapaObras),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-lg" />,
  },
);

export default function MapaObrasPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["mapa-obras"],
    queryFn: async () => {
      const res = await fetch("/api/operaciones/mapa-obras");
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo leer el mapa");
      return (await res.json()) as { obras: ObraEnMapa[] };
    },
    staleTime: 5 * 60 * 1000,
  });

  const [tramos, setTramos] = useState<Set<TramoAntiguedad>>(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [seleccionada, setSeleccionada] = useState<number | null>(null);

  const todas = useMemo(() => data?.obras ?? [], [data]);
  const conteos = useMemo(() => contarPorTramo(todas), [todas]);
  const obraSeleccionada = todas.find((o) => o.ventaId === seleccionada) ?? null;

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return todas
      .filter((o) => tramos.size === 0 || tramos.has(tramoDe(o.diasArmado)))
      .filter((o) =>
        !q || normalizar(`${o.direccion} ${o.referencia ?? ""} ${o.cliente ?? ""} ${o.venta}`).includes(q),
      )
      // Las más viejas arriba: son las que reclaman una decisión.
      .sort((a, b) => (b.diasArmado ?? -1) - (a.diasArmado ?? -1));
  }, [todas, tramos, busqueda]);

  function alternarTramo(t: TramoAntiguedad) {
    setTramos((prev) => {
      const s = new Set(prev);
      if (s.has(t)) s.delete(t);
      else s.add(t);
      return s;
    });
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-4">
      <PageHeader
        title="Mapa de Obras"
        description={
          isLoading ? "Cargando…" : `${todas.length} obras armadas hoy`
        }
      >
        <div className="relative w-64">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Dirección, referencia o cliente…"
            className="pl-8"
          />
        </div>
      </PageHeader>

      {/* Leyenda y filtro son LO MISMO: cada tramo dice cuántas hay y filtra al tocarlo.
          Dos controles separados para la misma escala se desincronizan solos. */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(TRAMOS) as TramoAntiguedad[]).map((t) => {
          const activo = tramos.has(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => alternarTramo(t)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors",
                activo ? "border-foreground/40 bg-muted" : "hover:border-foreground/25",
                conteos[t] === 0 && "opacity-40",
              )}
              aria-pressed={activo}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: TRAMOS[t].color }}
                aria-hidden
              />
              {TRAMOS[t].label}
              <span className="font-semibold tabular-nums">{conteos[t]}</span>
            </button>
          );
        })}
        {tramos.size > 0 && (
          <button
            type="button"
            onClick={() => setTramos(new Set())}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            ver todas
          </button>
        )}
      </div>

      {isError ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed">
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "No se pudo leer el mapa"}
          </p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
          <ListaObras
            obras={visibles}
            total={todas.length}
            cargando={isLoading}
            seleccionada={seleccionada}
            onSeleccionar={setSeleccionada}
          />
          <div className="relative min-h-[24rem] overflow-hidden rounded-lg border">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <MapaObras
                obras={visibles}
                seleccionada={seleccionada}
                onSeleccionar={setSeleccionada}
              />
            )}
            {/* La ficha va FLOTANDO sobre el mapa y no en un popup anclado al punto: el
                texto de qué hay armado son varias líneas y un globo de ese tamaño pegado
                al marcador tapa media ciudad y se mueve con el mapa. */}
            {obraSeleccionada && (
              <FichaObra obra={obraSeleccionada} onCerrar={() => setSeleccionada(null)} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ListaObras({
  obras,
  total,
  cargando,
  seleccionada,
  onSeleccionar,
}: {
  obras: ObraEnMapa[];
  total: number;
  cargando: boolean;
  seleccionada: number | null;
  onSeleccionar: (id: number | null) => void;
}) {
  if (cargando) {
    return (
      <div className="space-y-2 overflow-hidden rounded-lg border p-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }
  if (obras.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {total === 0
            ? "No hay obras armadas con dirección geocodificada."
            : "Ninguna obra coincide con el filtro."}
        </p>
      </div>
    );
  }
  return (
    <div className="min-h-0 overflow-y-auto rounded-lg border">
      <ul className="divide-y">
        {obras.map((o) => {
          const a = antiguedadDe(o.diasArmado);
          const activa = o.ventaId === seleccionada;
          return (
            <li key={o.ventaId}>
              <button
                type="button"
                onClick={() => onSeleccionar(activa ? null : o.ventaId)}
                className={cn(
                  "flex w-full items-start gap-2 px-3 py-2 text-left transition-colors",
                  activa ? "bg-muted" : "hover:bg-muted/50",
                )}
              >
                <span
                  className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: a.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{o.direccion}</span>
                  {o.referencia && (
                    <span className="block truncate text-[11px] font-medium text-muted-foreground">
                      {o.referencia}
                    </span>
                  )}
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {o.cliente ?? "—"}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11px]">
                    <span style={{ color: a.color }} className="font-semibold">
                      {textoDias(o.diasArmado)}
                    </span>
                    {o.vencida && (
                      <span
                        className="flex items-center gap-0.5 text-[10px] font-semibold"
                        style={{ color: TRAMOS.larga.color }}
                        title={`Fin de obra estimado: ${o.finEstimado}`}
                      >
                        <TriangleAlert className="h-3 w-3" />
                        pasó el fin estimado
                      </span>
                    )}
                  </span>
                </span>
                {activa && (
                  <a
                    href={o.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label={`Abrir ${o.venta} en Odoo`}
                    title={`Abrir ${o.venta} en Odoo`}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="flex items-center gap-1 border-t px-3 py-2 text-[11px] text-muted-foreground">
        <MapPin className="h-3 w-3" />
        {obras.length === total ? `${total} obras` : `${obras.length} de ${total}`}
      </p>
    </div>
  );
}

/**
 * Qué hay parado en esa obra. Es la razón de ser del clic: la dirección ya se lee en la
 * lista, lo que no estaba en ningún lado es QUÉ estructura hay levantada ahí.
 */
function FichaObra({ obra, onCerrar }: { obra: ObraEnMapa; onCerrar: () => void }) {
  const a = antiguedadDe(obra.diasArmado);
  return (
    <div className="absolute bottom-3 left-3 right-3 max-h-[55%] overflow-y-auto rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur sm:right-auto sm:w-96">
      <div className="flex items-start gap-2">
        <span
          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: a.color }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight">{obra.direccion}</p>
          {obra.referencia && (
            <p className="text-[12px] font-medium text-muted-foreground">{obra.referencia}</p>
          )}
          <p className="truncate text-[11px] text-muted-foreground">{obra.cliente ?? "—"}</p>
        </div>
        <a
          href={obra.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title={`Abrir ${obra.venta} en Odoo`}
        >
          <ExternalLink className="h-4 w-4" />
        </a>
        <button
          type="button"
          onClick={onCerrar}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <span className="font-semibold" style={{ color: a.color }}>{textoDias(obra.diasArmado)}</span>
        {obra.vencida && (
          <span className="flex items-center gap-0.5 font-semibold" style={{ color: TRAMOS.larga.color }}>
            <TriangleAlert className="h-3 w-3" />
            pasó el fin estimado {obra.finEstimado}
          </span>
        )}
      </p>

      <div className="mt-2 border-t pt-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Qué está armado
          {/* No es lo mismo lo que se planificó que lo que la cuadrilla dejó parado. Cuando
              existe el as-built manda, y conviene que se note cuál de los dos se está leyendo. */}
          {obra.queEstaArmado && (
            <span className="ml-1 font-normal normal-case">
              {obra.esAsBuilt ? "· como quedó en obra" : "· según lo previsto"}
            </span>
          )}
        </p>
        <p className="mt-1 whitespace-pre-line text-[12px] leading-snug">
          {obra.queEstaArmado ?? "Sin detalle cargado en la OT de armado."}
        </p>
      </div>
    </div>
  );
}
