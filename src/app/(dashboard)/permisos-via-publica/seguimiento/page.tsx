"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Search, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useSeguimientoPermisos } from "@/hooks/use-permisos-via-publica";
import { coincideTexto } from "@/lib/permisos-via-publica/tipos";
import { ETAPAS, type ClaveEtapa, type Etapa, type FilaSeguimiento, type Quien, type Seguimiento } from "@/lib/permisos-via-publica/seguimiento";

// Seguimiento de permisos: una fila por trámite con su línea de 7 etapas, quién lo tiene que
// mover y cuándo debería salir. Agrupado como la bandeja: primero lo que pide algo de ABA.
// Validado con JS como maqueta el 06/10.

const DIA = 86_400_000;
const NOMBRE = Object.fromEntries(ETAPAS.map((e) => [e.clave, e.nombre])) as Record<ClaveEtapa, string>;
/** Días en una etapa a partir de los cuales se pinta amarillo y rojo. */
const LIMITE: Partial<Record<ClaveEtapa, [number, number]>> = { legajo: [2, 5], poliza: [2, 4], encomienda: [1, 3], tad: [1, 2], gcba: [14, 21] };

type Grupo = "mal" | "armando" | "gcba" | "listo";
const GRUPOS: { clave: Grupo; titulo: string; bajada: string }[] = [
  { clave: "mal", titulo: "Necesitan algo", bajada: "documentos observados, robot frenado, subsanaciones" },
  { clave: "armando", titulo: "Armando el trámite", bajada: "legajo, póliza y encomienda hasta presentar" },
  { clave: "gcba", titulo: "En el GCBA", bajada: "presentados, esperando el permiso" },
  { clave: "listo", titulo: "Permiso emitido", bajada: "listos" },
];

const TZ = "America/Argentina/Buenos_Aires";
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: TZ });
const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ });
const dia = (ms: number) => new Date(ms).toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: TZ });
function hace(iso: string, ahora: number): string {
  const h = (ahora - Date.parse(iso)) / 3_600_000;
  if (h < 1) return "hace menos de 1 h";
  if (h < 24) return `hace ${Math.round(h)} h`;
  const d = Math.round(h / 24);
  return `hace ${d} día${d === 1 ? "" : "s"}`;
}
/** "CONSORCIO DE PROPIETARIOS SALGUERO 359" → "Consorcio De Propietarios Salguero 359". */
const titulo = (s: string | null) => (s ?? "").toLowerCase().replace(/(^|\s|\/)\S/g, (c) => c.toUpperCase());

type Analizada = FilaSeguimiento & {
  grupo: Grupo;
  actual: Etapa | undefined;
  trabada: Etapa | undefined;
  enCurso: Etapa[];
  quienes: Quien[];
  sale: { texto: string; tarde?: boolean };
};

function analizar(f: FilaSeguimiento, tipico: Seguimiento["tipico"], ahora: number): Analizada {
  const trabada = f.etapas.find((e) => e.estado === "trabado");
  const enCurso = f.etapas.filter((e) => e.estado === "curso");
  const actual = trabada ?? enCurso[0] ?? f.etapas.find((e) => e.estado === "pendiente");
  const listo = f.etapas.every((e) => e.estado === "hecho");
  const grupo: Grupo = listo ? "listo" : trabada ? "mal" : actual?.clave === "gcba" ? "gcba" : "armando";
  const presentado = f.etapas.find((e) => e.clave === "tad" && e.estado === "hecho" && e.fecha);

  let sale: Analizada["sale"];
  if (listo) sale = { texto: `Emitido el ${fecha(f.etapas.at(-1)!.fecha!)}` };
  else if (trabada) sale = { texto: "Depende de la corrección" };
  else if (presentado && tipico.gcba != null) {
    const estimada = Date.parse(presentado.fecha!) + tipico.gcba * DIA;
    sale = estimada < ahora ? { texto: `Pasó la fecha típica (${fecha(new Date(estimada).toISOString())})`, tarde: true } : { texto: `Permiso aprox. ${dia(estimada)}` };
  } else if (!presentado && tipico.aPresentar != null) {
    const pres = Math.max(ahora + DIA / 2, Date.parse(f.abierto) + tipico.aPresentar * DIA);
    sale = { texto: `Presentación aprox. ${dia(pres)}${tipico.gcba != null ? ` · permiso aprox. ${fecha(new Date(pres + tipico.gcba * DIA).toISOString())}` : ""}` };
  } else sale = { texto: "" };

  // Póliza y encomienda corren en paralelo: pueden ser dos los que tienen que mover.
  const quienes = [...new Set((trabada ? [trabada] : enCurso).map((e) => e.quien).filter((q): q is Quien => !!q))];
  return { ...f, grupo, actual, trabada, enCurso, quienes, sale };
}

