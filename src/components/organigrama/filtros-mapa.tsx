"use client";

// Chips-botón del mapa. El filtro colapsa lo que no coincide (ver ColumnaArea), no lo atenúa.

import { estadoPuesto } from "@/lib/organigrama/arbol";
import type { DatosOrg } from "@/lib/organigrama/tipos";
import { cn } from "@/lib/utils";
import type { Filtro } from "./tarjeta-puesto";

export function contarFiltros(datos: DatosOrg): Record<Exclude<Filtro, "todo">, number> {
  const estados = datos.nodos.filter((x) => x.tipo !== "direccion").map((x) => estadoPuesto(datos, x.clave));
  return {
    vacantes: estados.filter((e) => e.vacante).length,
    interinos: estados.filter((e) => e.interino).length,
    bajas: estados.filter((e) => e.baja).length,
  };
}

export function FiltrosMapa({ datos, filtro, onCambiar }: { datos: DatosOrg; filtro: Filtro; onCambiar: (f: Filtro) => void }) {
  const n = contarFiltros(datos);
  const opciones: { id: Filtro; titulo: string; cuenta?: number }[] = [
    { id: "todo", titulo: "Todo" },
    { id: "vacantes", titulo: "Vacantes", cuenta: n.vacantes },
    { id: "interinos", titulo: "Interinos", cuenta: n.interinos },
    { id: "bajas", titulo: "Bajas", cuenta: n.bajas },
  ];
  return (
    <div role="group" aria-label="Filtrar el mapa" className="flex flex-wrap gap-1.5">
      {opciones.map((o) => {
        const activo = filtro === o.id;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={activo}
            onClick={() => onCambiar(o.id)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] focus-visible:outline-2 focus-visible:outline-ring max-sm:h-10",
              activo ? "border-foreground bg-foreground font-semibold text-background" : "bg-card text-foreground hover:bg-muted",
            )}
          >
            {o.titulo}
            {o.cuenta !== undefined && (
              <span className={cn("rounded-full px-1.5 text-[12px] tabular-nums", activo ? "bg-background/20" : "bg-muted text-muted-foreground")}>{o.cuenta}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
