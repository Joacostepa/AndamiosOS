"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Aviso, Chip } from "@/components/permisos-via-publica/ui";
import { FilaPermisoView } from "@/components/permisos-via-publica/fila-permiso";
import { VentasParaIniciar } from "@/components/permisos-via-publica/ventas-para-iniciar";
import { Configuracion } from "@/components/permisos-via-publica/configuracion";
import { ESPERANDO_A } from "@/components/permisos-via-publica/textos";
import { useDescarte, useListaPermisos, useRevisarAhora, useVentasParaIniciar } from "@/hooks/use-permisos-via-publica";
import { haceCuanto, type Quien } from "@/lib/permisos-via-publica/estado";
import type { FilaPermiso, ListaPermisos } from "@/lib/permisos-via-publica/lista";
import { coincideTexto, direccionCorta, type EstadoRobot } from "@/lib/permisos-via-publica/tipos";

// Permisos de andamio — UNA lista para todos los permisos (rediseño 09/10, docs/permisos-rediseno.md).
// Reemplaza a la bandeja y a Seguimiento:
//   1. Te toca: lo que espera a alguien de la oficina, con nombre y el botón. Incluye las ventas
//      para iniciar y "perseguir al cliente" cuando pasa el umbral.
//   2. Esperando a otros, agrupado por quién: cliente, Segucom, CPAU, robot.
//   3. En el Gobierno, con días desde la presentación y la fecha estimada.
//   Plegados: emitidos, archivados sin permiso, historial y pruebas.
// Cada fila trae la línea de 7 etapas y en qué está (estado.ts): la misma cuenta que la ficha.
//
// EL LATIDO DEL ROBOT VA ARRIBA Y A LA VISTA: una lista sin novedades puede ser "no cambió nada"
// o "el robot está apagado", y sin la hora de la última revisión no se distinguen.

type Filtro = "mias" | "todas";
const FILTRO_KEY = "permisos:filtro";

/** Más de 3 horas sin una revisión buena es un robot caído o una Mac apagada. */
function robotDormido(robot: EstadoRobot | null, ahora: number): boolean {
  if (!robot?.ultimo_ok_at) return true;
  return ahora - Date.parse(robot.ultimo_ok_at) > 3 * 3600_000;
}

function esMia(f: FilaPermiso, yo: ListaPermisos["yo"]): boolean {
  if (!yo.email) return false;
  if (f.acciones.some((a) => (a.persona ? a.persona.email === yo.email : yo.esAdmin || yo.puedeIrreversible))) return true;
  return f.vendedora?.email === yo.email || f.gestor?.email === yo.email;
}

