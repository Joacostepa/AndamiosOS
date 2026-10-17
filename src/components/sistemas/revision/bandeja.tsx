"use client";

// La bandeja de Sistemas (contrato §9; maqueta: bandejaHTML). Sólo para quien tiene
// Sistemas · Revisión en «editar»: el proxy cierra la página y la API repite la llave en cada
// pedido, incluidos los GET. Un admin sin el módulo no ve nada (decisión de privacidad: lo
// que alguien manda lo ve sólo Sistemas).
//
// Pestañas por estado con su contador, una franja de números simples, filtros (texto, tipo,
// «frena el trabajo») y la lista con el detalle al costado. En pantallas angostas, lista y
// detalle se apilan: se ve uno u otro, con «volver».
//
// LA SELECCIÓN VIVE EN LA URL (?id=): es lo que manda la campanita, y un enlace copiado abre
// el mismo reporte. Al llegar por enlace se elige la pestaña de su estado.
//
// NADA SE ABRE SOLO. Abrir un reporte `nuevo` lo marca `visto` en el servidor; si la bandeja
// eligiera el primero de la lista por su cuenta, iría marcando vistos en cadena reportes que
// nadie miró. Por eso, sin ?id=, el detalle dice «Elegí un reporte de la lista».

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Flame, Lock, Paperclip, Search, TriangleAlert, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CLAVES, ErrorSistemas, useReporteRevision, useRevision, type FiltrosRevision } from "@/hooks/use-sistemas";
import { useQueryClient } from "@tanstack/react-query";
import {
  ESTADOS,
  ESTADOS_REPORTE,
  PRIORIDADES,
  TEXTOS,
  TIPOS,
  TIPOS_REPORTE,
  primerNombre,
  type EstadoReporte,
  type Metricas,
  type ReporteFila,
  type TipoReporte,
} from "@/lib/sistemas/tipos";
import { IconoTipoCaja, TONO_INFO, TONO_PELIGRO, hace } from "@/components/sistemas/comun";
import { DetalleReporte } from "@/components/sistemas/revision/detalle";

