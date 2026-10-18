"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { Feriado } from "@/lib/feriados/argentina";
import { fechasDeJornadas } from "@/lib/tablero/bloques";
import { esApoyo } from "@/lib/tablero/apoyo";
import { CLAVE_CONFIRMACIONES } from "@/hooks/use-confirmaciones";
import { CLAVE_ACTIVIDAD } from "@/hooks/use-actividad";
import { CLAVE_SUSPENSIONES } from "@/hooks/use-suspensiones";
import { avisarCambio } from "@/lib/tablero/avisos";
import type { RegistroConfirmacion } from "@/lib/tablero/tipos-confirmacion";
import type { RechazoCandado } from "@/lib/tablero/guardias-tipos";
import type { RegistroApoyoCorrida, RegistroCorrida, RegistroMovimiento } from "@/lib/tablero/tipos-movimiento";
import type {
  AsignacionTablero,
  CambioAsignacion,
  MovimientoAsignacion,
  NuevaAsignacion,
  CambioTarea,
  NuevaTarea,
  TableroPayload,
} from "@/lib/tablero/tipos";

// Acceso al Tablero de Planificación. Todo pasa por /api/planificacion, que habla con
// Odoo server-side: la app no tiene base de datos propia para las asignaciones.
//
// DECISIÓN (UX): las escrituras son optimistas. El tablero se edita en ráfagas y
// esperar el round-trip a Odoo por cada arrastre lo haría inusable. Si la escritura
// falla, se revierte el cambio en pantalla y se avisa con un toast.

const CLAVE = ["tablero"] as const;

/** La clave raíz del payload de asignaciones. La exporta para use-guardias, que escribe ahí. */
export const CLAVE_TABLERO = CLAVE;

/**
 * Las guardias y los pedidos a JS (guardias-contrato.md) viven en CLAVES PROPIAS y no bajo
 * ["tablero"]: aplicarOptimista reescribe todo lo que cuelga de esa clave como si fuera el
 * payload de asignaciones (la regla del módulo, ver handoff.md). Las activas igual viajan
 * en el tablero —son tareas tipo 'guardia'— y ésas sí se tocan optimistas ahí.
 *
 * Se declaran ACÁ y no en use-guardias porque las invalida también useCorrerDia (la lluvia
 * consume guardias), y use-guardias importa de este archivo: así no hay import circular.
 */
export const CLAVE_GUARDIAS = ["guardias-tablero"] as const;
export const CLAVE_SOLICITUDES_GUARDIA = ["guardias-solicitudes"] as const;

export function claveTablero(desde: string, hasta: string) {
  return [...CLAVE, desde, hasta];
}

/**
 * El error de una ruta, CON SU CUERPO.
 *
 * Antes alcanzaba con el texto: todo error terminaba en un toast. Con las guardias un 409
 * puede ser un RechazoCandado (`codigo: "guardia"`), y eso no es un error para mostrar sino
 * una pregunta para hacer: "¿le pedís autorización a JS?". Para poder distinguirlo hay que
 * conservar el status y el cuerpo, no sólo el mensaje. Sigue siendo un Error: quien sólo
 * mira `.message` no se entera del cambio.
 */
export class ErrorApi extends Error {
  readonly status: number;
  readonly cuerpo: unknown;
  constructor(mensaje: string, status: number, cuerpo: unknown) {
    super(mensaje);
    this.name = "ErrorApi";
    this.status = status;
    this.cuerpo = cuerpo;
  }
}

/** Si el error es el 409 del candado de una guardia, su cuerpo; si no, null. */
export function rechazoDeGuardia(e: unknown): RechazoCandado | null {
  if (!(e instanceof ErrorApi) || e.status !== 409) return null;
  const c = e.cuerpo as Partial<RechazoCandado> | null;
  return c && c.codigo === "guardia" && typeof c.guardiaId === "number" ? (c as RechazoCandado) : null;
}

export async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ErrorApi(body?.error ?? `Error ${res.status}`, res.status, body);
  }
  return (await res.json()) as T;
}

// ── El 409 de una guardia, desde cualquier escritura ─────────────────────────
//
// EL TABLERO YA EVALÚA EL CANDADO ANTES DE SOLTAR (tablero-board, guardiasPisadas →
// evaluarCandado), así que el servidor no debería contestarlo nunca. Si lo contesta es
// porque la pantalla estaba vieja: otro puso o corrió una guardia y este tablero todavía no
// se enteró. Ahí un toast rojo con "Esa jornada es una guardia" deja al usuario sin salida;
// lo que corresponde es ofrecerle el mismo camino que si lo hubiera visto: pedirle a JS.
//
// El hook no sabe armar ese pedido ni abrir un diálogo, así que avisa a quien escuche —el
// board— con lo que intentó escribir. Sin nadie escuchando, cae al toast de siempre.

