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
import { useRouter } from "next/navigation";
import { addDays, format, parseISO, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TopbarTablero } from "./topbar-tablero";
import { TableroGrid, DIAS_VENTANA } from "./tablero-grid";
import { PanelSinAsignar, ID_BANDEJA } from "./panel-sin-asignar";
import { ContenidoTarjeta } from "./tarjeta-asignacion";
import { PanelOt } from "./panel-ot";
import { CajonPlanificacion } from "./cajon-planificacion";
import { FormularioCierre } from "./formulario-cierre";
import { DialogoJornadas } from "./dialogo-jornadas";
import { DialogoTarea, type ValoresTarea } from "./dialogo-tarea";
import { DialogoCandado, type PedidoConfirmacion } from "./dialogo-candado";
import { useCandado } from "@/hooks/use-habilitaciones";
import { useNotasJornada } from "@/hooks/use-notas-jornada";
import { useClima } from "@/hooks/use-clima";
import {
  useTablero,
  useFeriados,
  useCrearAsignaciones,
  useActualizarAsignaciones,
  useMoverAsignaciones,
  useBorrarAsignaciones,
  useCrearTarea,
  useActualizarTareas,
  useMoverTareas,
  useBorrarTareas,
} from "@/hooks/use-tablero";
import { agruparBloques, fechasDeJornadas, type Bloque } from "@/lib/tablero/bloques";
import { jornadasLiberables, motivoNoVuelveABandeja, type AccionCierre } from "@/lib/tablero/cierre";
import { toast } from "sonner";
import { aFraccionStr, repartirJornadas, type FraccionStr } from "@/lib/tablero/fracciones";
import { friccionDePiso, piso, violaPiso } from "@/lib/tablero/fecha-desde";
import { type TipoTarea } from "@/lib/tablero/tipos";
import type { ObraPendiente, ObraPlanificada } from "./panel-sin-asignar";
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
const CLAVE_DOMINGOS = "tablero:domingos-abiertos";

/** Ancho de la columna fija de cuadrillas: hay que descontarlo al hacer snap de semana. */
const ANCHO_RECURSO = 168;
/** A cuántos px del borde del scroll se carga otra semana. */
const UMBRAL_BORDE = 240;
/**
 * Tope de semanas a cada lado. Cada ampliación reconsulta el rango entero a Odoo, así
 * que sin techo un scroll largo termina pidiendo medio año por request.
 */
const MAX_SEMANAS = 8;

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * Domingos habilitados a mano. Se guardan porque planificar un domingo lleva varios pasos
 * —abrirlo, arrastrar, cerrar la jornada— y un refresco en el medio no tiene que plegarlo.
 * Se descartan los anteriores a hoy: trabajar un domingo es excepcional, y sin poda la
 * lista crecería para siempre con fechas que ya no se miran.
 */
function leerDomingosGuardados(hoyISO: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const crudo = window.localStorage.getItem(CLAVE_DOMINGOS);
    const fechas = crudo ? (JSON.parse(crudo) as unknown) : null;
    if (!Array.isArray(fechas)) return [];
    return fechas.filter((f): f is string => typeof f === "string" && f >= hoyISO);
  } catch {
    return [];
  }
}

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
 * Filas por defecto: TODAS las cuadrillas activas.
 *
 * Antes se mostraban sólo las que tenían carga o figuraban como cuadrilla prevista. Eso
 * dejaba medio viewport vacío y —peor— escondía justo las cuadrillas SIN carga, que son
 * las que hay que mirar cuando otra está sobreasignada. El filtro sigue estando para
 * quien quiera achicar la vista; lo que cambia es de dónde parte.
 */
