"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConteosOrdenes, FiltroOrdenes } from "@/lib/tablero/tipos-orden";

// Chips de filtro con contador.
//
// POR QUÉ CHIPS Y NO UN <select>: el número es la mitad del valor. "9 críticas" avisa sin
// que nadie filtre; escondido dentro de un desplegable no avisa nada.
//
// Reemplazan al filtro por estado, que no discriminaba: 955 de 1003 OTs están completadas,
// así que filtrar por estado devolvía siempre la misma lista gigante.

const CHIPS: { id: FiltroOrdenes; label: string; tono: "normal" | "peligro" | "aviso" }[] = [
  { id: "abiertas", label: "Abiertas", tono: "normal" },
  { id: "critica", label: "Habilitación crítica", tono: "peligro" },
  { id: "proxima", label: "Programada sin habilitar", tono: "aviso" },
  { id: "sin_fecha", label: "Sin fecha", tono: "normal" },
  { id: "en_curso", label: "En curso", tono: "normal" },
  { id: "cerradas", label: "Cerradas", tono: "normal" },
];

const TONOS = {
  peligro: { bg: "#FDECEA", fg: "#B42318", borde: "#F3B9B2" },
  aviso: { bg: "#FAEEDA", fg: "#854F0B", borde: "#EFD9AE" },
  normal: { bg: "var(--muted)", fg: "var(--muted-foreground)", borde: "var(--border)" },
} as const;

export function ChipsFiltro({
  activo,
  conteos,
  onCambio,
}: {
  activo: FiltroOrdenes;
  conteos: ConteosOrdenes | undefined;
  onCambio: (f: FiltroOrdenes) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {CHIPS.map((c) => {
        const n = conteos?.[c.id];
        const seleccionado = activo === c.id;
        const tono = TONOS[c.tono];
        // Un chip de alerta en cero no es una alerta: se apaga al tono neutro para que el
        // rojo signifique siempre "hay algo".
        const enAlerta = c.tono !== "normal" && !!n;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onCambio(c.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
              seleccionado && "font-semibold",
            )}
            style={{
              backgroundColor: enAlerta ? tono.bg : seleccionado ? "var(--muted)" : "transparent",
              color: enAlerta ? tono.fg : "var(--foreground)",
              borderColor: seleccionado ? "var(--foreground)" : enAlerta ? tono.borde : "var(--border)",
            }}
            aria-pressed={seleccionado}
          >
            {enAlerta && c.tono === "peligro" && <AlertTriangle className="h-3 w-3" />}
            {c.label}
            <span className="tabular-nums opacity-70">{n ?? "…"}</span>
          </button>
        );
      })}
    </div>
  );
}
