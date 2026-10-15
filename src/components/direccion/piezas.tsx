"use client";

// Piezas chicas de Dirección: chip de comparación, marca de confianza, punto de meta, la
// cifra con su "Sin dato" y el texto con cifras tocables (narrativa, decisiones, avisos).

import { cn } from "@/lib/utils";
import { chip, marca } from "@/lib/direccion/formato";
import { cumpleMeta } from "@/lib/direccion/diccionario";
import type { Comparacion, Confianza, Frase, Valor } from "@/lib/direccion/tipos";
import { useDireccion, useFormato } from "./contexto";

const TONO_CHIP = {
  bien: "bg-(--dir-bien-bg) text-(--dir-bien)",
  mal: "bg-(--dir-mal-bg) text-(--dir-mal)",
  neutro: "bg-(--dir-neutro-bg) text-(--dir-neutro-text)",
  sd: "border border-dashed border-border bg-transparent font-medium text-muted-foreground",
} as const;

/** ▲ 12 % a igual día sep (§4.4). El color sale de la polaridad, nunca de la cifra. */
export function ChipComparacion({ comparacion, className }: { comparacion: Comparacion; className?: string }) {
  const c = chip(comparacion);
  return (
    <span
      title={c.titulo}
      className={cn("inline-flex min-h-[21px] max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold leading-tight tabular-nums", TONO_CHIP[c.tono], className)}
    >
      {c.texto}
    </span>
  );
}

const TONO_MARCA: Record<Confianza, string> = { ok: "text-(--dir-bien)", ver: "text-(--dir-aten)", inc: "text-muted-foreground" };

/** ✓ Confiable · ⚠ A verificar · ◐ Incompleto, con el motivo (§6.4). */
export function MarcaConfianza({ nivel, motivo, className }: { nivel: Confianza; motivo?: string; className?: string }) {
  const m = marca(nivel, motivo);
  return (
    <span className={cn("text-xs font-semibold", TONO_MARCA[nivel], className)}>
      <span aria-hidden>{m.icono}</span> {m.etiqueta}
      {m.motivo && <span className="font-normal text-muted-foreground"> · {m.motivo}</span>}
    </span>
  );
}

/** Punto verde/rojo SÓLO si hay meta acordada (sin meta no se inventa un semáforo). */
export function PuntoMeta({ kpi, valor, meta }: { kpi: string; valor: number | null | undefined; meta: number | null | undefined }) {
  const ok = cumpleMeta(kpi, valor, meta);
  if (ok == null) return null;
  return (
    <span
      role="img"
      aria-label={ok ? "Dentro de la meta" : "Fuera de la meta"}
      title={`${ok ? "Dentro de la meta" : "Fuera de la meta"} (${meta})`}
      className={cn("inline-block size-2 rounded-full", ok ? "bg-(--dir-bien)" : "bg-(--dir-mal)")}
    />
  );
}

/** Una cifra formateada. "Sin dato" en gris con el motivo en el título; nunca 0. */
export function ValorCifra({ valor, className }: { valor: Valor; className?: string }) {
  const f = useFormato();
  const sd = valor.tipo === "sin_dato";
  return (
    <span className={cn("tabular-nums", sd && "text-muted-foreground", className)} title={sd ? valor.motivo : undefined}>
      {f.valor(valor)}
    </span>
  );
}

/**
 * Texto con cifras tocables: cada cifra con `kpi` o `nodo` abre su desglose exacto (§4.3:
 * "el número que se toca es el número que se ve arriba del panel").
 */
export function TextoFrase({ frase, className }: { frase: Frase; className?: string }) {
  const f = useFormato();
  const { abrirNodo } = useDireccion();
  return (
    <span className={className}>
      {frase.map((p, i) => {
        if (typeof p === "string") return <span key={i}>{p}</span>;
        const texto = f.valor(p.valor);
        const ref = p.nodo ?? (p.kpi ? { tipo: p.kpi } : null);
        if (!ref) return <span key={i} className="font-semibold tabular-nums">{texto}</span>;
        return (
          <button
            key={i}
            type="button"
            onClick={() => abrirNodo(ref)}
            className="font-semibold tabular-nums underline decoration-dotted decoration-[1.5px] underline-offset-[3px] hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
          >
            {texto}
          </button>
        );
      })}
    </span>
  );
}
