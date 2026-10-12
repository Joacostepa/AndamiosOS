"use client";

// Estados de demo de la maqueta (?demo=cargando | vacio | error), para revisar cómo se ven sin
// tener que romper nada. Misma forma que el contenido real.

import Link from "next/link";
import { Network } from "lucide-react";
import { Aviso } from "@/components/permisos-via-publica/ui";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export type Demo = "cargando" | "vacio" | "error";

export function leerDemo(valor: string | null): Demo | null {
  return valor === "cargando" || valor === "vacio" || valor === "error" ? valor : null;
}

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

export function EstadoDemo({ demo, puedeEditar, lista = false }: { demo: Demo; puedeEditar: boolean; lista?: boolean }) {
  if (demo === "cargando") return lista ? <EsqueletoLista /> : <EsqueletoMapa />;
  if (demo === "error") {
    return (
      <Aviso tono="bloqueo" titulo="No pudimos cargar el organigrama. Probá recargar.">
        El servidor contestó: «tiempo de espera agotado» (ejemplo).
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
          <Button className="h-9 max-sm:h-10" nativeButton={false} render={<Link href="/organigrama" />}>
            Empezar desde la estructura base
          </Button>
        )}
      </EmptyState>
    </div>
  );
}
