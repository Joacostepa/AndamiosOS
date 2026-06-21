"use client";

import { useEffect, useState } from "react";
import { Minus, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Fila de material del catálogo con steppers [−][cant][+] y botón de activación.
export function MaterialRow({
  nombre,
  unidad,
  cantidad,
  disabled = false,
  onDecrement,
  onIncrement,
  onSetCantidad,
  onToggle,
}: {
  nombre: string;
  unidad: string;
  cantidad: number; // 0 = inactivo
  disabled?: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
  onSetCantidad: (n: number) => void;
  onToggle: () => void;
}) {
  const activo = cantidad > 0;
  const [draft, setDraft] = useState(String(cantidad));

  // Resincronizar el input cuando cambia la cantidad desde fuera (steppers, hidratación).
  useEffect(() => {
    setDraft(String(cantidad));
  }, [cantidad]);

  function commit() {
    const n = Math.floor(Number(draft));
    if (!Number.isFinite(n) || n < 1) {
      setDraft(String(cantidad));
      return;
    }
    onSetCantidad(n);
  }

  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_130px_36px] items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
        !activo && "bg-background",
      )}
      style={
        activo
          ? { borderColor: "#F0997B", backgroundColor: "#FAECE7" }
          : undefined
      }
    >
      <div className="min-w-0">
        <p
          className="truncate text-sm font-medium"
          style={activo ? { color: "#993C1D" } : undefined}
        >
          {nombre}
        </p>
        <p className="truncate text-xs text-muted-foreground">{unidad}</p>
      </div>

      {/* Steppers [−][cant][+] */}
      <div className="flex items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={onDecrement}
          disabled={disabled || !activo}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md border text-sm transition-colors disabled:cursor-not-allowed",
            !activo && "opacity-30",
          )}
          style={activo ? { borderColor: "#F0997B", color: "#993C1D" } : undefined}
          aria-label="Restar"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          disabled={disabled || !activo}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className={cn(
            "h-7 w-12 rounded-md border bg-transparent text-center text-sm tabular-nums outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed",
            !activo && "text-muted-foreground opacity-60",
          )}
          style={activo ? { borderColor: "#F0997B", color: "#993C1D" } : undefined}
        />
        <button
          type="button"
          onClick={onIncrement}
          disabled={disabled || !activo}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md border text-sm transition-colors disabled:cursor-not-allowed",
            !activo && "opacity-30",
          )}
          style={activo ? { borderColor: "#F0997B", color: "#993C1D" } : undefined}
          aria-label="Sumar"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Botón de activación / desactivación */}
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          !activo && "border-border text-muted-foreground hover:bg-muted",
        )}
        style={
          activo
            ? { backgroundColor: "#D85A30", borderColor: "#D85A30", color: "#fff" }
            : undefined
        }
        aria-label={activo ? "Quitar del cómputo" : "Agregar al cómputo"}
        aria-pressed={activo}
      >
        {activo ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      </button>
    </div>
  );
}
