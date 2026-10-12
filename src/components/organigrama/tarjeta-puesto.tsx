"use client";

// La tarjeta de un puesto en el mapa: franja de área (3 px), título, rol, avatares de los
// ocupantes y, si corresponde, un chip de estado. Toda la tarjeta lleva a la ficha
// (?puesto=…) con un link "estirado"; los avatares y el menú ⋯ quedan por encima (z-10)
// para no anidar elementos interactivos.
//
// Estado ≠ color de área: los estados son chips con ícono y texto, y la vacante suma el borde
// punteado como segundo canal.

import Link from "next/link";
import { Chip } from "@/components/permisos-via-publica/ui";
import { areaDe, estadoPuesto, ocupantesVigentes, personaDe } from "@/lib/organigrama/arbol";
import type { DatosOrg, Nodo, Persona, TipoCambio } from "@/lib/organigrama/tipos";
import { cn } from "@/lib/utils";
import { clasesArea } from "./colores-area";
import { GrupoAvatares, useEnlaces } from "./fila-ocupante";
import { MenuNodo } from "./menu-borrador";
import { useOrg } from "./proveedor";

export type Filtro = "todo" | "vacantes" | "interinos" | "bajas";

export function coincideFiltro(datos: DatosOrg, clave: string, filtro: Filtro): boolean {
  if (filtro === "todo") return true;
  const e = estadoPuesto(datos, clave);
  return filtro === "vacantes" ? e.vacante : filtro === "interinos" ? e.interino : e.baja;
}

export function personasDe(datos: DatosOrg, clave: string): Persona[] {
  return ocupantesVigentes(datos, clave)
    .map((o) => personaDe(datos.personas, o.persona))
    .filter((p): p is Persona => !!p);
}

/** Los chips de estado de un puesto (los mismos en el mapa, el celular y la búsqueda). */
export function ChipsEstado({ datos, clave }: { datos: DatosOrg; clave: string }) {
  const e = estadoPuesto(datos, clave);
  return (
    <>
      {e.vacante && (e.interino ? <Chip tono="marcha">Interino</Chip> : <Chip tono="aviso">Vacante</Chip>)}
      {e.baja && <Chip tono="bloqueo">Dado de baja</Chip>}
      {e.externo && <Chip tono="neutro">Externo</Chip>}
    </>
  );
}

export function MarcaCambio({ marca }: { marca?: TipoCambio }) {
  if (!marca || marca === "eliminado") return null;
  return (
    <Chip tono="neutro" sinIcono className="border border-dashed border-muted-foreground/50">
      {marca}
    </Chip>
  );
}

export function TarjetaPuesto({ nodo, nivel = 0, marca }: { nodo: Nodo; nivel?: number; marca?: TipoCambio }) {
  const { datos, enBorrador } = useOrg();
  const enlaces = useEnlaces();
  const area = clasesArea(areaDe(datos.nodos, nodo.clave)?.color);
  const e = estadoPuesto(datos, nodo.clave);
  const personas = personasDe(datos, nodo.clave);
  const deCuadrillas = nodo.fuenteOcupantes === "cuadrillas";

  return (
    <div
      className={cn(
        "relative rounded-md border border-l-[3px] bg-card px-3 py-2.5 has-[a[data-estirado]:focus-visible]:ring-2 has-[a[data-estirado]:focus-visible]:ring-ring",
        area.franja,
        e.vacante && "border-dashed",
        nivel === 1 && "ml-4",
        nivel >= 2 && "ml-8",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href={enlaces.puesto(nodo.clave)}
            scroll={false}
            data-estirado
            className="block text-[13.5px] leading-snug font-medium outline-none after:absolute after:inset-0 after:rounded-md"
          >
            {nodo.titulo}
          </Link>
          {nodo.rol && <p className="truncate text-[12px] text-muted-foreground">{nodo.rol}</p>}
        </div>
        {enBorrador && <MenuNodo nodo={nodo} className="relative z-10 -mt-1 -mr-1.5 max-md:hidden" />}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <GrupoAvatares personas={personas} />
        {deCuadrillas && <span className="text-[12px] text-muted-foreground">{personas.length} cuadrillas</span>}
        <ChipsEstado datos={datos} clave={nodo.clave} />
        <MarcaCambio marca={marca} />
      </div>
    </div>
  );
}
