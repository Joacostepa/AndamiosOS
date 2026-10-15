"use client";

// (i) "¿De dónde sale este número?" (§7.4). Escritorio: popover que abre con el mouse a los
// 400 ms (no por un roce) o con clic, que lo deja fijo. Celular: hoja chica desde abajo.
// El texto sale del diccionario (diccionario.ts): primero en castellano, lo técnico detrás
// de "Detalle técnico".

import Link from "next/link";
import { useState } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import type { DefIndicador } from "@/lib/direccion/diccionario";
import { nf } from "@/lib/direccion/formato";
import type { MarcaConfianza as TMarca } from "@/lib/direccion/tipos";
import { cn } from "@/lib/utils";
import { useDiccionario, useFormato, useQueryMoneda } from "./contexto";
import { MarcaConfianza } from "./piezas";

type Props = {
  kpi: string;
  /** La confianza de HOY (la del calculador). Si no viene, la del diccionario. */
  confianza?: TMarca;
  /** Meta vigente (Supabase). undefined/null = "sin acordar". */
  meta?: number | null;
  className?: string;
};

/** El cuerpo de la definición. `completo` = la versión de Datos y definiciones. */
export function DefinicionIndicador({ def, confianza, meta, completo }: { def: DefIndicador; confianza?: TMarca; meta?: number | null; completo?: boolean }) {
  const { tc } = useFormato();
  const qMoneda = useQueryMoneda();
  const conDolarHoy = /dólar de hoy|TC hoy/.test(def.regla) && tc;
  const k = "mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
  return (
    <div className="text-[13px] leading-snug">
      <p>{def.para}</p>
      <div className={k}>Cómo se calcula</div>
      <p>
        {def.calc}
        {conDolarHoy ? ` Dólar de hoy: ${nf(tc.valor, 2)}.` : ""}
      </p>
      {completo ? (
        <>
          <div className={k}>Fuente en Odoo (sólo lectura)</div>
          <p className="font-mono text-[11.5px] text-muted-foreground">{def.fuente}</p>
        </>
      ) : (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">Detalle técnico</summary>
          <p className="mt-1 font-mono text-[11.5px] text-muted-foreground">{def.fuente}</p>
        </details>
      )}
      {def.ojo && (
        <>
          <div className={k}>Ojo</div>
          <p>{def.ojo}</p>
        </>
      )}
      <div className={k}>Confianza · meta</div>
      <p>
        <MarcaConfianza nivel={confianza?.nivel ?? def.conf} motivo={confianza ? confianza.motivo : def.motivo} /> · Meta:{" "}
        {meta != null ? nf(meta) : "sin acordar"} · {def.pol}
      </p>
      {!completo && (
        <p className="mt-2">
          <Link href={`/direccion/datos${qMoneda}${qMoneda ? "&" : "?"}def=${def.id}`} className="text-[13px] font-medium underline underline-offset-2">
            Definición completa →
          </Link>
        </p>
      )}
    </div>
  );
}

export function BotonDefinicion({ kpi, confianza, meta, className }: Props) {
  const movil = useIsMobile();
  const [abierto, setAbierto] = useState(false);
  // Con lo reservado completo sólo para socios (lo manda el servidor, no viaja en el JS).
  const def = useDiccionario().def(kpi);
  if (!def) return null;
  const etiqueta = `¿De dónde sale este número? ${def.nombre}`;
  // Área táctil de 44 px aunque el ícono sea de 16 (§7.8).
  const clases = cn(
    "relative z-10 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring md:size-7",
    className,
  );

  if (movil) {
    return (
      <>
        <button type="button" aria-label={etiqueta} className={clases} onClick={() => setAbierto(true)}>
          <Info className="size-4" aria-hidden />
        </button>
        <Sheet open={abierto} onOpenChange={setAbierto}>
          <SheetContent side="bottom" className="max-h-[75dvh] overflow-y-auto rounded-t-2xl p-4">
            <SheetTitle>{def.nombre}</SheetTitle>
            <DefinicionIndicador def={def} confianza={confianza} meta={meta} />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger openOnHover delay={400} aria-label={etiqueta} className={clases}>
        <Info className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-3.5">
        <h4 className="text-sm font-semibold">{def.nombre}</h4>
        <DefinicionIndicador def={def} confianza={confianza} meta={meta} />
      </PopoverContent>
    </Popover>
  );
}
