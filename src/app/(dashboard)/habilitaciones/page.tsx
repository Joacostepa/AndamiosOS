"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Loader2, RefreshCw, TriangleAlert, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { partesTitulo } from "@/lib/tablero/titulo";
import { useBandejaHabilitaciones, useReconciliar, useTriage } from "@/hooks/use-habilitaciones";
import { useTour } from "@/hooks/use-tour";
import { PASOS_BANDEJA, TOUR_BANDEJA } from "@/lib/habilitaciones/tour";
import { BotonAyuda } from "@/components/habilitaciones/boton-ayuda";
import { Fila } from "@/components/habilitaciones/fila-bandeja";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck } from "lucide-react";
import type { FilaBandeja, GrupoBandeja } from "@/lib/habilitaciones/tipos";

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
  // Arranca recién con la bandeja en pantalla: antes de eso los elementos que resalta
  // todavía no existen y el recorrido saldría vacío.
  const tour = useTour(TOUR_BANDEJA, PASOS_BANDEJA, { listo: !isLoading && !!data });

  function alternar(otId: number, valor: boolean) {
    setSeleccion((prev) => {
      const siguiente = new Set(prev);
      if (valor) siguiente.add(otId);
      else siguiente.delete(otId);
      return siguiente;
    });
  }

  function triar(decision: "aplica" | "no_aplica" | "pendiente", otIds: number[]) {
    if (otIds.length === 0) return;
    triage.mutate(
      { otIds, decision },
      {
        onSuccess: ({ resueltas }) => {
          setSeleccion(new Set());
          const n = `${resueltas} ${resueltas === 1 ? "obra" : "obras"}`;
          toast.success(
            decision === "aplica"
              ? `${n} en gestión · se creó la Nómina ART`
              : decision === "no_aplica"
                ? `${n} fuera de la cola · quedan abajo, en "No aplican"`
                : `${n} de vuelta en la cola`,
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
      {/* data-tour: el recorrido guiado se cuelga de este nodo (ver lib/habilitaciones/tour.ts) */}
      <div data-tour="bandeja-header">
        <PageHeader
          title="Habilitaciones"
          description={`Las obras entran solas al crearse la OT en Odoo · ${total} en trámite`}
        >
          <BotonAyuda onRecorrido={tour.reiniciar} />
        </PageHeader>
      </div>

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
        grupos.map((grupo, i) => (
          <Grupo
            key={grupo.clave}
            grupo={grupo}
            seleccion={seleccion}
            onSeleccionar={alternar}
            onTriar={triar}
            triando={triage.isPending}
            primero={i === 0}
          />
        ))
      )}

      <NoAplican
        filas={data?.noAplican ?? []}
        onVolver={(otIds) => triar("pendiente", otIds)}
        triando={triage.isPending}
      />
    </div>
  );
}

/**
 * Las descartadas, al pie y colapsadas.
 *
 * NO SUMAN AL TOTAL en trámite: no hay nada que hacer con ellas y por eso no compiten
 * por atención con los seis grupos de arriba. Pero tienen que ser ALCANZABLES — el
 * triage por lote resuelve decenas de obras de un clic, y sin esta lista un clic de más
 * dejaba a la obra fuera del sistema sin forma de traerla de vuelta.
 */
function NoAplican({
  filas,
  onVolver,
  triando,
}: {
  filas: FilaBandeja[];
  onVolver: (otIds: number[]) => void;
  triando: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  if (filas.length === 0) return null;

  return (
    // data-tour: el recorrido guiado se cuelga de este nodo (ver lib/habilitaciones/tour.ts)
    <section className="rounded-md border" data-tour="no-aplican">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
      >
        {abierto ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <h2 className="text-[13px] font-medium text-muted-foreground">No aplican</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{filas.length}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          fuera de la cola · no cuentan en el total
        </span>
      </button>

      {abierto && (
        <ul>
          {filas.map((f) => (
            <li
              key={f.otId}
              className="flex items-center gap-2 border-t px-3 py-2 text-[13px]"
            >
              <Link href={`/habilitaciones/${f.otId}`} className="min-w-0 flex-1 truncate">
                {partesTitulo(f.titulo).principal}
              </Link>
              <Button
                size="sm"
                variant="outline"
                disabled={triando}
                onClick={() => onVolver([f.otId])}
              >
                <Undo2 className="mr-1 h-3.5 w-3.5" />
                Volver a la cola
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Grupo({
  grupo,
  seleccion,
  onSeleccionar,
  onTriar,
  triando,
  primero = false,
}: {
  grupo: GrupoBandeja;
  seleccion: Set<number>;
  onSeleccionar: (otId: number, valor: boolean) => void;
  onTriar: (decision: "aplica" | "no_aplica", otIds: number[]) => void;
  triando: boolean;
  /** El primer grupo aporta la fila de ejemplo del recorrido guiado. */
  primero?: boolean;
}) {
  const esTriage = grupo.clave === "recien_llegadas";
  const idsDelGrupo = grupo.filas.map((f) => f.otId);
  const seleccionados = idsDelGrupo.filter((id) => seleccion.has(id));
  // Sin selección, los botones actúan sobre todo el grupo: con 3 obras por día hábil,
  // obligar a tildar antes de resolver convierte un clic en tres.
  const objetivo = seleccionados.length > 0 ? seleccionados : idsDelGrupo;

  return (
    // data-tour: el recorrido guiado se cuelga de estos nodos (ver lib/habilitaciones/tour.ts)
    <section
      className="rounded-md border"
      data-tour={esTriage ? "grupo-recien-llegadas" : grupo.peligro ? "grupos" : undefined}
    >
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
        {grupo.filas.map((fila, i) => (
          <Fila
            key={fila.otId}
            fila={fila}
            grupo={grupo.clave}
            seleccionable={esTriage}
            seleccionada={seleccion.has(fila.otId)}
            onSeleccionar={onSeleccionar}
            anclaTour={primero && i === 0}
          />
        ))}
      </div>
    </section>
  );
}
