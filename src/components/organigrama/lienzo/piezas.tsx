"use client";

// Piezas chicas del lienzo: el tacho, la micro-celebración al cubrir una vacante, el fantasma
// que sigue al puntero, el aviso de «tocá un puesto» y el overlay de atajos.

import { forwardRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Briefcase, LayoutGrid, Trash2, UserRoundSearch, X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { iniciales, nombreCompleto } from "@/lib/organigrama/arbol";
import { TITULO_HERRAMIENTA, type Herramienta } from "@/lib/organigrama/lienzo";
import type { ColorArea, Nodo, Persona } from "@/lib/organigrama/tipos";
import { cn } from "@/lib/utils";
import { varsArea } from "./comun";

export const Tacho = forwardRef<HTMLDivElement, { encima: boolean }>(function Tacho({ encima }, ref) {
  return (
    <motion.div
      ref={ref}
      data-destino="tacho"
      data-sin-pan
      initial={{ opacity: 0, y: 40, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: encima ? 1.15 : 1 }}
      exit={{ opacity: 0, y: 40, scale: 0.8 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
      className={cn(
        "pointer-events-auto flex h-16 items-center gap-2 rounded-full border-2 border-dashed px-5 text-[13px] font-medium shadow-lg backdrop-blur",
        encima ? "border-red-500 bg-red-500/15 text-red-700 dark:text-red-300" : "border-muted-foreground/50 bg-card/95 text-muted-foreground",
      )}
    >
      <motion.span animate={encima ? { rotate: [0, -14, 10, -6, 0] } : { rotate: 0 }} transition={{ duration: 0.45 }}>
        <Trash2 aria-hidden className="size-5" />
      </motion.span>
      {encima ? "Soltá para eliminar" : "Arrastrá acá para eliminar"}
    </motion.div>
  );
});

const PARTICULAS = Array.from({ length: 14 }, (_, i) => {
  const ang = (i / 14) * Math.PI * 2 + (i % 2 ? 0.2 : 0);
  const r = 46 + (i % 3) * 14;
  return { x: Math.cos(ang) * r, y: Math.sin(ang) * r, color: (["verde", "teal", "ambar", "azul", "violeta", "rosa"] as ColorArea[])[i % 6] };
});

/** Chispas que salen del centro de un puesto recién cubierto. Sutil y corta (0,9 s). */
export function Celebracion({ x, y }: { x: number; y: number }) {
  const reducido = useReducedMotion();
  if (reducido) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute top-0 left-0 z-20" style={{ transform: `translate(${x}px, ${y}px)` }}>
      <motion.span
        className="absolute -top-10 -left-10 size-20 rounded-full border-2 border-[var(--tb-verde-borde)]"
        initial={{ scale: 0.3, opacity: 0.9 }}
        animate={{ scale: 1.8, opacity: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      />
      {PARTICULAS.map((p, i) => (
        <motion.span
          key={i}
          className="absolute -top-1 -left-1 size-2 rounded-full"
          style={{ backgroundColor: `var(--tb-${p.color}-borde)` }}
          initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
          animate={{ x: p.x, y: p.y, scale: 0.2, opacity: 0 }}
          transition={{ duration: 0.85, ease: [0.2, 0.8, 0.3, 1] }}
        />
      ))}
      <motion.span
        className="absolute -left-12 w-24 text-center text-[12px] font-semibold text-emerald-700 dark:text-emerald-300"
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: -64, opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.1, ease: "easeOut" }}
      >
        ¡Cubierta!
      </motion.span>
    </div>
  );
}

const ICONO_H: Record<Herramienta, typeof Briefcase> = { puesto: Briefcase, vacante: UserRoundSearch, area: LayoutGrid };

/** Lo que se ve debajo del puntero mientras se arrastra. */
export function Fantasma({
  herramienta,
  persona,
  nodo,
  color,
  debajo,
  valido,
  hayDestino,
}: {
  herramienta?: Herramienta;
  persona?: Persona;
  nodo?: Nodo;
  color?: ColorArea;
  debajo?: number;
  valido: boolean;
  hayDestino: boolean;
}) {
  const marco = cn(
    "rounded-lg border bg-card shadow-2xl transition-[transform,opacity] duration-150",
    hayDestino && !valido && "opacity-70 grayscale",
    hayDestino && valido && "ring-2 ring-foreground",
  );
  if (herramienta) {
    const I = ICONO_H[herramienta];
    return (
      <div className={cn(marco, "flex rotate-[-3deg] items-center gap-2 px-3 py-2 text-[13px] font-semibold", herramienta === "vacante" && "border-dashed border-amber-500")}>
        <I aria-hidden className="size-4" /> {TITULO_HERRAMIENTA[herramienta]}
      </div>
    );
  }
  if (persona) {
    return (
      <div className="flex flex-col items-center gap-1">
        <Avatar size="lg" className={cn("shadow-2xl ring-2", hayDestino && valido ? "ring-foreground" : "ring-card")}>
          <AvatarFallback className="bg-foreground text-[13px] font-semibold text-background">{iniciales(persona)}</AvatarFallback>
        </Avatar>
        <span className="rounded bg-foreground px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-background shadow">{nombreCompleto(persona)}</span>
      </div>
    );
  }
  if (nodo) {
    return (
      <div className={cn(marco, "relative w-52 rotate-[-2deg] overflow-hidden py-2 pr-3 pl-4")} style={varsArea(color ?? "gris")}>
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-[var(--area)]" />
        <p className="truncate text-[13px] font-semibold">{nodo.titulo}</p>
        <p className="text-[11.5px] text-muted-foreground">{debajo ? `Viaja con ${debajo} ${debajo === 1 ? "puesto" : "puestos"} debajo` : "Soltalo sobre su nuevo jefe"}</p>
      </div>
    );
  }
  return null;
}

export function AvisoSeleccion({ texto, onCancelar }: { texto: string; onCancelar: () => void }) {
  return (
    <motion.div
      data-sin-pan
      role="status"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="pointer-events-auto flex items-center gap-2 rounded-full bg-foreground py-1 pr-1 pl-3 text-[13px] font-medium text-background shadow-lg"
    >
      {texto}
      <button
        type="button"
        onClick={onCancelar}
        aria-label="Cancelar"
        className="inline-flex size-8 items-center justify-center rounded-full hover:bg-background/15 focus-visible:ring-2 focus-visible:ring-background"
      >
        <X aria-hidden className="size-4" />
      </button>
    </motion.div>
  );
}

const ATAJOS: [string, string][] = [
  ["⌘Z / Ctrl+Z", "Deshacer"],
  ["⇧⌘Z / Ctrl+Y", "Rehacer"],
  ["+ / −", "Acercar / alejar"],
  ["0", "Encuadrar todo"],
  ["F", "Pantalla completa"],
  ["L", "Cambiar entre lista y árbol"],
  ["Rueda / pinch", "Zoom hacia el cursor"],
  ["Arrastrar el fondo", "Mover la vista"],
  ["← / →", "Paso anterior / siguiente (recorrido y papel)"],
  ["Esc", "Salir del modo, soltar o cerrar"],
  ["?", "Esta ayuda"],
];

export function DialogoAtajos({ onCerrar }: { onCerrar: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Atajos del lienzo</DialogTitle>
          <DialogDescription>Con el foco en un campo de texto, los atajos no se interceptan.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13.5px]">
          {ATAJOS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[12px]">{k}</kbd>
              </dt>
              <dd className="text-muted-foreground">{v}</dd>
            </div>
          ))}
        </dl>
        <Button variant="outline" className="h-9 justify-self-end" onClick={onCerrar}>
          Cerrar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
