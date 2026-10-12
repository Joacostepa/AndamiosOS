"use client";

// «Mover a…»: un árbol indentado con buscador. El propio puesto y todo lo que depende de él
// aparecen deshabilitados (creaCiclo): en el original, mover un nodo bajo un descendiente
// borraba la rama entera sin avisar.

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { creaCiclo, hijos, mover, nodoDe, normalizar, raiz } from "@/lib/organigrama/arbol";
import type { Nodo } from "@/lib/organigrama/tipos";
import { cn } from "@/lib/utils";
import { useOrg } from "./proveedor";

export function MoverA({ clave, onCerrar }: { clave: string; onCerrar: () => void }) {
  const { datos, dispatch } = useOrg();
  const [q, setQ] = useState("");
  const nodo = nodoDe(datos.nodos, clave);
  const dg = raiz(datos.nodos);
  if (!nodo || !dg) return null;

  const filas: { nodo: Nodo; nivel: number }[] = [];
  const visitar = (n: Nodo, nivel: number) => {
    filas.push({ nodo: n, nivel });
    for (const h of hijos(datos.nodos, n.clave)) visitar(h, nivel + 1);
  };
  visitar(dg, 0);
  const qn = normalizar(q.trim());
  const visibles = qn ? filas.filter((f) => normalizar(f.nodo.titulo).includes(qn)) : filas;

  const elegir = (destino: Nodo) => {
    try {
      dispatch({ tipo: "estructura", nodos: mover(datos.nodos, clave, destino.clave) });
      toast(`${nodo.titulo} ahora depende de ${destino.titulo} (en el borrador).`);
      onCerrar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo mover");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mover {nodo.titulo} a…</DialogTitle>
          <DialogDescription>Elegí de quién pasa a depender. Se mueve con todo lo que tiene debajo.</DialogDescription>
        </DialogHeader>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar puesto o área…" aria-label="Buscar destino" className="h-9 max-sm:h-10" />
        <ul className="max-h-80 overflow-auto rounded-md border" role="list">
          {visibles.map(({ nodo: n, nivel }) => {
            const propio = n.clave === clave;
            const ciclo = !propio && creaCiclo(datos.nodos, clave, n.clave);
            const actual = n.clave === nodo.dependeDe;
            const deshabilitado = propio || ciclo || actual;
            return (
              <li key={n.clave} className="border-b last:border-b-0">
                <button
                  type="button"
                  disabled={deshabilitado}
                  onClick={() => elegir(n)}
                  style={{ paddingLeft: `${0.75 + nivel * 1}rem` }}
                  className={cn(
                    "flex min-h-10 w-full items-center gap-2 py-1.5 pr-3 text-left text-[13.5px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                    deshabilitado ? "cursor-not-allowed text-muted-foreground" : "hover:bg-muted",
                  )}
                >
                  <span className={cn("min-w-0 flex-1", n.tipo !== "puesto" && "font-medium")}>{n.titulo}</span>
                  {propio && <span className="text-[12px]">(este puesto)</span>}
                  {ciclo && <span className="text-[12px]">(depende de este puesto)</span>}
                  {actual && <span className="rounded-full bg-muted px-2 text-[12px]">actual</span>}
                </button>
              </li>
            );
          })}
          {visibles.length === 0 && <li className="px-3 py-3 text-[13px] text-muted-foreground">No hay coincidencias.</li>}
        </ul>
        <DialogFooter>
          <Button variant="outline" className="h-9 max-sm:h-10" onClick={onCerrar}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
