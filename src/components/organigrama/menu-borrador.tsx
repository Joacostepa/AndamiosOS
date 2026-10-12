"use client";

// El menú ⋯ de cada caja en el borrador. SIEMPRE visible (no aparece con hover, que en el
// celular no existe), con botones reales y aria-label. Editar la estructura es de escritorio:
// en el celular el mapa queda en solo lectura.

import { ArrowDown, ArrowUp, MoreHorizontal, MoveRight, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { claveNueva, correr, hijos } from "@/lib/organigrama/arbol";
import type { Nodo } from "@/lib/organigrama/tipos";
import { useOrg } from "./proveedor";

export function useAccionesBorrador() {
  const { datos, dispatch, abrir } = useOrg();
  return {
    /** Crea «Puesto nuevo» debajo de `padre` y abre su ficha para completarla. */
    agregarPuesto(padre: string) {
      const clave = claveNueva(datos.nodos);
      const orden = Math.max(-1, ...hijos(datos.nodos, padre).map((h) => h.orden)) + 1;
      const nuevo: Nodo = { clave, dependeDe: padre, tipo: "puesto", titulo: "Puesto nuevo", tareas: [], noHace: [], kpis: [], orden };
      dispatch({ tipo: "estructura", nodos: [...datos.nodos, nuevo] });
      abrir({ tipo: "editar", clave });
    },
    correr(clave: string, sentido: -1 | 1) {
      const r = correr(datos.nodos, clave, sentido);
      if (r === datos.nodos) toast(sentido < 0 ? "Ya está primero." : "Ya está último.");
      else dispatch({ tipo: "estructura", nodos: r });
    },
  };
}

export function MenuNodo({ nodo, className }: { nodo: Nodo; className?: string }) {
  const { datos, abrir } = useOrg();
  const acciones = useAccionesBorrador();
  const esRaiz = nodo.dependeDe === null;
  const hermanos = nodo.dependeDe ? hijos(datos.nodos, nodo.dependeDe) : [];
  const i = hermanos.findIndex((h) => h.clave === nodo.clave);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" className={className} aria-label={`Acciones de ${nodo.titulo}`} />}
      >
        <MoreHorizontal aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem onClick={() => abrir({ tipo: "editar", clave: nodo.clave })}>
          <Pencil aria-hidden /> Editar ficha
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => acciones.agregarPuesto(nodo.clave)}>
          <Plus aria-hidden /> Agregar puesto debajo
        </DropdownMenuItem>
        <DropdownMenuItem disabled={esRaiz} onClick={() => abrir({ tipo: "mover", clave: nodo.clave })}>
          <MoveRight aria-hidden /> Mover a…
        </DropdownMenuItem>
        <DropdownMenuItem disabled={esRaiz || i <= 0} onClick={() => acciones.correr(nodo.clave, -1)}>
          <ArrowUp aria-hidden /> Subir
        </DropdownMenuItem>
        <DropdownMenuItem disabled={esRaiz || i < 0 || i >= hermanos.length - 1} onClick={() => acciones.correr(nodo.clave, 1)}>
          <ArrowDown aria-hidden /> Bajar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={esRaiz} onClick={() => abrir({ tipo: "eliminar", clave: nodo.clave })}>
          <Trash2 aria-hidden /> Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
