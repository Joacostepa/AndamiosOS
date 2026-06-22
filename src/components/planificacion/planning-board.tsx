"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { startOfWeek, startOfMonth, addDays, addMonths, format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { BoardTopbar } from "./board-topbar";
import { PlanningGrid } from "./planning-grid";
import { MonthView } from "./month-view";
import { OtQueue, type GrupoCola } from "./ot-queue";
import { JornadaPanel, type JornadaBlock, type ViajeExterno } from "./jornada-panel";
import { BloquearHorarioDialog } from "./bloquear-horario-dialog";
import { AsignarOtDialog } from "./asignar-ot-dialog";
import { MoverDiaDialog } from "./mover-dia-dialog";
import {
  useCuadrillas,
  useAsignacionesSemana,
  useBloqueosSemana,
  useJornadasCola,
  useSaveAsignacion,
  useDeleteAsignacion,
  useMoverAsignacion,
  useReordenarDia,
  useVolverOtPendiente,
  useCreateBloqueo,
  useDeleteBloqueo,
  type Asignacion,
  type Bloqueo,
  type ColaOT,
  type JornadaColaRow,
} from "@/hooks/use-planificacion";
import { useVehiculos } from "@/hooks/use-vehiculos";
import { usePersonal } from "@/hooks/use-personal";
import { tipoOtKey, otBucket } from "@/lib/planificacion/estado";
import { esPersonalDeObra, esChofer } from "@/lib/planificacion/constantes";
import { sugerirHoraInicio, HORAS_NETAS, aMinutos } from "@/lib/planificacion/jornada";
import { semanasDelMes } from "@/lib/planificacion/mes";

type Vista = "mes" | "semana" | "dia";
type PanelState = { asignacionId: string; nuevaPorDrop: boolean; camionInicialId?: string | null };

