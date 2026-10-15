"use client";

// GraficoMeses (§5.2 y §8.3): columnas de facturado neto de 12 meses, neutras; el mes en curso
// en coral ("ahora") y el período elegido en coral atenuado. Encima del mes en curso, la
// banda de ritmo: arranca en el tope de la barra (punteado) y el rango probable de cierre va
// rayado. Sin proyección lineal. Tocar un mes lo elige. En el celular el gráfico se desplaza
// dentro de su caja (la página no).

import { useId } from "react";
import { fmtMon, montoEn, nf } from "@/lib/direccion/formato";
import type { DetalleVentas } from "@/lib/direccion/calculo/ventas-armar";
import type { Monto } from "@/lib/direccion/tipos";
import { useFormato } from "../contexto";
import { useIrAPeriodo } from "./selector-periodo";

const corto = (v: number | null, moneda: "USD" | "ARS") => fmtMon(v, moneda).replace(`${moneda} `, "").replace(" k", "k").replace(" M", "M");

export function GraficoMeses({ detalle }: { detalle: Pick<DetalleVentas, "serie" | "banda" | "promedioCerrados"> }) {
  const f = useFormato();
  const { ir } = useIrAPeriodo();
  const idRayado = `rayado-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const val = (mm: Monto) => montoEn(mm, f.moneda, f.tc) ?? 0;
  const vals = detalle.serie.map((x) => ({ ...x, v: val(x.monto) }));
  const b = detalle.banda;
  const bandaMin = b ? (f.moneda === "USD" ? b.minUsd : b.minArs) : null;
  const bandaMax = b ? (f.moneda === "USD" ? b.maxUsd : b.maxArs) : null;
  const prom = detalle.promedioCerrados ? val(detalle.promedioCerrados) : null;
  const max = Math.max(1, ...vals.map((x) => x.v), bandaMax ?? 0) * 1.08;
  const W = 760;
  const H = 200;
  const L = 8;
  const TOP = 18;
  const w = (W - L * 2) / Math.max(1, vals.length);
  const y = (v: number) => TOP + H - (Math.max(0, v) / max) * H;
  const actual = vals.find((x) => x.enCurso);
  const resumen = `Facturado neto por mes. ${actual ? `${actual.etq} lleva ${fmtMon(actual.v, f.moneda)}${b ? ` al día ${b.dia}` : ""}. ` : ""}${prom != null ? `Promedio de los meses cerrados: ${fmtMon(prom, f.moneda)}.` : ""}`;

  return (
    <div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${TOP + H + 34}`} role="img" aria-label={resumen} className="block w-full min-w-[560px] overflow-visible md:min-w-[520px]">
          <defs>
            <pattern id={idRayado} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="2" height="6" className="fill-primary" opacity=".35" />
            </pattern>
          </defs>
          {prom != null && (
            <>
              <line x1={L} x2={W - L} y1={y(prom)} y2={y(prom)} className="stroke-border" strokeDasharray="3 3" />
              <text x={L} y={TOP - 4} className="fill-muted-foreground text-[10.5px] font-medium">- - promedio {fmtMon(prom, f.moneda)}</text>
            </>
          )}
          {vals.map((x, i) => {
            const cx = L + i * w;
            const alto = TOP + H - y(x.v);
            return (
              <g key={x.mes}>
                {x.enCurso && b && bandaMax != null && bandaMin != null && (
                  <>
                    <rect x={cx + w * 0.15} y={y(bandaMax)} width={w * 0.7} height={Math.max(0, y(x.v) - y(bandaMax))} fill="none" className="stroke-primary" strokeDasharray="3 2" />
                    <rect x={cx + w * 0.15} y={y(bandaMax)} width={w * 0.7} height={Math.max(0, y(bandaMin) - y(bandaMax))} fill={`url(#${idRayado})`} />
                  </>
                )}
                <rect
                  x={cx + w * 0.15}
                  y={y(x.v)}
                  width={w * 0.7}
                  height={Math.max(0, alto)}
                  rx={2}
                  className={x.enCurso ? "fill-primary" : x.sel ? "fill-[color-mix(in_srgb,var(--primary)_60%,var(--dir-serie))]" : "fill-(--dir-serie)"}
                />
                <text x={cx + w / 2} y={y(x.v) - 4} textAnchor="middle" className={x.sel ? "fill-foreground text-[10.5px] font-semibold" : "fill-muted-foreground text-[10.5px] font-medium"}>
                  {corto(x.v, f.moneda)}
                </text>
                <text x={cx + w / 2} y={TOP + H + 15} textAnchor="middle" className={x.sel ? "fill-foreground text-[10.5px] font-semibold" : "fill-muted-foreground text-[10.5px] font-medium"}>
                  {x.etq}
                </text>
                <rect
                  x={cx}
                  y={TOP}
                  width={w}
                  height={H + 20}
                  className="cursor-pointer fill-transparent hover:fill-[color-mix(in_srgb,var(--foreground)_6%,transparent)]"
                  onClick={() => ir(x.params)}
                >
                  <title>
                    {`${x.etq}: ${fmtMon(x.v, f.moneda)}${x.enCurso && b ? ` · al día ${b.dia}, un mes normal terminó entre ${nf((b.rLo - 1) * 100)} % y ${nf((b.rHi - 1) * 100)} % arriba (de los últimos ${b.meses}, sin el más alto ni el más bajo)` : ""}`}
                  </title>
                </rect>
              </g>
            );
          })}
        </svg>
      </div>
      {b && actual && bandaMin != null && bandaMax != null && (
        <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block size-2.5 rounded-sm bg-primary" aria-hidden />
            {actual.etq} en curso: <b className="font-semibold text-foreground">{fmtMon(actual.v, f.moneda)}</b> al día {b.dia}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="dir-trama inline-block size-2.5 rounded-sm border border-dashed border-primary text-primary" aria-hidden />
            si termina como un mes normal: <b className="font-semibold text-foreground">{fmtMon(bandaMin, f.moneda)} a {fmtMon(bandaMax, f.moneda)}</b>
          </span>
        </div>
      )}
      <table className="sr-only">
        <caption>{resumen}</caption>
        <tbody>
          {vals.map((x) => (
            <tr key={x.mes}>
              <td>{x.etq}</td>
              <td>{fmtMon(x.v, f.moneda)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
