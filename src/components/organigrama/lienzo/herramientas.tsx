"use client";

// La caja de herramientas flotante: se AGARRA «Puesto nuevo», «Vacante» o «Área nueva» y se
// suelta sobre el puesto del que va a depender. En el celular (o sin arrastrar) también se puede
// tocar la herramienta y después tocar el puesto.

import { motion } from "motion/react";
import { Briefcase, LayoutGrid, UserRoundSearch } from "lucide-react";
import { TITULO_HERRAMIENTA, type Herramienta } from "@/lib/organigrama/lienzo";
import { cn } from "@/lib/utils";
import { useArrastre, useFuenteArrastre } from "./arrastre";

const ICONO: Record<Herramienta, typeof Briefcase> = { puesto: Briefcase, vacante: UserRoundSearch, area: LayoutGrid };
const AYUDA: Record<Herramienta, string> = {
  puesto: "Soltalo sobre el puesto del que depende",
  vacante: "Un puesto a cubrir: queda pidiendo a alguien",
  area: "Soltala sobre la Dirección",
};

function Pieza({ h, seleccionada, onTocar }: { h: Herramienta; seleccionada: boolean; onTocar: (h: Herramienta) => void }) {
  const fuente = useFuenteArrastre(() => ({ tipo: "herramienta", herramienta: h }));
  const { gesto, carga } = useArrastre();
  const Icono = ICONO[h];
  const agarrada = carga?.tipo === "herramienta" && carga.herramienta === h;
  return (
    <motion.button
      type="button"
      {...fuente}
      onClick={() => !gesto.current.suprimirClick && onTocar(h)}
      title={AYUDA[h]}
      aria-pressed={seleccionada}
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.96 }}
      className={cn(
        "group flex h-10 w-full cursor-grab items-center gap-2 rounded-md border px-2 text-left text-[13px] font-medium active:cursor-grabbing max-sm:w-10 max-sm:justify-center max-sm:px-0",
        h === "vacante" ? "border-dashed border-amber-500/70" : "border-border",
        seleccionada ? "bg-foreground text-background" : "bg-background hover:bg-muted",
        agarrada && "opacity-40",
      )}
    >
      <Icono aria-hidden className={cn("size-4 shrink-0", h === "vacante" && !seleccionada && "text-amber-600 dark:text-amber-400")} />
      <span className="max-sm:sr-only">{TITULO_HERRAMIENTA[h]}</span>
    </motion.button>
  );
}

export function CajaHerramientas({ seleccionada, onTocar }: { seleccionada: Herramienta | null; onTocar: (h: Herramienta) => void }) {
  return (
    <motion.div
      data-sin-pan
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      className="pointer-events-auto grid w-40 gap-1.5 rounded-lg border bg-card/95 p-1.5 shadow-lg backdrop-blur max-sm:w-auto"
      role="toolbar"
      aria-label="Caja de herramientas"
    >
      <p className="px-1 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase max-sm:sr-only">Agarrá y soltá</p>
      {(["puesto", "vacante", "area"] as Herramienta[]).map((h) => (
        <Pieza key={h} h={h} seleccionada={seleccionada === h} onTocar={onTocar} />
      ))}
    </motion.div>
  );
}
