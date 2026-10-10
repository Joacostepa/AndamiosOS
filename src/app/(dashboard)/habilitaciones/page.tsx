"use client";

import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlarmClock, ChevronDown, ChevronRight, Loader2, RefreshCw, RotateCcw, Search, ShieldCheck,
  TriangleAlert, Undo2, X,
} from "lucide-react";
import { toast } from "sonner";
import { BotonPlanificacion } from "@/components/habilitaciones/planificacion-contexto";
import { coincide } from "@/lib/habilitaciones/buscar";
import {
  DialogoPosponer, obraDeFila, type ObraAPosponer,
} from "@/components/habilitaciones/dialogo-posponer";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AVISO, PELIGRO, PELIGRO_SUAVE, PELIGRO_TEXTO } from "@/lib/tablero/colores";
import { direccionDeObra, partesTitulo } from "@/lib/tablero/titulo";
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
import { Fila } from "@/components/habilitaciones/fila-bandeja";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ClaveGrupo, FilaBandeja, GrupoBandeja } from "@/lib/habilitaciones/tipos";

// Bandeja de Habilitaciones. Reemplaza a la planilla `Seguimiento de obras (DOCS TRACKER)`.
//
// REDISEÑO DEL 09/10 (docs/habilitaciones-rediseno.md): contesta "¿qué hago ahora, y con
// cuál empiezo?". Los grupos dicen de quién es la pelota —urgentes, nuevas, para hacer,
// esperando al cliente, esperan el permiso—, cada fila dice el próximo paso, hace cuánto
// espera y cuándo se arma, y el botón de ese paso está en la misma fila.
//
// EL ENCABEZADO ES UN RESUMEN, no una descripción: cuántas hay en cada situación, y cada
// número baja a su grupo. Que las obras entran solas lo explica la guía, no todos los días.
//
// SIN PAGINADO, CON BUSCADOR. Filtra en el browser sobre lo ya cargado (lib/habilitaciones/
// buscar.ts), y mientras se busca se abre todo lo plegado: si la obra está ahí, se ve.
//
// NO HAY BOTÓN "NUEVA OBRA": las habilitaciones nacen con la OT en Odoo.

const ETIQUETA_RESUMEN: Record<ClaveGrupo, [string, string]> = {
  urgentes: ["urgente", "urgentes"],
  nuevas: ["nueva", "nuevas"],
  para_hacer: ["para hacer", "para hacer"],
  cliente: ["esperando al cliente", "esperando al cliente"],
  permiso: ["espera el permiso", "esperan el permiso"],
  por_vencer: ["vence pronto", "vencen pronto"],
};

/** El id del grupo en la página, para los enlaces del resumen y el recorrido. */
const idDe = (clave: ClaveGrupo | "pospuestas") => `grupo-${clave.replace("_", "-")}`;

type Triar = (
  decision: "aplica" | "no_aplica" | "pendiente",
  otIds: number[],
  deshacer?: "aplica" | "no_aplica" | "pendiente",
) => void;

