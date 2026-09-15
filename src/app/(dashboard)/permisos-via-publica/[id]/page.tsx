"use client";

import { use } from "react";
import Link from "next/link";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, Download, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChipEstado } from "@/components/permisos-via-publica/chip-estado";
import { useExpediente } from "@/hooks/use-permisos-via-publica";
import { explicacionEstado, type Evento, type TipoEvento } from "@/lib/permisos-via-publica/tipos";

// Ficha de un expediente de TAD: estado, qué pidió el Gobierno, el permiso si salió y todo
// lo que pasó, en orden. Sólo lectura: el estado es el de TAD y lo escribe el robot.

const ETIQUETA_EVENTO: Record<TipoEvento, string> = {
  alta: "Apareció en TAD",
  cambio_estado: "Cambió el estado",
  tarea_subsanacion: "El Gobierno pidió subsanar",
  tarea_resuelta: "Se subsanó",
  motivo: "Motivo de la observación",
  permiso_descargado: "Permiso descargado",
  vinculado_odoo: "Vinculado con la venta",
  error_robot: "Error del robot",
  caratula_leida: "Datos leídos de la carátula",
};

/** "2027-03-09" → "9/3/2027". Las fechas de la carátula son DATE, sin hora ni zona. */
function dia(iso: string | null) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}/${a}`;
}

function fecha(iso: string, patron = "d MMM yyyy HH:mm") {
  return format(parseISO(iso), patron, { locale: es });
}

export default function FichaPermisoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, error } = useExpediente(id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return <EmptyState icon={TriangleAlert} title="No se pudo abrir el expediente" description={error instanceof Error ? error.message : undefined} />;
  }

  const { expediente: e, eventos, permisoUrl } = data;

  return (
    <div className="space-y-5">
      <Link href="/permisos-via-publica" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Permisos de andamio
      </Link>

      <PageHeader title={e.direccion ?? e.titular ?? `EX-${e.numero}`} description={e.expediente}>
        {permisoUrl && (
          // Button es de base-ui (no tiene asChild): un <a> con las mismas clases.
          <a href={permisoUrl} target="_blank" rel="noreferrer" className={buttonVariants({ size: "sm" })}>
            <Download className="size-4" /> Descargar permiso
          </a>
        )}
      </PageHeader>

      <section className="grid gap-3 rounded-md border p-3 text-[13px] sm:grid-cols-2">
        <div className="space-y-1">
          <ChipEstado expediente={e} />
          <p className="text-muted-foreground">{explicacionEstado(e)}</p>
          <p className="text-muted-foreground">
            En este estado desde el {fecha(e.estado_desde, "d/M/yyyy")} (
            {formatDistanceToNowStrict(parseISO(e.estado_desde), { locale: es })})
          </p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">Presentado</dt>
          <dd>{dia(e.creado_tad)}</dd>
          <dt className="text-muted-foreground">Ubicación</dt>
          <dd>
            {[e.barrio, e.comuna].filter(Boolean).join(" · ") || "—"}
            {e.seccion && (
              <span className="block text-[12px] text-muted-foreground">
                Sección {e.seccion} · Manzana {e.manzana ?? "?"} · Parcela {e.parcela ?? "?"}
              </span>
            )}
          </dd>
          <dt className="text-muted-foreground">Permiso pedido</dt>
          <dd>{e.pedido_desde || e.pedido_hasta ? `${dia(e.pedido_desde)} al ${dia(e.pedido_hasta)}` : "—"}</dd>
          <dt className="text-muted-foreground">Seguro</dt>
          <dd>{e.seguro_compania ? `${e.seguro_compania} · vence ${dia(e.seguro_vence)}` : "—"}</dd>
          <dt className="text-muted-foreground">Venta</dt>
          <dd>{e.odoo_venta_nombre ? `${e.odoo_venta_nombre}${e.cliente ? ` · ${e.cliente}` : ""}` : "Sin vincular"}</dd>
          <dt className="text-muted-foreground">Última lectura</dt>
          <dd>{fecha(e.visto_ultimo_at)}</dd>
          {e.caratula_error && (
            <>
              <dt className="text-muted-foreground">Carátula</dt>
              <dd className="text-orange-400">No se pudo leer: {e.caratula_error}</dd>
            </>
          )}
        </dl>
      </section>

      {e.motivo_subsanacion && (
        <section className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-[13px]">
          <h3 className="font-semibold text-red-300">Lo que pide el Gobierno</h3>
          <p className="mt-1 whitespace-pre-line">{e.motivo_subsanacion}</p>
          {e.motivo_leido_at && (
            <p className="mt-1 text-[12px] text-muted-foreground">Leído de TAD el {fecha(e.motivo_leido_at)}</p>
          )}
        </section>
      )}

      <Historial eventos={eventos} />
    </div>
  );
}

function Historial({ eventos }: { eventos: Evento[] }) {
  return (
    <section className="rounded-md border">
      <header className="border-b px-3 py-2">
        <h3 className="text-[13px] font-semibold">Historial</h3>
      </header>
      <ul className="max-h-[32rem] overflow-y-auto">
        {eventos.map((ev) => (
          <li key={ev.id} className="border-b px-3 py-2 text-[13px] last:border-b-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{ETIQUETA_EVENTO[ev.tipo] ?? ev.tipo}</span>
              <span className="text-[12px] text-muted-foreground">{fecha(ev.created_at)}</span>
            </div>
            {ev.detalle && <p className="mt-0.5 whitespace-pre-line text-muted-foreground">{ev.detalle}</p>}
          </li>
        ))}
        {eventos.length === 0 && <li className="px-3 py-3 text-[12px] text-muted-foreground">Sin movimientos registrados.</li>}
      </ul>
    </section>
  );
}
