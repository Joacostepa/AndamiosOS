"use client";

// El mapa en el celular: una fila desplegable por área (no hay accordion en ui/, así que es un
// botón con aria-expanded). Sin pan ni zoom; filas de min-h-11 para el dedo.

import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Chip } from "@/components/permisos-via-publica/ui";
import { estadoPuesto, nombreCompleto, puestosDeArea } from "@/lib/organigrama/arbol";
import type { Nodo, TipoCambio } from "@/lib/organigrama/tipos";
import { cn } from "@/lib/utils";
import { clasesArea } from "./colores-area";
import { GrupoAvatares, useEnlaces } from "./fila-ocupante";
import { useOrg } from "./proveedor";
import { ChipsEstado, coincideFiltro, MarcaCambio, personasDe, type Filtro } from "./tarjeta-puesto";

export function FilaDireccionMovil({ nodo }: { nodo: Nodo }) {
  const { datos } = useOrg();
  const enlaces = useEnlaces();
  const c = clasesArea(nodo.color);
  return (
    <Link
      href={enlaces.puesto(nodo.clave)}
      scroll={false}
      className={cn("flex min-h-12 items-center gap-3 rounded-md border border-l-[3px] bg-card px-3 py-2", c.franja)}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold">{nodo.titulo}</span>
        <span className="block truncate text-[12px] text-muted-foreground">{personasDe(datos, nodo.clave).map(nombreCompleto).join(", ")}</span>
      </span>
      <GrupoAvatares personas={personasDe(datos, nodo.clave)} enlazar={false} />
      <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
    </Link>
  );
}

export function AreaMovil({
  area,
  filtro,
  marcas,
  abiertaDeEntrada = false,
}: {
  area: Nodo;
  filtro: Filtro;
  marcas: Map<string, TipoCambio>;
  abiertaDeEntrada?: boolean;
}) {
  const { datos } = useOrg();
  const enlaces = useEnlaces();
  const [abierta, setAbierta] = useState(abiertaDeEntrada);
  const c = clasesArea(area.color);
  const puestos = puestosDeArea(datos.nodos, area.clave);
  const vacantes = puestos.filter((p) => {
    const e = estadoPuesto(datos, p.nodo.clave);
    return e.vacante && !e.interino;
  }).length;
  const bajas = puestos.filter((p) => estadoPuesto(datos, p.nodo.clave).baja).length;
  const visibles = puestos.filter((p) => coincideFiltro(datos, p.nodo.clave, filtro));
  const ocultos = puestos.length - visibles.length;
  const idLista = `area-${area.clave}`;

  return (
    <section className={cn("overflow-hidden rounded-md border border-l-[3px] bg-card", c.franja)}>
      <button
        type="button"
        aria-expanded={abierta}
        aria-controls={idLista}
        onClick={() => setAbierta((x) => !x)}
        className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold">{area.titulo}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
            {puestos.length} {puestos.length === 1 ? "puesto" : "puestos"}
            {vacantes > 0 && <Chip tono="aviso">{vacantes} {vacantes === 1 ? "vacante" : "vacantes"}</Chip>}
            {bajas > 0 && <Chip tono="bloqueo">{bajas} {bajas === 1 ? "baja" : "bajas"}</Chip>}
          </span>
        </span>
        <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform", abierta && "rotate-180")} />
      </button>
      {abierta && (
        <ul id={idLista} className="border-t">
          <li className="border-b last:border-b-0">
            <Link
              href={enlaces.puesto(area.clave)}
              scroll={false}
              className="flex min-h-11 items-center gap-2 px-3 py-2 text-[13.5px] hover:bg-muted/50"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Responsable del área</span>
                <span className="block truncate text-[12px] text-muted-foreground">
                  {personasDe(datos, area.clave).map(nombreCompleto).join(", ") || "Sin responsable"}
                </span>
              </span>
              <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
            </Link>
          </li>
          {visibles.map(({ nodo, nivel }) => {
            const e = estadoPuesto(datos, nodo.clave);
            return (
              <li key={nodo.clave} className="border-b last:border-b-0">
                <Link
                  href={enlaces.puesto(nodo.clave)}
                  scroll={false}
                  className={cn(
                    "flex min-h-11 items-center gap-2 px-3 py-2 text-[13.5px] hover:bg-muted/50",
                    nivel > 0 && "pl-7",
                  )}
                >
                  <span className={cn("min-w-0 flex-1", e.vacante && "border-l-2 border-dashed border-muted-foreground/60 pl-2")}>
                    <span className="block font-medium">{nodo.titulo}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
                      {nodo.fuenteOcupantes === "cuadrillas" ? `${personasDe(datos, nodo.clave).length} cuadrillas` : nodo.rol}
                      <ChipsEstado datos={datos} clave={nodo.clave} />
                      <MarcaCambio marca={marcas.get(nodo.clave)} />
                    </span>
                  </span>
                  <GrupoAvatares personas={personasDe(datos, nodo.clave)} max={2} enlazar={false} />
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
          {ocultos > 0 && (
            <li className="px-3 py-2 text-[12.5px] text-muted-foreground">
              +{ocultos} {ocultos === 1 ? "puesto más" : "puestos más"}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
