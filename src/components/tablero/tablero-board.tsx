"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TopbarTablero } from "./topbar-tablero";
import { TableroGrid } from "./tablero-grid";
import { PanelSinAsignar, ID_BANDEJA } from "./panel-sin-asignar";
import { ContenidoTarjeta } from "./tarjeta-asignacion";
import { PanelOt } from "./panel-ot";
import { FormularioCierre } from "./formulario-cierre";
import { DialogoJornadas } from "./dialogo-jornadas";
import {
  useTablero,
  useCrearAsignaciones,
  useActualizarAsignaciones,
  useMoverAsignaciones,
  useBorrarAsignaciones,
} from "@/hooks/use-tablero";
import { agruparBloques, fechasDeJornadas, type Bloque } from "@/lib/tablero/bloques";
import { jornadasLiberables, motivoNoVuelveABandeja, type AccionCierre } from "@/lib/tablero/cierre";
import { toast } from "sonner";
import { repartirJornadas, type FraccionStr } from "@/lib/tablero/fracciones";
import type { ObraPendiente } from "./panel-sin-asignar";
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

/** Ancho de la columna fija de cuadrillas: hay que descontarlo al hacer snap de semana. */
const ANCHO_RECURSO = 168;
/** A cuántos px del borde del scroll se carga otra semana. */
const UMBRAL_BORDE = 240;

