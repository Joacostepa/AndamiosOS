"use client";

// En la calle (§5.4 y renderCalle de la maqueta): las cinco cifras, "Vencido y afuera" con su
// selector (Devolución · Fin estimado · Sin renovación), la agenda de órdenes de trabajo de
// esta semana y la próxima, el backlog y la utilización de la flota como "próximamente".
// Todo llega calculado del servidor (calculo/calle.ts); acá sólo se formatea y se pinta.

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { EstadoVacio, FilaCifras, TarjetaCifra, useDireccion, useFormato } from "@/components/direccion";
import type { DetalleCalle, FilaContrato, FilaOt } from "@/lib/direccion/calculo/calle-reglas";
import { fcorta, fdia, flarga, nf, nombreLindo, pct } from "@/lib/direccion/formato";
import type { ResultadoPantalla } from "@/lib/direccion/tipos";

const ORDEN_CIFRAS = ["en_la_calle", "m2", "dev_vencida", "fin_vencido", "ot_vencidas"];

export function VistaCalle({ resultado }: { resultado: ResultadoPantalla<DetalleCalle | null> }) {
  const d = resultado.detalle;
  const cifras = ORDEN_CIFRAS.map((k) => resultado.cifras.find((c) => c.kpi === k)).filter((c) => c != null);
  return (
    <>
      <FilaCifras>
        {cifras.map((c) => (
          <TarjetaCifra key={c.id ?? c.kpi} cifra={c} />
        ))}
      </FilaCifras>
      {d && (
        <>
          <Vencidos d={d} />
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Agenda d={d} />
            <div className="flex min-w-0 flex-col gap-3">
              <Backlog d={d} />
              <Flota d={d} />
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ─── Piezas ─────────────────────────────────────────────────────────────────────────────

function Caja({ titulo, der, children, className }: { titulo: React.ReactNode; der?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-lg border bg-card px-3.5 py-3 shadow-(--dir-sombra-1)", className)}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        {der}
      </div>
      {children}
    </section>
  );
}

function Segmentos<T extends string>({ valor, opciones, onCambio, etiqueta }: { valor: T; opciones: [T, string][]; onCambio: (v: T) => void; etiqueta: string }) {
  return (
    <div role="group" aria-label={etiqueta} className="inline-flex rounded-md border p-0.5 text-xs">
      {opciones.map(([v, t]) => (
        <button
          key={v}
          type="button"
          aria-pressed={valor === v}
          onClick={() => onCambio(v)}
          className={cn("rounded px-2.5 py-1 max-md:min-h-11", valor === v ? "bg-secondary font-semibold" : "text-muted-foreground hover:text-foreground")}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

const ETQ = {
  mal: "bg-(--dir-mal-bg) text-(--dir-mal)",
  aten: "bg-(--dir-aten-bg) text-(--dir-aten)",
  neutro: "bg-(--dir-neutro-bg) text-(--dir-neutro-text)",
} as const;

function Etiqueta({ tono, children }: { tono: keyof typeof ETQ; children: React.ReactNode }) {
  return <span className={cn("inline-block rounded-full px-1.5 py-px text-[10.5px] font-semibold whitespace-nowrap", ETQ[tono])}>{children}</span>;
}

// ─── Vencido y afuera ───────────────────────────────────────────────────────────────────

type Lista = "devolucion" | "fin" | "sinrenov";
const TITULO_LISTA: Record<Lista, string> = { devolucion: "Devolución pactada vencida", fin: "Fin de obra estimado vencido", sinrenov: "Sin renovación en 35 días" };

function Vencidos({ d }: { d: DetalleCalle }) {
  const f = useFormato();
  const { abrirNodo } = useDireccion();
  const [lista, setLista] = useState<Lista>("devolucion");
  const filas = lista === "devolucion" ? d.devolucion.filas : lista === "fin" ? d.finObra.filas : d.sinRenovacion.filas;
  const esFin = lista === "fin";
  const maxD = Math.max(1, ...filas.map((o) => o.diasVencido ?? 0));
  const fecha = (o: FilaContrato) => (esFin ? o.finObra : o.devolucion);
  const montoTxt = (o: FilaContrato) => (!esFin && o.abonoArs != null ? `${f.mon({ ars: o.abonoArs })}/mes` : f.mon({ ars: o.contratoArs }));
  const abrir = (o: FilaContrato) => abrirNodo({ tipo: "contratoCalle", v: o.orden });
  const obras = [...new Set(d.reemplazadas.map((r) => r.obra).filter(Boolean))];
  const unidad = esFin ? "obras" : "contratos";
  const sinFact = (o: FilaContrato) => o.enLaCalle && !o.sigueFacturando;

  return (
    <Caja
      titulo="Vencido y afuera — lo que no se está cobrando"
      der={<Segmentos etiqueta="Qué lista ver" valor={lista} onCambio={setLista} opciones={[["devolucion", "Devolución"], ["fin", "Fin estimado"], ["sinrenov", "Sin renovación"]]} />}
    >
      <p className="mb-2 text-[12.5px] text-muted-foreground">
        {TITULO_LISTA[lista]} · {filas.length} {unidad}
        {lista === "devolucion" && d.devolucion.filas.length > 0 && <> · abono {f.mon({ ars: d.devolucion.abonoArs })}/mes, {d.devolucion.sinFacturar} sin facturar hace más de 40 días</>}
        {lista === "sinrenov" && d.sinRenovacion.filas.length > 0 && <> · abono {f.mon({ ars: d.sinRenovacion.abonoArs })}/mes</>}
        {lista === "fin" && d.finObra.sinFecha > 0 && <> · {d.finObra.sinFecha} obras armadas sin fin estimado cargado</>}
        .{!esFin && obras.length > 0 && <> {obras.length === 1 ? `${obras[0]} se cuenta una sola vez` : `Las obras con órdenes reemplazadas (${obras.join(", ")}) se cuentan una sola vez`}.</>}
      </p>
      {filas.length === 0 ? (
        <EstadoVacio positivo titulo={lista === "devolucion" ? "Ningún contrato con la devolución vencida ✓" : lista === "fin" ? "Ninguna obra con el fin estimado vencido ✓" : "Todos los contratos renovaron ✓"} />
      ) : (
        <>
          {/* Celular: filas de tarjeta */}
          <div className="divide-y md:hidden">
            {filas.map((o) => (
              <button key={o.orden} type="button" onClick={() => abrir(o)} className="flex min-h-11 w-full items-center gap-2 py-2 text-left">
                <span className="flex min-w-0 flex-1 flex-col">
                  <b className="truncate text-[13px] font-semibold">{o.orden} · {nombreLindo(o.cliente)}</b>
                  <small className="text-xs text-muted-foreground">
                    {lista === "sinrenov" ? `última factura ${o.ultimaFactura ? fcorta(o.ultimaFactura) : "ninguna"}` : `venció ${fcorta(fecha(o))} · ${o.diasVencido} d`} · {o.accion}
                    {sinFact(o) && !esFin && <> · <span className="font-semibold text-(--dir-mal)">sin facturar</span></>}
                  </small>
                </span>
                <span className="text-right text-[13px] font-semibold tabular-nums">{montoTxt(o)}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            ))}
          </div>
          {/* Escritorio: tabla */}
          <div className="overflow-x-auto max-md:hidden">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                <tr className="border-b">
                  <th className="py-1.5 pr-2 font-semibold">Contrato</th>
                  <th className="py-1.5 pr-2 font-semibold">Cliente · obra</th>
                  <th className="py-1.5 pr-2 font-semibold">{esFin ? "Fin estimado" : lista === "sinrenov" ? "Devolución" : "Venció"}</th>
                  <th className="w-[20%] py-1.5 pr-2 font-semibold">Días vencido</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">{esFin ? "Contrato" : "Abono"}</th>
                  <th className="py-1.5 pr-2 font-semibold">Últ. factura</th>
                  <th className="py-1.5 pr-2 font-semibold">Estado obra</th>
                  <th className="py-1.5 font-semibold">Acción sugerida</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((o) => {
                  const dias = o.diasVencido;
                  return (
                    <tr key={o.orden} onClick={() => abrir(o)} className={cn("cursor-pointer border-b last:border-b-0 hover:bg-muted/50", esFin && !o.enLaCalle && "opacity-60")}>
                      <td className="py-1.5 pr-2 font-mono text-xs">
                        <button type="button" onClick={(e) => { e.stopPropagation(); abrir(o); }} className="underline-offset-2 hover:underline" aria-label={`Ver ${o.orden}`}>
                          {o.orden}
                        </button>
                      </td>
                      <td className="max-w-[260px] py-1.5 pr-2">
                        <div className="truncate">{nombreLindo(o.cliente)}</div>
                        <div className="truncate text-xs text-muted-foreground">{o.obra}{o.facturadoVia ? ` · factura vía ${o.facturadoVia}` : ""}</div>
                      </td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{flarga(fecha(o))}</td>
                      <td className="py-1.5 pr-2">
                        {dias != null ? (
                          <div className="flex items-center gap-1.5">
                            <span className="relative h-2 flex-1 rounded bg-(--dir-neutro-bg)">
                              <i className={cn("absolute inset-y-0 left-0 rounded", dias > 90 ? "bg-(--dir-mal)" : "bg-(--dir-serie)")} style={{ width: `${(Math.max(0, dias) / maxD) * 100}%` }} />
                            </span>
                            <span className="w-8 text-right tabular-nums">{dias}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-right whitespace-nowrap tabular-nums">{montoTxt(o)}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">
                        {o.ultimaFactura ? fcorta(o.ultimaFactura) : "—"}
                        {o.diasSinFacturar != null && o.diasSinFacturar > 40 && <> <Etiqueta tono="mal">{o.diasSinFacturar} d</Etiqueta></>}
                        {o.diasSinFacturar == null && <> <Etiqueta tono="mal">sin facturas</Etiqueta></>}
                      </td>
                      <td className="py-1.5 pr-2">{o.estadoObra}{esFin && !o.enLaCalle && <div className="text-xs text-muted-foreground">devuelta en Alquiler</div>}</td>
                      <td className="py-1.5">{o.accion}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Caja>
  );
}

// ─── Agenda de órdenes de trabajo ───────────────────────────────────────────────────────

const TIPO_OT: Record<string, string> = { armado: "Armado", desarme: "Desarme", ampliacion: "Ampliación", desmonte_parcial: "Desmonte parcial", mantenimiento: "Mantenimiento", otro: "Otro" };

function Agenda({ d }: { d: DetalleCalle }) {
  const [cual, setCual] = useState<"esta" | "prox">("esta");
  const ot = d.ot;
  if (!ot) {
    return (
      <Caja titulo="Agenda de órdenes de trabajo">
        <EstadoVacio titulo="Sin dato" texto="No se pudieron leer las órdenes de trabajo de Odoo. El resto de la pantalla está al día." />
      </Caja>
    );
  }
  const lista = cual === "esta" ? ot.esta : ot.prox;
  const sem = cual === "esta" ? ot.semana : ot.proxima;
  return (
    <Caja
      titulo={`Agenda de órdenes de trabajo · ${fcorta(sem.desde)}–${fcorta(sem.hasta)}`}
      der={<Segmentos etiqueta="Qué semana ver" valor={cual} onCambio={setCual} opciones={[["esta", `Esta semana (${ot.esta.length})`], ["prox", `Próxima (${ot.prox.length})`]]} />}
    >
      {lista.length === 0 ? (
        <EstadoVacio titulo="No hay órdenes programadas para esa semana." />
      ) : (
        <ul className="divide-y">
          {lista.map((o) => <FilaAgenda key={o.id} o={o} />)}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Cada orden se abre en su ficha de Órdenes de trabajo. Dirección no mueve órdenes.
        {cual === "esta" && ot.completadasSemana != null && <> Completadas esta semana: {ot.completadasSemana}.</>}
      </p>
    </Caja>
  );
}

function FilaAgenda({ o }: { o: FilaOt }) {
  const hab = o.habilitacion === "rojo" || o.habilitacion === "vencida"
    ? <Etiqueta tono="mal">⚠ {o.habilitacion === "vencida" ? "habilitación vencida" : "sin habilitación"}</Etiqueta>
    : o.habilitacion === "amarillo" ? <Etiqueta tono="aten">habilitación en trámite</Etiqueta> : null;
  return (
    <li>
      <Link href={`/ordenes-trabajo/${o.id}`} className="flex min-h-11 items-center gap-2.5 py-1.5 hover:bg-muted/40">
        <span className="w-[62px] shrink-0 text-xs text-muted-foreground">{o.fecha ? fdia(o.fecha) : "—"}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="truncate text-[13px] font-semibold">
            <Etiqueta tono={o.tipo === "desarme" ? "aten" : "neutro"}>{TIPO_OT[o.tipo] ?? o.tipo}</Etiqueta> {o.orden ?? "sin orden"}
            {o.cliente && ` · ${nombreLindo(o.cliente)}`}
          </b>
          <small className="truncate text-xs text-muted-foreground">
            {o.obra || "sin dirección"} · {nf(o.jornadas, 1)} {o.jornadas === 1 ? "jornada" : "jornadas"}
            {o.estado === "en_proceso" && " · en proceso"}
            {o.cuadrilla && ` · ${o.cuadrilla}`}
          </small>
        </span>
        {hab && <span className="shrink-0">{hab}</span>}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

// ─── Backlog y flota ────────────────────────────────────────────────────────────────────

function FilaDato({ titulo, sub, valor, valorSub, onClick }: { titulo: string; sub?: string; valor: React.ReactNode; valorSub?: string; onClick?: () => void }) {
  const cuerpo = (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="text-[13px] font-semibold">{titulo}</b>
        {sub && <small className="truncate text-xs text-muted-foreground">{sub}</small>}
      </span>
      <span className="flex flex-col items-end text-right">
        <span className="text-[15px] font-semibold tabular-nums">{valor}</span>
        {valorSub && <small className="text-xs text-muted-foreground">{valorSub}</small>}
      </span>
      {onClick && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex min-h-11 w-full items-center gap-2 py-2 text-left hover:bg-muted/40">{cuerpo}</button>
  ) : (
    <div className="flex min-h-11 items-center gap-2 py-2">{cuerpo}</div>
  );
}

function Backlog({ d }: { d: DetalleCalle }) {
  const { abrirNodo } = useDireccion();
  const ot = d.ot;
  const sr = d.sinRenovacion;
  return (
    <Caja titulo="Backlog">
      <div className="divide-y">
        {ot ? (
          <>
            <FilaDato titulo="Armados por programar" valor={ot.backlog.armados} valorSub={`${nf(ot.backlog.jornadasArmado, 1)} jornadas`} />
            <FilaDato titulo="Desarmes pendientes" valor={ot.backlog.desarmes} valorSub={`${nf(ot.backlog.jornadasDesarme, 1)} jornadas`} />
            <FilaDato titulo="Órdenes de las próximas 2 semanas sin habilitación" valor={ot.sinHabilitacionProx2} />
            <FilaDato
              titulo="Órdenes de trabajo vencidas"
              sub={ot.vencidas[0] ? `la más vieja: ${TIPO_OT[ot.vencidas[0].tipo] ?? ot.vencidas[0].tipo} ${ot.vencidas[0].orden ?? ""} del ${fcorta(ot.vencidas[0].fecha)}` : undefined}
              valor={ot.vencidas.length}
              onClick={() => abrirNodo({ tipo: "ot_vencidas" })}
            />
          </>
        ) : (
          <FilaDato titulo="Órdenes de trabajo" sub="No se pudieron leer de Odoo" valor={<span className="text-muted-foreground">Sin dato</span>} />
        )}
        <FilaDato titulo="Reservas con inicio vencido que nunca se armaron" valor={d.reservas.inicioVencido} valorSub={`de ${d.reservas.sinArmar} sin armar`} />
        <FilaDato
          titulo="Renovaron en los últimos 35 días"
          valor={sr.tasa != null ? pct(sr.tasa, 1) : <span className="text-muted-foreground">Sin dato</span>}
          valorSub={sr.debian ? `${sr.renovaron} de ${sr.debian}` : "ningún contrato debía renovar"}
          onClick={sr.filas.length ? () => abrirNodo({ tipo: "sin_renovacion" }) : undefined}
        />
        <FilaDato titulo="Contratos que vencen en 7 días" sub="renovaciones a gestionar" valor={d.vencen7} valorSub={`${d.vencen15} en 15 días`} />
      </div>
    </Caja>
  );
}

function Flota({ d }: { d: DetalleCalle }) {
  return (
    <Caja titulo="Utilización de la flota · próximamente" className="border-dashed bg-transparent shadow-none">
      <p className="text-[13px] text-muted-foreground">
        No se muestra un número que no existe: el stock &quot;en obra&quot;
        {d.flota ? ` (${nf(d.flota.enObra)} piezas)` : ""} viene de un ajuste con números redondos y el alquiler por m² no mueve stock. Falta
        costo de reposición, conteo físico y un remito por obra.
      </p>
    </Caja>
  );
}
