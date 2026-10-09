"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { ChartGantt, CheckCircle2, FlaskConical, Loader2, MoreHorizontal, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ChipEstado } from "@/components/permisos-via-publica/chip-estado";
import { ChipQuien } from "@/components/permisos-via-publica/chip-quien";
import { VentasParaIniciar } from "@/components/permisos-via-publica/ventas-para-iniciar";
import { ModoSupervisado } from "@/components/permisos-via-publica/modo-supervisado";
import { Aviso, duracion, FILA_LINK, Seccion, SeccionPlegada } from "@/components/permisos-via-publica/bandeja";
import { useBandejaPermisos, useCrearPrueba, useRevisarAhora, useVentasParaIniciar } from "@/hooks/use-permisos-via-publica";
import { demoraEtapa } from "@/lib/permisos-via-publica/seguimiento";
import {
  coincide,
  coincideTexto,
  direccionCorta,
  estadoVinculo,
  mismoTexto,
  type EstadoRobot,
  type Expediente,
  type TramiteNuevo,
} from "@/lib/permisos-via-publica/tipos";

// Permisos vía pública — la bandeja de trabajo del día.
//
// ORDENADA POR URGENCIA, de arriba hacia abajo (rediseño 09/10):
//   1. Necesitan acción: subsanaciones con tarea en TAD. Si no hay, una línea que lo dice.
//   2. Esperan a ABA: trámites que no avanzan hasta que alguien de la oficina haga algo (un botón
//      del modo supervisado, el robot frenado, algo observado, el link que no salió).
//   3. Ventas para iniciar.
//   4. En curso: lo tiene otro (cliente, Segucom, CPAU, robot).
//   5. Esperando al Gobierno.
//   Plegados: permiso emitido, historial y pruebas.
// Cada trámite dice en qué etapa está, quién lo tiene y desde cuándo — lo mismo que Seguimiento
// (etapasDe), que es la vista para mirar todo; esta es para trabajar.
//
// EL LATIDO DEL ROBOT VA ARRIBA Y A LA VISTA. Una lista sin novedades puede significar "no
// cambió nada" o "el robot está apagado", y en pantalla se ven igual. Sin la hora de la
// última revisión nadie puede distinguirlas.

function hace(iso: string | null | undefined): string {
  if (!iso) return "nunca";
  return `hace ${formatDistanceToNowStrict(parseISO(iso), { locale: es })}`;
}

/** Más de 3 horas sin una revisión buena es un robot caído o una Mac apagada. */
function robotDormido(robot: EstadoRobot | null): boolean {
  if (!robot?.ultimo_ok_at) return true;
  return Date.now() - parseISO(robot.ultimo_ok_at).getTime() > 3 * 3600_000;
}

const cuenta = (filtradas: number, total: number, busqueda: string) => (busqueda ? `${filtradas} de ${total}` : total);

