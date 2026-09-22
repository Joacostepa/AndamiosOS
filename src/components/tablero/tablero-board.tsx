"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TopbarTablero } from "./topbar-tablero";
import { PanelActividad } from "./panel-actividad";
import { TableroGrid, DIAS_VENTANA, anchoRecursoPara } from "./tablero-grid";
import { PanelSinAsignar, ID_BANDEJA } from "./panel-sin-asignar";
import { ContenidoTarjeta } from "./tarjeta-asignacion";
import { PanelOt } from "./panel-ot";
import { CajonPlanificacion } from "./cajon-planificacion";
import { FormularioCierre } from "./formulario-cierre";
import { DialogoJornadas } from "./dialogo-jornadas";
import { DialogoTarea, type ValoresTarea } from "./dialogo-tarea";
import { DialogoCandado, type PedidoConfirmacion } from "./dialogo-candado";
import { DialogoFijar, type PedidoFijar } from "./dialogo-fijar";
import { DialogoCorrerDia } from "./dialogo-correr-dia";
import { invertirCorrimiento, type Corrimiento } from "@/lib/tablero/corrimiento";
import { DialogoDestinoJornadas, type PedidoDestino } from "./dialogo-destino-jornadas";
import { useCandado } from "@/hooks/use-habilitaciones";
import { useResumenComentarios } from "@/hooks/use-comentarios-ot";
import { haySinLeer, leerVistos, marcarVisto, type Vistos } from "@/lib/tablero/comentarios-vistos";
import type { ResumenEnTarjeta } from "@/lib/tablero/tipos-comentario";
import type { EstadoBloque } from "@/lib/tablero/tipos-movimiento";
import { usePlanJornadas, useFijarJornadasPlan } from "@/hooks/use-plan-jornadas";
import { useNotasJornada } from "@/hooks/use-notas-jornada";
import { useAvisosTablero } from "@/hooks/use-avisos-tablero";
import { direccionDeObra } from "@/lib/tablero/titulo";
import { useClima } from "@/hooks/use-clima";
import {
  useTablero,
  useFeriados,
  useCrearAsignaciones,
  useActualizarAsignaciones,
  useMoverAsignaciones,
  useCorrerDia,
  useBorrarAsignaciones,
  useCrearTarea,
  useActualizarTareas,
  useMoverTareas,
  useBorrarTareas,
  fechasDeObra,
} from "@/hooks/use-tablero";
import { agruparBloques, fechasDeJornadas, type Bloque } from "@/lib/tablero/bloques";
import { jornadasLiberables, motivoNoVuelveABandeja, type AccionCierre } from "@/lib/tablero/cierre";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { aFraccionStr, repartirJornadas, type FraccionStr } from "@/lib/tablero/fracciones";
import {
  friccionDeVentana, piso, techo, violaPiso, violaTecho,
} from "@/lib/tablero/ventana";
import { type OtTablero, type TipoTarea } from "@/lib/tablero/tipos";
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
/**
 * Qué acompaña a la dirección en las tarjetas: el contexto comercial (cliente, técnico) o
 * el operativo (qué hay que ejecutar). Se recuerda porque no es una consulta puntual sino
 * un modo de trabajo: el que arma la semana mira lo comercial, el que reparte las
 * cuadrillas a la mañana mira lo que hay que montar.
 */
const CLAVE_QUE_EJECUTAR = "tablero:que-ejecutar";
const CLAVE_DOMINGOS = "tablero:domingos-abiertos";

/** A cuántos px del borde del scroll se carga otra semana. */
const UMBRAL_BORDE = 240;
/**
 * Tope de semanas a cada lado. Cada ampliación reconsulta el rango entero a Odoo, así
 * que sin techo un scroll largo termina pidiendo medio año por request.
 */
const MAX_SEMANAS = 8;
/**
 * Cuánto dura el destello que ubica una obra al saltar desde el panel.
 *
 * Alcanza para encontrarla con la vista después del scroll y es corto para que no se lea
 * como un estado de la tarjeta: lo que sí es estado —seleccionada, no ejecutada, vencida
 * sin parte— se queda hasta que cambia el hecho que lo produjo.
 */
const MS_DESTELLO = 4000;

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * Lo planificado de una obra, sumando todos sus tramos.
 *
 * `ultimoDia` es lo que hace falta para el techo: el cliente pide el trabajo TERMINADO,
 * así que la fecha contra la que se mide es la del último día, no la del bloque que se
 * está tocando. Ver src/lib/tablero/ventana.ts.
 */
export type PlanObra = {
  dias: number;
  tramos: number;
  primerDia: string | null;
  ultimoDia: string | null;
};

const min = (a: string | null, b: string) => (a && a < b ? a : b);
const max = (a: string | null, b: string) => (a && a > b ? a : b);

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

/**
 * Cuánto vive un "deshacer". Pasados dos minutos el mundo se movió: pudieron cerrar la
 * jornada, moverla de nuevo o soltar otra obra encima. Un deshacer viejo no es una ayuda,
 * es una sorpresa.
 */
