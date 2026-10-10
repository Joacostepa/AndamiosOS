"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Search, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Aviso, Chip, type TonoChip } from "@/components/permisos-via-publica/ui";
import { usePuedeEditar } from "@/components/providers/acceso-provider";
import { DialogoAltaUnidades } from "@/components/panol/oficina/catalogo/dialogo-alta-unidades";
import { fecha, haceDias } from "@/components/panol/oficina/catalogo/formato";
import { useCatalogoPanol, useParametrosPanol } from "@/hooks/use-panol";
import { useNombreLugar } from "@/hooks/use-panol-catalogo";
import { ESTADO_UNIDAD, hoyBA, inspeccion, noApta, prestamoVencido } from "@/lib/panol/estado";
import type { EstadoUnidad } from "@/lib/panol/tipos";
import { cn } from "@/lib/utils";

// Herramientas con número: cada unidad, dónde está y quién la tiene, desde cuándo, cuándo
// vuelve y cuándo le toca la inspección.
//
// EL ESTADO VA EN TEXTO, Y SÓLO LO QUE NO ES NORMAL LLEVA COLOR: "No apta" (rojo, se calcula
// con la inspección vencida: no sale del pañol), préstamo vencido o faltante (ámbar). Una
// disponible o una afuera en fecha no llevan marca.
//
// ?estado=<estado> y ?articulo=<id> filtran de entrada (los usan la bandeja y la ficha).

type Filtro = EstadoUnidad | "no_apta" | "";

const TONO: Partial<Record<EstadoUnidad, TonoChip>> = {
  en_revision: "aviso", en_mantenimiento: "marcha", fuera_de_servicio: "aviso", faltante: "aviso", perdida: "bloqueo", baja: "neutro",
};

export default function HerramientasPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-80 max-w-6xl" />}>
      <Herramientas />
    </Suspense>
  );
}

