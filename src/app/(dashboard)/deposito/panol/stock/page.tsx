"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Package, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Aviso, Chip } from "@/components/permisos-via-publica/ui";
import { usePuedeEditar } from "@/components/providers/acceso-provider";
import { DialogoAltaArticulo } from "@/components/panol/oficina/catalogo/dialogo-alta-articulo";
import { DialogoAltaUnidades } from "@/components/panol/oficina/catalogo/dialogo-alta-unidades";
import { DialogoIngreso } from "@/components/panol/oficina/catalogo/dialogo-ingreso";
import { rutaUbicacion, SelectorUbicacion } from "@/components/panol/oficina/catalogo/selector-ubicacion";
import { useCatalogoPanol, useInvalidarPanol } from "@/hooks/use-panol";
import { formatoCantidad, resolverSinAlta, useSubarbol } from "@/hooks/use-panol-catalogo";
import { bajoMinimo, existencias, sugeridoReponer } from "@/lib/panol/estado";
import { TIPO_ARTICULO, type TipoArticulo } from "@/lib/panol/tipos";
import { cn } from "@/lib/utils";

// Stock: la lista de artículos del pañol con lo que hay adentro y lo que está afuera.
//
// UNA SEÑAL POR FILA: "Negativo" (rojo, hay un error de carga que revisar) o "Bajo mínimo"
// (ámbar, con cuánto pedir). Lo normal no lleva marca.
//
// Entradas por URL: ?ubicacion=<id> (el QR de un estante abre esto filtrado), ?nuevo=<texto>
// (la bandeja: "dar de alta lo que alguien se llevó sin código"; con &sin_alta=<id> lo
// marca resuelto al crear) y ?ingreso=1[&articulo=<id>].

type FiltroTipo = TipoArticulo | "";

export default function StockPage() {
  return (
    <Suspense fallback={<Esqueleto />}>
      <Stock />
    </Suspense>
  );
}