export default function PermisosViaPublicaPage() {
  const { data, isLoading, error } = useListaPermisos();
  const ventasQuery = useVentasParaIniciar();
  const revisar = useRevisarAhora();
  const [busqueda, setBusqueda] = useState("");
  // El filtro elegido se recuerda en este navegador. Sin elección: "Mías" si hay algo mío. Se lee
  // al montar: el servidor y la hidratación pintan el esqueleto, que no depende del filtro.
  const [filtro, setFiltro] = useState<Filtro | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const guardado = window.localStorage.getItem(FILTRO_KEY);
      return guardado === "mias" || guardado === "todas" ? guardado : null;
    } catch {
      return null; // sin almacenamiento: queda el de por defecto
    }
  });
  const [vendedora, setVendedora] = useState("");

  function elegirFiltro(f: Filtro) {
    setFiltro(f);
    try {
      window.localStorage.setItem(FILTRO_KEY, f);
    } catch {
      /* sin almacenamiento */
    }
  }

  const ahora = data ? Date.parse(data.generado) : 0;
  const vendedoras = useMemo(
    () => [...new Set((data?.filas ?? []).map((f) => f.vendedora?.nombre).filter((v): v is string => !!v))].sort(),
    [data],
  );

  if (isLoading) {
    return (
      <div className="space-y-5" aria-busy>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Permisos de andamio</h1>
        <Aviso tono="bloqueo" titulo="No se pudo leer la lista de permisos">
          {error instanceof Error ? error.message : "Error desconocido"}. Probá recargar la página en un rato.
        </Aviso>
      </div>
    );
  }

  const misAcciones = data.filas.some((f) => !f.esPrueba && f.estado.grupo === "te_toca" && esMia(f, data.yo));
  const filtroActivo: Filtro = filtro ?? (misAcciones && !data.yo.esAdmin ? "mias" : "todas");

  const pasa = (f: FilaPermiso) =>
    (filtroActivo === "todas" || esMia(f, data.yo)) &&
    (!vendedora || f.vendedora?.nombre === vendedora) &&
    coincideTexto([f.direccion, f.venta, f.cliente, f.dueno, f.expediente, f.vendedora?.nombre, f.gestor?.nombre], busqueda);
  const visibles = data.filas.filter(pasa);
  const de = (g: FilaPermiso["estado"]["grupo"]) => visibles.filter((f) => f.estado.grupo === g);
  const teToca = de("te_toca");
  const esperando = de("esperando");
  const gobierno = de("gobierno").sort((a, b) => Date.parse(a.estado.desde ?? "") - Date.parse(b.estado.desde ?? ""));
  const emitidos = de("emitido");
  const archivados = de("archivado");
  const pruebas = de("prueba");

  const ventasTodas = ventasQuery.data ?? [];
  const ventas = ventasTodas.filter(
    (v) => !data.descartes.ventas[String(v.ventaId)] &&
      (!vendedora || v.vendedor === vendedora) &&
      (filtroActivo === "todas" || data.yo.esAdmin || data.yo.puedeIrreversible) &&
      coincideTexto([v.direccion, v.venta, v.cliente, v.email, v.vendedor], busqueda),
  );
  const ventasDescartadas = ventasTodas.filter((v) => data.descartes.ventas[String(v.ventaId)]);
  const historial = busqueda ? data.historial.filter((e) => coincideTexto([e.direccion, e.titular, e.nombre, `EX-${e.numero}`, e.odoo_venta_nombre], busqueda)) : data.historial;

  const dormido = robotDormido(data.robot, ahora);
  const totalTeToca = teToca.length + ventas.length;
  const sinNada = visibles.length === 0 && ventas.length === 0 && historial.length === 0;

  function pedirRevision() {
    revisar.mutate(undefined, {
      onSuccess: (r) => toast.success(r.yaPedida ? "Ya hay una revisión en curso" : "Revisión pedida: el robot la toma en unos segundos"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo pedir la revisión"),
    });
  }

  const resumen: { n: number; texto: string; href: string; fuerte?: boolean }[] = [
    { n: totalTeToca, texto: "te toca", href: "#te-toca", fuerte: true },
    { n: esperando.length, texto: "esperando a otros", href: "#esperando" },
    { n: gobierno.length, texto: "en el Gobierno", href: "#gobierno" },
    { n: emitidos.length, texto: "emitidos", href: "#emitidos" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Permisos de andamio</h1>
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
            {resumen.map((r) => (
              <a key={r.href} href={r.href} className={cn("rounded-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring", r.fuerte && r.n > 0 && "font-semibold text-foreground")}>
                {r.fuerte ? `Te toca: ${r.n}` : `${r.n} ${r.texto}`}
              </a>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cn("size-2 rounded-full", dormido ? "bg-red-600 dark:bg-red-400" : "bg-emerald-600 dark:bg-emerald-400")} />
              {data.revisando ? "Revisando TAD…" : `Robot: revisó TAD ${data.robot?.ultimo_ok_at ? haceCuanto(data.robot.ultimo_ok_at, ahora) : "nunca"}`}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={pedirRevision} disabled={data.revisando || revisar.isPending} variant="outline" size="sm" className="max-sm:h-10">
            {data.revisando || revisar.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {data.revisando ? "Revisando TAD…" : "Revisar TAD"}
          </Button>
          <Configuracion lista={data} />
        </div>
      </header>

      {dormido && (
        <Aviso titulo={data.robot?.ultimo_ok_at ? `El robot no revisa TAD ${haceCuanto(data.robot.ultimo_ok_at, ahora)}.` : "El robot todavía no revisó TAD."}>
          {data.robot?.ultimo_error ? `Último error (${haceCuanto(data.robot.ultimo_error_at, ahora)}): ${data.robot.ultimo_error}` : "Corre en la Mac de la oficina: fijate que esté prendida."}
        </Aviso>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-64 sm:max-w-md">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar dirección, S0…, EX-… o cliente" aria-label="Buscar en los permisos" className="pl-8 max-sm:h-10" />
        </label>
        <div role="group" aria-label="Qué permisos ver" className="inline-flex overflow-hidden rounded-md border bg-background">
          {(["mias", "todas"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtroActivo === f}
              onClick={() => elegirFiltro(f)}
              className={cn("h-9 px-3 text-[13px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring max-sm:h-10", filtroActivo === f ? "bg-foreground font-semibold text-background" : "hover:bg-muted", f === "todas" && "border-l")}
            >
              {f === "mias" ? "Mías" : "Todas"}
            </button>
          ))}
        </div>
        <select value={vendedora} onChange={(e) => setVendedora(e.target.value)} aria-label="Filtrar por vendedora" className="h-9 rounded-md border bg-background px-2.5 text-[13px] max-sm:h-10">
          <option value="">Todas las vendedoras</option>
          {vendedoras.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      {sinNada ? (
        <EmptyState icon={Search} title={busqueda ? `Ningún resultado para «${busqueda}»` : "Nada para mostrar con este filtro"} description="Probá con el número de expediente (EX-…), la venta (S0…), la calle o el cliente, o con «Todas».">
          <Button variant="outline" size="sm" onClick={() => { setBusqueda(""); setVendedora(""); elegirFiltro("todas"); }}>Ver todas</Button>
        </EmptyState>
      ) : (
        <>
          <Bloque id="te-toca" titulo="Te toca" cantidad={totalTeToca} bajada="Lo que espera a alguien de la oficina. Lo que espera hace más, arriba.">
            {teToca.length === 0 && ventas.length === 0 && !ventasQuery.isLoading && (
              <p className="px-3 py-3 text-[13px] text-muted-foreground">Nada te espera ahora.</p>
            )}
            {teToca.length > 0 && <ul>{teToca.map((f) => <FilaPermisoView key={f.clave} f={f} ahora={ahora} />)}</ul>}
            <VentasParaIniciar ventas={ventas} isLoading={ventasQuery.isLoading} error={ventasQuery.error} linkAlCliente={data.supervision.linkAlCliente} ahora={ahora} puedeEditar={data.yo.puedeEditar} />
          </Bloque>

          {esperando.length > 0 && (
            <Bloque id="esperando" titulo="Esperando a otros" cantidad={esperando.length} bajada="No hay que hacer nada todavía.">
              {(["Cliente", "Segucom", "CPAU", "Robot"] as const).map((q) => {
                const filas = esperando.filter((f) => f.estado.loTiene === q);
                if (!filas.length) return null;
                return (
                  <div key={q} className="border-t first:border-t-0">
                    <p className="px-3 pt-2.5 text-[13px] font-semibold">{ESPERANDO_A[q].titulo} · {filas.length}</p>
                    <p className="px-3 text-[12px] text-muted-foreground">{ESPERANDO_A[q].bajada}</p>
                    <ul>{filas.map((f) => <FilaPermisoView key={f.clave} f={f} ahora={ahora} />)}</ul>
                  </div>
                );
              })}
              {esperando.filter((f) => !["Cliente", "Segucom", "CPAU", "Robot"].includes(f.estado.loTiene as Quien)).length > 0 && (
                <ul className="border-t">{esperando.filter((f) => !["Cliente", "Segucom", "CPAU", "Robot"].includes(f.estado.loTiene as Quien)).map((f) => <FilaPermisoView key={f.clave} f={f} ahora={ahora} />)}</ul>
              )}
            </Bloque>
          )}

          {gobierno.length > 0 && (
            <Bloque id="gobierno" titulo="En el Gobierno" cantidad={gobierno.length} bajada={`Días desde la presentación.${data.tipico.gcba != null ? ` Lo normal: el permiso sale a los ${Math.round(data.tipico.gcba)} días (según ${data.tipico.nEmitidos} permisos).` : ""}`}>
              <ul>{gobierno.map((f) => <FilaPermisoView key={f.clave} f={f} ahora={ahora} />)}</ul>
            </Bloque>
          )}

          {emitidos.length > 0 && (
            <Plegado id="emitidos" titulo="Permiso emitido" cantidad={emitidos.length} bajada="Sólo con resolución RS-. El más nuevo, primero." abierto={!!busqueda}>
              <ul>{emitidos.map((f) => <FilaPermisoView key={f.clave} f={f} ahora={ahora} />)}</ul>
            </Plegado>
          )}
          {archivados.length > 0 && (
            <Plegado titulo="Archivados sin permiso" cantidad={archivados.length} bajada="Guarda temporal sin resolución, o que la oficina dejó de seguir." abierto={!!busqueda}>
              <ArchivadosLista filas={archivados} ahora={ahora} puedeEditar={data.yo.puedeEditar} descartes={data.descartes} />
            </Plegado>
          )}
          {historial.length > 0 && (
            <Plegado titulo="Historial" cantidad={busqueda ? `${historial.length} de ${data.historial.length}` : historial.length} bajada="Terminados antes de que existiera el robot. Sólo se ve lo que muestra la lista de TAD." abierto={!!busqueda && historial.length > 0}>
              <ul>
                {historial.slice(0, 200).map((e) => (
                  <li key={e.id} className="border-b last:border-b-0">
                    <Link href={`/permisos-via-publica/${e.id}`} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2 text-[13px] hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                      <span className="font-mono text-[12px] text-muted-foreground">EX-{e.numero}</span>
                      <span className="font-medium">{direccionCorta(e.direccion) || e.titular || e.nombre || "Sin datos"}</span>
                      {e.creado_tad && <span className="text-[12px] text-muted-foreground">Presentado el {e.creado_tad.split("-").reverse().join("/")}</span>}
                      {e.permiso_path && <Chip tono="listo">Permiso guardado</Chip>}
                    </Link>
                  </li>
                ))}
              </ul>
              {historial.length > 200 && <p className="border-t px-3 py-2 text-[12px] text-muted-foreground">Se muestran 200: usá el buscador para encontrar uno.</p>}
            </Plegado>
          )}
          {pruebas.length > 0 && (
            <Plegado titulo="Pruebas" cantidad={pruebas.length} bajada="Trámites de «Probar el circuito»: los mails van a la casilla de la app y nunca se presentan." abierto={!!busqueda}>
              <ul>{pruebas.map((f) => <FilaPermisoView key={f.clave} f={f} ahora={ahora} />)}</ul>
            </Plegado>
          )}
          {ventasDescartadas.length > 0 && (
            <Plegado titulo="Ventas que no se tramitan acá" cantidad={ventasDescartadas.length} bajada="Se sacaron de «Ventas para iniciar» con un motivo.">
              <VentasDescartadas ventas={ventasDescartadas} lista={data} />
            </Plegado>
          )}
        </>
      )}
    </div>
  );
}

function Bloque({ id, titulo, cantidad, bajada, children }: { id: string; titulo: string; cantidad: number; bajada: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="scroll-mt-4 overflow-hidden rounded-md border bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b px-3 py-2.5">
        <h2 id={`${id}-titulo`} className="text-[15px] font-bold">
          {titulo} <span className="font-normal text-muted-foreground tabular-nums">· {cantidad}</span>
        </h2>
        <p className="text-[12px] text-muted-foreground">{bajada}</p>
      </header>
      {children}
    </section>
  );
}

function Plegado({ id, titulo, cantidad, bajada, abierto, children }: { id?: string; titulo: string; cantidad: React.ReactNode; bajada: string; abierto?: boolean; children: React.ReactNode }) {
  return (
    <details id={id} className="group scroll-mt-4 overflow-hidden rounded-md border bg-card" open={abierto}>
      <summary className="flex cursor-pointer list-none items-start gap-2 px-3 py-2.5 hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        <span className="min-w-0">
          <span className="text-[14px] font-semibold">{titulo} <span className="font-normal text-muted-foreground tabular-nums">· {cantidad}</span></span>
          <span className="block text-[12px] text-muted-foreground">{bajada}</span>
        </span>
      </summary>
      <div className="border-t">{children}</div>
    </details>
  );
}

/** Los archivados, con "Volver a seguir" para los que la oficina dejó de seguir. */
function ArchivadosLista({ filas, ahora, puedeEditar, descartes }: { filas: FilaPermiso[]; ahora: number; puedeEditar: boolean; descartes: ListaPermisos["descartes"] }) {
  const descartar = useDescarte();
  return (
    <ul>
      {filas.map((f) => {
        const d = f.expedienteId ? descartes.expedientes[f.expedienteId] : undefined;
        return (
          <FilaPermisoView
            key={f.clave}
            f={f}
            ahora={ahora}
            extra={d && (
              <p className="-mt-1 flex flex-wrap items-center gap-2 px-3 pb-2.5 text-[12px] text-muted-foreground">
                Dejado de seguir: «{d.motivo}»{d.por ? ` (${d.por})` : ""}.
                {puedeEditar && (
                  <button type="button" className="font-medium text-foreground underline underline-offset-2" onClick={() => f.expedienteId && descartar.mutate({ tipo: "expedientes", id: f.expedienteId, motivo: null }, { onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo") })}>
                    Volver a seguir
                  </button>
                )}
              </p>
            )}
          />
        );
      })}
    </ul>
  );
}

function VentasDescartadas({ ventas, lista }: { ventas: { ventaId: number; venta: string; direccion: string | null }[]; lista: ListaPermisos }) {
  const descartar = useDescarte();
  return (
    <ul>
      {ventas.map((v) => {
        const d = lista.descartes.ventas[String(v.ventaId)];
        return (
          <li key={v.ventaId} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 text-[13px] last:border-b-0">
            <span className="font-medium">{direccionCorta(v.direccion) || v.venta}</span>
            <span className="font-mono text-[12px] text-muted-foreground">{v.venta}</span>
            <span className="text-[12px] text-muted-foreground">«{d?.motivo}»{d?.por ? ` (${d.por})` : ""}</span>
            {lista.yo.puedeEditar && (
              <Button size="sm" variant="ghost" className="ml-auto" disabled={descartar.isPending} onClick={() => descartar.mutate({ tipo: "ventas", id: String(v.ventaId), motivo: null }, { onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo") })}>
                Volver a mostrar
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
