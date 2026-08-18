"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { addDays, format, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TopbarTablero } from "./topbar-tablero";
import { TableroGrid } from "./tablero-grid";
import { PanelSinAsignar, ID_BANDEJA } from "./panel-sin-asignar";
import { ContenidoTarjeta } from "./tarjeta-asignacion";
import { PanelOt } from "./panel-ot";
import { FormularioCierre } from "./formulario-cierre";
import {
  useTablero,
  useCrearAsignaciones,
  useActualizarAsignaciones,
  useMoverAsignaciones,
  useBorrarAsignaciones,
} from "@/hooks/use-tablero";
import { agruparBloques, fechasDeJornadas, type Bloque } from "@/lib/tablero/bloques";
import type { AccionCierre } from "@/lib/tablero/cierre";
import { repartirJornadas, type FraccionStr } from "@/lib/tablero/fracciones";
import type { MovimientoAsignacion, NuevaAsignacion, TableroPayload } from "@/lib/tablero/tipos";

// Tablero de Planificación de Cuadrillas.
//
// El problema que resuelve: en la planilla, una obra de varias jornadas solo figuraba
// el día que arrancaba, así que nadie veía que la cuadrilla ya estaba tomada. Acá una
// obra ocupa visualmente todos sus días y cada celda muestra cuánto le queda libre.
//
// Toda escritura va a Odoo (x_aba_asignacion) vía /api/planificacion. Sin base de
// datos propia y sin duplicación: la app escribe, Odoo lee.

const CLAVE_CUADRILLAS = "tablero:cuadrillas";
const CLAVE_PANEL = "tablero:panel-colapsado";

function leerVisiblesGuardadas(): number[] | null {
  if (typeof window === "undefined") return null;
  try {
    const crudo = window.localStorage.getItem(CLAVE_CUADRILLAS);
    const ids = crudo ? (JSON.parse(crudo) as unknown) : null;
    return Array.isArray(ids) && ids.every((i) => typeof i === "number") ? ids : null;
  } catch {
    return null;
  }
}

/**
 * Filas por defecto: la UNIÓN de las cuadrillas con carga y las que figuran como
 * cuadrilla prevista en las OTs candidatas. Si no hay ni unas ni otras, todas.
 *
 * Es unión y no "las que tienen carga, si no las previstas": con esa regla, asignar la
 * primera obra de la semana hacía desaparecer todas las filas menos una.
 */
function visiblesPorDefecto(data: TableroPayload): number[] {
  const activas = new Set(data.cuadrillas.map((c) => c.id));
  const conCarga = data.asignaciones.map((a) => a.cuadrillaId);
  const previstas = data.ots.map((o) => o.cuadrillaPrevistaId);
  const propuestas = [...new Set([...conCarga, ...previstas])].filter(
    (id): id is number => id !== null && activas.has(id),
  );
  return propuestas.length > 0 ? propuestas : data.cuadrillas.map((c) => c.id);
}

// Al soltar sobre una tarjeta hay colisión con la tarjeta y con la celda que tiene
// debajo. La tarjeta gana: soltar sobre otra tarjeta reordena el día.
const detectarColision: CollisionDetection = (args) => {
  const dentro = pointerWithin(args);
  const sobreTarjeta = dentro.find((c) => String(c.id).startsWith("tarjeta:"));
  if (sobreTarjeta) return [sobreTarjeta];
  return dentro.length > 0 ? dentro : rectIntersection(args);
};

