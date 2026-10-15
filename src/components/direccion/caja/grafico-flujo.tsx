"use client";

// Gráfico del flujo de 8 semanas (diseno.md §5.1, maqueta graficoFlujo): arriba el saldo en
// pesos (línea llena) y el total con el dólar billete (punteada), con la línea del colchón
// mínimo y la banda ámbar debajo; abajo, barras divergentes de lo que entra y lo que sale.
// Cada columna abre el desglose de su semana. En el celular pasa a 8 filas (FlujoFilas).
// Tiene una tabla equivalente oculta para lector de pantalla.

import { fcorta, fmtMon, montoEn } from "@/lib/direccion/formato";
import type { FilaFlujo } from "@/lib/direccion/calculo/caja-reglas";
import { useFormato } from "../contexto";

type Props = {
  filas: FilaFlujo[];
  saldoInicial: number;
  saldoInicialPesos: number;
  colchon: number;
  resumen: string;
  onSemana: (n: number) => void;
};

export function GraficoFlujo({ filas, saldoInicial, saldoInicialPesos, colchon, resumen, onSemana }: Props) {
  const f = useFormato();
  const conv = (ars: number) => montoEn({ ars }, f.moneda, f.tc);
  const W = 760, H1 = 150, H2 = 110, top = 14, L = 70, R = 14, gap = 26;
  const w = (W - L - R) / Math.max(1, filas.length);
  const maxS = Math.max(saldoInicial, colchon, ...filas.map((s) => s.saldo)) * 1.05 || 1;
  const minS = Math.min(0, saldoInicialPesos, ...filas.map((s) => s.pesos));
  const y1 = (v: number) => top + H1 - ((v - minS) / (maxS - minS)) * H1;
  const maxF = Math.max(1, ...filas.map((s) => Math.max(s.entra, s.sale))) * 1.1;
  const z = top + H1 + gap + H2 / 2;
  const y2 = (v: number) => (v / maxF) * (H2 / 2);
  const xc = (i: number) => L + w * i + w / 2;
  const ptsP = [[L, y1(saldoInicialPesos)], ...filas.map((s, i) => [xc(i), y1(s.pesos)])];
  const ptsT = [[L, y1(saldoInicial)], ...filas.map((s, i) => [xc(i), y1(s.saldo)])];
  const ym = colchon > 0 ? y1(colchon) : null;
  const ult = filas[filas.length - 1];
  const etiquetaTick = (ars: number) => {
    const v = conv(ars);
    return v == null ? "" : fmtMon(v, f.moneda).replace(`${f.moneda} `, "");
  };
  const ticks = [minS, (minS + maxS) / 2, maxS];
  return (
    <>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${top + H1 + gap + H2 + 34}`} role="img" aria-label={resumen} className="block w-full min-w-[560px] text-[10.5px]">
          {ticks.map((v, i) => (
            <g key={i}>
              <line x1={L} x2={W - R} y1={y1(v)} y2={y1(v)} className="stroke-border" strokeWidth={1} />
              <text x={L - 6} y={y1(v) + 3} textAnchor="end" className="fill-muted-foreground tabular-nums">{etiquetaTick(v)}</text>
            </g>
          ))}
          {ym != null && (
            <>
              <rect x={L} y={ym} width={W - L - R} height={Math.max(0, top + H1 - ym)} style={{ fill: "var(--dir-aten-bg)" }} opacity={0.7} />
              <line x1={L} x2={W - R} y1={ym} y2={ym} style={{ stroke: "var(--dir-aten)" }} strokeWidth={1.5} strokeDasharray="5 4" />
              <text x={W - R} y={ult && Math.abs(y1(ult.pesos) - ym) < 16 ? ym + 14 : ym - 4} textAnchor="end" style={{ fill: "var(--dir-aten)" }} className="font-semibold">
                colchón mínimo
              </text>
            </>
          )}
          <polyline points={ptsT.map((p) => p.join(",")).join(" ")} fill="none" className="stroke-muted-foreground" strokeWidth={1.5} strokeDasharray="3 3" />
          {ult && (
            <text x={xc(filas.length - 1) + 4} y={y1(ult.saldo) - 6} textAnchor="end" className="fill-muted-foreground">
              total (con dólar billete)
            </text>
          )}
          <polyline points={ptsP.map((p) => p.join(",")).join(" ")} fill="none" className="stroke-foreground" strokeWidth={2} />
          {filas.map((s, i) => {
            const bajo = colchon > 0 && s.pesos < colchon;
            return (
              <circle key={s.n} cx={xc(i)} cy={y1(s.pesos)} r={4} className={bajo ? "" : "fill-foreground"} style={bajo ? { fill: "var(--dir-aten)" } : undefined}>
                <title>{`S${s.n}: pesos ${f.mon({ ars: s.pesos })} · total ${f.mon({ ars: s.saldo })}`}</title>
              </circle>
            );
          })}
          {filas[0] && (
            <text x={xc(0)} y={y1(filas[0].pesos) - 9} textAnchor="middle" className="fill-foreground font-semibold">
              en pesos
            </text>
          )}
          <line x1={L} x2={W - R} y1={z} y2={z} className="stroke-border" strokeWidth={1} />
          <text x={L - 6} y={z - H2 / 2 + 8} textAnchor="end" className="fill-muted-foreground">▲ entra</text>
          <text x={L - 6} y={z + H2 / 2} textAnchor="end" className="fill-muted-foreground">▼ sale</text>
          {filas.map((s, i) => (
            <g key={s.n}>
              <rect x={xc(i) - w * 0.3} y={z - y2(s.entra)} width={w * 0.6} height={y2(s.entra)} rx={2} style={{ fill: "var(--dir-entra)" }} />
              <rect x={xc(i) - w * 0.3} y={z} width={w * 0.6} height={y2(s.sale)} rx={2} style={{ fill: "var(--dir-serie)" }} />
              <text x={xc(i)} y={z + H2 / 2 + 16} textAnchor="middle" className="fill-foreground font-semibold">S{s.n}</text>
              <text x={xc(i)} y={z + H2 / 2 + 29} textAnchor="middle" className="fill-muted-foreground">{fcorta(s.desde)}</text>
              <rect
                x={L + w * i}
                y={top}
                width={w}
                height={H1 + gap + H2}
                fill="transparent"
                className="cursor-pointer hover:fill-[color-mix(in_srgb,var(--foreground)_4%,transparent)]"
                onClick={() => onSemana(s.n)}
              >
                <title>{`S${s.n} ${s.etiqueta}: entra ${f.mon({ ars: s.entra })}, sale ${f.mon({ ars: s.sale })}`}</title>
              </rect>
            </g>
          ))}
        </svg>
      </div>
      <table className="sr-only">
        <caption>{resumen}</caption>
        <thead>
          <tr><th>Semana</th><th>Entra</th><th>Sale</th><th>En pesos</th></tr>
        </thead>
        <tbody>
          {filas.map((s) => (
            <tr key={s.n}><td>S{s.n} {s.etiqueta}</td><td>{f.mon({ ars: s.entra })}</td><td>{f.mon({ ars: s.sale })}</td><td>{f.mon({ ars: s.pesos })}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** En el celular: 8 filas con la barra de la plata en pesos y la marca del colchón. */
export function FlujoFilas({ filas, colchon, onSemana }: Pick<Props, "filas" | "colchon" | "onSemana">) {
  const f = useFormato();
  const max = Math.max(1, colchon, ...filas.map((s) => s.pesos)) * 1.05;
  return (
    <div>
      <div className="flex flex-col">
        {filas.map((s) => {
          const bajo = colchon > 0 && s.pesos < colchon;
          return (
            <button key={s.n} type="button" onClick={() => onSemana(s.n)} className="flex min-h-11 items-center gap-2.5 border-b py-1.5 text-left last:border-b-0">
              <span className="w-[58px] shrink-0 text-xs text-muted-foreground">S{s.n} {fcorta(s.desde)}</span>
              <span className="relative h-3.5 flex-1 rounded-[3px] bg-muted">
                <i className="absolute inset-y-0 left-0 rounded-[3px]" style={{ width: `${Math.max(0, (s.pesos / max) * 100)}%`, background: bajo ? "var(--dir-aten)" : "var(--dir-serie)" }} />
                {colchon > 0 && <i className="absolute -inset-y-[3px] w-0.5" style={{ left: `${(colchon / max) * 100}%`, background: "var(--dir-aten)" }} />}
              </span>
              <span className="min-w-[86px] text-right text-[13px] font-semibold tabular-nums">{f.mon({ ars: s.pesos })}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm bg-(--dir-serie)" />plata en pesos al cierre de cada semana</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-0.5 bg-(--dir-aten)" />colchón mínimo</span>
      </div>
    </div>
  );
}
