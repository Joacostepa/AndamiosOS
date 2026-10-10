"use client";

import { useState } from "react";
import { Copy, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useBorradoresBorrados, useVinculoVenta } from "@/hooks/use-permisos-via-publica";
import { cuandoFue, diaCorto, haceCuanto } from "@/lib/permisos-via-publica/estado";
import type { FichaPermiso } from "@/lib/permisos-via-publica/ficha";
import {
  MODALIDAD, TIPO_DUENO_CORTO, TRAMITE_ODOO, estadoVinculo, etiquetaEstado, formatoCuit,
  type EstadoRobot, type Expediente, type VentaOdoo,
} from "@/lib/permisos-via-publica/tipos";
import { Aviso, Chip } from "../ui";
import { ChipEstado } from "../chip-estado";
import { Dialogo } from "../dialogo";
import { BotonReenviarLink, DialogoDueno, copiar } from "./acciones";

// La columna de datos de la ficha (rediseño 09/10): el dueño del lote (con aviso si el nombre no
// puede salir así), el portal (a quién se mandó el link y si el cliente lo abrió), la venta en vivo,
// el expediente y su vínculo, los borradores para limpiar en TAD y la última señal del robot.

function Caja({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5 rounded-md border bg-card px-3 py-3 text-[13px]">
      <h3 className="text-[14px] font-semibold">{titulo}</h3>
      {children}
    </section>
  );
}

const dia = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export function Datos({ ficha, ahora }: { ficha: FichaPermiso; ahora: number }) {
  const t = ficha.tramite;
  const [corrigiendo, setCorrigiendo] = useState(false);
  const aVendedora = !!t.link_enviado_a && !!t.vendedor_email && t.link_enviado_a.trim().toLowerCase() === t.vendedor_email.trim().toLowerCase();
  const linkCorto = ficha.linkCliente ? `…/permiso/${ficha.linkCliente.split("/").pop()?.slice(0, 4)}…${ficha.linkCliente.slice(-5)}` : null;

  return (
    <aside aria-label="Datos del permiso" className="space-y-3">
      <Caja titulo="Dueño del lote">
        {!t.titular_cargado_at ? (
          <p className="text-muted-foreground">El cliente todavía no cargó el dueño del lote.</p>
        ) : (
          <>
            {ficha.nombreRaro && (
              <Aviso titulo={`El nombre ${ficha.nombreRaro}.`}>
                Así iría a Segucom y al CPAU.{" "}
                {ficha.yo.puedeEditar && (
                  <button type="button" className="font-medium underline underline-offset-2" onClick={() => setCorrigiendo(true)}>Corregirlo</button>
                )}
              </Aviso>
            )}
            <p className="break-words font-medium">{t.titular_nombre}</p>
            <p className="text-muted-foreground">
              CUIT {formatoCuit(t.titular_cuit ?? "")}{t.tipo_dueno ? ` · ${TIPO_DUENO_CORTO[t.tipo_dueno]}` : ""}{t.es_inquilino ? " · el cliente alquila" : ""}
            </p>
            {t.administrador_cuit && <p className="text-muted-foreground">Administrador: {t.administrador_nombre} · CUIT {formatoCuit(t.administrador_cuit)} (Segucom lo agrega como coasegurado)</p>}
            <p className="text-[12px] text-muted-foreground">Lo cargó el cliente el {cuandoFue(t.titular_cargado_at, ahora)}</p>
            {!ficha.nombreRaro && ficha.yo.puedeEditar && (
              <button type="button" className="text-[12px] font-medium underline underline-offset-2" onClick={() => setCorrigiendo(true)}>Corregir el dueño…</button>
            )}
            {corrigiendo && <DialogoDueno ficha={ficha} onCerrar={() => setCorrigiendo(false)} mandarEndoso={false} />}
          </>
        )}
      </Caja>

      <Caja titulo="Cliente y portal">
        <p>{t.cliente_nombre ?? "Cliente sin nombre"} · {t.cliente_email ?? <span className="text-muted-foreground">sin mail en Odoo</span>}</p>
        {t.link_error && <Aviso titulo="El link no salió">{t.link_error} Copialo y mandalo por WhatsApp.</Aviso>}
        {ficha.linkCliente && (
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-muted-foreground" title={ficha.linkCliente}>{linkCorto}</span>
            <Button size="sm" variant="outline" onClick={() => copiar(ficha.linkCliente, "Link copiado: pegalo en WhatsApp")}>
              <Copy className="size-3.5" /> Copiar link
            </Button>
          </div>
        )}
        {t.link_enviado_at && (
          <p className="text-muted-foreground">
            {aVendedora ? `Enviado a ${ficha.vendedora?.corto ?? "la vendedora"} el ${cuandoFue(t.link_enviado_at, ahora)} para que se lo pase al cliente.` : `Enviado al cliente${t.link_enviado_a ? ` (${t.link_enviado_a})` : ""} el ${cuandoFue(t.link_enviado_at, ahora)}.`}
          </p>
        )}
        <p className={cn(ficha.portalVistoAt ? "text-foreground/80" : "text-muted-foreground")}>
          {ficha.portalVistoAt ? `El cliente abrió el portal ${haceCuanto(ficha.portalVistoAt, ahora)}.` : "Todavía no hay registro de que el cliente haya abierto el portal."}
        </p>
        {ficha.linkCliente && <BotonReenviarLink ficha={ficha} />}
      </Caja>

      <Venta venta={ficha.venta} ventaError={ficha.ventaError} nombre={t.odoo_venta_nombre} vendedora={ficha.vendedora?.nombre ?? null} hasta={t.permiso_hasta} />

      {ficha.expediente && <DatosExpediente e={ficha.expediente} caratulaUrl={ficha.caratulaUrl} permisoUrl={ficha.permisoUrl} puedeEditar={ficha.yo.puedeEditar} ahora={ahora} />}

      {ficha.paraLimpiar.length > 0 && <ParaLimpiar ficha={ficha} ahora={ahora} />}

      <LatidoRobot robot={ficha.robot} ahora={ahora} />
    </aside>
  );
}

