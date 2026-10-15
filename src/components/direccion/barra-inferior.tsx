"use client";

// Barra inferior del celular (§7.8): Semana · Caja · Cobranzas · Ventas · Más, 56 px, con
// safe-area. "Más" abre una hoja con En la calle, Socios (sólo con permiso) y Datos.

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarDays, ChartColumn, ChevronRight, Ellipsis, Lock, Truck, Users, Wallet, type LucideIcon } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { BARRA_INFERIOR, EN_MAS, SECCIONES, seccionDeRuta } from "@/lib/direccion/secciones";
import type { PantallaId } from "@/lib/direccion/tipos";
import { cn } from "@/lib/utils";
import { useDireccion, useQueryMoneda } from "./contexto";

const ICONO: Record<PantallaId, LucideIcon> = {
  semana: CalendarDays, caja: Wallet, ventas: ChartColumn, cobranzas: Users, calle: Truck, socios: Lock, datos: BookOpen,
};

export function BarraInferior() {
  const { conSocios } = useDireccion();
  const pathname = usePathname();
  const qMoneda = useQueryMoneda();
  const [mas, setMas] = useState(false);
  const activa = seccionDeRuta(pathname).id;
  const deMas = SECCIONES.filter((s) => EN_MAS.includes(s.id) && (!s.socios || conSocios));
  const item = "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium";

  return (
    <>
      <nav aria-label="Secciones de Dirección" className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        {BARRA_INFERIOR.map((id) => {
          const s = SECCIONES.find((x) => x.id === id)!;
          const Icono = ICONO[id];
          return (
            <Link key={id} href={`${s.href}${qMoneda}`} aria-current={activa === id ? "page" : undefined} className={cn(item, activa === id ? "text-primary" : "text-muted-foreground")}>
              <Icono className="size-5" aria-hidden />
              {s.corto}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMas(true)} aria-current={EN_MAS.includes(activa) ? "page" : undefined} className={cn(item, EN_MAS.includes(activa) ? "text-primary" : "text-muted-foreground")}>
          <Ellipsis className="size-5" aria-hidden />
          Más
        </button>
      </nav>
      <Sheet open={mas} onOpenChange={setMas}>
        <SheetContent side="bottom" className="gap-0 rounded-t-2xl p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <SheetTitle className="sr-only">Más secciones</SheetTitle>
          <div className="mx-auto mb-2 h-[5px] w-11 rounded-full bg-border" aria-hidden />
          {deMas.map((s) => {
            const Icono = ICONO[s.id];
            return (
              <Link key={s.id} href={`${s.href}${qMoneda}`} onClick={() => setMas(false)} className="flex min-h-14 items-center gap-3 rounded-md px-3 hover:bg-muted">
                <Icono className="size-[18px]" aria-hidden />
                <span className="flex flex-1 flex-col">
                  <b className="text-sm font-semibold">{s.titulo}</b>
                  <small className="text-xs text-muted-foreground">{s.pregunta}</small>
                </span>
                <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
              </Link>
            );
          })}
        </SheetContent>
      </Sheet>
    </>
  );
}
