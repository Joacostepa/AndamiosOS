"use client";

// La hoja lateral de la Hoja del día (Enviar, Ausencias, Instrucciones, Ver como…):
// a la derecha, 560 px; en el celular, de ancho completo. Escape la cierra y devuelve el
// foco a lo que la abrió (Base UI).

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HojaLateral({
  abierta,
  onCerrar,
  titulo,
  sub,
  pie,
  children,
  className,
}: {
  abierta: boolean;
  onCerrar: () => void;
  titulo: ReactNode;
  sub?: ReactNode;
  pie?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Sheet open={abierta} onOpenChange={(o) => !o && onCerrar()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className={cn("w-full gap-0 bg-card p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[560px]", className)}
      >
        <div className="flex items-start gap-3 border-b px-5 pt-3.5 pb-2.5">
          <div className="min-w-0">
            <SheetTitle className="text-[17px] font-semibold text-balance">{titulo}</SheetTitle>
            {sub && <SheetDescription className="mt-0.5 text-[13px]">{sub}</SheetDescription>}
          </div>
          <Button variant="ghost" size="icon-sm" className="ml-auto shrink-0" onClick={onCerrar} aria-label="Cerrar">
            <X />
          </Button>
        </div>
        <div className="grid flex-1 content-start gap-2.5 overflow-auto px-5 pt-3 pb-5">{children}</div>
        {pie && <div className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-2.5">{pie}</div>}
      </SheetContent>
    </Sheet>
  );
}

/** Una caja dentro de la hoja lateral (.box de la maqueta). */
export function Caja({ titulo, children, className }: { titulo?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("grid gap-2 rounded-[10px] border bg-hd-card2 p-3", className)}>
      {titulo && <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">{titulo}</h3>}
      {children}
    </section>
  );
}
