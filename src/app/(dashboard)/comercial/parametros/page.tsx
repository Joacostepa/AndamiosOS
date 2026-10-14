"use client";

import { SlidersHorizontal, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePuedeEditar } from "@/components/providers/acceso-provider";
import { useParametrosCotizacion } from "@/hooks/use-parametros-cotizacion";
import { Tarifas } from "@/components/parametros-cotizacion/tarifas";
import { ListaDeAlquiler } from "@/components/parametros-cotizacion/lista-alquiler";
import { Criterio } from "@/components/parametros-cotizacion/criterio";
import { ProductosOdoo } from "@/components/parametros-cotizacion/productos-odoo";
import { Renders } from "@/components/parametros-cotizacion/renders";
import { Historial } from "@/components/parametros-cotizacion/historial";
import { Vendedores } from "@/components/parametros-cotizacion/vendedores";

// Parámetros de cotización — todo lo que el asistente comercial usa para cotizar.
//
// TRES COSAS DISTINTAS Y POR ESO TRES PESTAÑAS PRINCIPALES: los números (Tarifas), la lista
// de piezas (Lista de alquiler) y el criterio escrito (Criterio). Antes vivían mezclados en
// un documento, y cambiar una tarifa ahí no garantizaba que se aplicara: en agosto 80 de 150
// líneas de bandeja seguían a precio de mayo. Acá lo que se cambia es lo que usa el motor.

export default function ParametrosCotizacionPage() {
  const { data, isLoading, error } = useParametrosCotizacion();
  const puedeEditar = usePuedeEditar("parametros-cotizacion");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Parámetros de cotización" />
        <EmptyState icon={TriangleAlert} title="No se pudieron leer los parámetros" description={error instanceof Error ? error.message : undefined} />
      </div>
    );
  }

  const recargo = data.parametros.find((p) => p.clave === "alquiler_recargo_lista_pct")?.valor ?? null;
  const sinVerificar = data.productos.filter((p) => p.verificado_ok !== true).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Parámetros de cotización"
        description="Lo que usa el asistente para cotizar. Cada cambio queda en el historial con quién, cuándo y por qué."
      />

      <div className="flex flex-wrap gap-2 text-[12px]">
        <span className="rounded-md border border-border px-2.5 py-1">
          Lista vigente: <span className="font-medium">{data.listaVigente ? `${data.listaVigente.id} (${data.listaVigente.piezas} piezas)` : "ninguna"}</span>
        </span>
        <span className="rounded-md border border-border px-2.5 py-1">
          Criterio: <span className="font-medium">{data.criterioVigente ? `versión ${data.criterioVigente.version}` : "sin cargar"}</span>
        </span>
        <span className={`rounded-md border px-2.5 py-1 ${sinVerificar ? "border-orange-500/40 text-orange-400" : "border-border"}`}>
          Productos de Odoo: <span className="font-medium">{sinVerificar ? `${sinVerificar} sin verificar` : "verificados"}</span>
        </span>
        {!puedeEditar && (
          <span className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-muted-foreground">
            <SlidersHorizontal className="size-3.5" /> Sólo lectura
          </span>
        )}
      </div>

      <Tabs defaultValue="tarifas">
        <TabsList className="flex-wrap">
          <TabsTrigger value="tarifas">Tarifas</TabsTrigger>
          <TabsTrigger value="lista">Lista de alquiler</TabsTrigger>
          <TabsTrigger value="criterio">Criterio</TabsTrigger>
          <TabsTrigger value="productos">Productos de Odoo</TabsTrigger>
          <TabsTrigger value="renders">Renders</TabsTrigger>
          <TabsTrigger value="vendedores">Vendedores</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="tarifas" className="pt-2">
          <Tarifas parametros={data.parametros} puedeEditar={puedeEditar} />
        </TabsContent>
        <TabsContent value="lista" className="pt-2">
          <ListaDeAlquiler puedeEditar={puedeEditar} recargoPct={recargo} />
        </TabsContent>
        <TabsContent value="criterio" className="pt-2">
          <Criterio puedeEditar={puedeEditar} />
        </TabsContent>
        <TabsContent value="productos" className="pt-2">
          <ProductosOdoo productos={data.productos} puedeEditar={puedeEditar} />
        </TabsContent>
        <TabsContent value="renders" className="pt-2">
          <Renders puedeEditar={puedeEditar} />
        </TabsContent>
        <TabsContent value="vendedores" className="pt-2">
          <Vendedores puedeEditar={puedeEditar} />
        </TabsContent>
        <TabsContent value="historial" className="pt-2">
          <Historial parametros={data.parametros} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
