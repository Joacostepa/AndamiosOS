// Guardias y comodines: los tipos y las constantes que comparten la lógica pura, las rutas
// del servidor y la pantalla. Ver docs/tablero-planificacion/guardias-contrato.md (manda) y
// guardias-plan-tecnico.md (cómo se construye).
//
// VAN ACÁ, SEPARADOS DE LA LÓGICA, por lo mismo que tipos.ts y tipos-suspension.ts: el bundle
// del navegador los necesita y no puede arrastrar nada del servidor. Este archivo no importa
// nada que corra: sólo tipos.
//
// LAS DOS PALABRAS SON INTERNAS. "Guardia" es una jornada que el sistema reserva para lo
// imprevisto; "comodín", una obra que Planificación marcó porque puede ir cualquier día.
// Ninguna de las dos llega al capataz ni al cliente: el capataz recibe "Depósito ·
// mantenimiento de material" (ver TEXTO_GUARDIA_CAPATAZ) y el cliente no se entera de nada.
//
// DÓNDE VIVE UNA GUARDIA: es una fila de `tablero_tareas` con tipo 'guardia' (migración
// 20261018100001). Mientras está ACTIVA viaja en el payload del tablero como una tarea más
// —ocupa capacidad en la celda, en el riel, en "N de 6 j" y en el asistente sin que nadie
// tenga que enterarse— y su id es el mismo que el de esa AsignacionTablero. Usada,
// rellenada o sacada deja de viajar ahí (ya no ocupa nada) y queda sólo en la historia, que
// se lee aparte (GuardiasPayload, query key propia, NUNCA bajo ["tablero"]).

import type { EstadoBloque } from "./tipos-movimiento";
import type { MovimientoAsignacion, NuevaAsignacion } from "./tipos";

// ─── Constantes de la regla ────────────────────────────────────────────────────────────
//
// Un solo lugar para cada número: si a las 6 semanas se recalibra (guardias.md §7, etapa 4)
// se toca acá y nada más.

/** El `tipo` de la fila en tablero_tareas. No está en TIPOS_TAREA a propósito (ver tipos.ts). */
export const TIPO_GUARDIA = "guardia" as const;

/** Cuántas guardias pone el sistema por semana. Dos ranuras: 1 (martes) y 2 (jueves). */
export const GUARDIAS_POR_SEMANA = 2;

/**
 * El día preferido de cada ranura y los de repuesto, en orden. Son días de la semana ISO
 * (1 = lunes … 6 = sábado). "Para el martes: miércoles, lunes; para el jueves: miércoles,
 * viernes" (contrato §1.2).
 */
export const DIAS_DE_RANURA: Record<RanuraGuardia, readonly number[]> = {
  1: [2, 3, 1],
  2: [4, 3, 5],
};

/** Cuántas semanas hacia atrás mira la rotación ("la que menos guardias tuvo en las últimas 4"). */
export const SEMANAS_ROTACION = 4;

/** Una urgencia usa la guardia sin pedir nada si la OT se creó hace estos días hábiles o menos. */
export const DIAS_HABILES_URGENCIA = 3;

/** Desde esta hora (Argentina) del día hábil anterior, un comodín rellena la guardia sin pedir nada. */
export const HORA_RELLENO = 13;

/** Lo que ve el capataz el día de una guardia que nadie rellenó. Nunca la palabra "guardia". */
export const TEXTO_GUARDIA_CAPATAZ = "Depósito · mantenimiento de material";

/** El indicador de arriba mira estos días hábiles hacia adelante. */
export const DIAS_INDICADOR = 5;

// ─── La guardia ────────────────────────────────────────────────────────────────────────

export type RanuraGuardia = 1 | 2;

/**
 * activa    → reservada, ocupa la celda.
 * usada     → la tomó lo imprevisto (urgencia, lluvia, atraso) o, con permiso de JS, una
 *             obra común. La obra que la usa ocupa la celda.
 * rellenada → la rellenó un comodín desde las 13 h del día hábil anterior, o nadie la usó
 *             y el día pasó: la cuadrilla fue al depósito. Una rellenada con depósito SIGUE
 *             viajando en el tablero como tarea ("Depósito"), porque eso es lo que se hizo.
 * sacada    → JS la sacó (directo o aprobando un pedido). No se ve en la grilla; queda en la
 *             historia y su ranura no se repone esa semana.
 */
