"use client";

// El menú de una ficha, de una fila, de un pedido o del cajón. En el escritorio, un popover
// pegado a lo que se tocó; en el celular, una hoja desde abajo con botones grandes (§ maqueta
// "menús abajo"). Teclado: flechas, Inicio y Fin entre las opciones; Escape cierra y el foco
// vuelve a lo que lo abrió.
//
// No es el DropdownMenu de Base UI: estos menús tienen pasos ("Pasar a otro camión ›",
// "Esperar…" con chips y una hora) y texto que no es opción, y el DropdownMenu sólo admite
// ítems.

import { useCallback, useRef } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

// Cuando una opción del menú abre un diálogo, el foco NO vuelve a lo que abrió el menú (se
// lo robaría al diálogo): lo devuelve el diálogo al cerrarse.
let sinVolver = false;
export const noDevolverFoco = () => { sinVolver = true; };

const ENFOCABLES = '[role^="menuitem"]:not([disabled]), [role="radio"]:not([disabled]), button:not([disabled])';

function navegar(e: React.KeyboardEvent<HTMLElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
  const t = e.target as HTMLElement;
  if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
  const its = [...e.currentTarget.querySelectorAll<HTMLElement>(ENFOCABLES)];
  if (!its.length) return;
  const i = its.indexOf(t);
  const n = e.key === "ArrowDown" ? (i + 1) % its.length : e.key === "ArrowUp" ? (i - 1 + its.length) % its.length : e.key === "Home" ? 0 : its.length - 1;
  e.preventDefault();
  its[n]?.focus();
}

export function MenuFlotante({
  anchor,
  onClose,
  label,
  ancho = 300,
  children,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  label: string;
  ancho?: number;
  children: React.ReactNode;
}) {
  const movil = useIsMobile();
  const primero = useCallback((el: HTMLElement | null) => el?.querySelector<HTMLElement>(ENFOCABLES) ?? el, []);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const alAbrir = useCallback(() => primero(popupRef.current) ?? true, [primero]);
  const cambio = (open: boolean) => {
    if (!open) onClose();
  };
  // El foco vuelve a lo que abrió el menú si todavía está en la página (puede haber
  // desaparecido: una ficha que se movió de fila).
  const alCerrar = () => {
    if (sinVolver) { sinVolver = false; return false; }
    return anchor.isConnected ? anchor : true;
  };

  if (movil) {
    return (
      <DialogPrimitive.Root open onOpenChange={cambio}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/30 supports-backdrop-filter:backdrop-blur-xs" />
          <DialogPrimitive.Popup
            ref={popupRef}
            aria-label={label}
            initialFocus={alAbrir}
            finalFocus={alCerrar}
            onKeyDown={navegar}
            className="fixed inset-x-0 bottom-0 z-50 grid max-h-[80dvh] gap-px overflow-auto rounded-t-2xl border-t bg-popover px-2.5 pt-2.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-popover-foreground shadow-lg outline-none [&_[role=menuitem]]:min-h-12 [&_[role=menuitem]]:text-[15px]"
          >
            <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-foreground/20" aria-hidden />
            <div role="menu" aria-label={label} className="grid gap-px">
              {children}
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  return (
    <PopoverPrimitive.Root open onOpenChange={cambio} modal={false}>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner anchor={anchor} side="bottom" align="start" sideOffset={6} collisionPadding={8} className="isolate z-50">
          <PopoverPrimitive.Popup
            ref={popupRef}
            initialFocus={alAbrir}
            finalFocus={alCerrar}
            onKeyDown={navegar}
            style={{ width: ancho }}
            className="z-50 grid max-h-[min(70dvh,var(--available-height))] gap-px overflow-auto rounded-xl bg-popover p-1.5 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none"
          >
            <div role="menu" aria-label={label} className="grid gap-px">
              {children}
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/** Encabezado del menú: lo que es, en negrita, y una línea gris. */
export function MenuCabeza({ titulo, sub }: { titulo: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="px-2 pt-1 pb-1.5 text-[13px]">
      <div className="font-semibold leading-snug">{titulo}</div>
      {sub && <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function MenuTexto({ children }: { children: React.ReactNode }) {
  return <div className="px-2 py-0.5 text-xs leading-snug text-muted-foreground [&_b]:font-medium [&_b]:text-foreground">{children}</div>;
}

export const MenuSep = () => <div role="separator" className="my-1 h-px bg-border" />;

export function MenuItem({
  onClick,
  children,
  sub,
  rojo,
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  sub?: React.ReactNode;
  rojo?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-8 w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-[13px] outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50",
        rojo && "text-hd-rojo",
      )}
    >
      <span className="min-w-0">{children}</span>
      {sub != null && <small className="shrink-0 text-xs text-muted-foreground">{sub}</small>}
    </button>
  );
}

/** Chips de una sola elección (radio), con flechas. */
export function Chips({ opciones, valor, onChange, label }: { opciones: string[]; valor: string | null; onChange: (v: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5 px-1 py-1">
      {opciones.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={valor === o}
          tabIndex={valor === o || (valor == null && o === opciones[0]) ? 0 : -1}
          onClick={() => onChange(o)}
          onKeyDown={(e) => {
            if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
            e.preventDefault();
            e.stopPropagation();
            const i = opciones.indexOf(o);
            const n = opciones[(i + (e.key === "ArrowRight" ? 1 : -1) + opciones.length) % opciones.length];
            onChange(n);
            const g = e.currentTarget.parentElement;
            requestAnimationFrame(() => g?.querySelector<HTMLElement>(`[aria-checked="true"]`)?.focus());
          }}
          className="min-h-8 rounded-full border border-input px-3 text-[12.5px] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-checked:border-foreground aria-checked:bg-foreground aria-checked:text-background max-md:min-h-11 max-md:text-[15px]"
        >
          {o}
        </button>
      ))}
    </div>
  );
}