export function Venta({ venta, ventaError, nombre, vendedora, hasta }: { venta: VentaOdoo | null; ventaError: string | null; nombre: string | null; vendedora: string | null; hasta?: string | null }) {
  if (!venta && !nombre && !ventaError) return null;
  return (
    <Caja titulo="Venta">
      <p className="flex flex-wrap items-center gap-x-2">
        {venta?.url ? (
          <a href={venta.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono underline-offset-2 hover:underline">
            {venta.nombre} <ExternalLink aria-hidden className="size-3" />
          </a>
        ) : (
          <span className="font-mono">{nombre ?? "—"}</span>
        )}
        {vendedora && <span className="text-muted-foreground">· Vendió: {vendedora}</span>}
      </p>
      {venta?.cliente && <p className="text-muted-foreground">{venta.cliente}</p>}
      {venta?.modalidad && <p className="text-muted-foreground">{MODALIDAD[venta.modalidad] ?? venta.modalidad}</p>}
      {venta && <p className="text-muted-foreground">En Odoo: {venta.tramite ? TRAMITE_ODOO[venta.tramite] ?? venta.tramite : "sin trámite"}{venta.permisoFecha ? ` · permiso del ${dia(venta.permisoFecha)}` : ""}</p>}
      {hasta && <p className="text-muted-foreground">Permiso pedido hasta el {dia(hasta)}</p>}
      {ventaError && <p className="text-amber-800 dark:text-amber-300">No se pudo leer la venta en Odoo: {ventaError}</p>}
    </Caja>
  );
}

export function DatosExpediente({ e, caratulaUrl, permisoUrl, puedeEditar, ahora }: { e: Expediente; caratulaUrl: string | null; permisoUrl: string | null; puedeEditar: boolean; ahora: number }) {
  const vinculo = estadoVinculo(e);
  const accion = useVinculoVenta(e.id);
  const [noEs, setNoEs] = useState(false);
  return (
    <Caja titulo="Expediente">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-mono">EX-{e.numero}</span>
        <ChipEstado expediente={e} />
      </p>
      {e.creado_tad && <p className="text-muted-foreground">Presentado el {dia(e.creado_tad)}</p>}
      <p className="text-muted-foreground">En TAD: {etiquetaEstado(e.estado_tad)}{e.tarea_pendiente ? " con tarea pendiente" : ""}, desde el {cuandoFue(e.estado_desde, ahora)}</p>
      {(e.barrio || e.seccion) && (
        <p className="text-muted-foreground">
          {[e.barrio, e.comuna].filter(Boolean).join(" · ")}{e.seccion ? ` · SMP ${[e.seccion, e.manzana, e.parcela].filter(Boolean).join("-")}` : ""}
        </p>
      )}
      {e.seguro_compania && <p className="text-muted-foreground">Seguro: {e.seguro_compania}, vence el {dia(e.seguro_vence)}</p>}
      {e.permiso_emitido_el && permisoUrl && <p className="text-muted-foreground">Permiso del {dia(e.permiso_emitido_el)}{e.permiso_vence ? `, vigente hasta el ${dia(e.permiso_vence)}` : " (vencimiento sin leer)"}</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        {caratulaUrl && (
          <a href={caratulaUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-[12px] font-medium hover:bg-muted">
            <Download aria-hidden className="size-3.5" /> Carátula
          </a>
        )}
        {permisoUrl && (
          <a href={permisoUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-[12px] font-medium hover:bg-muted">
            <Download aria-hidden className="size-3.5" /> Permiso
          </a>
        )}
      </div>
      <p className="pt-1 text-[12px] text-muted-foreground">
        Venta: {vinculo === "confirmado" ? (e.odoo_vinculo_por === "numero" ? "vinculada por número de expediente" : `confirmada${e.odoo_vinculo_confirmado_at ? ` el ${diaCorto(e.odoo_vinculo_confirmado_at)}` : ""}`) : vinculo === "propuesto" ? "propuesta por la dirección, falta confirmar" : "sin vincular"}
        {e.odoo_escrito_at ? ` · Odoo actualizado el ${cuandoFue(e.odoo_escrito_at, ahora)}` : ""}
      </p>
      {e.odoo_error && <p className="text-[12px] text-amber-800 dark:text-amber-300">{e.odoo_error}</p>}
      {vinculo === "propuesto" && puedeEditar && (
        <>
          <button type="button" className="text-[12px] font-medium underline underline-offset-2" onClick={() => setNoEs(true)}>No es esta venta…</button>
          <Dialogo
            open={noEs}
            onOpenChange={setNoEs}
            titulo="¿No es esta venta?"
            texto="El robot la suelta y no la vuelve a proponer. Después se puede vincular otra a mano desde la ficha del expediente."
            confirmar="No es esta"
            cargando={accion.isPending}
            onConfirmar={() => accion.mutate({ accion: "descartar" }, { onSuccess: () => { toast.success("Venta descartada"); setNoEs(false); }, onError: (x) => toast.error(x instanceof Error ? x.message : "No se pudo") })}
          />
        </>
      )}
    </Caja>
  );
}

function ParaLimpiar({ ficha, ahora }: { ficha: FichaPermiso; ahora: number }) {
  const listo = useBorradoresBorrados(ficha.tramite.id);
  const numeros = ficha.paraLimpiar.map((b) => b.borrador).join(", ");
  return (
    <Caja titulo="Para limpiar en TAD">
      <ul className="space-y-0.5">
        {ficha.paraLimpiar.map((b) => (
          <li key={b.borrador}>
            <span className="font-mono">{b.borrador}</span>
            <span className="text-muted-foreground"> · {b.documentos ? `${b.documentos} documentos oficiales sueltos` : "sin documentos"} · {cuandoFue(b.fecha, ahora)}</span>
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-muted-foreground">Se borran en TAD (Mis trámites → Borradores) con el robot frenado.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => copiar(numeros, "Números copiados")}>Copiar números</Button>
        <Button size="sm" variant="ghost" disabled={listo.isPending || !ficha.yo.puedeEditar} onClick={() => listo.mutate(undefined, { onSuccess: () => toast.success("Anotado: ya se borraron"), onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo") })}>
          Ya los borré
        </Button>
      </div>
    </Caja>
  );
}

export function LatidoRobot({ robot, ahora }: { robot: EstadoRobot | null; ahora: number }) {
  const dormido = !robot?.ultimo_ok_at || ahora - Date.parse(robot.ultimo_ok_at) > 3 * 3600_000;
  return (
    <section className="flex items-center gap-2 rounded-md border bg-card px-3 py-2.5 text-[13px]">
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", dormido ? "bg-red-600 dark:bg-red-400" : "bg-emerald-600 dark:bg-emerald-400")} />
      <span className={dormido ? "text-red-800 dark:text-red-200" : "text-foreground/80"}>
        {robot?.ultimo_ok_at ? `Robot: la Mac dio señales ${haceCuanto(robot.ultimo_ok_at, ahora)}.` : "Robot: sin señales todavía."}
      </span>
      {dormido && <Chip tono="bloqueo">Fijate que la Mac esté prendida</Chip>}
    </section>
  );
}
