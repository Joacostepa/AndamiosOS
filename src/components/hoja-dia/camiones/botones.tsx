"use client";

// Los botones que traen los avisos (`Boton[]` de estado.ts) y la línea de un aviso.

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Aviso, Boton } from "@/lib/hoja-dia/estado";
import { useCamiones } from "./contexto";

export function Botones({ bs, max, grande }: { bs: Boton[]; max?: number; grande?: boolean }) {
  const { boton, pasado } = useCamiones();
  if (pasado) return null;
  return (
    <>
      {bs.slice(0, max ?? bs.length).map((b, i) => (
        <Button
          key={`${b.a}-${b.l}-${i}`}
          type="button"
          variant="outline"
          size={grande ? "default" : "xs"}
          className="max-md:h-9 max-md:px-3 max-md:text-sm"
          onClick={(e) => boton(b, e.currentTarget)}
        >
          {b.l}
        </Button>
      ))}
    </>
  );
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