export type EstadoGuardia = "activa" | "usada" | "rellenada" | "sacada";

export type OrigenGuardia = "sistema" | "persona";

/**
 * Para qué se usó. `lluvia` sólo la pone el corrimiento; `obra_comun` sólo con permiso de
 * JS; `deposito` sólo el sistema, al día siguiente, cuando nadie la usó: la cuadrilla fue al
 * depósito (la corrida de las 13 h cierra las guardias de los días que ya pasaron). Antes de
 * eso la guardia sigue activa y protegida: confirmar el depósito "a mano" a las 13 h dejaría
 * una celda que ya no es guardia y en la que se podría apilar cualquier cosa.
 */
export type UsoGuardia = "urgencia" | "lluvia" | "atraso" | "comodin" | "obra_comun" | "deposito";

/** Qué estado deja cada uso. Lo imprevisto la "usa"; el relleno de último momento la "rellena". */
export const ESTADO_POR_USO: Record<UsoGuardia, "usada" | "rellenada"> = {
  urgencia: "usada",
  lluvia: "usada",
  atraso: "usada",
  obra_comun: "usada",
  comodin: "rellenada",
  deposito: "rellenada",
};

export const ETIQUETA_USO: Record<UsoGuardia, string> = {
  urgencia: "urgencia",
  lluvia: "lluvia",
  atraso: "armado atrasado",
  comodin: "comodín",
  obra_comun: "obra común",
  deposito: "depósito",
};

/** Una guardia, en cualquier estado. Es lo que trae GET /api/planificacion/guardias. */
export type Guardia = {
  /** El id de la fila de tablero_tareas. Activa, es también el id de su AsignacionTablero. */
  id: number;
  fecha: string; // yyyy-MM-dd
  cuadrillaId: number;
  /** El lunes de su semana. Nunca cambia: correrla es dentro de la misma semana. */
  semana: string;
  ranura: RanuraGuardia;
  estado: EstadoGuardia;
  origen: OrigenGuardia;
  /** null mientras está activa (o sacada). */
  uso: UsoGuardia | null;
  /** La OT que la usó o la rellenó. null si no hubo (activa, sacada, depósito, lluvia de varias). */
  otId: number | null;
  /** Las asignaciones de Odoo que ocupan su celda por haberla usado (para el chip "de guardia"). */
  asignacionIds: number[];
  /** Por qué está ahí, en una línea: "jueves le tocaba a la C3 por rotación". Lo escribe el sistema. */
  porQue: string | null;
  /** El lote de plan_movimientos del gesto que la usó (para el deshacer). */
  loteId: string | null;
  creadaAt: string;
  estadoAt: string | null;
  /** null = lo hizo el sistema. */
  estadoPorNombre: string | null;
  estadoMotivo: string | null;
  /**
   * El nombre de Odoo de la cuadrilla ("CUADRILLA 3"), SÓLO en las sacadas: no están en la
   * grilla y la bandeja de JS las lista sin el tablero cargado. En las demás, undefined (el
   * tablero ya tiene los nombres).
   */
  cuadrillaNombre?: string | null;
};

/** Lo mínimo de una guardia que necesitan las reglas puras. */
export type GuardiaResumen = Pick<Guardia, "id" | "fecha" | "cuadrillaId" | "semana" | "ranura" | "estado">;

export type AccionGuardia =
  | "poner" | "mover" | "usar" | "rellenar" | "reactivar" | "sacar"
  | "pedir" | "aprobar" | "rechazar" | "cancelar";

/** Una línea de la historia de la guardia (plan_guardia_eventos). */
export type EventoGuardia = {
  id: string;
  guardiaId: number;
  accion: AccionGuardia;
  estadoAntes: EstadoGuardia | null;
  estadoDespues: EstadoGuardia | null;
  uso: UsoGuardia | null;
  otId: number | null;
  otTitulo: string | null;
  de: { fecha: string; cuadrillaId: number } | null;
  a: { fecha: string; cuadrillaId: number } | null;
  motivo: string | null;
  loteId: string | null;
  solicitudId: string | null;
  /** null = el sistema. */
  autorNombre: string | null;
  at: string;
};

// ─── Pedidos de autorización ───────────────────────────────────────────────────────────

/** Lo que sólo JS puede autorizar (contrato §1.3). */
export type TipoSolicitud = "sacar" | "obra_comun" | "comodin_antes" | "urgencia_fuera_regla";

