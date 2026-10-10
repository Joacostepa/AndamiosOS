"use client";

// Un menú con pasos (el de un nombre: "Pasar a…", "No viene…", "Nota"), anclado a lo que
// lo abrió. En la computadora, un popover al lado; en el celular, una hoja desde abajo con
// botones grandes. Flechas ↑ ↓, Inicio y Fin recorren las opciones; Escape lo cierra y
// devuelve el foco a lo que lo abrió.
//
// No es un DropdownMenu de Base UI porque los pasos tienen campos (la nota, la fecha) y el
// menú de Base UI se come las teclas para buscar por la primera letra.

import type { ReactNode } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const SELECTOR = '[role="menuitem"]:not([disabled]),[role="menuitemradio"]:not([disabled]),[data-mi]:not([disabled])';

function moverFoco(e: React.KeyboardEvent<HTMLElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
  const t = e.target as HTMLElement;
  if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
  const its = [...e.currentTarget.querySelectorAll<HTMLElement>(SELECTOR)];
  if (!its.length) return;
  const i = its.indexOf(t);
  const n = e.key === "ArrowDown" ? (i + 1) % its.length : e.key === "ArrowUp" ? (i - 1 + its.length) % its.length : e.key === "Home" ? 0 : its.length - 1;
  e.preventDefault();
  its[n]?.focus();
}

export function MenuFlotante({
  abierto,
  anchor,
  onCerrar,
  label,
  encabezado,
  ancho = 260,
  children,
}: {
  abierto: boolean;
  anchor: HTMLElement | null;
  onCerrar: () => void;
  label: string;
  encabezado?: ReactNode;
  ancho?: number;
  children: ReactNode;
}) {
  const movil = useIsMobile();
  const primero = (el: HTMLElement | null) => el?.querySelector<HTMLElement>(SELECTOR) ?? null;

  const cuerpo = (
    <>
      {encabezado && <div className="mb-1 border-b px-2 pt-1.5 pb-2 text-[13px]">{encabezado}</div>}
      <div className="grid gap-px">{children}</div>
    </>
  );

  if (movil) {
    return (
      <DialogPrimitive.Root open={abierto} onOpenChange={(o) => !o && onCerrar()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/45" />
          <DialogPrimitive.Popup
            aria-label={label}
            role="menu"
            finalFocus={() => anchor}
            initialFocus={() => primero(document.querySelector<HTMLElement>("[data-menu-flotante]"))}
            data-menu-flotante=""
            onKeyDown={moverFoco}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-auto rounded-t-2xl border-t bg-popover p-2.5 pb-5 text-popover-foreground shadow-2xl outline-none"
          >
            {cuerpo}
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  return (
    <PopoverPrimitive.Root open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner anchor={anchor} side="bottom" align="start" sideOffset={4} collisionPadding={8} className="isolate z-50">
          <PopoverPrimitive.Popup
            aria-label={label}
            role="menu"
            finalFocus={() => anchor}
            initialFocus={() => primero(document.querySelector<HTMLElement>("[data-menu-flotante]"))}
            data-menu-flotante=""
            onKeyDown={moverFoco}
            style={{ width: ancho }}
            className="max-h-[min(70dvh,var(--available-height))] overflow-auto rounded-[10px] border border-foreground/15 bg-popover p-1.5 text-popover-foreground shadow-xl outline-none"
          >
            {cuerpo}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/** Una opción del menú (.mi de la maqueta). */
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
        "flex items-baseline justify-between gap-2 rounded-md px-2 py-[7px] text-left text-[13px] outline-none hover:bg-muted focus-visible:bg-muted disabled:opacity-50 max-md:min-h-12 max-md:items-center max-md:px-2.5 max-md:text-[15px]",
        rojo && "text-hd-rojo",
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      {detalle != null && <small className="text-right text-xs text-muted-foreground">{detalle}</small>}
    </button>
  );
}

/** Un chip de opción (motivos, "Sólo hoy"…). */
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