function demora(e: Etapa | undefined, ahora: number): "" | "tarde" | "muy" {
  const lim = e && LIMITE[e.clave];
  if (!e?.desde || !lim) return "";
  const d = (ahora - Date.parse(e.desde)) / DIA;
  return d > lim[1] ? "muy" : d > lim[0] ? "tarde" : "";
}

const COLOR_QUIEN: Record<Quien, string> = {
  Cliente: "text-amber-600 dark:text-amber-300",
  Segucom: "text-blue-600 dark:text-blue-300",
  CPAU: "text-blue-600 dark:text-blue-300",
  Robot: "text-muted-foreground",
  GCBA: "text-muted-foreground",
  ABA: "text-red-600 dark:text-red-300 bg-red-500/10",
};

function ChipQuien({ quien, prefijo = "" }: { quien: Quien | "Listo"; prefijo?: string }) {
  const color = quien === "Listo" ? "text-green-600 dark:text-green-300 bg-green-500/10" : COLOR_QUIEN[quien];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[12px] font-semibold", color)}>
      <span className="size-1.5 rounded-full bg-current" />
      {prefijo}
      {quien}
    </span>
  );
}

function Punto({ estado }: { estado: Etapa["estado"] }) {
  return (
    <span
      className={cn(
        "relative z-10 grid size-[18px] shrink-0 place-items-center rounded-full border-2 bg-card text-[11px] font-bold leading-none",
        estado === "hecho" && "border-green-500 bg-green-500 text-white",
        estado === "curso" && "border-blue-500 bg-blue-500/15",
        estado === "trabado" && "border-red-500 bg-red-500 text-white",
        estado === "pendiente" && "border-border",
      )}
    >
      {estado === "hecho" && "✓"}
      {estado === "curso" && <span className="size-1.5 rounded-full bg-blue-500" />}
      {estado === "trabado" && "!"}
    </span>
  );
}

function Linea({ etapas }: { etapas: Etapa[] }) {
  return (
    <div className="grid grid-cols-7 pb-4 sm:pb-0">
      {etapas.map((e, i) => (
        <div
          key={e.clave}
          className="relative flex min-w-0 flex-col items-center gap-1"
          title={`${NOMBRE[e.clave]}${e.fecha ? ` · ${fecha(e.fecha)}` : ""}${e.detalle ? ` · ${e.detalle}` : ""}`}
        >
          {i > 0 && <span className={cn("absolute right-1/2 top-2 h-0.5 w-full", e.estado === "pendiente" ? "bg-border" : "bg-green-500")} />}
          <Punto estado={e.estado} />
          <span
            className={cn(
              "text-center text-[11px] leading-tight text-muted-foreground",
              e.estado === "curso" && "font-semibold text-blue-600 dark:text-blue-300",
              e.estado === "trabado" && "font-semibold text-red-600 dark:text-red-300",
              // En el teléfono sólo se lee el nombre de la etapa en la que está.
              e.estado === "hecho" || e.estado === "pendiente" ? "hidden sm:block" : "absolute top-6 whitespace-nowrap sm:static sm:whitespace-normal",
            )}
          >
            {NOMBRE[e.clave]}
          </span>
        </div>
      ))}
    </div>
  );
}

