"use client";

// Las cajas de Ventas debajo del gráfico (§5.2): Qué facturamos, Comercial: lo que pide
// acción, Vendido según Odoo (colapsado) y ¿Ganamos?. Montos crudos del servidor, formateados
// acá con la moneda elegida (useFormato). Lo que falta dice "Sin dato" con el motivo.

import { ChevronRight, CheckCircle2, Info } from "lucide-react";
import { fmtMon, mesNombre, montoEn, nf, pct, textoCierre } from "@/lib/direccion/formato";
import type { DetalleVentas } from "@/lib/direccion/calculo/ventas-armar";
import type { NodoRef, Valor } from "@/lib/direccion/tipos";
import { cn } from "@/lib/utils";
import { BotonDefinicion } from "../boton-definicion";
import { Ranking } from "../barras";
import { useDireccion, useFormato } from "../contexto";
import { MarcaConfianza, ValorCifra } from "../piezas";

/** Caja de una sección (".caja" de la maqueta). */
export function Caja({ titulo, der, children, className }: { titulo: React.ReactNode; der?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-lg border bg-card px-4 py-3.5 shadow-(--dir-sombra-1)", className)}>
      <h3 className="mb-2.5 flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        {titulo}
        {der && <span className="ml-auto flex items-center gap-1.5 font-medium tracking-normal normal-case">{der}</span>}
      </h3>
      {children}
    </section>
  );
}