export default function HabilitacionesPage() {
  const { data, isLoading, error } = useBandejaHabilitaciones();
  const triage = useTriage();
  const reconciliar = useReconciliar();
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [aPosponer, setAPosponer] = useState<ObraAPosponer | null>(null);
  // Los grupos que la persona abrió o cerró a mano. Sin entrada, manda el `plegado` del grupo.
  const [abiertos, setAbiertos] = useState<Partial<Record<ClaveGrupo | "pospuestas", boolean>>>({});
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

  /**
   * Triar una o varias. El aviso dice qué pasó con cuáles y trae Deshacer: triar no le
   * avisa a nadie, así que no hace falta confirmar antes —se corrige después—.
   */
  const triar: Triar = (decision, otIds, deshacer = "pendiente") => {
    if (otIds.length === 0) return;
    const todas = data ? [...data.grupos.flatMap((g) => g.filas), ...data.pospuestas, ...data.noAplican] : [];
    const una = otIds.length === 1 ? todas.find((x) => x.otId === otIds[0]) : undefined;
    const quien = una ? direccionDeObra(una) : `${otIds.length} obras`;
    const plural = otIds.length === 1 ? "" : "n";
    triage.mutate(
      { otIds, decision },
      {
        onSuccess: () => {
          setSeleccion(new Set());
          toast.success(
            decision === "aplica"
              ? `${quien}: aplica${plural} · en la cola`
              : decision === "no_aplica"
                ? `${quien}: no aplica${plural} · ${otIds.length === 1 ? "quedó habilitada" : "quedaron habilitadas"}`
                : `${quien}: de vuelta en Nuevas`,
            {
              action: {
                label: "Deshacer",
                onClick: () =>
                  triage.mutate(
                    { otIds, decision: deshacer },
                    { onSuccess: () => toast.success(`${quien}: se deshizo`) },
                  ),
              },
            },
          );
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo resolver el triage"),
      },
    );
  };

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
        <h1 className="text-3xl font-bold tracking-tight">Habilitaciones</h1>
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
  const pospuestas = filtrar(data?.pospuestas ?? []);
  const habilitadas = filtrar(data?.habilitadas ?? []);
  const noAplican = filtrar(data?.noAplican ?? []);
  const desincronizadas = data?.desincronizadas ?? 0;

  const abierto = (clave: ClaveGrupo | "pospuestas", plegado: boolean) =>
    buscando || (abiertos[clave] ?? !plegado);
  const abrirYBajar = (clave: ClaveGrupo | "pospuestas") => {
    setAbiertos((a) => ({ ...a, [clave]: true }));
    requestAnimationFrame(() =>
      document.getElementById(idDe(clave))?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  // El resumen cuenta SIN el filtro de la búsqueda: es el estado de la cola, no del filtro.
  const resumen: { clave: ClaveGrupo | "pospuestas"; n: number; peligro: boolean }[] = [
    ...(data?.grupos ?? []).map((g) => ({ clave: g.clave, n: g.filas.length, peligro: g.peligro })),
    ...((data?.pospuestas.length ?? 0) > 0
      ? [{ clave: "pospuestas" as const, n: data!.pospuestas.length, peligro: false }]
      : []),
  ];

  return (
    <div className="space-y-5">
      {/* data-tour: el recorrido guiado se cuelga de este nodo (ver lib/habilitaciones/tour.ts) */}
      <div data-tour="bandeja-header" className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">Habilitaciones</h1>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[14px] text-muted-foreground">
            {resumen.length === 0 && "No hay nada en trámite."}
            {resumen.map((r, i) => (
              <span key={r.clave}>
                <button
                  type="button"
                  className="hover:underline hover:underline-offset-4"
                  onClick={() => abrirYBajar(r.clave)}
                >
                  <b className="font-semibold" style={{ color: r.peligro ? PELIGRO : "var(--foreground)" }}>
                    {r.n}
                  </b>{" "}
                  {r.clave === "pospuestas"
                    ? r.n === 1 ? "pospuesta" : "pospuestas"
                    : ETIQUETA_RESUMEN[r.clave][r.n === 1 ? 0 : 1]}
                </button>
                {i < resumen.length - 1 && <span className="ml-3 select-none">·</span>}
              </span>
            ))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* La planificación, en sólo lectura, para ver qué viene sin salir de acá. Se abre
              encima (ver planificacion-contexto.tsx). */}
          <BotonPlanificacion />
          <BotonAyuda onRecorrido={tour.reiniciar} />
        </div>
      </div>

      <div className="relative" data-tour="buscador">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setBusqueda("")}
          placeholder="Buscar por dirección, cliente, OT o venta…"
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
          data-tour="aviso-desincronizadas"
          className="flex items-center gap-3 rounded-md border px-3 py-2 text-[13px]"
          style={{ backgroundColor: AVISO.fondo, borderColor: AVISO.borde }}
        >
          <TriangleAlert className="h-4 w-4 shrink-0" style={{ color: AVISO.icono }} />
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

      {grupos.length === 0 &&
        (buscando ? (
          pospuestas.length + habilitadas.length + noAplican.length === 0 ? (
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
        ))}

      {grupos.map((grupo, i) => (
        <Grupo
          key={grupo.clave}
          grupo={grupo}
          abierto={abierto(grupo.clave, grupo.plegado)}
          onAlternar={() => setAbiertos((a) => ({ ...a, [grupo.clave]: !abierto(grupo.clave, grupo.plegado) }))}
          seleccion={seleccion}
          onSeleccionar={alternar}
          onTriar={triar}
          triando={triage.isPending}
          onPosponer={(f) => setAPosponer(obraDeFila(f))}
          primero={i === 0}
        />
      ))}

      <Pospuestas
        filas={pospuestas}
        abierto={abierto("pospuestas", true)}
        onAlternar={() => setAbiertos((a) => ({ ...a, pospuestas: !abierto("pospuestas", true) }))}
        onCambiar={(f) => setAPosponer(obraDeFila(f))}
      />

      <Resueltas
        habilitadas={habilitadas}
        noAplican={noAplican}
        abiertoForzado={buscando}
        onVolver={(otIds) => triar("pendiente", otIds, "no_aplica")}
        triando={triage.isPending}
      />

      <DialogoPosponer obra={aPosponer} onCerrar={() => setAPosponer(null)} />
    </div>
  );
}

function Grupo({
  grupo,
  abierto,
  onAlternar,
  seleccion,
  onSeleccionar,
  onTriar,
  triando,
  onPosponer,
  primero = false,
}: {
  grupo: GrupoBandeja;
  abierto: boolean;
  onAlternar: () => void;
  seleccion: Set<number>;
  onSeleccionar: (otId: number, valor: boolean) => void;
  onTriar: Triar;
  triando: boolean;
  onPosponer: (fila: FilaBandeja) => void;
  /** El primer grupo aporta la fila de ejemplo del recorrido guiado. */
  primero?: boolean;
}) {
  const esNuevas = grupo.clave === "nuevas";
  // TRIAGE POR LOTE SÓLO CON SELECCIÓN. Antes "Aplica" y "No aplica" del grupo, sin nada
  // tildado, actuaban sobre todas —y lo único que lo avisaba era la palabra "todas" en
  // gris—. Ahora cada fila tiene sus botones, y la barra aparece cuando hay tildadas.
  const seleccionados = esNuevas ? grupo.filas.filter((f) => seleccion.has(f.otId)).map((f) => f.otId) : [];
  const Flecha = abierto ? ChevronDown : ChevronRight;

  return (
    // data-tour: el recorrido guiado se cuelga de estos nodos (ver lib/habilitaciones/tour.ts)
    <section id={idDe(grupo.clave)} data-tour={idDe(grupo.clave)} className="scroll-mt-4 rounded-md border">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierto}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 rounded-t-md px-3 py-2 text-left hover:bg-muted/40"
        style={grupo.peligro ? { backgroundColor: PELIGRO_SUAVE } : undefined}
      >
        <Flecha className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <h2 className="text-[13px] font-semibold" style={grupo.peligro ? { color: PELIGRO_TEXTO } : undefined}>
          {grupo.titulo}
        </h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{grupo.filas.length}</span>
        <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">{grupo.nota}</span>
      </button>

      {abierto && seleccionados.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 border-t px-3 py-2 text-[12px]"
          style={{ backgroundColor: AVISO.fondo }}
        >
          <span className="font-medium">
            {seleccionados.length} {seleccionados.length === 1 ? "seleccionada" : "seleccionadas"}
          </span>
          <Button size="sm" disabled={triando} onClick={() => onTriar("aplica", seleccionados)}>
            {triando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Aplica
          </Button>
          <Button size="sm" variant="outline" disabled={triando} onClick={() => onTriar("no_aplica", seleccionados)}>
            No aplica
          </Button>
          <Button size="sm" variant="ghost" onClick={() => seleccionados.forEach((id) => onSeleccionar(id, false))}>
            Cancelar
          </Button>
        </div>
      )}

      {abierto && (
        <div className="border-t">
          {grupo.filas.map((fila, i) => (
            <Fila
              key={fila.otId}
              fila={fila}
              grupo={grupo.clave}
              seleccionable={esNuevas}
              seleccionada={seleccion.has(fila.otId)}
              onSeleccionar={onSeleccionar}
              onTriar={onTriar}
              triando={triando}
              onPosponer={onPosponer}
              anclaTour={primero && i === 0}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Las pospuestas, la que vuelve antes primero. Plegadas: son las que tienen trabajo
 * pendiente, pero no ahora. Desde el 09/10 son sólo las que se pospusieron por otro motivo:
 * las que esperan el permiso tienen su grupo, que vuelve solo.
 */
function Pospuestas({
  filas,
  abierto,
  onAlternar,
  onCambiar,
}: {
  filas: FilaBandeja[];
  abierto: boolean;
  onAlternar: () => void;
  onCambiar: (fila: FilaBandeja) => void;
}) {
  const posponer = usePosponer();
  if (filas.length === 0) return null;
  const Flecha = abierto ? ChevronDown : ChevronRight;

  return (
    <section id={idDe("pospuestas")} data-tour="pospuestas" className="scroll-mt-4 rounded-md border">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
      >
        <Flecha className="h-3.5 w-3.5 text-muted-foreground" />
        <AlarmClock className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-[13px] font-semibold">Pospuestas</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{filas.length}</span>
        <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">
          vuelven solas en la fecha elegida, o antes si Operaciones las planifica
        </span>
      </button>

      {abierto && (
        <ul className="border-t">
          {filas.map((f) => (
            <li key={f.otId} className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-[13px] last:border-b-0">
              <Link href={`/habilitaciones/${f.otId}`} className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-semibold">{direccionDeObra(f)}</span>
                  <ChipUrgencia urgencia={f.urgencia} motivo={f.motivoUrgencia} />
                  {f.tipo !== "armado" && <ChipTipoOt tipo={f.tipo} />}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Vuelve el {format(parseISO(f.pospuestaHasta!), "EEE d MMM", { locale: es })}
                  </span>
                  {f.pospuestaMotivo && ` · ${f.pospuestaMotivo}`}
                  {f.pospuestaPor && ` · por ${f.pospuestaPor}`}
                  {f.primeraJornada &&
                    ` · planificada para el ${format(parseISO(f.primeraJornada), "d MMM", { locale: es })}`}
                </span>
              </Link>
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
                      onSuccess: () => toast.success(`${direccionDeObra(f)}: de vuelta en la cola`),
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
 * Lo resuelto, al pie y plegado: las habilitadas (la más reciente primero) y las que no
 * aplican, en dos pestañas. No hay nada que hacer con ellas, pero tienen que ser
 * alcanzables: habilitar o marcar "no aplica" las saca de la cola, y un error se corrige
 * desde acá.
 *
 * REVERTIR PIDE CONFIRMACIÓN Y MOTIVO: le manda a Operaciones un aviso crítico, y el motivo
 * viaja en ese aviso (decisión de JS, 09/10).
 */
function Resueltas({
  habilitadas,
  noAplican,
  abiertoForzado,
  onVolver,
  triando,
}: {
  habilitadas: FilaBandeja[];
  noAplican: FilaBandeja[];
  abiertoForzado: boolean;
  onVolver: (otIds: number[]) => void;
  triando: boolean;
}) {
  const [abiertoManual, setAbierto] = useState(false);
  const [pestana, setPestana] = useState<"habilitadas" | "no_aplican">("habilitadas");
  const [aRevertir, setARevertir] = useState<FilaBandeja | null>(null);
  const [motivo, setMotivo] = useState("");
  const revertir = useRevertirHabilitacion();
  if (habilitadas.length + noAplican.length === 0) return null;
  const abierto = abiertoManual || abiertoForzado;
  const Flecha = abierto ? ChevronDown : ChevronRight;
  // Buscando, la pestaña que tiene resultados.
  const activa = abiertoForzado && pestana === "habilitadas" && habilitadas.length === 0 ? "no_aplican" : pestana;
  const filas = activa === "habilitadas" ? habilitadas : noAplican;

  function confirmar() {
    if (!aRevertir || !motivo.trim()) return;
    revertir.mutate(
      { otId: aRevertir.otId, motivo: motivo.trim() },
      {
        onSuccess: () => {
          toast.success(`${direccionDeObra(aRevertir)}: se revirtió · vuelve a la cola y Operaciones recibió el aviso`);
          setARevertir(null);
          setMotivo("");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo revertir"),
      },
    );
  }

  return (
    <section data-tour="resueltas" className="rounded-md border">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
      >
        <Flecha className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-[13px] font-semibold">Resueltas</h2>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {habilitadas.length} habilitadas · {noAplican.length} no aplican
        </span>
      </button>

      {abierto && (
        <>
          <div className="flex gap-1 border-t px-3 pt-2" role="tablist">
            {(
              [
                ["habilitadas", `Habilitadas (${habilitadas.length})`],
                ["no_aplican", `No aplican (${noAplican.length})`],
              ] as const
            ).map(([clave, texto]) => (
              <button
                key={clave}
                type="button"
                role="tab"
                aria-selected={activa === clave}
                onClick={() => setPestana(clave)}
                className={`rounded-t-md border border-b-0 px-3 py-1 text-[12px] ${
                  activa === clave
                    ? "bg-card font-semibold"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {texto}
              </button>
            ))}
          </div>
          <ul className="border-t">
            {filas.map((f) => (
              <li key={f.otId} className="flex items-center gap-2 border-b px-3 py-2 text-[13px] last:border-b-0">
                <Link href={`/habilitaciones/${f.otId}`} className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-medium">{direccionDeObra(f)}</span>
                    {f.tipo !== "armado" && <ChipTipoOt tipo={f.tipo} />}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {activa === "habilitadas" ? (
                      <>
                        {[
                          `Habilitada el ${format(parseISO(f.habilitadaEl!), "d MMM", { locale: es })}`,
                          f.habilitadaPor ? `por ${f.habilitadaPor}` : null,
                        ].filter(Boolean).join(" ")}
                        {f.habilitadaMotivo && (
                          <span style={{ color: AVISO.texto }}> · por excepción: {f.habilitadaMotivo}</span>
                        )}
                      </>
                    ) : (
                      [partesTitulo(f.titulo).cliente, "no pide papeles · quedó habilitada"].filter(Boolean).join(" · ")
                    )}
                  </span>
                </Link>
                {activa === "habilitadas" ? (
                  <Button size="sm" variant="outline" disabled={revertir.isPending} onClick={() => setARevertir(f)}>
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    Revertir…
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={triando} onClick={() => onVolver([f.otId])}>
                    <Undo2 className="mr-1 h-3.5 w-3.5" />
                    Volver a la cola
                  </Button>
                )}
              </li>
            ))}
            {filas.length === 0 && <li className="px-3 py-3 text-[12px] text-muted-foreground">Ninguna coincide.</li>}
          </ul>
        </>
      )}

      <Dialog open={!!aRevertir} onOpenChange={(abrir) => !abrir && setARevertir(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Revertir la habilitación de {aRevertir && direccionDeObra(aRevertir)}?</DialogTitle>
            <DialogDescription>
              Vuelve a la cola sin habilitar y Operaciones recibe un aviso urgente con este
              motivo. Si ya tiene jornadas planificadas, siguen en el tablero: lo decide
              Operaciones. Los papeles y el historial no se tocan.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-1.5 text-[12px] font-medium">
            Motivo (lo lee Operaciones)
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: lleva permiso y todavía no salió"
              rows={2}
              autoFocus
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setARevertir(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmar} disabled={revertir.isPending || !motivo.trim()}>
              {revertir.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Revertir y avisar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
