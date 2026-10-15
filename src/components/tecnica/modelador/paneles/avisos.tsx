"use client";

// Semáforo: avisos del núcleo y de la pantalla (choques con volúmenes) con su reparación de un
// clic, y las reglas automáticas que se aplicaron, con "deshacer". Todo es PREDIMENSIONADO.

import { useMemo, useState } from "react";
import type { Aviso } from "@/lib/tecnica/modelo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useEditor } from "../estado/store";
import { aplicar } from "../estado/acciones";
import { Chips } from "./campos";
import { AlertTriangle, Info, OctagonAlert, Undo2 } from "lucide-react";

const ICONO = { error: OctagonAlert, aviso: AlertTriangle, info: Info } as const;

export function Avisos() {
  const res = useEditor((s) => s.res);
  const pantalla = useEditor((s) => s.avisosPantalla);
  const estructuras = useEditor((s) => s.diseno.estructuras);
  const nombres = useMemo(() => new Map(estructuras.map((e) => [e.id, e.nombre])), [estructuras]);
  const estSel = useEditor((s) => s.sel.estructuraId);
  const soloLectura = useEditor((s) => s.soloLectura);
  const [alcance, setAlcance] = useState<"todo" | "sel">("todo");
  const avisos = useMemo(() => [...pantalla, ...res.avisos], [res, pantalla]);
  const vis = avisos.filter((a) => alcance === "todo" || a.estructuraId === estSel || a.estructuraId === null);
  const orden: Record<Aviso["nivel"], number> = { error: 0, aviso: 1, info: 2 };
  vis.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
  const reglas = res.reglas.filter((r) => alcance === "todo" || r.estructuraId === estSel || r.estructuraId === null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border p-3">
        <span className="text-xs text-muted-foreground">
          {avisos.filter((a) => a.nivel === "error").length} errores · {avisos.filter((a) => a.nivel === "aviso").length} avisos
        </span>
        <Chips opciones={[{ valor: "todo", etiqueta: "Toda la obra" }, { valor: "sel", etiqueta: "Selección" }]} valor={alcance} onElegir={setAlcance} />
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {vis.map((a) => {
          const Ic = ICONO[a.nivel];
          return (
            <div
              key={a.id}
              className={cn(
                "rounded-lg border p-2 text-xs",
                a.nivel === "error" ? "border-destructive/40 bg-destructive/5" : a.nivel === "aviso" ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-muted/30",
              )}
            >
              <button
                type="button"
                className="flex w-full items-start gap-2 text-left"
                onClick={() => a.estructuraId && useEditor.getState().seleccionar({ estructuraId: a.estructuraId, celdas: a.celda ? [a.celda] : [] })}
              >
                <Ic className={cn("mt-0.5 size-3.5 shrink-0", a.nivel === "error" ? "text-destructive" : a.nivel === "aviso" ? "text-amber-600" : "text-muted-foreground")} />
                <span>
                  {a.estructuraId && <b className="font-medium">{nombres.get(a.estructuraId) ?? a.estructuraId}: </b>}
                  {a.texto}
                </span>
              </button>
              {a.reparaciones.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1 pl-5">
                  {a.reparaciones.map((rp, i) => (
                    <Button key={i} size="xs" variant="outline" disabled={soloLectura} onClick={() => aplicar(rp.accion, rp.etiqueta)}>
                      {rp.etiqueta}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {reglas.length > 0 && (
          <details className="rounded-lg border border-border p-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground">Reglas automáticas aplicadas ({reglas.length})</summary>
            <ul className="mt-1.5 space-y-1">
              {reglas.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-2">
                  <span className="text-muted-foreground">{r.texto}</span>
                  {r.deshacer && (
                    <Button size="xs" variant="ghost" disabled={soloLectura} onClick={() => aplicar(r.deshacer!, `Deshacer regla: ${r.texto.slice(0, 48)}`)}>
                      <Undo2 /> Deshacer
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