export function AvisoGris({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border bg-muted/40 px-3 py-2 text-[12.5px] leading-snug text-muted-foreground">{children}</div>;
}

function Cierre({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      {ok ? <CheckCircle2 className="size-3.5 text-(--dir-bien)" aria-hidden /> : <Info className="size-3.5" aria-hidden />}
      {texto}
    </div>
  );
}

// ─── Qué facturamos ─────────────────────────────────────────────────────────────────────

export function Composicion({ c }: { c: DetalleVentas["composicion"] }) {
  const f = useFormato();
  if (c.estado !== "ok") {
    return (
      <Caja titulo="Qué facturamos">
        <AvisoGris>Sin dato: {c.motivo}.</AvisoGris>
      </Caja>
    );
  }
  const cierre = textoCierre({ suma: c.total, cifra: c.facturado, texto: `facturado neto (${c.etqPeriodo})` }, f.ctx);
  return (
    <Caja titulo="Qué facturamos" der={<BotonDefinicion kpi="nueva_vs_renov" />}>
      {c.filas.length ? (
        <Ranking
          filas={c.filas.map((x) => ({ id: x.tipo, nombre: x.nombre, valor: { tipo: "monto", monto: x.monto }, peso: Math.max(0, x.monto.ars), pct: x.pct }))}
        />
      ) : (
        <AvisoGris>No hubo facturación en el período.</AvisoGris>
      )}
      <Cierre ok={cierre.ok} texto={`${cierre.texto}${f.moneda === "USD" ? " · cada renglón al dólar de su factura" : ""}`} />
    </Caja>
  );
}

// ─── Comercial ──────────────────────────────────────────────────────────────────────────

function Fila({ titulo, sub, valor, nodo }: { titulo: string; sub?: React.ReactNode; valor: Valor | React.ReactNode; nodo?: NodoRef }) {
  const { abrirNodo } = useDireccion();
  const esValor = (x: unknown): x is Valor => typeof x === "object" && x !== null && "tipo" in x && typeof (x as { tipo: unknown }).tipo === "string";
  const der: React.ReactNode = esValor(valor) ? <ValorCifra valor={valor} /> : (valor as React.ReactNode);
  const cuerpo = (
    <>
      <span className="min-w-0 flex-1">
        <b className="block truncate font-semibold">{titulo}</b>
        {sub && <small className="block text-xs text-muted-foreground">{sub}</small>}
      </span>
      <span className="text-right font-semibold whitespace-nowrap tabular-nums">{der}</span>
      {nodo && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
    </>
  );
  const clase = "flex min-h-11 w-full items-center gap-2.5 border-t py-2.5 text-left text-[13px] first:border-t-0";
  return nodo ? (
    <button type="button" onClick={() => abrirNodo(nodo)} className={cn(clase, "rounded-sm hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring")}>{cuerpo}</button>
  ) : (
    <div className={clase}>{cuerpo}</div>
  );
}

export function AccionComercial({ c }: { c: DetalleVentas["comercial"] }) {
  const f = useFormato();
  if (c.estado !== "ok") {
    return (
      <Caja titulo="Comercial: lo que pide acción">
        <AvisoGris>Sin dato: {c.motivo}.</AvisoGris>
      </Caja>
    );
  }
  const esperado = c.esperado.tipo === "sin_dato" ? `esperado: sin dato (${c.esperado.motivo.toLowerCase()})` : `esperado ${f.valor(c.esperado)} (conversión histórica ${pct(c.conversionPct, 1)})`;
  return (
    <Caja titulo="Comercial: lo que pide acción">
      <div className="flex flex-col">
        <Fila titulo="Contratos que vencen en 7 días" sub="renovaciones a gestionar" valor={c.vencen7} />
        <Fila titulo="Contratos que vencen en 15 días" valor={c.vencen15} />
        <Fila titulo="Oportunidades abiertas sin ninguna tarea" sub={c.abiertas != null ? `de ${c.abiertas} abiertas` : undefined} valor={c.sinActividad} />
        <Fila
          titulo="Mediana de días de aprobación (Obra)"
          sub={`${c.promedioObra != null ? `promedio ${fmtNum(c.promedioObra)}` : "promedio sin dato"} · ${pct(c.pct7Dias)} de todo se aprueba en ≤ 7 días`}
          valor={c.medianaObra}
        />
        <Fila
          titulo="Cotizado vivo"
          sub={`${esperado}${c.concentracionPct != null ? ` · ${pct(c.concentracionPct)} es de un solo usuario y casi no se convierte` : ""}`}
          valor={f.mon(c.vivo)}
          nodo={{ tipo: "cotizado_vivo" }}
        />
      </div>
    </Caja>
  );
}

const fmtNum = (n: number) => nf(n, 1);

// ─── Vendido según Odoo ─────────────────────────────────────────────────────────────────

export function Vendido({ v }: { v: DetalleVentas["vendido"] }) {
  const f = useFormato();
  const { abrirNodo } = useDireccion();
  if (v.estado !== "ok") {
    return (
      <details className="group rounded-lg border bg-card px-4 py-3 shadow-(--dir-sombra-1)">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-semibold [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
          <span className="text-(--dir-aten)" aria-hidden>⚠</span> Vendido según Odoo (órdenes confirmadas): Sin dato
        </summary>
        <p className="mt-2.5 text-[13px] text-muted-foreground">{v.motivo}.</p>
      </details>
    );
  }
  return (
    <details className="group rounded-lg border bg-card px-4 py-3 shadow-(--dir-sombra-1)">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-[13px] font-semibold [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
        <span className="text-(--dir-aten)" aria-hidden>⚠</span> Vendido según Odoo (órdenes confirmadas): {f.mon(v.conIva)}
        <span className="font-normal text-muted-foreground">· no es venta</span>
      </summary>
      <p className="mt-2.5 text-[13px]">
        Es lo que muestra hoy el tablero Comercial de Odoo: órdenes con fecha de confirmación en el período, <b>con IVA</b>. Incluye contratos cancelados y
        reconfirmados: Odoo reescribe la fecha y los vuelve a contar enteros. En el período hubo <b>{v.reconfPeriodo}</b> reconfirmaciones; en los últimos 30 días se
        reconfirmaron {v.reconf30.cantidad} órdenes por {f.mon(v.reconf30.sinIva)} <b>sin IVA</b>
        {v.reconf30.mayor && (
          <>
            {" "}({v.reconf30.mayor.orden} de {v.reconf30.mayor.cliente} sola, {f.mon(v.reconf30.mayor.sinIva)} sin IVA)
          </>
        )}
        .
      </p>
      <p className="mt-1.5 text-[13px] text-muted-foreground">
        Se muestra para que quien viene de Odoo encuentre &quot;su&quot; número y entienda por qué no es el de arriba ({f.mon(v.facturado)} facturado sin IVA).{" "}
        <button type="button" onClick={() => abrirNodo(v.nodo)} className="font-semibold text-foreground underline decoration-dotted underline-offset-[3px] hover:text-primary">
          Ver las {v.ordenes} órdenes
        </button>
      </p>
    </details>
  );
}

// ─── ¿Ganamos? ──────────────────────────────────────────────────────────────────────────

export function Ganamos({ g }: { g: DetalleVentas["ganamos"] }) {
  const f = useFormato();
  const { abrirNodo, conSocios } = useDireccion();
  if (!g) return null;
  const encabezado = (
    <>
      ¿Ganamos? <MarcaConfianza nivel="inc" className="tracking-normal normal-case" />
    </>
  );
  if (g.estado !== "ok") {
    return (
      <Caja titulo={encabezado} der={<BotonDefinicion kpi="resultado" />}>
        <AvisoGris>Sin dato: {g.motivo}.</AvisoGris>
      </Caja>
    );
  }
  const fm = (mm: Parameters<typeof montoEn>[0]) => fmtMon(montoEn(mm, f.moneda, f.tc), f.moneda);
  const neg = (mm: { ars: number; usd?: number | null }) => ({ ars: -mm.ars, usd: mm.usd == null ? mm.usd : -mm.usd });
  const sinIibb = g.mesesSinIibb;
  return (
    <Caja titulo={encabezado} der={<BotonDefinicion kpi="resultado" />}>
      {g.filas.length === 0 ? (
        <AvisoGris>Sin datos contables para los meses del período.</AvisoGris>
      ) : (
        <>
          {/* Escritorio: tabla. Celular: una tarjeta por mes. */}
          <div className="overflow-x-auto max-md:hidden">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b text-[11px] tracking-[0.04em] text-muted-foreground uppercase">
                  <th className="px-2 py-1.5 text-left font-semibold">Mes</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Ingresos</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Costo directo</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Estructura</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Resultado de gestión</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Margen</th>
                </tr>
              </thead>
              <tbody>
                {g.filas.map((x) => (
                  <tr
                    key={x.mes}
                    onClick={() => abrirNodo({ tipo: "resultado", mes: x.mes })}
                    className={cn("cursor-pointer border-b hover:bg-muted/50", x.parcial && "text-muted-foreground")}
                  >
                    <td className="px-2 py-2">
                      <button type="button" className="text-left focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Resultado de ${mesNombre(x.mes)}: ver desglose`}>
                        {x.etq}
                      </button>
                      {x.parcial && <span className="ml-1.5 rounded-full bg-(--dir-neutro-bg) px-1.5 py-px text-[11px] font-semibold text-(--dir-neutro-text)">en curso</span>}
                      {x.sinIibb && <span className="ml-1.5 rounded-full bg-(--dir-aten-bg) px-1.5 py-px text-[11px] font-semibold text-(--dir-aten)">sin IIBB</span>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{fm(x.ingresos)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fm(neg(x.costoDirecto))}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fm(neg(x.estructura))}</td>
                    {x.gestion == null ? (
                      <td colSpan={2} className="px-2 py-2 text-right">Sin dato · sin sueldos devengados</td>
                    ) : (
                      <>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums">{fm(x.gestion)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{pct(x.margenPct, 1)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col md:hidden">
            {g.filas.map((x) => (
              <button
                key={x.mes}
                type="button"
                onClick={() => abrirNodo({ tipo: "resultado", mes: x.mes })}
                className={cn("flex min-h-11 w-full items-center gap-2.5 border-t py-2.5 text-left text-[13px] first:border-t-0", x.parcial && "text-muted-foreground")}
              >
                <span className="min-w-0 flex-1">
                  <b className="block font-semibold">
                    {x.etq}
                    {x.parcial ? " · en curso" : ""}
                    {x.sinIibb ? " · sin IIBB" : ""}
                  </b>
                  <small className="block text-xs text-muted-foreground">
                    ingresos {fm(x.ingresos)} · costo {fm(neg(x.costoDirecto))} · estructura {fm(neg(x.estructura))}
                  </small>
                </span>
                <span className="text-right font-semibold whitespace-nowrap tabular-nums">
                  {x.gestion == null ? "Sin dato" : fm(x.gestion)}
                  <small className="block font-normal text-muted-foreground">{x.gestion == null ? "sin sueldos devengados" : `margen ${pct(x.margenPct, 1)}`}</small>
                </span>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            ))}
          </div>
        </>
      )}
      <div className="mt-2 text-xs text-muted-foreground">
        {f.moneda === "USD" ? "En USD, cada mes al dólar promedio del mes. " : ""}
        Ingresos = cuentas de ingreso por fecha contable: puede diferir unos pocos millones del facturado neto del mismo mes.
      </div>
      <p className="mt-2.5 mb-1 text-[13px]">Para medir el resultado de verdad faltan cosas en la contabilidad:</p>
      <ul className="list-disc space-y-0.5 pl-[18px] text-[13px] text-muted-foreground">
        {!g.amortizado && (
          <li>
            Amortización de los andamios ({g.andamios ? f.mon(g.andamios) : "Sin dato"} a valor histórico, sin amortizar
            {g.amortizacionRef ? <>; referencia: {f.mon(g.amortizacionRef)} por mes</> : null}).
          </li>
        )}
        <li>
          Depurar la cuenta de cuadre 888888{g.cuadre ? <> ({f.mon(g.cuadre)} en el período)</> : null}
          {conSocios ? " y reimputar los retiros cargados como gasto" : ""}.
        </li>
        <li>
          El mes en curso no tiene sueldos ni Ingresos Brutos devengados: no se muestra su resultado.
          {sinIibb.map((s) => (
            <span key={s.mes}>
              {" "}
              {mesNombre(s.mes).replace(/^./, (c) => c.toUpperCase())} tampoco tiene Ingresos Brutos devengados (~{f.mon(s.estimado)} de más).
            </span>
          ))}
        </li>
      </ul>
    </Caja>
  );
}
