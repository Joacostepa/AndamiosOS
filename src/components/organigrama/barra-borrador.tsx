"use client";

// La barra del borrador (docs/organigrama/propuesta.md § 3.11). «Publicar versión» es EL coral
// de la pantalla mientras se edita; el resto, outline o ghost. En el celular solo avisa: editar
// la estructura es una tarea de escritorio.

import { useOrg } from "./proveedor";
import { Button } from "@/components/ui/button";

export function BarraBorrador() {
  const { cambios, abrir, dispatch } = useOrg();
  const n = cambios.length;
  return (
    <div className="sticky top-0 z-20 rounded-md border border-dashed border-foreground/40 bg-card px-3 py-2.5 shadow-sm">
      <p className="text-[13px] md:hidden">
        <span className="font-semibold tracking-wide">BORRADOR</span> · Hay un borrador con {n} {n === 1 ? "cambio" : "cambios"}. Editalo desde una computadora.
      </p>
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <p className="min-w-0 flex-1 text-[13px]">
          <span className="font-semibold tracking-wide">BORRADOR</span> · {n} {n === 1 ? "cambio" : "cambios"} sin publicar ·{" "}
          <span className="text-muted-foreground">lo ven solo los editores</span>
        </p>
        <Button variant="ghost" className="h-9" onClick={() => dispatch({ tipo: "salir" })}>
          Ver la vigente
        </Button>
        <Button variant="outline" className="h-9" onClick={() => abrir({ tipo: "cambios" })}>
          Ver cambios
        </Button>
        <Button variant="outline" className="h-9" onClick={() => abrir({ tipo: "descartar" })}>
          Descartar borrador
        </Button>
        <Button className="h-9" disabled={n === 0} onClick={() => abrir({ tipo: "publicar" })}>
          Publicar versión
        </Button>
      </div>
    </div>
  );
}
