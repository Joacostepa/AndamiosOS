"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConteosInformes, FiltroInformes } from "@/lib/informes-obra/tipos";

// Chips de filtro con contador, mismo lenguaje que los de /ordenes-trabajo.
//
// POR QUÉ CHIPS Y NO UN <select>: el número es la mitad del valor. "28 mal costeadas"
// avisa sin que nadie filtre; escondido en un desplegable no avisa nada. Y ese aviso es
// justamente para qué existe este módulo — son $183 millones facturados que hoy no ve
// nadie porque no hay pantalla donde aparecerían.

const CHIPS: { id: FiltroInformes; label: string; tono: "normal" | "peligro" | "aviso" }[] = [
  { id: "todas", label: "Todas", tono: "normal" },
  { id: "inconsistencias", label: "Con inconsistencias", tono: "aviso" },
  { id: "mal_costeadas", label: "Mal costeadas", tono: "peligro" },
  { id: "desvio", label: "Desvío > 50%", tono: "aviso" },
];

const TONOS = {
  peligro: { bg: "#FDECEA", fg: "#B42318", borde: "#F3B9B2" },
  aviso: { bg: "#FAEEDA", fg: "#854F0B", borde: "#EFD9AE" },
  normal: { bg: "var(--muted)", fg: "var(--muted-foreground)", borde: "var(--border)" },
} as const;

export function ChipsInformes({
  activo,
  conteos,
  onCambiar,
}: {
  activo: FiltroInformes;
  conteos: ConteosInformes;
  onCambiar: (f: FiltroInformes) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {CHIPS.map((chip) => {
        const n = conteos[chip.id] ?? 0;
        const seleccionado = activo === chip.id;
        const tono = TONOS[chip.tono];
        // Un chip en cero no se oculta: que no haya obras mal costeadas es información.
        return (
          <button
            key={chip.id}
            onClick={() => onCambiar(chip.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
              seleccionado ? "font-semibold" : "hover:bg-muted/60",
            )}
            style={
              seleccionado
                ? { backgroundColor: tono.bg, color: tono.fg, borderColor: tono.borde }
                : undefined
            }
          >
            {chip.tono === "peligro" && n > 0 && <AlertTriangle className="h-3 w-3" />}
            {chip.label}
            <span className="tabular-nums opacity-70">{n}</span>
          </button>
        );
      })}
    </div>
  );
}