export function TableroBoard() {
  const [lunes, setLunes] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [visibles, setVisibles] = useState<number[] | null>(leerVisiblesGuardadas);
  const [panel, setPanel] = useState<{ otId: number; bloqueKey: string | null } | null>(null);
  const [cierre, setCierre] = useState<{
    bloqueKey: string;
    asignacionId: number;
    fecha: string;
    parteId: number | null;
  } | null>(null);
  const [panelColapsado, setPanelColapsado] = useState<boolean>(
    () => typeof window !== "undefined" && window.localStorage.getItem(CLAVE_PANEL) === "true",
  );
  const [arrastrando, setArrastrando] = useState<
    { tipo: "ot"; otId: number } | { tipo: "bloque"; bloque: Bloque } | null
  >(null);

  // Se pide una semana de más a cada lado: una obra que arranca el jueves anterior y
  // termina el martes tiene que llegar entera, o al arrastrarla se moverían solo los
  // días visibles. Las columnas siguen siendo las de esta semana.
  const desde = format(addDays(lunes, -7), "yyyy-MM-dd");
  const hasta = format(addDays(lunes, 13), "yyyy-MM-dd");

  const { data, isLoading, isFetching, error, refetch } = useTablero(desde, hasta);
  const crear = useCrearAsignaciones();
  const actualizar = useActualizarAsignaciones();
  const mover = useMoverAsignaciones();
  const borrar = useBorrarAsignaciones();
  const guardando = crear.isPending || actualizar.isPending || mover.isPending || borrar.isPending;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Sin preferencia guardada se deriva un default con criterio, sin escribirlo: recién
  // cuando el usuario elige, la selección pasa a ser suya y se persiste.
  //
  // Se calcula UNA sola vez y se congela. Si se recalculara con cada respuesta del
  // servidor, asignar una obra cambiaría las filas visibles debajo del mouse.
  const [defaultCongelado, setDefaultCongelado] = useState<number[] | null>(null);
  if (data && defaultCongelado === null) setDefaultCongelado(visiblesPorDefecto(data));
  const visiblesEfectivas = useMemo(
    () => visibles ?? defaultCongelado ?? [],
    [visibles, defaultCongelado],
  );

  function colapsarPanel(valor: boolean) {
    setPanelColapsado(valor);
    if (typeof window !== "undefined") window.localStorage.setItem(CLAVE_PANEL, String(valor));
  }

  function cambiarVisibles(ids: number[]) {
    setVisibles(ids);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CLAVE_CUADRILLAS, JSON.stringify(ids));
    }
  }

  // Lunes a sábado. El domingo aparece solo si tiene algo asignado: no se trabaja.
  const fechas = useMemo(() => {
    const semana = Array.from({ length: 7 }, (_, i) => format(addDays(lunes, i), "yyyy-MM-dd"));
    const domingo = semana[6];
    const hayDomingo = (data?.asignaciones ?? []).some((a) => a.fecha === domingo);
    return hayDomingo ? semana : semana.slice(0, 6);
  }, [lunes, data]);

  const otsPorId = useMemo(() => new Map((data?.ots ?? []).map((o) => [o.id, o])), [data]);

  const cuadrillasVisibles = useMemo(() => {
    if (!data) return [];
    const set = new Set(visiblesEfectivas);
    return data.cuadrillas.filter((c) => set.has(c.id));
  }, [data, visiblesEfectivas]);

  const conAsignaciones = useMemo(
    () =>
      new Set(
        (data?.asignaciones ?? [])
          .map((a) => a.cuadrillaId)
          .filter((id): id is number => id !== null),
      ),
    [data],
  );

  // Bandeja: OTs candidatas que no tienen ninguna jornada en el tablero.
  const sinAsignar = useMemo(() => {
    if (!data) return [];
    const asignadas = new Set(data.otsAsignadas);
    return data.ots.filter((o) => !asignadas.has(o.id) && ["pendiente", "en_proceso"].includes(o.estado));
  }, [data]);

  const bloquesPorClave = useMemo(() => {
    const mapa = new Map<string, Bloque>();
    for (const b of agruparBloques(data?.asignaciones ?? [])) mapa.set(b.key, b);
    return mapa;
  }, [data]);

  const hoyISO = format(new Date(), "yyyy-MM-dd");

  const rangoLabel = `${format(lunes, "d MMM", { locale: es })} – ${format(addDays(lunes, 5), "d MMM yyyy", { locale: es })}`;

  // ── Escrituras ─────────────────────────────────────────────────────────────

  /** Cuántos bloques hay ya en una celda: define el orden de apilado del nuevo. */
  function proximoOrden(cuadrillaId: number, fecha: string): number {
    const enCelda = (data?.asignaciones ?? []).filter(
      (a) => a.cuadrillaId === cuadrillaId && a.fecha === fecha,
    );
    return enCelda.length === 0 ? 0 : Math.max(...enCelda.map((a) => a.ordenDia)) + 1;
  }

  function asignarObra(otId: number, cuadrillaId: number, fecha: string) {
    const ot = otsPorId.get(otId);
    if (!ot) return;

    const fracciones = repartirJornadas(ot.jornadas);
    const dias = fechasDeJornadas(fecha, fracciones.length);
    const orden = proximoOrden(cuadrillaId, dias[0]);

    const nuevas: NuevaAsignacion[] = dias.map((f, i) => ({
      otId,
      fecha: f,
      cuadrillaId,
      fraccion: fracciones[i],
      // Tentativa es el modo de trabajo normal: no se fuerza confirmar para poder mover.
      estado: "tentativa",
      ordenDia: orden,
    }));
    crear.mutate(nuevas);
  }

  function moverBloque(bloque: Bloque, cuadrillaId: number, fecha: string) {
    const dias = fechasDeJornadas(fecha, bloque.ids.length);
    const orden = proximoOrden(cuadrillaId, dias[0]);
    const movimientos: MovimientoAsignacion[] = bloque.ids.map((id, i) => ({
      id,
      fecha: dias[i],
      cuadrillaId,
      ordenDia: orden,
    }));
    mover.mutate(movimientos);
  }

  /** Reordenar el apilado de un día: define el orden previsto de las obras. */
  function reordenarCelda(origen: Bloque, destino: Bloque) {
    const cuadrillaId = destino.cuadrillaId;
    const fecha = destino.fechas[0];
    if (cuadrillaId === null) return;

    const enCelda = [...bloquesPorClave.values()]
      .filter((b) => b.cuadrillaId === cuadrillaId && b.fechas.includes(fecha))
      .sort((a, b) => a.ordenDia - b.ordenDia || a.ids[0] - b.ids[0]);

    const desdeIdx = enCelda.findIndex((b) => b.key === origen.key);
    const hastaIdx = enCelda.findIndex((b) => b.key === destino.key);
    if (desdeIdx < 0 || hastaIdx < 0 || desdeIdx === hastaIdx) return;

    const reordenados = enCelda.slice();
    const [movido] = reordenados.splice(desdeIdx, 1);
    reordenados.splice(hastaIdx, 0, movido);

    const movimientos: MovimientoAsignacion[] = reordenados.flatMap((b, orden) =>
      b.ids.map((id, i) => ({ id, fecha: b.fechas[i], ordenDia: orden })),
    );
    mover.mutate(movimientos);
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (id.startsWith("ot:")) setArrastrando({ tipo: "ot", otId: Number(id.slice(3)) });
    else if (id.startsWith("bloque:")) {
      const bloque = bloquesPorClave.get(id.slice(7));
      setArrastrando(bloque ? { tipo: "bloque", bloque } : null);
    }
  }

  function onDragEnd(e: DragEndEvent) {
    setArrastrando(null);
    const over = e.over;
    if (!over) return;

    const activo = String(e.active.id);
    const destino = String(over.id);

    // Desde la bandeja a una celda: nacen las jornadas de la obra.
    if (activo.startsWith("ot:")) {
      const otId = Number(activo.slice(3));
      const celda = celdaDe(destino, over.data.current);
      if (!celda) return;
      asignarObra(otId, celda.cuadrillaId, celda.fecha);
      return;
    }

    if (!activo.startsWith("bloque:")) return;
    const bloque = bloquesPorClave.get(activo.slice(7));
    if (!bloque) return;

    // Fuera de la grilla: la obra vuelve a la bandeja de sin asignar.
    if (destino === ID_BANDEJA) {
      borrar.mutate(bloque.ids);
      return;
    }

    // Sobre otra tarjeta del mismo día y cuadrilla: reordena el apilado.
    if (destino.startsWith("tarjeta:")) {
      const otro = bloquesPorClave.get(destino.slice(8));
      if (!otro || otro.key === bloque.key) return;
      const mismaCelda =
        otro.cuadrillaId === bloque.cuadrillaId && otro.fechas[0] === bloque.fechas[0];
      if (mismaCelda) reordenarCelda(bloque, otro);
      else if (otro.cuadrillaId !== null) moverBloque(bloque, otro.cuadrillaId, otro.fechas[0]);
      return;
    }

    const celda = celdaDe(destino, over.data.current);
    if (!celda) return;
    if (celda.cuadrillaId === bloque.cuadrillaId && celda.fecha === bloque.fechas[0]) return;
    moverBloque(bloque, celda.cuadrillaId, celda.fecha);
  }

  function celdaDe(id: string, datos: unknown): { cuadrillaId: number; fecha: string } | null {
    if (!id.startsWith("celda:")) return null;
    const d = datos as { cuadrillaId?: number; fecha?: string } | undefined;
    if (typeof d?.cuadrillaId === "number" && typeof d.fecha === "string") {
      return { cuadrillaId: d.cuadrillaId, fecha: d.fecha };
    }
    const [, cuadrilla, fecha] = id.split(":");
    return { cuadrillaId: Number(cuadrilla), fecha };
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">
          No se pudo leer la planificación desde Odoo.
          <br />
          {error.message}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const panelOt = panel ? (otsPorId.get(panel.otId) ?? null) : null;
  const panelBloque = panel?.bloqueKey ? (bloquesPorClave.get(panel.bloqueKey) ?? null) : null;
  const panelCuadrilla =
    panelBloque?.cuadrillaId != null
      ? (data.cuadrillas.find((c) => c.id === panelBloque.cuadrillaId)?.nombre ?? null)
      : null;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <TopbarTablero
        rangoLabel={rangoLabel}
        cuadrillas={data.cuadrillas}
        visibles={visiblesEfectivas}
        conAsignaciones={conAsignaciones}
        guardando={guardando}
        refrescando={isFetching}
        onCuadrillas={cambiarVisibles}
        onPrev={() => setLunes((l) => addDays(l, -7))}
        onNext={() => setLunes((l) => addDays(l, 7))}
        onHoy={() => setLunes(startOfWeek(new Date(), { weekStartsOn: 1 }))}
        onRefrescar={() => refetch()}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={detectarColision}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setArrastrando(null)}
      >
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border">
          {cuadrillasVisibles.length > 0 ? (
            <TableroGrid
              cuadrillas={cuadrillasVisibles}
              fechas={fechas}
              asignaciones={data.asignaciones}
              ots={otsPorId}
              partes={data.partes}
              bloqueSeleccionado={panel?.bloqueKey ?? null}
              hoy={hoyISO}
              onCerrarJornada={(b, accion: NonNullable<AccionCierre>) =>
                setCierre({
                  bloqueKey: b.key,
                  asignacionId: accion.asignacionId,
                  fecha: accion.fecha,
                  parteId: accion.tipo === "ver" ? accion.parteId : null,
                })
              }
              onAbrirBloque={(b) => setPanel({ otId: b.otId, bloqueKey: b.key })}
              onFraccion={(b, f: FraccionStr) => actualizar.mutate({ ids: b.ids, cambio: { fraccion: f } })}
              onEstado={(b, estado) => actualizar.mutate({ ids: b.ids, cambio: { estado } })}
              onQuitar={(b) => borrar.mutate(b.ids)}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
              No hay cuadrillas visibles. Elegí cuáles ver desde el selector de arriba.
            </div>
          )}

          <PanelSinAsignar
            ots={sinAsignar}
            colapsado={panelColapsado}
            onColapsar={colapsarPanel}
          />
        </div>

        <DragOverlay>
          {arrastrando?.tipo === "bloque" && (
            <div className="w-[150px]">
              <ContenidoTarjeta
                ot={otsPorId.get(arrastrando.bloque.otId)}
                bloque={arrastrando.bloque}
                indiceColor={cuadrillasVisibles.findIndex((c) => c.id === arrastrando.bloque.cuadrillaId)}
                compacta
              />
            </div>
          )}
          {arrastrando?.tipo === "ot" && (
            <div className="w-[190px] rounded-md border bg-card p-1.5 shadow-md">
              <p className="truncate text-[10px] font-medium">
                {otsPorId.get(arrastrando.otId)?.titulo ?? "OT"}
              </p>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <FormularioCierre
        abierto={!!cierre}
        bloque={cierre ? (bloquesPorClave.get(cierre.bloqueKey) ?? null) : null}
        ot={cierre ? otsPorId.get(bloquesPorClave.get(cierre.bloqueKey)?.otId ?? 0) : undefined}
        cuadrillas={data.cuadrillas}
        fecha={cierre?.fecha ?? null}
        asignacionId={cierre?.asignacionId ?? null}
        parteId={cierre?.parteId ?? null}
        onOpenChange={(abierto) => !abierto && setCierre(null)}
      />

      <PanelOt
        ot={panelOt}
        bloque={panelBloque}
        cuadrillaNombre={panelCuadrilla}
        onOpenChange={(abierto) => !abierto && setPanel(null)}
      />
    </div>
  );
}
