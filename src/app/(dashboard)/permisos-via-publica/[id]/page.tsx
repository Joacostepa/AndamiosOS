"use client";

import { use, useState } from "react";
import Link from "next/link";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, Download, ExternalLink, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ChipEstado } from "@/components/permisos-via-publica/chip-estado";
import { DocumentosTramite } from "@/components/permisos-via-publica/documentos-tramite";
import { useExpediente, useVinculoVenta, type AccionVinculo } from "@/hooks/use-permisos-via-publica";
import {
  estadoVinculo, explicacionEstado, sinAltura,
  type Evento, type Expediente, type TipoEvento, type VentaOdoo,
} from "@/lib/permisos-via-publica/tipos";

// Ficha de un expediente de TAD: estado, qué pidió el Gobierno, el permiso si salió, la venta
// de Odoo y todo lo que pasó, en orden. El estado es el de TAD y lo escribe el robot; lo
// único que decide una persona acá es cuál es la venta.

const ETIQUETA_EVENTO: Record<TipoEvento, string> = {
  alta: "Apareció en TAD",
  cambio_estado: "Cambió el estado",
  tarea_subsanacion: "El Gobierno pidió subsanar",
  tarea_resuelta: "Se subsanó",
  motivo: "Motivo de la observación",
  permiso_descargado: "Permiso descargado",
  vinculado_odoo: "Venta propuesta",
  error_robot: "Error del robot",
  caratula_leida: "Datos leídos de la carátula",
  vinculo_confirmado: "Venta confirmada",
  vinculo_descartado: "Venta descartada",
  odoo_escrito: "Escrito en Odoo",
  odoo_conflicto: "No se escribió en Odoo",
  tramite_abierto: "Se abrió el trámite",
  documento_pedido: "Documento pedido",
  documento_subido: "Documento subido",
  documento_revisado: "Revisión del documento",
  aviso_productor: "Aviso a Segucom",
};

