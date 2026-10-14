import { HardHat } from "lucide-react";
import { CASCO } from "@/lib/tablero/colores";
import { cn } from "@/lib/utils";

/**
 * El casco de "lleva técnico de Seguridad e Higiene": amarillo de seguridad con contorno
 * oscuro, como un casco de verdad. El mismo en la tarjeta de la grilla, la de la bandeja, el
 * encabezado del día y la ficha, para que se aprenda una sola vez. Ver CASCO en colores.ts.
 */
export function CascoSyh({ className }: { className?: string }) {
  return (
    <HardHat
      className={cn("h-3.5 w-3.5 shrink-0", className)}
      fill={CASCO.relleno}
      color={CASCO.contorno}
      strokeWidth={2.25}
      aria-hidden
    />
  );
}
