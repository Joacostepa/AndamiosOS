"use client";

// Los botones que traen los avisos (`Boton[]` de estado.ts) y la línea de un aviso.

import { cn } from "@/lib/utils";
import { BotonesDe } from "@/components/hoja-dia/comunes/linea-bandeja";
import type { Aviso, Boton } from "@/lib/hoja-dia/estado";
import { useCamiones } from "./contexto";

/** Los botones de un aviso en Camiones: los de comunes con el gesto de la vista (y nada en un día pasado). */
export function Botones({ bs, max, grande }: { bs: Boton[]; max?: number; grande?: boolean }) {
  const { boton, pasado } = useCamiones();
  if (pasado) return null;
  return <BotonesDe bs={bs} max={max} grande={grande} tamano="aviso" onBoton={boton} />;
}

const TONO = { rojo: "text-hd-rojo", amb: "text-hd-ambar", "": "text-foreground" } as const;

/** Un aviso de la fila o de la lista "Ver todo": el texto con su color y sus botones. */
export function LineaAviso({ a, className }: { a: Aviso; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-hd-card2 px-2.5 py-1.5 text-[13px]", className)}>
      <span className={cn("min-w-0 flex-1 basis-60", TONO[a.nivel], a.nivel === "rojo" && "font-medium")}>{a.t}</span>
      {a.bs.length > 0 && (
        <span className="flex flex-wrap gap-1">
          <Botones bs={a.bs} />
        </span>
      )}
    </div>
  );
}