function Tramite({ f, abierto, alternar, ahora }: { f: Analizada; abierto: boolean; alternar: () => void; ahora: number }) {
  const listo = f.grupo === "listo";
  const detalle = f.trabada ? f.trabada.detalle : f.enCurso.map((e) => e.detalle).join(" · ") || (listo ? f.etapas.at(-1)?.detalle : "");
  const lenta = demora(f.actual, ahora);
  return (
    <article className={cn("rounded-md border bg-card", f.trabada && "border-l-[3px] border-l-red-500")}>
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierto}
        className="grid w-full grid-cols-1 items-center gap-3 rounded-md px-3.5 py-3 text-left hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-primary sm:grid-cols-2 lg:grid-cols-[1.25fr_1.6fr_0.95fr] lg:gap-4"
      >
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-[12px] text-muted-foreground">{f.venta}</span>
            <span className="text-[14.5px] font-semibold">{f.direccion}</span>
          </div>
          <div className="truncate text-[12.5px] text-muted-foreground" title={f.cliente ?? ""}>{titulo(f.cliente)}</div>
          <div className="text-[12px]">
            <span className="text-muted-foreground">Vendedora </span>
            {f.vendedora ?? "sin vendedora"}
          </div>
        </div>
        <div className="sm:order-3 sm:col-span-2 lg:order-none lg:col-span-1">
          <Linea etapas={f.etapas} />
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap gap-1">
            {listo ? <ChipQuien quien="Listo" /> : f.quienes.map((q) => <ChipQuien key={q} quien={q} prefijo="Lo tiene: " />)}
          </div>
          {detalle && <div className="text-[12.5px]">{detalle}</div>}
          {!listo && f.actual?.desde && (
            <div className="text-[12px] text-muted-foreground">
              En «{NOMBRE[f.actual.clave]}»{" "}
              <span className={cn(lenta === "tarde" && "font-semibold text-amber-600 dark:text-amber-300", lenta === "muy" && "font-semibold text-red-600 dark:text-red-300")}>
                {hace(f.actual.desde, ahora)}
              </span>
            </div>
          )}
          {f.sale.texto && (
            <div className={cn("text-[12.5px] tabular-nums", f.sale.tarde && "font-semibold text-amber-600 dark:text-amber-300")}>{f.sale.texto}</div>
          )}
        </div>
      </button>
      {abierto && <Detalle f={f} />}
    </article>
  );
}