export default function PermisosViaPublicaPage() {
  const { data, isLoading, error, dataUpdatedAt } = useBandejaPermisos();
  // "Ahora" es la hora de la última lectura: la bandeja se refresca cada minuto.
  const ahora = dataUpdatedAt;
  const ventasQuery = useVentasParaIniciar();
  const revisar = useRevisarAhora();
  const [busqueda, setBusqueda] = useState("");
  const crearPrueba = useCrearPrueba();
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="space-y-5" aria-busy>
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-96 max-w-full" />
        </div>
        <Skeleton className="h-9 w-full max-w-md" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-5">
        <h1 className="text-3xl font-bold tracking-tight">Permisos de andamio</h1>
        <Aviso tono="bloqueo" titulo="No se pudo leer la bandeja">
          {error instanceof Error ? error.message : "Error desconocido"}. Probá recargar la página en un rato.
        </Aviso>
      </div>
    );
  }

  const robot = data.robot;
  const dormido = robotDormido(robot);
  const linkAlCliente = data.supervision.linkAlCliente;

  // --- Lo que hay, sin filtrar (para el resumen) y filtrado por la búsqueda (para las listas).
  const grupo = (clave: string) => data.grupos.find((g) => g.clave === clave)?.filas ?? [];
  const accionTodas = grupo("accion");
  const gobiernoTodas = grupo("gobierno");
  const emitidosTodas = grupo("emitidos");
  const reales = data.tramitesNuevos.filter((t) => !t.es_prueba);
  const abaTodas = reales.filter((t) => t.etapa.esperaAba);
  const cursoTodas = reales.filter((t) => !t.etapa.esperaAba);
  const pruebasTodas = data.tramitesNuevos.filter((t) => t.es_prueba);
  const ventasTodas = ventasQuery.data ?? [];

  const deTramite = (t: TramiteNuevo) =>
    coincideTexto([t.direccion, t.odoo_venta_nombre, t.cliente_nombre, t.vendedor_nombre, t.titular_nombre, t.etapa.expediente], busqueda);
  const accion = accionTodas.filter((e) => coincide(e, busqueda));
  const gobierno = gobiernoTodas.filter((e) => coincide(e, busqueda));
  const emitidos = emitidosTodas.filter((e) => coincide(e, busqueda));
  const historial = data.historial.filter((e) => coincide(e, busqueda));
  const aba = abaTodas.filter(deTramite);
  const curso = cursoTodas.filter(deTramite);
  const pruebas = pruebasTodas.filter(deTramite);
  // El buscador de la bandeja: dirección, número de orden, cliente, mail o vendedor.
  const ventas = ventasTodas.filter((v) => coincideTexto([v.direccion, v.venta, v.cliente, v.email, v.vendedor], busqueda));

  const encontrados = accion.length + aba.length + ventas.length + curso.length + gobierno.length + emitidos.length + historial.length + pruebas.length;
  const sinResultados = !!busqueda && encontrados === 0;

  function pedirRevision() {
    revisar.mutate(undefined, {
      onSuccess: (r) =>
        toast.success(r.yaPedida ? "Ya hay una revisión en curso" : "Revisión pedida: el robot la toma en unos segundos"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo pedir la revisión"),
    });
  }

  function probarCircuito() {
    crearPrueba.mutate(undefined, {
      onSuccess: (r) => {
        toast.success(r.linkEnviado ? "Prueba creada: te llegó el link a tu mail" : "Prueba creada, pero el mail no salió: usá el link de la ficha");
        router.push(`/permisos-via-publica/tramites/${r.tramiteId}`);
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo crear la prueba"),
    });
  }

  // --- Resumen: qué pide algo hoy, con links a cada sección.
  const resumen: { n: number; texto: string; href: string; tono: "bloqueo" | "aba" | "neutro" }[] = [
    { n: accionTodas.length, texto: accionTodas.length === 1 ? "necesita acción" : "necesitan acción", href: "#necesitan-accion", tono: "bloqueo" },
    { n: abaTodas.length, texto: abaTodas.length === 1 ? "espera a ABA" : "esperan a ABA", href: "#esperan-a-aba", tono: "aba" },
    { n: ventasTodas.length, texto: ventasTodas.length === 1 ? "venta por iniciar" : "ventas por iniciar", href: "#ventas-para-iniciar", tono: "neutro" },
  ];
  const conAlgo = resumen.filter((r) => r.n > 0);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">Permisos de andamio</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            {conAlgo.length === 0 ? (
              <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-300">
                <CheckCircle2 aria-hidden className="size-4" /> Nada espera a ABA
              </span>
            ) : (
              conAlgo.map((r, i) => (
                <span key={r.href}>
                  {i > 0 && " · "}
                  <a
                    href={r.href}
                    className={cn(
                      "rounded-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring",
                      r.tono === "bloqueo" && "font-semibold text-red-700 dark:text-red-300",
                      r.tono === "aba" && "font-semibold text-amber-800 dark:text-amber-300",
                      r.tono === "neutro" && "font-medium text-foreground",
                    )}
                  >
                    {r.n} {r.texto}
                  </a>
                </span>
              ))
            )}
            <span className="whitespace-nowrap">
              {" — "}
              {data.revisando ? "revisando TAD…" : `TAD revisado ${hace(robot?.ultimo_ok_at)}`}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/permisos-via-publica/seguimiento" />}>
            <ChartGantt className="size-4" /> Seguimiento
          </Button>
          <Button onClick={pedirRevision} disabled={data.revisando || revisar.isPending} variant="outline" size="sm">
            {data.revisando || revisar.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {data.revisando ? "Revisando TAD…" : "Revisar TAD"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label="Más acciones" />}>
              {crearPrueba.isPending ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem disabled={crearPrueba.isPending} onClick={probarCircuito}>
                <FlaskConical className="size-4" />
                <div>
                  <p>Probar el circuito</p>
                  <p className="text-[11.5px] text-muted-foreground">Crea un trámite de prueba; los mails llegan a tu casilla.</p>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {dormido && (
        <Aviso tono="advertencia" titulo={`El robot no revisa TAD desde ${hace(robot?.ultimo_ok_at)}.`}>
          {robot?.ultimo_error
            ? `Último error (${hace(robot.ultimo_error_at)}): ${robot.ultimo_error}`
            : "Corre en la computadora de oficina: si está apagada o dormida, no revisa."}
        </Aviso>
      )}

      <div className="flex flex-wrap items-start gap-2">
        <div className="relative min-w-0 flex-1 basis-64 sm:max-w-md">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por EX-, dirección, venta o cliente…"
            aria-label="Buscar en la bandeja de permisos"
            className="pl-8"
          />
        </div>
        <ModoSupervisado supervision={data.supervision} className="w-full sm:ml-auto sm:w-auto open:sm:w-full" />
      </div>

      {sinResultados ? (
        <EmptyState icon={Search} title={`Ningún resultado para «${busqueda}»`} description="Probá con el número de expediente (EX-…), la orden (S0…), la calle o el cliente.">
          <Button variant="outline" size="sm" onClick={() => setBusqueda("")}>Borrar la búsqueda</Button>
        </EmptyState>
      ) : (
        <>
          {/* 1. Lo urgente: subsanaciones con tarea en TAD. */}
          {accion.length > 0 ? (
            <Seccion
              id="necesitan-accion"
              tono="bloqueo"
              titulo="Necesitan acción"
              cantidad={cuenta(accion.length, accionTodas.length, busqueda)}
              bajada="El Gobierno observó algo: hay que corregir y volver a presentar en TAD."
            >
              <ul>{accion.map((e) => <FilaExpediente key={e.id} e={e} />)}</ul>
            </Seccion>
          ) : (
            !busqueda && (
              <p id="necesitan-accion" className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-[13px]">
                <CheckCircle2 aria-hidden className="size-4 shrink-0 text-green-700 dark:text-green-300" />
                <span><span className="font-medium">Ninguna subsanación pendiente.</span> <span className="text-muted-foreground">Nada que corregir en TAD.</span></span>
              </p>
            )
          )}

          {/* 2. Trámites que esperan un movimiento de la oficina. */}
          {aba.length > 0 && (
            <Seccion
              id="esperan-a-aba"
              tono="aba"
              titulo="Esperan a ABA"
              cantidad={cuenta(aba.length, abaTodas.length, busqueda)}
              bajada="No avanzan hasta que alguien de la oficina haga algo en la ficha. El más viejo, primero."
            >
              <ul>{aba.map((t) => <FilaTramite key={t.id} t={t} linkAlCliente={linkAlCliente} ahora={ahora} />)}</ul>
            </Seccion>
          )}

          {/* 3. Ventas confirmadas sin trámite. */}
          <VentasParaIniciar
            ventas={ventas}
            total={ventasTodas.length}
            isLoading={ventasQuery.isLoading}
            error={ventasQuery.error}
            linkAlCliente={linkAlCliente}
            busqueda={busqueda}
            ahora={ahora}
          />

          {/* 4. En curso: lo tiene otro. */}
          {curso.length > 0 && (
            <Seccion
              id="en-curso"
              titulo="En curso"
              cantidad={cuenta(curso.length, cursoTodas.length, busqueda)}
              bajada="Sin presentar en TAD. Lo tiene el cliente, Segucom, el CPAU o el robot: mirá los que llevan días."
            >
              <ul>{curso.map((t) => <FilaTramite key={t.id} t={t} linkAlCliente={linkAlCliente} ahora={ahora} />)}</ul>
            </Seccion>
          )}

          {/* 5. Presentados, esperando al Gobierno. */}
          {data.total === 0 ? (
            <Seccion titulo="Esperando al Gobierno" cantidad={0}>
              <p className="px-3 py-3 text-[12.5px] text-muted-foreground">Todavía no hay expedientes: aparecen cuando el robot hace su primera revisión de TAD.</p>
            </Seccion>
          ) : (
            (gobierno.length > 0 || !busqueda) && (
              <Seccion
                id="esperando-al-gobierno"
                titulo="Esperando al Gobierno"
                cantidad={cuenta(gobierno.length, gobiernoTodas.length, busqueda)}
                bajada="Presentados o ya subsanados, todavía sin revisar. El que lleva más tiempo, primero."
              >
                {gobierno.length === 0 ? (
                  <p className="px-3 py-3 text-[12.5px] text-muted-foreground">Ninguno esperando.</p>
                ) : (
                  <ul>{gobierno.map((e) => <FilaExpediente key={e.id} e={e} />)}</ul>
                )}
              </Seccion>
            )
          )}

          {/* Plegados. */}
          {emitidosTodas.length > 0 && (!busqueda || emitidos.length > 0) && (
            <SeccionPlegada
              titulo="Permiso emitido"
              cantidad={cuenta(emitidos.length, emitidosTodas.length, busqueda)}
              bajada="Salió el permiso o el expediente se archivó."
              abierta={!!busqueda && emitidos.length > 0}
            >
              <ul>{emitidos.map((e) => <FilaExpediente key={e.id} e={e} />)}</ul>
            </SeccionPlegada>
          )}

          {data.historial.length > 0 && (!busqueda || historial.length > 0) && (
            <SeccionPlegada
              titulo="Historial"
              cantidad={cuenta(historial.length, data.historial.length, busqueda)}
              bajada="Finalizados anteriores al robot. Sólo lo que muestra la lista de TAD: el robot no abre su detalle ni los sigue."
              abierta={!!busqueda && historial.length > 0}
            >
              <ul>
                {historial.slice(0, 200).map((e) => (
                  <FilaExpediente key={e.id} e={e} historial />
                ))}
              </ul>
              {historial.length > 200 && (
                <p className="border-t px-3 py-2 text-[12px] text-muted-foreground">Se muestran 200: usá el buscador para encontrar uno.</p>
              )}
            </SeccionPlegada>
          )}

          {pruebasTodas.length > 0 && (!busqueda || pruebas.length > 0) && (
            <SeccionPlegada
              titulo="Pruebas"
              cantidad={cuenta(pruebas.length, pruebasTodas.length, busqueda)}
              bajada="Trámites de «Probar el circuito»: los mails van a la casilla de la app y nunca se presentan."
              abierta={!!busqueda && pruebas.length > 0}
            >
              <ul>{pruebas.map((t) => <FilaTramite key={t.id} t={t} linkAlCliente={linkAlCliente} ahora={ahora} />)}</ul>
            </SeccionPlegada>
          )}
        </>
      )}
    </div>
  );
}

