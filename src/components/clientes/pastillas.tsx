"use client";

import { useEffect, useState } from "react";
import { Gem } from "lucide-react";
import { cn } from "@/lib/utils";
import { pastilla, type CharlaListada, type Tono } from "@/lib/clientes/vista";
import { textoVentana, ventana } from "@/lib/clientes/ventana";

// Las pastillas de la bandeja (docs/clientes/crm-propuesta.md §7): el estado de la charla y
// lo que le queda a la ventana de 24 h.

const TONOS: Record<Tono | "suave" | "gama", string> = {
  gris: "bg-muted text-muted-foreground",
  ambar: "bg-hd-ambar-bg text-hd-ambar",
  coral: "bg-hd-boton/15 text-hd-boton",
  rojo: "bg-hd-rojo-bg text-hd-rojo",
  suave: "border border-border text-muted-foreground",
  gama: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
};

export function Pastilla({ tono, children, className }: { tono: Tono | "suave" | "gama"; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 max-w-full shrink-0 items-center gap-1 truncate rounded-full px-2 text-[12px] font-medium whitespace-nowrap", TONOS[tono], className)}>
      {children}
    </span>
  );
}

export function PastillaEstado({ charla, yo, className }: { charla: Pick<CharlaListada, "estado" | "motivo" | "asistente">; yo: string; className?: string }) {
  const p = pastilla(charla, yo);
  return <Pastilla tono={p.tono} className={className}>{p.texto}</Pastilla>;
}

/** Pidió multidireccional: cliente de gama alta (lo marca el código). */
export function PastillaGamaAlta({ segmento }: { segmento: CharlaListada["segmento"] }) {
  if (segmento !== "gama_alta") return null;
  return (
    <Pastilla tono="gama" className="font-semibold">
      <Gem className="size-3" aria-hidden /> Gama alta
    </Pastilla>
  );
}

/** «ahora» que se mueve solo (la ventana baja aunque no llegue nada nuevo). */
export function useAhora(cadaMs = 30_000): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), cadaMs);
    return () => clearInterval(t);
  }, [cadaMs]);
  return ahora;
}

export function PastillaVentana({ ultimoEntranteAt, ahora, corta }: { ultimoEntranteAt: string | null; ahora: number; corta?: boolean }) {
  const v = ventana(ultimoEntranteAt, ahora);
  if (v.sinMensajes) return null;
  if (!v.abierta) return <Pastilla tono={corta ? "suave" : "rojo"}>{corta ? "24 h vencida" : textoVentana(ultimoEntranteAt, ahora)}</Pastilla>;
  const min = Math.max(1, Math.floor(v.restanteMs / 60_000));
  const corto = min < 60 ? `quedan ${min} min` : `quedan ${Math.floor(min / 60)} h`;
  return (
    <Pastilla tono={v.porVencer ? "ambar" : "suave"} className="tabular-nums">
      {corta ? corto : textoVentana(ultimoEntranteAt, ahora)}
    </Pastilla>
  );
}