function Herramientas() {
  const params = useSearchParams();
  const encargado = usePuedeEditar("panol");
  const { data, isLoading, error } = useCatalogoPanol();
  const parametros = useParametrosPanol();
  const nombre = useNombreLugar();
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState<Filtro>((params.get("estado") as Filtro) ?? "");
  const [articulo, setArticulo] = useState(params.get("articulo") ?? "");
  const [verBajas, setVerBajas] = useState(false);
  const [alta, setAlta] = useState(false);

  const hoy = hoyBA();
  const avisoDias = parametros.data?.aviso_inspeccion_dias ?? 15;
  const articulos = useMemo(() => new Map((data?.articulos ?? []).map((a) => [a.id, a])), [data]);

  const filas = useMemo(() => {
    if (!data) return [];
    const q = busqueda.trim().toLowerCase();
    return data.unidades
      .map((u) => {
        const art = articulos.get(u.articulo_id);
        return { u, art, noApta: noApta(!!art?.seguridad_critica, u.proxima_inspeccion, hoy) };
      })
      .filter(({ u, art, noApta: na }) =>
        (verBajas || estado === "baja" || u.estado !== "baja") &&
        (!estado || (estado === "no_apta" ? na : u.estado === estado)) &&
        (!articulo || u.articulo_id === articulo) &&
        (!q || [u.numero, u.serie, u.marca_modelo, art?.nombre].some((t) => t?.toLowerCase().includes(q))),
      )
      .sort((a, b) => a.u.numero.localeCompare(b.u.numero, "es", { numeric: true }));
  }, [data, articulos, busqueda, estado, articulo, verBajas, hoy]);

  if (isLoading) return <Skeleton className="mx-auto h-80 max-w-6xl" />;
  if (error || !data) {
    return <Aviso tono="bloqueo" titulo="No se pudieron leer las herramientas">{error instanceof Error ? error.message : "Error desconocido"}</Aviso>;
  }

  const activas = data.unidades.filter((u) => u.estado !== "baja");
  const nNoAptas = activas.filter((u) => noApta(!!articulos.get(u.articulo_id)?.seguridad_critica, u.proxima_inspeccion, hoy)).length;
  const herramientas = data.articulos.filter((a) => a.tipo === "herramienta");

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Herramientas</h1>
          <p className="text-[13px] text-muted-foreground">
            {activas.length} unidades · {activas.filter((u) => u.estado === "afuera").length} afuera
            {nNoAptas > 0 && (
              <>
                {" · "}
                <button type="button" onClick={() => setEstado("no_apta")} className="font-semibold text-red-700 underline-offset-2 hover:underline dark:text-red-300">
                  {nNoAptas} no {nNoAptas === 1 ? "apta" : "aptas"}
                </button>
              </>
            )}
          </p>
        </div>
        {encargado && <Button onClick={() => setAlta(true)}><Plus className="size-4" /> Alta de unidades</Button>}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-60 sm:max-w-sm">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Número, serie, marca o artículo" aria-label="Buscar herramientas" className="h-9 pl-8" />
        </label>
        <select value={estado} onChange={(e) => setEstado(e.target.value as Filtro)} aria-label="Filtrar por estado" className="h-9 rounded-md border bg-background px-2.5 text-[13px]">
          <option value="">Todos los estados</option>
          <option value="no_apta">No apta (inspección vencida)</option>
          {(Object.keys(ESTADO_UNIDAD) as EstadoUnidad[]).map((e) => <option key={e} value={e}>{ESTADO_UNIDAD[e]}</option>)}
        </select>
        <select value={articulo} onChange={(e) => setArticulo(e.target.value)} aria-label="Filtrar por artículo" className="h-9 max-w-64 rounded-md border bg-background px-2.5 text-[13px]">
          <option value="">Todos los artículos</option>
          {herramientas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <label className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-[13px]">
          <input type="checkbox" checked={verBajas} onChange={(e) => setVerBajas(e.target.checked)} className="size-4 accent-foreground" />
          Ver las dadas de baja
        </label>
      </div>

      {filas.length === 0 ? (
        <EmptyState icon={Wrench} title={data.unidades.length === 0 ? "Todavía no hay herramientas con número" : "Nada con esos filtros"}
          description={data.unidades.length === 0 ? "Creá el artículo en Stock y dale de alta las unidades: cada una sale con su QR." : "Probá sacar algún filtro."} />
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full min-w-[52rem] text-[13px]">
            <thead className="text-left text-[12px] text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2 font-medium">Número</th>
                <th className="px-3 py-2 font-medium">Artículo</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Dónde / quién</th>
                <th className="px-3 py-2 font-medium">Desde</th>
                <th className="px-3 py-2 font-medium">Vuelve</th>
                <th className="px-3 py-2 font-medium">Próx. inspección</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ u, art, noApta: na }) => {
                const vencido = prestamoVencido(u.vence_el, hoy);
                const insp = inspeccion(u.proxima_inspeccion, hoy, avisoDias);
                return (
                  <tr key={u.id} className={cn("border-b last:border-0 hover:bg-muted/50", u.estado === "baja" && "text-muted-foreground")}>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Link href={`/deposito/panol/herramientas/${u.id}`} className="font-medium tabular-nums underline-offset-2 hover:underline">#{u.numero}</Link>
                    </td>
                    <td className="px-3 py-2">
                      {art ? <Link href={`/deposito/panol/stock/${art.id}`} className="underline-offset-2 hover:underline">{art.nombre}</Link> : "—"}
                      {u.marca_modelo && <span className="block text-[12px] text-muted-foreground">{u.marca_modelo}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {na ? <Chip tono="bloqueo">No apta</Chip>
                        : TONO[u.estado] ? <Chip tono={TONO[u.estado]}>{ESTADO_UNIDAD[u.estado]}</Chip>
                        : ESTADO_UNIDAD[u.estado]}
                    </td>
                    <td className="px-3 py-2 text-foreground/80">
                      {nombre(u.lugar)}
                      {u.odoo_ot_id && <span className="text-muted-foreground"> · OT {u.odoo_ot_id}</span>}
                      {u.estado === "faltante" && u.faltante_de && <span className="block text-[12px] text-muted-foreground">la tenía {nombre(u.faltante_de)}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{haceDias(u.desde_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {u.vence_el ? (vencido ? <Chip tono="aviso">Vencido {fecha(u.vence_el).slice(0, 5)}</Chip> : fecha(u.vence_el).slice(0, 5)) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {!u.proxima_inspeccion ? <span className="text-muted-foreground">{art?.seguridad_critica ? "Sin fecha" : "—"}</span>
                        : insp === "vencida" && !na ? <Chip tono="aviso">Vencida {fecha(u.proxima_inspeccion)}</Chip>
                        : <span className={cn(insp === "por_vencer" && "font-medium text-amber-800 dark:text-amber-300", insp === "vencida" && "text-red-700 dark:text-red-300")}>{fecha(u.proxima_inspeccion)}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {encargado && <DialogoAltaUnidades open={alta} onOpenChange={setAlta} articuloId={articulo || undefined} />}
    </div>
  );
}
