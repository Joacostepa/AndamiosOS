"use client";

// Mapa (pestaña 1): el buscador «¿A quién le pregunto?» arriba, filtros y el mapa por columnas.
// ?puesto= y ?persona= abren la hoja lateral (las pinta el layout); ?demo=cargando|vacio|error
// muestra los estados de demo. Usa useSearchParams: va dentro de <Suspense> (Next 16).

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Chip } from "@/components/permisos-via-publica/ui";
import { BarraBorrador } from "@/components/organigrama/barra-borrador";
import { CampoBusqueda, ResultadosBusqueda } from "@/components/organigrama/buscador";
import { EsqueletoMapa, EstadoDemo, leerDemo } from "@/components/organigrama/estados-demo";
import { FiltrosMapa } from "@/components/organigrama/filtros-mapa";
import { Mapa } from "@/components/organigrama/mapa";
import { useOrg } from "@/components/organigrama/proveedor";
import type { Filtro } from "@/components/organigrama/tarjeta-puesto";
import { TuLugar } from "@/components/organigrama/tu-lugar";
import { areaDe, fechaCorta, puestosDePersona } from "@/lib/organigrama/arbol";

function VistaMapa() {
  const params = useSearchParams();
  const demo = leerDemo(params.get("demo"));
  const { datos, enBorrador, puedeEditar, busqueda, version, estado, cambios, usuario } = useOrg();
  const [filtro, setFiltro] = useState<Filtro>("todo");

  // En el celular arranca abierta el área de quien mira (la del capataz, Operaciones), o ninguna.
  const miPuesto = usuario ? puestosDePersona(datos, usuario.id)[0] : undefined;
  const miArea = miPuesto ? areaDe(datos.nodos, miPuesto.nodo.clave)?.clave : undefined;

  return (
    <div className="space-y-3">
      {enBorrador && <BarraBorrador />}

      <div className="-mx-1 bg-background px-1 py-1 max-md:sticky max-md:top-0 max-md:z-10">
        <CampoBusqueda />
      </div>

      {busqueda.trim() ? (
        <ResultadosBusqueda />
      ) : demo ? (
        <EstadoDemo demo={demo} puedeEditar={puedeEditar} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <FiltrosMapa datos={datos} filtro={filtro} onCambiar={setFiltro} />
            <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
              {enBorrador ? (
                <span>Mirando el borrador · basado en la versión {version?.numero}</span>
              ) : (
                version && (
                  <span>
                    Versión {version.numero} · vigente desde {fechaCorta(version.fecha)}
                  </span>
                )
              )}
              {puedeEditar && !enBorrador && estado.borrador && (
                <Chip tono="neutro" sinIcono>
                  Borrador con {cambios.length} {cambios.length === 1 ? "cambio" : "cambios"}
                </Chip>
              )}
            </p>
          </div>
          <TuLugar />
          <Mapa filtro={filtro} areaAbierta={puedeEditar ? undefined : miArea} />
        </>
      )}
    </div>
  );
}

export default function OrganigramaPage() {
  return (
    <Suspense fallback={<EsqueletoMapa />}>
      <VistaMapa />
    </Suspense>
  );
}
