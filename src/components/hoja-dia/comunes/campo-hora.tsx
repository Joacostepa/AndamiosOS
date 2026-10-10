"use client";

// Una hora escrita a mano y tolerante: "745", "7.45", "7h45", "7" → "7:45" / "7:00"
// (leerHora de estado.ts). Dos formas, la misma regla:
// - CampoHora (Cuadrillas): se guarda solo al salir del campo o con Enter; si no es una
//   hora queda en rojo, con "Hora no válida" y el foco adentro, sin mandar nada.
// - InputHora (Camiones, en diálogos y menús): controlado; al salir se normaliza y quien lo
//   usa decide cuándo guardar (horaDe) y si mostrar el error (`mal`).

import { forwardRef, useId, useState } from "react";
import { leerHora, normHora } from "@/lib/hoja-dia/estado";
import { cn } from "@/lib/utils";

export function CampoHora({
  valor,
  onCambiar,
  label,
  ocultarLabel = false,
  id,
  disabled,
  className,
}: {
  valor: string | null;
  onCambiar: (hora: string) => void;
  label: string;
  ocultarLabel?: boolean;
  id?: string;
  disabled?: boolean;
  className?: string;
}) {
  const auto = useId();
  const elId = id ?? auto;
  const base = normHora(valor) ?? "";
  // El texto mientras se escribe; null = lo que viene de afuera.
  const [texto, setTexto] = useState<string | null>(null);
  const [mal, setMal] = useState(false);

  const confirmar = (el: HTMLInputElement) => {
    if (texto == null) return;
    const h = leerHora(texto);
    if (!h) {
      setMal(true);
      el.focus();
      return;
    }
    setMal(false);
    setTexto(null);
    if (h !== base) onCambiar(h);
  };

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <label htmlFor={elId} className={cn("text-xs text-muted-foreground", ocultarLabel && "sr-only")}>
        {label}
      </label>
      <input
        id={elId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        value={texto ?? base}
        aria-invalid={mal || undefined}
        aria-describedby={mal ? `${elId}-m` : undefined}
        onChange={(e) => {
          setTexto(e.target.value);
          if (mal) setMal(false);
        }}
        onBlur={(e) => confirmar(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            confirmar(e.currentTarget);
          } else if (e.key === "Escape" && texto != null) {
            e.stopPropagation();
            setTexto(null);
            setMal(false);
          }
        }}
        className={cn(
          "h-7 w-[62px] rounded-md border border-input bg-card px-1.5 text-center text-[13px] tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 max-md:h-10 max-md:w-[72px] max-md:text-[15px]",
          mal && "border-hd-rojo ring-1 ring-hd-rojo",
        )}
      />
      {mal && (
        <span id={`${elId}-m`} className="text-xs text-hd-rojo">
          Hora no válida
        </span>
      )}
    </span>
  );
}

// ─── InputHora (controlado) ─────────────────────────────────────────────────

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
