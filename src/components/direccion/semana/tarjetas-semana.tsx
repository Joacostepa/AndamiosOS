"use client";

// Las tarjetas de La semana (diseno.md §4.4–4.5, maqueta tarjetasSemana): seis preguntas y,
// sólo con direccion-socios, Retiros a todo el ancho. Sin el permiso la cifra de retiros no
// llega del servidor y la tarjeta no se renderiza (ni su lugar vacío): la grilla queda en 6.
// En La semana no se muestran chips de comparación sin dato (el motivo está en la (i)).

import { Lock } from "lucide-react";
import { montoEn, pct } from "@/lib/direccion/formato";
import type { DetalleSemana } from "@/lib/direccion/calculo/semana-armar";
import type { Cifra, Comparacion } from "@/lib/direccion/tipos";
import { cn } from "@/lib/utils";
import { BarraTramos } from "../barras";
import { useFormato } from "../contexto";
import { TarjetaPregunta } from "../tarjetas";

const ORDEN = ["semana_caja", "semana_cobertura", "semana_vencido_30", "semana_facturado", "semana_dev_vencida", "semana_resultado"] as const;

export function ChipNeutro({ children, sd }: { children: React.ReactNode; sd?: boolean }) {
  return (
    <span className={cn("inline-flex min-h-[21px] items-center rounded-full px-2 py-0.5 text-[11.5px] font-semibold leading-tight tabular-nums", sd ? "border border-dashed text-muted-foreground" : "bg-(--dir-neutro-bg) text-(--dir-neutro-text)")}>
      {children}
    </span>
  );
}

/** Columnas de los últimos 12 meses, el mes en curso en coral (= "ahora"). */
export function SparkMeses({ serie, alto = 34 }: { serie: NonNullable<DetalleSemana["facturado"]>["serie"]; alto?: number }) {
  const f = useFormato();
  const vals = serie.map((s) => Math.max(0, montoEn(s.monto, f.moneda, f.tc) ?? 0));
  const max = Math.max(...vals, 0);
  if (!serie.length || max <= 0) return null;
  const W = 240, H = 34, w = W / vals.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} height={alto} preserveAspectRatio="none" className={cn("w-full", alto === 34 && "max-w-[240px]")} role="img" aria-label="Facturado neto de los últimos 12 meses; el último, en curso">
      {vals.map((v, i) => (
        <rect key={serie[i].mes} x={i * w + 1} y={H - (v / max) * H} width={Math.max(1, w - 3)} height={(v / max) * H} rx={1.5}
          className={serie[i].enCurso ? "fill-primary" : "fill-(--dir-serie)"} />
      ))}
    </svg>
  );
}

/** Plata en pesos al cierre de cada una de las 8 semanas, con la línea del colchón mínimo. */
export function SparkFlujo({ c, alto = 34 }: { c: NonNullable<DetalleSemana["cobertura"]>; alto?: number }) {
  if (!c.spark.length) return null;
  const colchon = c.colchonArs ?? 0;
  const max = Math.max(...c.spark.map((s) => s.pesos), colchon, 1) * 1.05;
  const W = 240, H = 34, w = W / Math.max(8, c.spark.length);
  const h = (v: number) => (Math.max(0, v) / max) * H;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} height={alto} preserveAspectRatio="none" className={cn("w-full", alto === 34 && "max-w-[240px]")} role="img" aria-label={`Plata en pesos proyectada, ${c.spark.length} semanas`}>
      {c.spark.map((s, i) => (
        <rect key={s.n} x={i * w + 2} y={H - h(s.pesos)} width={w - 5} height={h(s.pesos)} rx={1.5}
          className={c.colchonArs != null && s.pesos < colchon ? "fill-(--dir-aten)" : "fill-(--dir-serie)"} />
      ))}
      {c.colchonArs != null && <line x1={0} x2={W} y1={H - h(colchon)} y2={H - h(colchon)} className="stroke-foreground/50" strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

export function TarjetasSemana({ cifras, detalle, metas }: { cifras: Cifra[]; detalle: DetalleSemana; metas: Record<string, number> }) {
  const f = useFormato();
  const por = new Map(cifras.map((c) => [c.id ?? c.kpi, c]));
  const t = detalle.titulos;

  const extra = (id: string): { mini?: React.ReactNode; chipsExtra?: React.ReactNode; cifra?: Cifra } => {
    const c = por.get(id);
    if (!c || c.valor.tipo === "sin_dato") return {};
    switch (id) {
      case "semana_cobertura": {
        // Con direccion-socios, el flujo con retiros; sin el permiso, el público.
        const cob = detalle.reservado?.cobertura ?? detalle.cobertura;
        return { mini: cob ? <SparkFlujo c={cob} /> : undefined };
      }
      case "semana_vencido_30":
        return {
          chipsExtra: detalle.cobranzas?.pctPorCobrar != null ? <ChipNeutro>{pct(detalle.cobranzas.pctPorCobrar)} del por cobrar</ChipNeutro> : undefined,
          mini: detalle.cobranzas?.tramos.length ? <BarraTramos tramos={detalle.cobranzas.tramos} /> : undefined,
        };
      case "semana_facturado": {
        const fa = detalle.facturado;
        if (!fa) return {};
        // La comparación sigue a la moneda elegida: en pesos, la de pesos.
        const comps: Comparacion[] = f.moneda === "ARS" && fa.comparacionArs ? [fa.comparacionArs] : (c.comparaciones ?? []);
        const dSin = fa.sinMayor ? (f.moneda === "ARS" ? fa.sinMayor.deltaArs : fa.sinMayor.deltaUsd) : null;
        return {
          cifra: { ...c, comparaciones: comps },
          chipsExtra: fa.sinMayor && dSin != null ? <ChipNeutro>{dSin >= 0 ? "▲" : "▼"} {pct(Math.abs(dSin))} sin {fa.sinMayor.cliente}</ChipNeutro> : undefined,
          mini: <SparkMeses serie={fa.serie} />,
        };
      }
      default:
        return {};
    }
  };

  const retiros = por.get("semana_retiros");
  const r = detalle.reservado?.retiros;

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 min-[1100px]:grid-cols-3">
      {ORDEN.map((id) => {
        const c = por.get(id);
        if (!c) return null;
        const x = extra(id);
        return (
          <TarjetaPregunta
            key={id}
            cifra={x.cifra ?? c}
            pregunta={t[id]?.pregunta}
            titulo={t[id]?.titulo}
            unidadExtra={t[id]?.unidadExtra}
            chipsExtra={x.chipsExtra}
            mini={x.mini}
            meta={metas[c.kpi] ?? null}
            ocultarChipsSinDato
          />
        );
      })}
      {retiros && (
        <TarjetaPregunta
          cifra={retiros}
          ancha
          pregunta="Retiros de socios 🔒"
          titulo={r?.titulo ?? "Retirado en el año (incluye dividendos)"}
          chipsExtra={
            r ? (
              <>
                {r.pctResultado != null && <ChipNeutro>{pct(r.pctResultado, 1)} del resultado de gestión</ChipNeutro>}
                {r.mesesSinDolarizar.length > 0 && (
                  <ChipNeutro sd>
                    <Lock className="mr-1 size-3" aria-hidden />
                    {r.mesesSinDolarizar.length} {r.mesesSinDolarizar.length === 1 ? "mes" : "meses"} sin pasar a dólares
                  </ChipNeutro>
                )}
              </>
            ) : undefined
          }
          meta={metas.retiros ?? null}
          ocultarChipsSinDato
        />
      )}
    </div>
  );
}
