"use client";

// Cobranzas (§5.3 y maqueta §7.4): ¿quién nos debe, desde cuándo y a quién llamamos hoy?
// Fila de cifras, antigüedad (Todos | Estado | Privados, y "como lo ve Odoo hoy"),
// concentración y "A quién llamar hoy". Los montos llegan crudos y se formatean acá
// (useFormato), así el toggle de moneda no pide nada al servidor.

import { useMemo, useState } from "react";
import { ChevronRight, Pencil, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarraTramos, BotonDefinicion, EstadoVacio, FilaCifras, Ranking, TarjetaCifra, useDireccion, useFormato, type FilaRanking } from "@/components/direccion";
import { fcorta, mesEtq, nf, nombreLindo, pct } from "@/lib/direccion/formato";
import type { ClienteCob, DetalleCobranzas, MesCobrado } from "@/lib/direccion/calculo/cobranzas";
import type { Cifra, ResultadoPantalla } from "@/lib/direccion/tipos";
import { cn } from "@/lib/utils";
import { EditorSector } from "./editor-sector";

type R = ResultadoPantalla<DetalleCobranzas>;

export function Seccion({ titulo, der, children, className }: { titulo: string; der?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-lg border bg-card px-4 pt-3 pb-4 shadow-(--dir-sombra-1)", className)}>
      <h3 className="mb-3 flex min-h-8 flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        <span className="flex-1">{titulo}</span>
        {der}
      </h3>
      {children}
    </section>
  );
}

export function VistaCobranzas({ resultado }: { resultado: R }) {
  const d = resultado.detalle;
  if (!d?.tramos) return <EstadoVacio titulo="Todavía no hay datos de Cobranzas" texto="Odoo no respondió y no hay una lectura anterior guardada." />;
  const cifra = (kpi: string) => resultado.cifras.find((c) => c.kpi === kpi);
  const tarjetas = ["por_cobrar", "vencido_30", "dso", "rechazados", "sin_imputar"].map(cifra).filter((c): c is Cifra => !!c);
  return (
    <div className="flex flex-col gap-4">
      <FilaCifras>
        {tarjetas.map((c) => (
          <TarjetaCifra key={c.id ?? c.kpi} cifra={c} />
        ))}
        <TarjetaCobrado meses={d.cobrado} hoy={d.hoy} motivo={d.faltan.cobrado} />
      </FilaCifras>
      <div className="grid gap-4 lg:grid-cols-2">
        <Antiguedad d={d} />
        <Concentracion d={d} />
      </div>
      <AQuienLlamar d={d} />
      <div className="flex flex-col gap-1 px-0.5 text-xs text-muted-foreground">
        <span>
          <b className="font-semibold text-foreground">Saldos con IVA y al dólar de hoy.</b> Un renglón por cliente: facturas abiertas + cheques rechazados − cobros sin imputar.
        </span>
        <span>Se eliminaron &quot;% cobrado histórico&quot; y &quot;días promedio de cobro de las pagadas&quot;: siempre dan bien.</span>
      </div>
    </div>
  );
}

// ─── Cobrado (con su selector de período) ───────────────────────────────────────────────

type Periodo = "mes" | "anterior" | "todo";

function TarjetaCobrado({ meses, hoy, motivo }: { meses: MesCobrado[] | null; hoy: string; motivo?: string }) {
  const f = useFormato();
  const { abrirNodo } = useDireccion();
  const [per, setPer] = useState<Periodo>("mes");
  const elegido = useMemo(() => {
    if (!meses?.length) return null;
    const actual = meses.find((m) => m.parcial) ?? meses[meses.length - 1];
    if (per === "mes") return { monto: actual.monto, etq: actual.parcial ? `${mesEtq(actual.mes)} al ${fcorta(hoy)}` : mesEtq(actual.mes) };
    if (per === "anterior") {
      const i = meses.indexOf(actual);
      const m = meses[i - 1];
      return m ? { monto: m.monto, etq: mesEtq(m.mes) } : null;
    }
    const usd = meses.some((m) => m.monto.usd == null) ? null : meses.reduce((a, m) => a + (m.monto.usd ?? 0), 0);
    return { monto: { ars: meses.reduce((a, m) => a + m.monto.ars, 0), usd }, etq: `${mesEtq(meses[0].mes)} a hoy` };
  }, [meses, per, hoy]);
  const texto = elegido ? f.mon(elegido.monto) : "Sin dato";
  return (
    <article className="dir-tarjeta relative flex min-w-0 cursor-pointer flex-col gap-0.5 rounded-lg border bg-card px-3 pt-2.5 pb-2.5 shadow-(--dir-sombra-1) hover:shadow-(--dir-sombra-2)">
      <div className="flex min-h-[30px] items-center pr-8 text-[12.5px] font-semibold">
        <button type="button" onClick={() => abrirNodo({ tipo: "cobrado" })} aria-label={`Cobrado: ${texto}. Ver desglose`} className="dir-estirado text-left">
          Cobrado
        </button>
      </div>
      <BotonDefinicion kpi="cobrado" className="absolute top-1 right-1" />
      <div className={cn("text-2xl font-[650] leading-tight tracking-tight tabular-nums", !elegido && "text-muted-foreground")} title={elegido ? undefined : motivo}>
        {texto}
      </div>
      <div className="text-[11px] text-muted-foreground">
        {f.moneda} · con IVA{f.moneda === "USD" ? " · dólar de cada cobro" : ""}
        {elegido ? ` · ${elegido.etq}` : ""}
      </div>
      <select
        aria-label="Período del cobrado"
        value={per}
        onChange={(e) => setPer(e.target.value as Periodo)}
        className="relative z-10 mt-1 h-7 w-fit rounded-md border bg-background px-2 text-xs max-md:h-11"
      >
        <option value="mes">Mes en curso</option>
        <option value="anterior">Mes anterior</option>
        <option value="todo">{meses?.length ? `Desde ${mesEtq(meses[0].mes)}` : "12 meses"}</option>
      </select>
    </article>
  );
}

