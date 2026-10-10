"use client";

// Un campo de hora que entiende como escribe la gente: "7", "745", "7.45", "7h45" → "7:45"
// (leerHora de estado.ts). Al salir del campo se normaliza; si no es una hora, lo dice al
// lado y no la guarda.
//
// PARA UNIFICAR: es la versión de Camiones del "input de hora tolerante" que también usa
// Cuadrillas; cuando exista uno en components/hoja-dia/comunes, este se reemplaza por aquel.

import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";
import { leerHora } from "@/lib/hoja-dia/estado";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onChange: (v: string) => void;
  /** Mostrar el error ("Hora no válida") debajo. */
  mal?: boolean;
  etiqueta?: string;
};

export const InputHora = forwardRef<HTMLInputElement, Props>(function InputHora({ value, onChange, mal, etiqueta, className, id, ...rest }, ref) {
  const auto = useId();
  const elId = id ?? auto;
  return (
    <span className="inline-flex flex-col gap-1">
      {etiqueta && (
        <label htmlFor={elId} className="text-xs font-medium text-muted-foreground">
          {etiqueta}
        </label>
      )}
      <input
        {...rest}
        ref={ref}
        id={elId}
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const h = leerHora(e.target.value);
          if (h) onChange(h);
          rest.onBlur?.(e);
        }}
        aria-invalid={mal || undefined}
        className={cn(
          "h-9 w-[110px] rounded-md border border-input bg-transparent px-2 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-hd-rojo",
          className,
        )}
      />
      {mal && <span className="text-xs font-medium text-hd-rojo">Hora no válida</span>}
    </span>
  );
});

/** "7.45" → "7:45" o null. */
export const horaDe = (v: string) => leerHora(v);