function Detalle({ f }: { f: Analizada }) {
  return (
    <div className="grid grid-cols-1 gap-6 border-t p-3.5 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Línea de tiempo</h3>
        <ol>
          {f.etapas.map((e, i) => (
            <li key={e.clave} className="relative grid grid-cols-[18px_minmax(0,1fr)] gap-2.5 pb-3">
              {i < f.etapas.length - 1 && <span className="absolute bottom-0 left-2 top-[18px] w-0.5 bg-border" />}
              <Punto estado={e.estado} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-[13.5px] font-semibold">{NOMBRE[e.clave]}</span>
                  <span className="font-mono text-[12px] text-muted-foreground">
                    {e.fecha ? fechaHora(e.fecha) : e.desde ? `desde ${fechaHora(e.desde)}` : ""}
                  </span>
                  {e.quien && e.estado !== "hecho" && <ChipQuien quien={e.quien} />}
                </div>
                <div className="text-[12.5px] text-muted-foreground">{e.estado === "pendiente" && !e.detalle ? "Todavía no empezó" : e.detalle}</div>
                {e.motivo && <div className="mt-1 break-words rounded bg-red-500/10 px-2 py-1.5 text-[12.5px]">{e.motivo}</div>}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="min-w-0">
        <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Datos</h3>
        <dl className="mb-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
          <dt className="text-muted-foreground">Venta</dt><dd className="font-mono">{f.venta}</dd>
          <dt className="text-muted-foreground">Obra</dt><dd>{f.direccion}</dd>
          <dt className="text-muted-foreground">Cliente</dt><dd className="break-words">{titulo(f.cliente)}{f.inquilino && " (inquilino)"}</dd>
          {f.administrador && (<><dt className="text-muted-foreground">Administrador</dt><dd>{f.administrador}</dd></>)}
          <dt className="text-muted-foreground">Vendedora</dt><dd>{f.vendedora ?? "—"}</dd>
          <dt className="text-muted-foreground">Expediente</dt>
          <dd className="font-mono">
            {f.expediente && f.expedienteId ? <Link href={`/permisos-via-publica/${f.expedienteId}`} className="underline-offset-2 hover:underline">{f.expediente}</Link> : "Sin presentar"}
          </dd>
          <dt className="text-muted-foreground">Abierto</dt><dd>{fechaHora(f.abierto)}</dd>
        </dl>
        <Link href={`/permisos-via-publica/tramites/${f.id}`} className="mb-4 inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
          Abrir la ficha del trámite <ArrowUpRight className="size-3.5" />
        </Link>
        <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Últimos movimientos</h3>
        <ul className="space-y-2">
          {f.eventos.map((e, i) => (
            <li key={i} className="grid gap-px text-[12.5px]">
              <span className="font-mono text-[11.5px] text-muted-foreground">{fechaHora(e.fecha)} · {e.actor}</span>
              <span className="break-words">{e.detalle}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function SeguimientoPermisosPage() {
  const { data, isLoading, error } = useSeguimientoPermisos();
  const [busqueda, setBusqueda] = useState("");
  const [vendedora, setVendedora] = useState("");
  const [filtroGrupo, setFiltroGrupo] = useState<Grupo | null>(null);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  const ahora = data ? Date.parse(data.generado) : 0;
  const todas = useMemo(() => (data ? data.filas.map((f) => analizar(f, data.tipico, Date.parse(data.generado))) : []), [data]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Seguimiento de permisos" description="No se pudo leer el seguimiento" />
        <EmptyState icon={TriangleAlert} title="Error" description={error instanceof Error ? error.message : "Error desconocido"} />
      </div>
    );
  }

  const visibles = todas.filter((f) => (!vendedora || f.vendedora === vendedora) && coincideTexto([f.venta, f.direccion, f.cliente], busqueda));
  const vendedoras = [...new Set(todas.map((f) => f.vendedora).filter((v): v is string => !!v))].sort();
  const alternar = (id: string) =>
    setAbiertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  // Lo más viejo en su etapa primero; los emitidos, el más reciente primero.
  const orden = (g: Grupo) => (a: Analizada, b: Analizada) =>
    g === "listo"
      ? Date.parse(b.etapas.at(-1)?.fecha ?? b.abierto) - Date.parse(a.etapas.at(-1)?.fecha ?? a.abierto)
      : Date.parse(a.actual?.desde ?? a.abierto) - Date.parse(b.actual?.desde ?? b.abierto);
  const { tipico } = data;

  return (
    <div className="space-y-5">
      <Link href="/permisos-via-publica" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Permisos de andamio
      </Link>
      <PageHeader
        title="Seguimiento de permisos"
        description="Cada trámite con su línea de tiempo: en qué etapa está, quién lo tiene que mover y cuándo debería salir."
      />

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {GRUPOS.map((g) => {
          const n = visibles.filter((f) => f.grupo === g.clave).length;
          const activo = filtroGrupo === g.clave;
          return (
            <button
              key={g.clave}
              type="button"
              aria-pressed={activo}
              onClick={() => setFiltroGrupo(activo ? null : g.clave)}
              className={cn("grid gap-0.5 rounded-md border bg-card px-3.5 py-3 text-left hover:bg-muted/40", activo && "border-foreground")}
            >
              <span className={cn("text-[26px] font-bold leading-tight tabular-nums", g.clave === "mal" && n > 0 && "text-red-600 dark:text-red-300")}>{n}</span>
              <span className="text-[13px] font-semibold">{g.titulo}</span>
              <span className="text-[12px] text-muted-foreground">{g.bajada}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted-foreground">
        {tipico.aPresentar != null && (
          <span>De abierto a presentado: <b className="font-semibold text-foreground">~{Math.round(tipico.aPresentar)} días</b> (mediana de {tipico.nPresentados})</span>
        )}
        {tipico.gcba != null && (
          <span>De presentado a permiso: <b className="font-semibold text-foreground">~{Math.round(tipico.gcba)} días</b> (mediana de {tipico.nEmitidos} emitidos)</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 max-w-sm flex-1 basis-56">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por venta, dirección o cliente" className="pl-8" />
        </div>
        <select
          value={vendedora}
          onChange={(e) => setVendedora(e.target.value)}
          aria-label="Vendedora"
          className="h-9 rounded-md border bg-background px-2.5 text-[13px]"
        >
          <option value="">Todas las vendedoras</option>
          {vendedoras.map((v) => <option key={v}>{v}</option>)}
        </select>
      </div>

      {visibles.length === 0 ? (
        <EmptyState icon={Search} title="Ningún trámite coincide" description="Probá con otra búsqueda o con todas las vendedoras." />
      ) : (
        GRUPOS.filter((g) => !filtroGrupo || g.clave === filtroGrupo).map((g) => {
          const lista = visibles.filter((f) => f.grupo === g.clave).sort(orden(g.clave));
          if (!lista.length) return null;
          return (
            <section key={g.clave} className="space-y-2">
              <h2 className={cn("flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold uppercase tracking-wide", g.clave === "mal" && "text-red-600 dark:text-red-300")}>
                {g.titulo} <span className="font-medium text-muted-foreground">{lista.length}</span>
                <span className="text-[12.5px] font-normal normal-case tracking-normal text-muted-foreground">{g.bajada}</span>
              </h2>
              {lista.map((f) => (
                <Tramite key={f.id} f={f} abierto={abiertos.has(f.id)} alternar={() => alternar(f.id)} ahora={ahora} />
              ))}
            </section>
          );
        })
      )}
    </div>
  );
}