export const ETIQUETA_SOLICITUD: Record<TipoSolicitud, string> = {
  sacar: "Sacar la guardia",
  obra_comun: "Poner una obra común",
  comodin_antes: "Rellenar con un comodín antes de las 13 h",
  urgencia_fuera_regla: "Usarla para una urgencia que no cumple la regla",
};

export type EstadoSolicitud = "pendiente" | "aprobada" | "rechazada" | "cancelada";

export type SolicitudGuardia = {
  id: string;
  guardiaId: number;
  /**
   * Dónde está la guardia (al momento de leer). `cuadrillaNombre` es el nombre de Odoo
   * ("CUADRILLA 3"), para que la bandeja de JS diga "C3" sin leer el tablero entero; null si
   * Odoo no contestó (la bandeja dice "cuadrilla" y sigue).
   */
  guardia: { fecha: string; cuadrillaId: number; cuadrillaNombre: string | null; estado: EstadoGuardia };
  tipo: TipoSolicitud;
  otId: number | null;
  otTitulo: string | null;
  motivo: string;
  /** Lo que se ejecuta al aprobar. null en 'sacar'. */
  pedido: PedidoUsoGuardia | null;
  estado: EstadoSolicitud;
  pedidoPorId: string;
  pedidoPorNombre: string | null;
  pedidoAt: string;
  respondidoPorNombre: string | null;
  respondidoAt: string | null;
  respuesta: string | null;
  /** La acción pedida ya se hizo (al aprobar, o después con la habilitación). */
  ejecutadaAt: string | null;
  /** Aprobada pero no se pudo ejecutar sola (la grilla cambió): queda habilitada para quien pidió. */
  errorEjecucion: string | null;
};

/** GET /api/planificacion/guardias?desde&hasta → query key ["guardias-tablero", desde, hasta]. */
export type GuardiasPayload = {
  /** Las del rango, en TODOS los estados (las activas también vienen en el tablero). */
  guardias: Guardia[];
  /** La historia de esas guardias, la más nueva primero. */
  eventos: EventoGuardia[];
  /** Los pedidos de esas guardias (cualquier estado). La bandeja de JS usa su propia ruta. */
  solicitudes: SolicitudGuardia[];
};

// ─── Cuerpos de las rutas ──────────────────────────────────────────────────────────────

/** Lo que el tablero manda para que el gesto quede en plan_movimientos (como en asignaciones). */
export type RegistroUsoGuardia = {
  otId: number;
  otTitulo: string | null;
  accion: "crear" | "mover";
  antes: EstadoBloque | null;
  despues: EstadoBloque | null;
};

/**
 * POST /api/planificacion/guardias/usar — una obra REEMPLAZA a una o más guardias, en UN
 * lote que se deshace entero (contrato §1.6 y §2.3).
 *
 * Es el mismo cuerpo que se guarda en una solicitud (`pedido`) y que se ejecuta al aprobar.
 */
export type PedidoUsoGuardia = {
  /** Las guardias que pisa la obra. Casi siempre una; una obra de varios días puede pisar dos. */
  guardiaIds: number[];
  otId: number;
  /** Jornadas nuevas (soltar desde la bandeja, sumar un apoyo). Incluye las que no caen en guardia. */
  crear?: NuevaAsignacion[];
  /** Jornadas que ya están en la grilla y se mueven (el comodín se MUEVE, no se copia). */
  mover?: MovimientoAsignacion[];
  registro?: RegistroUsoGuardia;
  /** Una solicitud aprobada que habilita este uso (cuando no se pudo ejecutar sola al aprobar). */
  solicitudId?: string;
};

export type RespuestaUsoGuardia = {
  ok: true;
  uso: UsoGuardia;
  /** Los ids que Odoo les dio a las jornadas de `crear`, en el mismo orden. */
  ids: number[];
  /** El lote del gesto: lo pide el deshacer. */
  loteId: string;
  movimientoId: string | null;
};

/**
 * POST /api/planificacion/guardias/deshacer — vuelve el lote entero: borra, devuelve y reactiva.
 *
 * `borrar` y `volver` son para el OPTIMISTA del tablero y nada más: el servidor NO los usa.
 * Qué se borra y adónde vuelve cada jornada sale de lo que el uso anotó en la guardia
 * (`guardia_deshacer`, ver DeshacerGuardado), que lo leyó de Odoo antes de escribir. Si el
 * deshacer confiara en el navegador, con un lote propio cualquiera se podría borrar o mover
 * cualquier jornada (y dejarla encima de otra guardia).
 */
