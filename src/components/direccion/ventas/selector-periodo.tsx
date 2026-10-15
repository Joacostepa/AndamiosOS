"use client";

// SelectorPeriodo (§7.2): [◀ Octubre 2026 ▶] [Semana | Mes | Trimestre | Año | Personalizado] vs [▾].
// El período vive en la URL (?g=&p=&vs=, o desde/hasta en Personalizado): se puede compartir
// el link exacto. Los parámetros de cada opción los calcula el servidor (detalle.periodo), así
// el cliente no repite reglas de períodos. ← / → mueven el período si el foco no está en un campo.

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { flarga } from "@/lib/direccion/formato";
import type { PeriodoVista } from "@/lib/direccion/calculo/ventas-armar";
import type { Gran, Vs } from "@/lib/direccion/calculo/ventas-reglas";
import { cn } from "@/lib/utils";

const GRANULARIDADES: [Gran, string][] = [["semana", "Semana"], ["mes", "Mes"], ["trimestre", "Trimestre"], ["anio", "Año"], ["pers", "Personalizado"]];

/** Navegar a otro período conservando la moneda (y nada más de la URL vieja). */
export function useIrAPeriodo() {
  const router = useRouter();
  const pathname = usePathname();
  const q = useSearchParams();
  const [cargando, empezar] = useTransition();
  const ir = (params: Record<string, string> | null) => {
    if (!params) return;
    const u = new URLSearchParams(params);
    const moneda = q.get("moneda");
    if (moneda) u.set("moneda", moneda);
    empezar(() => router.push(`${pathname}?${u.toString()}`, { scroll: false }));
  };
  return { ir, cargando };
}

const campo = "h-8 rounded-md border border-input bg-card px-2 text-[13px] max-md:h-11 focus-visible:outline-2 focus-visible:outline-ring";

export function SelectorPeriodo({ periodo }: { periodo: PeriodoVista }) {
  const { ir, cargando } = useIrAPeriodo();
  const [desde, setDesde] = useState(periodo.desde);
  const [hasta, setHasta] = useState(periodo.finNat);

  // ← / → mueven el período (no dentro de un campo ni con el panel de desglose abierto).
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, select, textarea, [contenteditable], [role=dialog], aside")) return;
      if (e.key === "ArrowLeft" && periodo.anterior) ir(periodo.anterior);
      if (e.key === "ArrowRight" && periodo.siguiente) ir(periodo.siguiente);
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  function cambiarRango(d: string, h: string) {
    setDesde(d);
    setHasta(h);
    if (!d || !h) return;
    if (d > h) {
      toast("El rango no es válido", { description: "La fecha \"desde\" tiene que ser anterior a \"hasta\"." });
      return;
    }
    ir({ g: "pers", desde: d, hasta: h });
  }

  const vs = periodo.vsOpciones.find((o) => o.valor === periodo.vs);
  return (
    <div role="group" aria-label="Período" aria-busy={cargando} className={cn("flex flex-wrap items-center gap-1.5", cargando && "opacity-70")}>
      <div className="inline-flex items-center rounded-md border border-input bg-card">
        <button type="button" onClick={() => ir(periodo.anterior)} disabled={!periodo.anterior} aria-label="Período anterior" className="grid h-[30px] w-8 place-items-center disabled:opacity-35 max-md:h-11 max-md:w-11">
          <ChevronLeft className="size-[15px]" aria-hidden />
        </button>
        <span className="px-2 text-[13px] font-semibold whitespace-nowrap" aria-live="polite">{periodo.etq}</span>
        <button type="button" onClick={() => ir(periodo.siguiente)} disabled={!periodo.siguiente} aria-label="Período siguiente" className="grid h-[30px] w-8 place-items-center disabled:opacity-35 max-md:h-11 max-md:w-11">
          <ChevronRight className="size-[15px]" aria-hidden />
        </button>
      </div>
      <div role="group" aria-label="Granularidad" className="inline-flex flex-wrap rounded-md border border-input bg-card p-0.5 text-xs">
        {GRANULARIDADES.map(([g, t]) => (
          <button
            key={g}
            type="button"
            aria-pressed={periodo.g === g}
            onClick={() => (periodo.g === g ? undefined : ir(periodo.granularidades[g]))}
            className={cn("min-h-7 rounded px-2.5 font-semibold max-md:min-h-11", periodo.g === g ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
          >
            {t}
          </button>
        ))}
      </div>
      {periodo.g === "pers" && (
        <>
          <input type="date" aria-label="Desde" min={periodo.inicio} max={periodo.hoy} value={desde} onChange={(e) => cambiarRango(e.target.value, hasta)} className={campo} />
          <input type="date" aria-label="Hasta" min={periodo.inicio} max={periodo.hoy} value={hasta} onChange={(e) => cambiarRango(desde, e.target.value)} className={campo} />
        </>
      )}
      <span className="text-xs text-muted-foreground">vs</span>
      <select
        aria-label="Comparar con"
        value={periodo.vs}
        title={vs?.motivo}
        onChange={(e) => ir({ ...periodo.params, vs: e.target.value as Vs })}
        className={cn(campo, "max-w-[260px]")}
      >
        {periodo.vsOpciones.map((o) => (
          <option key={o.valor} value={o.valor} disabled={!o.disponible} title={o.motivo}>
            {o.etiqueta}
          </option>
        ))}
      </select>
      {periodo.enCurso && <span className="text-xs text-muted-foreground">en curso (día {periodo.transcurridos} de {periodo.total})</span>}
      {periodo.recortadoInicio && <span className="text-xs text-muted-foreground">· hay datos desde el {flarga(periodo.inicio)}</span>}
    </div>
  );
}
