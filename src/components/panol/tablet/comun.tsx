"use client";

// Piezas de las pantallas del encargado en la tablet del depósito (conteo, control de
// cuadrilla, "¿Qué hay afuera?"). Tablet apaisada de 1180×820, con guantes: todo lo que se
// toca mide 56 px o más, el texto es grande y nada depende del hover.

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Delete, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Escaner } from "@/components/panol/escaner";
import { useKiosco } from "@/components/panol/kiosco/sesion";
import { Chip, type TonoChip } from "@/components/permisos-via-publica/ui";
import { cn } from "@/lib/utils";
import type { Identidad } from "@/lib/panol/tipos";

// ─── Botones ────────────────────────────────────────────────────────────────

const BASE =
  "inline-flex min-h-14 shrink-0 items-center justify-center gap-2 rounded-lg px-5 text-base font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0";
/** El coral: UNO por pantalla, la próxima acción. */
export const BOTON_PRIMARIO = cn(BASE, "bg-primary text-primary-foreground active:bg-primary/85");
export const BOTON_SECUNDARIO = cn(BASE, "border-2 border-border bg-card text-foreground active:bg-muted");
/** Fuerte sin gastar el coral (el "Guardar" del teclado). */
export const BOTON_OSCURO = cn(BASE, "bg-foreground text-background active:bg-foreground/85");

/** Un chip legible a un brazo de distancia. */
export function ChipGrande({ tono = "neutro", children }: { tono?: TonoChip; children: ReactNode }) {
  return <Chip tono={tono} className="h-7 px-3 text-sm [&_svg]:size-4">{children}</Chip>;
}

// ─── Encabezado ─────────────────────────────────────────────────────────────

export function CabeceraTablet({ titulo, icono, quien, rol = "a cargo", textoSalir = "Salir", children }: {
  titulo: string;
  icono: ReactNode;
  quien?: string | null;
  rol?: string;
  /** En las pantallas que mantienen la sesión: "Terminar y salir", bien a la vista. */
  textoSalir?: string;
  children?: ReactNode;
}) {
  const { salir, identidad } = useKiosco();
  return (
    <header className="sticky top-0 z-20 flex min-h-[68px] items-center justify-between gap-4 border-b bg-card px-6 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-lg bg-foreground text-background [&_svg]:size-5">
          {icono}
        </span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-xl font-bold">{titulo}</div>
          <div className="text-[13px] text-muted-foreground" suppressHydrationWarning>
            Tablet del depósito · {format(new Date(), "EEEE dd/MM", { locale: es })}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {quien && <span className="text-[15px] text-muted-foreground">{quien} · {rol}</span>}
        {children}
        <Link href="/kiosco" className={BOTON_SECUNDARIO}>Kiosco</Link>
        {identidad && (
          <button type="button" onClick={salir} className={BOTON_SECUNDARIO}>{textoSalir}</button>
        )}
      </div>
    </header>
  );
}

// ─── Guardia: estas pantallas son del encargado ─────────────────────────────

/** Quién está frente al kiosco y si está a cargo del pañol. */
export function useEncargadoKiosco(): { identidad: Identidad | null; puede: boolean; token: string | null } {
  const { identidad } = useKiosco();
  return { identidad, puede: !!identidad?.esEncargado, token: identidad?.token ?? null };
}

export function SinEncargado({ identidad }: { identidad: Identidad | null }) {
  const { salir } = useKiosco();
  // Encargado que entró con la credencial sola: lo de encargado pide el PIN (alguien pudo
  // haber levantado su credencial).
  if (identidad?.encargadoSinPin) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center">
        <ShieldAlert aria-hidden className="size-14 text-muted-foreground" />
        <div>
          <h1 className="text-3xl font-bold">Entrá con tu PIN para hacer esto</h1>
          <p className="mx-auto mt-2 max-w-xl text-lg text-muted-foreground">
            {identidad.nombre}: entraste con la credencial. Lo que hace alguien a cargo del pañol pide tu PIN.
          </p>
        </div>
        <button type="button" onClick={salir} className={BOTON_PRIMARIO}>Entrar con mi PIN</button>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center">
      <ShieldAlert aria-hidden className="size-14 text-muted-foreground" />
      <div>
        <h1 className="text-3xl font-bold">Esto lo hace alguien a cargo del pañol</h1>
        <p className="mx-auto mt-2 max-w-xl text-lg text-muted-foreground">
          {identidad
            ? `${identidad.nombre}: tu usuario no está a cargo del pañol. Pedile a un encargado que se identifique.`
            : "Identificate en el kiosco con tu credencial o tu PIN, y volvé."}
        </p>
      </div>
      <Link href="/kiosco" className={BOTON_SECUNDARIO}>Ir al kiosco</Link>
    </div>
  );
}