function visiblesPorDefecto(data: TableroPayload): number[] {
  return data.cuadrillas.map((c) => c.id);
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
  // EL ANCLA ES HOY, no el lunes de esta semana: se planifica desde hoy hacia adelante.
  // Un miércoles a la mañana, el lunes pasado ya no es una decisión — ocupaba dos
  // columnas de pantalla para mostrar trabajo que ya pasó. La ventana va de hoy hasta el
  // mismo día de la semana que viene inclusive (ver DIAS_VENTANA en tablero-grid).
  //
  // No se mueve: la navegación es scroll, no paginado. `semanas` dice cuántas hay
  // cargadas a cada lado; crecen al llegar al borde.
  const router = useRouter();
  const [ancla] = useState(() => startOfDay(new Date()));
  const [semanas, setSemanas] = useState({ antes: 1, despues: 1 });
  // Primer día visible del viewport. Antes se guardaba el día CENTRADO y de ahí se
  // deducía la semana; con la ventana anclada en hoy el borde izquierdo es lo que
  // define qué se está mirando, y de él salen el rótulo y el período de capacidad.
  const [fechaVisible, setFechaVisible] = useState(() => iso(ancla));
  // Semana a la que hay que ir apenas termine de cargarse. Va en ref y no en estado: es
  // una intención pendiente, no algo que se pinte, y como estado forzaba un render de más.
  const pendienteScroll = useRef<string | null>(null);
  const contenedor = useRef<HTMLDivElement | null>(null);
  // Al agregar una semana ANTES, el contenido se corre a la derecha: hay que compensar
  // el scroll o la vista salta sola hacia atrás justo mientras el usuario arrastra.
  const anchoPrevio = useRef<number | null>(null);
  // Cerrojo: mientras una ampliación está en vuelo no se pide otra. Sin esto, seguir
  // scrolleando dispara varias seguidas y la compensación se calcula contra un ancho ya
  // viejo, que es exactamente lo que se ve como saltos.
  const expansionPendiente = useRef(false);
  const [visibles, setVisibles] = useState<number[] | null>(leerVisiblesGuardadas);
  const [panel, setPanel] = useState<{ otId: number; bloqueKey: string | null } | null>(null);
  // Alta de una tarjeta de operaciones: guarda la celda donde se hizo doble clic, que es
  // la que le da cuadrilla y día. Y la tarjeta que se está editando, si es una edición.
  const [tareaNueva, setTareaNueva] = useState<{ cuadrillaId: number; fecha: string } | null>(null);
  const [tareaEnEdicion, setTareaEnEdicion] = useState<Bloque | null>(null);
  // Resaltado sin abrir el panel lateral: al saltar desde el buscador lo que se quiere es
  // VER dónde cayó la obra, y el panel de la OT taparía justamente eso.
  const [resaltado, setResaltado] = useState<string | null>(null);
  // El editor de jornadas es de la OBRA, no de la tarjeta: si la obra quedó partida en
  // varios tramos hay que poder verlos y arreglarlos juntos. Por eso guarda el otId.
  const [jornadasDe, setJornadasDe] = useState<number | null>(null);
  const [cierre, setCierre] = useState<{
    bloqueKey: string;
    asignacionId: number;
    fecha: string;
    parteId: number | null;
  } | null>(null);
  const [panelColapsado, setPanelColapsado] = useState<boolean>(
    () => typeof window !== "undefined" && window.localStorage.getItem(CLAVE_PANEL) === "true",
  );
  const [domingosAbiertos, setDomingosAbiertos] = useState<Set<string>>(
    () => new Set(leerDomingosGuardados(format(new Date(), "yyyy-MM-dd"))),
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
  // Los feriados son marca visual y nada más: no cambian la capacidad de la cuadrilla ni
  // el reparto de una obra de varias jornadas (ver src/lib/feriados/argentina.ts).
  const { data: feriadosData } = useFeriados(desde, hasta);
  const feriados = useMemo(
    () => new Map((feriadosData?.feriados ?? []).map((f) => [f.fecha, f.nombre])),
    [feriadosData],
  );
  // Notas de la jornada. Consulta aparte de la del tablero y no un campo más del
  // payload: van a Supabase, no a Odoo, y escribir una nota no tiene por qué reconsultar
  // las asignaciones del rango entero (ni al revés).
  const { data: notas } = useNotasJornada(desde, hasta);
  const crear = useCrearAsignaciones();
  const actualizar = useActualizarAsignaciones();
  const mover = useMoverAsignaciones();
  const borrar = useBorrarAsignaciones();
  // Las tareas escriben en Supabase y las obras en Odoo, pero se sienten igual: el
  // board elige el par según `bloque.origen` y nada más arriba se entera.
  const crearTarea = useCrearTarea();
  const actualizarTarea = useActualizarTareas();
  const moverTarea = useMoverTareas();
  const borrarTarea = useBorrarTareas();
  const guardando =
    crear.isPending ||
    actualizar.isPending ||
    mover.isPending ||
    borrar.isPending ||
    crearTarea.isPending ||
    actualizarTarea.isPending ||
    moverTarea.isPending ||
    borrarTarea.isPending;

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

  function alternarDomingo(fecha: string) {
    setDomingosAbiertos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(fecha)) siguiente.delete(fecha);
      else siguiente.add(fecha);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(CLAVE_DOMINGOS, JSON.stringify([...siguiente]));
      }
      return siguiente;
    });
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

  // La grilla también necesita el nodo (mide su ancho para encajar la ventana), así que
  // se lo pasa por callback y cada uno se lo guarda donde le sirve.
  const asignarContenedor = useCallback((nodo: HTMLDivElement | null) => {
    contenedor.current = nodo;
  }, []);

  /**
   * El auto-scroll de dnd-kit queda apagado ENTERO mientras se arrastra.
   *
   * Arrastrar una tarjeta hacia la bandeja de la derecha pasa siempre por el borde
   * derecho, y ahí el auto-scroll leía "quiere ver el día siguiente" y corría la vista
   * sola justo mientras el usuario apuntaba al panel.
   *
   * Un primer intento lo apagó sólo para el contenedor de la grilla (`canScroll`), y no
   * alcanzó: dnd-kit recorre TODOS los ancestros con scroll de la tarjeta, así que al
   * saltear la grilla seguía de largo y scrolleaba el siguiente —el `<main>` del
   * dashboard, que es overflow-auto, y arriba de él el documento—. Por eso la vista se
   * movía incluso con el puntero fuera del tablero.
   *
   * Apagado del todo, moverse queda en manos del usuario: la barra de scroll o el
   * arrastre del encabezado de días.
   */
  const autoScroll = useMemo(() => ({ enabled: false }), []);

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
    expansionPendiente.current = false;
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

    if (!expansionPendiente.current) {
      const enBordeIzq = cont.scrollLeft < UMBRAL_BORDE;
      const enBordeDer = cont.scrollLeft + cont.clientWidth > cont.scrollWidth - UMBRAL_BORDE;
      if (enBordeIzq && semanas.antes < MAX_SEMANAS) {
        expansionPendiente.current = true;
        anchoPrevio.current = cont.scrollWidth;
        setSemanas((s) => ({ ...s, antes: s.antes + 1 }));
      } else if (enBordeDer && semanas.despues < MAX_SEMANAS) {
        expansionPendiente.current = true;
        setSemanas((s) => ({ ...s, despues: s.despues + 1 }));
      }
    }

    // Primer día visible: es el que nombra el rótulo de arriba y abre el período contra
    // el que se mide la carga de cada fila. Se mide sobre el DOM y no con aritmética de
    // scroll porque las columnas no son todas del mismo ancho (el domingo colapsado mide
    // 28px). Se toma la primera cuyo borde derecho ya entró en el viewport útil: la que
    // está apenas tapada por la columna sticky de cuadrillas no cuenta como visible.
    const izquierda = cont.scrollLeft + ANCHO_RECURSO;
    let primera: string | null = null;
    for (const nodo of cont.querySelectorAll<HTMLElement>("[data-fecha]")) {
      if (nodo.offsetLeft + nodo.offsetWidth > izquierda + 1) {
        primera = nodo.dataset.fecha ?? null;
        break;
      }
    }
    if (primera) setFechaVisible(primera);
    // `semanas` entra en las dependencias porque el tope de ampliación se evalúa acá; el
    // efecto que engancha el listener se vuelve a correr y reengancha la versión fresca.
  }, [semanas]);

  /**
   * Flechas: corren la ventana siete días para atrás o para adelante.
   *
   * Antes hacían snap al lunes de la semana centrada. Con la ventana anclada en hoy eso
   * daba saltos raros —desde un miércoles, "siguiente" caía en lunes y movía cinco días,
   * no siete—. Ahora se desplaza desde el primer día visible, así el paso es siempre el
   * mismo y la ventana conserva su día de arranque.
   */
  function irASemana(delta: number) {
    const objetivo = addDays(parseISO(fechaVisible), delta * 7);
    const objetivoISO = iso(objetivo);

    // Si ya está cargada se va directo: sin cambio de estado no habría re-render, y el
    // efecto que resuelve los pendientes nunca llegaría a correr.
    if (fechas.includes(objetivoISO)) {
      scrollAFecha(objetivoISO);
      return;
    }

    // En el tope no se amplía. Se sale sin tocar el cerrojo: si se marcara "ampliación en
    // vuelo" sin que `fechas` cambie, el efecto de layout no correría nunca y quedaría
    // trabado, bloqueando todas las ampliaciones siguientes.
    const haciaAtras = objetivo < inicioVisible;
    if ((haciaAtras ? semanas.antes : semanas.despues) >= MAX_SEMANAS) return;

    pendienteScroll.current = objetivoISO;
    expansionPendiente.current = true;
    if (haciaAtras) {
      anchoPrevio.current = contenedor.current?.scrollWidth ?? null;
      setSemanas((s) => ({ ...s, antes: s.antes + 1 }));
    } else {
      setSemanas((s) => ({ ...s, despues: s.despues + 1 }));
    }
  }

  const otsPorId = useMemo(() => new Map((data?.ots ?? []).map((o) => [o.id, o])), [data]);

  // ── Candado de habilitación ───────────────────────────────────────────────
  //
  // Sólo mira el PERMISO, que vive entero en sale.order (Odoo): el tablero nunca
  // necesita a Supabase para decidir si una jornada se puede confirmar. La
  // documentación no bloquea — sigue siendo advertencia, como hoy.
  const otIdsEnTablero = useMemo(
    () => [...new Set((data?.asignaciones ?? []).map((a) => a.otId))],
    [data],
  );
  const { data: candados } = useCandado(otIdsEnTablero);
  const [pedidoCandado, setPedidoCandado] = useState<PedidoConfirmacion | null>(null);

  /** Las OTs que llevan candado visible en la tarjeta. Se arrastran igual. */
  const otsBloqueadas = useMemo(() => {
    const set = new Set<number>();
    for (const [otId, f] of candados ?? []) {
      if (f.friccion?.tipo === "bloqueo") set.add(otId);
    }
    return set;
  }, [candados]);

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

  // Todas las jornadas de la obra que se está editando, sin importar en qué tarjeta o
  // cuadrilla caen: es lo que hace que una obra partida se pueda arreglar de un lado solo.
  const jornadasDeLaObra = useMemo(
    () =>
      jornadasDe == null ? [] : (data?.asignaciones ?? []).filter((a) => a.otId === jornadasDe),
    [data, jornadasDe],
  );

  // Cuántos días y cuántos tramos separados tiene planificada cada obra. La tarjeta lo usa
  // para avisar que lo que se ve es una parte: sin eso, una obra partida se lee como una
  // obra de un día y el resto del plan queda invisible.
  const planPorObra = useMemo(() => {
    const mapa = new Map<number, { dias: number; tramos: number }>();
    for (const b of bloquesPorClave.values()) {
      const actual = mapa.get(b.otId) ?? { dias: 0, tramos: 0 };
      mapa.set(b.otId, { dias: actual.dias + b.fechas.length, tramos: actual.tramos + 1 });
    }
    return mapa;
  }, [bloquesPorClave]);

  // Obras ya en la grilla, para que el buscador conteste "¿esta obra ya la planifiqué?".
  //
  // LIMITACIÓN: sólo alcanza el rango cargado. El tablero pide las asignaciones por fecha,
  // así que una obra planificada para dentro de dos meses no está en memoria y no hay cómo
  // encontrarla sin preguntarle a Odoo. El panel lo dice en vez de afirmar que no existe.
  const planificadas = useMemo<ObraPlanificada[]>(() => {
    const nombres = new Map((data?.cuadrillas ?? []).map((c) => [c.id, c.nombre]));
    return [...bloquesPorClave.values()].flatMap((b) => {
      const ot = otsPorId.get(b.otId);
      if (!ot) return [];
      return [{
        bloqueKey: b.key,
        ot,
        cuadrillaNombre: b.cuadrillaId != null ? (nombres.get(b.cuadrillaId) ?? null) : null,
        fechaInicio: b.fechas[0],
        jornadas: b.fechas.length,
      }];
    });
  }, [bloquesPorClave, otsPorId, data]);

  const hoyISO = format(new Date(), "yyyy-MM-dd");

  // Lluvia y viento del encabezado. Igual que los feriados: marca visual y nada más, no
  // cambia capacidad ni reparto. Se pide desde HOY y no desde el rango visible porque el
  // pronóstico son nueve días desde hoy y no se mueve al scrollear (ver use-clima.ts): el
  // resto de las columnas se queda sin chip, y eso NO quiere decir que vaya a estar lindo.
  const { data: clima } = useClima(hoyISO);

  // El rótulo nombra la ventana que se está viendo, que ya no es una semana de
  // calendario: arranca en el primer día visible y llega hasta el mismo día de la
  // semana siguiente.
  const inicioVentana = parseISO(fechaVisible);
  const rangoLabel = `${format(inicioVentana, "d MMM", { locale: es })} – ${format(addDays(inicioVentana, DIAS_VENTANA - 1), "d MMM yyyy", { locale: es })}`;

  // Los siete días que abren en el primer día visible. Es el PERÍODO contra el que se
  // mide la carga de cada fila, y tiene que seguir a lo que se ve: si el período fuera
  // una semana de calendario mientras la vista arranca un miércoles, el "10,75 / 6" del
  // encabezado estaría hablando de días que no están en pantalla.
  //
  // Al pasar de 6 días fijos a un rango de varias semanas, el total de la fila se había
  // quedado sin período: dividía por el rango entero cargado, así que una cuadrilla
  // sobreasignada cuatro días seguidos figuraba al 26% de ocupación y la señal
  // desaparecía del encabezado. Y empeoraba al scrollear, porque el rango crece.
  const semanaCentrada = useMemo(
    () => Array.from({ length: 7 }, (_, i) => iso(addDays(parseISO(fechaVisible), i))),
    [fechaVisible],
  );

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

  /**
   * Una obra recién soltada se pinta al instante con ids TEMPORALES (negativos) y recién
   * ~1s después, cuando Odoo contesta, se cambian por los reales. En esa ventana la
   * tarjeta ya se ve y se puede agarrar, pero cualquier escritura viajaría con un id que
   * Odoo no conoce y vuelve rebotada.
   *
   * La tarjeta no se deja arrastrar mientras tanto (ver TarjetaAsignacion), pero el
   * reordenamiento de una celda mueve a TODAS las obras del día, así que la que está
   * guardándose puede entrar por arrastrar a una vecina. Por eso el freno también está acá.
   */
  const sinGuardar = (b: Bloque) => b.ids.some((id) => id < 0);

  function avisarGuardando() {
    toast.info("La obra se está guardando", {
      description: "Todavía no tiene su número en Odoo. Probá de nuevo en un segundo.",
    });
  }

  /**
   * Avisa —y NO frena— cuando la obra queda antes del piso acordado con el cliente.
   *
   * POR QUÉ NO BLOQUEA: planificar es un borrador. Poner tentativamente una obra el 8
   * sabiendo que arranca el 12, para ver cómo queda la semana, es una forma legítima de
   * armarlo. Es el mismo criterio que ya rige el candado de habilitación (ver
   * DialogoCandado): la fricción va al CONFIRMAR, que es cuando la fecha se le promete al
   * cliente y la cuadrilla queda tomada. Un candado que estorba se rompe.
   *
   * Lo que sí hace es que no pase inadvertido: hoy este dato no existe en ningún lado y
   * Planificación se entera cuando la cuadrilla llega y no la reciben.
   */
  function avisarPiso(otId: number, fecha: string) {
    const ot = otsPorId.get(otId);
    if (!ot || !violaPiso(ot, fecha)) return;
    toast.warning(`Esta obra no entra antes del ${piso(ot)}`, {
      description: `La dejaste el ${format(parseISO(fecha), "d MMM", { locale: es })}. Se puede planificar igual, pero al confirmar te va a pedir el motivo.`,
    });
  }

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
    avisarPiso(otId, dias[0]);

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
    if (sinGuardar(bloque)) return avisarGuardando();
    const dias = fechasDeJornadas(fecha, bloque.ids.length, opts);
    const orden = proximoOrden(cuadrillaId, dias[0]);
    // Una tarea no sale de una OT y no tiene piso: otId es 0 y avisarPiso no encuentra
    // nada, pero se filtra acá para que la intención quede escrita.
    if (bloque.origen !== "tarea") avisarPiso(bloque.otId, dias[0]);
    const movimientos: MovimientoAsignacion[] = bloque.ids.map((id, i) => ({
      id,
      fecha: dias[i],
      cuadrillaId,
      ordenDia: orden,
    }));
    // Un bloque es homogéneo, así que alcanza con mirar su origen una vez: los días de
    // una tarea viajan a Supabase y los de una obra a Odoo.
    if (bloque.origen === "tarea") moverTarea.mutate(movimientos);
    else mover.mutate(movimientos);
  }

  /**
   * Devolver una obra a la bandeja de sin asignar. Único camino: lo usan por igual el
   * arrastre al panel y la opción del menú de la tarjeta, así que la regla de qué se
   * puede sacar vale para los dos gestos.
   */
  function volverABandeja(bloque: Bloque) {
    if (sinGuardar(bloque)) return avisarGuardando();

    // UNA TAREA NO VUELVE A NINGUNA BANDEJA: no salió de un pedido que quede pendiente,
    // así que quitarla es borrarla. Se ofrece deshacer por el mismo motivo que en una
    // obra —el gesto es barato y el error, silencioso— pero sin nada del cálculo de
    // jornadas liberables ni de progreso, que son de una OT.
    if (bloque.origen === "tarea" && bloque.tarea) {
      const t = bloque.tarea;
      const restaurar = {
        titulo: t.titulo,
        tipo: t.tipo as TipoTarea,
        notas: bloque.notas ?? "",
        cuadrillaId: bloque.cuadrillaId,
        fecha: bloque.fechas[0],
        fraccion: aFraccionStr(bloque.fraccionesPorDia?.[0] ?? bloque.fraccion),
        dias: bloque.fechas.length,
      };
      borrarTarea.mutate(bloque.ids, {
        onSuccess: () => {
          toast.success(`Tarea borrada: ${t.titulo}`, {
            action: { label: "Deshacer", onClick: () => crearTarea.mutate(restaurar) },
          });
        },
      });
      return;
    }

    const motivo = motivoNoVuelveABandeja(bloque);
    if (motivo) {
      toast.error("No se puede devolver a la bandeja", { description: motivo });
      return;
    }
    // Solo las jornadas sin parte: las cerradas se conservan, o el parte quedaría
    // huérfano y la obra volvería a la bandeja como si nunca se hubiera empezado.
    const liberables = jornadasLiberables(bloque);

    // Se fotografía lo que se va a borrar ANTES de borrarlo, para poder deshacer. No se
    // pierde ningún dato duro —los partes ni se tocan— pero sí el trabajo de planificar:
    // las fechas, la fracción de cada día, la cuadrilla y el orden. En una obra de veinte
    // jornadas eso es media tarde.
    //
    // Deshacer y no "¿estás seguro?": un confirm grava todos los usos, incluido el caso
    // barato de una obra tentativa de un día, y a la semana se clickea sin leer — queda la
    // fricción y el error igual. El undo no cuesta nada en el camino de ida. Cubre los dos
    // gestos, porque el arrastre al panel pasa por acá igual que la opción del menú.
    const restaurar: NuevaAsignacion[] = bloque.ids.flatMap((_, i) =>
      bloque.partes[i] != null
        ? []
        : [{
            otId: bloque.otId,
            fecha: bloque.fechas[i],
            cuadrillaId: bloque.cuadrillaId,
            fraccion: aFraccionStr(bloque.fraccionesPorDia?.[i] ?? bloque.fraccion),
            estado: bloque.estado,
            ordenDia: bloque.ordenDia,
            notas: bloque.notas,
          }],
    );

    // ¿La obra va a REAPARECER en la bandeja? La bandeja no mira si la obra tiene tarjetas:
    // resta las jornadas tomadas contra la duración estimada de la OT. Si a la obra le
    // quedan otros tramos planificados —el caso de la obra partida— sacar éste no la
    // devuelve a ningún lado, y decir que "vuelve a la bandeja" mandaba a buscarla a un
    // panel donde no estaba. Se avisa dónde quedó.
    const asignadasAhora =
      data?.progreso.find((p) => p.otId === bloque.otId)?.asignadas ?? bloque.ids.length;
    const quedanEnTablero = asignadasAhora - liberables.length;
    const totales = repartirJornadas(otsPorId.get(bloque.otId)?.jornadas ?? 1).length;
    const vuelveALaBandeja = totales - quedanEnTablero > 0;

    borrar.mutate(liberables, {
      onSuccess: () => {
        // El aviso sale SIEMPRE, no sólo cuando quedan jornadas cerradas. Un arrastre
        // borra varios registros en Odoo, y que la tarjeta desaparezca sin decir nada
        // deja la duda de si el gesto salió o si se perdió algo.
        const n = liberables.length;
        const conservadas = bloque.ids.length - n;
        const titulo = vuelveALaBandeja
          ? `Obra suspendida: ${n} jornada${n === 1 ? "" : "s"} vuelven a la bandeja`
          : `Se quitaron ${n} jornada${n === 1 ? "" : "s"} del tablero`;
        toast.success(titulo, {
          description: !vuelveALaBandeja
            ? `La obra NO vuelve a la bandeja: le quedan ${quedanEnTablero} jornada${quedanEnTablero === 1 ? "" : "s"} planificada${quedanEnTablero === 1 ? "" : "s"} en otras fechas. Editalas desde el menú de esa tarjeta, en "Jornadas de la obra".`
            : conservadas > 0
              ? `Se conservan ${conservadas} ya cerrada${conservadas === 1 ? "" : "s"} con su parte.`
              : "Quedan como pendientes de planificar en el panel de la derecha.",
          // Más que el default —hay que leer el aviso y recién ahí decidir si fue un
          // error— pero no diez segundos: quitar una obra suele venir seguido de mover
          // otras, y el cartel se quedaba tapando la esquina del tablero durante los dos
          // arrastres siguientes. Seis alcanzan para leerlo y decidir.
          duration: 6000,
          // Y si ya lo leyó, que pueda sacarlo: sin la X hay que esperarlo sí o sí.
          closeButton: true,
          action: {
            label: "Deshacer",
            onClick: () => {
              crear.mutate(restaurar, {
                onSuccess: () =>
                  toast.success(
                    `Obra restaurada: ${restaurar.length} jornada${restaurar.length === 1 ? "" : "s"} vuelven al tablero`,
                  ),
              });
            },
          },
        });
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
    // El reordenamiento reescribe el orden de TODAS las obras del día: si una recién se
    // soltó, el lote entero rebota. Se espera a que termine de guardarse.
    if (enCelda.some(sinGuardar)) return avisarGuardando();

    const reordenados = enCelda.slice();
    const [movido] = reordenados.splice(desdeIdx, 1);
    reordenados.splice(hastaIdx, 0, movido);

    // Acá SÍ se mezclan: en una celda pueden convivir obras y tareas, y reordenar el día
    // las toca a todas. Se separa por origen porque cada lote va a una base distinta.
    const movs = (soloTareas: boolean): MovimientoAsignacion[] =>
      reordenados
        .filter((b) => (b.origen === "tarea") === soloTareas)
        .flatMap((b) =>
          b.ids.map((id, i) => ({
            id,
            fecha: b.fechas[i],
            // El orden es el del día completo, no el del sublote: si se numerara dentro
            // de cada origen, una obra y una tarea compartirían el 0 y el apilado
            // quedaría a merced del desempate por id.
            ordenDia: reordenados.indexOf(b),
          })),
        );
    const deObras = movs(false);
    const deTareas = movs(true);
    if (deObras.length > 0) mover.mutate(deObras);
    if (deTareas.length > 0) moverTarea.mutate(deTareas);
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
    // min-w-0: el tablero es ancho por naturaleza y ya scrollea adentro. Sin esto puede
    // empujar el ancho de la pagina y aparece un segundo scroll horizontal, el de afuera,
    // que mueve la pantalla entera unos pocos pixeles en vez de mover la grilla.
    <div className="flex h-[calc(100vh-8rem)] min-w-0 flex-col">
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
        onHoy={() => scrollAFecha(hoyISO)}
        onRefrescar={() => refetch()}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={detectarColision}
        autoScroll={autoScroll}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setArrastrando(null)}
      >
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border">
          {/* Grilla y cajón comparten COLUMNA, y la bandeja queda afuera. Antes el cajón
              era hermano de toda la fila y al abrirlo le comía 240px también a la
              bandeja — que es una lista vertical de 36 obras que se scrollea, o sea lo
              que menos conviene achicar. El cajón habla de la grilla; que le saque alto
              sólo a ella. */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {cuadrillasVisibles.length > 0 ? (
              <TableroGrid
                contenedorRef={asignarContenedor}
                cuadrillas={cuadrillasVisibles}
                fechas={fechas}
                feriados={feriados}
                clima={clima}
                semanaCentrada={semanaCentrada}
                asignaciones={data.asignaciones}
                ots={otsPorId}
                planPorObra={planPorObra}
                partes={data.partes}
                notas={notas ?? []}
                bloqueSeleccionado={panel?.bloqueKey ?? resaltado}
                hoy={hoyISO}
                domingosAbiertos={domingosAbiertos}
                onToggleDomingo={alternarDomingo}
                // El parte NO se carga desde el tablero: se navega al listado.
                //
                // Son dos personas y dos momentos —quien carga lo hace a la mañana con los
                // WhatsApp del día anterior, el planificador mira el tablero para
                // planificar— y el formulario del parte es el que alimenta el costo de mano
                // de obra. Con dos lugares para cargarlo, terminan divergiendo.
                onCerrarJornada={(b, accion: NonNullable<AccionCierre>) => {
                  setPanel(null);
                  // CREAR un parte se hace sólo en el listado. VER o corregir uno ya
                  // cargado sigue abriendo el formulario acá: el listado todavía no edita,
                  // y mandar a una pantalla que no puede hacer el trabajo es peor que
                  // abrir el formulario que sí puede.
                  if (accion.tipo === "cerrar") {
                    router.push(`/partes?fecha=${accion.fecha}&ot=${b.otId}`);
                    return;
                  }
                  setCierre({
                    bloqueKey: b.key,
                    asignacionId: accion.asignacionId,
                    fecha: accion.fecha,
                    parteId: accion.parteId,
                  });
                }}
                // Con el modal de cierre abierto no se abre ningun panel. El clic que
                // cierra el menu ⋮ llega a la tarjeta DESPUES de que el menu se
                // desmontó, asi que una guarda por "menu abierto" llega tarde.
                onAbrirBloque={(b) => {
                  if (cierre) return;
                  // Una tarea no tiene ficha en Odoo que mostrar: el clic abre su propio
                  // diálogo, que es el único lugar donde vive.
                  if (b.origen === "tarea") return setTareaEnEdicion(b);
                  setPanel({ otId: b.otId, bloqueKey: b.key });
                }}
                onFraccion={(b, f: FraccionStr) =>
                  b.origen === "tarea"
                    ? actualizarTarea.mutate({ ids: b.ids, cambio: { fraccion: f } })
                    : actualizar.mutate({ ids: b.ids, cambio: { fraccion: f } })
                }
                onEditarJornadas={(b) => setJornadasDe(b.otId)}
                // Volver a tentativa nunca pregunta nada: aflojar el compromiso no
                // necesita permiso de nadie.
                onEstado={(b, estado) => {
                  const aplicar = () =>
                    actualizar.mutate({
                      ids: b.ids,
                      cambio: { estado },
                      // De qué obra y de qué días son estos ids. Viaja desde acá porque el
                      // bloque ya lo sabe: sin esto el servidor tendría que releer Odoo
                      // para poder anotar quién confirmó, y le sumaría ~800 ms al gesto.
                      // Las tareas de operaciones no tienen OT (otId 0) y no se registran:
                      // no son un compromiso con un cliente.
                      contexto:
                        b.otId > 0 ? { otId: b.otId, fechas: b.fechas } : undefined,
                    });
                  if (estado !== "confirmada") return aplicar();

                  // EL PERMISO NO FRENA AL CONFIRMAR. El candado se sigue viendo en la
                  // tarjeta —el dato es cierto y sirve—, pero preguntar en cada
                  // confirmación por algo que Operaciones no puede resolver (la modalidad
                  // la define el técnico, el permiso lo emite el GCBA) convertía el gesto
                  // más frecuente del tablero en un trámite. Lo que queda es el acuerdo
                  // comercial: ir antes del día que el cliente recibe la obra sí es una
                  // decisión de Operaciones, y esa cuadrilla viaja y vuelve vacía.
                  const friccion = friccionDePiso(
                    otsPorId.get(b.otId) ?? { fechaDesde: null },
                    b.fechas[0],
                  );
                  if (!friccion) return aplicar();

                  setPedidoCandado({
                    otId: b.otId,
                    friccion,
                    pedidosPrevios: 0,
                    confirmar: aplicar,
                  });
                }}
                candados={otsBloqueadas}
                onQuitar={volverABandeja}
                onCrearTarea={(cuadrillaId, fecha) => setTareaNueva({ cuadrillaId, fecha })}
                onTareaHecha={(b, hecha) => actualizarTarea.mutate({ ids: b.ids, cambio: { hecha } })}
                onEditarTarea={(b) => setTareaEnEdicion(b)}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
                No hay cuadrillas visibles. Elegí cuáles ver desde el selector de arriba.
              </div>
            )}

            <CajonPlanificacion />
          </div>

          <PanelSinAsignar
            ots={sinAsignar}
            planificadas={planificadas}
            hoy={hoyISO}
            colapsado={panelColapsado}
            onColapsar={colapsarPanel}
            onDetalle={(ot) => {
              if (cierre) return;
              setPanel({ otId: ot.id, bloqueKey: null });
            }}
            onIrABloque={(bloqueKey, fecha) => {
              setResaltado(bloqueKey);
              scrollAFecha(fecha);
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

      {/* Alta y edición comparten diálogo: los campos son los mismos y la diferencia
          —crear filas nuevas o actualizar el grupo entero— la resuelve onGuardar. */}
      <DialogoTarea
        abierto={tareaNueva !== null || tareaEnEdicion !== null}
        fecha={tareaNueva?.fecha ?? tareaEnEdicion?.fechas[0] ?? null}
        cuadrillaId={tareaNueva?.cuadrillaId ?? tareaEnEdicion?.cuadrillaId ?? null}
        cuadrillas={data?.cuadrillas ?? []}
        edicion={
          tareaEnEdicion?.tarea
            ? {
                grupoId: tareaEnEdicion.tarea.grupoId,
                titulo: tareaEnEdicion.tarea.titulo,
                tipo: tareaEnEdicion.tarea.tipo as TipoTarea,
                notas: tareaEnEdicion.notas ?? "",
                fraccion: aFraccionStr(tareaEnEdicion.fraccionesPorDia?.[0] ?? tareaEnEdicion.fraccion),
                dias: tareaEnEdicion.fechas.length,
              }
            : null
        }
        guardando={crearTarea.isPending || actualizarTarea.isPending}
        onOpenChange={(abierto) => {
          if (!abierto) {
            setTareaNueva(null);
            setTareaEnEdicion(null);
          }
        }}
        onGuardar={(v: ValoresTarea) => {
          if (tareaEnEdicion?.tarea) {
            // El título y el tipo son de la TAREA y van por grupo: cambiarlos en un solo
            // día dejaría la misma tarjeta diciendo dos cosas distintas. La fracción y
            // las notas son del día, y van por ids.
            actualizarTarea.mutate({
              grupoId: tareaEnEdicion.tarea.grupoId,
              cambio: { titulo: v.titulo, tipo: v.tipo, notas: v.notas },
            });
            actualizarTarea.mutate({
              ids: tareaEnEdicion.ids,
              cambio: { fraccion: v.fraccion },
            });
          } else if (tareaNueva) {
            crearTarea.mutate({
              titulo: v.titulo,
              tipo: v.tipo,
              notas: v.notas,
              cuadrillaId: tareaNueva.cuadrillaId,
              fecha: tareaNueva.fecha,
              fraccion: v.fraccion,
              dias: v.dias,
              ordenDia: proximoOrden(tareaNueva.cuadrillaId, tareaNueva.fecha),
            });
          }
          setTareaNueva(null);
          setTareaEnEdicion(null);
        }}
      />

      <DialogoJornadas
        abierto={jornadasDe != null}
        otId={jornadasDe}
        ot={jornadasDe != null ? otsPorId.get(jornadasDe) : undefined}
        asignaciones={jornadasDeLaObra}
        cuadrillas={data.cuadrillas}
        // `progreso` cuenta las jornadas de la obra en CUALQUIER fecha; `jornadasDeLaObra`
        // sólo las del rango cargado. La diferencia son días que existen y no se ven.
        fueraDeRango={Math.max(
          0,
          (data.progreso.find((p) => p.otId === jornadasDe)?.asignadas ?? 0) - jornadasDeLaObra.length,
        )}
        guardando={guardando}
        onGuardar={(cambios) => {
          if (jornadasDe == null) return;

          // Cada día puede quedar con una fracción distinta, así que se agrupan los que
          // comparten valor para no hacer una escritura por jornada.
          const porFraccion = new Map<string, number[]>();
          for (const c of cambios.fracciones) {
            porFraccion.set(c.fraccion, [...(porFraccion.get(c.fraccion) ?? []), c.asignacionId]);
          }
          for (const [fraccion, ids] of porFraccion) {
            actualizar.mutate({ ids, cambio: { fraccion: fraccion as FraccionStr } });
          }

          // Los cambios de fecha van por `mover`, que es la forma del PATCH que acepta una
          // fecha distinta por id: es exactamente lo que hace falta para cerrar el hueco de
          // una obra partida sin tocar la cuadrilla ni el apilado.
          if (cambios.fechas.length > 0) {
            mover.mutate(
              cambios.fechas.map((f) => ({ id: f.asignacionId, fecha: f.fecha })),
            );
          }

          if (cambios.nuevas.length > 0) {
            const estado = jornadasDeLaObra[0]?.estado ?? "tentativa";
            crear.mutate(
              cambios.nuevas.map((n) => ({
                otId: jornadasDe,
                fecha: n.fecha,
                cuadrillaId: n.cuadrillaId,
                fraccion: n.fraccion,
                estado,
                ordenDia: n.ordenDia,
              })),
            );
          }
          if (cambios.borradas.length > 0) borrar.mutate(cambios.borradas);

          setJornadasDe(null);
        }}
        onOpenChange={(abierto) => !abierto && setJornadasDe(null)}
      />

      <DialogoCandado pedido={pedidoCandado} onCerrar={() => setPedidoCandado(null)} />

      <FormularioCierre
        abierto={!!cierre}
        bloque={cierre ? (bloquesPorClave.get(cierre.bloqueKey) ?? null) : null}
        ot={cierre ? otsPorId.get(bloquesPorClave.get(cierre.bloqueKey)?.otId ?? 0) : undefined}
        fecha={cierre?.fecha ?? null}
        asignacionId={cierre?.asignacionId ?? null}
        parteId={cierre?.parteId ?? null}
        // `progreso` cuenta TODAS las asignaciones de la OT, no sólo las del rango
        // visible: si no, una obra que sigue la semana que viene se leería como terminada.
        esUltimaJornada={(() => {
          const otId = cierre ? bloquesPorClave.get(cierre.bloqueKey)?.otId : null;
          if (!otId) return false;
          const p = data.progreso.find((x) => x.otId === otId);
          // Falta cerrar exactamente ésta, y no queda nada por planificar de la obra.
          if (!p || p.asignadas - p.cerradas !== 1) return false;
          const pendiente = sinAsignar.find((x) => x.ot.id === otId);
          return (pendiente?.pendientes ?? 0) === 0;
        })()}
        onOpenChange={(abierto) => !abierto && setCierre(null)}
      />

      <PanelOt
        ot={panelOt}
        bloque={panelBloque}
        cuadrillaNombre={panelCuadrilla}
        // El id de la cuadrilla sugerida viene con la OT; el nombre lo tiene el tablero.
        cuadrillaPrevista={
          panelOt?.cuadrillaPrevistaId != null
            ? (data.cuadrillas.find((c) => c.id === panelOt.cuadrillaPrevistaId)?.nombre ?? null)
            : null
        }
        onOpenChange={(abierto) => !abierto && setPanel(null)}
      />
    </div>
  );
}