export function BandejaRevision() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const qc = useQueryClient();
  const sel = params.get("id");

  const [estado, setEstado] = useState<EstadoReporte>("nuevo");
  const [tipo, setTipo] = useState<TipoReporte | null>(null);
  const [frena, setFrena] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [q, setQ] = useState("");

  // El buscador pregunta al servidor (busca también por nombre y por #): con una pausa, no
  // en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setQ(busqueda), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const filtros = useMemo<FiltrosRevision>(() => ({ estado, tipo, frena, q }), [estado, tipo, frena, q]);
  const lista = useRevision(filtros);
  const detalle = useReporteRevision(sel);

  // Llegó por enlace (campanita, enlace copiado): la pestaña del estado de ese reporte. Si lo
  // eligió de la lista, se queda en la pestaña en la que estaba. Se ajusta durante el render
  // (y no en un efecto) para no pintar un cuadro con la pestaña equivocada.
  const [elegidoEnLista, setElegidoEnLista] = useState<string | null>(null);
  const [pestanaFijada, setPestanaFijada] = useState<string | null>(null);
  const estadoDetalle = detalle.data?.reporte.estado;
  if (sel && estadoDetalle && pestanaFijada !== sel) {
    setPestanaFijada(sel);
    if (elegidoEnLista !== sel) setEstado(estadoDetalle);
  }

  // Abrir uno nuevo lo pasó a visto: la lista y los contadores se ponen al día.
  const filaSel = lista.data?.reportes.find((r) => r.id === sel);
  useEffect(() => {
    if (filaSel && estadoDetalle && filaSel.estado !== estadoDetalle) qc.invalidateQueries({ queryKey: CLAVES.lista() });
  }, [filaSel, estadoDetalle, qc]);

  function elegir(id: string | null, desdeLista = false) {
    if (desdeLista && id) setElegidoEnLista(id);
    router.replace(id ? `${pathname}?id=${id}` : pathname, { scroll: false });
  }

  const err = lista.error;
  if (err instanceof ErrorSistemas && (err.status === 403 || err.status === 401)) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-10 text-muted-foreground/50" />
        <p className="max-w-sm text-[14px] text-muted-foreground">{TEXTOS.revision.sinPermiso}</p>
      </div>
    );
  }

  const data = lista.data;
  const contadores = data?.contadores;
  const nuevos = contadores?.nuevo ?? 0;
  const frenan = data?.frenanAbiertos ?? 0;
  const reportes = data?.reportes ?? [];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{TEXTOS.revision.titulo}</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          {TEXTOS.revision.subtitulo}
          {data && (
            <>
              {" · "}
              {nuevos} {nuevos === 1 ? "nuevo" : "nuevos"}
              {frenan > 0 && (
                <>
                  {" · "}
                  <b className="font-semibold" style={{ color: TONO_PELIGRO.borde }}>
                    {frenan} {frenan === 1 ? "frena" : "frenan"} el trabajo
                  </b>
                </>
              )}
            </>
          )}
        </p>
      </div>

      {err && (
        <div className="flex items-start gap-3 rounded-lg border px-4 py-3 text-[13.5px]" style={{ backgroundColor: "var(--tb-ambar-bg)", borderColor: "var(--tb-ambar-borde)" }}>
          <TriangleAlert className="mt-0.5 size-4 shrink-0" style={{ color: "var(--tb-ambar-text)" }} />
          <span>{err.message}</span>
        </div>
      )}

      {data && <FranjaMetricas m={data.metricas} />}

      <div role="tablist" aria-label="Estados" className="-mx-1 flex gap-0.5 overflow-x-auto border-b px-1">
        {ESTADOS_REPORTE.map((e) => {
          const n = contadores?.[e] ?? 0;
          const activo = estado === e;
          return (
            <button
              key={e}
              type="button"
              role="tab"
              aria-selected={activo}
              onClick={() => setEstado(e)}
              className={cn(
                "-mb-px inline-flex min-h-10 items-center gap-1.5 border-b-2 px-3 text-[13px] whitespace-nowrap transition-colors",
                activo ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {ESTADOS[e].etiqueta}
              {n > 0 && (
                <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", activo ? "bg-accent text-primary" : "bg-muted")}>{n}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1 sm:max-w-[300px]">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setBusqueda("")}
            placeholder={TEXTOS.revision.buscar}
            aria-label={TEXTOS.revision.buscar}
            className="h-9 pr-8 pl-8 text-base sm:text-[13px]"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Borrar búsqueda"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {([null, ...TIPOS_REPORTE] as const).map((t) => (
            <ChipFiltro key={t ?? "todos"} activo={tipo === t} onClick={() => setTipo(t)}>
              {t ? TIPOS[t].etiqueta : TEXTOS.revision.todos}
            </ChipFiltro>
          ))}
          <ChipFiltro activo={frena} onClick={() => setFrena((f) => !f)}>
            <Flame className="size-3.5" />
            {TEXTOS.revision.frenaFiltro}
          </ChipFiltro>
        </div>
      </div>

      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(280px,380px)_1fr]">
        <div className={cn("flex min-w-0 flex-col gap-1.5", sel && "max-lg:hidden", lista.isPlaceholderData && "opacity-60 transition-opacity")}>
          {lista.isLoading &&
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[74px] w-full rounded-xl" />)}
          {!lista.isLoading && !err && reportes.length === 0 && (
            <div className="rounded-xl border bg-card px-4 py-10 text-center text-[13px] text-muted-foreground">{TEXTOS.revision.vacio}</div>
          )}
          {reportes.map((r) => (
            <FilaReporte key={r.id} r={r} activo={r.id === sel} onElegir={() => elegir(r.id, true)} />
          ))}
        </div>

        <div className={cn("min-w-0 rounded-xl border bg-card", !sel && "max-lg:hidden")}>
          {sel ? (
            <DetalleReporte
              key={sel}
              id={sel}
              consulta={detalle}
              onVolver={() => elegir(null)}
              onElegir={(id) => elegir(id)}
              // Como en la maqueta: al cambiarle el estado, la lista pasa a esa pestaña y el
              // reporte sigue a la vista, elegido.
              onEstado={(e) => {
                setElegidoEnLista(sel);
                setEstado(e);
              }}
            />
          ) : (
            <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">{TEXTOS.revision.elegi}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChipFiltro({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors",
        activo ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function FilaReporte({ r, activo, onElegir }: { r: ReporteFila; activo: boolean; onElegir: () => void }) {
  const prioridad = r.prioridad ? PRIORIDADES.find((p) => p.valor === r.prioridad)?.etiqueta : null;
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-current={activo || undefined}
      className={cn(
        "flex w-full gap-2.5 rounded-xl border bg-card px-3 py-2.5 text-left transition-colors",
        activo ? "border-primary ring-1 ring-primary" : "hover:border-muted-foreground",
      )}
    >
      <IconoTipoCaja tipo={r.tipo} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="line-clamp-2 text-[13px] [overflow-wrap:anywhere]">
          <span className="font-mono text-muted-foreground tabular-nums">#{r.numero}</span> {r.descripcion}
        </span>
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-muted-foreground">
          <span>{r.pantalla}</span>
          <span>·</span>
          <span>{primerNombre(r.creador.nombre) || "—"}</span>
          <span>·</span>
          <span>{hace(r.createdAt)}</span>
          {r.frena && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-0.5 font-semibold" style={{ color: TONO_PELIGRO.borde }}>
                <Flame className="size-3" />
                Frena
              </span>
            </>
          )}
          {prioridad && (
            <>
              <span>·</span>
              <span>Prioridad {prioridad.toLowerCase()}</span>
            </>
          )}
          {r.cantCapturas > 0 && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-0.5">
                <Paperclip className="size-3" />
                {r.cantCapturas}
              </span>
            </>
          )}
          {r.esperandoRespuesta && (
            <>
              <span>·</span>
              <span style={{ color: TONO_INFO.borde }}>{TEXTOS.revision.esperandoRespuesta}</span>
            </>
          )}
        </span>
      </span>
      {r.respuestaSinLeer && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" title="Respuesta sin leer" />}
    </button>
  );
}

const dias = (n: number | null) =>
  n === null ? "—" : `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })} ${Math.abs(n - 1) < 0.05 ? "día" : "días"}`;

function FranjaMetricas({ m }: { m: Metricas }) {
  const items: [string, string][] = [
    [String(m.semana.reportes), `${m.semana.reportes === 1 ? "reporte" : "reportes"} esta semana, de ${m.semana.personas} ${m.semana.personas === 1 ? "persona" : "personas"}`],
    [dias(m.primeraRespuestaDias), "hasta la primera respuesta"],
    [dias(m.resolverDias), "para resolver"],
    [m.preguntamosPct === null ? "—" : `${Math.round(m.preguntamosPct)} %`, "hubo que preguntar algo"],
    [m.recorrido ? `${m.recorrido.hicieron} de ${m.recorrido.total}` : "—", "hicieron el recorrido"],
  ];
  return (
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2 rounded-xl border bg-card px-3.5 py-2.5">
      {items.map(([valor, texto]) => (
        <div key={texto}>
          <b className="text-[17px] font-semibold tracking-tight tabular-nums">{valor}</b>
          <span className="ml-1.5 text-[12px] text-muted-foreground">{texto}</span>
        </div>
      ))}
    </div>
  );
}
