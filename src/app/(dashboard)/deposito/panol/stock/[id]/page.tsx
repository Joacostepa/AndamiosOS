"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, PackageX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Chip, Seccion } from "@/components/permisos-via-publica/ui";
import { usePuedeEditar } from "@/components/providers/acceso-provider";
import { DialogoAltaUnidades } from "@/components/panol/oficina/catalogo/dialogo-alta-unidades";
import { DialogoIngreso } from "@/components/panol/oficina/catalogo/dialogo-ingreso";
import {
  BarrasConsumo, EditorArticulo, ExistenciasPorLugar, TarjetaArticulo, UnidadesDelArticulo,
} from "@/components/panol/oficina/catalogo/ficha-articulo";
import { TablaMovimientos } from "@/components/panol/oficina/catalogo/tabla-movimientos";
import { useCatalogoPanol } from "@/hooks/use-panol";
import { useMovimientosFiltrados } from "@/hooks/use-panol-catalogo";
import { consumoPorSemana, lunesDe, promedioSemanal } from "@/lib/panol/consumo";
import { hoyBA } from "@/lib/panol/estado";
import { TIPO_ARTICULO } from "@/lib/panol/tipos";

// Ficha de un artículo (docs/panol/modulo.md §1, artboard Oficina-Articulo).
//
// ARRIBA LA TARJETA DE ESTADO con UN botón coral: "Cargar ingreso de compra" (o "Dar de alta
// unidades" si es una herramienta con número, que no entra por cantidad). Debajo, lo que se
// edita (Stock), dónde está cada cosa, el consumo de 8 semanas y el historial, que NO se
// edita: un encargado anula con motivo y queda el inverso enlazado.

const POR_PAGINA = 25;

export default function FichaArticuloPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const encargado = usePuedeEditar("panol");
  const cat = useCatalogoPanol();
  const [pagina, setPagina] = useState(0);
  const [ingreso, setIngreso] = useState(false);
  const [alta, setAlta] = useState(false);

  // Las 8 semanas (la actual incluida): desde el lunes de hace 7 semanas, a la medianoche
  // de Buenos Aires.
  const hoy = hoyBA();
  const desdeISO = useMemo(() => {
    const d = new Date(lunesDe(hoy) + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 49);
    return `${d.toISOString().slice(0, 10)}T00:00:00-03:00`;
  }, [hoy]);
  const consumoQ = useMovimientosFiltrados({ articuloId: id, soloConsumo: true, desdeISO }, 0, 1000);
  const ultimoIngreso = useMovimientosFiltrados({ articuloId: id, tipo: "ingreso" }, 0, 1);
  const movs = useMovimientosFiltrados({ articuloId: id }, pagina, POR_PAGINA);

  const art = cat.data?.articulos.find((a) => a.id === id) ?? null;
  const semanas = useMemo(() => consumoPorSemana(consumoQ.data?.filas ?? [], id, hoy, 8), [consumoQ.data, id, hoy]);
  const promedio = promedioSemanal(semanas);

  if (cat.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4" aria-busy>
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (!art) {
    return (
      <EmptyState icon={PackageX} title="Ese artículo no existe" description="Puede que lo hayan dado de baja.">
        <Link href="/deposito/panol/stock" className="text-[13px] underline">Volver al stock</Link>
      </EmptyState>
    );
  }

  const ultimo = ultimoIngreso.data?.filas[0] ?? null;
  const ultimoValido = ultimo && !ultimoIngreso.data?.anulados.has(ultimo.id) ? ultimo : null;
  const total = movs.data?.total ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <nav aria-label="Migas" className="flex items-center gap-1 text-[13px] text-muted-foreground">
        <Link href="/deposito/panol/stock" className="hover:underline">Stock</Link>
        <ChevronRight aria-hidden className="size-3.5" />
        <span className="truncate text-foreground">{art.nombre}</span>
      </nav>
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{art.nombre}</h1>
        {art.tipo !== "insumo" && <Chip>{TIPO_ARTICULO[art.tipo].titulo}</Chip>}
        {art.seguridad_critica && <Chip tono="marcha" sinIcono>Seguridad crítica</Chip>}
        {!art.activo && <Chip>Dado de baja</Chip>}
      </header>

      <TarjetaArticulo
        art={art}
        promedio={promedio}
        ultimoIngreso={ultimoValido}
        encargado={encargado}
        onPrincipal={() => (art.tipo === "herramienta" ? setAlta(true) : setIngreso(true))}
      />

      <EditorArticulo art={art} encargado={encargado} />

      {art.tipo === "herramienta" ? (
        <UnidadesDelArticulo art={art} />
      ) : (
        <ExistenciasPorLugar art={art} />
      )}

      {art.tipo === "insumo" && <BarrasConsumo semanas={semanas} promedio={promedio} unidad={art.unidad} />}

      <Seccion titulo="Movimientos" accion={<span className="text-[12px] text-muted-foreground">No se edita: un encargado puede anular, con motivo</span>}>
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
        <>
          <DialogoIngreso open={ingreso} onOpenChange={setIngreso} articuloId={art.id} />
          <DialogoAltaUnidades open={alta} onOpenChange={setAlta} articuloId={art.id} />
        </>
      )}
    </div>
  );
}