/** Un trámite sin presentar: en qué etapa está, quién lo tiene y desde cuándo. */
function FilaTramite({ t, linkAlCliente, ahora }: { t: TramiteNuevo; linkAlCliente: boolean; ahora: number }) {
  const e = t.etapa;
  const lenta = demoraEtapa(e, ahora);
  const bloqueo = e.estado === "trabado";
  const titulo = direccionCorta(t.direccion);
  const cliente = !mismoTexto(t.cliente_nombre, t.direccion) ? t.cliente_nombre : null;
  const vendedora = t.vendedor_nombre?.split(/\s+/)[0];
  // A quién salió el link: en modo supervisado va a la vendedora, no al cliente (antes decía
  // "Link enviado a am@…" y parecía que había ido a ABA).
  const aVendedora = !!t.link_enviado_a && !!t.vendedor_email && t.link_enviado_a.trim().toLowerCase() === t.vendedor_email.trim().toLowerCase();
  const mostrarLink = (e.clave === "legajo" || e.clave === "abierto") && !t.link_error;
  return (
    <li className="border-b last:border-b-0">
      <Link href={`/permisos-via-publica/tramites/${t.id}`} className={cn(FILA_LINK, "grid gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_auto]")}>
        <div className="min-w-0 space-y-0.5">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[13.5px] font-medium">{titulo}</span>
            {t.es_prueba && (
              <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-300">PRUEBA</span>
            )}
            {t.odoo_venta_nombre && <span className="font-mono text-[12px] text-muted-foreground">{t.odoo_venta_nombre}</span>}
            {e.expediente && <span className="font-mono text-[12px] text-muted-foreground">{e.expediente}</span>}
          </p>
          {(cliente || vendedora) && (
            <p className="truncate text-[12px] text-muted-foreground">
              {[cliente, vendedora && `vendedora: ${vendedora}`].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className={cn("text-[12.5px]", bloqueo && "text-red-700 dark:text-red-300")}>
            {bloqueo && <TriangleAlert aria-hidden className="mr-1 inline size-3.5 -translate-y-px" />}
            <span className="font-medium">{e.nombre}</span>
            {e.detalle && <span className={cn(!bloqueo && "text-muted-foreground")}> · {e.detalle}</span>}
          </p>
          {e.motivo && <p className="line-clamp-2 rounded bg-red-500/10 px-2 py-1 text-[12px] text-red-800 dark:text-red-200">{e.motivo}</p>}
          {mostrarLink && (
            <p className="text-[12px] text-muted-foreground">
              {!t.link_enviado_at
                ? "Mandando el link…"
                : aVendedora || (!linkAlCliente && !t.link_enviado_a)
                  ? `Link a ${vendedora ?? "la vendedora"} para que se lo pase al cliente`
                  : `Link enviado al cliente${t.link_enviado_a ? ` (${t.link_enviado_a})` : ""}`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:flex-col sm:items-end sm:justify-start">
          <div className="flex flex-wrap gap-1 sm:justify-end">
            {e.quienes.map((q) => (
              <ChipQuien key={q} quien={q} prefijo="Lo tiene: " />
            ))}
          </div>
          {e.desde && (
            <span
              className={cn(
                "text-[12px] tabular-nums text-muted-foreground",
                lenta === "tarde" && "font-semibold text-amber-800 dark:text-amber-300",
                lenta === "muy" && "font-semibold text-red-700 dark:text-red-300",
              )}
              title={`En «${e.nombre}» desde el ${new Date(e.desde).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}`}
            >
              {lenta && <TriangleAlert aria-hidden className="mr-1 inline size-3 -translate-y-px" />}
              hace {duracion(e.desde, ahora)}
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

function FilaExpediente({ e, historial = false }: { e: Expediente; historial?: boolean }) {
  const titulo = direccionCorta(e.direccion) || e.odoo_venta_nombre || e.titular || "Sin datos de la obra";
  const vinculo = historial ? "confirmado" : estadoVinculo(e);
  return (
    <li className="border-b last:border-b-0">
      <Link href={`/permisos-via-publica/${e.id}`} className={FILA_LINK}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono text-[12px] text-muted-foreground">EX-{e.numero}</span>
          <span className="text-[13.5px] font-medium">{titulo}</span>
          {/* Número de orden y cliente, para saber de quién es sin abrir la ficha. */}
          {(e.odoo_venta_nombre || e.cliente) && (
            <span className="text-[12px] text-muted-foreground">
              {[e.odoo_venta_nombre !== titulo ? e.odoo_venta_nombre : null, mismoTexto(e.cliente, e.direccion) ? null : e.cliente].filter(Boolean).join(" · ")}
            </span>
          )}
          {/* Hasta que alguien confirme la venta, el robot no escribe el trámite en Odoo. */}
          {vinculo === "propuesto" && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
              <TriangleAlert aria-hidden className="size-3" /> Venta sin confirmar
            </span>
          )}
          {vinculo === "sin_vincular" && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">Sin venta</span>
          )}
          <ChipEstado expediente={e} className="sm:ml-auto" />
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-muted-foreground">
          {/* En el historial "desde hace" sería la hora en que se guardó, no un dato de TAD. */}
          {!historial && <span>En este estado {hace(e.estado_desde).replace("hace ", "desde hace ")}</span>}
          {e.creado_tad && <span>Presentado el {e.creado_tad.split("-").reverse().join("/")}</span>}
          {historial && e.permiso_path && <span>Permiso guardado</span>}
        </div>
        {e.motivo_subsanacion && (
          // Rojo sólo si todavía hay que corregir; ya subsanado queda como dato.
          <p
            className={cn(
              "mt-1.5 line-clamp-2 rounded px-2 py-1 text-[12px]",
              e.tarea_pendiente ? "bg-red-500/10 text-red-800 dark:text-red-200" : "bg-muted text-muted-foreground",
            )}
          >
            <span className="font-medium">{e.tarea_pendiente ? "Motivo:" : "Motivo (ya subsanado):"}</span> {e.motivo_subsanacion}
          </p>
        )}
      </Link>
    </li>
  );
}
