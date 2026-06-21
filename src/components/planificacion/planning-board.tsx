"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { startOfWeek, addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { BoardTopbar } from "./board-topbar";
import { PlanningGrid } from "./planning-grid";
import { OtQueue } from "./ot-queue";
import { JornadaPanel, type JornadaBlock, type ViajeExterno } from "./jornada-panel";
import { BloquearHorarioDialog } from "./bloquear-horario-dialog";
import { AsignarOtDialog } from "./asignar-ot-dialog";
import {
  useCuadrillas,
  useAsignacionesSemana,
  useBloqueosSemana,
  useColaOTs,
  useSaveAsignacion,
  useDeleteAsignacion,
  useCreateBloqueo,
  useDeleteBloqueo,
  type Bloqueo,
  type ColaOT,
} from "@/hooks/use-planificacion";
import { useVehiculos } from "@/hooks/use-vehiculos";
import { usePersonal } from "@/hooks/use-personal";
import { tipoOtKey, otBucket } from "@/lib/planificacion/estado";
import { esPersonalDeObra, esChofer } from "@/lib/planificacion/constantes";
import { sugerirHoraInicio, HORAS_NETAS } from "@/lib/planificacion/jornada";

type PanelState = { asignacionId: string; nuevaPorDrop: boolean; camionInicialId?: string | null };

