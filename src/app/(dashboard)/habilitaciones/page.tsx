"use client";

import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlarmClock, ChevronDown, ChevronRight, Loader2, RefreshCw, RotateCcw, Search,
  TriangleAlert, Undo2, X,
} from "lucide-react";
import { BotonPlanificacion } from "@/components/habilitaciones/planificacion-contexto";
import { coincide } from "@/lib/habilitaciones/buscar";
import {
  DialogoPosponer, obraDeFila, type ObraAPosponer,
} from "@/components/habilitaciones/dialogo-posponer";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { direccionDeObra } from "@/lib/tablero/titulo";
import {
  useBandejaHabilitaciones, usePosponer, useReconciliar, useRevertirHabilitacion, useTriage,
} from "@/hooks/use-habilitaciones";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useTour } from "@/hooks/use-tour";
import { PASOS_BANDEJA, TOUR_BANDEJA } from "@/lib/habilitaciones/tour";
import { BotonAyuda } from "@/components/habilitaciones/boton-ayuda";
import { ChipTipoOt } from "@/components/habilitaciones/chip-tipo-ot";
import { ChipUrgencia } from "@/components/habilitaciones/chip-urgencia";
import { ChipPantalla } from "@/components/habilitaciones/chip-pantalla";
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
// SIN PAGINADO, pero CON BUSCADOR. Al principio no lo tenía a propósito —con ~19 obras
// en trámite no había nada que encontrar—, pero la bandeja pasó a tener también las
// habilitadas y las que no aplican, y la pregunta "¿dónde quedó Azara 856?" se contesta
// escribiendo, no abriendo tres listas. Filtra en el browser sobre lo ya cargado: ver
// lib/habilitaciones/buscar.ts.
//
// NO HAY BOTÓN "NUEVA OBRA": las habilitaciones nacen con la OT en Odoo. La primera
// acción de Agustina es el triage, no el alta.

export default function HabilitacionesPage() {
  const { data, isLoading, error } = useBandejaHabilitaciones();
  const triage = useTriage();
  const reconciliar = useReconciliar();
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [aPosponer, setAPosponer] = useState<ObraAPosponer | null>(null);
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

  const buscando = busqueda.trim() !== "";
  const filtrar = (filas: FilaBandeja[]) => filas.filter((f) => coincide(f, busqueda));
  const grupos = (data?.grupos ?? [])
    .map((g) => ({ ...g, filas: filtrar(g.filas) }))
    .filter((g) => g.filas.length > 0);
  const noAplican = filtrar(data?.noAplican ?? []);
  const habilitadas = filtrar(data?.habilitadas ?? []);
  const pospuestas = filtrar(data?.pospuestas ?? []);
  const totalPospuestas = data?.pospuestas.length ?? 0;
  const total = data?.total ?? 0;
  const enTramite = grupos.reduce((n, g) => n + g.filas.length, 0);
  const desincronizadas = data?.desincronizadas ?? 0;

  return (
    <div className="space-y-5">
      {/* data-tour: el recorrido guiado se cuelga de este nodo (ver lib/habilitaciones/tour.ts) */}
      <div data-tour="bandeja-header">
        <PageHeader
          title="Habilitaciones"
          description={
            buscando
              ? `${enTramite} de ${total} en trámite coinciden con la búsqueda`
              : `Las obras entran solas al crearse la OT en Odoo · ${total} en trámite${totalPospuestas > 0 ? ` · ${totalPospuestas} pospuestas` : ""}`
          }
        >
          <div className="flex items-center gap-2">
            {/* La planificación, en sólo lectura, para ver qué viene sin salir de acá. El
                panel vive en el layout del módulo (ver planificacion-contexto.tsx). */}
            <BotonPlanificacion />
            <BotonAyuda onRecorrido={tour.reiniciar} />
          </div>
        </PageHeader>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setBusqueda("")}
          placeholder="Buscar por dirección, cliente, OT, orden de venta, técnico…"
          aria-label="Buscar obras"
          className="h-9 pr-8 pl-8 text-[13px]"
        />
        {buscando && (
          <button
            type="button"
            onClick={() => setBusqueda("")}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Borrar búsqueda"
          >
            <X className="h-4 w-4" />
          </button>
        )}
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
        buscando ? (
          noAplican.length + habilitadas.length + pospuestas.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Nada coincide"
              description={`Ninguna obra activa coincide con “${busqueda.trim()}”.`}
            />
          ) : (
            <p className="px-1 text-[13px] text-muted-foreground">
              Ninguna obra en trámite coincide. Abajo están las que sí.
            </p>
          )
        ) : (
          <EmptyState
            icon={ShieldCheck}
            title="No hay nada en trámite"
            description="Las obras aparecen acá solas al crearse la OT en Odoo."
          />
        )
      ) : (
        grupos.map((grupo, i) => (
          <Grupo
            key={grupo.clave}
            grupo={grupo}
            seleccion={seleccion}
            onSeleccionar={alternar}
            onTriar={triar}
            triando={triage.isPending}
            filtrado={buscando}
            onPosponer={(f) => setAPosponer(obraDeFila(f))}
            primero={i === 0}
          />
        ))
      )}

      <Pospuestas
        filas={pospuestas}
        abiertoForzado={buscando}
        onCambiar={(f) => setAPosponer(obraDeFila(f))}
      />

      {/* Buscando, las dos listas del pie se abren solas: si la obra que se busca está
          habilitada o descartada, tener que adivinarlo y abrir la lista es justo lo que
          el buscador vino a evitar. */}
      <NoAplican
        filas={noAplican}
        onVolver={(otIds) => triar("pendiente", otIds)}
        triando={triage.isPending}
        abiertoForzado={buscando}
      />

      <Habilitadas filas={habilitadas} abiertoForzado={buscando} />

      <DialogoPosponer obra={aPosponer} onCerrar={() => setAPosponer(null)} />
    </div>
  );
}

