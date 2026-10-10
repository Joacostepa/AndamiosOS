"use client";

// La bandeja del pañol en pantalla (maqueta Oficina-Bandeja). Arriba el aviso de bajas con
// cosas a cargo, después una sección por cosa para hacer, en el orden de docs §6.14. Lo que
// no tiene nada no se muestra: lo que no está acá anda bien.

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Aviso, Chip } from "@/components/permisos-via-publica/ui";
import { useBandejaPanol, useListaReposicion } from "@/hooks/use-panol-bandeja";
import { listaCorta, type AvisoBaja, type FilaBandeja, type SeccionBandeja } from "@/lib/panol/bandeja";
import { AccionFila } from "./acciones";
import { ListaReposicion } from "./lista-reposicion";

function Fila({ f }: { f: FilaBandeja }) {
  return (
    <li className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b px-3 py-3 last:border-b-0">
      <div className="min-w-0 flex-[999_1_20rem] space-y-0.5">
        <p className="flex flex-wrap items-baseline gap-x-2 text-[14px] font-semibold">
          {f.titulo}
          {f.codigo && <span className="font-mono text-[12px] font-medium text-muted-foreground">{f.codigo}</span>}
        </p>
        <p className="text-[13px] text-foreground/80">{f.detalle}</p>
        {f.items && f.items.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-[12.5px] text-foreground/80">
            {f.items.map((t) => <li key={t}>• {t}</li>)}
          </ul>
        )}
      </div>
      {(f.chip || f.cuando) && (
        <div className="flex flex-[0_0_auto] items-center gap-2">
          {f.chip && <Chip tono={f.chip.tono}>{f.chip.texto}</Chip>}
          {f.cuando && <span className="whitespace-nowrap text-[12px] text-muted-foreground">{f.cuando}</span>}
        </div>
      )}
      {f.acciones.length > 0 && (
        <div className="flex flex-[1_1_auto] flex-wrap items-center justify-end gap-2">
          {f.acciones.map((a, i) => <AccionFila key={`${a.tipo}:${i}`} accion={a} />)}
        </div>
      )}
    </li>
  );
}

function Seccion({ s }: { s: SeccionBandeja }) {
  return (
    <section id={s.id} aria-labelledby={`${s.id}-titulo`} className="scroll-mt-4 overflow-hidden rounded-md border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b px-3 py-2.5">
        <div className="min-w-0">
          <h2 id={`${s.id}-titulo`} className="flex items-center gap-2 text-[15px] font-semibold">
            {s.titulo}
            <span className="rounded-full bg-muted px-2 text-[12px] font-semibold tabular-nums text-muted-foreground">{s.filas.length}</span>
          </h2>
          <p className="text-[12.5px] text-muted-foreground">{s.ayuda}</p>
        </div>
        {s.id === "reponer" && <ListaReposicion />}
      </header>
      <ul>
        {s.filas.map((f) => <Fila key={f.id} f={f} />)}
      </ul>
    </section>
  );
}

function AvisoBajas({ bajas }: { bajas: AvisoBaja[] }) {
  return (
    <div className="space-y-2">
      {bajas.map((b) => (
        <Aviso key={b.lugar} titulo={`${b.clase === "cuadrilla" ? "Cuadrilla disuelta" : "Legajo dado de baja"} con cosas a cargo: ${b.nombre}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{b.cosas.length === 1 ? "Tiene" : `${b.cosas.length} cosas:`} {listaCorta(b.cosas)}. La baja no se frenó.</span>
            <Button size="sm" variant="outline" className="max-sm:h-10" nativeButton={false} render={<Link href={b.href} />}>Reasignar</Button>
          </div>
        </Aviso>
      ))}
    </div>
  );
}

export function BandejaPanol() {
  const { data, isLoading, error } = useBandejaPanol();
  const reposicion = useListaReposicion();

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <Aviso tono="bloqueo" titulo="No se pudo leer la bandeja del pañol">
        {error instanceof Error ? error.message : "Error desconocido"}. Probá recargar la página en un rato.
      </Aviso>
    );
  }

  const conAlgo = data.secciones.filter((s) => s.filas.length > 0);
  // La lista vive en la sección Reponer; si ya no queda nada bajo el mínimo pero la lista
  // tiene cosas, se sigue pudiendo abrir desde acá abajo.
  const listaSuelta = reposicion.items.length > 0 && !conAlgo.some((s) => s.id === "reponer");
  return (
    <div className="space-y-4">
      {data.bajas.length > 0 && <AvisoBajas bajas={data.bajas} />}
      {conAlgo.length === 0 && data.bajas.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="No hay nada para hacer" description="Lo que no está acá anda bien. El historial completo está en Movimientos.">
          {listaSuelta && <ListaReposicion />}
        </EmptyState>
      ) : (
        <>
          {conAlgo.map((s) => <Seccion key={s.id} s={s} />)}
          {listaSuelta && <div className="flex justify-end"><ListaReposicion /></div>}
          <p className="pt-2 text-center text-[12.5px] text-muted-foreground">
            Lo que no está acá anda bien. El historial completo está en{" "}
            <Link href="/deposito/panol/movimientos" className="underline underline-offset-2">Movimientos</Link>.
          </p>
        </>
      )}
    </div>
  );
}
