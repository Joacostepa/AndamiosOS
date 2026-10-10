"use client";

import { use, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Seccion } from "@/components/permisos-via-publica/ui";
import { usePuedeEditar } from "@/components/providers/acceso-provider";
import {
  AccionesUnidad, CodigoUnidad, DatosUnidad, DialogoGestion, TarjetaUnidad, type Gestion,
} from "@/components/panol/oficina/catalogo/ficha-unidad";
import { TablaMovimientos } from "@/components/panol/oficina/catalogo/tabla-movimientos";
import { useCatalogoPanol } from "@/hooks/use-panol";
import { useMovimientosFiltrados } from "@/hooks/use-panol-catalogo";
import type { MovGestion } from "@/lib/panol/tipos";

// Ficha de una herramienta con número (artboard Oficina-Ficha).
//
// Arriba la tarjeta de estado con, como mucho, UN botón coral según el estado (en revisión →
// "Resolver revisión", en el taller → "Volvió del taller", faltante → "Apareció"). Debajo,
// las gestiones que piden motivo, los datos de ficha, el QR y el historial (sólo lectura).
// Mantenimiento preventivo y correctivo con taller e inspecciones con checklist son de la
// fase 2 (docs/modulo-panol.md §12): acá alcanza con la próxima fecha de inspección.

const POR_PAGINA = 20;

/** Qué gestión hace el botón coral en cada estado: para no repetirla entre las secundarias. */
const PRINCIPAL: Partial<Record<string, MovGestion>> = {
  en_revision: "revision", fuera_de_servicio: "revision", en_mantenimiento: "taller_vuelta", faltante: "recuperada", perdida: "recuperada",
};

export default function FichaHerramientaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const encargado = usePuedeEditar("panol");
  const cat = useCatalogoPanol();
  const [pagina, setPagina] = useState(0);
  const [gestion, setGestion] = useState<Gestion | null>(null);
  const inspeccionRef = useRef<HTMLInputElement>(null);
  const movs = useMovimientosFiltrados({ unidadId: id }, pagina, POR_PAGINA);
  // El "por qué" del estado actual sale del último movimiento que sigue en pie.
  const recientes = useMovimientosFiltrados({ unidadId: id }, 0, 10);

  const unidad = cat.data?.unidades.find((u) => u.id === id) ?? null;
  const articulo = unidad ? cat.data?.articulos.find((a) => a.id === unidad.articulo_id) ?? null : null;

  if (cat.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4" aria-busy>
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (!unidad || !articulo) {
    return (
      <EmptyState icon={Wrench} title="Esa herramienta no existe">
        <Link href="/deposito/panol/herramientas" className="text-[13px] underline">Volver a herramientas</Link>
      </EmptyState>
    );
  }

  const ultimo = recientes.data?.filas.find((m) => m.tipo !== "anulacion" && !recientes.data?.anulados.has(m.id)) ?? null;
  const total = movs.data?.total ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <nav aria-label="Migas" className="flex items-center gap-1 text-[13px] text-muted-foreground">
        <Link href="/deposito/panol/herramientas" className="hover:underline">Herramientas</Link>
        <ChevronRight aria-hidden className="size-3.5" />
        <span className="text-foreground">#{unidad.numero}</span>
      </nav>
      <header className="space-y-0.5">
        <h1 className="text-2xl font-bold tracking-tight">{articulo.nombre}</h1>
        <p className="text-[14px] tabular-nums text-muted-foreground">#{unidad.numero}{unidad.marca_modelo ? ` · ${unidad.marca_modelo}` : ""}</p>
      </header>

      <TarjetaUnidad
        unidad={unidad}
        articulo={articulo}
        ultimo={ultimo}
        encargado={encargado}
        onGestion={setGestion}
        onInspeccion={() => {
          inspeccionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          inspeccionRef.current?.focus();
        }}
      />

      {encargado && <AccionesUnidad unidad={unidad} onGestion={setGestion} principal={PRINCIPAL[unidad.estado] ?? null} />}

      {/* key: si la ficha cambia afuera (otro encargado), el formulario arranca de nuevo. */}
      <DatosUnidad
        key={`${unidad.serie}|${unidad.marca_modelo}|${unidad.fecha_compra}|${unidad.costo}|${unidad.ubicacion_id}|${unidad.proxima_inspeccion}|${unidad.notas}`}
        unidad={unidad}
        articulo={articulo}
        encargado={encargado}
        inspeccionRef={inspeccionRef}
      />

      <CodigoUnidad unidad={unidad} encargado={encargado} />

      <Seccion titulo="Historial" accion={<span className="text-[12px] text-muted-foreground">Sólo lectura · se corrige con un movimiento nuevo</span>}>
        <TablaMovimientos filas={movs.data?.filas ?? []} anulados={movs.data?.anulados ?? new Set()} puedeAnular={encargado} />
        {total > POR_PAGINA && (
          <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-[13px] text-muted-foreground">
            <span>{pagina * POR_PAGINA + 1}–{Math.min(total, (pagina + 1) * POR_PAGINA)} de {total}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Más nuevos</Button>
              <Button size="sm" variant="outline" disabled={(pagina + 1) * POR_PAGINA >= total} onClick={() => setPagina(pagina + 1)}>Más viejos</Button>
            </div>
          </div>
        )}
      </Seccion>

      {encargado && (
        <DialogoGestion
          key={gestion?.movTipo ?? "cerrado"}
          gestion={gestion}
          unidad={unidad}
          articulo={articulo}
          onOpenChange={(o) => !o && setGestion(null)}
        />
      )}
    </div>
  );
}
