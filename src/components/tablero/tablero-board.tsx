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
import {
  TableroGrid,
  DIAS_VENTANA,
  abreviarCuadrilla,
  anchoRecursoPara,
  type ArrastreGuardias,
  type GuardiasGrilla,
} from "./tablero-grid";
import { PanelSinAsignar, ID_BANDEJA } from "./panel-sin-asignar";
import { ContenidoTarjeta } from "./tarjeta-asignacion";
import { PanelOt } from "./panel-ot";
import type { ApoyoDeLaObra, DatosApoyoOt } from "./apoyo-ot";
import { CajonPlanificacion } from "./cajon-planificacion";
import { FormularioCierre } from "./formulario-cierre";
import { DialogoJornadas } from "./dialogo-jornadas";
import { DialogoTarea, type ValoresTarea } from "./dialogo-tarea";
import { DialogoCandado, type PedidoConfirmacion } from "./dialogo-candado";
import { DialogoFijar, type PedidoFijar } from "./dialogo-fijar";
import { DialogoCorrerDia } from "./dialogo-correr-dia";
import { invertirCorrimiento, type Corrimiento } from "@/lib/tablero/corrimiento";
import { DialogoDestinoJornadas, type PedidoDestino } from "./dialogo-destino-jornadas";
import { DialogoPedirAutorizacion, type PedidoAutorizacion } from "./dialogo-pedir-autorizacion";
import { FichaGuardia, type DestinoCorrer } from "./ficha-guardia";
import { DialogoMeterUrgente, type GuardiaCercana } from "./dialogo-meter-urgente";
import { ContenidoGuardia } from "./tarjeta-guardia";
import type { ComodinEnBandeja } from "./grupo-comodines";
import {
  useDeshacerUsoGuardia,
  useGuardias,
  useMoverGuardia,
  usePuedeAutorizar,
  useSolicitudesGuardia,
  useUsarGuardia,
} from "@/hooks/use-guardias";
import { useUser } from "@/hooks/use-user";
import {
  candidatosRelleno,
  claveCelda,
  destinoValidoGuardia,
  duracionParaCandado,
  esCuadrillaPropia,
  esGuardia,
  evaluarCandado,
  guardiaMasCercanaPara,
  guardiasPisadas,
  lugarProtegido,
  otParaCandado as otParaCandadoDe,
  siglaCuadrilla,
  type GrillaGuardias,
} from "@/lib/tablero/guardias";
import { comodinPuedeIr, evaluarComodines } from "@/lib/tablero/comodines";
import { diaDeSemana, hoyBA, lunesDe } from "@/lib/tablero/dias-habiles";
import {
  ETIQUETA_USO,
  type Comodin,
  type DecisionCandado,
  type Guardia,
  type GuardiaResumen,
  type LugarProtegido,
  type PedidoUsoGuardia,
  type RegistroUsoGuardia,
  type RespuestaUsoGuardia,
  type UsoGuardia,
} from "@/lib/tablero/guardias-tipos";
import { useCandado } from "@/hooks/use-habilitaciones";
import { useResumenComentarios } from "@/hooks/use-comentarios-ot";
import { haySinLeer, leerVistos, marcarVisto, type Vistos } from "@/lib/tablero/comentarios-vistos";
import type { ResumenEnTarjeta } from "@/lib/tablero/tipos-comentario";
import type { EstadoBloque, RegistroMovimiento } from "@/lib/tablero/tipos-movimiento";
import { usePlanJornadas, useFijarJornadasPlan } from "@/hooks/use-plan-jornadas";
import { useNotasJornada } from "@/hooks/use-notas-jornada";
import { useQuitarSuspension, useSuspensiones } from "@/hooks/use-suspensiones";
import { claveSuspension, type SuspensionDia } from "@/lib/tablero/tipos-suspension";
import { useAvisosTablero } from "@/hooks/use-avisos-tablero";
import { direccionCorta, direccionDeObra, nombrePropio } from "@/lib/tablero/titulo";
import { apoyosAlEditarJornadas, apoyosDeDias, arrastreDeApoyos, diasSiAchica, esApoyo, type DiaDeObra } from "@/lib/tablero/apoyo";
import { useClima } from "@/hooks/use-clima";
import {
  useTablero,
  useFeriados,
  escucharRechazosGuardia,
  type RechazoEnEscritura,
  useCrearAsignaciones,
  useActualizarAsignaciones,
  useMoverAsignaciones,
  useCambiarRoles,
  useCorrerDia,
  useBorrarAsignaciones,
  useCrearTarea,
  useActualizarTareas,
  useMoverTareas,
  useBorrarTareas,
  fechasDeObra,
} from "@/hooks/use-tablero";
import {
  agruparBloques,
  fechasDeJornadas,
  planDeObras,
  primerBloqueDeObra,
  type Bloque,
  type PlanObra,
} from "@/lib/tablero/bloques";
import { jornadasLiberables, motivoNoVuelveABandeja, type AccionCierre } from "@/lib/tablero/cierre";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { aFraccionStr, repartirJornadas, FRACCIONES, type FraccionStr } from "@/lib/tablero/fracciones";
import {
  friccionDeVentana, piso, techo, violaPiso, violaTecho,
} from "@/lib/tablero/ventana";
import { type OtTablero, type TipoTarea } from "@/lib/tablero/tipos";
import type { ObraPendiente, ObraPlanificada } from "./panel-sin-asignar";
import type { AsignacionTablero, MovimientoAsignacion, NuevaAsignacion, TableroPayload } from "@/lib/tablero/tipos";

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

// ── Guardias: lo que el board necesita y no es de React ───────────────────────
//
// LAS REGLAS SON DE guardias.ts Y comodines.ts, puras y con tests: la misma función decide
// acá antes de soltar y en el servidor al validar. El board sólo arma la entrada (la OT, el
// avance, si es comodín, la hora) y actúa sobre la decisión.

/**
 * Corre una regla y, si tira, devuelve `siFalla` y lo deja en la consola.
 *
 * POR QUÉ: las reglas de las guardias corren EN EL RENDER del tablero (el indicador, el
 * "si no entra nada", el resaltado del arrastre). Una excepción ahí tumba la pantalla
 * entera, y el tablero es la herramienta del día: que un cálculo nuevo falle no puede
 * dejar a Planificación sin grilla. Lo que falla, falla CERRADO: sin decisión del candado
 * se pide autorización (`CANDADO_CERRADO`), sin indicador no se muestra indicador. Nunca
 * se abre una guardia porque una regla no pudo contestar.
 */
function seguro<T>(fn: () => T, siFalla: T, que: string): T {
  try {
    return fn();
  } catch (e) {
    console.error(`[guardias] no se pudo calcular ${que}`, e);
    return siFalla;
  }
}

/** Lo que dice el candado cuando no pudo decidir: pedirle a JS, nunca dejar pasar. */
const CANDADO_CERRADO: DecisionCandado = {
  libre: false,
  pide: "obra_comun",
  mensaje: "Esa jornada es una guardia: para usarla con una obra común hace falta la autorización de JS",
};

/**
 * Ahora, en ISO. Fuera del componente a propósito: el linter de React trata `new Date()`
 * dentro del cuerpo como impuro (ver `deshacer`), y esto se llama desde los gestos —soltar,
 * meter urgente—, nunca durante el render. El render usa el `ahora` del estado, que se
 * actualiza cada minuto (la regla del comodín cambia a las 13 h).
 */
const ahoraISO = () => new Date().toISOString();

const diaCorto = (f: string) => format(parseISO(f), "EEE d", { locale: es });

/** El id que arrastra dnd-kit → la clave del bloque. Un comodín de la bandeja arrastra SU tarjeta. */
function claveArrastrada(id: string): string | null {
  if (id.startsWith("bloque:")) return id.slice(7);
  if (id.startsWith("comodin:")) return id.slice(8);
  return null;
}

/** El registro de un gesto, como lo pide /guardias/usar (las únicas acciones son crear y mover). */
function aRegistroUso(r: RegistroMovimiento | undefined, accion: "crear" | "mover"): RegistroUsoGuardia | undefined {
  return r ? { otId: r.otId, otTitulo: r.otTitulo, accion, antes: r.antes, despues: r.despues } : undefined;
}

/** Una jornada que se quiere poner, para saber si pisa una guardia. */
type JornadaDestino = { cuadrillaId: number | null; fecha: string; apoyo?: boolean };

