"use client";

// El mapa por columnas (docs/organigrama/propuesta.md § 3.5). El organigrama de ABA es ancho y
// bajo —3 niveles, como mucho 7 puestos por área—, así que no hace falta un lienzo con zoom:
// la Dirección arriba y una columna por área, que entra en una notebook y en una A4 apaisada.
// En el celular (< md) se convierte en una lista de áreas desplegables.
//
// Los conectores son bordes CSS simples (una vertical desde la Dirección y una horizontal sobre
// las columnas), sin pseudo-elementos que dependan de cuántos hijos hay.

import Link from "next/link";
import { hijos, marcasDeCambio, nombreCompleto, raiz } from "@/lib/organigrama/arbol";
import type { TipoCambio } from "@/lib/organigrama/tipos";
import { cn } from "@/lib/utils";
import { AreaMovil, FilaDireccionMovil } from "./area-movil";
import { clasesArea } from "./colores-area";
import { ColumnaArea } from "./columna-area";
import { GrupoAvatares, useEnlaces } from "./fila-ocupante";
import { MenuNodo } from "./menu-borrador";
import { useOrg } from "./proveedor";
import { MarcaCambio, personasDe, TarjetaPuesto, type Filtro } from "./tarjeta-puesto";

export function Mapa({ filtro, areaAbierta }: { filtro: Filtro; areaAbierta?: string }) {
  const { datos, enBorrador, cambios } = useOrg();
  const enlaces = useEnlaces();
  const dg = raiz(datos.nodos);
  if (!dg) return null;
  const marcas: Map<string, TipoCambio> = enBorrador ? marcasDeCambio(cambios) : new Map();
  const debajo = hijos(datos.nodos, dg.clave);
  const areas = debajo.filter((x) => x.tipo !== "puesto");
  const directos = debajo.filter((x) => x.tipo === "puesto");
  const c = clasesArea(dg.color);
  const responsables = personasDe(datos, dg.clave);
  const cols = Math.max(1, areas.length);

  return (
    <>
      {/* Escritorio y tablet */}
      <div className="hidden md:block">
        <div
          className={cn(
            "relative mx-auto max-w-md rounded-md border border-l-[3px] bg-card px-4 py-3 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring",
            c.franja,
          )}
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Link
                href={enlaces.puesto(dg.clave)}
                scroll={false}
                className="block text-[14px] font-semibold tracking-wide outline-none after:absolute after:inset-0 after:rounded-md"
              >
                {dg.titulo}
              </Link>
              <p className="text-[12.5px] text-muted-foreground">
                {dg.rol}
                {responsables.length > 0 && ` · ${responsables.map(nombreCompleto).join(", ")}`}
              </p>
            </div>
            <GrupoAvatares personas={responsables} />
            {enBorrador && <MenuNodo nodo={dg} className="relative z-10 -mt-1 -mr-2" />}
          </div>
          <MarcaCambio marca={marcas.get(dg.clave)} />
        </div>

        <div aria-hidden className="mx-auto h-4 w-px bg-border" />

        {directos.length > 0 && (
          <div className="mx-auto mb-2 max-w-3xl">
            <p className="mb-1.5 text-center text-[12px] text-muted-foreground">Dependen directo de la Dirección</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {directos.map((x) => (
                <TarjetaPuesto key={x.clave} nodo={x} marca={marcas.get(x.clave)} />
              ))}
            </div>
            <div aria-hidden className="mx-auto h-4 w-px bg-border" />
          </div>
        )}

        {/* La horizontal va de la mitad de la primera columna a la mitad de la última. */}
        <div aria-hidden className="hidden border-t lg:block" style={{ marginInline: `calc(100% / ${cols * 2})` }} />
        <div
          className="grid gap-3 md:grid-cols-2 lg:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
          style={{ "--cols": cols } as React.CSSProperties}
        >
          {areas.map((a) => (
            <div key={a.clave} className="min-w-0">
              <div aria-hidden className="mx-auto hidden h-3 w-px bg-border lg:block" />
              <ColumnaArea area={a} filtro={filtro} marcas={marcas} />
            </div>
          ))}
        </div>
      </div>

      {/* Celular */}
      <div className="grid gap-2 md:hidden">
        <FilaDireccionMovil nodo={dg} />
        {directos.map((x) => (
          <TarjetaPuesto key={x.clave} nodo={x} marca={marcas.get(x.clave)} />
        ))}
        {areas.map((a) => (
          <AreaMovil key={`${a.clave}-${areaAbierta ?? ""}`} area={a} filtro={filtro} marcas={marcas} abiertaDeEntrada={a.clave === areaAbierta} />
        ))}
      </div>
    </>
  );
}