// ─── Antigüedad ─────────────────────────────────────────────────────────────────────────

type Vista = "todos" | "estado" | "privados";

function Antiguedad({ d }: { d: DetalleCobranzas }) {
  const { puedeEditar } = useDireccion();
  const [vista, setVista] = useState<Vista>("todos");
  const [comoOdoo, setComoOdoo] = useState(false);
  const [editando, setEditando] = useState(false);
  const tramos = vista === "todos" ? (comoOdoo ? d.tramosOdoo : d.tramos) : vista === "estado" ? d.tramosEstado : d.tramosPrivados;
  const sinPlazo = d.pctSinPlazoSaldo == null ? null : `${nf(d.pctSinPlazoSaldo)} %`;
  const hayDatos = tramos.some((t) => t.monto.ars > 0);
  return (
    <Seccion
      titulo="Antigüedad"
      der={
        <span className="flex flex-wrap items-center gap-2 normal-case tracking-normal">
          <span role="group" aria-label="Clientes" className="inline-flex rounded-md border p-0.5 text-xs">
            {(
              [
                ["todos", "Todos"],
                ["estado", "Estado"],
                ["privados", "Privados"],
              ] as const
            ).map(([k, t]) => (
              <button
                key={k}
                type="button"
                aria-pressed={vista === k}
                onClick={() => setVista(k)}
                className={cn("min-h-7 rounded px-2.5 font-semibold max-md:min-h-11", vista === k ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {t}
              </button>
            ))}
          </span>
          {vista === "todos" && (
            <label className="inline-flex items-center gap-1.5 text-xs font-normal text-foreground max-md:min-h-11">
              <input type="checkbox" checked={comoOdoo} onChange={(e) => setComoOdoo(e.target.checked)} className="size-3.5 accent-(--primary)" /> como lo ve Odoo hoy
            </label>
          )}
        </span>
      }
    >
      {hayDatos ? <BarraTramos tramos={tramos} alto leyenda /> : <EstadoVacio positivo titulo="Nada por cobrar en este grupo" />}
      <div className={cn("mt-3 flex gap-2 rounded-md px-3 py-2 text-[12.5px] leading-snug", comoOdoo && vista === "todos" ? "bg-(--dir-aten-bg) text-(--dir-aten)" : "bg-muted/60 text-muted-foreground")}>
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          {comoOdoo && vista === "todos"
            ? "Así lo muestra Odoo: las facturas sin plazo de pago \"vencen\" el día que se emiten, por eso el tramo 1–30 aparece inflado. Son sólo facturas, sin rechazos ni cobros sin imputar."
            : `${sinPlazo ? `El ${sinPlazo} del saldo en facturas no tiene plazo de pago: acá` : "Las facturas sin plazo de pago"} vencen a los ${d.diasSinPlazo} días de emitidas, y los cobros sin imputar de cada cliente se aplican a sus partidas más viejas.`}
          {vista !== "todos" && " Estado = clasificación provisoria por nombre (Ministerio, Garrahan, ANMAT…) más lo marcado a mano."}
          {vista !== "todos" && puedeEditar && (
            <Button variant="link" size="sm" className="h-auto px-1 py-0 text-[12.5px] max-md:min-h-11" onClick={() => setEditando(true)}>
              <Pencil className="size-3" aria-hidden /> Editar quién es del Estado
            </Button>
          )}
        </span>
      </div>
      {editando && <EditorSector clientes={d.clientes} abierto={editando} onCerrar={() => setEditando(false)} />}
    </Seccion>
  );
}

// ─── Concentración ──────────────────────────────────────────────────────────────────────

function lecturaHhi(hhi: number | null): string {
  if (hhi == null) return "";
  if (hhi >= 2500) return ": muy concentrado";
  if (hhi >= 2000) return ': cerca de "muy concentrado"';
  if (hhi >= 1500) return ": concentrado";
  return ": poco concentrado";
}

function Concentracion({ d }: { d: DetalleCobranzas }) {
  const top = d.clientes.filter((c) => c.saldo >= 1).slice(0, 3);
  const resto = d.saldo - top.reduce((a, c) => a + c.saldo, 0);
  const nResto = d.clientesConSaldo - top.length;
  const filas: FilaRanking[] = top.map((c, i) => ({
    id: String(c.partnerId),
    nombre: `${c.publico ? "🏛 " : ""}${nombreLindo(c.nombre)}`,
    valor: { tipo: "monto", monto: { ars: c.saldo } },
    peso: c.saldo,
    pct: d.saldo > 0 ? (c.saldo / d.saldo) * 100 : null,
    destacada: i === 0,
    hijo: { tipo: "cliente", v: String(c.partnerId) },
  }));
  if (nResto > 0) filas.push({ id: "resto", nombre: `Resto (${nResto} clientes)`, valor: { tipo: "monto", monto: { ars: resto } }, peso: resto, pct: d.saldo > 0 ? (resto / d.saldo) * 100 : null, hijo: { tipo: "concentracion" } });
  return (
    <Seccion titulo="Concentración" der={<BotonDefinicion kpi="concentracion" />}>
      {filas.length ? <Ranking filas={filas} /> : <EstadoVacio positivo titulo="Nadie nos debe" />}
      {top.length > 0 && (
        <div className="mt-2 hidden gap-x-4 text-xs text-muted-foreground md:flex md:flex-wrap">
          {top.map((c) => (
            <span key={c.partnerId}>
              {nombreLindo(c.nombre)}: {c.facturas} fact. · {c.diasMax ? `${c.diasMax} d de atraso` : "al día"}
            </span>
          ))}
        </div>
      )}
      {d.concentracion.top10Pct != null && (
        <p className="mt-3 text-[12.5px] text-muted-foreground">
          Los 10 primeros son el <b className="font-semibold text-foreground">{pct(d.concentracion.top10Pct, 1)}</b> de lo que nos deben{lecturaHhi(d.concentracion.hhi)}.
        </p>
      )}
    </Seccion>
  );
}

// ─── A quién llamar hoy ─────────────────────────────────────────────────────────────────

type FiltroTramo = "" | "venc" | "30" | "90";
const VISIBLES = 25;

function AQuienLlamar({ d }: { d: DetalleCobranzas }) {
  const f = useFormato();
  const { abrirNodo } = useDireccion();
  const [vend, setVend] = useState("");
  const [tramo, setTramo] = useState<FiltroTramo>("");
  const [q, setQ] = useState("");

  const lista = useMemo(() => {
    const qn = q.trim().toLowerCase();
    return d.clientes
      .filter((c) => c.saldo >= 1)
      .filter((c) => !vend || c.vendedora === vend)
      .filter((c) => (tramo === "30" ? c.venc30 > 0 : tramo === "90" ? c.venc90 > 0 : tramo === "venc" ? c.vencido > 0 : true))
      .filter((c) => !qn || c.nombre.toLowerCase().includes(qn) || nombreLindo(c.nombre).toLowerCase().includes(qn))
      .sort((a, b) => Number(a.noLlamar) - Number(b.noLlamar) || b.vencido - a.vencido || b.saldo - a.saldo);
  }, [d.clientes, vend, tramo, q]);

  const aviso = (c: ClienteCob): string => {
    if (c.noLlamar) return `⚠ pagó ${f.mon({ ars: c.sinImputar })} que no se imputó (queda ${f.mon({ ars: c.saldo })}) → no llamar`;
    if (c.rechazado > 0) return `cheque rechazado ${f.mon({ ars: c.rechazado })}${c.rechazoRiesgo > 0 ? "" : " (compensado)"}`;
    return c.avisos[0] ?? "";
  };
  const abrir = (c: ClienteCob) => abrirNodo({ tipo: "cliente", v: String(c.partnerId) });
  const limpiar = () => {
    setVend("");
    setTramo("");
    setQ("");
  };
  const filtrado = !!(vend || tramo || q);
  const control = "h-8 rounded-md border bg-background px-2 text-[13px] max-md:h-11";

  return (
    <Seccion titulo="A quién llamar hoy">
      <div className="flex flex-wrap gap-2">
        <select aria-label="Vendedora" value={vend} onChange={(e) => setVend(e.target.value)} className={control}>
          <option value="">Todas las vendedoras</option>
          {d.vendedoras.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select aria-label="Tramo" value={tramo} onChange={(e) => setTramo(e.target.value as FiltroTramo)} className={control}>
          <option value="">Todos los tramos</option>
          <option value="venc">Con algo vencido</option>
          <option value="30">Vencido +30</option>
          <option value="90">Vencido +90</option>
        </select>
        <Input aria-label="Buscar cliente" placeholder="Buscar cliente…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 min-w-[140px] flex-1 max-md:h-11" />
      </div>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center text-sm text-muted-foreground">
          {tramo === "90" && !vend && !q ? "Ningún cliente con deuda +90 días. ✓" : "Nada con estos filtros."}
          {filtrado && (
            <Button variant="outline" size="sm" onClick={limpiar} className="max-md:h-11">
              Limpiar filtros
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Celular: filas de tarjeta */}
          <div className="mt-3 flex flex-col md:hidden">
            {lista.slice(0, VISIBLES).map((c) => (
              <button
                key={c.partnerId}
                type="button"
                onClick={() => abrir(c)}
                className={cn("flex min-h-11 items-center gap-2.5 border-t py-2.5 text-left first:border-t-0", c.noLlamar && "opacity-55")}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <b className="truncate text-[13.5px] font-semibold">
                    {c.publico ? "🏛 " : ""}
                    {nombreLindo(c.nombre)}
                  </b>
                  <small className="text-xs text-muted-foreground">
                    {c.vencido > 0 ? `vencido ${f.mon({ ars: c.vencido })} · ${c.diasMax} d` : "al día"}
                    {aviso(c) ? ` · ${aviso(c)}` : ""}
                  </small>
                </span>
                <span className="flex flex-col items-end text-right text-[13.5px] tabular-nums">
                  {f.mon({ ars: c.saldo })}
                  <small className="text-xs text-muted-foreground">{(c.vendedora ?? "—").split(" ")[0]}</small>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            ))}
          </div>

          {/* Escritorio: tabla */}
          <div className="mt-3 hidden overflow-x-auto md:block">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Cliente</th>
                  <th className="py-2 pr-3 text-right font-semibold">Saldo</th>
                  <th className="py-2 pr-3 text-right font-semibold">Vencido +30</th>
                  <th className="py-2 pr-3 text-right font-semibold">Más atrasada</th>
                  <th className="py-2 pr-3 font-semibold">Vendedora</th>
                  <th className="py-2 font-semibold">Último cobro</th>
                </tr>
              </thead>
              <tbody>
                {lista.slice(0, VISIBLES).map((c) => (
                  <tr key={c.partnerId} onClick={() => abrir(c)} className={cn("cursor-pointer border-b last:border-b-0 hover:bg-muted/50", c.noLlamar && "opacity-55")}>
                    <td className="py-2 pr-3 align-top">
                      <button type="button" onClick={(e) => { e.stopPropagation(); abrir(c); }} className="text-left font-medium underline-offset-2 hover:underline">
                        {c.publico ? "🏛 " : ""}
                        {nombreLindo(c.nombre)}
                      </button>
                      {aviso(c) && <div className="text-xs text-(--dir-aten)">{aviso(c)}</div>}
                    </td>
                    <td className="py-2 pr-3 text-right align-top tabular-nums">{f.mon({ ars: c.saldo })}</td>
                    <td className="py-2 pr-3 text-right align-top tabular-nums">{c.venc30 > 0 ? f.mon({ ars: c.venc30 }) : "—"}</td>
                    <td className="py-2 pr-3 text-right align-top tabular-nums">{c.diasMax ? `${c.diasMax} d` : "al día"}</td>
                    <td className="py-2 pr-3 align-top">{(c.vendedora ?? "—").split(" ")[0]}</td>
                    <td className="py-2 align-top tabular-nums">{c.ultimoCobro ? fcorta(c.ultimoCobro) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lista.length > VISIBLES && <p className="mt-2 text-xs text-muted-foreground">Se ven {VISIBLES} de {lista.length}. Filtrá o buscá para ver el resto.</p>}
        </>
      )}
      <p className="mt-3 text-xs text-muted-foreground">La vendedora sirve para saber quién llama, no para comparar: no hay totales por persona.</p>
    </Seccion>
  );
}
