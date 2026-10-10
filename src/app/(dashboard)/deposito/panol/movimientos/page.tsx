"use client";

import { Suspense, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Aviso } from "@/components/permisos-via-publica/ui";
import { usePuedeEditar } from "@/components/providers/acceso-provider";
import { SelectorCuadrilla, SelectorPersona } from "@/components/panol/oficina/catalogo/selector-persona";
import { TablaMovimientos } from "@/components/panol/oficina/catalogo/tabla-movimientos";
import { useCatalogoPanol } from "@/hooks/use-panol";
import { useMovimientosFiltrados, type FiltroMovimientos } from "@/hooks/use-panol-catalogo";
import { TIPO_MOVIMIENTO } from "@/lib/panol/estado";
import type { TipoMovimiento } from "@/lib/panol/tipos";

// Movimientos: el historial completo del pañol, paginado y filtrable.
//
// LOS FILTROS VIVEN EN LA URL (?tipo=retiro&articulo=…&persona=p:<id>&cuadrilla=…&ot=4812
// &desde=…&hasta=…&sin_encargado=1): la bandeja linkea acá "lo que se movió sin nadie a
// cargo", y un link copiado muestra lo mismo a quien lo abre.
//
// Nada se edita: cada fila se puede anular (encargados), con motivo, y queda el inverso.

const POR_PAGINA = 50;

export default function MovimientosPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-6xl" />}>
      <Movimientos />
    </Suspense>
  );
}

function Movimientos() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const encargado = usePuedeEditar("panol");
  const cat = useCatalogoPanol();

  const pagina = Math.max(0, Number(params.get("pagina") ?? 0) || 0);
  const persona = params.get("persona");
  const filtro = useMemo<FiltroMovimientos>(() => {
    const ot = Number(params.get("ot"));
    return {
      tipo: (params.get("tipo") ?? "") as TipoMovimiento | "",
      articuloId: params.get("articulo") ?? undefined,
      quien: persona && /^[px]:/.test(persona) ? { tipo: persona.startsWith("x:") ? "externa" : "persona", id: persona.slice(2) } : null,
      cuadrillaId: params.get("cuadrilla") ?? undefined,
      ot: Number.isInteger(ot) && ot > 0 ? ot : null,
      desde: params.get("desde") ?? undefined,
      hasta: params.get("hasta") ?? undefined,
      sinEncargado: params.get("sin_encargado") === "1",
    };
  }, [params, persona]);
  const movs = useMovimientosFiltrados(filtro, pagina, POR_PAGINA);

  function poner(clave: string, valor: string | null) {
    const p = new URLSearchParams(params.toString());
    if (valor) p.set(clave, valor);
    else p.delete(clave);
    if (clave !== "pagina") p.delete("pagina");
    router.replace(p.size ? `${pathname}?${p}` : pathname, { scroll: false });
  }

  const hayFiltro = [...params.keys()].some((k) => k !== "pagina");
  const total = movs.data?.total ?? 0;
  const articulos = (cat.data?.articulos ?? []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Movimientos</h1>
        <p className="text-[13px] text-muted-foreground">
          {filtro.sinEncargado ? "Lo que se movió en el kiosco sin nadie a cargo." : "Todo lo que entró, salió y pasó de mano. No se edita: se anula, con motivo."}
        </p>
      </header>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <select value={filtro.tipo} onChange={(e) => poner("tipo", e.target.value || null)} aria-label="Tipo de movimiento" className="h-9 rounded-md border bg-background px-2.5 text-[13px]">
          <option value="">Todos los tipos</option>
          {(Object.keys(TIPO_MOVIMIENTO) as TipoMovimiento[]).map((t) => <option key={t} value={t}>{TIPO_MOVIMIENTO[t]}</option>)}
        </select>
        <select value={filtro.articuloId ?? ""} onChange={(e) => poner("articulo", e.target.value || null)} aria-label="Artículo" className="h-9 rounded-md border bg-background px-2.5 text-[13px]">
          <option value="">Todos los artículos</option>
          {articulos.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <SelectorPersona
          value={filtro.quien ?? null}
          onChange={(q) => poner("persona", q ? `${q.tipo === "externa" ? "x" : "p"}:${q.id}` : null)}
          vacio="Todas las personas"
          aria-label="Persona"
        />
        <SelectorCuadrilla value={filtro.cuadrillaId ?? null} onChange={(c) => poner("cuadrilla", c)} vacio="Todas las cuadrillas" aria-label="Cuadrilla" />
        <Input
          key={`ot-${filtro.ot ?? ""}`}
          defaultValue={filtro.ot ?? ""}
          inputMode="numeric"
          placeholder="OT (número)"
          aria-label="Número de OT"
          className="h-9"
          onBlur={(e) => poner("ot", e.target.value.trim() || null)}
          onKeyDown={(e) => { if (e.key === "Enter") poner("ot", (e.target as HTMLInputElement).value.trim() || null); }}
        />
        <label className="flex items-center gap-2 text-[13px]">
          <span className="shrink-0 text-muted-foreground">Desde</span>
          <Input type="date" value={filtro.desde ?? ""} onChange={(e) => poner("desde", e.target.value || null)} className="h-9" />
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <span className="shrink-0 text-muted-foreground">Hasta</span>
          <Input type="date" value={filtro.hasta ?? ""} onChange={(e) => poner("hasta", e.target.value || null)} className="h-9" />
        </label>
        <div className="flex items-center gap-2">
          <label className="inline-flex h-9 flex-1 items-center gap-2 rounded-md border px-3 text-[13px]">
            <input type="checkbox" checked={!!filtro.sinEncargado} onChange={(e) => poner("sin_encargado", e.target.checked ? "1" : null)} className="size-4 accent-foreground" />
            Sin nadie a cargo
          </label>
          {hayFiltro && <Button variant="ghost" onClick={() => router.replace(pathname, { scroll: false })}>Limpiar</Button>}
        </div>
      </div>

      {movs.error ? (
        <Aviso tono="bloqueo" titulo="No se pudo leer el historial">{movs.error instanceof Error ? movs.error.message : "Error desconocido"}</Aviso>
      ) : movs.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="rounded-md border bg-card">
          <TablaMovimientos
            filas={movs.data?.filas ?? []}
            anulados={movs.data?.anulados ?? new Set()}
            puedeAnular={encargado}
            conArticulo
            vacio={hayFiltro ? "Nada con esos filtros." : "Todavía no hay movimientos."}
          />
          {total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-[13px] text-muted-foreground">
              <span>{pagina * POR_PAGINA + 1}–{Math.min(total, (pagina + 1) * POR_PAGINA)} de {total}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={pagina === 0} onClick={() => poner("pagina", pagina > 1 ? String(pagina - 1) : null)}>Más nuevos</Button>
                <Button size="sm" variant="outline" disabled={(pagina + 1) * POR_PAGINA >= total} onClick={() => poner("pagina", String(pagina + 1))}>Más viejos</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
