"use client";

// "Calidad de los datos" (diseno.md §4.7, maqueta renderPanelCalidad): lo que hoy hace que
// un número no sea confiable. Viene del registro de Datos (avisos automáticos + manuales),
// ya recortado por el servidor (los de retiros sólo a socios). Tocar uno abre Datos con ese
// aviso abierto. Sin avisos: "Todos los datos al día" con la hora de la lectura.
// Celular: una sola fila con el conteo que lleva a Datos.

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { flarga, instanteCorto } from "@/lib/direccion/formato";
import type { Aviso, Frase, NivelAviso } from "@/lib/direccion/tipos";
import { cn } from "@/lib/utils";
import { useQueryMoneda } from "../contexto";
import { EstadoVacio } from "../estados";
import { TextoFrase } from "../piezas";

const SIMBOLO: Record<NivelAviso, { icono: string; etiqueta: string; clase: string }> = {
  ver: { icono: "⚠", etiqueta: "A verificar", clase: "text-(--dir-aten)" },
  inc: { icono: "◐", etiqueta: "Incompleto", clase: "text-muted-foreground" },
  inf: { icono: "●", etiqueta: "Informativo", clase: "text-muted-foreground" },
};

/** Sin cifras tocables: el renglón entero ya es un link. */
const plana = (f: Frase): Frase => f.map((p) => (typeof p === "string" ? p : { valor: p.valor }));

export function PanelCalidad({ avisos, tomadoAt }: { avisos: Aviso[]; tomadoAt: string }) {
  const q = useQueryMoneda();
  const sep = q ? "&" : "?";
  const base = `/direccion/datos${q}`;
  const ver = avisos.filter((a) => a.nivel === "ver").length;

  if (!avisos.length) {
    return (
      <section aria-label="Calidad de los datos" className="rounded-lg border bg-card px-4 py-3.5 shadow-(--dir-sombra-1)">
        <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Calidad de los datos</h2>
        <EstadoVacio positivo titulo="Todos los datos al día." texto={`Lectura del ${instanteCorto(tomadoAt)}`} />
      </section>
    );
  }

  return (
    <>
      <Link
        href={`${base}${sep}tab=cal`}
        className="flex min-h-14 items-center gap-2.5 rounded-lg border bg-card px-4 py-3 shadow-(--dir-sombra-1) md:hidden"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="text-sm font-semibold">Calidad de los datos</b>
          <small className="text-xs text-muted-foreground">{ver} a verificar · {avisos.length - ver} incompletos o informativos</small>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>

      <section aria-label="Calidad de los datos" className="rounded-lg border bg-card px-4 py-3.5 shadow-(--dir-sombra-1) max-md:hidden">
        <h2 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Calidad de los datos
          <span className="ml-auto text-xs font-medium normal-case tracking-normal">{ver} a verificar · {avisos.length - ver} más</span>
        </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-x-4">
          {avisos.slice(0, 6).map((a) => {
            const s = SIMBOLO[a.nivel];
            return (
              <Link
                key={a.id}
                href={`${base}${sep}aviso=${encodeURIComponent(a.id)}`}
                className="flex items-start gap-2 border-t py-2 text-[13px] leading-snug hover:bg-muted/50 [&:nth-child(-n+2)]:border-t-0"
              >
                <span className={cn("w-4 shrink-0 text-center", s.clase)} title={s.etiqueta}>
                  <span aria-hidden>{s.icono}</span>
                  <span className="sr-only">{s.etiqueta}: </span>
                </span>
                <span className="min-w-0">
                  <TextoFrase frase={plana(a.aviso)} />
                  <small className="block text-xs text-muted-foreground">{a.desde ? `desde ${flarga(a.desde)}` : a.quien}</small>
                </span>
              </Link>
            );
          })}
        </div>
        <Link href={`${base}${sep}tab=cal`} className="mt-1.5 inline-block text-[13px] font-medium text-primary hover:underline">
          Ver todo ({avisos.length}) →
        </Link>
      </section>
    </>
  );
}
