"use client";

// Estados del organigrama que salen de los datos reales: cargando (esqueletos con la misma
// forma que el contenido), error y vacío.

import { useState } from "react";
import { Network } from "lucide-react";
import { Aviso } from "@/components/permisos-via-publica/ui";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrg } from "./proveedor";

/** 1 tarjeta arriba y 5 columnas de 3 rectángulos (celular: 6 filas). */
export function EsqueletoMapa() {
  return (
    <div aria-busy="true" aria-label="Cargando el organigrama">
      <div className="hidden md:block">
        <Skeleton className="mx-auto h-16 max-w-md" />
        <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="grid gap-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-2 md:hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    </div>
  );
}

export function EsqueletoLista() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="overflow-hidden rounded-md border bg-card">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b px-3 py-3 last:border-b-0">
          <Skeleton className="size-8 rounded-full" />
          <div className="grid flex-1 gap-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** El lienzo mientras carga: la misma caja, latiendo. */
export function EsqueletoLienzo() {
  return <div aria-busy="true" aria-label="Cargando el organigrama" className="h-[calc(100dvh-16.5rem)] min-h-[540px] animate-pulse rounded-xl border bg-card" />;
}

export type FormaEstado = "mapa" | "lista" | "lienzo";

/**
 * Lo que se ve mientras el organigrama no está listo: cargando (esqueleto con la forma de la
 * pantalla), error (con el mensaje del servidor y «Reintentar») o vacío (no hay ninguna versión
 * publicada; un editor la puede sembrar con la estructura base).
 */
export function EstadoCarga({ forma }: { forma: FormaEstado }) {
  const { carga, errorCarga, reintentar, puedeEditar, sembrar } = useOrg();
  const [sembrando, setSembrando] = useState(false);
  if (carga === "cargando") return forma === "lista" ? <EsqueletoLista /> : forma === "lienzo" ? <EsqueletoLienzo /> : <EsqueletoMapa />;
  if (carga === "error") {
    return (
      <Aviso tono="bloqueo" titulo="No pudimos cargar el organigrama. Probá recargar.">
        <span className="block">{errorCarga ? `El servidor contestó: «${errorCarga}»` : null}</span>
        <Button variant="outline" className="mt-2 h-9 max-sm:h-10" onClick={reintentar}>
          Reintentar
        </Button>
      </Aviso>
    );
  }
  return (
    <div className="rounded-md border bg-card">
      <EmptyState
        icon={Network}
        title="Todavía no hay un organigrama publicado"
        description={puedeEditar ? "Podés arrancar desde la estructura base de ABA y ajustarla en el borrador." : "Cuando Dirección lo publique, lo vas a ver acá."}
      >
        {puedeEditar && (
          <Button
            className="h-9 max-sm:h-10"
            disabled={sembrando}
            onClick={async () => {
              setSembrando(true);
              await sembrar();
              setSembrando(false);
            }}
          >
            {sembrando ? "Cargando…" : "Empezar desde la estructura base"}
          </Button>
        )}
      </EmptyState>
    </div>
  );
}
