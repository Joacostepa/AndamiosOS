"use client";

// Las dos preguntas del lienzo: al soltar a alguien en un puesto ocupado (Reemplazar /
// Compartir / Interino) y al tirar al tacho un puesto con dependientes (subirlos o borrar la
// rama). Cancelar nunca toca nada.

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Nodo, Persona } from "@/lib/organigrama/tipos";
import { nombreCompleto } from "@/lib/organigrama/arbol";

function lista(personas: Persona[]): string {
  const ns = personas.map(nombreCompleto);
  return ns.length <= 1 ? (ns[0] ?? "") : `${ns.slice(0, -1).join(", ")} y ${ns.at(-1)}`;
}

export function DialogoUbicar({
  persona,
  nodo,
  actuales,
  onElegir,
  onCerrar,
}: {
  persona: Persona;
  nodo: Nodo;
  actuales: Persona[];
  onElegir: (modo: "reemplazar" | "compartir" | "interino") => void;
  onCerrar: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {persona.nombre} en {nodo.titulo}
          </DialogTitle>
          <DialogDescription>
            {nodo.titulo} ya lo ocupa {lista(actuales)}. ¿Qué hacemos?
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Button variant="outline" className="h-auto justify-start py-2 text-left whitespace-normal" onClick={() => onElegir("reemplazar")}>
            <span>
              <span className="block font-semibold">Reemplazar</span>
              <span className="block text-[12.5px] font-normal text-muted-foreground">
                {lista(actuales)} {actuales.length === 1 ? "deja" : "dejan"} el puesto hoy.
              </span>
            </span>
          </Button>
          <Button variant="outline" className="h-auto justify-start py-2 text-left whitespace-normal" onClick={() => onElegir("compartir")}>
            <span>
              <span className="block font-semibold">Compartir el puesto</span>
              <span className="block text-[12.5px] font-normal text-muted-foreground">Quedan los dos como titulares.</span>
            </span>
          </Button>
          <Button variant="outline" className="h-auto justify-start py-2 text-left whitespace-normal" onClick={() => onElegir("interino")}>
            <span>
              <span className="block font-semibold">Como interino</span>
              <span className="block text-[12.5px] font-normal text-muted-foreground">Lo cubre mientras tanto, sin ser titular.</span>
            </span>
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" className="h-9 max-sm:h-10" onClick={onCerrar}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DialogoTacho({
  nodo,
  padre,
  debajo,
  onSubir,
  onRama,
  onCerrar,
}: {
  nodo: Nodo;
  padre: Nodo | undefined;
  debajo: number;
  onSubir: () => void;
  onRama: () => void;
  onCerrar: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminar {nodo.titulo}</DialogTitle>
          <DialogDescription>
            Tiene {debajo === 1 ? "1 puesto" : `${debajo} puestos`} debajo. Se puede deshacer con ⌘Z y nada cambia hasta publicar.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Button variant="outline" className="h-auto justify-start py-2 text-left whitespace-normal" onClick={onSubir}>
            <span>
              <span className="block font-semibold">Subirlos a {padre?.titulo ?? "su jefe"}</span>
              <span className="block text-[12.5px] font-normal text-muted-foreground">Se elimina solo {nodo.titulo}.</span>
            </span>
          </Button>
          <Button variant="destructive" className="h-auto justify-start py-2 text-left whitespace-normal" onClick={onRama}>
            <span>
              <span className="block font-semibold">Borrar toda la rama</span>
              <span className="block text-[12.5px] font-normal opacity-80">
                {nodo.titulo} y {debajo === 1 ? "el puesto" : `los ${debajo} puestos`} de abajo.
              </span>
            </span>
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" className="h-9 max-sm:h-10" onClick={onCerrar}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
