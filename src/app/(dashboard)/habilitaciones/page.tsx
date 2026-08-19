"use client";

import { useState } from "react";
import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useBandejaHabilitaciones, useReconciliar, useTriage } from "@/hooks/use-habilitaciones";
import { Fila } from "@/components/habilitaciones/fila-bandeja";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck } from "lucide-react";
import type { GrupoBandeja } from "@/lib/habilitaciones/tipos";

// Bandeja de Habilitaciones. Reemplaza a la planilla `Seguimiento de obras (DOCS
// TRACKER)` y a la vieja pantalla que sólo tenía un botón "Habilitar" contra un booleano.
//
// AGRUPADA POR ACCIÓN PENDIENTE, no por objeto: una obra no "tiene documentación", está
// esperando que el cliente diga qué pide, o esperando validación, o vencida. Cada estado
// tiene una acción y un reclamo distintos, y la planilla tenía dos casillas para un
// proceso de cinco pasos.
//
// SIN BUSCADOR NI PAGINADO, a propósito: con ~19 obras en trámite no hay que encontrar
// nada, hay que decidir por dónde empezar. El día que haga falta buscar es porque el
// módulo se llenó de ruido, y eso es lo que hay que arreglar, no el buscador.
//
// NO HAY BOTÓN "NUEVA OBRA": las habilitaciones nacen con la OT en Odoo. La primera
// acción de Agustina es el triage, no el alta.

export default function HabilitacionesPage() {
  const { data, isLoading, error } = useBandejaHabilitaciones();
  const triage = useTriage();
  const reconciliar = useReconciliar();
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());

  function alternar(otId: number, valor: boolean) {
    setSeleccion((prev) => {
      const siguiente = new Set(prev);
      if (valor) siguiente.add(otId);
      else siguiente.delete(otId);
      return siguiente;
    });
  }

  function triar(decision: "aplica" | "no_aplica", otIds: number[]) {
    if (otIds.length === 0) return;
    triage.mutate(
      { otIds, decision },
      {
        onSuccess: ({ resueltas }) => {
          setSeleccion(new Set());
          toast.success(
            decision === "aplica"
              ? `${resueltas} ${resueltas === 1 ? "obra" : "obras"} en gestión · se creó la Nómina ART`
              : `${resueltas} ${resueltas === 1 ? "obra sacada" : "obras sacadas"} de la cola`,
          );
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo resolver el triage"),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Habilitaciones" description="No se pudo leer la bandeja" />
        <EmptyState
          icon={TriangleAlert}
          title="Error al leer Odoo"
          description={error instanceof Error ? error.message : "Error desconocido"}
        />
      </div>
    );
  }

  const grupos = data?.grupos ?? [];
  const total = data?.total ?? 0;
  const desincronizadas = data?.desincronizadas ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Habilitaciones"
        description={`Las obras entran solas al crearse la OT en Odoo · ${total} en trámite`}
      />

      {/* El push a Odoo es el único punto que puede fallar en silencio. Si nadie puede
          ver que hay 12 en error, el job de reconciliación no alcanza. */}
      {desincronizadas > 0 && (
        <div
          className="flex items-center gap-3 rounded-md border px-3 py-2 text-[13px]"
          style={{ backgroundColor: "#FEF6E7", borderColor: "#F5C86B" }}
        >
          <TriangleAlert className="h-4 w-4 shrink-0" style={{ color: "#B54708" }} />
          <span className="flex-1">
            {desincronizadas}{" "}
            {desincronizadas === 1
              ? "habilitación no pudo actualizarse en Odoo"
              : "habilitaciones no pudieron actualizarse en Odoo"}
            . El tablero puede estar mostrando un semáforo viejo.
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              reconciliar.mutate(undefined, {
                onSuccess: (r) =>
                  toast.success(
                    `${r.reparadas} reparadas · ${r.fallidas} siguen fallando${r.huerfanas ? ` · ${r.huerfanas} huérfanas` : ""}`,
                  ),
                onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo reconciliar"),
              })
            }
            disabled={reconciliar.isPending}
          >
            {reconciliar.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
            )}
            Reintentar
          </Button>
        </div>
      )}

      {grupos.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No hay nada en trámite"
          description="Las obras aparecen acá solas al crearse la OT en Odoo."
        />
      ) : (
        grupos.map((grupo) => (
          <Grupo
            key={grupo.clave}
            grupo={grupo}
            seleccion={seleccion}
            onSeleccionar={alternar}
            onTriar={triar}
            triando={triage.isPending}
          />
        ))
      )}
    </div>
  );
}

function Grupo({
  grupo,
  seleccion,
  onSeleccionar,
  onTriar,
  triando,
}: {
  grupo: GrupoBandeja;
  seleccion: Set<number>;
  onSeleccionar: (otId: number, valor: boolean) => void;
  onTriar: (decision: "aplica" | "no_aplica", otIds: number[]) => void;
  triando: boolean;
}) {
  const esTriage = grupo.clave === "recien_llegadas";
  const idsDelGrupo = grupo.filas.map((f) => f.otId);
  const seleccionados = idsDelGrupo.filter((id) => seleccion.has(id));
  // Sin selección, los botones actúan sobre todo el grupo: con 3 obras por día hábil,
  // obligar a tildar antes de resolver convierte un clic en tres.
  const objetivo = seleccionados.length > 0 ? seleccionados : idsDelGrupo;

  return (
    <section className="rounded-md border">
      <header
        className="flex items-center gap-3 border-b px-3 py-2"
        style={grupo.peligro ? { backgroundColor: "#FDECEA" } : undefined}
      >
        <h2 className="text-[13px] font-semibold">{grupo.titulo}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
          {grupo.filas.length}
        </span>

        {/* TRIAGE POR LOTE. Con ~68 entradas por mes, si esto no es de un clic la bandeja
            se llena de ruido y deja de significar algo — que es exactamente lo que le
            pasó a la planilla que este módulo reemplaza. */}
        {esTriage && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              {seleccionados.length > 0
                ? `${seleccionados.length} seleccionadas`
                : "todas"}
            </span>
            <Button size="sm" onClick={() => onTriar("aplica", objetivo)} disabled={triando}>
              {triando && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Aplica
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onTriar("no_aplica", objetivo)}
              disabled={triando}
            >
              No aplica
            </Button>
          </div>
        )}
      </header>

      <div>
        {grupo.filas.map((fila) => (
          <Fila
            key={fila.otId}
            fila={fila}
            grupo={grupo.clave}
            seleccionable={esTriage}
            seleccionada={seleccion.has(fila.otId)}
            onSeleccionar={onSeleccionar}
          />
        ))}
      </div>
    </section>
  );
}