export type DeshacerUsoGuardia = {
  loteId: string;
  guardiaIds: number[];
  /** Las jornadas que el uso creó (sólo para el optimista). */
  borrar?: number[];
  /** Las que el uso movió, de vuelta a donde estaban (sólo para el optimista). */
  volver?: MovimientoAsignacion[];
};

/**
 * Lo que el servidor anota en cada guardia del lote al usarla (`guardia_deshacer`): las
 * jornadas que CREÓ y las que MOVIÓ con la celda donde estaban antes, según Odoo. Es lo único
 * que el deshacer toca.
 */
export type DeshacerGuardado = {
  borrar: number[];
  volver: { id: number; fecha: string; cuadrillaId: number | null }[];
};

/** POST /api/planificacion/guardias/mover — correrla dentro de la misma semana (sin pedir nada). */
export type MoverGuardia = { guardiaId: number; fecha: string; cuadrillaId: number };

/** POST /api/planificacion/guardias/sacar — sólo JS. */
export type SacarGuardia = { guardiaId: number; motivo: string };

/** POST /api/planificacion/guardias/solicitudes — "Pedir autorización". */
export type NuevaSolicitud = {
  guardiaId: number;
  /**
   * Lo que se pide. En 'sacar' vale lo que mande el tablero; en los demás lo DECIDE EL
   * SERVIDOR con el candado (evaluarCandado sobre el pedido): JS lee esta etiqueta para
   * decidir y la aprobación usa la guardia con el uso que le corresponde, así que no puede
   * venir de lo que diga el navegador.
   */
  tipo: TipoSolicitud;
  /** Obligatorio, una línea. */
  motivo: string;
  /** Obligatorio salvo en 'sacar'. */
  pedido?: PedidoUsoGuardia;
  /**
   * Sólo JS: pide y se aprueba en la misma llamada, sin avisarse a sí mismo (ni a
   * #planificacion) de un pedido que ya está resuelto. Sin el permiso, 403.
   */
  autoaprobar?: boolean;
};

/** POST /api/planificacion/guardias/autorizar — sólo JS: Aprobar o Rechazar. */
export type RespuestaSolicitud = { solicitudId: string; aprobar: boolean; respuesta?: string | null };

export type ResultadoAutorizacion = {
  solicitud: SolicitudGuardia;
  /** Al aprobar: si la acción se ejecutó sola. Si no, `solicitud.errorEjecucion` dice por qué. */
  ejecutada: boolean;
  /**
   * Si lo aprobado era USAR la guardia y se ejecutó: el lote, para ofrecer el mismo
   * "Deshacer" que cuando Planificación la usa sola (contrato §1.6: "un solo lote que se
   * deshace entero"). null al rechazar, al sacar o si no se ejecutó.
   */
  uso: (RespuestaUsoGuardia & { guardiaIds: number[] }) | null;
};

/**
 * El 409 de cualquier ruta que escribe en la celda de una guardia sin poder (contrato §1.3).
 * `codigo` es lo que el tablero mira para ofrecer "Pedir autorización a JS" en vez de un toast.
 */
export type RechazoCandado = {
  error: string;
  codigo: "guardia";
  guardiaId: number;
  /** Qué hay que pedirle a JS. null = no se puede ni pidiendo (p. ej. un día pasado). */
  pide: TipoSolicitud | null;
};

// ─── El candado, como decisión pura ────────────────────────────────────────────────────

/** Lo que dice el candado sobre poner una obra en una guardia. */
export type DecisionCandado =
  | { libre: true; uso: UsoGuardia; razon: string }
  | { libre: false; pide: TipoSolicitud | null; mensaje: string };

/** Lo que el candado necesita saber de la OT. Sale de OtTablero (con `creadaEl`). */
export type OtParaCandado = {
  id: number;
  tipo: string;
  estado: string;
  urgencia: string;
  /** Fecha y hora de creación en Odoo (UTC, "2026-10-15 14:03:22" o ISO). */
  creadaEl: string | null;
  fechaDesde: string | null;
  /** Jornadas estimadas (x_duracion_est). */
  jornadas: number;
};

/** El avance de un armado, para saber si "ya se pasó de su duración estimada". */
export type AvanceArmado = { asignadas: number; cerradas: number };

// ─── Colocación (la corrida del viernes) ───────────────────────────────────────────────

