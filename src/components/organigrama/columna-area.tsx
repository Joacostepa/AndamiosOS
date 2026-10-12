"use client";

// Una columna del mapa: encabezado del área (el único lugar con el tinte --tb-X-bg) y sus
// puestos, con los sub-puestos indentados. Con un filtro activo, lo que no coincide NO se
// atenúa: se colapsa en una línea «+N puestos más», que conserva el contexto sin ruido.

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { nombreCompleto, puestosDeArea } from "@/lib/organigrama/arbol";
import type { Nodo, TipoCambio } from "@/lib/organigrama/tipos";
import { cn } from "@/lib/utils";
import { clasesArea } from "./colores-area";
import { useEnlaces } from "./fila-ocupante";
import { MenuNodo, useAccionesBorrador } from "./menu-borrador";
import { useOrg } from "./proveedor";
import { ChipsEstado, coincideFiltro, MarcaCambio, personasDe, TarjetaPuesto, type Filtro } from "./tarjeta-puesto";

export function ColumnaArea({ area, filtro, marcas }: { area: Nodo; filtro: Filtro; marcas: Map<string, TipoCambio> }) {
  const { datos, enBorrador } = useOrg();
  const enlaces = useEnlaces();
  const acciones = useAccionesBorrador();
  const c = clasesArea(area.color);
  const puestos = puestosDeArea(datos.nodos, area.clave);
  const visibles = puestos.filter((p) => coincideFiltro(datos, p.nodo.clave, filtro));
  const ocultos = puestos.length - visibles.length;
  const responsables = personasDe(datos, area.clave);

  return (
    <section aria-label={area.titulo} className="flex min-w-0 flex-col gap-2">
      <div className={cn("relative rounded-md px-3 py-2.5 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring", c.encabezado)}>
        <div className="flex items-start gap-2">
          <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", c.punto)} />
          <div className="min-w-0 flex-1">
            <Link
              href={enlaces.puesto(area.clave)}
              scroll={false}
              className="block text-[13.5px] leading-snug font-semibold outline-none after:absolute after:inset-0 after:rounded-md"
            >
              {area.titulo}
            </Link>
            <p className="truncate text-[12px] opacity-90">{responsables.length ? responsables.map(nombreCompleto).join(", ") : "Sin responsable"}</p>
            <p className="text-[12px] opacity-90">
              {puestos.length} {puestos.length === 1 ? "puesto" : "puestos"}
            </p>
          </div>
          {enBorrador && <MenuNodo nodo={area} className="relative z-10 -mt-1 -mr-1.5 max-md:hidden" />}
        </div>
        <div className="mt-1 flex flex-wrap gap-1 empty:hidden">
          <ChipsEstado datos={datos} clave={area.clave} />
          <MarcaCambio marca={marcas.get(area.clave)} />
        </div>
      </div>

      {visibles.map(({ nodo, nivel }) => (
        <TarjetaPuesto key={nodo.clave} nodo={nodo} nivel={nivel} marca={marcas.get(nodo.clave)} />
      ))}
      {ocultos > 0 && (
        <p className="rounded-md border border-dashed px-3 py-2 text-[12.5px] text-muted-foreground">
          +{ocultos} {ocultos === 1 ? "puesto más" : "puestos más"}
        </p>
      )}
      {puestos.length === 0 && filtro === "todo" && (
        <p className="rounded-md border border-dashed px-3 py-2 text-[12.5px] text-muted-foreground">Sin puestos debajo.</p>
      )}
      {enBorrador && (
        <Button variant="ghost" className="h-auto min-h-9 justify-start py-1.5 text-left text-[13px] whitespace-normal text-muted-foreground max-md:hidden" onClick={() => acciones.agregarPuesto(area.clave)}>
          <Plus aria-hidden /> Agregar puesto en {area.titulo.replace(/^Dirección (de )?/, "")}
        </Button>
      )}
    </section>
  );
}