export function PlanningBoard() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [diaSel, setDiaSel] = useState<Date>(() => new Date());
  const [vista, setVista] = useState<"semana" | "dia">("semana");
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [bloquearOpen, setBloquearOpen] = useState(false);
  const [asignarOpen, setAsignarOpen] = useState(false);
  const [asignarPrefill, setAsignarPrefill] = useState<{ cuadrillaId: string; fecha: string } | null>(null);
  const [bloqueoAQuitar, setBloqueoAQuitar] = useState<Bloqueo | null>(null);

  const dias = useMemo(
    () =>
      vista === "semana"
        ? Array.from({ length: 5 }, (_, i) => addDays(weekStart, i))
        : [diaSel],
    [vista, weekStart, diaSel],
  );
  const desde = format(dias[0], "yyyy-MM-dd");
  const hasta = format(dias[dias.length - 1], "yyyy-MM-dd");
  const diaFoco = desde;

  const { data: cuadrillas, isLoading: lc } = useCuadrillas();
  const { data: vehiculos } = useVehiculos();
  const { data: personal } = usePersonal();
  const { data: asignaciones, isLoading: la } = useAsignacionesSemana(desde, hasta);
  const { data: bloqueos } = useBloqueosSemana(desde, hasta);
  const { data: cola } = useColaOTs();

  const saveAsignacion = useSaveAsignacion();
  const deleteAsignacion = useDeleteAsignacion();
  const createBloqueo = useCreateBloqueo();
  const deleteBloqueo = useDeleteBloqueo();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeOt, setActiveOt] = useState<ColaOT | null>(null);

  const camiones = useMemo(() => (vehiculos ?? []).filter((v) => v.tipo === "camion"), [vehiculos]);
  const personalObra = useMemo(() => (personal ?? []).filter((p) => esPersonalDeObra(p.puesto)), [personal]);
  const choferes = useMemo(() => (personal ?? []).filter((p) => esChofer(p.puesto)), [personal]);

  const asigs = useMemo(() => asignaciones ?? [], [asignaciones]);
  const blqs = useMemo(() => bloqueos ?? [], [bloqueos]);

  // Cola: OTs sin asignación en el rango visible.
  const colaVisible = useMemo(() => {
    const asignadas = new Set(asigs.map((a) => a.ot_id));
    return (cola ?? []).filter((o) => !asignadas.has(o.id));
  }, [cola, asigs]);
  const otsHabilitadas = colaVisible.filter((o) => otBucket(o) === "habilitada");

  const rangoLabel =
    vista === "semana"
      ? `${format(dias[0], "d MMM", { locale: es })} – ${format(dias[4], "d MMM yyyy", { locale: es })}`
      : format(diaSel, "EEE d MMM yyyy", { locale: es });

  function navPrev() {
    if (vista === "semana") setWeekStart((w) => addDays(w, -7));
    else setDiaSel((d) => addDays(d, -1));
  }
  function navNext() {
    if (vista === "semana") setWeekStart((w) => addDays(w, 7));
    else setDiaSel((d) => addDays(d, 1));
  }
  function navHoy() {
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
    setDiaSel(new Date());
  }

  // ---- Crear asignación (drop sobre cuadrilla o modal "Asignar OT") ----
  function crearAsignacion(otId: string, cuadrillaId: string, fecha: string, camionInicialId?: string | null) {
    const horasYa = asigs
      .filter((a) => a.cuadrilla_id === cuadrillaId && a.fecha === fecha)
      .reduce((s, a) => s + a.horas_jornada, 0);
    const restante = Math.max(1, HORAS_NETAS - horasYa);
    saveAsignacion.mutate(
      {
        id: null,
        ot_id: otId,
        cuadrilla_id: cuadrillaId,
        fecha,
        horas_jornada: Math.min(HORAS_NETAS, restante),
        hora_inicio: sugerirHoraInicio(horasYa), // MEJORA: encadenar hora de inicio
        estado: "sin_completar",
        personalIds: [],
        viajes: [],
      },
      {
        onSuccess: (res) => setPanel({ asignacionId: res.id, nuevaPorDrop: true, camionInicialId }),
        onError: () => toast.error("No se pudo crear la asignación"),
      },
    );
  }

  function onDragStart(e: DragStartEvent) {
    setActiveOt((e.active.data.current?.ot as ColaOT) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveOt(null);
    const over = e.over;
    const ot = e.active.data.current?.ot as ColaOT | undefined;
    if (!over || !ot) return;
    const { recursoTipo, recursoId, fecha } = over.data.current as {
      recursoTipo: "cuadrilla" | "camion";
      recursoId: string;
      fecha: string;
    };
    if (otBucket(ot) !== "habilitada") {
      toast.error("Esta OT aún no está habilitada");
      return;
    }
    if (recursoTipo === "cuadrilla") {
      crearAsignacion(ot.id, recursoId, fecha);
    } else {
      // Camión: agregar viaje a la jornada de esa OT ese día (debe existir una cuadrilla asignada).
      const existente = asigs.find((a) => a.ot_id === ot.id && a.fecha === fecha);
      if (existente) {
        setPanel({ asignacionId: existente.id, nuevaPorDrop: false, camionInicialId: recursoId });
      } else {
        toast.info("Primero asigná la OT a una cuadrilla, después sumá el camión");
      }
    }
  }

  // ---- Datos del panel ----
  const panelAsig = panel ? asigs.find((a) => a.id === panel.asignacionId) ?? null : null;
  const panelData = useMemo(() => {
    if (!panelAsig) return null;
    const cuadrilla = (cuadrillas ?? []).find((c) => c.id === panelAsig.cuadrilla_id);
    const otras: JornadaBlock[] = asigs
      .filter((a) => a.cuadrilla_id === panelAsig.cuadrilla_id && a.fecha === panelAsig.fecha && a.id !== panelAsig.id)
      .map((a) => ({
        label: a.ordenes_trabajo?.obras?.nombre ?? a.ordenes_trabajo?.codigo ?? "OT",
        horaInicio: a.hora_inicio.slice(0, 5),
        horas: a.horas_jornada,
        tipoKey: tipoOtKey(a.ordenes_trabajo?.tipo ?? "otro", a.ordenes_trabajo?.es_adicional ?? false),
      }));
    const bloqueosFranjas = blqs
      .filter((b) => b.cuadrilla_id === panelAsig.cuadrilla_id && b.fecha === panelAsig.fecha)
      .map((b) => ({ desde: b.franja_desde, hasta: b.franja_hasta }));
    const personalOcupado = new Set(
      asigs
        .filter((a) => a.fecha === panelAsig.fecha && a.cuadrilla_id !== panelAsig.cuadrilla_id)
        .flatMap((a) => (a.planificacion_asignacion_personal ?? []).map((p) => p.personal_id)),
    );
    const viajesExternos: ViajeExterno[] = asigs
      .filter((a) => a.fecha === panelAsig.fecha && a.id !== panelAsig.id)
      .flatMap((a) =>
        (a.planificacion_viajes ?? []).map((v) => ({
          camion_id: v.camion_id,
          desde: v.franja_desde.slice(0, 5),
          hasta: v.franja_hasta.slice(0, 5),
          obra: a.ordenes_trabajo?.obras?.nombre ?? "otra obra",
        })),
      );
    return { cuadrilla, otras, bloqueosFranjas, personalOcupado, viajesExternos };
  }, [panelAsig, asigs, blqs, cuadrillas]);

  function cerrarPanel() {
    setPanel(null);
  }
  function cancelarPanel() {
    if (panel?.nuevaPorDrop && panelAsig) {
      deleteAsignacion.mutate(panelAsig.id);
    }
    cerrarPanel();
  }

  if (lc || la || !cuadrillas) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <BoardTopbar
        rangoLabel={rangoLabel}
        vista={vista}
        onVista={setVista}
        onPrev={navPrev}
        onNext={navNext}
        onHoy={navHoy}
        onBloquear={() => setBloquearOpen(true)}
        onAsignar={() => {
          setAsignarPrefill(null);
          setAsignarOpen(true);
        }}
      />

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex min-h-0 flex-1">
          <PlanningGrid
            cuadrillas={cuadrillas}
            camiones={camiones}
            dias={dias}
            asignaciones={asigs}
            bloqueos={blqs}
            diaFoco={diaFoco}
            selectedAsignacionId={panel?.asignacionId ?? null}
            onOtClick={(a) => setPanel({ asignacionId: a.id, nuevaPorDrop: false })}
            onBloqueoClick={(b) => setBloqueoAQuitar(b)}
            onAddCuadrilla={(cuadrillaId, fecha) => {
              setAsignarPrefill({ cuadrillaId, fecha });
              setAsignarOpen(true);
            }}
          />

          {panel && panelData ? (
            panelAsig ? (
              <JornadaPanel
                key={panelAsig.id}
                asignacion={panelAsig}
                nuevaPorDrop={panel.nuevaPorDrop}
                camionInicialId={panel.camionInicialId}
                cuadrillaNombre={panelData.cuadrilla?.nombre ?? "Cuadrilla"}
                fechaLabel={format(new Date(`${panelAsig.fecha}T00:00:00`), "EEE d MMM", { locale: es })}
                personalObra={personalObra}
                choferes={choferes}
                camiones={camiones}
                otrasJornadasCuadrilla={panelData.otras}
                bloqueosFranjas={panelData.bloqueosFranjas}
                personalOcupado={panelData.personalOcupado}
                viajesExternos={panelData.viajesExternos}
                saving={saveAsignacion.isPending}
                onGuardar={(d) =>
                  saveAsignacion.mutate(
                    {
                      id: panelAsig.id,
                      ot_id: panelAsig.ot_id,
                      cuadrilla_id: panelAsig.cuadrilla_id,
                      fecha: panelAsig.fecha,
                      horas_jornada: d.horasJornada,
                      hora_inicio: d.horaInicio,
                      estado: d.estado,
                      personalIds: d.personalIds,
                      viajes: d.viajes,
                    },
                    {
                      onSuccess: () => {
                        toast.success("Jornada guardada");
                        cerrarPanel();
                      },
                      onError: () => toast.error("No se pudo guardar la jornada"),
                    },
                  )
                }
                onCancel={cancelarPanel}
              />
            ) : (
              <div className="flex w-[236px] shrink-0 items-center justify-center border-l text-sm text-muted-foreground">
                Cargando…
              </div>
            )
          ) : (
            <OtQueue ots={colaVisible} />
          )}
        </div>

        <DragOverlay>
          {activeOt && (
            <div className="rounded-md border bg-card p-2 shadow-md">
              <p className="text-[11px] font-medium">{activeOt.obras?.nombre ?? activeOt.codigo}</p>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <BloquearHorarioDialog
        open={bloquearOpen}
        onOpenChange={setBloquearOpen}
        cuadrillas={cuadrillas}
        dias={dias}
        saving={createBloqueo.isPending}
        onCrear={(d) =>
          createBloqueo.mutate(d, {
            onSuccess: () => {
              toast.success("Franja bloqueada");
              setBloquearOpen(false);
            },
            onError: () => toast.error("No se pudo bloquear"),
          })
        }
      />

      <AsignarOtDialog
        open={asignarOpen}
        onOpenChange={setAsignarOpen}
        otsHabilitadas={otsHabilitadas}
        cuadrillas={cuadrillas}
        dias={dias}
        prefill={asignarPrefill}
        saving={saveAsignacion.isPending}
        onAsignar={(otId, cuadrillaId, fecha) => {
          setAsignarOpen(false);
          crearAsignacion(otId, cuadrillaId, fecha);
        }}
      />

      <ConfirmDialog
        open={!!bloqueoAQuitar}
        onOpenChange={(o) => !o && setBloqueoAQuitar(null)}
        title="Quitar bloqueo"
        description={`¿Quitar el bloqueo${bloqueoAQuitar?.motivo ? ` "${bloqueoAQuitar.motivo}"` : ""}?`}
        confirmLabel="Quitar bloqueo"
        variant="destructive"
        loading={deleteBloqueo.isPending}
        onConfirm={() => {
          if (bloqueoAQuitar)
            deleteBloqueo.mutate(bloqueoAQuitar.id, {
              onSuccess: () => {
                toast.success("Bloqueo quitado");
                setBloqueoAQuitar(null);
              },
            });
        }}
      />
    </div>
  );
}