export function PlanningBoard() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [diaSel, setDiaSel] = useState<Date>(() => new Date());
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => startOfMonth(new Date()));
  const [vista, setVista] = useState<Vista>("semana");
  const [mostrarDomingo, setMostrarDomingo] = useState<boolean>(
    () => typeof window !== "undefined" && window.localStorage.getItem("plan:domingo") === "true",
  );
  const [anchoLateral, setAnchoLateral] = useState<number>(() =>
    typeof window === "undefined" ? 280 : Number(window.localStorage.getItem("plan:anchoLateral")) || 280,
  );
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("plan:anchoLateral", String(anchoLateral));
  }, [anchoLateral]);
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [bloquearOpen, setBloquearOpen] = useState(false);
  const [asignarOpen, setAsignarOpen] = useState(false);
  const [asignarPrefill, setAsignarPrefill] = useState<{ cuadrillaId: string; fecha: string } | null>(null);
  const [asignarJornada, setAsignarJornada] = useState<{ ot: ColaOT; jornada: JornadaColaRow } | null>(null);
  const [fueraDeOrden, setFueraDeOrden] = useState<{ ot: ColaOT; jornada: JornadaColaRow } | null>(null);
  const [bloqueoAQuitar, setBloqueoAQuitar] = useState<Bloqueo | null>(null);
  const [moverAsig, setMoverAsig] = useState<Asignacion | null>(null);
  const [volverOt, setVolverOt] = useState<Asignacion | null>(null);

  const dias = useMemo(() => {
    if (vista === "dia") return [diaSel];
    const n = mostrarDomingo ? 7 : 6; // Lun–Sáb (+Dom opcional)
    return Array.from({ length: n }, (_, i) => addDays(weekStart, i));
  }, [vista, weekStart, diaSel, mostrarDomingo]);
  const mesSemanas = useMemo(() => semanasDelMes(monthAnchor), [monthAnchor]);

  const { desde, hasta } = useMemo(() => {
    if (vista === "mes") {
      const flat = mesSemanas.flat();
      return { desde: format(flat[0], "yyyy-MM-dd"), hasta: format(flat[flat.length - 1], "yyyy-MM-dd") };
    }
    return { desde: format(dias[0], "yyyy-MM-dd"), hasta: format(dias[dias.length - 1], "yyyy-MM-dd") };
  }, [vista, mesSemanas, dias]);
  const diaFoco = format(dias[0], "yyyy-MM-dd");

  const { data: cuadrillas, isLoading: lc } = useCuadrillas();
  const { data: vehiculos } = useVehiculos();
  const { data: personal } = usePersonal();
  const { data: asignaciones, isLoading: la } = useAsignacionesSemana(desde, hasta);
  const { data: bloqueos } = useBloqueosSemana(desde, hasta);
  const { data: jornadasCola } = useJornadasCola();

  const saveAsignacion = useSaveAsignacion();
  const deleteAsignacion = useDeleteAsignacion();
  const moverAsignacion = useMoverAsignacion();
  const reordenarDia = useReordenarDia();
  const volverPendiente = useVolverOtPendiente();
  const createBloqueo = useCreateBloqueo();
  const deleteBloqueo = useDeleteBloqueo();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeDrag, setActiveDrag] = useState<{ ot: ColaOT; jornada?: JornadaColaRow } | null>(null);

  const responsablePorCuadrilla = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const c of cuadrillas ?? []) map[c.id] = c.responsable_id;
    return map;
  }, [cuadrillas]);

  // Camiones de reparto del tablero: camiones e hidrogrúas (ambos hacen viajes).
  const camiones = useMemo(
    () => (vehiculos ?? []).filter((v) => v.tipo === "camion" || v.tipo === "hidrogrua"),
    [vehiculos],
  );
  const personalObra = useMemo(() => (personal ?? []).filter((p) => esPersonalDeObra(p.puesto)), [personal]);
  const choferes = useMemo(() => (personal ?? []).filter((p) => esChofer(p.puesto)), [personal]);

  const asigs = useMemo(() => asignaciones ?? [], [asignaciones]);
  const blqs = useMemo(() => bloqueos ?? [], [bloqueos]);

  // Agrupar jornadas por OT para la cola.
  const grupos = useMemo<GrupoCola[]>(() => {
    const map = new Map<string, GrupoCola>();
    for (const row of jornadasCola ?? []) {
      let g = map.get(row.ot_id);
      if (!g) {
        g = { ot: row.ordenes_trabajo, jornadas: [] };
        map.set(row.ot_id, g);
      }
      g.jornadas.push(row);
    }
    return [...map.values()];
  }, [jornadasCola]);

  const otsHabilitadas = grupos.filter((g) => otBucket(g.ot) === "habilitada").map((g) => g.ot);

  function siguienteJornadaPendiente(otId: string): JornadaColaRow | null {
    const g = grupos.find((x) => x.ot.id === otId);
    if (!g) return null;
    return [...g.jornadas].sort((a, b) => a.numero - b.numero).find((j) => j.estado === "pendiente") ?? null;
  }

  const rangoLabel =
    vista === "mes"
      ? format(monthAnchor, "MMM yyyy", { locale: es })
      : vista === "semana"
        ? `${format(dias[0], "d MMM", { locale: es })} – ${format(dias[dias.length - 1], "d MMM yyyy", { locale: es })}`
        : format(diaSel, "EEE d MMM yyyy", { locale: es });

  function navPrev() {
    if (vista === "mes") setMonthAnchor((m) => addMonths(m, -1));
    else if (vista === "semana") setWeekStart((w) => addDays(w, -7));
    else setDiaSel((d) => addDays(d, -1));
  }
  function navNext() {
    if (vista === "mes") setMonthAnchor((m) => addMonths(m, 1));
    else if (vista === "semana") setWeekStart((w) => addDays(w, 7));
    else setDiaSel((d) => addDays(d, 1));
  }
  function navHoy() {
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
    setDiaSel(new Date());
    setMonthAnchor(startOfMonth(new Date()));
  }
  function toggleDomingo() {
    setMostrarDomingo((v) => {
      const next = !v;
      if (typeof window !== "undefined") window.localStorage.setItem("plan:domingo", String(next));
      return next;
    });
  }
  // Redimensionar el panel/cola lateral arrastrando su borde izquierdo.
  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = anchoLateral;
    function onMove(ev: MouseEvent) {
      setAnchoLateral(Math.min(640, Math.max(220, startW + (startX - ev.clientX))));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Reordenar las jornadas de una cuadrilla en un día: re-encadena hora_inicio.
  function reordenarCelda(A: Asignacion, B: Asignacion) {
    const cell = asigs
      .filter((a) => a.cuadrilla_id === A.cuadrilla_id && a.fecha === A.fecha)
      .sort((x, y) => aMinutos(x.hora_inicio) - aMinutos(y.hora_inicio));
    const from = cell.findIndex((x) => x.id === A.id);
    const to = cell.findIndex((x) => x.id === B.id);
    if (from < 0 || to < 0 || from === to) return;
    const reordered = cell.slice();
    const [m] = reordered.splice(from, 1);
    reordered.splice(to, 0, m);
    let acc = 0;
    const updates = reordered.map((x) => {
      const hi = sugerirHoraInicio(acc);
      acc += x.horas_jornada;
      return { id: x.id, hora_inicio: hi };
    });
    reordenarDia.mutate(updates, { onError: () => toast.error("No se pudo reordenar") });
  }

  // Plantel base de una cuadrilla (responsable primero) para precargar la jornada.
  function plantelDe(cuadrillaId: string): string[] {
    const c = (cuadrillas ?? []).find((x) => x.id === cuadrillaId);
    if (!c) return [];
    const ids = (c.cuadrilla_personal ?? []).map((p) => p.personal_id);
    const resp = c.responsable_id;
    return resp && ids.includes(resp) ? [resp, ...ids.filter((i) => i !== resp)] : ids;
  }

  // ---- Crear asignación (drop / modal) ----
  function crearAsignacion(otId: string, cuadrillaId: string, fecha: string, jornadaId: string | null, camionInicialId?: string | null) {
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
        hora_inicio: sugerirHoraInicio(horasYa),
        estado: "sin_completar",
        jornada_id: jornadaId,
        personalIds: plantelDe(cuadrillaId), // precarga del plantel base
        viajes: [],
      },
      {
        onSuccess: (res) => setPanel({ asignacionId: res.id, nuevaPorDrop: true, camionInicialId }),
        onError: () => toast.error("No se pudo crear la asignación"),
      },
    );
  }

  function onDragStart(e: DragStartEvent) {
    const d = e.active.data.current as { ot?: ColaOT; jornada?: JornadaColaRow } | undefined;
    setActiveDrag(d?.ot ? { ot: d.ot, jornada: d.jornada } : null);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveDrag(null);
    const over = e.over;
    if (!over) return;
    const activeData = e.active.data.current as
      | { ot?: ColaOT; jornada?: JornadaColaRow; asignacion?: Asignacion }
      | undefined;
    const overData = over.data.current as
      | { recursoTipo?: "cuadrilla" | "camion"; recursoId?: string; fecha?: string; asignacion?: Asignacion }
      | undefined;

    // (a) Reordenar un bloque dentro del mismo día.
    if (activeData?.asignacion) {
      const A = activeData.asignacion;
      const B = overData?.asignacion;
      if (B && B.id !== A.id && B.cuadrilla_id === A.cuadrilla_id && B.fecha === A.fecha) {
        reordenarCelda(A, B);
      }
      return;
    }

    // (b) Crear asignación desde la cola (puede caer sobre un bloque → derivar la celda).
    const ot = activeData?.ot;
    if (!ot) return;
    let recursoTipo = overData?.recursoTipo;
    let recursoId = overData?.recursoId;
    let fecha = overData?.fecha;
    if (!recursoTipo && overData?.asignacion) {
      recursoTipo = "cuadrilla";
      recursoId = overData.asignacion.cuadrilla_id;
      fecha = overData.asignacion.fecha;
    }
    if (!recursoTipo || !recursoId || !fecha) return;
    if (otBucket(ot) !== "habilitada") {
      toast.error("Esta OT aún no está habilitada");
      return;
    }
    if (recursoTipo === "cuadrilla") {
      crearAsignacion(ot.id, recursoId, fecha, activeData?.jornada?.id ?? null);
    } else {
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
    if (panel?.nuevaPorDrop && panelAsig) deleteAsignacion.mutate(panelAsig.id);
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
        mostrarDomingo={mostrarDomingo}
        onToggleDomingo={toggleDomingo}
        onPrev={navPrev}
        onNext={navNext}
        onHoy={navHoy}
        onBloquear={() => setBloquearOpen(true)}
        onAsignar={() => {
          setAsignarPrefill(null);
          setAsignarJornada(null);
          setAsignarOpen(true);
        }}
      />

      {vista === "mes" ? (
        <MonthView
          mesRef={monthAnchor}
          cuadrillas={cuadrillas}
          camiones={camiones}
          asignaciones={asigs}
          bloqueos={blqs}
          onSelectWeek={(ws) => {
            setWeekStart(ws);
            setVista("semana");
          }}
        />
      ) : (
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
              responsablePorCuadrilla={responsablePorCuadrilla}
              onOtClick={(a) => setPanel({ asignacionId: a.id, nuevaPorDrop: false })}
              onMover={(a) => setMoverAsig(a)}
              onVolver={(a) => setVolverOt(a)}
              onBloqueoClick={(b) => setBloqueoAQuitar(b)}
              onAddCuadrilla={(cuadrillaId, fecha) => {
                setAsignarJornada(null);
                setAsignarPrefill({ cuadrillaId, fecha });
                setAsignarOpen(true);
              }}
            />

            {/* Handle de redimensionado del panel/cola lateral */}
            <div
              onMouseDown={startResize}
              className="w-1.5 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-[#D85A30]/40"
              title="Arrastrá para ajustar el ancho"
            />
            <div className="shrink-0 overflow-hidden border-l" style={{ width: anchoLateral }}>
            {panel && panelData ? (
              panelAsig ? (
                <JornadaPanel
                  key={panelAsig.id}
                  asignacion={panelAsig}
                  nuevaPorDrop={panel.nuevaPorDrop}
                  camionInicialId={panel.camionInicialId}
                  cuadrillaNombre={panelData.cuadrilla?.nombre ?? "Cuadrilla"}
                  responsableId={panelData.cuadrilla?.responsable_id ?? null}
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
                        jornada_id: panelAsig.jornada_id,
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
                <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                  Cargando…
                </div>
              )
            ) : (
              <OtQueue
                grupos={grupos}
                onAsignarFueraDeOrden={(ot, jornada) => setFueraDeOrden({ ot, jornada })}
              />
            )}
            </div>
          </div>

          <DragOverlay>
            {activeDrag && (
              <div className="rounded-md border bg-card p-2 shadow-md">
                <p className="text-[11px] font-medium">{activeDrag.ot.obras?.nombre ?? activeDrag.ot.codigo}</p>
                {activeDrag.jornada && (
                  <p className="text-[9px] text-muted-foreground">Jornada {activeDrag.jornada.numero}</p>
                )}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

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
        lockedOt={
          asignarJornada
            ? { id: asignarJornada.ot.id, label: `${asignarJornada.ot.obras?.nombre ?? asignarJornada.ot.codigo} — Jornada ${asignarJornada.jornada.numero}` }
            : null
        }
        saving={saveAsignacion.isPending}
        onAsignar={(otId, cuadrillaId, fecha) => {
          setAsignarOpen(false);
          const jornadaId = asignarJornada?.jornada.id ?? siguienteJornadaPendiente(otId)?.id ?? null;
          crearAsignacion(otId, cuadrillaId, fecha, jornadaId);
          setAsignarJornada(null);
        }}
      />

      <MoverDiaDialog
        open={!!moverAsig}
        onOpenChange={(o) => !o && setMoverAsig(null)}
        asignacion={moverAsig}
        horasUsadasEn={(cuadrillaId, fecha) =>
          asigs
            .filter((a) => a.cuadrilla_id === cuadrillaId && a.fecha === fecha && a.id !== moverAsig?.id)
            .reduce((s, a) => s + a.horas_jornada, 0)
        }
        saving={moverAsignacion.isPending}
        onConfirm={(fecha) => {
          if (moverAsig)
            moverAsignacion.mutate(
              { id: moverAsig.id, fecha },
              {
                onSuccess: () => {
                  toast.success("Jornada movida");
                  setMoverAsig(null);
                },
                onError: () => toast.error("No se pudo mover"),
              },
            );
        }}
      />

      {/* Confirmar "asignar fuera de orden" → abre el diálogo de asignar */}
      <ConfirmDialog
        open={!!fueraDeOrden}
        onOpenChange={(o) => !o && setFueraDeOrden(null)}
        title="Asignar fuera de orden"
        description="Esta jornada aún no tiene las anteriores asignadas. ¿Querés asignarla de todas formas?"
        confirmLabel="Asignar de todas formas"
        onConfirm={() => {
          if (fueraDeOrden) {
            setAsignarJornada(fueraDeOrden);
            setAsignarPrefill(null);
            setAsignarOpen(true);
          }
          setFueraDeOrden(null);
        }}
      />

      <ConfirmDialog
        open={!!volverOt}
        onOpenChange={(o) => !o && setVolverOt(null)}
        title="Volver OT a pendiente"
        description={`¿Volver "${volverOt?.ordenes_trabajo?.obras?.nombre ?? volverOt?.ordenes_trabajo?.codigo ?? "esta OT"}" a pendiente? Se quitarán del tablero todas sus jornadas asignadas y volverán a la cola.`}
        confirmLabel="Sí, volver a pendiente"
        variant="destructive"
        loading={volverPendiente.isPending}
        onConfirm={() => {
          if (volverOt)
            volverPendiente.mutate(volverOt.ot_id, {
              onSuccess: () => {
                toast.success("OT devuelta a pendiente");
                setVolverOt(null);
                if (panel) cerrarPanel();
              },
              onError: () => toast.error("No se pudo volver a pendiente"),
            });
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
