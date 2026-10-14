"use client";

// Los GRUPOS de las áreas (layout.ts › `grupos`), debajo de conectores y tarjetas:
// - Árbol: un recuadro con el tinte suave del área, borde sutil y esquinas redondeadas que
//   encierra a la tarjeta del área y a todo lo que cuelga de ella. Las subáreas quedan como
//   recuadros anidados. La pertenencia se ve sin seguir líneas.
// - Lista: una franja vertical del color del área por la sangría (más liviano).
// Viajan con el mismo spring que las tarjetas (al cambiar la estructura o al pasar Lista ↔ Árbol,
// el recuadro se encoge hasta ser la franja y al revés).
//
// Son destino de arrastre: soltar sobre el recuadro de un área es soltar sobre el área
// (`data-destino`), y con una herramienta o persona elegida (celular), tocarlo también.

import { memo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Grupo } from "@/lib/organigrama/layout";
import type { ColorArea } from "@/lib/organigrama/tipos";
import { cn } from "@/lib/utils";
import { RESORTE, varsArea, type EstadoDestino } from "./comun";

function GruposBase({
  grupos,
  colores,
  atenuados,
  destinos,
}: {
  grupos: Grupo[];
  colores: Record<string, ColorArea>;
  /** Grupos fuera del foco (recorrido, papel, cadena de mando). */
  atenuados: ReadonlySet<string> | null;
  /** El estado de arrastre de cada área (para marcar el recuadro sobre el que se va a soltar). */
  destinos: Record<string, EstadoDestino>;
}) {
  // «Reducir movimiento»: MotionConfig ya apaga los transform; el ancho y el alto, acá.
  const reducido = useReducedMotion();
  const tam = reducido ? { duration: 0 } : RESORTE;
  return (
    <AnimatePresence initial={false}>
      {grupos.map((g) => {
        const { x, y, w, h } = g.caja;
        const d = destinos[g.clave];
        const arbol = g.forma === "arbol";
        return (
          <motion.div
            key={g.clave}
            aria-hidden
            data-destino={`nodo:${g.clave}`}
            data-grupo={g.clave}
            className={cn(
              "absolute top-0 left-0 transition-[border-radius,background-color,box-shadow] duration-300",
              arbol
                ? "rounded-2xl border border-[color-mix(in_oklab,var(--area)_32%,transparent)] bg-[color-mix(in_oklab,var(--area-bg)_58%,transparent)]"
                : "rounded-full bg-[color-mix(in_oklab,var(--area)_65%,transparent)]",
              arbol && d === "sobre" && "ring-2 ring-foreground/60",
              arbol && d === "sobre-invalido" && "ring-2 ring-red-500/70",
            )}
            style={varsArea(colores[g.clave] ?? "gris")}
            initial={{ x, y, width: w, height: h, opacity: 0 }}
            animate={{ x, y, width: w, height: h, opacity: atenuados?.has(g.clave) ? 0.3 : 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ x: RESORTE, y: RESORTE, width: tam, height: tam, opacity: { duration: 0.25 } }}
          />
        );
      })}
    </AnimatePresence>
  );
}

export const Grupos = memo(GruposBase);
