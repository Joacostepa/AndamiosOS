"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, FlaskConical, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBorrarTramite, useTramite } from "@/hooks/use-permisos-via-publica";
import { cuandoFue, haceCuanto } from "@/lib/permisos-via-publica/estado";
import type { FichaPermiso } from "@/lib/permisos-via-publica/ficha";
import { TIPO_DUENO_CORTO, direccionCorta } from "@/lib/permisos-via-publica/tipos";
import { Chip } from "@/components/permisos-via-publica/ui";
import { Dialogo } from "@/components/permisos-via-publica/dialogo";
import { TarjetaEstado } from "@/components/permisos-via-publica/ficha/tarjeta-estado";
import { Papeles } from "@/components/permisos-via-publica/ficha/papeles";
import { Robot } from "@/components/permisos-via-publica/ficha/robot";
import { Datos } from "@/components/permisos-via-publica/ficha/datos";
import { Historial } from "@/components/permisos-via-publica/ficha/historial";

// La ficha única de un permiso (rediseño 09/10, docs/permisos/rediseno.md § 4.3). De arriba a abajo:
//   1. Encabezado: dónde, de quién, quién vendió y hace cuánto se abrió.
//   2. Tarjeta de estado: qué etapa, qué falta, quién lo mueve y desde cuándo, con el único botón
//      principal para lo que le toca a la oficina (la misma cuenta que la fila de la lista).
//   3. Papeles al centro (los problemas primero) y, al costado, los datos: dueño, portal, venta,
//      expediente, borradores para limpiar y el robot.
//   4. Lo que hizo el robot (encomienda e intentos en TAD) y el historial unido.
// Trámite y expediente son la misma ficha: la del expediente redirige acá cuando hay trámite.

export default function FichaTramitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, error, dataUpdatedAt, refetch } = useTramite(id);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4" aria-busy>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-56 w-full" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Volver />
        <EmptyState icon={TriangleAlert} title="No se pudo abrir el trámite" description={error instanceof Error ? error.message : "Probá recargar en un rato."}>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>
        </EmptyState>
      </div>
    );
  }

  const ahora = dataUpdatedAt;
  const t = data.tramite;
  const sup = data.supervision;
  const pie = (
    <span>
      Qué sale solo: endoso {sup.endosoAutomatico ? "solo" : "con botón"} · encomienda {sup.encomiendaAutomatica ? "sola" : "con botón"} · presentación {sup.presentacionAutomatica ? "sola, de 19 a 7" : "con botón"}
    </span>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Volver />
        {data.venta?.url && (
          <a href={data.venta.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-2.5 text-[13px] font-medium hover:bg-muted max-sm:h-10">
            Venta {data.venta.nombre} <ExternalLink aria-hidden className="size-3.5" />
          </a>
        )}
      </div>

      <Encabezado ficha={data} ahora={ahora} />
      {t.es_prueba && <Prueba ficha={data} />}

      <TarjetaEstado estado={data.estado} acciones={data.acciones} ahora={ahora} ficha={data} pie={pie} />

      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-[999_1_34rem] space-y-4">
          <Papeles ficha={data} ahora={ahora} />
          <Robot ficha={data} ahora={ahora} />
        </div>
        <div className="min-w-0 flex-[1_1_18rem]">
          <Datos ficha={data} ahora={ahora} />
        </div>
      </div>

      <Historial eventos={data.eventos} ahora={ahora} />
    </div>
  );
}

function Volver() {
  return (
    <Link href="/permisos-via-publica" className="inline-flex items-center gap-1 rounded-sm text-[13px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
      <ArrowLeft aria-hidden className="size-4" /> Permisos de andamio
    </Link>
  );
}

function Encabezado({ ficha, ahora }: { ficha: FichaPermiso; ahora: number }) {
  const t = ficha.tramite;
  const bajada = [
    t.titular_nombre ?? t.cliente_nombre,
    t.administrador_nombre ? `adm. ${t.administrador_nombre}` : null,
    ficha.vendedora ? `Vendió: ${ficha.vendedora.corto}` : null,
    `abierto el ${cuandoFue(t.created_at, ahora)} (${haceCuanto(t.created_at, ahora)})`,
  ].filter(Boolean);
  return (
    <header className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h1 className="break-words text-2xl font-bold tracking-tight text-balance sm:text-3xl">{direccionCorta(t.direccion)}</h1>
        {t.odoo_venta_nombre && <span className="rounded-full border px-2 py-0.5 font-mono text-[12px] text-foreground/80">{t.odoo_venta_nombre}</span>}
        {ficha.expediente && <span className="rounded-full border px-2 py-0.5 font-mono text-[12px] text-foreground/80">EX-{ficha.expediente.numero}</span>}
        {t.tipo_dueno && <Chip sinIcono>{TIPO_DUENO_CORTO[t.tipo_dueno]}</Chip>}
        {t.es_prueba && <Chip tono="prueba" sinIcono>Prueba</Chip>}
      </div>
      <p className="text-[14px] text-muted-foreground">{bajada.join(" · ")}</p>
    </header>
  );
}

/** El trámite de prueba: una línea, las instrucciones plegadas y "Borrar la prueba" con diálogo. */
function Prueba({ ficha }: { ficha: FichaPermiso }) {
  const borrar = useBorrarTramite(ficha.tramite.id);
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  return (
    <section className="space-y-2 rounded-md bg-violet-500/10 px-3 py-2.5 text-[13px]">
      <p className="flex flex-wrap items-center gap-2">
        <FlaskConical aria-hidden className="size-4 text-violet-700 dark:text-violet-300" />
        <span className="font-medium text-violet-800 dark:text-violet-200">Trámite de prueba:</span>
        <span>los mails llegan a tu casilla, no se le escribe a nadie y nunca se presenta.</span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setAbierto(true)}>
          <Trash2 className="size-4" /> Borrar la prueba…
        </Button>
      </p>
      <details>
        <summary className="cursor-pointer text-[12px]">Ver instrucciones</summary>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[12px] text-foreground/80">
          <li>Abrí el link del cliente y cargá un dueño con un CUIT válido, por ejemplo 30-71546290-3.</li>
          <li>Te llega el mail «[PRUEBA] Endosos para pedir». Abrí la página de Segucom de prueba y subí una póliza.</li>
          <li>A los segundos ves la revisión en esa página y acá.</li>
        </ol>
        {ficha.linkProductorPrueba && (
          <a href={ficha.linkProductorPrueba} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[12px] underline-offset-2 hover:underline">
            Página de Segucom (prueba) <ExternalLink aria-hidden className="size-3" />
          </a>
        )}
      </details>
      <Dialogo
        open={abierto}
        onOpenChange={setAbierto}
        peligroso
        titulo="¿Borrar este trámite de prueba?"
        texto="Se borran el trámite, sus papeles, el historial y los archivos. No toca nada real."
        confirmar="Borrar la prueba"
        cargando={borrar.isPending}
        onConfirmar={() => borrar.mutate(undefined, { onSuccess: () => { toast.success("Prueba borrada"); router.push("/permisos-via-publica"); }, onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo borrar") })}
      />
    </section>
  );
}
