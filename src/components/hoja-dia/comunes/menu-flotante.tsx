"use client";

// El menú flotante de la Hoja del día (Cuadrillas y Camiones): el de un nombre ("Pasar a…",
// "No viene…", "Nota"), el de una tarjeta, el de una ficha, una fila, un pedido o el cajón.
// En la computadora, un popover pegado a lo que se tocó; en el celular, una hoja desde abajo
// con botones grandes. Flechas ↑ ↓, Inicio y Fin recorren las opciones; Escape lo cierra y
// el foco vuelve a lo que lo abrió (si todavía está en la página: una ficha que se movió de
// fila ya no está).
//
// No es el DropdownMenu de Base UI: estos menús tienen pasos con campos ("Esperar…" con
// chips y una hora, la nota, la fecha) y texto que no es opción, y el menú de Base UI sólo
// admite ítems y se come las teclas para buscar por la primera letra.

import { useCallback, useRef, type ReactNode } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

// Cuando una opción del menú abre un diálogo, el foco NO vuelve a lo que abrió el menú (se
// lo robaría al diálogo): lo devuelve el diálogo al cerrarse.
let sinVolver = false;
export const noDevolverFoco = () => {
  sinVolver = true;
};

const ENFOCABLES =
  '[role^="menuitem"]:not([disabled]), [role="radio"]:not([disabled]), [data-mi]:not([disabled]), button:not([disabled])';

function moverFoco(e: React.KeyboardEvent<HTMLElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
  const t = e.target as HTMLElement;
  if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
  const its = [...e.currentTarget.querySelectorAll<HTMLElement>(ENFOCABLES)];
  if (!its.length) return;
  const i = its.indexOf(t);
  const n = e.key === "ArrowDown" ? (i + 1) % its.length : e.key === "ArrowUp" ? (i - 1 + its.length) % its.length : e.key === "Home" ? 0 : its.length - 1;
  e.preventDefault();
  its[n]?.focus();
}

export function MenuFlotante({
  abierto = true,
  anchor,
  onCerrar,
  label,
  encabezado,
  ancho = 260,
  children,
}: {
  abierto?: boolean;
  anchor: HTMLElement | null;
  onCerrar: () => void;
  label: string;
  /** Una línea de título arriba, separada (los menús de Cuadrillas). */
  encabezado?: ReactNode;
  ancho?: number;
  children: ReactNode;
}) {
  const movil = useIsMobile();
  const popupRef = useRef<HTMLDivElement | null>(null);
  const alAbrir = useCallback(() => popupRef.current?.querySelector<HTMLElement>(ENFOCABLES) ?? popupRef.current ?? true, []);
  const alCerrar = () => {
    if (sinVolver) {
      sinVolver = false;
      return false;
    }
    return anchor && anchor.isConnected ? anchor : true;
  };
  const cambio = (open: boolean) => {
    if (!open) onCerrar();
  };
  const cuerpo = (
    <>
      {encabezado && <div className="mb-1 border-b px-2 pt-1.5 pb-2 text-[13px]">{encabezado}</div>}
      <div role="menu" aria-label={label} className="grid gap-px">
        {children}
      </div>
    </>
  );

  if (movil) {
    return (
      <DialogPrimitive.Root open={abierto} onOpenChange={cambio}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 supports-backdrop-filter:backdrop-blur-xs" />
          <DialogPrimitive.Popup
            ref={popupRef}
            aria-label={label}
            initialFocus={alAbrir}
            finalFocus={alCerrar}
            onKeyDown={moverFoco}
            className="fixed inset-x-0 bottom-0 z-50 grid max-h-[80dvh] gap-px overflow-auto rounded-t-2xl border-t bg-popover px-2.5 pt-2.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-popover-foreground shadow-2xl outline-none [&_[role=menuitem]]:min-h-12 [&_[role=menuitem]]:text-[15px]"
          >
            <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-foreground/20" aria-hidden />
            {cuerpo}
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  return (
    <PopoverPrimitive.Root open={abierto} onOpenChange={cambio} modal={false}>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner anchor={anchor} side="bottom" align="start" sideOffset={4} collisionPadding={8} className="isolate z-50">
          <PopoverPrimitive.Popup
            ref={popupRef}
            aria-label={label}
            initialFocus={alAbrir}
            finalFocus={alCerrar}
            onKeyDown={moverFoco}
            style={{ width: ancho }}
            className="z-50 max-h-[min(70dvh,var(--available-height))] overflow-auto rounded-[10px] border border-foreground/15 bg-popover p-1.5 text-sm text-popover-foreground shadow-xl outline-none"
          >
            {cuerpo}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/** Encabezado del menú: lo que es, en negrita, y una línea gris. */
export function MenuCabeza({ titulo, sub }: { titulo: ReactNode; sub?: ReactNode }) {
  return (
    <div className="px-2 pt-1 pb-1.5 text-[13px]">
      <div className="leading-snug font-semibold">{titulo}</div>
      {sub && <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Texto del menú que no es opción. */
export function MenuTexto({ children }: { children: ReactNode }) {
  return <div className="px-2 py-0.5 text-xs leading-snug text-muted-foreground [&_b]:font-medium [&_b]:text-foreground">{children}</div>;
}

export const MenuSep = () => <div role="separator" className="my-1 h-px bg-border" />;

/** Una opción del menú (.mi de la maqueta), con un detalle gris a la derecha. */
export function ItemMenu({
  children,
  detalle,
  rojo,
  className,
  ...props
}: React.ComponentProps<"button"> & { detalle?: ReactNode; rojo?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        "flex min-h-8 w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-[13px] outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 max-md:min-h-12 max-md:px-2.5 max-md:text-[15px]",
        rojo && "text-hd-rojo",
        className,
      )}
      {...props}
    >
      <span className="min-w-0">{children}</span>
      {detalle != null && <small className="shrink-0 text-right text-xs text-muted-foreground">{detalle}</small>}
    </button>
  );
}

/** Un chip de opción suelto (motivos, "Sólo hoy"…). */
export function ChipOpcion({ activo, className, ...props }: React.ComponentProps<"button"> & { activo?: boolean }) {
  return (
    <button
      type="button"
      data-mi=""
      className={cn(
        "min-h-7 rounded-full border border-foreground/20 px-2.5 py-0.5 text-[12.5px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-md:min-h-11 max-md:px-3.5 max-md:text-[15px]",
        activo && "border-foreground bg-foreground text-background",
        className,
      )}
      {...props}
    />
  );
}

/** Chips de una sola elección (radio), con flechas ← →. */
export function Chips({ opciones, valor, onChange, label }: { opciones: string[]; valor: string | null; onChange: (v: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5 px-1 py-1">
      {opciones.map((o) => (
        <ChipOpcion
          key={o}
          role="radio"
          aria-checked={valor === o}
          activo={valor === o}
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
        >
          {o}
        </ChipOpcion>
      ))}
    </div>
  );
}