function Esqueleto() {
  return (
    <div className="mx-auto max-w-6xl space-y-4" aria-busy>
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-10 w-full max-w-xl" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}

function Stock() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const encargado = usePuedeEditar("panol");
  const { data, isLoading, error } = useCatalogoPanol();
  const invalidar = useInvalidarPanol();

  const [busqueda, setBusqueda] = useState("");
  const [tipo, setTipo] = useState<FiltroTipo>("");
  const [ubicacion, setUbicacion] = useState<string | null>(params.get("ubicacion"));
  const [soloBajo, setSoloBajo] = useState(params.get("bajo") === "1");
  const [alta, setAlta] = useState(params.has("nuevo"));
  const [ingreso, setIngreso] = useState(params.get("ingreso") === "1");
  const [unidadesDe, setUnidadesDe] = useState<string | null>(null);

  const subarbol = useSubarbol(data?.ubicaciones ?? [], ubicacion);

  /** Saca de la URL lo que abrió un diálogo, para que recargar no lo vuelva a abrir. */
  function limpiar(...claves: string[]) {
    const p = new URLSearchParams(params.toString());
    claves.forEach((c) => p.delete(c));
    router.replace(p.size ? `${pathname}?${p}` : pathname, { scroll: false });
  }

  const filas = useMemo(() => {
    if (!data) return [];
    const q = busqueda.trim().toLowerCase();
    return data.articulos
      .filter((a) => a.activo)
      .map((a) => {
        const e = existencias(data.saldos, a.id);
        const aca = subarbol
          ? data.saldos.filter((s) => s.articulo_id === a.id && s.lugar.startsWith("u:") && subarbol.has(s.lugar.slice(2))).reduce((t, s) => t + s.cantidad, 0)
          : null;
        return { a, e, aca, bajo: bajoMinimo(e.enPanol, a.minimo), sugerido: sugeridoReponer(e.enPanol, a.minimo, a.reponer_hasta, a.unidad_compra ? Number(a.factor_compra) : 1) };
      })
      .filter(({ a, aca, bajo }) =>
        (!tipo || a.tipo === tipo) &&
        (!soloBajo || bajo) &&
        (!subarbol || (a.ubicacion_id && subarbol.has(a.ubicacion_id)) || (aca ?? 0) !== 0) &&
        (!q || [a.nombre, a.codigo_barras, a.proveedor].some((t) => t?.toLowerCase().includes(q))),
      );
  }, [data, busqueda, tipo, soloBajo, subarbol]);

  if (isLoading) return <Esqueleto />;
  if (error || !data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Stock</h1>
        <Aviso tono="bloqueo" titulo="No se pudo leer el stock">{error instanceof Error ? error.message : "Error desconocido"}</Aviso>
      </div>
    );
  }

  const activos = data.articulos.filter((a) => a.activo);
  const nBajo = activos.filter((a) => bajoMinimo(existencias(data.saldos, a.id).enPanol, a.minimo)).length;
  const nombreUbicacion = rutaUbicacion(data.ubicaciones, ubicacion);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Stock</h1>
          <p className="text-[13px] text-muted-foreground">
            {activos.length} artículos ·{" "}
            <button type="button" onClick={() => setSoloBajo(!soloBajo)} className={cn("underline-offset-2 hover:underline", nBajo > 0 && "font-semibold text-foreground")}>
              {nBajo} bajo mínimo
            </button>
          </p>
        </div>
        {encargado && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setIngreso(true)}>Ingreso de compra</Button>
            <Button onClick={() => setAlta(true)}><Plus className="size-4" /> Nuevo artículo</Button>
          </div>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-60 sm:max-w-sm">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre, código o proveedor" aria-label="Buscar artículos" className="h-9 pl-8" />
        </label>
        <div role="group" aria-label="Tipo de artículo" className="inline-flex overflow-hidden rounded-md border bg-background">
          {([["", "Todos"], ["insumo", "Insumos"], ["herramienta", "Con número"], ["granel", "A granel"]] as const).map(([v, t], i) => (
            <button
              key={v}
              type="button"
              aria-pressed={tipo === v}
              onClick={() => setTipo(v)}
              className={cn("h-9 px-3 text-[13px]", i > 0 && "border-l", tipo === v ? "bg-foreground font-semibold text-background" : "hover:bg-muted")}
            >
              {t}
            </button>
          ))}
        </div>
        <SelectorUbicacion
          ubicaciones={data.ubicaciones}
          value={ubicacion}
          onChange={(id) => { setUbicacion(id); if (params.has("ubicacion")) limpiar("ubicacion"); }}
          vacio="Todas las ubicaciones"
          aria-label="Filtrar por ubicación"
          className="w-auto max-w-64"
        />
        <label className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-[13px]">
          <input type="checkbox" checked={soloBajo} onChange={(e) => setSoloBajo(e.target.checked)} className="size-4 accent-foreground" />
          Sólo bajo mínimo
        </label>
      </div>

      {nombreUbicacion && <p className="text-[13px] text-muted-foreground">En {nombreUbicacion} y lo que cuelga de ahí.</p>}

      {filas.length === 0 ? (
        <EmptyState icon={Package} title={activos.length === 0 ? "Todavía no hay artículos" : "Nada con esos filtros"}
          description={activos.length === 0 ? "Empezá por dar de alta lo que más se retira." : "Probá sacar algún filtro."}>
          {encargado && activos.length === 0 && <Button variant="outline" onClick={() => setAlta(true)}>Nuevo artículo</Button>}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full min-w-[44rem] text-[13px]">
            <thead className="text-left text-[12px] text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2 font-medium">Artículo</th>
                <th className="px-3 py-2 font-medium">Ubicación</th>
                <th className="px-3 py-2 text-right font-medium">En pañol</th>
                <th className="px-3 py-2 text-right font-medium">Afuera</th>
                <th className="px-3 py-2 text-right font-medium">Mínimo</th>
                <th className="px-3 py-2 font-medium"><span className="sr-only">Estado</span></th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ a, e, aca, bajo, sugerido }) => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-3 py-2">
                    <Link href={`/deposito/panol/stock/${a.id}`} className="font-medium underline-offset-2 hover:underline">{a.nombre}</Link>
                    {a.tipo !== "insumo" && <span className="block text-[12px] text-muted-foreground">{TIPO_ARTICULO[a.tipo].titulo}{a.seguridad_critica ? " · seguridad crítica" : ""}</span>}
                  </td>
                  <td className="px-3 py-2 text-foreground/80">{rutaUbicacion(data.ubicaciones, a.ubicacion_id) ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {formatoCantidad(e.enPanol)} {a.unidad}
                    {aca !== null && aca !== e.enPanol && <span className="block text-[12px] text-muted-foreground">acá {formatoCantidad(aca)}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-foreground/80">
                    {e.afuera ? formatoCantidad(e.afuera) : "—"}
                    {e.faltante > 0 && <span className="block text-[12px] text-amber-800 dark:text-amber-300">{formatoCantidad(e.faltante)} faltante</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">{a.minimo !== null ? formatoCantidad(Number(a.minimo)) : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {e.enPanol < 0 ? <Chip tono="bloqueo">Negativo</Chip>
                      : bajo ? <Chip tono="aviso">Bajo mínimo · pedir {formatoCantidad(sugerido)}</Chip> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {encargado && (
        <>
          <DialogoAltaArticulo
            open={alta}
            nombreInicial={params.get("nuevo") ?? ""}
            onOpenChange={(o) => { setAlta(o); if (!o && params.has("nuevo")) limpiar("nuevo", "sin_alta"); }}
            onCreado={(a) => {
              setAlta(false);
              const sinAlta = params.get("sin_alta");
              // Después de resolver hay que volver a invalidar: la del alta ya corrió y la
              // bandeja seguiría mostrando el pendiente.
              if (sinAlta) resolverSinAlta(sinAlta, a.id).then(invalidar, (e: unknown) => toast.error(`No se pudo marcar como resuelto en la bandeja: ${e instanceof Error ? e.message : e}`));
              if (a.tipo === "herramienta") {
                setUnidadesDe(a.id);
                if (params.has("nuevo")) limpiar("nuevo", "sin_alta");
              }
              else router.push(`/deposito/panol/stock/${a.id}`);
            }}
          />
          <DialogoIngreso
            open={ingreso}
            articuloId={params.get("articulo") ?? undefined}
            onOpenChange={(o) => { setIngreso(o); if (!o && params.has("ingreso")) limpiar("ingreso", "articulo"); }}
          />
          <DialogoAltaUnidades open={!!unidadesDe} articuloId={unidadesDe ?? undefined} onOpenChange={(o) => !o && setUnidadesDe(null)} />
        </>
      )}
    </div>
  );
}