const VENTANA_UNDO = 2 * 60 * 1000;

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
  // La misma fecha, en ref. No es duplicación por comodidad: `fechaVisible` es estado y se
  // actualiza dentro de un requestAnimationFrame, así que en el efecto de layout que
  // reancla el scroll puede venir un frame atrasado — justo el frame en el que cambió la
  // geometría. Con el ref se lee lo último medido.
  //
  // Arranca en hoy y no en null a propósito: la primera vez que cambia la geometría es
  // cuando el ResizeObserver mide el contenedor, y ahí todavía no hubo ningún scroll del
  // usuario. Sin este valor inicial, ese primer reanclado no tendría a dónde ir.
  const fechaBorde = useRef(iso(ancla));
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
  //
  // Es un DESTELLO para ubicarla después de scrollear, no una selección. Se apagaba
  // nunca: `setResaltado` se llamaba en un solo lugar y nada lo devolvía a null, así que
  // la tarjeta quedaba con el contorno coral para el resto de la sesión. Peor que un
  // detalle: el contorno de "seleccionada" es lo único que la separa del borde rojo de
  // "no ejecutada", y una tarjeta marcada para siempre sin motivo se lee como una alarma.
  //
  // Lleva el momento en que se encendió y no sólo la clave, para que volver a saltar a la
  // MISMA obra vuelva a destellar: con la clave sola el estado no cambiaba, React no
  // re-renderizaba y el segundo clic no hacía nada visible.
  const [resaltado, setResaltado] = useState<{ key: string; desde: number } | null>(null);

  useEffect(() => {
    if (!resaltado) return;
    const t = setTimeout(() => setResaltado(null), MS_DESTELLO);
    return () => clearTimeout(t);
  }, [resaltado]);
  // El editor de jornadas es de la OBRA, no de la tarjeta: si la obra quedó partida en
  // varios tramos hay que poder verlos y arreglarlos juntos. Por eso guarda el otId.
  const [jornadasDe, setJornadasDe] = useState<number | null>(null);
  // Pregunta pendiente de "¿a dónde va el trabajo de esta jornada?". Lleva adentro la
  // acción a ejecutar, así el mismo diálogo sirve para los dos caminos por los que se
  // sacan jornadas —el arrastre a la bandeja y el editor de jornadas— sin duplicar la regla.
  const [destino, setDestino] = useState<PedidoDestino | null>(null);
  const [cierre, setCierre] = useState<{
    bloqueKey: string;
    asignacionId: number;
    fecha: string;
    parteId: number | null;
  } | null>(null);
  const [queEjecutar, setQueEjecutar] = useState<boolean>(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(CLAVE_QUE_EJECUTAR) === "true",
  );
  const [panelColapsado, setPanelColapsado] = useState<boolean>(
    () => typeof window !== "undefined" && window.localStorage.getItem(CLAVE_PANEL) === "true",
  );
  const [domingosAbiertos, setDomingosAbiertos] = useState<Set<string>>(
    () => new Set(leerDomingosGuardados(format(new Date(), "yyyy-MM-dd"))),
  );
  const [actividadAbierta, setActividadAbierta] = useState(false);
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

  // Los cambios de los demás, en vivo. Mientras esta pantalla esté abierta escucha los
  // avisos del resto, refresca y dice quién hizo qué: sin esto, el tablero sólo se entera
  // de lo ajeno cuando uno mismo escribe algo — que es lo que hizo que un cambio de
  // Ezequiel apareciera dieciséis minutos tarde, pegado a un gesto de Juan.
  useAvisosTablero();
  const crear = useCrearAsignaciones();
  const actualizar = useActualizarAsignaciones();
  const mover = useMoverAsignaciones();
  const correrDia = useCorrerDia();
  const borrar = useBorrarAsignaciones();
  // Las tareas escriben en Supabase y las obras en Odoo, pero se sienten igual: el
  // board elige el par según `bloque.origen` y nada más arriba se entera.
  const crearTarea = useCrearTarea();
  const actualizarTarea = useActualizarTareas();
  const moverTarea = useMoverTareas();
  const borrarTarea = useBorrarTareas();
  // Cuántas jornadas tiene cada obra según OPERACIONES, cuando difiere del estimado de
  // Comercial. Consulta aparte por lo mismo que las notas: va a Supabase, y corregir la
  // duración de una obra no tiene por qué reconsultar el rango entero de Odoo.
  const { porOt: planPorOt } = usePlanJornadas();
  const fijarPlan = useFijarJornadasPlan();
  const guardando =
    crear.isPending ||
    actualizar.isPending ||
    mover.isPending ||
    borrar.isPending ||
    crearTarea.isPending ||
    actualizarTarea.isPending ||
    moverTarea.isPending ||
    borrarTarea.isPending;

  // DOS SENSORES Y NO UNO, separados por cómo se toca y no por el ancho de la pantalla.
  //
  // Con el mouse la tarjeta se agarra apenas se mueve 6px, como siempre. Con el dedo eso no
  // sirve: deslizar para scrollear la grilla ES mover el dedo sobre una tarjeta —la grilla
  // está casi toda cubierta de tarjetas—, así que cada intento de ver otro día agarraba una
  // obra y la arrastraba. En táctil hay que MANTENER APRETADO un cuarto de segundo: el dedo
  // que desliza scrollea, el que se queda quieto agarra. La tolerancia deja que el dedo
  // tiemble un poco sin que se lea como scroll.
  //
  // Va por tipo de toque y no por `esMovil` porque una tablet es ancha y táctil: es donde
  // más se va a arrastrar, y tiene el mismo problema que el teléfono.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  // Pantalla de celular: menos de 768px, el mismo corte que `md:` de Tailwind.
  //
  // La columna de cuadrillas se angosta y la bandeja deja de ser una columna: en 390px una
  // columna de 300px dejaba sesenta para la grilla. El ancho de la columna va también a un
  // ref porque lo leen el snap y el listener de scroll, que se arman una sola vez y tienen
  // que ver el valor fresco si se gira el teléfono.
  const esMovil = useIsMobile();
  const anchoRecurso = anchoRecursoPara(esMovil);
  const anchoRecursoRef = useRef(anchoRecurso);
  useEffect(() => {
    anchoRecursoRef.current = anchoRecurso;
  }, [anchoRecurso]);
  // En celular la bandeja arranca cerrada SIEMPRE y no se recuerda: abierta tapa la grilla,
  // así que encontrarla abierta al día siguiente sería abrir el tablero sin ver el tablero.
  // La preferencia de la computadora (`panelColapsado`) no se toca.
  const [bandejaMovilAbierta, setBandejaMovilAbierta] = useState(false);

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

  function cambiarQueEjecutar(valor: boolean) {
    setQueEjecutar(valor);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CLAVE_QUE_EJECUTAR, String(valor));
    }
  }

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
    cont.scrollTo({ left: nodo.offsetLeft - anchoRecursoRef.current, behavior: suave ? "smooth" : "auto" });
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

  /**
   * La grilla cambió de ancho sin cambiar de rango: se vuelve a poner en el borde la
   * fecha que estaba ahí.
   *
   * QUÉ ARREGLA. El ancho de columna se calcula repartiendo el contenedor MEDIDO entre
   * los 8 días de la ventana (anchoDeColumna), y esa medición llega tarde: la hace un
   * ResizeObserver que corre DESPUÉS del primer pintado. Hasta entonces la columna vale un
   * fallback de 168px cuando en pantalla ancha mide ~229. Y vuelve a cambiar cada vez que
   * cambia el ancho útil — plegar el panel derecho, redimensionar, o que aparezca la barra
   * de scroll vertical cuando entran las tarjetas de la semana que se acaba de pedir.
   *
   * Como el scroll es un número de píxeles, cada uno de esos momentos corría la grilla
   * abajo de un scrollLeft quieto. Se veía así: abrías el tablero, scrolleabas a la
   * derecha —lo que basta para tocar el borde y pedir una semana más, porque la ventana
   * inicial deja apenas seis columnas de recorrido— y unos segundos después, cuando
   * llegaba esa semana, la vista saltaba sola a otro día. Y en el arranque el tablero no
   * abría en hoy sino un par de columnas antes, porque el centrado inicial calculaba el
   * destino con las columnas todavía sin medir.
   *
   * Anclar a una FECHA en vez de a un píxel arregla los dos, porque la fecha es lo único
   * que no cambia cuando cambia el ancho.
   */
  const reanclarScroll = useCallback(() => {
    // Si hay una ampliación por la IZQUIERDA en vuelo, el reanclado no va: el efecto de
    // compensación que corre justo después ya va a corregir el scroll contra el ancho que
    // midió antes de prepender, y las dos correcciones se sumarían sobre el mismo scroll.
    // Se puede leer el ref acá porque los efectos del hijo corren antes que los del padre:
    // cuando la grilla avisa, el board todavía no lo limpió.
    if (anchoPrevio.current !== null) return;
    scrollAFecha(fechaBorde.current, false);
  }, [scrollAFecha]);

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
    const izquierda = cont.scrollLeft + anchoRecursoRef.current;
    let primera: string | null = null;
    for (const nodo of cont.querySelectorAll<HTMLElement>("[data-fecha]")) {
      if (nodo.offsetLeft + nodo.offsetWidth > izquierda + 1) {
        primera = nodo.dataset.fecha ?? null;
        break;
      }
    }
    if (primera) {
      fechaBorde.current = primera;
      setFechaVisible(primera);
    }
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
  const [pedidoFijar, setPedidoFijar] = useState<PedidoFijar | null>(null);
  const [corrimientoAbierto, setCorrimientoAbierto] = useState(false);

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

  /**
   * Cuántas jornadas tiene la obra HOY: el número que fijó Operaciones si alguien lo
   * corrigió, y si no el estimado de Comercial.
   *
   * Es la ÚNICA puerta por la que entra esa duración, y por eso vive acá en vez de
   * repetida en cada cuenta: si la bandeja restara contra un número y el aviso de "vuelve
   * a la bandeja" contra otro, el tablero diría dos cosas distintas de la misma obra en
   * la misma pantalla.
   */
  const duracionDe = useCallback(
    (ot: OtTablero) => planPorOt.get(ot.id)?.jornadas ?? ot.jornadas,
    [planPorOt],
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
        const duracion = duracionDe(ot);
        const totales = repartirJornadas(duracion).length;
        return {
          ot,
          duracion,
          totales,
          pendientes: totales - (avance?.asignadas ?? 0),
          cerradas: avance?.cerradas ?? 0,
          corregida: planPorOt.has(ot.id),
        };
      })
      .filter((x) => x.pendientes > 0);
  }, [data, duracionDe, planPorOt]);

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
    const mapa = new Map<number, PlanObra>();
    for (const b of bloquesPorClave.values()) {
      const actual = mapa.get(b.otId) ?? { dias: 0, tramos: 0, primerDia: null, ultimoDia: null };
      // El primero y el último de la obra ENTERA, no del tramo: una obra partida en dos
      // tramos termina cuando termina el segundo, y el techo se mide contra eso.
      const fechas = [...b.fechas].sort();
      mapa.set(b.otId, {
        dias: actual.dias + b.fechas.length,
        tramos: actual.tramos + 1,
        primerDia: min(actual.primerDia, fechas[0]),
        ultimoDia: max(actual.ultimoDia, fechas[fechas.length - 1]),
      });
    }
    return mapa;
  }, [bloquesPorClave]);

  // Obras ya en la grilla, para que el buscador conteste "¿esta obra ya la planifiqué?".
  //
  // Sólo alcanza el rango cargado: el tablero pide las asignaciones por fecha. Lo que queda
  // afuera lo cubre `fueraDeRango`, más abajo.
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

  // Obras con jornadas planificadas pero NINGUNA en las semanas cargadas.
  //
  // Sin esto el buscador no las encontraba en ningún lado: no están en la bandeja —no les
  // queda nada por planificar— ni en `planificadas`, que sólo ve el rango. Pasó con una
  // obra tentativa el lunes siguiente al último día cargado: se veía en el tablero después
  // de scrollear, y buscándola desde la semana actual decía "ninguna obra coincide".
  //
  // `progreso` cuenta las jornadas en CUALQUIER fecha, así que alcanza para saber que la
  // obra está planificada sin pedirle nada más a Odoo. Dónde cae se pregunta al hacer clic.
  const fueraDeRango = useMemo<OtTablero[]>(() => {
    if (!data) return [];
    const conJornadas = new Set(data.progreso.filter((p) => p.asignadas > 0).map((p) => p.otId));
    return data.ots.filter((ot) => conJornadas.has(ot.id) && !planPorObra.has(ot.id));
  }, [data, planPorObra]);

  // Obra a destellar apenas su tarjeta llegue de Odoo. Al saltar a una fecha fuera del
  // rango las columnas aparecen enseguida pero las asignaciones tardan: el destello se
  // resuelve cuando llegan, no cuando se hace clic.
  const pendienteResaltado = useRef<{ otId: number; fecha: string } | null>(null);

  const resolverResaltado = useCallback(() => {
    const p = pendienteResaltado.current;
    if (!p) return;
    for (const b of bloquesPorClave.values()) {
      if (b.otId === p.otId && b.fechas.includes(p.fecha)) {
        pendienteResaltado.current = null;
        setResaltado({ key: b.key, desde: Date.now() });
        return;
      }
    }
  }, [bloquesPorClave]);

  // Al frame siguiente y no en el cuerpo del efecto: el destello va después de que la
  // tarjeta se pinte, y un setState síncrono acá encadenaría un render extra.
  useEffect(() => {
    if (!pendienteResaltado.current) return;
    const id = requestAnimationFrame(resolverResaltado);
    return () => cancelAnimationFrame(id);
  }, [resolverResaltado]);

  /**
   * Lleva a una obra planificada fuera de las semanas cargadas: pregunta sus fechas, amplía
   * el rango hasta cubrirla y la destella.
   *
   * Va a la PRIMERA jornada de hoy en adelante, que es lo que se busca al planificar; si ya
   * pasaron todas, a la última. Más allá del tope de semanas el tablero no llega, así que
   * ahí se dice la fecha en vez de fingir que se puede ir.
   */
  const irAObra = useCallback(
    async (otId: number) => {
      let fechasObra: string[];
      try {
        fechasObra = await fechasDeObra(otId);
      } catch (e) {
        toast.error("No se pudo buscar la fecha de la obra", {
          description: e instanceof Error ? e.message : String(e),
        });
        return;
      }

      const hoy = iso(ancla);
      const objetivo = fechasObra.find((f) => f >= hoy) ?? fechasObra[fechasObra.length - 1];
      if (!objetivo) {
        toast.info("La obra ya no tiene jornadas planificadas", {
          description: "Refrescá el tablero para ver el estado actual.",
        });
        return;
      }

      // Semana del objetivo contada desde la de hoy: 0 es la de hoy, negativa hacia atrás.
      const semana = Math.floor(differenceInCalendarDays(parseISO(objetivo), ancla) / 7);
      if (semana > MAX_SEMANAS || -semana > MAX_SEMANAS) {
        toast.info(
          `Planificada para el ${format(parseISO(objetivo), "EEEE d 'de' MMMM", { locale: es })}`,
          { description: `Queda más lejos de las ${MAX_SEMANAS} semanas que recorre el tablero.` },
        );
        return;
      }

      pendienteResaltado.current = { otId, fecha: objetivo };
      // Una semana de más a la derecha cuando entra: así la fecha puede quedar en el borde
      // izquierdo con días a la vista, en vez de ser la última columna.
      const antes = Math.max(semanas.antes, -semana);
      const despues = Math.max(semanas.despues, Math.min(MAX_SEMANAS, semana + 1));
      if (antes === semanas.antes && despues === semanas.despues) {
        scrollAFecha(objetivo);
        resolverResaltado();
        return;
      }
      // Mismo mecanismo que las flechas: el scroll espera a que la columna exista, y al
      // agregar semanas antes se compensa el ancho.
      pendienteScroll.current = objetivo;
      expansionPendiente.current = true;
      if (antes > semanas.antes) anchoPrevio.current = contenedor.current?.scrollWidth ?? null;
      setSemanas({ antes, despues });
    },
    [ancla, semanas, scrollAFecha, resolverResaltado],
  );

  // ── Comentarios de la obra ────────────────────────────────────────────────
  //
  // Sólo el conteo y el último de cada OT, para el globito. El hilo entero lo pide el
  // panel al abrirse. Una sola consulta a Supabase para todo lo que está en pantalla,
  // igual que el candado y por el mismo motivo.
  //
  // INCLUYE LA BANDEJA y no sólo la grilla: es justo ahí donde "el cliente pidió el
  // martes" cambia una decisión, porque es donde se decide en qué día va la obra.
  const otIdsConHilo = useMemo(
    () => [...new Set([...otIdsEnTablero, ...sinAsignar.map((o) => o.ot.id)])],
    [otIdsEnTablero, sinAsignar],
  );
  const { data: resumenComentarios } = useResumenComentarios(otIdsConHilo);

  // Qué comentarios ya miró quien está sentado acá. Se lee en el inicializador y no en un
  // efecto, igual que `panelColapsado`: leerlo después haría que el tablero se pinte una
  // vez con todo quieto y enseguida arranque a latir, que es un destello en cada carga.
  const [vistos, setVistos] = useState<Vistos>(leerVistos);

  /** El resumen con el estado de lectura resuelto, que es lo que baja a las tarjetas. */
  const comentarios = useMemo(() => {
    const mapa = new Map<number, ResumenEnTarjeta>();
    for (const [otId, r] of resumenComentarios ?? []) {
      mapa.set(otId, { ...r, sinLeer: haySinLeer(vistos, otId, r.ultimo.createdAt) });
    }
    return mapa;
  }, [resumenComentarios, vistos]);

  /**
   * Abrir el panel de una obra es haber visto sus comentarios: ahí se apaga el latido.
   *
   * MARCA HASTA AHORA y no hasta el último que conoce el resumen. Si marcara el último
   * conocido, el comentario que acabás de escribir vos haría latir tu propia tarjeta: el
   * resumen todavía trae el de antes. "Miré esta obra a las 14:32" deja adentro todo lo
   * escrito hasta las 14:32, tuyo incluido, y deja afuera lo que llegue después.
   *
   * El `max` con lo que ya sabemos cubre el reloj del navegador atrasado respecto del de
   * la base, que es de donde sale created_at.
   */
  const marcarLeida = useCallback(
    (otId: number) => {
      const ultimo = resumenComentarios?.get(otId)?.ultimo.createdAt ?? "";
      const ahora = new Date().toISOString();
      setVistos((previos) => marcarVisto(previos, otId, ahora > ultimo ? ahora : ultimo));
    },
    [resumenComentarios],
  );

  /** Abre el panel de una obra y da sus comentarios por leídos. */
  const abrirPanel = useCallback(
    (otId: number, bloqueKey: string | null) => {
      setPanel({ otId, bloqueKey });
      marcarLeida(otId);
    },
    [marcarLeida],
  );

  /** Cierra el panel. Vuelve a marcar por lo que se haya escrito con el panel abierto. */
  const cerrarPanel = useCallback(() => {
    if (panel) marcarLeida(panel.otId);
    setPanel(null);
  }, [panel, marcarLeida]);

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
   * La obra está fija y el gesto la sacaría de su día: devuelve el motivo, o null.
   *
   * ACÁ SÍ FRENA, a diferencia del piso y del techo del cliente, que avisan y dejan pasar.
   * La diferencia es qué significa cada cosa: la ventana del cliente es una restricción
   * que se puede renegociar por teléfono, y planificar contra ella es una hipótesis de
   * trabajo legítima. Que una obra esté fija es una decisión que alguien ya tomó y
   * escribió —la grúa está alquilada, el permiso tiene fecha— y arrastrarla sin querer la
   * borraría en silencio. Para moverla hay que soltarla primero, un clic en el menú de la
   * tarjeta: ese paso extra ES la decisión. Mismo criterio que motivoNoVuelveABandeja.
   *
   * COMPARA LAS FECHAS Y NO EL GESTO: pasar la tarjeta a otra cuadrilla el mismo día no
   * rompe nada. Lo que está fijo es la fecha, no quién la hace.
   */
  function fijaQueSeMueve(bloque: Bloque, fechasDestino: string[]): string | null {
    if (!bloque.motivoFija) return null;
    return bloque.fechas.join() === fechasDestino.join() ? null : bloque.motivoFija;
  }

  function avisarFija(fecha: string, motivo: string) {
    toast.error(`No se mueve del ${format(parseISO(fecha), "EEE d MMM", { locale: es })}`, {
      description: `${motivo} · Para moverla, soltala desde el menú de la tarjeta.`,
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
    if (!ot) return;

    if (violaPiso(ot, fecha)) {
      toast.warning(`Esta obra no entra antes del ${piso(ot)}`, {
        description: `La dejaste el ${format(parseISO(fecha), "d MMM", { locale: es })}. Se puede planificar igual, pero al confirmar te va a pedir el motivo.`,
      });
      return;
    }

    // EL TECHO SE MIRA CONTRA EL DÍA QUE SE SOLTÓ, no contra el plan completo, y es una
    // aproximación a propósito: acá la asignación todavía no está escrita, así que el
    // último día de la obra no incluye lo que se acaba de soltar. Alcanza para el caso
    // que importa —soltar directamente después de la fecha límite— y el cruce fino, con
    // la obra entera, lo hace la fricción al confirmar, que es donde frena de verdad.
    if (violaTecho(ot, fecha)) {
      toast.warning(`El cliente la pidió terminada antes del ${techo(ot)}`, {
        description: `La dejaste el ${format(parseISO(fecha), "d MMM", { locale: es })}. Se puede planificar igual, pero al confirmar te va a pedir el motivo.`,
      });
    }
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
    crear.mutate({
      asignaciones: nuevas,
      registro: {
        otId,
        otTitulo: tituloDeOt(otId),
        accion: "crear",
        antes: null,
        despues: {
          fechas: dias,
          cuadrillaId,
          cuadrillaNombre: nombreCuadrilla(cuadrillaId),
          fraccion: Number(fracciones[0]),
        },
      },
    });
  }

  // ── Deshacer el último gesto ──────────────────────────────────────────────
  //
  // POR QUÉ UN UNDO Y NO UN "¿ESTÁS SEGURO?": es el mismo criterio que ya rige quitar del
  // tablero. Un confirm grava todos los usos —incluido el arrastre correcto, que son la
  // enorme mayoría— y a la semana se clickea sin leer: queda la fricción y el error igual.
  // El undo no cuesta nada en el camino de ida.
  //
  // UNO SOLO Y EL ÚLTIMO. No es una pila: deshacer tres arrastres hacia atrás obliga a
  // recordar en qué orden pasaron, y el tablero es de varias personas a la vez — el
  // tercero hacia atrás puede ser de otro. Lo que resuelve el problema real ("lo arrastré
  // sin querer") es poder volver del gesto que acabás de hacer.
  //
  // CADUCA. Pasados dos minutos el mundo se movió: pudieron cerrar la jornada, moverla de
  // nuevo o soltar otra obra encima. Un deshacer viejo no es una ayuda, es una sorpresa.
  const ultimoDeshacible = useRef<{
    etiqueta: string;
    asignacionIds: number[];
    ejecutar: () => void;
    expira: number;
  } | null>(null);

  /**
   * ¿Sigue siendo seguro deshacer esto?
   *
   * La guarda es que las asignaciones sigan existiendo tal como las dejó el gesto. Si
   * alguien las movió, las cerró o las sacó del tablero en el medio, deshacer pisaría una
   * decisión ajena que quien aprieta el botón no está viendo.
   */
  /**
   * Deshacer el último gesto, si todavía es seguro.
   *
   * LA GUARDA: que las asignaciones sigan existiendo tal como las dejó el gesto, y que no
   * hayan pasado dos minutos. Si alguien las movió, las cerró o las sacó del tablero en el
   * medio, deshacer pisaría una decisión ajena que quien aprieta el botón no está viendo.
   *
   * Va en useCallback y no como función suelta por el linter de React: `Date.now()` es
   * impuro y una función del cuerpo del componente se asume llamable durante el render.
   */
  const deshacer = useCallback(() => {
    const accion = ultimoDeshacible.current;
    if (!accion) {
      toast.info("No hay nada reciente para deshacer");
      return;
    }
    const vivas = new Set((data?.asignaciones ?? []).map((a) => a.id));
    const impedimento =
      Date.now() > accion.expira
        ? "El movimiento ya es viejo"
        : accion.asignacionIds.every((id) => vivas.has(id))
          ? null
          : "La obra cambió desde entonces";

    if (impedimento) {
      toast.error("No se puede deshacer", {
        description: `${impedimento}. Movela a mano desde el tablero.`,
      });
      ultimoDeshacible.current = null;
      return;
    }
    ultimoDeshacible.current = null;
    accion.ejecutar();
  }, [data]);

  // El toast y el atajo llaman por ref, no por closure: los dos se arman una sola vez y
  // tienen que ejecutar la versión fresca, que cambia cada vez que llega el tablero.
  const deshacerRef = useRef(deshacer);
  useEffect(() => {
    deshacerRef.current = deshacer;
  }, [deshacer]);

  /**
   * Guarda el gesto como deshacible y lo ofrece en un toast.
   *
   * UN SOLO TOAST, con id fijo: en una ráfaga de diez arrastres no se apilan diez
   * carteles, el último pisa al anterior.
   *
   * Cuatro segundos, lo mismo que cualquier otro aviso de la app. Eran diez y el cartel se
   * quedaba tapando la esquina durante los arrastres siguientes —más todavía porque sonner
   * pausa el contador con el mouse encima—. El cartel es el recordatorio y nada más: ⌘Z
   * sigue deshaciendo durante toda la VENTANA_UNDO aunque ya se haya ido.
   */
  const ofrecerDeshacer = useCallback(
    (accion: { etiqueta: string; asignacionIds: number[]; ejecutar: () => void }) => {
      ultimoDeshacible.current = { ...accion, expira: Date.now() + VENTANA_UNDO };
      toast.success(accion.etiqueta, {
        id: "tablero-deshacer",
        duration: 4000,
        closeButton: true,
        description: "⌘Z para volver atrás",
        action: { label: "Deshacer", onClick: () => deshacerRef.current() },
      });
    },
    [],
  );

  // ⌘Z / Ctrl+Z. El toast es lo que lo enseña; el atajo es lo que usa el que ya lo sabe,
  // sin tener que apuntarle a un cartel que se está por ir.
  //
  // No dispara mientras se está escribiendo: adentro de un campo, ⌘Z es deshacer el
  // tipeo y robárselo sería peor que no tener atajo.
  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key !== "z" && e.key !== "Z") return;
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.shiftKey) return;
      const foco = document.activeElement;
      if (
        foco instanceof HTMLInputElement ||
        foco instanceof HTMLTextAreaElement ||
        (foco instanceof HTMLElement && foco.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      deshacerRef.current();
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, []);

  // ── Registro de lo que se hace en el tablero ──────────────────────────────
  //
  // El "antes" lo manda el cliente porque lo tiene en memoria: pedírselo de vuelta a Odoo
  // sumaría ~800 ms al gesto que más se repite. Lo que NO manda el cliente es el autor ni
  // la decisión de registrar — eso lo pone la ruta con la sesión.
  //
  // El nombre de la cuadrilla viaja junto al id: el historial tiene que poder decir
  // "Cuadrilla 3" aunque esa cuadrilla se archive en Odoo el mes que viene.
  function nombreCuadrilla(id: number | null): string | null {
    return id == null ? null : (data?.cuadrillas.find((c) => c.id === id)?.nombre ?? null);
  }

  function estadoDelBloque(
    b: Pick<Bloque, "fechas" | "cuadrillaId" | "fraccion" | "motivoFija">,
  ): EstadoBloque {
    return {
      fechas: b.fechas,
      cuadrillaId: b.cuadrillaId,
      cuadrillaNombre: nombreCuadrilla(b.cuadrillaId),
      fraccion: b.fraccion,
      // Viaja en el registro porque al soltar la obra el motivo se borra de Odoo: si no
      // queda acá, el historial no puede contestar por qué había estado fija.
      motivoFija: b.motivoFija,
    };
  }

  function tituloDeOt(otId: number): string | null {
    return otsPorId.get(otId)?.titulo ?? null;
  }

  function moverBloque(
    bloque: Bloque,
    cuadrillaId: number,
    fecha: string,
    opts: { permitirDomingo?: boolean } = {},
  ) {
    if (sinGuardar(bloque)) return avisarGuardando();
    const dias = fechasDeJornadas(fecha, bloque.ids.length, opts);
    const trabada = fijaQueSeMueve(bloque, dias);
    if (trabada) return avisarFija(bloque.fechas[0], trabada);
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
    if (bloque.origen === "tarea") return moverTarea.mutate(movimientos);

    const antes = estadoDelBloque(bloque);
    const despues: EstadoBloque = {
      fechas: dias,
      cuadrillaId,
      cuadrillaNombre: nombreCuadrilla(cuadrillaId),
      fraccion: bloque.fraccion,
    };
    // Nada que deshacer si el bloque cayó donde ya estaba: pasa seguido —se levanta la
    // tarjeta y se suelta en la misma celda— y ofrecer deshacer un no-movimiento es ruido.
    const seMovio =
      antes.fechas.join() !== despues.fechas.join() || antes.cuadrillaId !== despues.cuadrillaId;

    mover.mutate(
      {
        movimientos,
        registro: {
          otId: bloque.otId,
          otTitulo: tituloDeOt(bloque.otId),
          accion: "mover",
          antes,
          despues,
        },
      },
      {
        onSuccess: ({ movimientoId }) => {
          if (!seMovio) return;
          ofrecerDeshacer({
            etiqueta: `Movida a ${format(parseISO(dias[0]), "EEE d MMM", { locale: es })}`,
            asignacionIds: bloque.ids,
            ejecutar: () =>
              mover.mutate({
                // Vuelve cada jornada a su día, su cuadrilla y su lugar en la pila.
                movimientos: bloque.ids.map((id, i) => ({
                  id,
                  fecha: bloque.fechas[i],
                  cuadrillaId: bloque.cuadrillaId,
                  ordenDia: bloque.ordenDia,
                })),
                registro: {
                  otId: bloque.otId,
                  otTitulo: tituloDeOt(bloque.otId),
                  accion: "mover",
                  antes: despues,
                  despues: antes,
                  deshaceA: movimientoId ?? null,
                },
              }),
          });
        },
      },
    );
  }

  /**
   * Clavar el bloque a sus días, o soltarlo.
   *
   * NO SE OFRECE DESHACER, a diferencia del arrastre. El undo existe porque un arrastre
   * se dispara sin querer y su efecto —la obra apareció otro día— es difícil de notar en
   * una grilla llena. Fijar cuesta abrir un menú, escribir un motivo y apretar un botón,
   * y el resultado se ve en la tarjeta: no hay nada que deshacer a ciegas. Lo contrario
   * está a un clic en el mismo menú.
   */
  function fijarBloque(bloque: Bloque, motivo: string | null) {
    if (sinGuardar(bloque)) return avisarGuardando();
    const antes = estadoDelBloque(bloque);
    actualizar.mutate({
      ids: bloque.ids,
      cambio: { motivoFija: motivo },
      registro: {
        otId: bloque.otId,
        otTitulo: tituloDeOt(bloque.otId),
        accion: motivo ? "fijar" : "soltar",
        antes,
        despues: { ...antes, motivoFija: motivo },
      },
    });
    toast.success(
      motivo
        ? `Fija al ${format(parseISO(bloque.fechas[0]), "EEE d MMM", { locale: es })}`
        : "Soltada: ya se puede mover",
    );
  }

  /**
   * Confirmar o volver a tentativa. Lo usan la tarjeta y el panel de la obra: un solo
   * camino, para que el candado de habilitación y la ventana del cliente frenen igual
   * desde los dos lados.
   *
   * Volver a tentativa nunca pregunta nada: aflojar el compromiso no necesita permiso de
   * nadie.
   *
   * `antesDelCandado` corre justo antes de abrir el diálogo de fricción, y sólo si se abre.
   * El panel lo usa para cerrarse: la hoja del panel y el diálogo son dos modales, y uno
   * encima del otro se pelean el foco.
   */
  function cambiarEstado(
    b: Bloque,
    estado: "tentativa" | "confirmada",
    antesDelCandado?: () => void,
  ) {
    const otDelBloque = otsPorId.get(b.otId);
    const aplicar = () =>
      actualizar.mutate({
        ids: b.ids,
        cambio: { estado },
        // Para la línea que ven los demás. La dirección y no el título entero: "Azara 856"
        // se lee de un vistazo, "Armado · S02525 · Estudio De Maio Patiño — Azara 856" no.
        obra: otDelBloque ? direccionDeObra(otDelBloque) : null,
        // De qué obra y de qué días son estos ids. Viaja desde acá porque el
        // bloque ya lo sabe: sin esto el servidor tendría que releer Odoo
        // para poder anotar quién confirmó, y le sumaría ~800 ms al gesto.
        // Las tareas de operaciones no tienen OT (otId 0) y no se registran:
        // no son un compromiso con un cliente.
        contexto:
          b.otId > 0 ? { otId: b.otId, fechas: b.fechas } : undefined,
      });
    if (estado !== "confirmada") return aplicar();

    // EL PERMISO PRIMERO: es el único que puede hacer que el trabajo sea
    // ilegal. Si pasa, recién ahí se mira la ventana del cliente.
    //
    // VOLVIÓ A ENCHUFARSE el 5/9, después de que la modalidad pasara a
    // preguntarse en la venta y a ser obligatoria para confirmarla. Se había
    // apagado entero porque la fricción "falta la modalidad" saltaba en el
    // 98,9% de las obras; ésa ya no llega acá (ver friccionDelTablero) y
    // quedan sólo las dos precisas: permiso sin emitir cuando el cliente
    // pidió esperarlo, y expediente sin número. Las órdenes viejas no tienen
    // modalidad cargada, así que no disparan ninguna.
    const f = candados?.get(b.otId);
    // Se evalúa UNA sola por vez a propósito: dos diálogos encadenados para
    // un clic se leen como que el sistema no quiere que trabajes.
    //
    // El techo se mide contra el ÚLTIMO día de la obra entera y no contra
    // esta jornada: el cliente pidió el trabajo terminado. Por eso sale de
    // planPorObra, que suma todos los tramos.
    const plan = planPorObra.get(b.otId);
    const friccion =
      f?.friccion ??
      friccionDeVentana(
        otsPorId.get(b.otId) ?? { fechaDesde: null, fechaAntesDe: null },
        {
          primerDia: b.fechas[0],
          // Si la obra todavía no está en el plan cargado, el bloque que se
          // confirma es lo único que se sabe de ella.
          ultimoDia: plan?.ultimoDia ?? b.fechas[b.fechas.length - 1],
        },
      );
    if (!friccion) return aplicar();

    antesDelCandado?.();
    setPedidoCandado({
      otId: b.otId,
      friccion,
      pedidosPrevios: f?.pedidosPrevios ?? 0,
      confirmar: aplicar,
    });
  }

  /** Cerrar o ver la jornada. Lo usan la tarjeta y el panel de la obra. */
  function cerrarJornada(b: Bloque, accion: NonNullable<AccionCierre>) {
    // El parte NO se carga desde el tablero: se navega al listado.
    //
    // Son dos personas y dos momentos —quien carga lo hace a la mañana con los
    // WhatsApp del día anterior, el planificador mira el tablero para
    // planificar— y el formulario del parte es el que alimenta el costo de mano
    // de obra. Con dos lugares para cargarlo, terminan divergiendo.
    cerrarPanel();
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
  }

  /** Cambiar la fracción de un bloque. Lo usan la tarjeta y el panel de la obra. */
  function cambiarFraccion(b: Bloque, f: FraccionStr) {
    if (b.origen === "tarea") actualizarTarea.mutate({ ids: b.ids, cambio: { fraccion: f } });
    else actualizar.mutate({ ids: b.ids, cambio: { fraccion: f } });
  }

  /** Pedir el motivo para fijar un bloque a su día. Lo usan la tarjeta y el panel. */
  function pedirFijar(b: Bloque) {
    setPedidoFijar({
      otId: b.otId,
      fechas: b.fechas,
      fijar: (motivo) => fijarBloque(b, motivo),
    });
  }

  /**
   * Suspender un día: manda el plan que armó el diálogo y ofrece deshacerlo entero.
   *
   * EL DESHACER NO RECALCULA, invierte los registros: cada jornada vuelve al día del que
   * salió aunque el tablero haya cambiado de forma en el medio. La guarda de
   * ofrecerDeshacer —que todas las asignaciones sigan existiendo— es la misma que la del
   * arrastre, sólo que acá son treinta en vez de tres: si alguien tocó una sola, el lote
   * no vuelve. Es estricto a propósito. Devolver la mitad de un corrimiento sería dejar el
   * tablero en un estado que no eligió nadie.
   */
  function correrElDia(plan: Corrimiento, datos: { dia: string; motivo: string }) {
    correrDia.mutate(
      { motivo: datos.motivo, movimientos: plan.movimientos, registros: plan.registros },
      {
        onSuccess: ({ filas }) => {
          setCorrimientoAbierto(false);
          const vuelta = invertirCorrimiento(plan.registros);
          ofrecerDeshacer({
            etiqueta: `Corrido el ${format(parseISO(datos.dia), "EEE d MMM", { locale: es })} · ${plan.jornadas} jornadas`,
            asignacionIds: plan.movimientos.map((m) => m.id),
            ejecutar: () =>
              correrDia.mutate({
                motivo: `Deshacer: ${datos.motivo}`,
                movimientos: vuelta.movimientos,
                registros: vuelta.registros,
                // Cada fila de la vuelta apunta a la de ida de su misma obra, para que el
                // panel marque el corrimiento original como deshecho.
                deshaceA: filas,
              }),
          });
        },
      },
    );
  }

  /**
   * Devolver una obra a la bandeja de sin asignar. Único camino: lo usan por igual el
   * arrastre al panel y la opción del menú de la tarjeta, así que la regla de qué se
   * puede sacar vale para los dos gestos.
   */
  function volverABandeja(bloque: Bloque) {
    if (sinGuardar(bloque)) return avisarGuardando();
    // Sacarla del tablero es la forma más brusca de moverla de su día: si está fija,
    // también hay que soltarla primero.
    if (bloque.motivoFija) return avisarFija(bloque.fechas[0], bloque.motivoFija);

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
    const ot = otsPorId.get(bloque.otId);
    const asignadasAhora =
      data?.progreso.find((p) => p.otId === bloque.otId)?.asignadas ?? bloque.ids.length;
    const quedanEnTablero = asignadasAhora - liberables.length;
    const duracion = ot ? duracionDe(ot) : 1;
    const totales = repartirJornadas(duracion).length;
    const vuelveALaBandeja = totales - quedanEnTablero > 0;

    const aplicar = () =>
      borrar.mutate({
        ids: liberables,
        registro: {
          otId: bloque.otId,
          otTitulo: tituloDeOt(bloque.otId),
          accion: "quitar",
          antes: estadoDelBloque(bloque),
          despues: null,
        },
      }, {
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
                crear.mutate({
                  asignaciones: restaurar,
                  registro: {
                    otId: bloque.otId,
                    otTitulo: tituloDeOt(bloque.otId),
                    accion: "crear",
                    antes: null,
                    despues: estadoDelBloque(bloque),
                  },
                }, {
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

    // ¿Hay algo que preguntar? Sólo si la obra efectivamente vuelve a la bandeja —si le
    // quedan otros tramos planificados no vuelve a ningún lado y no hay decisión— y sólo
    // si "la obra es más corta" es una respuesta posible: sacar la última jornada de una
    // obra de un día no la acorta, la desplanifica, y bajarla hasta cero sería cancelar la
    // OT, que se hace en Odoo.
    const duracionNueva = Number((duracion - liberables.length).toFixed(2));
    if (vuelveALaBandeja && duracionNueva >= 1) {
      setDestino({
        otId: bloque.otId,
        titulo: ot?.titulo ?? `OT #${bloque.otId}`,
        cantidad: liberables.length,
        duracionNueva,
        aplicar,
      });
      return;
    }
    aplicar();
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
    // SIN REGISTRO: reordenar dentro del mismo día no cambia cuándo ni con quién se
    // trabaja, sólo cómo se apilan las tarjetas en la celda. Anotarlo llenaría el
    // historial de líneas que no dicen nada y taparía los movimientos que sí importan.
    if (deObras.length > 0) mover.mutate({ movimientos: deObras });
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
      // En celular la bandeja se había corrido para dejar ver la grilla. Una vez que la obra
      // cayó en un día, lo que se quiere ver es dónde cayó, no la bandeja de vuelta encima.
      if (esMovil) setBandejaMovilAbierta(false);
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
    //
    // `dvh` y no `vh`: en el celular `100vh` mide la pantalla SIN descontar la barra del
    // navegador, y el pie de la grilla quedaba tapado.
    <div className="flex h-[calc(100dvh-8rem)] min-w-0 flex-col">
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
        onActividad={() => setActividadAbierta(true)}
        queEjecutar={queEjecutar}
        onQueEjecutar={cambiarQueEjecutar}
        onCorrerDia={() => setCorrimientoAbierto(true)}
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
        {/* `relative`: en celular la bandeja flota adentro de este marco. */}
        <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-md border">
          {/* Grilla y cajón comparten COLUMNA, y la bandeja queda afuera. Antes el cajón
              era hermano de toda la fila y al abrirlo le comía 240px también a la
              bandeja — que es una lista vertical de 36 obras que se scrollea, o sea lo
              que menos conviene achicar. El cajón habla de la grilla; que le saque alto
              sólo a ella. */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {cuadrillasVisibles.length > 0 ? (
              <TableroGrid
                contenedorRef={asignarContenedor}
                onGeometriaCambiada={reanclarScroll}
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
                bloqueSeleccionado={panel?.bloqueKey ?? resaltado?.key ?? null}
                hoy={hoyISO}
                domingosAbiertos={domingosAbiertos}
                onToggleDomingo={alternarDomingo}
                onCerrarJornada={cerrarJornada}
                // Con el modal de cierre abierto no se abre ningun panel. El clic que
                // cierra el menu ⋮ llega a la tarjeta DESPUES de que el menu se
                // desmontó, asi que una guarda por "menu abierto" llega tarde.
                onAbrirBloque={(b) => {
                  if (cierre) return;
                  // Una tarea no tiene ficha en Odoo que mostrar: el clic abre su propio
                  // diálogo, que es el único lugar donde vive.
                  if (b.origen === "tarea") return setTareaEnEdicion(b);
                  abrirPanel(b.otId, b.key);
                }}
                onFraccion={cambiarFraccion}
                onEditarJornadas={(b) => setJornadasDe(b.otId)}
                onEstado={cambiarEstado}
                candados={otsBloqueadas}
                compacta={esMovil}
                comentarios={comentarios}
                queEjecutar={queEjecutar}
                onFijar={pedirFijar}
                onSoltar={(b) => fijarBloque(b, null)}
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
            fueraDeRango={fueraDeRango}
            onIrAObra={irAObra}
            comentarios={comentarios}
            hoy={hoyISO}
            // En celular la bandeja no es una columna: flota encima de la grilla, arranca
            // cerrada y no se recuerda. Ver `bandejaMovilAbierta`.
            colapsado={esMovil ? !bandejaMovilAbierta : panelColapsado}
            flotante={esMovil}
            queEjecutar={queEjecutar}
            onColapsar={esMovil ? (v) => setBandejaMovilAbierta(!v) : colapsarPanel}
            onDetalle={(ot) => {
              if (cierre) return;
              abrirPanel(ot.id, null);
            }}
            onIrABloque={(bloqueKey, fecha) => {
              setResaltado({ key: bloqueKey, desde: Date.now() });
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
                queEjecutar={queEjecutar}
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

          // LA MISMA TRABA QUE EL ARRASTRE, porque es el mismo hecho: una jornada fija que
          // cambia de día. Este diálogo es el otro camino para moverla —y encima no
          // muestra cuáles están fijas—, así que sin esto el pin se saltea sin querer
          // justo cuando se replanifica la obra entera.
          //
          // SE RECHAZA TODO EL GUARDADO y no sólo la jornada trabada: aplicar la mitad de
          // lo que se pidió deja la obra en un estado que nadie eligió.
          const fijas = new Map(
            jornadasDeLaObra.filter((j) => j.motivoFija).map((j) => [j.id, j] as const),
          );
          if (fijas.size > 0) {
            const movida = cambios.fechas.find(
              (f) => fijas.has(f.asignacionId) && fijas.get(f.asignacionId)!.fecha !== f.fecha,
            );
            const borrada = cambios.borradas.find((id) => fijas.has(id));
            const trabada = movida
              ? fijas.get(movida.asignacionId)!
              : borrada != null
                ? fijas.get(borrada)!
                : null;
            if (trabada) {
              avisarFija(trabada.fecha, trabada.motivoFija!);
              return;
            }
          }

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
            const fechasNuevas = cambios.fechas.map((f) => f.fecha).sort();
            mover.mutate({
              movimientos: cambios.fechas.map((f) => ({ id: f.asignacionId, fecha: f.fecha })),
              registro: {
                otId: jornadasDe,
                otTitulo: tituloDeOt(jornadasDe),
                accion: "mover",
                antes: {
                  fechas: jornadasDeLaObra.map((j) => j.fecha).sort(),
                  cuadrillaId: jornadasDeLaObra[0]?.cuadrillaId ?? null,
                  cuadrillaNombre: nombreCuadrilla(jornadasDeLaObra[0]?.cuadrillaId ?? null),
                },
                despues: {
                  fechas: fechasNuevas,
                  cuadrillaId: jornadasDeLaObra[0]?.cuadrillaId ?? null,
                  cuadrillaNombre: nombreCuadrilla(jornadasDeLaObra[0]?.cuadrillaId ?? null),
                },
              },
            });
          }

          if (cambios.nuevas.length > 0) {
            const estado = jornadasDeLaObra[0]?.estado ?? "tentativa";
            crear.mutate({
              asignaciones: cambios.nuevas.map((n) => ({
                otId: jornadasDe,
                fecha: n.fecha,
                cuadrillaId: n.cuadrillaId,
                fraccion: n.fraccion,
                estado,
                ordenDia: n.ordenDia,
              })),
              registro: {
                otId: jornadasDe,
                otTitulo: tituloDeOt(jornadasDe),
                accion: "crear",
                antes: null,
                despues: {
                  fechas: cambios.nuevas.map((n) => n.fecha).sort(),
                  cuadrillaId: cambios.nuevas[0]?.cuadrillaId ?? null,
                  cuadrillaNombre: nombreCuadrilla(cambios.nuevas[0]?.cuadrillaId ?? null),
                },
              },
            });
          }
          // Las jornadas que se sacan pasan por la MISMA pregunta que el arrastre a la
          // bandeja: son el mismo hecho —una jornada menos en el tablero— y si sólo un
          // camino preguntara, la mitad de las veces el dato no se registraría y la obra
          // volvería a quedar pidiendo un día que nadie va a trabajar.
          if (cambios.borradas.length > 0) {
            const obra = otsPorId.get(jornadasDe);
            const duracion = obra ? duracionDe(obra) : 1;
            const asignadasAhora =
              data.progreso.find((p) => p.otId === jornadasDe)?.asignadas ?? 0;
            const quedan = asignadasAhora - cambios.borradas.length;
            const vuelveALaBandeja = repartirJornadas(duracion).length - quedan > 0;
            const duracionNueva = Number((duracion - cambios.borradas.length).toFixed(2));
            const aplicar = () =>
              borrar.mutate({
                ids: cambios.borradas,
                registro: {
                  otId: jornadasDe,
                  otTitulo: tituloDeOt(jornadasDe),
                  accion: "quitar",
                  antes: {
                    fechas: jornadasDeLaObra
                      .filter((j) => cambios.borradas.includes(j.id))
                      .map((j) => j.fecha)
                      .sort(),
                    cuadrillaId: jornadasDeLaObra[0]?.cuadrillaId ?? null,
                    cuadrillaNombre: nombreCuadrilla(jornadasDeLaObra[0]?.cuadrillaId ?? null),
                  },
                  despues: null,
                },
              });

            if (vuelveALaBandeja && duracionNueva >= 1) {
              setDestino({
                otId: jornadasDe,
                titulo: obra?.titulo ?? `OT #${jornadasDe}`,
                cantidad: cambios.borradas.length,
                duracionNueva,
                aplicar,
              });
            } else {
              aplicar();
            }
          }

          setJornadasDe(null);
        }}
        onOpenChange={(abierto) => !abierto && setJornadasDe(null)}
      />

      <DialogoDestinoJornadas
        pedido={destino}
        guardando={guardando || fijarPlan.isPending}
        onBandeja={(p) => {
          p.aplicar();
          setDestino(null);
        }}
        onNoHaciaFalta={(p) => {
          p.aplicar();
          // El número queda del lado de Operaciones y el estimado de Comercial no se
          // toca: es lo que hace que el Informe de Obra siga midiendo el desvío contra lo
          // que se estimó, en vez de contra una estimación corregida a posteriori —que
          // daría cero siempre y taparía justo lo que hay que medir—.
          fijarPlan.mutate(
            {
              otId: p.otId,
              jornadas: p.duracionNueva,
              motivo: `Se sacaron ${p.cantidad} jornada${p.cantidad === 1 ? "" : "s"} del tablero: la obra es más corta que el estimado.`,
            },
            {
              onSuccess: () =>
                toast.success(
                  `La obra queda en ${p.duracionNueva} jornada${p.duracionNueva === 1 ? "" : "s"}`,
                  { description: "No vuelve a la bandeja. El estimado de Comercial no se tocó." },
                ),
              onError: (e) =>
                toast.error("No se pudo guardar la duración", {
                  description: e instanceof Error ? e.message : String(e),
                }),
            },
          );
          setDestino(null);
        }}
        onCerrar={() => setDestino(null)}
      />

      <DialogoCandado pedido={pedidoCandado} onCerrar={() => setPedidoCandado(null)} />

      <DialogoFijar pedido={pedidoFijar} onCerrar={() => setPedidoFijar(null)} />

      <DialogoCorrerDia
        abierto={corrimientoAbierto}
        hoy={hoyISO}
        hastaCargado={hasta}
        asignaciones={data.asignaciones}
        ots={otsPorId}
        cuadrillas={data.cuadrillas}
        guardando={correrDia.isPending}
        onCerrar={() => setCorrimientoAbierto(false)}
        onCorrer={correrElDia}
      />

      <PanelActividad abierto={actividadAbierta} onOpenChange={setActividadAbierta} />

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
        plan={panelOt ? (planPorOt.get(panelOt.id) ?? null) : null}
        // La obra entera, no el bloque abierto: el techo se mide contra el último día de
        // todos los tramos. Es el mismo mapa con el que frena la fricción al confirmar.
        planObra={panelOt ? (planPorObra.get(panelOt.id) ?? null) : null}
        hoy={hoyISO}
        // LAS MISMAS ACCIONES QUE EL MENÚ DE LA TARJETA, por el mismo camino. En un celular
        // el ⋮ no existe —aparece al pasar el mouse—, así que el panel es la única puerta
        // para confirmar, fijar o cerrar la jornada. Pasan por las mismas funciones que la
        // tarjeta para que el candado, la ventana del cliente y las trabas de la obra fija
        // frenen igual desde los dos lados.
        //
        // Las que abren un diálogo cierran el panel antes: la hoja y el diálogo son dos
        // modales, y uno encima del otro se pelean el foco.
        onEstado={(e) => panelBloque && cambiarEstado(panelBloque, e, cerrarPanel)}
        onFijar={() => {
          if (!panelBloque) return;
          cerrarPanel();
          pedirFijar(panelBloque);
        }}
        onSoltar={() => panelBloque && fijarBloque(panelBloque, null)}
        onFraccion={(f) => panelBloque && cambiarFraccion(panelBloque, f)}
        onEditarJornadas={() => {
          if (!panelOt) return;
          cerrarPanel();
          setJornadasDe(panelOt.id);
        }}
        onCerrarJornada={(accion) => panelBloque && cerrarJornada(panelBloque, accion)}
        onQuitar={() => {
          if (!panelBloque) return;
          // Si no se puede quitar, el panel queda abierto: el aviso explica por qué, y
          // cerrarlo le sacaría la obra de adelante justo cuando la está mirando.
          if (!panelBloque.motivoFija && !motivoNoVuelveABandeja(panelBloque)) cerrarPanel();
          volverABandeja(panelBloque);
        }}
        onOpenChange={(abierto) => !abierto && cerrarPanel()}
      />
    </div>
  );
}
