"use client";

// Eliminar un puesto del borrador. Si tiene dependientes, NUNCA borra la rama: ofrece subirlos
// a su padre. Cancelar no toca nada (en el original el confirm estaba invertido).

import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { eliminar, hijos, nodoDe, nombreCompleto, ocupantesVigentes, personaDe } from "@/lib/organigrama/arbol";
import type { Persona } from "@/lib/organigrama/tipos";
import { useOrg } from "./proveedor";

export function EliminarPuesto({ clave, onCerrar }: { clave: string; onCerrar: () => void }) {
  const { datos, dispatch } = useOrg();
  const nodo = nodoDe(datos.nodos, clave);
  if (!nodo) return null;
  const padre = nodoDe(datos.nodos, nodo.dependeDe);
  const debajo = hijos(datos.nodos, clave);
  const ocupantes = ocupantesVigentes(datos, clave)
    .map((o) => personaDe(datos.personas, o.persona))
    .filter((p): p is Persona => !!p);
  const n = debajo.length;

  const partes: string[] = [];
  if (n) partes.push(`${nodo.titulo} tiene ${n === 1 ? "1 puesto" : `${n} puestos`} debajo. ¿Los subimos a ${padre?.titulo ?? "su padre"}?`);
  else partes.push(`${nodo.titulo} se elimina del borrador; nada cambia hasta que se publique.`);
  if (ocupantes.length) {
    const nombres = ocupantes.map(nombreCompleto).join(", ");
    partes.push(`${nombres} ${ocupantes.length === 1 ? "queda" : "quedan"} sin este puesto al publicar.`);
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onCerrar()}
      title={`Eliminar ${nodo.titulo}`}
      description={partes.join(" ")}
      variant="destructive"
      confirmLabel={n ? `Subir ${n === 1 ? "su puesto" : `sus ${n} puestos`} y eliminar` : "Eliminar"}
      onConfirm={() => {
        try {
          dispatch({ tipo: "estructura", nodos: eliminar(datos.nodos, clave, true) });
          toast(n ? `Eliminaste ${nodo.titulo} y subiste sus puestos a ${padre?.titulo}.` : `Eliminaste ${nodo.titulo} del borrador.`);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
        }
        onCerrar();
      }}
    />
  );
}