// Lo planificado de una obra vive en lib/tablero/bloques.ts (planDeObras): ahí se cuenta
// sin apoyos y por días distintos, con tests. Se re-exporta para no mover a quien lo use.
export type { PlanObra };

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
// debajo. La tarjeta gana SÓLO para reordenar: soltar un bloque sobre otra tarjeta de un
// día la apila en ese orden.
//
// LA CELDA GANA en dos casos, porque es la que sabe en qué cuadrilla y en qué DÍA está el
// puntero:
//  - La tarjeta de abajo abarca varios días. Antes la obra caía en el PRIMER día de esa
//    tarjeta: en una fila tapada por una obra de lunes a viernes no había forma de soltar
//    en el jueves.
//  - Lo que se arrastra viene de la bandeja. Soltar una obra encima de una tarjeta no
//    hacía nada —la rama de la bandeja sólo acepta celdas— y no avisaba.
const detectarColision: CollisionDetection = (args) => {
  const dentro = pointerWithin(args);
  const sobreTarjeta = dentro.find((c) => String(c.id).startsWith("tarjeta:"));
  if (sobreTarjeta) {
    const destino = sobreTarjeta.data?.droppableContainer?.data?.current as { bloque?: Bloque } | undefined;
    // Un comodín arrastrado DESDE LA BANDEJA (grupo-comodines) se comporta como lo que viene
    // de la bandeja: gana la celda, que es la que sabe el día.
    const activo = String(args.active.id);
    const desdeBandeja = activo.startsWith("ot:") || activo.startsWith("comodin:");
    // Soltar un bloque sobre SÍ MISMO no hace nada, como siempre: con la celda ganando, un
    // arrastre corto dentro de una obra de 22 días la movía al día que quedó bajo el puntero.
    const sobreSiMismo = String(sobreTarjeta.id).slice(8) === claveArrastrada(activo);
    const celda = dentro.find((c) => String(c.id).startsWith("celda:"));
    if (celda && !sobreSiMismo && (desdeBandeja || destino?.bloque?.multiDia)) return [celda];
    return [sobreTarjeta];
  }
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
  // `seguir`: la obra se acaba de planificar desde la ficha. El panel adopta su primer
  // bloque en cuanto aparece en la grilla, y la ficha pasa de "bandeja" a "grilla" sin
  // cerrarse: lo siguiente que se hace con una obra recién puesta es confirmarla.
  // `dia`: el día con el que arranca elegido "Sumar apoyo". Lo pone abrir la ficha desde la
  // tarjeta de un apoyo, que lleva a la principal pero recuerda de qué día se venía.
  const [panel, setPanel] = useState<{ otId: number; bloqueKey: string | null; seguir?: boolean; dia?: string | null } | null>(null);
  // El orden en que la bandeja muestra sus obras, para las flechas ‹ › de la ficha.
  const [ordenBandeja, setOrdenBandeja] = useState<number[]>([]);
  const recibirOrdenBandeja = useCallback(
    (ids: number[]) => setOrdenBandeja((previo) => (previo.join(",") === ids.join(",") ? previo : ids)),
    [],
  );
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
  // Días suspendidos ("correr el día"): la tapa con el motivo en cada celda que no salió.
  const { data: suspensionesData } = useSuspensiones(desde, hasta);
  const suspensiones = useMemo(
    () => new Map((suspensionesData ?? []).map((x) => [claveSuspension(x.cuadrillaId, x.fecha), x])),
    [suspensionesData],
  );
  const quitarSuspension = useQuitarSuspension();

  // Los cambios de los demás, en vivo. Mientras esta pantalla esté abierta escucha los
  // avisos del resto, refresca y dice quién hizo qué: sin esto, el tablero sólo se entera
  // de lo ajeno cuando uno mismo escribe algo — que es lo que hizo que un cambio de
  // Ezequiel apareciera dieciséis minutos tarde, pegado a un gesto de Juan.
  useAvisosTablero();
  const crear = useCrearAsignaciones();
  const actualizar = useActualizarAsignaciones();
  const mover = useMoverAsignaciones();
  const cambiarRoles = useCambiarRoles();
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

  // ── Guardias y comodines (guardias-contrato.md) ───────────────────────────
  //
  // Las ACTIVAS viajan en el payload del tablero como tareas tipo 'guardia' (ocupan la
  // celda sin que nadie más tenga que enterarse). Lo demás —su historia, las usadas, las
  // sacadas, los pedidos a JS— viene de useGuardias, con su propia clave.
  const usarGuardia = useUsarGuardia();
  const deshacerUso = useDeshacerUsoGuardia();
  const moverGuardia = useMoverGuardia();
  const puedeAutorizar = usePuedeAutorizar();
  const { data: usuario } = useUser();
  const { data: guardiasData } = useGuardias(desde, hasta);
  // El contador del botón "Autorizaciones": sólo se consulta para quien puede autorizar.
  const { data: pendientesJS } = useSolicitudesGuardia("pendiente", { habilitado: puedeAutorizar });
  const [fichaGuardiaId, setFichaGuardiaId] = useState<number | null>(null);
  const [pedidoAutorizacion, setPedidoAutorizacion] = useState<PedidoAutorizacion | null>(null);
  const [urgenteDe, setUrgenteDe] = useState<OtTablero | null>(null);
  // Qué se resalta mientras se arrastra un comodín o una guardia. Se calcula UNA vez al
  // levantar la tarjeta, no en cada movimiento del puntero.
  const [arrastreGuardias, setArrastreGuardias] = useState<ArrastreGuardias | null>(null);
  // La hora de las reglas que se pintan (el comodín se libera a las 13 h del día anterior).
  // Un minuto de resolución alcanza; los gestos leen la hora exacta con ahoraISO().
  const [ahora, setAhora] = useState(ahoraISO);
  useEffect(() => {
    const t = setInterval(() => setAhora(ahoraISO()), 60_000);
    return () => clearInterval(t);
  }, []);

  const guardando =
    usarGuardia.isPending ||
    deshacerUso.isPending ||
    moverGuardia.isPending ||
    crear.isPending ||
    actualizar.isPending ||
    mover.isPending ||
    cambiarRoles.isPending ||
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
  const { data: candados, isError: errorCandado, refetch: refetchCandado } = useCandado(otIdsEnTablero);
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

  /**
   * La duración con la que mira el CANDADO (y lo que lo alimenta: qué es comodín, qué armado
   * está atrasado): la mayor entre Odoo y el plan de Operaciones (duracionParaCandado). NO es
   * duracionDe: el plan lo edita Planificación, y achicar un número no puede abrir una guardia.
   * Es la misma que usa el servidor; si el tablero mirara otra, ofrecería "usar" y el servidor
   * contestaría 409, o al revés.
   */
  const duracionCandado = useCallback(
    (ot: OtTablero) => duracionParaCandado(ot, planPorOt.get(ot.id)?.jornadas),
    [planPorOt],
  );
  /** Lo que el candado necesita de una OT del tablero. Sin `creadaEl` la urgencia no cumple: falla cerrado. */
  const otParaCandado = useCallback((ot: OtTablero) => otParaCandadoDe(ot, duracionCandado(ot)), [duracionCandado]);

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
        const totales = repartirJornadas(duracion, planPorOt.has(ot.id)).length;
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
  //
  // SIN LOS APOYOS: el editor cuenta y reparte jornadas DE LA OBRA, y un apoyo no es una
  // (apoyo.md). Con ellos adentro, una obra de 3 días con apoyo el martes se abría con 4
  // filas y guardar podía moverlos de día por su cuenta. Lo que sí se respeta: si se saca
  // un día de la principal, su apoyo se va con él (ver onGuardar del diálogo).
  const jornadasDeLaObra = useMemo(
    () =>
      jornadasDe == null
        ? []
        : (data?.asignaciones ?? []).filter((a) => a.otId === jornadasDe && !esApoyo(a)),
    [data, jornadasDe],
  );

  // Nombre de cada cuadrilla, de TODAS: la tarjeta del apoyo nombra a la principal aunque
  // esa fila esté filtrada.
  const nombresCuadrillas = useMemo(
    () => new Map((data?.cuadrillas ?? []).map((c) => [c.id, c.nombre])),
    [data],
  );

  // Cuántos días y cuántos tramos separados tiene planificada cada obra. La tarjeta lo usa
  // para avisar que lo que se ve es una parte: sin eso, una obra partida se lee como una
  // obra de un día y el resto del plan queda invisible.
  //
  // Sin apoyos y por días distintos: una obra de 3 días con la C3 de apoyo el martes sigue
  // diciendo "3 d" y no aparece como partida (ver planDeObras).
  const planPorObra = useMemo(() => planDeObras(bloquesPorClave.values()), [bloquesPorClave]);

  // ── Guardias: lo derivado ─────────────────────────────────────────────────
  //
  // Hoy y los feriados COMO LOS PIDEN LAS REGLAS: hoy en Buenos Aires (a las 22 h el UTC ya
  // es mañana) y los feriados como Set de fechas. Los feriados del tablero son un Map de
  // marca visual; para las guardias sí cuentan (nunca van en un feriado, y los plazos de
  // días hábiles no los cuentan).
  const hoyBa = hoyBA(ahora);
  const feriadosSet = useMemo(() => new Set(feriados.keys()), [feriados]);
  const guardiaPorId = useMemo(
    () => new Map((guardiasData?.guardias ?? []).map((g) => [g.id, g])),
    [guardiasData],
  );
  // LAS ACTIVAS SALEN DEL TABLERO y no del payload de guardias: el tablero es lo que se
  // escribe optimista (usarla, correrla, sacarla), así que es lo que está al día un segundo
  // después del gesto. Del payload sólo se toman la semana y la ranura.
  const activas = useMemo<GuardiaResumen[]>(
    () =>
      (data?.asignaciones ?? []).flatMap((a) =>
        esGuardia(a) && a.cuadrillaId != null
          ? [{
              id: a.id,
              fecha: a.fecha,
              cuadrillaId: a.cuadrillaId,
              semana: guardiaPorId.get(a.id)?.semana ?? lunesDe(a.fecha),
              ranura: guardiaPorId.get(a.id)?.ranura ?? 1,
              estado: "activa" as const,
            }]
          : [],
      ),
    [data, guardiaPorId],
  );
  // Todas las del rango: las activas del tablero más las que ya no lo son (usadas,
  // rellenadas, sacadas). Es lo que miran el indicador y "no dos el mismo día de la semana".
  const todasLasGuardias = useMemo<GuardiaResumen[]>(() => {
    const ids = new Set(activas.map((g) => g.id));
    return [
      ...activas,
      ...(guardiasData?.guardias ?? [])
        .filter((g) => !ids.has(g.id) && g.estado !== "activa")
        .map((g) => ({ id: g.id, fecha: g.fecha, cuadrillaId: g.cuadrillaId, semana: g.semana, ranura: g.ranura, estado: g.estado })),
    ];
  }, [activas, guardiasData]);
  const suspendidasSet = useMemo(
    () => new Set((suspensionesData ?? []).map((x) => claveCelda(x.cuadrillaId, x.fecha))),
    [suspensionesData],
  );
  const grillaGuardias = useMemo<GrillaGuardias | null>(
    () =>
      data
        ? { asignaciones: data.asignaciones, cuadrillas: data.cuadrillas, feriados: feriadosSet, suspendidas: suspendidasSet, hoy: hoyBa }
        : null,
    [data, feriadosSet, suspendidasSet, hoyBa],
  );
  const progresoPorOt = useMemo(() => new Map((data?.progreso ?? []).map((p) => [p.otId, p])), [data]);
  const avanceDe = useCallback(
    (otId: number) => {
      const p = progresoPorOt.get(otId);
      return p ? { asignadas: p.asignadas, cerradas: p.cerradas } : null;
    },
    [progresoPorOt],
  );

  // LOS COMODINES se calculan, no se guardan (contrato §2.1). Una sola pasada para todo el
  // tablero: la grilla (naipe y chip), la bandeja (el grupo) y el candado (esComodin).
  const comodines = useMemo<Comodin[]>(
    () =>
      data
        ? seguro(
            () =>
              evaluarComodines({
                ots: data.ots,
                asignaciones: data.asignaciones,
                progreso: data.progreso,
                hoy: hoyBa,
                feriados: feriadosSet,
                // La del candado: un comodín es lo que el candado deja pasar como comodín.
                duracionDe: duracionCandado,
              }),
            [],
            "los comodines",
          )
        : [],
    [data, hoyBa, feriadosSet, duracionCandado],
  );
  const comodinPorOt = useMemo(() => new Map(comodines.map((c) => [c.otId, c])), [comodines]);
  const vencidos = useMemo(() => new Map(comodines.filter((c) => c.vencido).map((c) => [c.otId, c])), [comodines]);

  /** ¿Esta OT es un comodín que puede ir ese día? Nunca antes de su piso. */
  const esComodinPara = useCallback(
    (otId: number, fecha: string) => {
      const c = comodinPorOt.get(otId);
      return !!c && comodinPuedeIr(c, fecha);
    },
    [comodinPorOt],
  );

  /** "C3" para una cuadrilla del tablero. */
  const siglaDe = useCallback(
    (cuadrillaId: number) => {
      const c = data?.cuadrillas.find((x) => x.id === cuadrillaId);
      return c ? siglaCuadrilla(c) : "cuadrilla";
    },
    [data],
  );

  // El chip "de guardia": cada jornada de obra que ocupa una guardia usada o rellenada.
  const usadas = useMemo(() => {
    const m = new Map<number, { uso: UsoGuardia | null; guardiaId: number }>();
    for (const g of guardiasData?.guardias ?? []) {
      if (g.estado !== "usada" && g.estado !== "rellenada") continue;
      for (const id of g.asignacionIds) m.set(id, { uso: g.uso, guardiaId: g.id });
    }
    return m;
  }, [guardiasData]);

  // "si no entra nada: Depósito", o el comodín que la regla de las 13 h tiene primero
  // (candidatosRelleno: apoyo atrasado, comodín, tentativa, depósito). Se nombra sólo el
  // comodín porque es lo que el contrato pide mostrar en la tarjeta; el resto de la fila lo
  // trae la alerta de las 13 h.
  const relleno = useMemo(() => {
    const m = new Map<number, string>();
    if (!data) return m;
    for (const g of activas) {
      const candidatos =
        g.fecha < hoyBa
          ? []
          : seguro(
              () =>
                candidatosRelleno({
                  guardia: g,
                  ahora,
                  feriados: feriadosSet,
                  asignaciones: data.asignaciones,
                  ots: otsPorId,
                  progreso: progresoPorOt,
                  cuadrillas: data.cuadrillas,
                  duracionDe: duracionCandado,
                }),
              [],
              "el relleno de una guardia",
            );
      const comodin = candidatos.find((c) => c.tipo === "comodin" && c.otId != null);
      const ot = comodin?.otId != null ? otsPorId.get(comodin.otId) : undefined;
      m.set(g.id, ot ? `comodín ${ot.ordenVenta ?? direccionCorta(direccionDeObra(ot))}` : "Depósito");
    }
    return m;
  }, [data, activas, hoyBa, ahora, feriadosSet, otsPorId, progresoPorOt, duracionCandado]);

  // "Lugar protegido próximos 5 días hábiles: X de N j" (contrato §1.6).
  const protegido = useMemo<LugarProtegido | null>(
    () =>
      data
        ? seguro(
            () =>
              lugarProtegido({
                hoy: hoyBa,
                feriados: feriadosSet,
                asignaciones: data.asignaciones,
                cuadrillas: data.cuadrillas,
                guardias: todasLasGuardias,
              }),
            null,
            "el lugar protegido",
          )
        : null,
    [data, hoyBa, feriadosSet, todasLasGuardias],
  );

  // Obras ya en la grilla, para que el buscador conteste "¿esta obra ya la planifiqué?".
  //
  // Sólo alcanza el rango cargado: el tablero pide las asignaciones por fecha. Lo que queda
  // afuera lo cubre `fueraDeRango`, más abajo.
  const planificadas = useMemo<ObraPlanificada[]>(() => {
    const nombres = new Map((data?.cuadrillas ?? []).map((c) => [c.id, c.nombre]));
    return [...bloquesPorClave.values()].flatMap((b) => {
      // Un apoyo no es "dónde está planificada la obra": es la principal la que la lleva.
      if (b.apoyo) return [];
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
      // La tarjeta de la obra es la de la principal, nunca la de un apoyo.
      if (b.otId === p.otId && !b.apoyo && b.fechas.includes(p.fecha)) {
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
    // duracionDe y NO ot.jornadas: aquél es SIEMPRE el estimado de Comercial, así que
    // una obra que Operaciones dejó en media jornada volvía del arrastre como jornada
    // entera. La bandeja ya mostraba el número corregido; el arrastre lo ignoraba.
    const todas = repartirJornadas(duracionDe(ot), planPorOt.has(otId));
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
    const registro: RegistroMovimiento = {
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
    };
    // ¿Cae sobre una guardia? La obra la REEMPLAZA (si el candado deja) o se pide a JS.
    const decididas = decidirGuardias(otId, nuevas);
    if (decididas) return usarOPedir({ otId, decididas, crear: nuevas, registro });
    crear.mutate({ asignaciones: nuevas, registro });
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
    b: Pick<Bloque, "fechas" | "cuadrillaId" | "fraccion" | "motivoFija"> & { apoyo?: boolean },
  ): EstadoBloque {
    return {
      // Sólo cuando lo es: el historial viejo no lo tiene y "ausente" ya quiere decir principal.
      ...(b.apoyo ? { apoyo: true } : {}),
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

  // ── Guardias: el candado antes de soltar ──────────────────────────────────
  //
  // NUNCA SE APILA SOBRE UNA GUARDIA (contrato §1.6). Todo gesto que pone algo en una celda
  // —soltar desde la bandeja, mover un bloque, cambiar de fila un apoyo, sumar un apoyo—
  // pregunta primero si alguna de sus jornadas cae en una guardia activa. Si cae:
  //   · el candado dice que se puede (urgencia que cumple, apoyo a un armado atrasado,
  //     comodín desde las 13 h del día anterior, o una solicitud ya aprobada) → la obra
  //     REEMPLAZA a la guardia, en un solo lote que se deshace entero;
  //   · si no, se ofrece pedirle autorización a JS con el pedido ya armado, y hasta que
  //     conteste la guardia sigue puesta.
  // El servidor valida lo mismo con la misma función: esto es para que el usuario se entere
  // ANTES de soltar, no la única llave.

  /** Las guardias que pisan estas jornadas, con lo que dice el candado de cada una. null = ninguna. */
  function decidirGuardias(otId: number, jornadas: JornadaDestino[]) {
    const pisadas = guardiasPisadas(jornadas, activas);
    if (pisadas.length === 0) return null;
    const ot = otsPorId.get(otId);
    const instante = ahoraISO();
    // Una solicitud que JS aprobó y no se pudo ejecutar sola queda HABILITADA para quien
    // pidió (plan técnico §0, decisión 5): soltar la misma obra en la misma guardia la usa.
    // Sólo las PROPIAS (el servidor no deja usar la de otro) y abre todas las guardias del
    // pedido aprobado, no sólo la que figura en la solicitud: igual que el servidor.
    const aprobadas = (guardiasData?.solicitudes ?? []).filter(
      (x) => x.otId === otId && x.estado === "aprobada" && !x.ejecutadaAt && x.pedidoPorId === usuario?.id,
    );
    return pisadas.map((guardia) => {
      const jornada = jornadas.find((j) => j.cuadrillaId === guardia.cuadrillaId && j.fecha === guardia.fecha);
      const aprobada =
        aprobadas.find((x) => x.guardiaId === guardia.id || (x.pedido?.guardiaIds ?? []).includes(guardia.id)) ?? null;
      const decision: DecisionCandado = !ot
        ? CANDADO_CERRADO
        : seguro(
            () =>
              evaluarCandado({
                guardia,
                ot: otParaCandado(ot),
                esApoyo: jornada?.apoyo === true,
                avance: avanceDe(otId),
                ahora: instante,
                feriados: feriadosSet,
                esComodin: esComodinPara(otId, guardia.fecha),
                aprobada: aprobada?.tipo ?? null,
              }),
            CANDADO_CERRADO,
            "el candado de una guardia",
          );
      return { guardia, decision, solicitudId: aprobada?.id };
    });
  }

  /**
   * Usar la guardia o pedir autorización, según lo que dijo el candado. `volver` son los
   * movimientos que deshacen un `mover` (cada jornada a donde estaba).
   */
  function usarOPedir(e: {
    otId: number;
    decididas: NonNullable<ReturnType<typeof decidirGuardias>>;
    crear?: NuevaAsignacion[];
    mover?: MovimientoAsignacion[];
    volver?: MovimientoAsignacion[];
    registro?: RegistroMovimiento;
  }) {
    const guardiaIds = e.decididas.map((d) => d.guardia.id);
    const ot = otsPorId.get(e.otId);
    const obra = ot ? direccionCorta(direccionDeObra(ot)) : null;
    const pedido: PedidoUsoGuardia = {
      guardiaIds,
      otId: e.otId,
      crear: e.crear,
      mover: e.mover,
      registro: aRegistroUso(e.registro, e.crear ? "crear" : "mover"),
      solicitudId: e.decididas.find((d) => d.solicitudId)?.solicitudId,
    };
    const trabada = e.decididas.find((d) => !d.decision.libre);
    if (trabada && !trabada.decision.libre) {
      const g = trabada.guardia;
      // `pide: null` = no se puede ni pidiendo (un día que ya pasó, una guardia que dejó de
      // estar activa): se dice por qué y nada más.
      if (trabada.decision.pide == null) {
        toast.error("No se puede usar esa guardia", { description: trabada.decision.mensaje });
        return;
      }
      setPedidoAutorizacion({
        guardia: { id: g.id, fecha: g.fecha, cuadrillaId: g.cuadrillaId },
        sigla: siglaDe(g.cuadrillaId),
        tipo: trabada.decision.pide,
        mensaje: trabada.decision.mensaje,
        pedido: { ...pedido, solicitudId: undefined },
        obra,
        volver: e.volver,
      });
      return;
    }
    usarGuardia.mutate(pedido, {
      onSuccess: (r: RespuestaUsoGuardia) => ofrecerDeshacerUso(r, { ...e, guardiaIds }),
    });
  }

  /**
   * El "Deshacer" de un uso de guardia: el de Planificación cuando la usa sola, y el de JS
   * cuando autoriza y se ejecuta en el acto (contrato §1.6: "un solo lote que se deshace
   * entero", también si lo aprobó JS). Qué se borra y adónde vuelve lo decide el servidor;
   * `borrar` y `volver` viajan para el optimista.
   */
  function ofrecerDeshacerUso(
    r: RespuestaUsoGuardia,
    e: { otId: number; guardiaIds: number[]; crear?: NuevaAsignacion[]; mover?: MovimientoAsignacion[]; volver?: MovimientoAsignacion[] },
  ) {
    // Las tarjetas de las guardias como estaban, para que el deshacer las devuelva al toque.
    const restaurar = (data?.asignaciones ?? []).filter((a) => esGuardia(a) && e.guardiaIds.includes(a.id));
    const primera = activas.find((g) => g.id === e.guardiaIds[0]) ?? todasLasGuardias.find((g) => g.id === e.guardiaIds[0]);
    const donde = primera ? `del ${diaCorto(primera.fecha)} (${siglaDe(primera.cuadrillaId)}) ` : "";
    const creo = (e.crear?.length ?? 0) > 0;
    ofrecerDeshacer({
      etiqueta: `Guardia ${donde}usada: ${ETIQUETA_USO[r.uso]}`,
      // La guarda del deshacer: las jornadas que entraron tienen que seguir ahí.
      asignacionIds: creo ? r.ids : (e.mover ?? []).map((m) => m.id),
      ejecutar: () =>
        deshacerUso.mutate({
          loteId: r.loteId,
          guardiaIds: e.guardiaIds,
          borrar: creo ? r.ids : undefined,
          volver: e.volver,
          restaurar,
          otTitulo: tituloDeOt(e.otId),
        }),
    });
  }

  /** Las guardias no sacadas de la misma semana, menos ésta: las reglas de dónde puede correrse. */
  function otrasDeLaSemana(g: GuardiaResumen): GuardiaResumen[] {
    return todasLasGuardias.filter((x) => x.id !== g.id && x.semana === g.semana && x.estado !== "sacada");
  }

  /**
   * Dónde se puede correr una guardia: cada celda de una cuadrilla propia, de lunes a
   * sábado de SU semana, que pase destinoValidoGuardia (la misma regla del servidor).
   */
  function destinosDe(g: GuardiaResumen): DestinoCorrer[] {
    if (!grillaGuardias || !data) return [];
    const otras = otrasDeLaSemana(g);
    const salida: DestinoCorrer[] = [];
    for (let n = 1; n <= 6; n++) {
      const fecha = diaDeSemana(g.semana, n);
      for (const c of data.cuadrillas) {
        if (!esCuadrillaPropia(c) || (c.id === g.cuadrillaId && fecha === g.fecha)) continue;
        const motivo = seguro(
          () => destinoValidoGuardia(grillaGuardias, g, { cuadrillaId: c.id, fecha }, otras),
          "no se pudo comprobar",
          "si la guardia puede correrse",
        );
        if (motivo === null) salida.push({ fecha, cuadrillaId: c.id, sigla: siglaCuadrilla(c) });
      }
    }
    return salida;
  }

  /**
   * Correr una guardia dentro de su semana (contrato §1.3, punto 5): Planificación lo hace
   * sin pedir nada, a una celda totalmente libre de una cuadrilla propia. El deshacer la
   * vuelve a donde estaba.
   */
  function correrGuardia(guardiaId: number, cuadrillaId: number, fecha: string) {
    const g = activas.find((x) => x.id === guardiaId);
    if (!g || !grillaGuardias) return;
    if (g.cuadrillaId === cuadrillaId && g.fecha === fecha) return;
    if (guardiaId < 0) return avisarGuardando();
    const motivo = seguro(
      () => destinoValidoGuardia(grillaGuardias, g, { cuadrillaId, fecha }, otrasDeLaSemana(g)),
      "No se pudo comprobar si puede ir ahí. Probá de nuevo.",
      "si la guardia puede correrse",
    );
    if (motivo) {
      toast.error("La guardia no puede ir ahí", { description: motivo });
      return;
    }
    moverGuardia.mutate(
      { guardiaId, fecha, cuadrillaId },
      {
        onSuccess: () =>
          ofrecerDeshacer({
            etiqueta: `Guardia corrida al ${diaCorto(fecha)} (${siglaDe(cuadrillaId)})`,
            asignacionIds: [guardiaId],
            ejecutar: () => moverGuardia.mutate({ guardiaId, fecha: g.fecha, cuadrillaId: g.cuadrillaId }),
          }),
      },
    );
  }

  /** "Pedir autorización para sacarla" (Planificación) o "Sacar" (JS). */
  function abrirSacar(guardiaId: number, modo: "pedir" | "sacar") {
    const g = activas.find((x) => x.id === guardiaId);
    if (!g) return;
    // La ficha y el diálogo son dos modales: uno encima del otro se pelean el foco.
    setFichaGuardiaId(null);
    setPedidoAutorizacion({
      guardia: { id: g.id, fecha: g.fecha, cuadrillaId: g.cuadrillaId },
      sigla: siglaDe(g.cuadrillaId),
      tipo: "sacar",
      modo,
    });
  }

  /**
   * Un 409 del candado que llegó de una escritura común (la pantalla no sabía de esa
   * guardia): en vez de un error rojo, el mismo camino que si la hubiera visto.
   */
  function atenderRechazo(r: RechazoEnEscritura) {
    const { rechazo } = r;
    const otId = r.otId ?? r.registro?.otId ?? r.crear?.[0]?.otId;
    const conocida = guardiaPorId.get(rechazo.guardiaId) ?? activas.find((g) => g.id === rechazo.guardiaId);
    if (rechazo.pide == null || !otId || !conocida) {
      toast.error("Esa jornada es una guardia", { description: rechazo.error });
      return;
    }
    const jornadas: JornadaDestino[] = [
      ...(r.crear ?? []).map((a) => ({ cuadrillaId: a.cuadrillaId, fecha: a.fecha, apoyo: a.apoyo })),
      ...(r.mover ?? []).map((m) => ({ cuadrillaId: m.cuadrillaId ?? null, fecha: m.fecha })),
    ];
    const guardiaIds =
      r.guardiaIds ?? [...new Set([rechazo.guardiaId, ...guardiasPisadas(jornadas, activas).map((g) => g.id)])];
    const ot = otsPorId.get(otId);
    setPedidoAutorizacion({
      guardia: { id: conocida.id, fecha: conocida.fecha, cuadrillaId: conocida.cuadrillaId },
      sigla: siglaDe(conocida.cuadrillaId),
      tipo: rechazo.pide,
      mensaje: rechazo.error,
      pedido: {
        guardiaIds,
        otId,
        crear: r.crear,
        mover: r.mover,
        registro: aRegistroUso(r.registro, r.crear ? "crear" : "mover"),
      },
      obra: ot ? direccionCorta(direccionDeObra(ot)) : null,
    });
  }
  // Por ref, como el deshacer: el oyente se anota una vez y tiene que llamar a la versión
  // fresca, que cambia con cada tablero que llega.
  const atenderRechazoRef = useRef(atenderRechazo);
  useEffect(() => {
    atenderRechazoRef.current = atenderRechazo;
  });
  useEffect(() => escucharRechazosGuardia((r) => atenderRechazoRef.current(r)), []);

  /** "Meter urgente": la guardia más cercana que la OT (ya en alta) puede usar. */
  function guardiaCercana(ot: OtTablero): GuardiaCercana | null {
    const r = seguro(
      () =>
        guardiaMasCercanaPara({
          ot: otParaCandado(ot),
          activas: activas.filter((g) => g.fecha >= hoyBa),
          ahora: ahoraISO(),
          feriados: feriadosSet,
          // Una OT en urgencia alta deja de ser comodín (contrato §2.1).
          esComodin: false,
          avance: avanceDe(ot.id),
        }),
      null,
      "la guardia más cercana",
    );
    if (!r) return null;
    return {
      guardiaId: r.guardia.id,
      fecha: r.guardia.fecha,
      sigla: siglaDe(r.guardia.cuadrillaId),
      libre: r.decision.libre,
      texto: r.decision.libre ? r.decision.razon : r.decision.mensaje,
    };
  }

  /**
   * Al levantar una tarjeta: qué se resalta. Una GUARDIA muestra las celdas de su semana
   * donde puede ir; un COMODÍN, las guardias que lo aceptan ("puede") o lo aceptarían con
   * permiso de JS ("pide"). Lo demás se atenúa (contrato §2.3).
   */
  function resaltarAlLevantar(bloque: Bloque | null, otId: number | null) {
    if (bloque && esGuardia(bloque)) {
      const g = activas.find((x) => x.id === bloque.ids[0]);
      setArrastreGuardias(
        g ? { tipo: "guardia", validas: new Set(destinosDe(g).map((d) => claveCelda(d.cuadrillaId, d.fecha))) } : null,
      );
      return;
    }
    const id = bloque ? (bloque.apoyo || bloque.origen === "tarea" ? null : bloque.otId) : otId;
    const c = id != null ? comodinPorOt.get(id) : undefined;
    const ot = id != null ? otsPorId.get(id) : undefined;
    if (id == null || !c || c.vencido || !ot) {
      setArrastreGuardias(null);
      return;
    }
    const instante = ahoraISO();
    const destinos = new Map<number, "puede" | "pide">();
    for (const g of activas) {
      if (g.fecha < hoyBa || !comodinPuedeIr(c, g.fecha)) continue;
      const d = seguro(
        () =>
          evaluarCandado({
            guardia: g,
            ot: otParaCandado(ot),
            esApoyo: false,
            avance: avanceDe(id),
            ahora: instante,
            feriados: feriadosSet,
            esComodin: true,
          }),
        CANDADO_CERRADO,
        "el candado de una guardia",
      );
      if (d.libre) destinos.set(g.id, "puede");
      else if (d.pide) destinos.set(g.id, "pide");
    }
    setArrastreGuardias({ tipo: "comodin", destinos });
  }

  /** Lleva el tablero hasta una guardia y la destaca. */
  function irAGuardia(guardiaId: number, fecha: string) {
    const b = [...bloquesPorClave.values()].find((x) => x.ids.includes(guardiaId));
    if (b) setResaltado({ key: b.key, desde: Date.now() });
    scrollAFecha(fecha);
  }

  function moverBloque(
    bloque: Bloque,
    cuadrillaId: number,
    fecha: string,
    opts: { permitirDomingo?: boolean } = {},
  ) {
    // La guardia se CORRE con sus propias reglas (misma semana, celda libre de una propia).
    if (esGuardia(bloque)) return correrGuardia(bloque.ids[0], cuadrillaId, fecha);
    // La guardia que terminó en depósito es historia: no se mueve.
    if (bloque.tarea?.deGuardia) return;
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
    if (bloque.origen === "tarea") {
      // UNA TAREA NO VA SOBRE UNA GUARDIA: no es lo imprevisto, y el candado no tiene a qué
      // OT preguntarle. Si la cuadrilla no puede ese día, lo que corresponde es pedir que se
      // saque la guardia, no taparla.
      if (guardiasPisadas(dias.map((f) => ({ cuadrillaId, fecha: f })), activas).length > 0) {
        toast.error("Esa jornada es una guardia", {
          description: "Una tarea no va encima de una guardia. Ponela en otra celda, o corré la guardia desde su menú.",
        });
        return;
      }
      return moverTarea.mutate(movimientos);
    }

    // LOS APOYOS VAN CON LA OBRA (apoyo.md): cada día de la principal se lleva a sus
    // apoyos al día de destino, en la misma cuadrilla de apoyo. Viajan en la MISMA request
    // que la principal: el servidor valida el resultado entero, y por separado vería un
    // instante con el apoyo solo en el día viejo y lo rechazaría.
    const arrastre = arrastreDeApoyos(
      data?.asignaciones ?? [],
      bloque.otId,
      bloque.fechas.map((f, i) => ({ desde: f, hasta: dias[i] })),
      cuadrillaId,
    );
    if (arrastre.choques.length > 0) {
      const nombre = nombreCuadrilla(cuadrillaId);
      toast.error(`${nombre ? nombrePropio(nombre) : "Esa cuadrilla"} es el apoyo de la obra ese día`, {
        description: "No puede ser principal y apoyo a la vez. Para cambiar los roles, usá \"Hacer principal\" en la tarjeta del apoyo.",
      });
      return;
    }
    if (arrastre.mover.some((m) => m.apoyo.id < 0)) return avisarGuardando();
    const apoyosMovidos = arrastre.mover.map((m) => m.apoyo);
    movimientos.push(
      ...arrastre.mover.map((m) => ({
        id: m.apoyo.id,
        fecha: m.fecha,
        ordenDia: m.apoyo.cuadrillaId != null ? proximoOrden(m.apoyo.cuadrillaId, m.fecha) : m.apoyo.ordenDia,
      })),
    );

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

    // ¿CAE SOBRE UNA GUARDIA? El comodín soltado en una guardia se MUEVE (no se copia) y
    // la guardia queda rellenada, todo en un lote (contrato §2.3). Los apoyos que viajan con
    // la obra también cuentan: un apoyo que cae en la guardia de otra cuadrilla la pisa.
    const decididas = decidirGuardias(bloque.otId, [
      ...dias.map((f) => ({ cuadrillaId, fecha: f })),
      ...arrastre.mover.map((m) => ({ cuadrillaId: m.apoyo.cuadrillaId, fecha: m.fecha, apoyo: true })),
    ]);
    if (decididas) {
      return usarOPedir({
        otId: bloque.otId,
        decididas,
        mover: movimientos,
        volver: [
          ...bloque.ids.map((id, i) => ({
            id,
            fecha: bloque.fechas[i],
            cuadrillaId: bloque.cuadrillaId,
            ordenDia: bloque.ordenDia,
          })),
          ...apoyosMovidos.map((a) => ({ id: a.id, fecha: a.fecha, cuadrillaId: a.cuadrillaId, ordenDia: a.ordenDia })),
        ],
        registro: { otId: bloque.otId, otTitulo: tituloDeOt(bloque.otId), accion: "mover", antes, despues },
      });
    }

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
            etiqueta: `Movida a ${format(parseISO(dias[0]), "EEE d MMM", { locale: es })}${
              apoyosMovidos.length > 0 ? " con su apoyo" : ""
            }`,
            // Los apoyos entran en la guarda: si alguien tocó uno en el medio, el deshacer
            // pisaría su gesto.
            asignacionIds: [...bloque.ids, ...apoyosMovidos.map((a) => a.id)],
            ejecutar: () =>
              mover.mutate({
                // Vuelve cada jornada a su día, su cuadrilla y su lugar en la pila. Los
                // apoyos que se fueron con ella vuelven también, en el mismo gesto.
                movimientos: [
                  ...bloque.ids.map((id, i) => ({
                    id,
                    fecha: bloque.fechas[i],
                    cuadrillaId: bloque.cuadrillaId,
                    ordenDia: bloque.ordenDia,
                  })),
                  ...apoyosMovidos.map((a) => ({
                    id: a.id,
                    fecha: a.fecha,
                    cuadrillaId: a.cuadrillaId,
                    ordenDia: a.ordenDia,
                  })),
                ],
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
    // LOS APOYOS SIGUEN A SU PRINCIPAL (apoyo.md): confirmar la jornada confirma a quien la
    // ayuda ese día, y volver a tentativa la afloja igual. Sólo los que no tienen parte:
    // uno con parte ya trabajó y su estado quedó escrito por el cierre.
    //
    // Va en un PATCH aparte y sin `contexto`: el registro de confirmaciones es de las
    // jornadas DE LA OBRA, una fila por día; anotar también al apoyo mostraría cada día
    // dos veces en "Confirmó mar 10 – jue 12".
    const apoyos =
      b.origen === "tarea" || b.apoyo
        ? []
        : apoyosDeDias(data?.asignaciones ?? [], b.otId, b.fechas).filter(
            (a) => a.parteId == null && a.id > 0 && a.estado !== estado,
          );
    const aplicarApoyos = () => {
      if (apoyos.length > 0) actualizar.mutate({ ids: apoyos.map((a) => a.id), cambio: { estado } });
    };
    const aplicar = () => {
      aplicarApoyos();
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
    };
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
    // EL CANDADO YA NO FALLA ABIERTO (guardias-contrato.md §3, plan técnico §7.3). Antes,
    // si la consulta del permiso daba error —a Depósito y Campo les daba 403— o todavía no
    // había terminado para esta obra, `f` venía vacío y se confirmaba sin preguntar nada:
    // "no sé" se leía como "no hay nada que frenar". Ahora "no sé" pasa por el diálogo con
    // un motivo, que queda registrado, y la opción de volver a comprobar.
    if (!f && b.otId > 0) {
      antesDelCandado?.();
      setPedidoCandado({
        otId: b.otId,
        friccion: {
          tipo: "sin_comprobar",
          error: errorCandado,
          motivo: errorCandado
            ? "La consulta del permiso municipal dio error, así que no sé si esta obra lo necesita."
            : "Todavía no terminé de comprobar el permiso municipal de esta obra.",
        },
        pedidosPrevios: 0,
        confirmar: aplicar,
        reintentar: () => void refetchCandado(),
      });
      return;
    }
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
  /**
   * Cambiar cuánto ocupa la jornada. En una obra de UN SOLO DÍA eso además fija cuánto
   * dura la obra.
   *
   * POR QUÉ SE FIJA. La fracción vive en la asignación de Odoo, o sea en "esta obra, este
   * día, esta cuadrilla": al sacar la obra del tablero la asignación se borra y la
   * fracción se va con ella. Alguien dejaba una obra en media jornada, la sacaba, la
   * volvía a arrastrar y aparecía otra vez de jornada entera — y no había dónde mirar por
   * qué. Guardarla en el plan de Operaciones (plan_jornadas_ot) es lo único que sobrevive
   * a la vuelta a la bandeja.
   *
   * SÓLO CON UNA JORNADA, y por eso se mira el progreso y no el bloque: la obra puede
   * tener otros tramos fuera del rango cargado. Cambiarle la fracción a un día de una obra
   * de tres no dice cuánto dura la obra entera, y para eso ya está "Jornadas de la obra".
   *
   * NO PISA EL ESTIMADO DE COMERCIAL. El número queda del lado de Operaciones, que es lo
   * que permite que el Informe de Obra siga midiendo el desvío contra lo que se estimó.
   */
  function cambiarFraccion(b: Bloque, f: FraccionStr) {
    if (b.origen === "tarea") {
      actualizarTarea.mutate({ ids: b.ids, cambio: { fraccion: f } });
      return;
    }
    actualizar.mutate({ ids: b.ids, cambio: { fraccion: f } });

    const asignadas = data?.progreso.find((p) => p.otId === b.otId)?.asignadas ?? b.ids.length;
    // Un apoyo tampoco: cuánto va la cuadrilla de apoyo no dice nada de cuánto dura la obra.
    if (b.multiDia || asignadas !== 1 || b.otId <= 0 || b.apoyo) return;

    const horas = FRACCIONES.find((x) => x.value === f)?.horas;
    fijarPlan.mutate({
      otId: b.otId,
      jornadas: Number(f),
      // Se anota solo: cambiar la fracción es un gesto de un clic que se repite todo el
      // día, y pedir un texto cada vez lo convertiría en un trámite —con el resultado
      // conocido de que se escriba un punto para salir del paso.
      motivo: `Operaciones la dejó en ${horas ?? Number(f) * 8} h desde el tablero.`,
    });
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
  function correrElDia(plan: Corrimiento, datos: { dia: string; motivo: string; cuadrillaIds: number[] }) {
    correrDia.mutate(
      {
        motivo: datos.motivo,
        movimientos: plan.movimientos,
        registros: plan.registros,
        // Los apoyos cuya cuadrilla no sale y cuya principal sí: se quitan, con su fila en
        // el historial (apoyo.md, etapa 3). Los que siguen a su principal ya van en
        // `movimientos`.
        quitar: plan.quitar,
        registrosApoyo: plan.registrosApoyo,
        // El día queda tapado con el motivo en las cuadrillas que no salieron: sin esto el
        // hueco se leía como un día libre (Juan Agustín, 01/10).
        suspension: { dia: datos.dia, cuadrillaIds: datos.cuadrillaIds },
        // LAS GUARDIAS QUE LA LLUVIA CONSUME (contrato §1.4): lo que cae sobre una guardia
        // la reemplaza y la cascada se frena ahí. Es lo que vio el preview; el servidor
        // busca y consume las que haya aunque no vengan acá.
        consumirGuardias: plan.guardiasConsumidas.map((g) => g.id),
      },
      {
        onSuccess: ({ filas, loteId, guardiasConsumidas }) => {
          setCorrimientoAbierto(false);
          const vuelta = invertirCorrimiento(plan.registros, plan.apoyosQuitados, plan.guardiasConsumidas);
          // El deshacer reactiva LAS QUE EL SERVIDOR CONSUMIÓ, que es la autoridad: puede
          // haber consumido alguna que esta pantalla no veía.
          const reactivar = guardiasConsumidas ?? vuelta.reactivarGuardias;
          const quitados = plan.apoyosQuitados.length;
          ofrecerDeshacer({
            etiqueta: `Corrido el ${format(parseISO(datos.dia), "EEE d MMM", { locale: es })} · ${
              plan.jornadas > 0 ? `${plan.jornadas} jornadas` : ""
            }${plan.jornadas > 0 && quitados > 0 ? " · " : ""}${
              quitados > 0 ? `${quitados} apoyo${quitados === 1 ? "" : "s"} quitado${quitados === 1 ? "" : "s"}` : ""
            }${reactivar.length > 0 ? ` · usó ${reactivar.length} guardia${reactivar.length === 1 ? "" : "s"}` : ""}`,
            asignacionIds: plan.movimientos.map((m) => m.id),
            ejecutar: () =>
              correrDia.mutate({
                motivo: `Deshacer: ${datos.motivo}`,
                movimientos: vuelta.movimientos,
                registros: vuelta.registros,
                // Los apoyos quitados vuelven a crearse, como estaban.
                crear: vuelta.crear,
                registrosApoyo: vuelta.registrosApoyo,
                // Cada fila de la vuelta apunta a la de ida de su misma obra, para que el
                // panel marque el corrimiento original como deshecho.
                deshaceA: filas,
                // Y la tapa del día se levanta con él.
                levantaLote: loteId ?? undefined,
                // Y las guardias que usó vuelven a estar activas.
                reactivarGuardias: reactivar.length > 0 ? reactivar : undefined,
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
  // ── Cuadrilla de apoyo (apoyo.md) ─────────────────────────────────────────

  function asignacionesDe(ids: number[]): AsignacionTablero[] {
    const set = new Set(ids);
    return (data?.asignaciones ?? []).filter((a) => set.has(a.id));
  }

  /** Los apoyos de la obra en esos días que todavía no están en un parte. */
  function apoyosSinParteDe(otId: number, fechas: string[]): AsignacionTablero[] {
    if (fechas.length === 0) return [];
    const dias = new Set(fechas);
    return (data?.asignaciones ?? []).filter(
      (a) => esApoyo(a) && a.otId === otId && dias.has(a.fecha) && a.parteId == null && a.id > 0,
    );
  }

  /** Para el deshacer: el apoyo como estaba, listo para volver a crearse. */
  function comoNuevoApoyo(a: AsignacionTablero): NuevaAsignacion {
    return {
      otId: a.otId,
      fecha: a.fecha,
      cuadrillaId: a.cuadrillaId,
      fraccion: aFraccionStr(a.fraccion),
      estado: a.estado,
      ordenDia: a.ordenDia,
      notas: a.notas,
      apoyo: true,
    };
  }

  /**
   * Sumar una cuadrilla de apoyo a la obra, uno o varios días. Pasa por la MISMA ruta que
   * planificar (POST de asignaciones, con `apoyo: true`): es una asignación más, que ocupa
   * capacidad en la fila de su cuadrilla.
   *
   * El estado lo toma de la principal de ese día: un apoyo a una jornada confirmada se
   * suma confirmado (la principal ya se le prometió al cliente y el apoyo no cambia eso).
   *
   * SI CON ESTO LA OBRA QUEDA CON APOYO TODOS LOS DÍAS, OFRECE achicarla. No la achica
   * sola (decisión de Joaquín, 17/10): la duración sigue en días de calendario y es de
   * Operaciones. La oferta lleva al editor de jornadas, que es donde se sacan días y donde
   * ya se pregunta si la obra "no hacía falta" tan larga.
   */
  function sumarApoyo(otId: number, cuadrillaId: number, fechas: string[], fraccion: FraccionStr) {
    if (fechas.length === 0) return;
    const asignaciones = data?.asignaciones ?? [];
    const principales = asignaciones.filter((a) => a.otId === otId && !esApoyo(a) && !a.tarea);
    const principalDe = new Map<string, AsignacionTablero>();
    for (const a of principales) if (!principalDe.has(a.fecha)) principalDe.set(a.fecha, a);
    const nuevas: NuevaAsignacion[] = fechas.map((f) => ({
      otId,
      fecha: f,
      cuadrillaId,
      fraccion,
      estado: principalDe.get(f)?.estado ?? "tentativa",
      ordenDia: proximoOrden(cuadrillaId, f),
      apoyo: true,
    }));
    const nombre = nombreCuadrilla(cuadrillaId);

    // ¿Queda con apoyo todos los días? Sólo se puede afirmar si la obra entera está en el
    // rango cargado: `progreso` cuenta días en cualquier fecha, y si hay más de los que se
    // ven, alguno puede no tener apoyo.
    const diasObra = new Set(principalDe.keys());
    const conApoyo = new Set([
      ...asignaciones.filter((a) => esApoyo(a) && a.otId === otId).map((a) => a.fecha),
      ...fechas,
    ]);
    const enteraALaVista = (data?.progreso.find((p) => p.otId === otId)?.asignadas ?? 0) === diasObra.size;
    const todos = enteraALaVista && [...diasObra].every((f) => conApoyo.has(f));
    const achicaA = todos ? diasSiAchica(diasObra.size, Number(fraccion)) : null;
    // Sumado a un día que ya tiene parte: el servidor lo vincula a ese parte.
    const conParteYa = fechas.some((f) => principalDe.get(f)?.parteId != null);

    // UN APOYO SOBRE UNA GUARDIA la usa sin pedir nada si el armado ya se pasó de lo
    // estimado (contrato §1.3, punto 3); si no, se pide a JS. Nunca se apila.
    const decididas = decidirGuardias(
      otId,
      nuevas.map((n) => ({ cuadrillaId: n.cuadrillaId, fecha: n.fecha, apoyo: true })),
    );
    if (decididas) {
      return usarOPedir({
        otId,
        decididas,
        crear: nuevas,
        registro: {
          otId,
          otTitulo: tituloDeOt(otId),
          accion: "crear",
          antes: null,
          despues: { fechas: [...fechas].sort(), cuadrillaId, cuadrillaNombre: nombre, fraccion: Number(fraccion), apoyo: true },
        },
      });
    }

    crear.mutate(
      {
        asignaciones: nuevas,
        registro: {
          otId,
          otTitulo: tituloDeOt(otId),
          accion: "crear",
          antes: null,
          despues: {
            fechas: [...fechas].sort(),
            cuadrillaId,
            cuadrillaNombre: nombre,
            fraccion: Number(fraccion),
            apoyo: true,
          },
        },
      },
      {
        onSuccess: () => {
          if (achicaA != null) {
            toast("La obra tiene apoyo todos los días", {
              description: `Con dos cuadrillas podría salir en ${achicaA} días en vez de ${diasObra.size}. Si la achicás, sacá los días que sobran desde Jornadas de la obra.`,
              duration: 10000,
              closeButton: true,
              action: {
                label: `Achicar a ${achicaA} días…`,
                onClick: () => {
                  cerrarPanel();
                  setJornadasDe(otId);
                },
              },
            });
            return;
          }
          toast.success(`Apoyo de ${nombre ? nombrePropio(nombre) : "otra cuadrilla"} sumado`, {
            description: conParteYa
              ? "Quedó vinculado al parte ya cargado: sumá su gente en Partes."
              : "El parte lo carga la cuadrilla principal, con la gente de las dos.",
          });
        },
      },
    );
  }

  /**
   * Quitar apoyos. Los que ya están en un parte no se tocan: ese día trabajaron, y si al
   * final no fueron se dice en el parte ("no fue"), que es el que lo borra.
   */
  function quitarApoyos(apoyos: AsignacionTablero[]) {
    const liberables = apoyos.filter((a) => a.parteId == null && a.id > 0);
    if (liberables.length === 0) {
      toast.error("No se puede quitar el apoyo", {
        // El camino real: el parte de la principal (tarjeta → Ver parte → Editar), que ahora
        // lista cada apoyo con su "fue".
        description: "Ya está en el parte de la obra. Si al final no fue, abrí el parte de la principal, tocá Editar y destildá \"fue\".",
      });
      return;
    }
    const primero = liberables[0];
    const nombre = nombreCuadrilla(primero.cuadrillaId);
    const fechas = liberables.map((a) => a.fecha).sort();
    const estado: EstadoBloque = {
      fechas,
      cuadrillaId: primero.cuadrillaId,
      cuadrillaNombre: nombre,
      fraccion: primero.fraccion,
      apoyo: true,
    };
    borrar.mutate(
      {
        ids: liberables.map((a) => a.id),
        registro: { otId: primero.otId, otTitulo: tituloDeOt(primero.otId), accion: "quitar", antes: estado, despues: null },
      },
      {
        onSuccess: () =>
          toast.success(`Se quitó el apoyo de ${nombre ? nombrePropio(nombre) : "otra cuadrilla"}`, {
            duration: 6000,
            closeButton: true,
            action: {
              label: "Deshacer",
              onClick: () =>
                crear.mutate({
                  asignaciones: liberables.map(comoNuevoApoyo),
                  registro: {
                    otId: primero.otId,
                    otTitulo: tituloDeOt(primero.otId),
                    accion: "crear",
                    antes: null,
                    despues: estado,
                  },
                }),
            },
          }),
      },
    );
  }

  /**
   * Arrastrar la tarjeta de un apoyo. El apoyo NO SE MUEVE DE DÍA por su cuenta: va con la
   * obra (apoyo.md). Lo que sí se puede es pasarlo a otra cuadrilla el mismo día, que es
   * soltarlo en otra fila de la misma columna.
   */
  function soltarApoyo(bloque: Bloque, cuadrillaId: number, fecha: string) {
    if (sinGuardar(bloque)) return avisarGuardando();
    if (fecha !== bloque.fechas[0]) {
      toast.info("El apoyo va con la obra", {
        description: "No cambia de día por su cuenta. Podés pasarlo a otra cuadrilla soltándolo en otra fila del mismo día.",
      });
      return;
    }
    if (cuadrillaId === bloque.cuadrillaId) return;
    // CON PARTE NO SE CAMBIA DE CUADRILLA: el renglón de mano de obra del parte ya dice de
    // qué cuadrilla fue la gente, y pasarlo dejaría al tablero diciendo C4 y al parte C3
    // (y a Partes pidiendo "sumá C4" sobre un parte cerrado). Misma regla que quitarlo.
    if (bloque.partes.some((p) => p != null)) {
      toast.error("No se puede pasar el apoyo a otra cuadrilla", {
        description: "Ya está en el parte de la obra. Si hay que corregir quién fue, editá el parte.",
      });
      return;
    }
    // Ni a una cuadrilla que YA es apoyo de la obra ese día: sería la misma gente dos
    // veces, y dos jornadas que el parte cierra como si fueran dos.
    const yaEsApoyo = bloque.fechas.some((f) =>
      (data?.asignaciones ?? []).some(
        (a) => a.otId === bloque.otId && a.fecha === f && esApoyo(a) && a.cuadrillaId === cuadrillaId && !bloque.ids.includes(a.id),
      ),
    );
    if (yaEsApoyo) {
      toast.error("Esa cuadrilla ya es apoyo de la obra ese día", {
        description: "Para sacar este apoyo, usá \"Quitar el apoyo\".",
      });
      return;
    }
    const principalAhi = bloque.fechas.some((f) =>
      (data?.asignaciones ?? []).some(
        (a) => a.otId === bloque.otId && a.fecha === f && !esApoyo(a) && a.cuadrillaId === cuadrillaId,
      ),
    );
    if (principalAhi) {
      toast.error("Esa cuadrilla ya lleva la obra ese día", {
        description: "Un apoyo tiene que ser de otra cuadrilla. Para sacarlo, usá \"Quitar el apoyo\".",
      });
      return;
    }
    const orden = proximoOrden(cuadrillaId, fecha);
    const antes = estadoDelBloque(bloque);
    // Mismos días: cambia sólo la fila.
    const movimientos = bloque.ids.map((id, i) => ({ id, fecha: bloque.fechas[i], cuadrillaId, ordenDia: orden }));
    const registro: RegistroMovimiento = {
      otId: bloque.otId,
      otTitulo: tituloDeOt(bloque.otId),
      accion: "mover",
      antes,
      despues: { ...antes, cuadrillaId, cuadrillaNombre: nombreCuadrilla(cuadrillaId) },
    };
    // Pasar el apoyo a una cuadrilla que tiene una guardia ese día es usarla (armado
    // atrasado) o pedirla: lo mismo que sumarlo ahí.
    const decididas = decidirGuardias(
      bloque.otId,
      bloque.fechas.map((f) => ({ cuadrillaId, fecha: f, apoyo: true })),
    );
    if (decididas) {
      return usarOPedir({
        otId: bloque.otId,
        decididas,
        mover: movimientos,
        volver: bloque.ids.map((id, i) => ({
          id,
          fecha: bloque.fechas[i],
          cuadrillaId: bloque.cuadrillaId,
          ordenDia: bloque.ordenDia,
        })),
        registro,
      });
    }
    mover.mutate({ movimientos, registro });
  }

  /**
   * "Hacer principal" (apoyo.md: "se rompe el camión de la principal"): ese día el apoyo
   * pasa a llevar la obra y la principal queda de apoyo. Cambia el ROL, no la gente ni la
   * capacidad: cada cuadrilla conserva su fracción y su lugar en la fila. Las dos
   * escrituras viajan en una request, que el servidor valida entera.
   *
   * No con parte: el parte ya se cargó con la cuadrilla que lo cargó, y cambiar los roles
   * después dejaría la cabecera diciendo una cosa y el tablero otra.
   */
  function hacerPrincipal(apoyoId: number) {
    const asignaciones = data?.asignaciones ?? [];
    const apoyo = asignaciones.find((a) => a.id === apoyoId && esApoyo(a));
    if (!apoyo) return;
    const principal = asignaciones.find(
      (a) => a.otId === apoyo.otId && a.fecha === apoyo.fecha && !esApoyo(a) && !a.tarea,
    );
    if (!principal) {
      toast.error("No hay principal ese día", {
        description: "Este apoyo quedó solo. Quitalo, o planificá la obra ese día en esta cuadrilla.",
      });
      return;
    }
    if (apoyo.id < 0 || principal.id < 0) {
      avisarGuardando();
      return;
    }
    if (apoyo.parteId != null || principal.parteId != null) {
      toast.error("Ese día ya tiene parte", {
        description: "Los roles quedaron escritos al cargar el parte. Si hay que corregirlo, editá el parte.",
      });
      return;
    }
    const fechas = [apoyo.fecha];
    const antes: EstadoBloque = {
      fechas,
      cuadrillaId: principal.cuadrillaId,
      cuadrillaNombre: nombreCuadrilla(principal.cuadrillaId),
      intercambio: true,
    };
    const despues: EstadoBloque = {
      fechas,
      cuadrillaId: apoyo.cuadrillaId,
      cuadrillaNombre: nombreCuadrilla(apoyo.cuadrillaId),
      intercambio: true,
    };
    const nuevo = nombreCuadrilla(apoyo.cuadrillaId);
    const ida = [
      { id: principal.id, apoyo: true },
      { id: apoyo.id, apoyo: false },
    ];
    cambiarRoles.mutate(
      {
        roles: ida,
        registro: { otId: apoyo.otId, otTitulo: tituloDeOt(apoyo.otId), accion: "cuadrilla", antes, despues },
      },
      {
        onSuccess: ({ movimientoId }) =>
          ofrecerDeshacer({
            etiqueta: `${nuevo ? nombrePropio(nuevo) : "El apoyo"} lleva la obra el ${format(parseISO(apoyo.fecha), "EEE d", { locale: es })}`,
            asignacionIds: ida.map((r) => r.id),
            ejecutar: () =>
              cambiarRoles.mutate({
                roles: ida.map((r) => ({ id: r.id, apoyo: !r.apoyo })),
                registro: {
                  otId: apoyo.otId,
                  otTitulo: tituloDeOt(apoyo.otId),
                  accion: "cuadrilla",
                  antes: despues,
                  despues: antes,
                  deshaceA: movimientoId ?? null,
                },
              }),
          }),
      },
    );
  }

  /** Lo que la ficha necesita para mostrar y sumar apoyos. Null si no hay nada que mostrar. */
  function datosApoyoDe(otId: number, diaInicial: string | null): DatosApoyoOt | null {
    if (!data) return null;
    const deLaObra = data.asignaciones
      .filter((a) => a.otId === otId && !a.tarea)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    const dias = new Map<string, DiaDeObra>();
    const porCuadrilla = new Map<number | null, ApoyoDeLaObra>();
    const noEjecutados = new Set(data.partes.filter((p) => p.estado === "no_ejecutado").map((p) => p.id));
    for (const a of deLaObra) {
      if (!esApoyo(a)) {
        if (!dias.has(a.fecha)) {
          dias.set(a.fecha, {
            fecha: a.fecha,
            cuadrillaId: a.cuadrillaId,
            estado: a.estado,
            conParte: a.parteId != null,
            parteNoEjecutado: a.parteId != null && noEjecutados.has(a.parteId),
          });
        }
        continue;
      }
      const actual =
        porCuadrilla.get(a.cuadrillaId) ??
        { cuadrillaId: a.cuadrillaId, nombre: nombreCuadrilla(a.cuadrillaId) ?? "Sin cuadrilla", dias: [] };
      actual.dias.push({ id: a.id, fecha: a.fecha, fraccion: a.fraccion, parteId: a.parteId });
      porCuadrilla.set(a.cuadrillaId, actual);
    }
    if (dias.size === 0 && porCuadrilla.size === 0) return null;
    // La ocupación se suma una vez por celda y no en cada render del formulario. SIN LAS
    // GUARDIAS: un apoyo que cae en una guardia la reemplaza, no se suma a ella.
    const ocupada = new Map<string, number>();
    for (const a of data.asignaciones) {
      if (a.cuadrillaId == null || esGuardia(a)) continue;
      const k = `${a.cuadrillaId}|${a.fecha}`;
      ocupada.set(k, (ocupada.get(k) ?? 0) + a.fraccion);
    }
    const guardiaPorCelda = new Map(activas.map((g) => [claveCelda(g.cuadrillaId, g.fecha), g]));
    const ot = otsPorId.get(otId);
    const instante = ahoraISO();
    return {
      dias: [...dias.values()],
      apoyos: [...porCuadrilla.values()].sort((x, y) => x.nombre.localeCompare(y.nombre)),
      cuadrillas: data.cuadrillas.map((c) => ({ id: c.id, nombre: c.nombre })),
      diaInicial,
      ocupacion: (cuadrillaId, fecha) => ocupada.get(`${cuadrillaId}|${fecha}`) ?? 0,
      // Lo que dice el candado, el mismo que decide al sumar (sumarApoyo → decidirGuardias).
      candadoEn: (cuadrillaId, fecha) => {
        const guardia = guardiaPorCelda.get(claveCelda(cuadrillaId, fecha));
        if (!guardia) return null;
        if (!ot) return CANDADO_CERRADO;
        return seguro(
          () =>
            evaluarCandado({
              guardia,
              ot: otParaCandado(ot),
              esApoyo: true,
              avance: avanceDe(otId),
              ahora: instante,
              feriados: feriadosSet,
              esComodin: esComodinPara(otId, fecha),
            }),
          CANDADO_CERRADO,
          "el candado de una guardia",
        );
      },
    };
  }

  function volverABandeja(bloque: Bloque) {
    // UNA GUARDIA NO SE QUITA ARRASTRÁNDOLA (contrato §1.3): sacarla es de JS. A quien no
    // puede se le ofrece pedirlo; a JS, sacarla con su motivo. Nunca un borrado silencioso.
    if (esGuardia(bloque)) {
      const id = bloque.ids[0];
      toast.info(
        puedeAutorizar ? "Sacar una guardia queda registrado con tu motivo" : "Para sacarla hace falta la autorización de JS",
        {
          description: puedeAutorizar
            ? "Sacada, esa semana no se repone."
            : "Hasta que JS responda, la guardia sigue puesta. También la podés correr dentro de la semana.",
          action: puedeAutorizar
            ? { label: "Sacar…", onClick: () => abrirSacar(id, "sacar") }
            : { label: "Pedir autorización…", onClick: () => abrirSacar(id, "pedir") },
        },
      );
      return;
    }
    // La guardia que terminó en depósito ya pasó: es historia, no se saca.
    if (bloque.tarea?.deGuardia) {
      toast.info("Fue una guardia que nadie usó", { description: "La cuadrilla fue al depósito. No se puede quitar." });
      return;
    }
    if (sinGuardar(bloque)) return avisarGuardando();
    // UN APOYO NO VUELVE A NINGUNA BANDEJA: nunca le sumó días a la obra, así que sacarlo
    // es quitar el apoyo y nada más (apoyo.md).
    if (bloque.apoyo) return quitarApoyos(asignacionesDe(bloque.ids));
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
    // Y LOS APOYOS DE ESOS DÍAS se van con la principal: un apoyo sin obra que ayudar
    // quedaría huérfano en la otra fila, ocupando capacidad para nada. El deshacer los
    // devuelve junto con ella.
    const apoyosQueSeVan = apoyosSinParteDe(
      bloque.otId,
      bloque.fechas.filter((_, i) => liberables.includes(bloque.ids[i])),
    );

    // Se fotografía lo que se va a borrar ANTES de borrarlo, para poder deshacer. No se
    // pierde ningún dato duro —los partes ni se tocan— pero sí el trabajo de planificar:
    // las fechas, la fracción de cada día, la cuadrilla y el orden. En una obra de veinte
    // jornadas eso es media tarde.
    //
    // Deshacer y no "¿estás seguro?": un confirm grava todos los usos, incluido el caso
    // barato de una obra tentativa de un día, y a la semana se clickea sin leer — queda la
    // fricción y el error igual. El undo no cuesta nada en el camino de ida. Cubre los dos
    // gestos, porque el arrastre al panel pasa por acá igual que la opción del menú.
    const restaurar: NuevaAsignacion[] = bloque.ids.flatMap((_, i): NuevaAsignacion[] =>
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
    ).concat(apoyosQueSeVan.map(comoNuevoApoyo));

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
    const totales = repartirJornadas(duracion, planPorOt.has(bloque.otId)).length;
    const vuelveALaBandeja = totales - quedanEnTablero > 0;

    const aplicar = () =>
      borrar.mutate({
        ids: [...liberables, ...apoyosQueSeVan.map((a) => a.id)],
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
                  onSuccess: () => {
                    const n = restaurar.length - apoyosQueSeVan.length;
                    toast.success(`Obra restaurada: ${n} jornada${n === 1 ? "" : "s"} vuelven al tablero`);
                  },
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
    // LA GUARDIA NO SE REORDENA: el servidor rechaza tocarla por la ruta de tareas (se corre
    // desde su menú), y su lugar en la pila no significa nada. Las demás se numeran igual,
    // con el índice del día completo.
    const movs = (soloTareas: boolean): MovimientoAsignacion[] =>
      reordenados
        .filter((b) => (b.origen === "tarea") === soloTareas && !esGuardia(b))
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
    if (id.startsWith("ot:")) {
      const otId = Number(id.slice(3));
      setArrastrando({ tipo: "ot", otId });
      resaltarAlLevantar(null, otId);
      return;
    }
    // Un bloque de la grilla, o un comodín que ya está en la grilla arrastrado desde la
    // bandeja (es SU tarjeta: soltarlo la mueve).
    const clave = claveArrastrada(id);
    const bloque = clave ? bloquesPorClave.get(clave) : undefined;
    setArrastrando(bloque ? { tipo: "bloque", bloque } : null);
    resaltarAlLevantar(bloque ?? null, null);
  }

  function onDragEnd(e: DragEndEvent) {
    setArrastrando(null);
    setArrastreGuardias(null);
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

    const clave = claveArrastrada(activo);
    if (!clave) return;
    const bloque = bloquesPorClave.get(clave);
    if (!bloque) return;
    // Un comodín arrastrado desde la bandeja: igual que una obra de la bandeja, en celular
    // la bandeja se va para dejar ver dónde cayó.
    if (activo.startsWith("comodin:") && esMovil) setBandejaMovilAbierta(false);

    // El apoyo tiene sus propias reglas: a la bandeja es quitarlo, y sólo cambia de fila.
    if (bloque.apoyo) {
      if (destino === ID_BANDEJA) return volverABandeja(bloque);
      if (destino.startsWith("tarjeta:")) {
        const otro = bloquesPorClave.get(destino.slice(8));
        if (!otro || otro.key === bloque.key) return;
        if (otro.cuadrillaId === bloque.cuadrillaId && otro.fechas[0] === bloque.fechas[0]) {
          return reordenarCelda(bloque, otro);
        }
        if (otro.cuadrillaId !== null) soltarApoyo(bloque, otro.cuadrillaId, otro.fechas[0]);
        return;
      }
      const celda = celdaDe(destino, over.data.current);
      if (celda) soltarApoyo(bloque, celda.cuadrillaId, celda.fecha);
      return;
    }

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
  const panelBloque = panel?.bloqueKey
    ? (bloquesPorClave.get(panel.bloqueKey) ?? null)
    : panel?.seguir
      ? // Con `dia` (después de "Hacer principal" desde la ficha), la tarjeta principal de
        // ESE día: el intercambio rearma las tarjetas y la que estaba abierta deja de existir.
        ((panel.dia
          ? [...bloquesPorClave.values()].find(
              (b) => b.otId === panel.otId && !b.apoyo && b.origen !== "tarea" && b.fechas.includes(panel.dia as string),
            )
          : undefined) ?? primerBloqueDeObra(bloquesPorClave.values(), panel.otId))
      : null;
  const panelPendiente = panel ? (sinAsignar.find((x) => x.ot.id === panel.otId) ?? null) : null;
  // Las flechas sólo desde la bandeja: desde la grilla no hay una lista que recorrer.
  const panelIndiceBandeja = panel && !panelBloque ? ordenBandeja.indexOf(panel.otId) : -1;
  // La primera tarjeta PRINCIPAL: la ficha de la obra nunca abre sobre un apoyo.
  const panelPrimerBloque = panel ? primerBloqueDeObra(bloquesPorClave.values(), panel.otId) : null;
  // El día con el que arranca "Sumar apoyo": el de la tarjeta de apoyo que se abrió, o el
  // primero de la tarjeta abierta desde hoy (el pasado casi nunca se apoya).
  const panelDia =
    panel?.dia ??
    (panelBloque ? (panelBloque.fechas.find((f) => f >= hoyISO) ?? panelBloque.fechas[0]) : null);
  const panelApoyo = panel ? datosApoyoDe(panel.otId, panelDia) : null;
  const panelCuadrilla =
    panelBloque?.cuadrillaId != null
      ? (data.cuadrillas.find((c) => c.id === panelBloque.cuadrillaId)?.nombre ?? null)
      : null;

  // ── Guardias: lo que va a la pantalla ──────────────────────────────────────

  // La ficha de la guardia abierta. Del payload de guardias (historia, porQué), con la
  // posición que tiene HOY en el tablero (lo optimista). Si el payload todavía no llegó, se
  // arma con lo que sabe el tablero: la ficha abre igual, sin historia.
  const fichaGuardia: Guardia | null = (() => {
    if (fichaGuardiaId == null) return null;
    const delPayload = guardiaPorId.get(fichaGuardiaId);
    const enGrilla = data.asignaciones.find((a) => a.id === fichaGuardiaId && a.origen === "tarea");
    if (delPayload) {
      return enGrilla && esGuardia(enGrilla) && enGrilla.cuadrillaId != null
        ? { ...delPayload, fecha: enGrilla.fecha, cuadrillaId: enGrilla.cuadrillaId }
        : delPayload;
    }
    if (!enGrilla || enGrilla.cuadrillaId == null) return null;
    const activa = esGuardia(enGrilla);
    return {
      id: enGrilla.id,
      fecha: enGrilla.fecha,
      cuadrillaId: enGrilla.cuadrillaId,
      semana: lunesDe(enGrilla.fecha),
      ranura: 1,
      estado: activa ? "activa" : "rellenada",
      origen: "sistema",
      uso: activa ? null : "deposito",
      otId: null,
      asignacionIds: [],
      porQue: null,
      loteId: null,
      creadaAt: "",
      estadoAt: null,
      estadoPorNombre: null,
      estadoMotivo: null,
    };
  })();
  const fichaResumen = fichaGuardia ? activas.find((g) => g.id === fichaGuardia.id) : undefined;

  // Lo que la grilla necesita de las guardias y los comodines.
  const guardiasGrilla: GuardiasGrilla = {
    relleno,
    usadas,
    comodines: comodinPorOt,
    arrastre: arrastreGuardias,
    puedeAutorizar,
    onAbrir: (b) => {
      if (!cierre) setFichaGuardiaId(b.ids[0]);
    },
    onAbrirGuardia: (id) => {
      if (!cierre) setFichaGuardiaId(id);
    },
    hoy: hoyBa,
    onCorrer: (b) => setFichaGuardiaId(b.ids[0]),
    onPedirSacar: (b) => abrirSacar(b.ids[0], "pedir"),
    onSacar: (b) => abrirSacar(b.ids[0], "sacar"),
  };

  // El grupo "Comodines" de la bandeja: sin los vencidos (ésos van con las urgentes), en el
  // orden de evaluarComodines (el que más espera primero), con dónde está hoy cada uno.
  const pendientesIds = new Set(sinAsignar.map((x) => x.ot.id));
  const comodinesBandeja: ComodinEnBandeja[] = comodines.flatMap((c) => {
    const ot = otsPorId.get(c.otId);
    if (!ot || c.vencido) return [];
    const bloque = c.ubicacion
      ? [...bloquesPorClave.values()].find(
          (b) => b.otId === c.otId && !b.apoyo && b.origen !== "tarea" && b.fechas.includes(c.ubicacion!.fecha),
        )
      : undefined;
    const pendiente = pendientesIds.has(c.otId);
    // Planificado fuera de las semanas cargadas: no hay tarjeta que arrastrar ni a dónde ir.
    if (!pendiente && !bloque) return [];
    return [{
      comodin: c,
      ot,
      pendiente,
      bloqueKey: bloque?.key ?? null,
      cuadrillaNombre: bloque?.cuadrillaId != null ? nombreCuadrilla(bloque.cuadrillaId) : null,
    }];
  });

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
        protegido={protegido}
        // El acceso a la bandeja de JS, sólo para quien autoriza.
        autorizaciones={puedeAutorizar ? (pendientesJS?.length ?? 0) : null}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={detectarColision}
        autoScroll={autoScroll}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setArrastrando(null);
          setArrastreGuardias(null);
        }}
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
                nombresCuadrillas={nombresCuadrillas}
                partes={data.partes}
                notas={notas ?? []}
                suspensiones={suspensiones}
                onQuitarSuspension={(x: SuspensionDia) =>
                  quitarSuspension.mutate(x.id, {
                    onSuccess: () => toast.success(`Se quitó la marca "${x.motivo}"`),
                    onError: (e) => toast.error("No se pudo quitar la marca", { description: e.message }),
                  })
                }
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
                  // La guardia (activa, o la que terminó en depósito) abre SU ficha: ni la
                  // de una OT ni el diálogo de tareas.
                  if (esGuardia(b) || b.tarea?.deGuardia) return setFichaGuardiaId(b.ids[0]);
                  // Una tarea no tiene ficha en Odoo que mostrar: el clic abre su propio
                  // diálogo, que es el único lugar donde vive.
                  if (b.origen === "tarea") return setTareaEnEdicion(b);
                  // LA TARJETA DE UN APOYO ABRE LA FICHA DE LA OBRA, sobre la principal de
                  // ese día: el apoyo no tiene ficha propia (no se confirma, no se cierra,
                  // no lleva parte). Si quedó huérfano, la ficha abre sin bloque y muestra
                  // el apoyo para quitarlo.
                  if (b.apoyo) {
                    const principal =
                      [...bloquesPorClave.values()].find(
                        (x) => x.otId === b.otId && !x.apoyo && x.origen !== "tarea" && x.fechas.includes(b.fechas[0]),
                      ) ?? null;
                    setPanel({ otId: b.otId, bloqueKey: principal?.key ?? null, dia: b.fechas[0] });
                    marcarLeida(b.otId);
                    return;
                  }
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
                onHacerPrincipal={(b) => b.ids.length === 1 && hacerPrincipal(b.ids[0])}
                onCrearTarea={(cuadrillaId, fecha) => setTareaNueva({ cuadrillaId, fecha })}
                onTareaHecha={(b, hecha) => actualizarTarea.mutate({ ids: b.ids, cambio: { hecha } })}
                onEditarTarea={(b) => setTareaEnEdicion(b)}
                guardias={guardiasGrilla}
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
            // Fijar la duración ANTES de planificar. Va al plan de Operaciones, igual que
            // cuando se cambia la fracción de una obra de un día en la grilla: es el mismo
            // dato dicho desde otra pantalla, y por eso se guarda en el mismo lugar.
            onDuracion={(ot, f) => {
              const horas = FRACCIONES.find((x) => x.value === f)?.horas;
              fijarPlan.mutate({
                otId: ot.id,
                jornadas: Number(f),
                motivo: `Operaciones la dejó en ${horas ?? Number(f) * 8} h desde la bandeja.`,
              });
            }}
            onIrABloque={(bloqueKey, fecha) => {
              setResaltado({ key: bloqueKey, desde: Date.now() });
              scrollAFecha(fecha);
            }}
            onOrden={recibirOrdenBandeja}
            comodines={comodinesBandeja}
            vencidos={vencidos}
            onMeterUrgente={(ot) => setUrgenteDe(ot)}
          />
        </div>

        <DragOverlay>
          {arrastrando?.tipo === "bloque" && esGuardia(arrastrando.bloque) && (
            <div className="h-[44px] w-[150px]">
              <ContenidoGuardia relleno={relleno.get(arrastrando.bloque.ids[0]) ?? "Depósito"} compacta />
            </div>
          )}
          {arrastrando?.tipo === "bloque" && !esGuardia(arrastrando.bloque) && (
            <div className="w-[150px]">
              <ContenidoTarjeta
                ot={otsPorId.get(arrastrando.bloque.otId)}
                bloque={arrastrando.bloque}
                queEjecutar={queEjecutar}
                comodin={arrastrando.bloque.apoyo ? null : (comodinPorOt.get(arrastrando.bloque.otId) ?? null)}
                compacta
                // El fantasma de un apoyo es rayado como su tarjeta, y dice quién carga el parte.
                apoyo={(() => {
                  const b = arrastrando.bloque;
                  if (!b.apoyo) return null;
                  const principal = (data.asignaciones ?? []).find(
                    (a) => a.otId === b.otId && a.fecha === b.fechas[0] && !esApoyo(a),
                  );
                  const nombre = principal ? nombreCuadrilla(principal.cuadrillaId) : null;
                  return principal
                    ? { principal: nombre ? nombrePropio(nombre) : "la principal", principalCorta: nombre ? abreviarCuadrilla(nombre) : null }
                    : { principal: null, principalCorta: null };
                })()}
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
            // Una tarea nueva de varios días puede caer sobre una guardia: no va encima
            // (el servidor y la base también lo frenan; esto es para decirlo antes).
            const diasTarea = fechasDeJornadas(tareaNueva.fecha, v.dias, { permitirDomingo: true });
            if (guardiasPisadas(diasTarea.map((f) => ({ cuadrillaId: tareaNueva.cuadrillaId, fecha: f })), activas).length > 0) {
              toast.error("Uno de esos días es una guardia", {
                description: "Una tarea no va encima de una guardia. Acortala o ponela en otra cuadrilla.",
              });
              return;
            }
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
        apoyos={jornadasDe == null ? [] : data.asignaciones.filter((a) => a.otId === jornadasDe && esApoyo(a))}
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
          //
          // LOS APOYOS VAN CON SU JORNADA (apoyo.md): si el martes pasa al jueves, el apoyo
          // del martes pasa al jueves, en la misma request. Se calcula AHORA, con el tablero
          // como estaba al guardar: la escritura puede salir recién después del borrado.
          //
          // El apoyo de un día que SE SACA se borra con su principal, aunque otro día se
          // mueva ahí ("saco el martes y junto los días"): el borrado sale primero y solo, y
          // si el apoyo del martes quedara, el servidor vería un apoyo sin principal y
          // rechazaría el guardado entero. Lo reemplaza el apoyo del día que llega, si
          // tiene, y nunca quedan dos de la misma cuadrilla el mismo día (ver
          // apoyosAlEditarJornadas, con tests).
          const planApoyos = apoyosAlEditarJornadas(
            data.asignaciones,
            jornadasDe,
            jornadasDeLaObra,
            cambios.borradas,
            cambios.fechas,
          );
          const arrastre = planApoyos.mover;
          const apoyosQueSeVan = planApoyos.borrar;
          const moverFechas = () => {
            if (cambios.fechas.length === 0) return;
            const fechasNuevas = cambios.fechas.map((f) => f.fecha).sort();
            mover.mutate({
              movimientos: [
                ...cambios.fechas.map((f) => ({ id: f.asignacionId, fecha: f.fecha })),
                ...arrastre.map((m) => ({ id: m.apoyo.id, fecha: m.fecha })),
              ],
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
          };

          const crearNuevas = () => {
            if (cambios.nuevas.length === 0) return;
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
          };

          // EL ORDEN IMPORTA desde que el servidor valida los roles (apoyo.md): "sacar el
          // martes y juntar en días corridos" mueve el miércoles al martes. Si el movimiento
          // llegara antes que el borrado, Odoo vería por un instante dos principales el
          // martes y lo rechazaría. Por eso, con días que se sacan, primero se borra y
          // recién después se mueve y se crea.
          const resto = () => {
            moverFechas();
            crearNuevas();
          };

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
            const vuelveALaBandeja =
              repartirJornadas(duracion, planPorOt.has(jornadasDe)).length - quedan > 0;
            const duracionNueva = Number((duracion - cambios.borradas.length).toFixed(2));
            const aplicar = () =>
              borrar.mutate(
                {
                  ids: [...cambios.borradas, ...apoyosQueSeVan.map((a) => a.id)],
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
                },
                { onSuccess: resto },
              );

            if (vuelveALaBandeja && duracionNueva >= 1) {
              setDestino({
                otId: jornadasDe,
                titulo: obra?.titulo ?? `OT #${jornadasDe}`,
                cantidad: cambios.borradas.length,
                duracionNueva,
                aplicar,
                // Cerrar la pregunta cancela el borrado, no el resto del guardado: las
                // fechas y los días nuevos se aplican igual, como antes.
                alCancelar: resto,
              });
            } else {
              aplicar();
            }
          } else if (apoyosQueSeVan.length > 0) {
            // Sin días que se sacan, sólo puede ser un apoyo que llega a un día donde su
            // cuadrilla ya es apoyo: se borra el que llega antes de mover.
            borrar.mutate({ ids: apoyosQueSeVan.map((a) => a.id) }, { onSuccess: resto });
          } else {
            resto();
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
        onCerrar={() => {
          destino?.alCancelar?.();
          setDestino(null);
        }}
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
        // Los apoyos de la obra ese día, con su "fue": el formulario los manda siempre, así
        // el que no fue se borra en vez de quedar pegado al parte (apoyo.md).
        apoyos={(() => {
          const otId = cierre ? bloquesPorClave.get(cierre.bloqueKey)?.otId : null;
          if (!cierre || !otId) return [];
          return data.asignaciones
            .filter((a) => esApoyo(a) && a.otId === otId && a.fecha === cierre.fecha && a.id > 0)
            .map((a) => ({
              asignacionId: a.id,
              cuadrillaId: a.cuadrillaId,
              nombre: nombreCuadrilla(a.cuadrillaId) ?? "Otra cuadrilla",
              fraccion: a.fraccion,
              parteId: a.parteId,
            }));
        })()}
        nombreCuadrilla={(id) => nombreCuadrilla(id)}
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
        cuadrillas={data.cuadrillas.map((c) => ({ id: c.id, nombre: c.nombre }))}
        pendiente={
          panelPendiente ? { pendientes: panelPendiente.pendientes, totales: panelPendiente.totales } : null
        }
        plan={panelOt ? (planPorOt.get(panelOt.id) ?? null) : null}
        // La obra entera, no el bloque abierto: el techo se mide contra el último día de
        // todos los tramos. Es el mismo mapa con el que frena la fricción al confirmar.
        planObra={panelOt ? (planPorObra.get(panelOt.id) ?? null) : null}
        hoy={hoyISO}
        navegacion={
          panelIndiceBandeja < 0
            ? null
            : {
                anterior:
                  panelIndiceBandeja > 0 ? () => abrirPanel(ordenBandeja[panelIndiceBandeja - 1], null) : null,
                siguiente:
                  panelIndiceBandeja < ordenBandeja.length - 1
                    ? () => abrirPanel(ordenBandeja[panelIndiceBandeja + 1], null)
                    : null,
              }
        }
        // PLANIFICAR SIN ARRASTRAR, por la misma función que el drop: reparte las mismas
        // jornadas pendientes, saltea el domingo y avisa el piso de la ventana igual.
        onPlanificar={(cuadrillaId, fecha) => {
          if (!panelOt) return;
          asignarObra(panelOt.id, cuadrillaId, fecha);
          setPanel({ otId: panelOt.id, bloqueKey: null, seguir: true });
          scrollAFecha(fecha);
        }}
        // Mismo destino que el menú de duración de la bandeja: el plan de Operaciones.
        onDuracion={(jornadas) => {
          if (!panelOt) return;
          fijarPlan.mutate({
            otId: panelOt.id,
            jornadas,
            motivo:
              jornadas < 1
                ? `Operaciones la dejó en ${Math.round(jornadas * 8 * 10) / 10} h desde la ficha.`
                : `Operaciones la dejó en ${jornadas} jornada${jornadas === 1 ? "" : "s"} desde la ficha.`,
          });
        }}
        onVerEnTablero={
          !panelBloque && panelPrimerBloque
            ? () => {
                const b = panelPrimerBloque;
                cerrarPanel();
                setResaltado({ key: b.key, desde: Date.now() });
                scrollAFecha(b.fechas[0]);
              }
            : null
        }
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
        apoyo={panelApoyo}
        onSumarApoyo={(cuadrillaId, fechas, fraccion) => panelOt && sumarApoyo(panelOt.id, cuadrillaId, fechas, fraccion)}
        onQuitarApoyo={(_apoyo, ids) => quitarApoyos(asignacionesDe(ids))}
        onHacerPrincipal={(apoyoId) => {
          const dia = data.asignaciones.find((a) => a.id === apoyoId)?.fecha ?? null;
          hacerPrincipal(apoyoId);
          if (panelOt) setPanel({ otId: panelOt.id, bloqueKey: null, seguir: true, dia });
        }}
        onOpenChange={(abierto) => !abierto && cerrarPanel()}
        comodin={panelOt ? (comodinPorOt.get(panelOt.id) ?? null) : null}
        // La ficha y el diálogo son dos modales: se cierra la ficha antes de abrirlo.
        onMeterUrgente={() => {
          if (!panelOt) return;
          const ot = panelOt;
          cerrarPanel();
          setUrgenteDe(ot);
        }}
      />

      <FichaGuardia
        guardia={fichaGuardia}
        eventos={guardiasData?.eventos ?? []}
        solicitudes={guardiasData?.solicitudes ?? []}
        sigla={siglaDe}
        relleno={fichaGuardia ? (relleno.get(fichaGuardia.id) ?? "Depósito") : "Depósito"}
        destinos={fichaResumen ? destinosDe(fichaResumen) : []}
        hoy={hoyBa}
        puedeAutorizar={puedeAutorizar}
        usuarioId={usuario?.id ?? null}
        onCorrer={(d) => {
          if (!fichaGuardia) return;
          correrGuardia(fichaGuardia.id, d.cuadrillaId, d.fecha);
          setFichaGuardiaId(null);
          scrollAFecha(d.fecha);
        }}
        onPedirSacar={() => fichaGuardia && abrirSacar(fichaGuardia.id, "pedir")}
        onSacar={() => fichaGuardia && abrirSacar(fichaGuardia.id, "sacar")}
        onOpenChange={(abierto) => !abierto && setFichaGuardiaId(null)}
      />

      <DialogoPedirAutorizacion
        pedido={pedidoAutorizacion}
        onCerrar={() => setPedidoAutorizacion(null)}
        // JS autorizó lo suyo y se ejecutó: el mismo "Deshacer" que si lo hubiera usado sola.
        onUsada={(uso, p) =>
          p.pedido &&
          ofrecerDeshacerUso(uso, {
            otId: p.pedido.otId,
            guardiaIds: uso.guardiaIds,
            crear: p.pedido.crear,
            mover: p.pedido.mover,
            volver: p.volver,
          })
        }
      />

      <DialogoMeterUrgente
        ot={urgenteDe}
        guardiaCercana={guardiaCercana}
        onIr={(g) => irAGuardia(g.guardiaId, g.fecha)}
        onCerrar={() => setUrgenteDe(null)}
      />
    </div>
  );
}