/** Lo que una escritura intentó cuando el servidor la frenó por una guardia. */
export type RechazoEnEscritura = {
  rechazo: RechazoCandado;
  /** Cuando la escritura ya era un uso de guardia: lo que se pidió, entero. */
  otId?: number;
  guardiaIds?: number[];
  crear?: NuevaAsignacion[];
  mover?: MovimientoAsignacion[];
  registro?: RegistroMovimiento;
};

const oyentesRechazo = new Set<(r: RechazoEnEscritura) => void>();

/** El board se anota al montarse. Devuelve cómo darse de baja. */
export function escucharRechazosGuardia(oyente: (r: RechazoEnEscritura) => void): () => void {
  oyentesRechazo.add(oyente);
  return () => {
    oyentesRechazo.delete(oyente);
  };
}

/** true si el error era de una guardia y alguien se hizo cargo (no hace falta el toast). */
export function avisarRechazoGuardia(
  error: unknown,
  intento: Omit<RechazoEnEscritura, "rechazo"> = {},
): boolean {
  const rechazo = rechazoDeGuardia(error);
  if (!rechazo || oyentesRechazo.size === 0) return false;
  for (const o of oyentesRechazo) o({ rechazo, ...intento });
  return true;
}

/**
 * Fechas de todas las jornadas de una obra, fuera del rango cargado. No es una query: se
 * pide una vez al hacer clic en el buscador y no hay nada que mantener fresco.
 */
export async function fechasDeObra(otId: number): Promise<string[]> {
  const { fechas } = await pedir<{ fechas: string[] }>(`/api/planificacion/fechas-ot?otId=${otId}`);
  return fechas;
}

export function useTablero(
  desde: string,
  hasta: string,
  /**
   * Releer solo cada 2 minutos y al volver a la pestaña. El tablero NO lo usa —ahí cada
   * mutación propia ya invalida, y Odoo limita las consultas concurrentes—; lo usa el panel
   * de planificación de Habilitaciones, que puede quedar abierto todo el día sin escribir
   * nada, y sin esto mostraría para siempre lo que había al abrirlo.
   */
  opts: { refrescoAutomatico?: boolean } = {},
) {
  return useQuery({
    queryKey: claveTablero(desde, hasta),
    queryFn: () =>
      pedir<TableroPayload>(`/api/planificacion/tablero?desde=${desde}&hasta=${hasta}`),
    enabled: !!desde && !!hasta,
    // CRÍTICO para el scroll horizontal: al llegar al borde el tablero amplía el rango,
    // y eso cambia la queryKey. Sin esto `data` vuelve a undefined, el board cae al
    // skeleton, la grilla SE DESMONTA y el scroll se pierde; al remontar arranca en 0,
    // que es otra vez el borde, y pide otra semana. Un lazo que se retroalimenta.
    // Conservando los datos previos la grilla nunca se desmonta y el scroll queda quieto.
    placeholderData: keepPreviousData,
    // MEDIO MINUTO DE VIGENCIA. El payload del tablero son seis lecturas a Odoo (~500 ms a
    // 1,2 s medidos), y sin esto se repetían enteras cada vez que alguien vuelve del panel
    // de una OT, de habilitaciones o de órdenes. Volver es lo que más se hace.
    //
    // Es corto a propósito y no un minuto como en las otras pantallas: el tablero es
    // COMPARTIDO y lo edita más de una persona a la vez. Media hora de datos viejos acá
    // sería que dos personas planifiquen sobre estados distintos.
    //
    // Lo que uno mismo escribe no espera: cada mutación invalida esta query.
    staleTime: 30_000,
    // AL VOLVER A LA PESTAÑA SÍ, siempre. Es la red de seguridad de los avisos en vivo
    // (ver use-avisos-tablero): un aviso que se perdió porque a alguien se le cortó el
    // wifi no deja la pantalla desactualizada para siempre. Y es barato justamente porque
    // no es periódico — cuesta cuando alguien vuelve a mirar, que es cuando importa.
    //
    // Es el caso exacto del 21/09: Juan volvió al tablero después de un rato con datos de
    // dieciséis minutos antes. Sólo con esto ya se habría enterado al volver.
    refetchOnWindowFocus: true,
    // EL INTERVALO QUEDA APAGADO EN EL TABLERO y no hace falta: los cambios de los demás
    // llegan por aviso en vivo, que avisa en ~180 ms en vez de esperar dos minutos y no
    // consulta nada cuando no pasó nada. Preguntar cada dos minutos costaba seis lecturas
    // y ~1,2 s por pantalla hubiera o no novedades.
    // Sigue disponible para quien lo pida (el panel de Habilitaciones lo usa), y sólo con
    // la pestaña a la vista: una olvidada de fondo no le pega a Odoo.
    refetchInterval: opts.refrescoAutomatico ? 120_000 : false,
    refetchIntervalInBackground: false,
    retry: 2,
    retryDelay: (intento) => 800 * 2 ** intento,
  });
}

