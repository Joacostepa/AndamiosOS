"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { FlaskConical, Landmark, Loader2, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ChipEstado } from "@/components/permisos-via-publica/chip-estado";
import { VentasParaIniciar } from "@/components/permisos-via-publica/ventas-para-iniciar";
import { useBandejaPermisos, useCrearPrueba, useRevisarAhora } from "@/hooks/use-permisos-via-publica";
import { coincide, estadoVinculo, type EstadoRobot, type Expediente } from "@/lib/permisos-via-publica/tipos";

// Permisos vía pública — los expedientes de TAD sin entrar a TAD.
//
// AGRUPADO POR LO QUE HAY QUE HACER, como Habilitaciones: un expediente observado pide una
// acción nuestra hoy; uno en iniciación sólo pide paciencia (o un reclamo si lleva semanas).
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

export default function PermisosViaPublicaPage() {
  const { data, isLoading, error } = useBandejaPermisos();
  const revisar = useRevisarAhora();
  const [busqueda, setBusqueda] = useState("");
  const crearPrueba = useCrearPrueba();
  const router = useRouter();

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
        <PageHeader title="Permisos de andamio" description="No se pudo leer la bandeja" />
        <EmptyState icon={TriangleAlert} title="Error" description={error instanceof Error ? error.message : "Error desconocido"} />
      </div>
    );
  }

  const robot = data.robot;
  const dormido = robotDormido(robot);
  const grupos = data.grupos.map((g) => ({ ...g, filas: g.filas.filter((e) => coincide(e, busqueda)) }));

  function pedirRevision() {
    revisar.mutate(undefined, {
      onSuccess: (r) =>
        toast.success(r.yaPedida ? "Ya hay una revisión en curso" : "Revisión pedida: el robot la toma en unos segundos"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo pedir la revisión"),
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Permisos de andamio"
        description={`${data.total} expedientes en TAD · última revisión ${hace(robot?.ultimo_ok_at)}`}
      >
        <Button
          variant="outline"
          size="sm"
          disabled={crearPrueba.isPending}
          onClick={() =>
            crearPrueba.mutate(undefined, {
              onSuccess: (r) => {
                toast.success(r.linkEnviado ? "Prueba creada: te llegó el link a tu mail" : "Prueba creada, pero el mail no salió: usá el link de la ficha");
                router.push(`/permisos-via-publica/tramites/${r.tramiteId}`);
              },
              onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo crear la prueba"),
            })
          }
        >
          {crearPrueba.isPending ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />} Probar el circuito
        </Button>
        <Button onClick={pedirRevision} disabled={data.revisando || revisar.isPending} variant="outline" size="sm">
          {data.revisando ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {data.revisando ? "Revisando TAD…" : "Revisar ahora"}
        </Button>
      </PageHeader>

      {dormido && (
        <div className="flex items-start gap-2 rounded-md border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-[13px]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-orange-400" />
          <div>
            <p className="font-medium">El robot no revisa TAD desde {hace(robot?.ultimo_ok_at)}.</p>
            <p className="text-muted-foreground">
              {robot?.ultimo_error
                ? `Último error (${hace(robot.ultimo_error_at)}): ${robot.ultimo_error}`
                : "Corre en la computadora de oficina: si está apagada o dormida, no revisa."}
            </p>
          </div>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar expediente, dirección, cliente…"
          className="pl-8"
        />
      </div>

      <VentasParaIniciar />

      {data.tramitesNuevos.length > 0 && (
        <section className="rounded-md border">
          <header className="border-b px-3 py-2">
            <h2 className="text-[14px] font-semibold">
              Trámites nuevos <span className="text-muted-foreground">· {data.tramitesNuevos.length}</span>
            </h2>
            <p className="text-[12px] text-muted-foreground">Ventas confirmadas con permiso, todavía sin presentar en TAD.</p>
          </header>
          <ul>
            {data.tramitesNuevos.map((t) => {
              const legajo = t.pvp_documentos.filter((d) => d.origen === "cliente");
              const poliza = t.pvp_documentos.find((d) => d.clave === "poliza_rc");
              return (
                <li key={t.id} className="border-b last:border-b-0">
                  <Link href={`/permisos-via-publica/tramites/${t.id}`} className="block px-3 py-2.5 hover:bg-muted/40">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-[13px] font-medium">{t.direccion}</span>
                      {t.es_prueba && <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[11px] text-purple-300">PRUEBA</span>}
                      <span className="text-[12px] text-muted-foreground">{t.odoo_venta_nombre} · {t.cliente_nombre}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-muted-foreground">
                      {t.link_error ? (
                        <span className="text-orange-400">Link sin mandar</span>
                      ) : (
                        <span>{t.link_enviado_at ? "Link enviado" : "Mandando link…"}</span>
                      )}
                      <span>{t.titular_cargado_at ? `Dueño: ${t.titular_nombre}` : "Falta el dueño del lote"}</span>
                      {legajo.length > 0 && <span>Legajo {legajo.filter((d) => d.estado !== "falta").length}/{legajo.length}</span>}
                      {poliza && <span>Póliza: {poliza.estado}</span>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {data.total === 0 ? (
        <EmptyState
          icon={Landmark}
          title="Todavía no hay expedientes"
          description="Aparecen cuando el robot hace su primera revisión de TAD."
        />
      ) : (
        grupos.map((g) => (
          <section key={g.clave} className="rounded-md border">
            <header className="flex items-baseline justify-between border-b px-3 py-2">
              <div>
                <h2 className="text-[14px] font-semibold">
                  {g.titulo} <span className="text-muted-foreground">· {g.filas.length}</span>
                </h2>
                <p className="text-[12px] text-muted-foreground">{g.descripcion}</p>
              </div>
            </header>
            {g.filas.length === 0 ? (
              <p className="px-3 py-3 text-[12px] text-muted-foreground">Nada acá.</p>
            ) : (
              <ul>
                {g.filas.map((e) => (
                  <FilaExpediente key={e.id} e={e} />
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}

function FilaExpediente({ e }: { e: Expediente }) {
  const titulo = e.direccion ?? e.odoo_venta_nombre ?? e.titular ?? "Sin datos de la obra";
  const vinculo = estadoVinculo(e);
  return (
    <li className="border-b last:border-b-0">
      <Link href={`/permisos-via-publica/${e.id}`} className="block px-3 py-2.5 hover:bg-muted/40">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono text-[12px] text-muted-foreground">EX-{e.numero}</span>
          <span className="text-[13px] font-medium">{titulo}</span>
          {e.odoo_venta_nombre && e.direccion && (
            <span className="text-[12px] text-muted-foreground">{e.odoo_venta_nombre}</span>
          )}
          {/* Hasta que alguien confirme la venta, el robot no escribe el trámite en Odoo. */}
          {vinculo === "propuesto" && (
            <span className="rounded bg-yellow-500/15 px-1.5 py-0.5 text-[11px] text-yellow-300">Confirmar venta</span>
          )}
          {vinculo === "sin_vincular" && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">Sin venta</span>
          )}
          <ChipEstado expediente={e} className="ml-auto" />
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-muted-foreground">
          <span>En este estado {hace(e.estado_desde).replace("hace ", "desde hace ")}</span>
          {e.creado_tad && <span>Presentado el {e.creado_tad.split("-").reverse().join("/")}</span>}
        </div>
        {e.motivo_subsanacion && (
          <p className="mt-1 line-clamp-2 text-[12px] text-red-300">Motivo: {e.motivo_subsanacion}</p>
        )}
      </Link>
    </li>
  );
}