/**
 * Las pospuestas, al pie, la que vuelve antes primero.
 *
 * Van ANTES de "No aplican" y "Habilitadas": son las únicas de las tres que todavía tienen
 * trabajo pendiente, sólo que no ahora. Colapsadas igual que las otras dos — si se vieran
 * abiertas, posponer no sacaría nada de la vista.
 */
function Pospuestas({
  filas,
  abiertoForzado = false,
  onCambiar,
}: {
  filas: FilaBandeja[];
  abiertoForzado?: boolean;
  onCambiar: (fila: FilaBandeja) => void;
}) {
  const [abiertoManual, setAbierto] = useState(false);
  const abierto = abiertoManual || abiertoForzado;
  const posponer = usePosponer();
  if (filas.length === 0) return null;

  return (
    <section className="rounded-md border">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
      >
        {abierto ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <AlarmClock className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-[13px] font-medium text-muted-foreground">Pospuestas</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{filas.length}</span>
        <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">
          vuelven solas a la cola · no cuentan en el total
        </span>
      </button>

      {abierto && (
        <ul>
          {filas.map((f) => (
            <li key={f.otId} className="flex flex-wrap items-center gap-2 border-t px-3 py-2 text-[13px]">
              <ChipTipoOt tipo={f.tipo} enColumna />
              <Link href={`/habilitaciones/${f.otId}`} className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <ChipUrgencia urgencia={f.urgencia} motivo={f.motivoUrgencia} />
                  <ChipPantalla trabajo={f.trabajo} />
                  <span className="truncate">{direccionDeObra(f)}</span>
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Vuelve el {format(parseISO(f.pospuestaHasta!), "EEE d MMM", { locale: es })}
                  </span>
                  {f.pospuestaPor && ` · pospuesta por ${f.pospuestaPor}`}
                  {f.pospuestaMotivo && ` — ${f.pospuestaMotivo}`}
                  {f.primeraJornada &&
                    ` · planificada para el ${format(parseISO(f.primeraJornada), "d MMM", { locale: es })}`}
                </span>
              </Link>
              <span className="hidden w-16 shrink-0 text-right text-[12px] sm:inline">
                {f.fechaProgramada
                  ? format(parseISO(f.fechaProgramada), "d MMM", { locale: es })
                  : "—"}
              </span>
              <Button size="sm" variant="ghost" onClick={() => onCambiar(f)}>
                Cambiar fecha
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={posponer.isPending}
                onClick={() =>
                  posponer.mutate(
                    { otId: f.otId, hasta: null },
                    {
                      onSuccess: () => toast.success("De vuelta en la cola"),
                      onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo reactivar"),
                    },
                  )
                }
              >
                <Undo2 className="mr-1 h-3.5 w-3.5" />
                Reactivar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Las declaradas habilitadas, al pie y colapsadas, la más reciente primero.
 *
 * Mismo criterio que "No aplican": habilitar saca la obra de los grupos de arriba, y sin
 * esta lista la única forma de corregir un error era acordarse de qué obra fue y entrar
 * por la URL. La vuelta atrás tiene que estar a mano sin competir con la cola.
 *
 * REVERTIR PIDE CONFIRMACIÓN acá y no en la ficha: en la ficha uno está parado sobre esa
 * obra; en una lista el botón de al lado es otra, y revertir le manda a Operaciones un
 * aviso crítico que no se despacha solo.
 */
function Habilitadas({
  filas,
  abiertoForzado = false,
}: {
  filas: FilaBandeja[];
  abiertoForzado?: boolean;
}) {
  const [abiertoManual, setAbierto] = useState(false);
  const abierto = abiertoManual || abiertoForzado;
  const [aRevertir, setARevertir] = useState<FilaBandeja | null>(null);
  const revertir = useRevertirHabilitacion();
  if (filas.length === 0) return null;

  function confirmar() {
    if (!aRevertir) return;
    revertir.mutate(aRevertir.otId, {
      onSuccess: () => {
        toast.success("Se revirtió la habilitación · la obra vuelve a la cola");
        setARevertir(null);
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo revertir"),
    });
  }

  return (
    <section className="rounded-md border">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
      >
        {abierto ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <h2 className="text-[13px] font-medium text-muted-foreground">Habilitadas</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{filas.length}</span>
        <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">
          la más reciente primero · no cuentan en el total
        </span>
      </button>

      {abierto && (
        <ul>
          {filas.map((f) => (
            <li
              key={f.otId}
              className="flex items-center gap-2 border-t px-3 py-2 text-[13px]"
            >
              <ChipTipoOt tipo={f.tipo} enColumna />
              <Link href={`/habilitaciones/${f.otId}`} className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <ChipUrgencia urgencia={f.urgencia} motivo={f.motivoUrgencia} />
                  <ChipPantalla trabajo={f.trabajo} />
                  <span className="truncate">{direccionDeObra(f)}</span>
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {[
                    `Habilitada el ${format(parseISO(f.habilitadaEl!), "d MMM", { locale: es })}`,
                    f.habilitadaPor ? `por ${f.habilitadaPor}` : null,
                  ].filter(Boolean).join(" ")}
                  {f.habilitadaMotivo && (
                    <span style={{ color: "#B54708" }}> · por excepción — {f.habilitadaMotivo}</span>
                  )}
                </span>
              </Link>
              <span className="hidden w-16 shrink-0 text-right text-[12px] sm:inline">
                {f.fechaProgramada
                  ? format(parseISO(f.fechaProgramada), "d MMM", { locale: es })
                  : "—"}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={revertir.isPending}
                onClick={() => setARevertir(f)}
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Revertir
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!aRevertir} onOpenChange={(abrir) => !abrir && setARevertir(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Revertir la habilitación?</DialogTitle>
            <DialogDescription>
              {aRevertir && direccionDeObra(aRevertir)} vuelve a la cola sin habilitar y
              Operaciones recibe un aviso. Si ya tiene jornadas planificadas, siguen en el
              tablero. Los requisitos y el historial no se tocan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setARevertir(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={revertir.isPending}>
              {revertir.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Revertir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
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
  abiertoForzado = false,
}: {
  filas: FilaBandeja[];
  onVolver: (otIds: number[]) => void;
  triando: boolean;
  abiertoForzado?: boolean;
}) {
  const [abiertoManual, setAbierto] = useState(false);
  const abierto = abiertoManual || abiertoForzado;
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
              {/* El mismo chip que arriba: son las mismas obras y la pregunta es la misma. */}
              <ChipTipoOt tipo={f.tipo} enColumna />
              <Link href={`/habilitaciones/${f.otId}`} className="min-w-0 flex-1 truncate">
                {direccionDeObra(f)}
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
  filtrado = false,
  onPosponer,
  primero = false,
}: {
  grupo: GrupoBandeja;
  seleccion: Set<number>;
  onSeleccionar: (otId: number, valor: boolean) => void;
  onTriar: (decision: "aplica" | "no_aplica", otIds: number[]) => void;
  triando: boolean;
  /** Hay una búsqueda: el grupo trae sólo las filas que coinciden. */
  filtrado?: boolean;
  onPosponer: (fila: FilaBandeja) => void;
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
                : filtrado
                  // Sin selección los botones actúan sobre el grupo VISIBLE. Con una
                  // búsqueda eso ya no es "todas", y decirlo evita triar de más.
                  ? `las ${grupo.filas.length} que coinciden`
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
            onPosponer={onPosponer}
            anclaTour={primero && i === 0}
          />
        ))}
      </div>
    </section>
  );
}