/** Una guardia que la corrida decidió poner. */
export type GuardiaAPoner = {
  ranura: RanuraGuardia;
  fecha: string;
  cuadrillaId: number;
  /** "Semana del 02/11: el jueves le tocaba a la C3 por rotación." */
  porQue: string;
};

export type ResultadoColocacion = {
  semana: string;
  poner: GuardiaAPoner[];
  /** Las ranuras que no se pudieron llenar, con el motivo en castellano. */
  faltan: { ranura: RanuraGuardia; motivo: string }[];
  /** Ranuras que ya estaban ocupadas (activas, usadas, rellenadas o sacadas): no se reponen. */
  yaEstaban: RanuraGuardia[];
};

// ─── Relleno de las 13 h ───────────────────────────────────────────────────────────────

/** El orden es la regla (contrato §1.5): apoyo atrasado, comodín, tentativa, depósito. */
export type TipoCandidato = "apoyo" | "comodin" | "tentativa" | "deposito";

export type CandidatoRelleno = {
  tipo: TipoCandidato;
  /** null en depósito. */
  otId: number | null;
  /** "Apoyo a S02025 · Thames 1820", "Comodín S02658 · Callao 1234", "Depósito". */
  titulo: string;
  /** Una línea más: dónde está hoy, desde cuándo es comodín, cuánto lleva de atraso. */
  detalle: string | null;
  /** Dónde está hoy en la grilla (comodín o tentativa). null = sin fecha. */
  desde: { fecha: string; cuadrillaId: number | null } | null;
};

// ─── Comodines ─────────────────────────────────────────────────────────────────────────

/**
 * Una obra que Planificación MARCÓ como comodín y que todavía corresponde mostrar (contrato §2,
 * decidido por JS el 18/10): pendiente o en proceso y con algo por hacer. La marca vive en
 * `plan_comodines`; esto es la marca cruzada con el tablero (comodines.ts). Sin piso ni
 * vencimiento: puede ir cualquier día, y es comodín hasta que alguien lo quite.
 */
export type Comodin = {
  otId: number;
  jornadas: number;
  /** Dónde está hoy en la grilla (su primer día). null = "sin fecha". */
  ubicacion: { fecha: string; cuadrillaId: number | null } | null;
  /** Cuándo se marcó (ISO). Ordena el grupo de la bandeja y el relleno: el más viejo primero. */
  marcadoEl: string;
};

/** Una marca, como la devuelve GET /api/planificacion/comodines. */
export type MarcaComodin = {
  otId: number;
  /** ISO (timestamptz). */
  marcadoEl: string;
  /** Nombre de quien la puso. null si ya no tiene perfil o no se pudo leer. */
  marcadoPorNombre: string | null;
};

// ─── El indicador de arriba ────────────────────────────────────────────────────────────

export type LugarProtegido = {
  /** Los días hábiles que mira, en orden. */
  dias: string[];
  /** Jornadas libres de cuadrillas propias + guardias activas en esos días. */
  protegido: number;
  /** Las guardias que corresponden a esos días (las puestas, en cualquier estado salvo sacada). */
  esperadas: number;
  /** Cuántas de ésas siguen activas. */
  activas: number;
  /** Alguna semana de esos días tiene menos de GUARDIAS_POR_SEMANA puestas. */
  falta: boolean;
  /** gris si están todas activas y no falta ninguna; ámbar si no. */
  nivel: "gris" | "ambar";
};

/** Encabezado del día ("libre X · guardia Y") y fila de la cuadrilla ("4,5 de 6 j + 1 guardia"). */
export type CuentaConGuardias = {
  /** Jornadas ocupadas SIN contar guardias. */
  ocupado: number;
  /** Jornadas libres SIN contar guardias como libres (la guardia ocupa). */
  libre: number;
  /** Cuántas guardias activas hay. */
  guardias: number;
};

// ─── La Hoja del día ───────────────────────────────────────────────────────────────────

/**
 * Una tarea del tablero como la ve el capataz (Hoja del día, pizarrón, Telegram). Una
 * guardia activa llega como TEXTO_GUARDIA_CAPATAZ con tipo 'deposito': la palabra
 * "guardia" no sale nunca de la oficina.
 */
export type TareaParaCapataz = {
  id: number;
  cuadrillaOdooId: number;
  titulo: string;
  tipo: string;
  fraccion: number;
  notas: string | null;
};
