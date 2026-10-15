"use client";

// Gráficos de Socios (§5.5): retiros por mes contra el resultado de gestión, y el saldo
// acumulado de la cuenta particular en USD. SVG propio (como la maqueta), con los tokens
// de Dirección: claro y oscuro salen solos. Montos en la moneda elegida.

import { fmtMon, mesNombre, montoEn, nf } from "@/lib/direccion/formato";
import type { DetalleSocios } from "@/lib/direccion/calculo/socios";
import { cn } from "@/lib/utils";
import { useFormato } from "@/components/direccion";

function Leyenda({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground">{children}</div>;
}
function Marca({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <i aria-hidden className={cn("inline-block size-2.5 rounded-sm align-middle", className)} style={style} />;
}

export function GraficoRetirosMes({ d }: { d: DetalleSocios }) {
  const f = useFormato();
  const M = d.meses;
  const res = new Map(d.resultado.map((r) => [r.mes, r.gestion]));
  const val = (m: (typeof M)[number], k: "jorge" | "gabriel") => montoEn(m.socios[k].total, f.moneda, f.tc) ?? 0;
  const resV = (mes: string) => {
    const r = res.get(mes);
    return r ? montoEn(r, f.moneda, f.tc) : null;
  };
  const W = 520, H = 160, L = 8, top = 16;
  const w = (W - 2 * L) / Math.max(1, M.length);
  const max = Math.max(1, ...M.map((m) => Math.max(val(m, "jorge") + val(m, "gabriel"), resV(m.mes) ?? 0))) * 1.08;
  const y = (v: number) => top + H - (Math.max(0, v) / max) * H;
  const sobre = M.filter((m) => !m.parcial && resV(m.mes) != null && val(m, "jorge") + val(m, "gabriel") > resV(m.mes)!).map((m) => mesNombre(m.mes));
  const enCurso = M.find((m) => m.parcial);
  const etiqueta = `Retiros por mes de los dos socios contra el resultado de gestión de cada mes. ${sobre.length ? `Meses en que los retiros superaron el resultado: ${sobre.join(", ")}.` : "En ningún mes cerrado los retiros superaron el resultado."}${enCurso ? ` ${mesNombre(enCurso.mes)[0].toUpperCase()}${mesNombre(enCurso.mes).slice(1)} está en curso y no tiene sueldos devengados.` : ""}`;

  return (
    <section className="min-w-0 rounded-lg border bg-card p-4">
      <h3 className="mb-2 text-sm font-semibold">Retiros por mes contra el resultado</h3>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${top + H + 22}`} role="img" aria-label={etiqueta} className="min-w-[420px] text-[10px]">
          <defs>
            <pattern id="dir-rayado-socios" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="2" height="6" fill="var(--background)" opacity=".6" />
            </pattern>
          </defs>
          {M.map((m, i) => {
            const x = L + i * w;
            const a = val(m, "jorge");
            const b = val(m, "gabriel");
            const r = m.parcial ? null : resV(m.mes);
            const alto = top + H - y(a + b);
            return (
              <g key={m.mes}>
                <rect x={x + w * 0.2} y={y(a + b)} width={w * 0.6} height={alto} rx={2} fill="var(--dir-serie)">
                  <title>{`${m.etiqueta}: retiros ${fmtMon(a + b, f.moneda)} (Jorge ${fmtMon(a, f.moneda)}, Gabriel ${fmtMon(b, f.moneda)})${m.sinDolarizar ? " · sin pasar a dólares en Odoo" : ""}`}</title>
                </rect>
                {m.sinDolarizar && <rect x={x + w * 0.2} y={y(a + b)} width={w * 0.6} height={alto} fill="url(#dir-rayado-socios)" pointerEvents="none" />}
                {r != null && (
                  <circle cx={x + w / 2} cy={y(r)} r={3.5} fill={a + b > r ? "var(--dir-aten)" : "var(--card)"} stroke={a + b > r ? "var(--dir-aten)" : "var(--foreground)"} strokeWidth={2}>
                    <title>{`Resultado de gestión ${fmtMon(r, f.moneda)}`}</title>
                  </circle>
                )}
                <text x={x + w / 2} y={top + H + 14} textAnchor="middle" fill="var(--muted-foreground)">{m.etiqueta.slice(0, 3)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <Leyenda>
        <span><Marca style={{ background: "var(--dir-serie)" }} /> retiros + dividendos ({f.moneda})</span>
        <span><Marca className="rounded-full border-2 border-foreground bg-card" /> resultado de gestión</span>
        <span><Marca className="rounded-full" style={{ background: "var(--dir-aten)" }} /> el mes en que se retiró más que el resultado</span>
        {d.mesesSinDolarizar.length > 0 && <span><Marca className="dir-trama border border-(--dir-serie) text-muted-foreground" /> sin pasar a dólares en Odoo</span>}
        {enCurso && <span>{mesNombre(enCurso.mes)} en curso: sin resultado</span>}
      </Leyenda>
      {d.motivoResultado && <p className="mt-1.5 text-xs text-muted-foreground">Resultado: sin dato · {d.motivoResultado}</p>}
    </section>
  );
}

/** Saldo acumulado de la cuenta particular en USD: históricos anuales + dolarizaciones (real). */
export function GraficoAcumulado({ d }: { d: DetalleSocios }) {
  const [J, G] = d.socios;
  const series = [J, G].filter(Boolean);
  const n = Math.max(0, ...series.map((s) => s.acumulado.length));
  if (n < 2) {
    return (
      <section className="min-w-0 rounded-lg border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold">Saldo acumulado de cuenta particular (USD)</h3>
        <p className="text-sm text-muted-foreground">Sin dato · Odoo todavía no tiene retiros pasados a dólares.</p>
      </section>
    );
  }
  const W = 520, H = 150, L = 50, R = 70, top = 12;
  const max = Math.max(1, ...series.flatMap((s) => s.acumulado.map((p) => p.usd))) * 1.05;
  const x = (i: number) => L + (i * (W - L - R)) / (n - 1);
  const y = (v: number) => top + H - (v / max) * H;
  const ultimo = (s: (typeof series)[number]) => s.acumulado[s.acumulado.length - 1];
  const primero = series[0].acumulado[0]?.etiqueta;
  const fin = ultimo(series[0])?.etiqueta;
  const ejes = series[0].acumulado;
  return (
    <section className="min-w-0 rounded-lg border bg-card p-4">
      <h3 className="mb-2 text-sm font-semibold">Saldo acumulado de cuenta particular (USD, {primero} → {fin})</h3>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${top + H + 22}`}
          role="img"
          aria-label={`Saldo acumulado: ${series.map((s) => `${s.corto} USD ${nf(ultimo(s)?.usd ?? 0)}`).join(", ")} a ${fin}`}
          className="min-w-[420px] text-[10px]"
        >
          {[0, max / 2].map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--border)" />
              <text x={L - 6} y={y(v) + 3} textAnchor="end" fill="var(--muted-foreground)">{fmtMon(v, "USD").replace("USD ", "")}</text>
            </g>
          ))}
          {series.map((s, k) => (
            <g key={s.clave}>
              <polyline
                fill="none"
                strokeWidth={2}
                stroke={k === 0 ? "var(--foreground)" : "var(--muted-foreground)"}
                strokeDasharray={k === 0 ? undefined : "5 3"}
                points={s.acumulado.map((p, i) => `${x(i)},${y(p.usd)}`).join(" ")}
              />
              <text x={x(s.acumulado.length - 1) + 6} y={y(ultimo(s).usd) + 4} fill="var(--foreground)" fontWeight={k === 0 ? 600 : 400}>{s.corto}</text>
            </g>
          ))}
          {ejes.map((p, i) =>
            (/^\d{4}$/.test(p.etiqueta) && i % 2 === 0) || i === ejes.length - 1 || /^ene-/.test(p.etiqueta) ? (
              <text key={i} x={x(i)} y={top + H + 15} textAnchor="middle" fill="var(--muted-foreground)">{p.etiqueta}</text>
            ) : null,
          )}
        </svg>
      </div>
      {(() => {
        const cierra = series.every((s) => Math.abs((ultimo(s)?.usd ?? 0) - s.saldoUsdOdoo) < 2);
        return (
          <p className={cn("mt-2 text-xs", cierra ? "text-(--dir-bien)" : "text-muted-foreground")}>
            {cierra ? "✓ Cierra con el saldo en Odoo: " : "Saldo en Odoo: "}
            {series.map((s) => `${s.corto} USD ${nf(s.saldoUsdOdoo)}`).join(" · ")} (sin filtro de período)
          </p>
        );
      })()}
    </section>
  );
}
