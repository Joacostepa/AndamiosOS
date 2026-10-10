"use client";

// El único botón coral de cada pantalla de la hoja ("Enviar a los capataces", "Nuevo
// pedido"). Usa --hd-boton (coral oscuro, 5,2:1 con blanco) y no --primary (3,9:1).

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BotonCoral({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      size="lg"
      className={cn(
        "h-9 bg-hd-boton px-4 text-sm font-semibold text-white hover:bg-hd-boton-hover focus-visible:ring-hd-boton/50 max-md:h-11 max-md:w-full max-md:text-[15px]",
        className,
      )}
      {...props}
    />
  );
}

/**
 * El botón principal de un diálogo o una hoja ("Pasarlo", "Guardar"): el claro sobre oscuro
 * (.btn.pri de la maqueta), para que el coral quede como el único de la pantalla.
 */
export const PRI = "bg-foreground font-semibold text-background hover:bg-foreground/85";