const TRAMITE: Record<string, string> = { no_presentado: "No presentado", presentado: "Presentado", emitido: "Emitido" };
const MODALIDAD: Record<string, string> = {
  sin_permiso: "Se arma sin expediente ni permiso",
  con_expediente: "Se arma con el expediente",
  esperar_permiso: "Se arma con el permiso emitido",
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

  const { expediente: e, eventos, permisoUrl, venta, ventaError, tramite, documentos } = data;

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
          {e.permiso_emitido_el && (
            <>
              <dt className="text-muted-foreground">Permiso otorgado</dt>
              <dd>
                Notificado el {dia(e.permiso_emitido_el)} · vigente hasta {dia(e.permiso_vence)}
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">Seguro</dt>
          <dd>{e.seguro_compania ? `${e.seguro_compania} · vence ${dia(e.seguro_vence)}` : "—"}</dd>
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

      <DocumentosTramite e={e} tramite={tramite} documentos={documentos} />

      <VentaDeOdoo e={e} venta={venta} ventaError={ventaError} />

      <Historial eventos={eventos} />
    </div>
  );
}

/**
 * Cuál es la venta del expediente. Del estado del vínculo depende que el robot escriba el
 * trámite en Odoo (y con eso, el candado del tablero): por eso una propuesta por dirección
 * se muestra al lado de lo que dice la carátula, para confirmarla mirando las dos.
 */
function VentaDeOdoo({ e, venta, ventaError }: { e: Expediente; venta: VentaOdoo | null; ventaError: string | null }) {
  const vinculo = useVinculoVenta(e.id);
  const [numero, setNumero] = useState("");
  const estado = estadoVinculo(e);

  function hacer(body: AccionVinculo, ok: string) {
    vinculo.mutate(body, {
      onSuccess: () => {
        toast.success(ok);
        setNumero("");
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "No se pudo guardar"),
    });
  }

  const marco =
    estado === "propuesto" ? "border-yellow-500/40 bg-yellow-500/5" : estado === "sin_vincular" ? "border-dashed" : "";

  return (
    <section className={`space-y-3 rounded-md border p-3 text-[13px] ${marco}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Venta de Odoo</h3>
        <span className="text-[12px] text-muted-foreground">
          {estado === "propuesto" && "Propuesta por dirección · falta confirmar"}
          {estado === "confirmado" &&
            (e.odoo_vinculo_por === "numero"
              ? "Vinculada por número de expediente"
              : `Confirmada${e.odoo_vinculo_confirmado_at ? ` el ${fecha(e.odoo_vinculo_confirmado_at, "d/M/yyyy")}` : ""}`)}
          {estado === "sin_vincular" && "Sin vincular"}
        </span>
      </header>

      {estado !== "sin_vincular" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Venta</dt>
            <dd>
              {venta?.url ? (
                <a href={venta.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                  {venta.nombre} <ExternalLink className="size-3" />
                </a>
              ) : (
                e.odoo_venta_nombre
              )}
            </dd>
            <dt className="text-muted-foreground">Cliente</dt>
            <dd>{venta?.cliente ?? e.cliente ?? "—"}</dd>
            <dt className="text-muted-foreground">Obra (Odoo)</dt>
            <dd>{venta?.direccion ?? "—"}</dd>
            <dt className="text-muted-foreground">Obra (TAD)</dt>
            <dd>{e.direccion ?? "—"}</dd>
            <dt className="text-muted-foreground">Fecha de venta</dt>
            <dd>{dia(venta?.fecha ?? null)}</dd>
          </dl>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Modalidad</dt>
            <dd>{venta?.modalidad ? MODALIDAD[venta.modalidad] ?? venta.modalidad : "—"}</dd>
            <dt className="text-muted-foreground">Trámite</dt>
            <dd>{venta?.tramite ? TRAMITE[venta.tramite] ?? venta.tramite : "—"}</dd>
            <dt className="text-muted-foreground">Expediente</dt>
            <dd className="break-all">{venta?.expedienteNro ?? "—"}</dd>
            <dt className="text-muted-foreground">Permiso emitido</dt>
            <dd>{dia(venta?.permisoFecha ?? null)}</dd>
            {e.odoo_escrito_at && (
              <>
                <dt className="text-muted-foreground">Robot</dt>
                <dd>Al día con TAD desde el {fecha(e.odoo_escrito_at)}</dd>
              </>
            )}
          </dl>
        </div>
      )}

      {ventaError && <p className="text-orange-400">No se pudo leer la venta en Odoo: {ventaError}</p>}
      {e.odoo_error && <p className="text-orange-400">{e.odoo_error}</p>}

      {estado === "propuesto" && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="basis-full text-muted-foreground">
            El robot la encontró por la dirección. Hasta que alguien la confirme no se escribe nada en Odoo; después
            mantiene solo el trámite, el número de expediente y las fechas.
          </p>
          <Button size="sm" disabled={vinculo.isPending} onClick={() => hacer({ accion: "confirmar" }, "Venta confirmada: el robot la actualiza en unos segundos")}>
            {vinculo.isPending && <Loader2 className="size-4 animate-spin" />} Es esta venta
          </Button>
          <Button size="sm" variant="outline" disabled={vinculo.isPending} onClick={() => hacer({ accion: "descartar" }, "Venta descartada")}>
            No es esta
          </Button>
        </div>
      )}

      {estado !== "confirmado" && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (numero.trim()) hacer({ accion: "vincular", venta: numero.trim() }, "Venta vinculada: el robot la actualiza en unos segundos");
          }}
        >
          {estado === "sin_vincular" && (
            <p className="basis-full text-muted-foreground">
              {sinAltura(e.direccion)
                ? "La carátula no trae altura (en TAD se escribió la calle sin elegirla del buscador), así que no se puede buscar la venta sola."
                : "No hay en Odoo una venta confirmada con esta dirección anterior a la presentación."}
            </p>
          )}
          <Input value={numero} onChange={(ev) => setNumero(ev.target.value)} placeholder="S02419" className="h-8 w-32" />
          <Button type="submit" size="sm" variant="outline" disabled={vinculo.isPending || !numero.trim()}>
            {estado === "propuesto" ? "Es otra venta" : "Vincular venta"}
          </Button>
        </form>
      )}
    </section>
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