/**
 * Feriados nacionales del rango visible.
 *
 * Query aparte de la del tablero: cambian una vez al año, no dependen de Odoo y no
 * tienen por qué volver a pedirse cada vez que se refresca la semana. Si la API de
 * terceros no contesta, el servidor devuelve el respaldo local, así que esto no falla.
 */
export function useFeriados(desde: string, hasta: string) {
  // Se piden los AÑOS completos, no el rango exacto: el rango del tablero crece al
  // scrollear, y cachear por año con datos recortados al rango viejo dejaría feriados
  // afuera sin volver a preguntar. Un año entero son 19 fechas.
  const anios: [string, string] = [`${desde.slice(0, 4)}-01-01`, `${hasta.slice(0, 4)}-12-31`];
  return useQuery({
    queryKey: ["feriados", ...anios],
    queryFn: () => pedir<{ feriados: Feriado[] }>(`/api/feriados?desde=${anios[0]}&hasta=${anios[1]}`),
    enabled: !!desde && !!hasta,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

// ── Andamiaje de las mutaciones optimistas ───────────────────────────────────

export type Contexto = {
  previos: [readonly unknown[], TableroPayload | undefined][];
  /** Ids temporales que creó esta mutación, en el orden en que se pidieron. */
  temporales?: number[];
};

/**
 * Aplica un cambio a todas las semanas cacheadas y devuelve el snapshot para revertir.
 *
 * Exportada para use-guardias: usar una guardia es una escritura más sobre el MISMO array
 * (la tarjeta de la guardia se va y entra la obra), y tiene que revertir igual que el resto.
 */
export async function aplicarOptimista(
  qc: QueryClient,
  fn: (data: TableroPayload) => TableroPayload,
): Promise<Contexto> {
  await qc.cancelQueries({ queryKey: CLAVE });
  const previos = qc.getQueriesData<TableroPayload>({ queryKey: CLAVE });
  qc.setQueriesData<TableroPayload>({ queryKey: CLAVE }, (data) => (data ? fn(data) : data));
  return { previos };
}

/**
 * Vuelve la pantalla atrás. Con `silencioso` no muestra el toast: es el caso del 409 de una
 * guardia que ya atendió el board (ofrece pedir autorización en vez de un error rojo).
 */
export function revertir(
  qc: QueryClient,
  ctx: Contexto | undefined,
  mensaje: string,
  error: Error,
  silencioso = false,
) {
  for (const [clave, data] of ctx?.previos ?? []) qc.setQueryData(clave, data);
  if (!silencioso) toast.error(mensaje, { description: error.message });
  // Cuando algo falla el refresco NO se agrupa: la pantalla acaba de volver atrás y hay
  // que saber ya qué quedó realmente escrito en Odoo. Agrupar está bien mientras todo
  // sale bien, que es el caso normal.
  void qc.invalidateQueries({ queryKey: CLAVE });
  // Un 409 de guardia quiere decir que la pantalla no sabía de esa guardia: se relee también.
  if (rechazoDeGuardia(error)) void qc.invalidateQueries({ queryKey: CLAVE_GUARDIAS });
}

/** Suma una jornada al avance de cada OT indicada (crea la entrada si no estaba). */
export function sumarProgreso(progreso: TableroPayload["progreso"], otIds: number[]) {
  const mapa = new Map(progreso.map((p) => [p.otId, { ...p }]));
  for (const otId of otIds) {
    const actual = mapa.get(otId) ?? { otId, asignadas: 0, cerradas: 0 };
    mapa.set(otId, { ...actual, asignadas: actual.asignadas + 1 });
  }
  return [...mapa.values()];
}

/** Resta una jornada del avance por cada asignación borrada. */
export function restarProgreso(progreso: TableroPayload["progreso"], otIds: number[]) {
  const mapa = new Map(progreso.map((p) => [p.otId, { ...p }]));
  for (const otId of otIds) {
    const actual = mapa.get(otId);
    if (actual) mapa.set(otId, { ...actual, asignadas: Math.max(0, actual.asignadas - 1) });
  }
  return [...mapa.values()].filter((p) => p.asignadas > 0 || p.cerradas > 0);
}

// Ids temporales para las tarjetas que todavía no existen en Odoo. Negativos para no
// chocar nunca con un id real.
let proximoIdTemporal = -1;

/** Un id temporal nuevo. Lo usa use-guardias para las jornadas que crea al usar una guardia. */
export function nuevoIdTemporal(): number {
  return proximoIdTemporal--;
}

/**
 * Refresco de fondo contra Odoo, AGRUPADO.
 *
 * Antes cada escritura invalidaba al terminar, y planificar es una ráfaga de arrastres:
 * eran N consultas de ~49 KB y ~1,4 s cada una contra una Odoo Online que limita la
 * concurrencia, encoladas una atrás de la otra.
 *
 * No es lo que pinta la pantalla —todas las mutaciones son optimistas y exactas, ids
 * reales incluidos— sino la red que trae lo que hayan tocado otros. Así que puede
 * esperar a que la mano pare, y ahí se hace una sola.
 *
 * ARRASTRA TAMBIÉN LA ACTIVIDAD, porque toda escritura del tablero deja un movimiento
 * registrado. Va acá y no en cada mutación por lo mismo que el tablero: en una ráfaga de
 * diez arrastres se pide una vez, no diez. Con el panel cerrado la consulta está
 * deshabilitada, así que invalidar sólo la marca vieja y no pide nada hasta que alguien
 * la abre.
 */
let refrescoPendiente: ReturnType<typeof setTimeout> | null = null;
const ESPERA_REFRESCO = 1500;

export function refrescarPronto(qc: QueryClient) {
  if (refrescoPendiente) clearTimeout(refrescoPendiente);
  refrescoPendiente = setTimeout(() => {
    refrescoPendiente = null;
    void qc.invalidateQueries({ queryKey: CLAVE });
    void qc.invalidateQueries({ queryKey: CLAVE_ACTIVIDAD });
  }, ESPERA_REFRESCO);
}

// ── Mutaciones ───────────────────────────────────────────────────────────────

export function useCrearAsignaciones() {
  const qc = useQueryClient();
  return useMutation<
    { ids: number[]; movimientoId?: string | null },
    Error,
    { asignaciones: NuevaAsignacion[]; registro?: RegistroMovimiento },
    Contexto
  >({
    mutationFn: (body) =>
      pedir<{ ids: number[]; movimientoId?: string | null }>("/api/planificacion/asignaciones", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onMutate: async ({ asignaciones }) => {
      const temporales = asignaciones.map(() => proximoIdTemporal--);
      const nuevas: AsignacionTablero[] = asignaciones.map((a, i) => ({
        id: temporales[i],
        otId: a.otId,
        fecha: a.fecha,
        cuadrillaId: a.cuadrillaId,
        fraccion: Number(a.fraccion),
        estado: a.estado,
        ordenDia: a.ordenDia,
        notas: a.notas ?? null,
        // Una asignación recién creada nunca nace cerrada.
        parteId: null,
        // Ni fija: se planifica primero y se clava después, si hay motivo.
        motivoFija: null,
        apoyo: a.apoyo === true,
      }));
      const ctx = await aplicarOptimista(qc, (data) => ({
        ...data,
        asignaciones: [...data.asignaciones, ...nuevas],
        // Un apoyo no suma días a la obra (apoyo.md): el avance sólo cuenta principales.
        progreso: sumarProgreso(data.progreso, nuevas.filter((n) => !esApoyo(n)).map((n) => n.otId)),
      }));
      return { ...ctx, temporales };
    },
    /**
     * Los ids reales entran en cuanto Odoo contesta, sin esperar al refetch.
     *
     * Es la mitad de lo que se sentía como "queda cargando": la tarjeta se bloquea
     * mientras tenga ids negativos (ver `guardando` en TarjetaAsignacion — no se puede
     * arrastrar, sin menú, cursor de reloj), y antes esos ids negativos vivían hasta que
     * volvía el tablero entero. O sea que se esperaban ~1,4 s por una respuesta que ya
     * teníamos en la mano: el POST devuelve los ids creados.
     */
    onSuccess: ({ ids }, { registro }, ctx) => {
      avisarCambio("planificó", registro?.otTitulo);
      const temporales = ctx?.temporales ?? [];
      // Odoo devuelve los ids en el mismo orden en que se mandaron los valores. Si las
      // longitudes no coinciden no se adivina el emparejamiento: se deja que el refresco
      // de fondo traiga la verdad, en vez de dejar tarjetas apuntando a otra fila.
      if (ids.length !== temporales.length) return;
      const real = new Map(temporales.map((t, i) => [t, ids[i]]));
      qc.setQueriesData<TableroPayload>({ queryKey: CLAVE }, (data) =>
        data
          ? {
              ...data,
              asignaciones: data.asignaciones.map((a) =>
                real.has(a.id) ? { ...a, id: real.get(a.id) as number } : a,
              ),
            }
          : data,
      );
    },
    onError: (error, { asignaciones, registro }, ctx) =>
      revertir(
        qc,
        ctx,
        "No se pudo asignar",
        error,
        avisarRechazoGuardia(error, { crear: asignaciones, registro }),
      ),
    onSettled: () => refrescarPronto(qc),
  });
}

/**
 * Cómo se lee el gesto en la pantalla de los demás. Un solo cambio por vez: el tablero
 * manda una cosa por PATCH, no un combo.
 */
function accionDeCambio(c: CambioAsignacion): string {
  if (c.estado) return c.estado === "confirmada" ? "confirmó" : "volvió a tentativa";
  if (c.fraccion !== undefined) return "cambió la duración de";
  if (c.motivoFija !== undefined) return c.motivoFija ? "fijó" : "soltó";
  if (c.notas !== undefined) return "dejó una nota en";
  if (c.fecha !== undefined || c.cuadrillaId !== undefined) return "movió";
  return "cambió";
}

export function useActualizarAsignaciones() {
  const qc = useQueryClient();
  return useMutation<
    { ok: true; registrado?: boolean; movimientoId?: string | null },
    Error,
    // `contexto` sólo viaja al cambiar el ESTADO: dice de qué obra y de qué días son
    // estos ids, para que el servidor pueda anotar quién confirmó sin releer Odoo.
    {
      ids: number[];
      cambio: CambioAsignacion;
      contexto?: RegistroConfirmacion;
      registro?: RegistroMovimiento;
      /**
       * Qué obra es, para la línea que ven los demás. SE QUEDA EN EL NAVEGADOR: no va en
       * el body, porque el servidor no lo necesita —ya tiene los ids— y mandarle un dato
       * de presentación sería darle otra cosa que validar. El cambio de estado es el
       * único gesto que no lleva `registro`, así que sin esto el aviso diría "confirmó
       * una jornada" justo en el caso que motivó todo esto.
       */
      obra?: string | null;
    },
    Contexto
  >({
    // El body se arma campo por campo y no con un spread: así se ve de un vistazo qué
    // viaja al servidor, y `obra` —que es sólo para el aviso a los demás— no se cuela.
    mutationFn: ({ ids, cambio, contexto, registro }) =>
      pedir<{ ok: true; registrado?: boolean; movimientoId?: string | null }>("/api/planificacion/asignaciones", {
        method: "PATCH",
        body: JSON.stringify({ ids, cambio, contexto, registro }),
      }),
    onMutate: ({ ids, cambio }) =>
      aplicarOptimista(qc, (data) => ({
        ...data,
        asignaciones: data.asignaciones.map((a) =>
          ids.includes(a.id)
            ? {
                ...a,
                ...(cambio.fecha !== undefined ? { fecha: cambio.fecha } : {}),
                ...(cambio.cuadrillaId !== undefined ? { cuadrillaId: cambio.cuadrillaId } : {}),
                ...(cambio.fraccion !== undefined ? { fraccion: Number(cambio.fraccion) } : {}),
                ...(cambio.estado !== undefined ? { estado: cambio.estado } : {}),
                ...(cambio.ordenDia !== undefined ? { ordenDia: cambio.ordenDia } : {}),
                ...(cambio.notas !== undefined ? { notas: cambio.notas ?? null } : {}),
                ...(cambio.motivoFija !== undefined
                  ? { motivoFija: cambio.motivoFija || null }
                  : {}),
                ...(cambio.apoyo !== undefined ? { apoyo: cambio.apoyo } : {}),
              }
            : a,
        ),
      })),
    onSuccess: ({ registrado }, { cambio, contexto, registro, obra }) => {
      avisarCambio(accionDeCambio(cambio), obra ?? registro?.otTitulo);
      if (!cambio.estado || !contexto) return;
      // El historial del panel cambió: se vuelve a pedir sólo el de esta obra.
      void qc.invalidateQueries({ queryKey: [...CLAVE_CONFIRMACIONES, contexto.otId] });
      // El estado SÍ cambió en Odoo pero el registro no se pudo escribir. Se avisa en vez
      // de dejarlo pasar: una auditoría con agujeros silenciosos no sirve de auditoría.
      if (registrado === false) {
        toast.warning("La jornada cambió de estado, pero no quedó registrado quién lo hizo", {
          description: "El cambio está guardado en Odoo. El historial de confirmaciones de esta obra va a tener un hueco.",
        });
      }
    },
    onError: (error, _vars, ctx) => revertir(qc, ctx, "No se pudo guardar el cambio", error),
    onSettled: () => refrescarPronto(qc),
  });
}

/** Mover un bloque: cada jornada a su nueva fecha, todas juntas. */
export function useMoverAsignaciones() {
  const qc = useQueryClient();
  return useMutation<
    { ok: true; movimientoId?: string | null },
    Error,
    { movimientos: MovimientoAsignacion[]; registro?: RegistroMovimiento },
    Contexto
  >({
    mutationFn: (body) =>
      pedir<{ ok: true; movimientoId?: string | null }>("/api/planificacion/asignaciones", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onMutate: ({ movimientos }) => {
      const porId = new Map(movimientos.map((m) => [m.id, m]));
      return aplicarOptimista(qc, (data) => ({
        ...data,
        asignaciones: data.asignaciones.map((a) => {
          const m = porId.get(a.id);
          if (!m) return a;
          return {
            ...a,
            fecha: m.fecha,
            ...(m.cuadrillaId !== undefined ? { cuadrillaId: m.cuadrillaId } : {}),
            ...(m.ordenDia !== undefined ? { ordenDia: m.ordenDia } : {}),
          };
        }),
      }));
    },
    onSuccess: (_d, { registro }) => avisarCambio("movió", registro?.otTitulo),
    onError: (error, { movimientos, registro }, ctx) =>
      revertir(
        qc,
        ctx,
        "No se pudo mover la obra",
        error,
        avisarRechazoGuardia(error, { mover: movimientos, registro }),
      ),
    onSettled: () => refrescarPronto(qc),
  });
}

/**
 * "Hacer principal" (apoyo.md): un rol por id, todo en una request.
 *
 * El avance no se toca: la obra sigue teniendo los mismos días, cambia quién la lleva.
 */
export function useCambiarRoles() {
  const qc = useQueryClient();
  return useMutation<
    { ok: true; movimientoId?: string | null },
    Error,
    { roles: { id: number; apoyo: boolean }[]; registro?: RegistroMovimiento },
    Contexto
  >({
    mutationFn: (body) =>
      pedir<{ ok: true; movimientoId?: string | null }>("/api/planificacion/asignaciones", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onMutate: ({ roles }) => {
      const porId = new Map(roles.map((r) => [r.id, r.apoyo]));
      return aplicarOptimista(qc, (data) => ({
        ...data,
        asignaciones: data.asignaciones.map((a) => (porId.has(a.id) ? { ...a, apoyo: porId.get(a.id) } : a)),
      }));
    },
    onSuccess: (_d, { registro }) => avisarCambio("cambió la cuadrilla principal de", registro?.otTitulo),
    onError: (error, _vars, ctx) => revertir(qc, ctx, "No se pudo cambiar la principal", error),
    onSettled: () => refrescarPronto(qc),
  });
}

/**
 * Correr un día: muchas jornadas de muchas obras, en un solo gesto.
 *
 * NO REVIERTE CUANDO FALLA, a diferencia de todas las demás. Las otras mandan una
 * escritura y si rebota no pasó nada, así que devolver la pantalla al estado anterior la
 * deja diciendo la verdad. Ésta manda una escritura POR FECHA DESTINO: si la tercera
 * falla, las dos primeras ya se aplicaron en Odoo, y volver atrás la pantalla entera
 * mostraría un plan que ya no existe. Se pide el tablero de nuevo, que es lo único que
 * sabe cómo quedó — y el error se avisa igual.
 */
export function useCorrerDia() {
  const qc = useQueryClient();
  return useMutation<
    {
      ok: true;
      escrituras: number;
      loteId: string | null;
      filas: Record<string, string>;
      /**
       * Las guardias que el servidor consumió de verdad (guardias-contrato.md §1.4). Puede
       * diferir de lo que mandó el tablero: el servidor es la autoridad y consume también las
       * que la pantalla no veía. Es lo que el deshacer tiene que reactivar.
       */
      guardiasConsumidas?: number[];
    },
    Error,
    {
      motivo: string;
      movimientos: MovimientoAsignacion[];
      registros: RegistroCorrida[];
      /** Apoyos que se quitan (su cuadrilla no sale y la principal sí). Ver corrimiento.ts. */
      quitar?: number[];
      /** Deshacer: esos apoyos, vueltos a crear. */
      crear?: NuevaAsignacion[];
      registrosApoyo?: RegistroApoyoCorrida[];
      deshaceA?: Record<string, string>;
      suspension?: { dia: string; cuadrillaIds: number[] };
      levantaLote?: string;
      /**
       * Las guardias que el plan hace caer bajo lo que se corre: lo que cae las REEMPLAZA y
       * pasan a "usada (lluvia)" (guardias-contrato.md §1.4). Es lo que vio el tablero; el
       * servidor igual busca y consume las que haya.
       */
      consumirGuardias?: number[];
      /** Deshacer: esas guardias vuelven a "activa". */
      reactivarGuardias?: number[];
    },
    Contexto
  >({
    mutationFn: (body) =>
      pedir<{
        ok: true;
        escrituras: number;
        loteId: string | null;
        filas: Record<string, string>;
        guardiasConsumidas?: number[];
      }>("/api/planificacion/corrimiento", { method: "POST", body: JSON.stringify(body) }),
    onMutate: ({ movimientos, quitar, consumirGuardias }) => {
      const porId = new Map(movimientos.map((m) => [m.id, m.fecha]));
      // Los apoyos quitados salen ya; los recreados del deshacer aparecen con el refresco
      // (no tienen id hasta que Odoo los crea). Los apoyos no tocan el avance.
      //
      // LAS GUARDIAS CONSUMIDAS TAMBIÉN SALEN YA: la obra que cae encima las reemplaza, y
      // dejarlas hasta el refresco mostraría por un segundo la obra apilada sobre la guardia
      // —justo lo que la regla dice que no pasa—. Las reactivadas por el deshacer vuelven
      // con el refresco, igual que los apoyos recreados.
      const fuera = new Set(quitar ?? []);
      const guardiasFuera = new Set(consumirGuardias ?? []);
      return aplicarOptimista(qc, (data) => ({
        ...data,
        asignaciones: data.asignaciones
          .filter((a) => !fuera.has(a.id))
          .filter((a) => !(a.origen === "tarea" && guardiasFuera.has(a.id)))
          .map((a) => {
            const fecha = porId.get(a.id);
            return fecha ? { ...a, fecha } : a;
          }),
      }));
    },
    onSuccess: () => avisarCambio("corrió un día del tablero"),
    onError: (error) => {
      toast.error("El corrimiento quedó a medias", {
        description: `${error.message} · Se vuelve a pedir el tablero para ver cómo quedó.`,
      });
      void qc.invalidateQueries({ queryKey: CLAVE });
      void qc.invalidateQueries({ queryKey: CLAVE_ACTIVIDAD });
    },
    onSettled: () => {
      refrescarPronto(qc);
      void qc.invalidateQueries({ queryKey: CLAVE_SUSPENSIONES });
      // La lluvia usa y el deshacer reactiva guardias: su historia y el indicador cambian.
      void qc.invalidateQueries({ queryKey: CLAVE_GUARDIAS });
    },
  });
}

export function useBorrarAsignaciones() {
  const qc = useQueryClient();
  return useMutation<
    { ok: true; movimientoId?: string | null },
    Error,
    { ids: number[]; registro?: RegistroMovimiento },
    Contexto
  >({
    mutationFn: (body) =>
      pedir<{ ok: true; movimientoId?: string | null }>("/api/planificacion/asignaciones", {
        method: "DELETE",
        body: JSON.stringify(body),
      }),
    onMutate: ({ ids }) =>
      aplicarOptimista(qc, (data) => {
        const borradas = data.asignaciones.filter((a) => ids.includes(a.id));
        return {
          ...data,
          asignaciones: data.asignaciones.filter((a) => !ids.includes(a.id)),
          // Liberar jornadas devuelve la obra a la bandeja con su remanente: el avance
          // baja en la cantidad de jornadas liberadas, no de golpe a cero.
          // Los apoyos no restan: nunca sumaron (apoyo.md).
          progreso: restarProgreso(data.progreso, borradas.filter((a) => !esApoyo(a)).map((a) => a.otId)),
        };
      }),
    onSuccess: (_d, { registro }) => avisarCambio("quitó del tablero", registro?.otTitulo),
    onError: (error, _vars, ctx) => revertir(qc, ctx, "No se pudo quitar del tablero", error),
    onSettled: () => refrescarPronto(qc),
  });
}

// ── Tarjetas de operaciones ──────────────────────────────────────────────────
//
// Van a /api/planificacion/tareas (Supabase) en vez de /asignaciones (Odoo), pero
// escriben en el MISMO array optimista: en la caché una tarea es una asignación más, y
// tiene que serlo para que la capacidad de la celda y los bloques la vean. Lo único que
// cambia es a qué endpoint viaja.
//
// Qué operación corresponde a cuál la decide el board mirando `bloque.origen`.

export function useCrearTarea() {
  const qc = useQueryClient();
  return useMutation<
    { ids: number[] },
    Error,
    NuevaTarea & { dias?: number },
    Contexto
  >({
    mutationFn: (tarea) =>
      pedir<{ ids: number[] }>("/api/planificacion/tareas", {
        method: "POST",
        body: JSON.stringify(tarea),
      }),
    onMutate: (tarea) => {
      // El grupo real lo asigna Supabase; hasta que vuelva, los días comparten un grupo
      // temporal negativo para que ya se dibujen como una sola tarjeta.
      const grupoTemporal = proximoIdTemporal--;
      const fechas = fechasDeJornadas(tarea.fecha, tarea.dias ?? 1, { permitirDomingo: true });
      const nuevas: AsignacionTablero[] = fechas.map((fecha) => ({
        id: proximoIdTemporal--,
        origen: "tarea",
        otId: 0,
        tarea: {
          grupoId: grupoTemporal,
          titulo: tarea.titulo,
          tipo: tarea.tipo,
          hecha: false,
        },
        fecha,
        cuadrillaId: tarea.cuadrillaId,
        fraccion: Number(tarea.fraccion),
        estado: "confirmada",
        ordenDia: tarea.ordenDia ?? 0,
        notas: tarea.notas ?? null,
        parteId: null,
        // Ver mapear() en src/lib/tablero/tareas.ts: una tarea todavía no se puede fijar.
        motivoFija: null,
      }));
      // Sin tocar `progreso`: eso cuenta jornadas de OBRAS y una tarea no es una.
      return aplicarOptimista(qc, (data) => ({
        ...data,
        asignaciones: [...data.asignaciones, ...nuevas],
      }));
    },
    onSuccess: (_d, tarea) => avisarCambio("agregó una tarea", tarea.titulo),
    onError: (error, _vars, ctx) => revertir(qc, ctx, "No se pudo crear la tarea", error),
    onSettled: () => refrescarPronto(qc),
  });
}

export function useActualizarTareas() {
  const qc = useQueryClient();
  return useMutation<
    { ok: true },
    Error,
    { ids: number[]; cambio: CambioTarea } | { grupoId: number; cambio: CambioTarea },
    Contexto
  >({
    mutationFn: (body) =>
      pedir<{ ok: true }>("/api/planificacion/tareas", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onMutate: (body) => {
      const { cambio } = body;
      // Renombrar toca todos los días de la tarea; cambiar la fracción, sólo los que se
      // pasaron. Por eso el filtro mira el grupo en un caso y los ids en el otro.
      const alcanza = (a: AsignacionTablero) =>
        "grupoId" in body ? a.tarea?.grupoId === body.grupoId : body.ids.includes(a.id);
      return aplicarOptimista(qc, (data) => ({
        ...data,
        asignaciones: data.asignaciones.map((a) =>
          a.origen === "tarea" && a.tarea && alcanza(a)
            ? {
                ...a,
                ...(cambio.fecha !== undefined ? { fecha: cambio.fecha } : {}),
                ...(cambio.cuadrillaId !== undefined ? { cuadrillaId: cambio.cuadrillaId } : {}),
                ...(cambio.fraccion !== undefined ? { fraccion: Number(cambio.fraccion) } : {}),
                ...(cambio.ordenDia !== undefined ? { ordenDia: cambio.ordenDia } : {}),
                ...(cambio.notas !== undefined ? { notas: cambio.notas ?? null } : {}),
                tarea: {
                  ...a.tarea,
                  ...(cambio.titulo !== undefined ? { titulo: cambio.titulo } : {}),
                  ...(cambio.tipo !== undefined ? { tipo: cambio.tipo } : {}),
                  ...(cambio.hecha !== undefined ? { hecha: cambio.hecha } : {}),
                },
              }
            : a,
        ),
      }));
    },
    onSuccess: () => avisarCambio("cambió una tarea"),
    onError: (error, _vars, ctx) => revertir(qc, ctx, "No se pudo guardar la tarea", error),
    onSettled: () => refrescarPronto(qc),
  });
}

/** Mover una tarjeta de operaciones: cada día a su nueva fecha y cuadrilla. */
export function useMoverTareas() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, MovimientoAsignacion[], Contexto>({
    mutationFn: (movimientos) =>
      pedir<{ ok: true }>("/api/planificacion/tareas", {
        method: "PATCH",
        body: JSON.stringify({ movimientos }),
      }),
    onMutate: (movimientos) => {
      const porId = new Map(movimientos.map((m) => [m.id, m]));
      return aplicarOptimista(qc, (data) => ({
        ...data,
        asignaciones: data.asignaciones.map((a) => {
          const m = a.origen === "tarea" ? porId.get(a.id) : undefined;
          if (!m) return a;
          return {
            ...a,
            fecha: m.fecha,
            ...(m.cuadrillaId !== undefined ? { cuadrillaId: m.cuadrillaId } : {}),
            ...(m.ordenDia !== undefined ? { ordenDia: m.ordenDia } : {}),
          };
        }),
      }));
    },
    onSuccess: () => avisarCambio("movió una tarea"),
    onError: (error, _vars, ctx) => revertir(qc, ctx, "No se pudo mover la tarea", error),
    onSettled: () => refrescarPronto(qc),
  });
}

export function useBorrarTareas() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, number[], Contexto>({
    mutationFn: (ids) =>
      pedir<{ ok: true }>("/api/planificacion/tareas", {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      }),
    onMutate: (ids) =>
      aplicarOptimista(qc, (data) => ({
        ...data,
        // Sin tocar `progreso`, por lo mismo que en el alta.
        asignaciones: data.asignaciones.filter(
          (a) => !(a.origen === "tarea" && ids.includes(a.id)),
        ),
      })),
    onSuccess: () => avisarCambio("borró una tarea"),
    onError: (error, _vars, ctx) => revertir(qc, ctx, "No se pudo borrar la tarea", error),
    onSettled: () => refrescarPronto(qc),
  });
}