/**
 * Red de seguridad para las pantallas que mantienen la sesión (useMantenerSesion): si el
 * encargado se va y deja la tablet, a los 10 minutos sin un toque, una tecla ni un escaneo
 * se cierra igual. Lo cargado no se pierde (el conteo se retoma).
 */
export function useCorteSeguridad(minutos = 10) {
  const { identidad, salir } = useKiosco();
  useEffect(() => {
    if (!identidad) return;
    let ultimo = Date.now();
    const marcar = () => {
      ultimo = Date.now();
    };
    const eventos = ["pointerdown", "keydown", "panol:escaneo"] as const;
    for (const e of eventos) window.addEventListener(e, marcar);
    const reloj = window.setInterval(() => {
      if (Date.now() - ultimo > minutos * 60_000) {
        salir();
        toast.message("Pasaron 10 minutos sin uso: se cerró la sesión. Lo cargado quedó guardado.");
      }
    }, 5_000);
    return () => {
      for (const e of eventos) window.removeEventListener(e, marcar);
      window.clearInterval(reloj);
    };
  }, [identidad, salir, minutos]);
}

// ─── Lector de códigos ──────────────────────────────────────────────────────

/**
 * Los lectores QR por USB o Bluetooth "escriben" como un teclado, muy rápido y con Enter al
 * final. Si el foco no está en un campo (porque se tocó un botón del teclado numérico, por
 * ejemplo), esto igual junta la ráfaga y la entrega. Una persona tipeando es mucho más
 * lenta: más de 80 ms entre teclas corta la ráfaga, así no se confunde con alguien que
 * escribe en otro lado.
 */
export function useLectorTeclado(onCodigo: (texto: string) => void, activo = true) {
  const cb = useRef(onCodigo);
  useEffect(() => {
    cb.current = onCodigo;
  });
  useEffect(() => {
    if (!activo) return;
    let buffer = "";
    let ultima = 0;
    const tecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const ahora = Date.now();
      if (ahora - ultima > 80) buffer = "";
      ultima = ahora;
      if (e.key === "Enter") {
        if (buffer.length >= 3) {
          e.preventDefault();
          cb.current(buffer);
        }
        buffer = "";
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [activo]);
}

/**
 * El lector de estas pantallas: la cámara (Escaner, con su «Escribir el código») más los
 * lectores por USB/Bluetooth, que escriben como un teclado (useLectorTeclado).
 */
export function Lector({ onCodigo, pausado = false, ayuda, className }: {
  onCodigo: (texto: string) => void;
  pausado?: boolean;
  ayuda?: string;
  className?: string;
}) {
  useLectorTeclado(onCodigo, !pausado);
  return <Escaner onCodigo={onCodigo} pausado={pausado} ayuda={ayuda} className={className} />;
}

// ─── Teclado numérico ───────────────────────────────────────────────────────

/** Teclas de 72 px: se cuenta con guantes y con la otra mano ocupada. */
export function TecladoNumerico({ valor, onCambio, decimales = false }: {
  valor: string;
  onCambio: (v: string) => void;
  decimales?: boolean;
}) {
  const tocar = (k: string) => {
    if (k === "borrar") return onCambio(valor.slice(0, -1));
    if (k === ",") return onCambio(valor.includes(",") || !decimales ? valor : (valor || "0") + ",");
    if (valor.replace(",", "").length >= 7) return;
    onCambio(valor === "0" ? k : valor + k);
  };
  const teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9", decimales ? "," : "", "0", "borrar"];
  return (
    <div className="grid grid-cols-3 gap-2">
      {teclas.map((k, i) =>
        k === "" ? (
          <span key={i} />
        ) : (
          <button
            key={k}
            type="button"
            onClick={() => tocar(k)}
            aria-label={k === "borrar" ? "Borrar" : k}
            className="grid h-[72px] place-items-center rounded-lg border-2 border-border bg-card font-mono text-3xl font-semibold active:bg-muted"
          >
            {k === "borrar" ? <Delete aria-hidden className="size-7" /> : k}
          </button>
        ),
      )}
    </div>
  );
}

/** "12,5" → 12.5; vacío → null. */
export function leerNumero(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
