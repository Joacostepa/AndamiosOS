"use client";

// Caja (/direccion/caja, diseno.md §5.1 y maqueta renderCaja): ¿cuánta plata hay y llegamos?
//  1. Fila de cifras: caja disponible, cheques en cartera, por pagar, cheques propios, cobertura.
//  2. Dónde está la plata: barra al 100 % de las cuentas confiables (un solo matiz) con las
//     cuentas a verificar afuera y punteadas, y la tabla de cuentas con "Total = la cifra ✓".
//  3. Próximas 8 semanas: escenario, colchón mínimo (✎), aviso, gráfico (celular: filas),
//     tabla por semana y "Queda fuera del flujo, a decidir".
// Todo llega calculado del servidor (lo reservado ya recortado); acá sólo se formatea en la
// moneda elegida y se cambia de escenario sin pedir nada al servidor.

import { useMemo, useState } from "react";
import { Check, ChevronRight, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { fcorta, flarga, fmtMon, nf, pct } from "@/lib/direccion/formato";
import { ESCENARIOS, cifraCobertura, conRetiros, nombreCorto, type CuentaCaja, type Escenario } from "@/lib/direccion/calculo/caja-reglas";
import type { DetalleCaja } from "@/lib/direccion/calculo/caja";
import type { ResultadoPantalla } from "@/lib/direccion/tipos";
import { FilaCifras, TarjetaCifra } from "../tarjetas";
import { TextoFrase } from "../piezas";
import { useDireccion, useFormato } from "../contexto";
import { FlujoFilas, GraficoFlujo } from "./grafico-flujo";
import { EditarColchon } from "./colchon";

function Seccion({ titulo, der, children, className }: { titulo: React.ReactNode; der?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-lg border bg-card px-4 py-3.5 shadow-(--dir-sombra-1)", className)}>
      <h3 className="mb-2.5 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {titulo}
        {der && <span className="ml-auto flex flex-wrap items-center gap-1.5 text-xs font-medium normal-case tracking-normal">{der}</span>}
      </h3>
      {children}
    </section>
  );
}

function Aviso({ tono = "aten", children }: { tono?: "aten" | "gris"; children: React.ReactNode }) {
  const Icono = tono === "aten" ? TriangleAlert : Check;
  return (
    <div className={cn("flex items-start gap-2 rounded-md px-3 py-2 text-[13px] leading-snug", tono === "aten" ? "bg-(--dir-aten-bg)" : "bg-muted")}>
      <Icono className={cn("mt-px size-[15px] shrink-0", tono === "aten" ? "text-(--dir-aten)" : "text-muted-foreground")} aria-hidden />
      <span>{children}</span>
    </div>
  );
}

const TONOS = [100, 78, 58, 40, 26, 18];
const colorCuenta = (i: number) => `color-mix(in srgb, var(--foreground) ${TONOS[Math.min(i, TONOS.length - 1)] * 0.55}%, var(--card))`;

function EtiquetaCuenta({ c }: { c: CuentaCaja }) {
  const [texto, clase] = c.enTotal
    ? c.sinArqueo
      ? ["⚠ sin arqueo", "bg-(--dir-aten-bg) text-(--dir-aten)"]
      : c.estado === "quieta"
        ? ["● quieta", "bg-(--dir-neutro-bg) text-(--dir-neutro-text)"]
        : ["✓", "bg-(--dir-bien-bg) text-(--dir-bien)"]
    : c.estado === "a_verificar"
      ? ["⚠ a verificar", "bg-(--dir-aten-bg) text-(--dir-aten)"]
      : ["fuera", "bg-(--dir-neutro-bg) text-(--dir-neutro-text)"];
  return <span className={cn("inline-block rounded-full px-1.5 py-px text-[11px] font-semibold whitespace-nowrap", clase)}>{texto}</span>;
}

export function VistaCaja({ resultado }: { resultado: ResultadoPantalla<DetalleCaja> }) {
  // Con direccion-socios llega `reservado.flujo` (el flujo con retiros) y se usa ese; sin el
  // permiso el servidor lo recortó y queda el flujo público, sin retiros.
  const d = useMemo(() => conRetiros(resultado.detalle), [resultado.detalle]);
  const f = useFormato();
  const { abrirNodo, conSocios, puedeEditar } = useDireccion();
  const [escenario, setEscenario] = useState<Escenario>(d.flujo.escenarioDefecto);

  const cifras = useMemo(
    () => resultado.cifras.map((c) => (c.kpi === "cobertura" && escenario !== d.flujo.escenarioDefecto ? cifraCobertura(d, escenario) : c)),
    [resultado.cifras, escenario, d],
  );
  const disponibles = d.cuentas.filter((c) => c.enTotal);
  const fuera = d.cuentas.filter((c) => !c.enTotal && Math.abs(c.saldoArs) > 1);
  const aVerificar = d.cuentas.filter((c) => c.estado === "a_verificar");
  const tot = d.totales.disponibleArs;
  const abrirSemana = (n: number) => abrirNodo({ tipo: conSocios ? "semanaFlujoSocios" : "semanaFlujo", v: String(n), e: escenario });
  const abrirCuenta = (c: CuentaCaja) => abrirNodo({ tipo: "cuenta", v: String(c.id) });

  return (
    <>
      <FilaCifras>
        {cifras.map((c) => (
          <TarjetaCifra key={c.id ?? c.kpi} cifra={c} titulo={c.kpi === "cobertura" ? "Cobertura de caja" : undefined} />
        ))}
      </FilaCifras>

      <Seccion titulo="Dónde está la plata">
        {/* Composición: cuentas confiables al 100 % y las a verificar afuera, punteadas. */}
        <div
          role="img"
          aria-label={`Dónde está la plata: ${disponibles.map((c) => `${c.nombre} ${pct(tot > 0 ? (c.saldoArs / tot) * 100 : null)}`).join(", ")}${aVerificar.length ? `; ${aVerificar.map((c) => nombreCorto(c.nombre)).join(", ")} fuera del total` : ""}`}
          className="flex h-[22px] gap-1"
        >
          <div className="flex min-w-0 gap-0.5 overflow-hidden rounded" style={{ flex: Math.max(1, tot) }}>
            {disponibles
              .filter((c) => c.saldoArs > 0)
              .map((c, i) => (
                <i key={c.id} className="block min-w-0.5" style={{ flex: Math.max(c.saldoArs, tot * 0.004), background: colorCuenta(i) }} title={`${c.nombre}: ${f.mon({ ars: c.saldoArs })}`} />
              ))}
          </div>
          {aVerificar.map((c) => (
            <div
              key={c.id}
              className="dir-trama rounded border border-dashed border-muted-foreground/60 text-muted-foreground"
              style={{ flex: Math.max(1, c.saldoArs) }}
              title={`${c.nombre} ${f.mon({ ars: c.saldoArs })}: a verificar, fuera del total`}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
          {disponibles
            .filter((c) => c.saldoArs > 0)
            .map((c, i) => (
              <span key={c.id} className="inline-flex items-center gap-1.5">
                <i className="inline-block size-2.5 rounded-sm" style={{ background: colorCuenta(i) }} aria-hidden />
                {c.nombre.replace(/\s+-\s+Empresa$/i, "")} <b className="font-semibold text-foreground tabular-nums">{pct(tot > 0 ? (c.saldoArs / tot) * 100 : null)}</b>
              </span>
            ))}
          {aVerificar.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1.5">
              <i className="dir-trama inline-block size-2.5 rounded-sm border border-dashed border-muted-foreground/60" aria-hidden />
              {nombreCorto(c.nombre)} · a verificar, fuera del total
            </span>
          ))}
        </div>

        {/* Tabla (escritorio) */}
        <div className="mt-3 overflow-x-auto max-md:hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b text-left text-[11.5px] text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Cuenta</th>
                <th className="py-1.5 pr-3 text-right font-medium">Saldo ({f.moneda})</th>
                <th className="py-1.5 pr-3 text-right font-medium">En moneda</th>
                <th className="py-1.5 pr-3 font-medium">Último mov.</th>
                <th className="py-1.5 pr-3 font-medium">Confianza</th>
                <th className="w-5" />
              </tr>
            </thead>
            <tbody>
              {disponibles.map((c) => (
                <tr key={c.id} onClick={() => abrirCuenta(c)} className="cursor-pointer border-b hover:bg-muted/50">
                  <td className="py-1.5 pr-3">
                    <button type="button" onClick={(e) => { e.stopPropagation(); abrirCuenta(c); }} className="text-left font-medium hover:underline">
                      {c.nombre}
                    </button>
                    <div className="font-mono text-[11px] text-muted-foreground">{c.codigo}</div>
                  </td>
                  <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">{f.mon({ ars: c.saldoArs })}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{c.moneda === "USD" && c.saldoUsd != null ? `USD ${nf(c.saldoUsd)}` : fmtMon(c.saldoContableArs, "ARS")}</td>
                  <td className="py-1.5 pr-3">
                    {fcorta(c.ultimoMovimiento)}
                    <div className="text-[11px] text-muted-foreground">{c.movimientos30d} mov. en 30 días</div>
                  </td>
                  <td className="py-1.5 pr-3"><EtiquetaCuenta c={c} /></td>
                  <td><ChevronRight className="size-3.5 text-muted-foreground" aria-hidden /></td>
                </tr>
              ))}
              <tr className="border-b font-semibold">
                <td className="py-1.5 pr-3">Total disponible</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{f.mon({ ars: tot })}</td>
                <td colSpan={4} />
              </tr>
              {fuera.map((c) => (
                <tr key={c.id} onClick={() => abrirCuenta(c)} className="cursor-pointer border-b text-muted-foreground hover:bg-muted/50">
                  <td className="py-1.5 pr-3">
                    <button type="button" onClick={(e) => { e.stopPropagation(); abrirCuenta(c); }} className="text-left hover:underline">
                      {c.nombre}
                    </button>
                    <div className="text-[11px]">{c.nota}</div>
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{f.mon({ ars: c.saldoArs })}</td>
                  <td />
                  <td className="py-1.5 pr-3">{c.estado === "a_verificar" ? flarga(c.ultimoMovimiento) : fcorta(c.ultimoMovimiento)}</td>
                  <td className="py-1.5 pr-3"><EtiquetaCuenta c={c} /></td>
                  <td><ChevronRight className="size-3.5" aria-hidden /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Filas (celular) */}
        <div className="mt-3 flex flex-col md:hidden">
          {disponibles.map((c) => (
            <button key={c.id} type="button" onClick={() => abrirCuenta(c)} className="flex min-h-11 items-center gap-2 border-b py-2 text-left">
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="truncate text-[13px] font-semibold">{c.nombre}</b>
                <small className="text-xs text-muted-foreground">últ. mov. {fcorta(c.ultimoMovimiento)}{c.moneda === "USD" && c.saldoUsd != null ? ` · USD ${nf(c.saldoUsd)}` : ""}</small>
              </span>
              <span className="flex flex-col items-end gap-0.5">
                <b className="text-[13px] tabular-nums">{f.mon({ ars: c.saldoArs })}</b>
                <EtiquetaCuenta c={c} />
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          ))}
          <div className="flex items-center justify-between border-b py-2 text-[13px] font-semibold">
            <span>Total disponible</span>
            <span className="tabular-nums">{f.mon({ ars: tot })}</span>
          </div>
          {fuera.map((c) => (
            <button key={c.id} type="button" onClick={() => abrirCuenta(c)} className="flex min-h-11 items-center gap-2 border-b py-2 text-left text-muted-foreground">
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="truncate text-[13px] font-semibold">{c.nombre}</b>
                <small className="text-xs">{c.nota.split(".")[0]}</small>
              </span>
              <span className="flex flex-col items-end gap-0.5">
                <span className="text-[13px] tabular-nums">{f.mon({ ars: c.saldoArs })}</span>
                <small className="text-[11px]">fuera del total</small>
              </span>
            </button>
          ))}
        </div>

        <div className="mt-2.5 flex items-center gap-1.5 text-[12.5px] text-(--dir-bien)">
          <Check className="size-[13px]" aria-hidden />
          <span>
            Total de las cuentas confiables <b className="tabular-nums">{f.mon({ ars: tot })}</b> = la cifra de Caja disponible.{aVerificar.length ? " Lo punteado no se suma." : ""}
          </span>
        </div>
      </Seccion>

      <SeccionFlujo d={d} escenario={escenario} setEscenario={setEscenario} puedeEditar={puedeEditar} abrirSemana={abrirSemana} />

      <div className="flex flex-col gap-1 px-0.5 pb-2 text-xs text-muted-foreground">
        <span>
          <b className="font-semibold text-foreground">Regla:</b> un saldo va con IVA y al dólar de hoy{f.tc ? ` (${nf(f.tc.valor, 2)})` : ""}. Una cuenta sin movimientos hace más de 30 días se marca
          &quot;quieta&quot;; si además supera el 5 % del total, queda a verificar y se excluye{aVerificar.length ? ` (así se detectó ${aVerificar.map((c) => nombreCorto(c.nombre)).join(" y ")})` : ""}.
        </span>
        <span>Las cuentas a verificar, los cheques y el arqueo se corrigen en Odoo, por administración.</span>
      </div>
    </>
  );
}

function SeccionFlujo({
  d,
  escenario,
  setEscenario,
  puedeEditar,
  abrirSemana,
}: {
  d: DetalleCaja;
  escenario: Escenario;
  setEscenario: (e: Escenario) => void;
  puedeEditar: boolean;
  abrirSemana: (n: number) => void;
}) {
  const f = useFormato();
  const filas = d.flujo.escenarios[escenario];
  const cob = d.flujo.cobertura[escenario];
  const colchon = d.flujo.colchon.ars;
  const fuera = [...d.flujo.fuera, ...(d.reservado?.fuera ?? [])];
  const sinRetiros = !d.reservado;
  const minimo = filas.reduce((a, s) => (s.pesos < a.pesos ? s : a), filas[0]);
  const ult = filas[filas.length - 1];
  const resumen = ult
    ? `Flujo de 8 semanas, escenario ${ESCENARIOS[escenario]}: la plata en pesos va de ${f.mon({ ars: d.flujo.saldoInicialPesosArs })} a ${f.mon({ ars: ult.pesos })}; el saldo total de ${f.mon({ ars: d.flujo.saldoInicialArs })} a ${f.mon({ ars: ult.saldo })}.`
    : "Flujo de 8 semanas";

  const der = (
    <>
      <select
        aria-label="Escenario"
        value={escenario}
        onChange={(e) => setEscenario(e.target.value as Escenario)}
        className="h-7 rounded-md border bg-background px-2 text-xs max-md:h-11"
      >
        {(Object.keys(ESCENARIOS) as Escenario[]).map((k) => (
          <option key={k} value={k}>{ESCENARIOS[k]}</option>
        ))}
      </select>
      <span>
        Colchón mínimo en pesos: <b className="tabular-nums">{colchon > 0 ? f.mon({ ars: colchon }) : "Sin dato"}</b>
        {!d.flujo.colchon.editado && colchon > 0 && <span className="text-muted-foreground"> 1 mes de sueldos</span>}
      </span>
      {puedeEditar && d.flujo.colchon.sugeridoArs > 0 && <EditarColchon colchonArs={colchon} sugeridoArs={d.flujo.colchon.sugeridoArs} supuestos={d.flujo.supuestos} />}
    </>
  );

  return (
    <Seccion titulo="Próximas 8 semanas" der={der}>
      <div className="flex flex-col gap-2">
        {d.flujo.faltantes.length > 0 && <Aviso>El flujo no incluye {d.flujo.faltantes.join(", ")}: Odoo no respondió esa consulta. Probá &quot;Actualizar ahora&quot; en unos minutos.</Aviso>}
        {!(colchon > 0) ? (
          <Aviso>No pudimos calcular el colchón mínimo (faltan los sueldos promedio), así que no hay cobertura.</Aviso>
        ) : cob.mas ? (
          <Aviso tono="gris">
            En el escenario {ESCENARIOS[escenario].toLowerCase()} la plata en pesos no baja del mínimo en las 8 semanas.
            {minimo && (
              <>
                {" "}El punto más bajo es <b className="tabular-nums">{f.mon({ ars: minimo.pesos })}</b> (semana del {fcorta(minimo.desde)}).
              </>
            )}
          </Aviso>
        ) : (
          <Aviso>
            En la semana del <b>{fcorta(filas[cob.cae ?? 0]?.desde)}</b> la plata en pesos queda en {f.mon({ ars: cob.pesosCae ?? 0 })},{" "}
            <b className="tabular-nums">{f.mon({ ars: cob.faltaArs ?? 0 })}</b> debajo del colchón mínimo.
            {escenario === "comprometido" ? " Este escenario no cuenta la cobranza que todavía no tiene fecha." : ""}
          </Aviso>
        )}
      </div>

      <div className="mt-2.5 max-md:hidden">
        <GraficoFlujo filas={filas} saldoInicial={d.flujo.saldoInicialArs} saldoInicialPesos={d.flujo.saldoInicialPesosArs} colchon={colchon} resumen={resumen} onSemana={abrirSemana} />
      </div>
      <div className="mt-2.5 md:hidden">
        <FlujoFilas filas={filas} colchon={colchon} onSemana={abrirSemana} />
      </div>

      <div className="mt-3 overflow-x-auto max-md:hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b text-left text-[11.5px] text-muted-foreground">
              <th className="py-1.5 pr-3 font-medium">Semana</th>
              <th className="py-1.5 pr-3 text-right font-medium">Entra</th>
              <th className="py-1.5 pr-3 text-right font-medium">Sale</th>
              <th className="py-1.5 pr-3 text-right font-medium">Neto</th>
              <th className="py-1.5 pr-3 text-right font-medium">Saldo en pesos</th>
              <th className="py-1.5 pr-3 text-right font-medium">Saldo total</th>
              <th className="w-5" />
            </tr>
          </thead>
          <tbody>
            {filas.map((s) => {
              const bajo = colchon > 0 && s.pesos < colchon;
              return (
                <tr key={s.n} onClick={() => abrirSemana(s.n)} className="cursor-pointer border-b hover:bg-muted/50">
                  <td className="py-1.5 pr-3">
                    <button type="button" onClick={(e) => { e.stopPropagation(); abrirSemana(s.n); }} className="hover:underline">
                      S{s.n} · {s.etiqueta}
                    </button>
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{f.mon({ ars: s.entra })}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{f.mon({ ars: s.sale })}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{f.mon({ ars: s.entra - s.sale })}</td>
                  <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">
                    {bajo && <span className="text-(--dir-aten)" aria-label="debajo del colchón">▲ </span>}
                    {f.mon({ ars: s.pesos })}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{f.mon({ ars: s.saldo })}</td>
                  <td><ChevronRight className="size-3.5 text-muted-foreground" aria-hidden /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {fuera.length > 0 && (
        <details className="group mt-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold md:min-h-0">
            <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
            Queda fuera del flujo, a decidir ({fuera.length})
          </summary>
          <div className="mt-1.5 flex flex-col">
            {fuera.map((x) => (
              <div key={x.id} className="flex items-start gap-3 border-b py-2 last:border-b-0">
                <span className="flex min-w-0 flex-1 flex-col">
                  <b className="text-[13px] font-semibold">{x.concepto}</b>
                  <small className="text-xs text-muted-foreground"><TextoFrase frase={x.nota} /></small>
                </span>
                <span className="text-[13px] font-semibold whitespace-nowrap tabular-nums">{f.mon({ ars: x.ars })}</span>
              </div>
            ))}
          </div>
        </details>
      )}
      <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        Es una proyección de ritmo, no un presupuesto. Se mide sobre los pesos: el dólar billete es reserva. No incluye cheques que todavía no recibimos{sinRetiros ? " ni los retiros de socios" : ""}.
      </p>
    </Seccion>
  );
}