const iso = (d: Date) => format(d, "yyyy-MM-dd");

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
  // El ancla es el lunes de esta semana y no se mueve: la navegación es scroll, no
  // paginado. `semanas` dice cuántas hay cargadas a cada lado; crecen al llegar al borde.
  const [ancla] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [semanas, setSemanas] = useState({ antes: 1, despues: 1 });
  const [fechaCentrada, setFechaCentrada] = useState(() => iso(ancla));
  // Semana a la que hay que ir apenas termine de cargarse. Va en ref y no en estado: es
  // una intención pendiente, no algo que se pinte, y como estado forzaba un render de más.
  const pendienteScroll = useRef<string | null>(null);
  const contenedor = useRef<HTMLDivElement | null>(null);
  // Al agregar una semana ANTES, el contenido se corre a la derecha: hay que compensar
  // el scroll o la vista salta sola hacia atrás justo mientras el usuario arrastra.
  const anchoPrevio = useRef<number | null>(null);
  const [visibles, setVisibles] = useState<number[] | null>(leerVisiblesGuardadas);
  const [panel, setPanel] = useState<{ otId: number; bloqueKey: string | null } | null>(null);
  const [jornadasDe, setJornadasDe] = useState<string | null>(null);
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

  // Inicio del rango visible y su largo en días. Domingos incluidos: la grilla los
  // colapsa a una canaleta cuando no hay trabajo, pero la columna existe siempre.
  const inicioVisible = useMemo(() => addDays(ancla, -7 * semanas.antes), [ancla, semanas.antes]);
  const diasVisibles = (semanas.antes + 1 + semanas.despues) * 7;

  // Se pide una semana de más a cada lado del rango VISIBLE: una obra que arranca justo
  // antes del borde tiene que llegar entera, o al arrastrarla se moverían solo los días
  // visibles.
  const desde = iso(addDays(inicioVisible, -7));
  const hasta = iso(addDays(inicioVisible, diasVisibles + 6));

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

  // Todas las fechas del rango, domingos incluidos. Quién se colapsa y quién no lo
  // decide la grilla, que es la que sabe si ese domingo tiene trabajo.
  const fechas = useMemo(
    () => Array.from({ length: diasVisibles }, (_, i) => iso(addDays(inicioVisible, i))),
    [inicioVisible, diasVisibles],
  );

  /** Lleva una fecha al borde izquierdo útil, salteando la columna fija de cuadrillas. */
  const scrollAFecha = useCallback((fecha: string, suave = true) => {
    const cont = contenedor.current;
    const nodo = cont?.querySelector<HTMLElement>(`[data-fecha="${fecha}"]`);
    if (!cont || !nodo) return;
    // No se usa scrollIntoView: alinearía la columna contra el borde del contenedor, y
    // ahí la tapa la columna sticky de cuadrillas.
    cont.scrollTo({ left: nodo.offsetLeft - ANCHO_RECURSO, behavior: suave ? "smooth" : "auto" });
  }, []);

  // Compensación al prepender una semana: se corrige antes de pintar, así no se ve saltar.
  useLayoutEffect(() => {
    const cont = contenedor.current;
    if (!cont || anchoPrevio.current === null) return;
    const delta = cont.scrollWidth - anchoPrevio.current;
    anchoPrevio.current = null;
    if (delta > 0) cont.scrollLeft += delta;
  }, [fechas]);

  // El snap puede pedir una semana que todavía no está en el rango: se espera a que entre
  // y recién ahí se scrollea. Corre después del efecto de compensación, que es de layout.
  useEffect(() => {
    const objetivo = pendienteScroll.current;
    if (!objetivo || !fechas.includes(objetivo)) return;
    pendienteScroll.current = null;
    scrollAFecha(objetivo);
  }, [fechas, scrollAFecha]);

  // Arranca mostrando la semana actual, no la anterior que se carga de contexto.
  //
  // No sirve hacerlo al montar: mientras carga hay un skeleton y la grilla —dueña del
  // contenedor de scroll— todavía no existe. Se espera a que aparezca, y se hace UNA vez:
  // después manda el scroll del usuario.
  const yaCentrado = useRef(false);
  useEffect(() => {
    if (yaCentrado.current || !data || !contenedor.current) return;
    yaCentrado.current = true;
    scrollAFecha(iso(ancla), false);
  }, [data, ancla, scrollAFecha]);

  const alScrollear = useCallback(() => {
    const cont = contenedor.current;
    if (!cont) return;

    if (cont.scrollLeft < UMBRAL_BORDE) {
      anchoPrevio.current = cont.scrollWidth;
      setSemanas((s) => ({ ...s, antes: s.antes + 1 }));
    } else if (cont.scrollLeft + cont.clientWidth > cont.scrollWidth - UMBRAL_BORDE) {
      setSemanas((s) => ({ ...s, despues: s.despues + 1 }));
    }

    // Semana centrada en el viewport: es la que nombra el label de arriba. Se mide sobre
    // el DOM y no con aritmética de scroll porque las columnas no son todas del mismo
    // ancho (el domingo colapsado mide 28px).
    const centro = ANCHO_RECURSO + (cont.clientWidth - ANCHO_RECURSO) / 2 + cont.scrollLeft;
    let mejor: string | null = null;
    let mejorDist = Infinity;
    for (const nodo of cont.querySelectorAll<HTMLElement>("[data-fecha]")) {
      const medio = nodo.offsetLeft + nodo.offsetWidth / 2;
      const dist = Math.abs(medio - centro);
      if (dist < mejorDist) {
        mejorDist = dist;
        mejor = nodo.dataset.fecha ?? null;
      }
    }
    if (mejor) setFechaCentrada(mejor);
  }, []);

  /** Flechas: dejan de paginar y hacen snap a la semana anterior / siguiente. */
  function irASemana(delta: number) {
    const objetivo = addDays(startOfWeek(parseISO(fechaCentrada), { weekStartsOn: 1 }), delta * 7);
    const objetivoISO = iso(objetivo);

    // Si ya está cargada se va directo: sin cambio de estado no habría re-render, y el
    // efecto que resuelve los pendientes nunca llegaría a correr.
    if (fechas.includes(objetivoISO)) {
      scrollAFecha(objetivoISO);
      return;
    }

    pendienteScroll.current = objetivoISO;
    if (objetivo < inicioVisible) {
      anchoPrevio.current = contenedor.current?.scrollWidth ?? null;
      setSemanas((s) => ({ ...s, antes: s.antes + 1 }));
    } else {
      setSemanas((s) => ({ ...s, despues: s.despues + 1 }));
    }
  }

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

  // Bandeja: obras a las que les quedan jornadas por planificar. No es "asignada sí o
  // no": una obra de 4 jornadas que se ejecutó 2 y se suspendió vuelve acá con 2
  // pendientes, sin perder el rastro de lo ya hecho.
  const sinAsignar = useMemo<ObraPendiente[]>(() => {
    if (!data) return [];
    const progreso = new Map(data.progreso.map((p) => [p.otId, p]));
    return data.ots
      .filter((o) => ["pendiente", "en_proceso"].includes(o.estado))
      .map((ot) => {
        const avance = progreso.get(ot.id);
        const totales = repartirJornadas(ot.jornadas).length;
        return {
          ot,
          totales,
          pendientes: totales - (avance?.asignadas ?? 0),
          cerradas: avance?.cerradas ?? 0,
        };
      })
      .filter((x) => x.pendientes > 0);
  }, [data]);

  const bloquesPorClave = useMemo(() => {
    const mapa = new Map<string, Bloque>();
    for (const b of agruparBloques(data?.asignaciones ?? [])) mapa.set(b.key, b);
    return mapa;
  }, [data]);

  const hoyISO = format(new Date(), "yyyy-MM-dd");

  // El label ya no nombra un rango fijo: nombra la semana que está centrada en pantalla.
  const lunesCentrado = startOfWeek(parseISO(fechaCentrada), { weekStartsOn: 1 });
  const rangoLabel = `${format(lunesCentrado, "d MMM", { locale: es })} – ${format(addDays(lunesCentrado, 5), "d MMM yyyy", { locale: es })}`;

  // El scroll vive dentro de TableroGrid, así que el listener se engancha a mano. `data`
  // está en las dependencias porque el contenedor no existe hasta que la grilla monta.
  useEffect(() => {
    const cont = contenedor.current;
    if (!cont) return;
    let pendiente = false;
    const handler = () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => {
        pendiente = false;
        alScrollear();
      });
    };
    cont.addEventListener("scroll", handler, { passive: true });
    return () => cont.removeEventListener("scroll", handler);
  }, [alScrollear, data]);

  // ── Escrituras ─────────────────────────────────────────────────────────────

  /** Cuántos bloques hay ya en una celda: define el orden de apilado del nuevo. */
  function proximoOrden(cuadrillaId: number, fecha: string): number {
    const enCelda = (data?.asignaciones ?? []).filter(
      (a) => a.cuadrillaId === cuadrillaId && a.fecha === fecha,
    );
    return enCelda.length === 0 ? 0 : Math.max(...enCelda.map((a) => a.ordenDia)) + 1;
  }

  function asignarObra(
    otId: number,
    cuadrillaId: number,
    fecha: string,
    opts: { permitirDomingo?: boolean } = {},
  ) {
    const ot = otsPorId.get(otId);
    if (!ot) return;

    // Si la obra ya tiene jornadas en el tablero (o ejecutadas y liberadas), se
    // planifican solo las que faltan, no la duración completa otra vez.
    const todas = repartirJornadas(ot.jornadas);
    const pendiente = sinAsignar.find((x) => x.ot.id === otId);
    const cuantas = Math.min(todas.length, pendiente?.pendientes ?? todas.length);
    const fracciones = todas.slice(todas.length - cuantas);
    const dias = fechasDeJornadas(fecha, fracciones.length, opts);
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

  function moverBloque(
    bloque: Bloque,
    cuadrillaId: number,
    fecha: string,
    opts: { permitirDomingo?: boolean } = {},
  ) {
    const dias = fechasDeJornadas(fecha, bloque.ids.length, opts);
    const orden = proximoOrden(cuadrillaId, dias[0]);
    const movimientos: MovimientoAsignacion[] = bloque.ids.map((id, i) => ({
      id,
      fecha: dias[i],
      cuadrillaId,
      ordenDia: orden,
    }));
    mover.mutate(movimientos);
  }

  /**
   * Devolver una obra a la bandeja de sin asignar. Único camino: lo usan por igual el
   * arrastre al panel y la opción del menú de la tarjeta, así que la regla de qué se
   * puede sacar vale para los dos gestos.
   */
  function volverABandeja(bloque: Bloque) {
    const motivo = motivoNoVuelveABandeja(bloque);
    if (motivo) {
      toast.error("No se puede devolver a la bandeja", { description: motivo });
      return;
    }
    // Solo las jornadas sin parte: las cerradas se conservan, o el parte quedaría
    // huérfano y la obra volvería a la bandeja como si nunca se hubiera empezado.
    const liberables = jornadasLiberables(bloque);
    borrar.mutate(liberables, {
      onSuccess: () => {
        const conservadas = bloque.ids.length - liberables.length;
        if (conservadas > 0) {
          toast.success(
            `Obra suspendida: ${liberables.length} jornada(s) vuelven a sin asignar`,
            { description: `Se conservan ${conservadas} ya cerrada(s) con su parte.` },
          );
        }
      },
    });
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
      // Soltar sobre una columna de domingo activa SÍ planifica en domingo: es un gesto
      // explícito. La canaleta del domingo sin trabajo no acepta drop, así que el único
      // modo de llegar acá es apuntando a un domingo que ya se trabaja.
      asignarObra(otId, celda.cuadrillaId, celda.fecha, { permitirDomingo: celda.esDomingo });
      return;
    }

    if (!activo.startsWith("bloque:")) return;
    const bloque = bloquesPorClave.get(activo.slice(7));
    if (!bloque) return;

    // Fuera de la grilla: la obra vuelve a la bandeja de sin asignar.
    if (destino === ID_BANDEJA) {
      volverABandeja(bloque);
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
    moverBloque(bloque, celda.cuadrillaId, celda.fecha, { permitirDomingo: celda.esDomingo });
  }

  function celdaDe(
    id: string,
    datos: unknown,
  ): { cuadrillaId: number; fecha: string; esDomingo: boolean } | null {
    if (!id.startsWith("celda:")) return null;
    const d = datos as { cuadrillaId?: number; fecha?: string; esDomingo?: boolean } | undefined;
    if (typeof d?.cuadrillaId === "number" && typeof d.fecha === "string") {
      return { cuadrillaId: d.cuadrillaId, fecha: d.fecha, esDomingo: d.esDomingo === true };
    }
    const [, cuadrilla, fecha] = id.split(":");
    return { cuadrillaId: Number(cuadrilla), fecha, esDomingo: parseISO(fecha).getDay() === 0 };
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
        onPrev={() => irASemana(-1)}
        onNext={() => irASemana(1)}
        onHoy={() => scrollAFecha(iso(startOfWeek(new Date(), { weekStartsOn: 1 })))}
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
              contenedorRef={contenedor}
              cuadrillas={cuadrillasVisibles}
              fechas={fechas}
              asignaciones={data.asignaciones}
              ots={otsPorId}
              partes={data.partes}
              bloqueSeleccionado={panel?.bloqueKey ?? null}
              hoy={hoyISO}
              onCerrarJornada={(b, accion: NonNullable<AccionCierre>) => {
                // El panel de la OT y el modal de cierre no conviven: superpuestos se
                // tapan entre sí y las dos capas de fondo dejan todo ilegible.
                setPanel(null);
                setCierre({
                  bloqueKey: b.key,
                  asignacionId: accion.asignacionId,
                  fecha: accion.fecha,
                  parteId: accion.tipo === "ver" ? accion.parteId : null,
                });
              }}
              // Con el modal de cierre abierto no se abre ningun panel. El clic que
              // cierra el menu ⋮ llega a la tarjeta DESPUES de que el menu se
              // desmontó, asi que una guarda por "menu abierto" llega tarde.
              onAbrirBloque={(b) => {
                if (cierre) return;
                setPanel({ otId: b.otId, bloqueKey: b.key });
              }}
              onFraccion={(b, f: FraccionStr) => actualizar.mutate({ ids: b.ids, cambio: { fraccion: f } })}
              onEditarJornadas={(b) => setJornadasDe(b.key)}
              onEstado={(b, estado) => actualizar.mutate({ ids: b.ids, cambio: { estado } })}
              onQuitar={volverABandeja}
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
            onDetalle={(ot) => {
              if (cierre) return;
              setPanel({ otId: ot.id, bloqueKey: null });
            }}
          />
        </div>

        <DragOverlay>
          {arrastrando?.tipo === "bloque" && (
            <div className="w-[150px]">
              <ContenidoTarjeta
                ot={otsPorId.get(arrastrando.bloque.otId)}
                bloque={arrastrando.bloque}
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

      <DialogoJornadas
        abierto={!!jornadasDe}
        bloque={jornadasDe ? (bloquesPorClave.get(jornadasDe) ?? null) : null}
        ot={jornadasDe ? otsPorId.get(bloquesPorClave.get(jornadasDe)?.otId ?? 0) : undefined}
        guardando={actualizar.isPending}
        onGuardar={(cambios) => {
          const bloque = jornadasDe ? bloquesPorClave.get(jornadasDe) : null;
          if (!bloque) return;

          // Cada día puede quedar con una fracción distinta, así que se agrupan los que
          // comparten valor para no hacer una escritura por jornada.
          const porFraccion = new Map<string, number[]>();
          for (const c of cambios.fracciones) {
            porFraccion.set(c.fraccion, [...(porFraccion.get(c.fraccion) ?? []), c.asignacionId]);
          }
          for (const [fraccion, ids] of porFraccion) {
            actualizar.mutate({ ids, cambio: { fraccion: fraccion as FraccionStr } });
          }

          if (cambios.nuevas.length > 0) {
            crear.mutate(
              cambios.nuevas.map((n) => ({
                otId: bloque.otId,
                fecha: n.fecha,
                cuadrillaId: bloque.cuadrillaId,
                fraccion: n.fraccion,
                estado: bloque.estado,
                ordenDia: bloque.ordenDia,
              })),
            );
          }
          if (cambios.borradas.length > 0) borrar.mutate(cambios.borradas);

          setJornadasDe(null);
        }}
        onOpenChange={(abierto) => !abierto && setJornadasDe(null)}
      />

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
