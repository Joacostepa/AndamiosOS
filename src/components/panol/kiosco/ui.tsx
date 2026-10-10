"use client";

// Piezas visuales del kiosco. Es un equipo compartido que se usa parado, con una mano y a
// veces con guantes: todo lo que se toca mide 56 px o más, el texto es grande y nada
// depende del hover. UN botón coral por pantalla (la próxima acción); el resto, neutro.
// Colores: los tokens del tema y la misma paleta semántica que Permisos (verde = hecho,
// ámbar = ojo, rojo = frenado), siempre con texto además del color.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Camera, Check, Minus, OctagonAlert, Plus, Search, TriangleAlert, Undo2, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { numero, sumarCaja } from "@/lib/panol/kiosco";

export function Pantalla({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-5", className)}>{children}</div>;
}

export function Titulo({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <h1 className="text-3xl font-bold leading-tight tracking-tight">{children}</h1>
      {sub && <p className="mt-1.5 text-lg text-muted-foreground">{sub}</p>}
    </div>
  );
}

type BotonProps = { children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string; type?: "button" | "submit" };

/** La próxima acción. Uno por pantalla. */
export function BotonPrimario({ children, onClick, disabled, className, type = "button" }: BotonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-16 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-xl font-bold text-primary-foreground active:translate-y-px disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function BotonSecundario({ children, onClick, disabled, className, type = "button" }: BotonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-14 items-center justify-center gap-2 rounded-xl border-2 border-input bg-card px-4 text-lg font-semibold text-foreground active:translate-y-px disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function BotonVolver({ children = "Volver", onClick }: { children?: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="-ml-2 flex h-14 items-center gap-2 self-start rounded-lg px-2 text-lg font-semibold text-muted-foreground">
      <ArrowLeft className="size-5" aria-hidden />
      {children}
    </button>
  );
}

/** Una opción para elegir (obra, cuadrilla, vuelta): una tarjeta entera tocable. */
export function Opcion({ titulo, sub, seleccionada, onClick, extra }: { titulo: ReactNode; sub?: ReactNode; seleccionada?: boolean; onClick: () => void; extra?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={seleccionada}
      className={cn(
        "flex min-h-16 w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left",
        seleccionada ? "border-2 border-foreground bg-muted" : "border border-input bg-card",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold leading-snug">{titulo}</span>
        {sub && <span className="block text-base text-muted-foreground">{sub}</span>}
      </span>
      {extra}
      {seleccionada && <Check className="size-6 shrink-0" aria-hidden />}
    </button>
  );
}

const TONO_AVISO = {
  aviso: "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  bloqueo: "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200",
  listo: "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
  info: "border-border bg-muted text-foreground",
} as const;

const ICONO_AVISO = { aviso: TriangleAlert, bloqueo: OctagonAlert, listo: Check, info: null } as const;

export function Aviso({ tono = "aviso", children, className }: { tono?: keyof typeof TONO_AVISO; children: ReactNode; className?: string }) {
  const Icono = ICONO_AVISO[tono];
  return (
    <div role={tono === "bloqueo" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-base font-medium", TONO_AVISO[tono], className)}>
      {Icono && <Icono className="mt-0.5 size-5 shrink-0" aria-hidden />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function BarraSinConexion() {
  return (
    <div role="status" className="flex items-center gap-3 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2.5 text-base font-semibold text-amber-900 dark:text-amber-200">
      <WifiOff className="size-5 shrink-0" aria-hidden />
      Sin conexión — el vale queda guardado en este equipo
    </div>
  );
}

/** −/+ grandes, +5, +10 y la unidad de compra. Nunca baja de 1. */
export function Cantidad({ valor, onChange, unidad, caja, maximo }: {
  valor: number;
  onChange: (n: number) => void;
  unidad: string;
  caja?: { texto: string; factor: number } | null;
  maximo?: number;
}) {
  const poner = (n: number) => onChange(Math.max(1, maximo !== undefined ? Math.min(maximo, n) : n));
  const [escribiendo, setEscribiendo] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button type="button" aria-label="Uno menos" onClick={() => poner(valor - 1)} className="grid size-20 shrink-0 place-items-center rounded-xl border-2 border-input bg-card">
          <Minus className="size-8" aria-hidden />
        </button>
        <div className="min-w-0 flex-1 text-center">
          {escribiendo ? (
            <input
              autoFocus
              inputMode="decimal"
              aria-label="Cantidad"
              defaultValue={String(valor)}
              onBlur={(e) => {
                const n = Number(e.target.value.replace(",", "."));
                if (Number.isFinite(n) && n > 0) poner(n);
                setEscribiendo(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="h-20 w-full rounded-xl border-2 border-ring bg-background text-center font-mono text-5xl font-semibold outline-none"
            />
          ) : (
            <button type="button" onClick={() => setEscribiendo(true)} className="w-full" aria-label={`${numero(valor)} ${unidad}. Tocá para escribir la cantidad`}>
              <span className="block font-mono text-6xl font-semibold leading-none tabular-nums">{numero(valor)}</span>
              <span className="mt-1 block text-base text-muted-foreground">{unidad}</span>
            </button>
          )}
        </div>
        <button type="button" aria-label="Uno más" onClick={() => poner(valor + 1)} className="grid size-20 shrink-0 place-items-center rounded-xl border-2 border-input bg-card">
          <Plus className="size-8" aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <BotonSecundario onClick={() => poner(valor + 5)}>+5</BotonSecundario>
        <BotonSecundario onClick={() => poner(valor + 10)}>+10</BotonSecundario>
        {caja ? (
          <BotonSecundario onClick={() => poner(sumarCaja(valor, caja.factor))} className="px-2 text-base">
            {caja.texto}
          </BotonSecundario>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

/** Chips de motivo rápido ("No arranca", "Falta la llave"). */
export function Chips({ opciones, elegidas, onToggle }: { opciones: readonly string[]; elegidas: readonly string[]; onToggle: (o: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map((o) => {
        const sel = elegidas.includes(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={sel}
            onClick={() => onToggle(o)}
            className={cn("h-14 rounded-full px-5 text-base font-semibold", sel ? "border-2 border-foreground bg-foreground text-background" : "border-2 border-input bg-card")}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** Sacar una foto (opcional). En el celular abre la cámara de fotos. */
export function BotonFoto({ lista, subiendo, onArchivo }: { lista: boolean; subiendo?: boolean; onArchivo: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onArchivo(f);
          e.target.value = "";
        }}
      />
      <BotonSecundario onClick={() => ref.current?.click()} disabled={subiendo} className="w-full">
        {lista ? <Check className="size-5" aria-hidden /> : <Camera className="size-5" aria-hidden />}
        {subiendo ? "Subiendo la foto…" : lista ? "Foto lista · sacar otra" : "Sacar una foto (si querés)"}
      </BotonSecundario>
    </>
  );
}

export function Buscador({ valor, onChange, etiqueta, autoFocus }: { valor: string; onChange: (v: string) => void; etiqueta: string; autoFocus?: boolean }) {
  return (
    <label className="relative block">
      <span className="sr-only">{etiqueta}</span>
      <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        autoFocus={autoFocus}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={etiqueta}
        className="h-14 w-full rounded-xl border-2 border-input bg-background pl-12 pr-4 text-lg outline-none focus-visible:border-ring"
      />
    </label>
  );
}

/** Sumar un aviso efímero arriba del escáner ("Agregaste 100 u. · Precintos"). */
export function useAvisoEfimero(ms = 3500) {
  const [aviso, setAviso] = useState<{ texto: string; tono: "listo" | "aviso" | "bloqueo" } | null>(null);
  const reloj = useRef(0);
  useEffect(() => () => window.clearTimeout(reloj.current), []);
  const mostrar = (texto: string, tono: "listo" | "aviso" | "bloqueo" = "listo") => {
    window.clearTimeout(reloj.current);
    setAviso({ texto, tono });
    reloj.current = window.setTimeout(() => setAviso(null), tono === "listo" ? ms : ms * 1.6);
  };
  return { aviso, mostrar, limpiar: () => setAviso(null) };
}

/**
 * La pantalla verde del final. Cuenta hacia atrás y vuelve a «¿Quién sos?»: el que viene
 * atrás no tiene que tocar nada para empezar. Deshacer está a mano durante la cuenta.
 */
export function PantallaListo({ titulo, texto, detalle, lineas, guardado, onDeshacer, onTerminar, segundos = 10 }: {
  titulo: string;
  texto?: ReactNode;
  detalle?: ReactNode;
  lineas?: string[];
  guardado?: boolean;
  onDeshacer?: () => void | Promise<void>;
  onTerminar: () => void;
  segundos?: number;
}) {
  const [quedan, setQuedan] = useState(segundos);
  const [deshaciendo, setDeshaciendo] = useState(false);
  const terminar = useRef(onTerminar);
  useEffect(() => {
    terminar.current = onTerminar;
  });
  useEffect(() => {
    if (deshaciendo) return;
    const reloj = window.setInterval(() => {
      setQuedan((q) => {
        if (q <= 1) {
          window.clearInterval(reloj);
          window.setTimeout(() => terminar.current(), 0);
          return 0;
        }
        return q - 1;
      });
    }, 1000);
    return () => window.clearInterval(reloj);
  }, [deshaciendo]);

  return (
    <div className={cn("flex flex-1 flex-col", guardado ? "bg-amber-500/15" : "bg-emerald-600 text-white dark:bg-emerald-700")}>
      <Pantalla className="justify-center">
        <div className={cn("grid size-20 place-items-center rounded-full", guardado ? "bg-amber-500/25" : "bg-white/20")}>
          {guardado ? <WifiOff className="size-10" aria-hidden /> : <Check className="size-12" strokeWidth={3} aria-hidden />}
        </div>
        <h1 className="text-4xl font-bold leading-tight">{titulo}</h1>
        {texto && <p className="text-xl font-medium">{texto}</p>}
        {lineas && lineas.length > 0 && (
          <ul className={cn("flex flex-col gap-1 rounded-xl p-4 text-lg", guardado ? "bg-background/60" : "bg-white/15")}>
            {lineas.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
        {guardado && <p className="text-lg font-semibold">Sin conexión: quedó guardado en este equipo y se confirma solo cuando vuelva la señal.</p>}
        {detalle && <p className="text-lg opacity-90">{detalle}</p>}
        <div className="mt-2 flex flex-col gap-3">
          {onDeshacer && (
            <button
              type="button"
              disabled={deshaciendo}
              onClick={async () => {
                setDeshaciendo(true);
                try {
                  await onDeshacer();
                } finally {
                  setDeshaciendo(false);
                }
              }}
              className={cn(
                "flex h-16 items-center justify-center gap-2 rounded-xl border-2 text-xl font-bold disabled:opacity-60",
                guardado ? "border-foreground/30 bg-background" : "border-white/60 bg-white/10",
              )}
            >
              <Undo2 className="size-6" aria-hidden />
              {deshaciendo ? "Deshaciendo…" : "Deshacer"}
            </button>
          )}
          <button type="button" onClick={onTerminar} className="h-14 rounded-xl text-lg font-semibold underline underline-offset-4">
            Vuelve a «¿Quién sos?» en {quedan} s · Tocá para ir ya
          </button>
        </div>
      </Pantalla>
    </div>
  );
}
