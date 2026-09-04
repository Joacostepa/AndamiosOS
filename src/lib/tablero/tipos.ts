// Tipos de dominio del tablero, compartidos entre el servidor (capa Odoo) y el
// cliente (hooks y componentes). Viven acá y no en src/lib/odoo/asignaciones.ts para
// que el bundle del browser nunca tenga que tocar el módulo server-only de Odoo.
//
// Ya vienen normalizados: sin `false` de Odoo, sin tuplas many2one.

import type { FraccionStr } from "./fracciones";

export type { FraccionStr };

export type EstadoAsignacion = "tentativa" | "confirmada";

export type CuadrillaTablero = {
  id: number;
  nombre: string;
  tercerizada: boolean;
};

/**
 * Qué clase de trabajo es la OT. Es el `x_tipo` de Odoo, con sus mismas etiquetas.
 *
 * Copiadas de la selección del campo, no inventadas: si en Odoo se agrega un valor,
 * `tipoOtLabel` lo muestra crudo en vez de mentir con "Otro" — un tipo desconocido tiene
 * que verse raro en pantalla, no disfrazarse del que menos importa.
 */
export const TIPOS_OT = {
  armado: "Armado",
  desarme: "Desarme",
  ampliacion: "Ampliación",
  desmonte_parcial: "Desmonte parcial",
  mantenimiento: "Mantenimiento",
  otro: "Otro",
} as const;

export type TipoOt = keyof typeof TIPOS_OT;

export function tipoOtLabel(t: string | null | undefined): string {
  if (!t) return TIPOS_OT.otro;
  return TIPOS_OT[t as TipoOt] ?? t;
}

// ─── Qué se arma ────────────────────────────────────────────────────────────
//
// La clasificación que Comercial carga en la solapa "Trabajo a ejecutar" de la orden de
// venta. Vive en sale.order y la leen dos módulos —el tablero y habilitaciones— así que
// el tipo y las etiquetas van acá, en un solo lugar.

export const TIPOS_TRABAJO_OBRA = {
  pantalla_proteccion: "Pantalla de protección",
  estructura_pantalla: "Estructura + pantalla",
  estructura_sin_pantalla: "Estructura sin pantalla",
  torre: "Torre",
  plataforma: "Plataforma",
  sercha: "Sercha",
  apuntalamiento_vertical: "Apuntalamiento vertical",
} as const;

export const TIPOS_TRABAJO_EVENTO = {
  tribuna: "Tribuna",
  escenario: "Escenario",
  otros: "Otros",
} as const;

export type TrabajoOt = {
  ambito: "obra" | "evento" | null;
  /** El tipo que corresponde al ámbito, ya resuelto: no hay que elegir entre dos campos. */
  tipo: string | null;
  tipoLabel: string | null;
  /**
   * Alambre de concertina sobre la bandeja de protección.
   *
   * YA VIENE RESUELTO CONTRA EL TIPO. En Odoo el campo puede quedar en "sí" y escondido si
   * alguien lo contesta y después cambia el tipo a uno sin bandeja; acá eso no llega nunca,
   * porque el que lo lee de Odoo exige además que el tipo sea uno de los tres que la
   * llevan. Un solo lugar donde acordarse, en vez de en cada pantalla.
   */
  alambre: boolean;
  /** null = nadie contestó todavía, que no es lo mismo que "no lleva". */
  syhPresencial: boolean | null;
};

export function trabajoTipoLabel(t: TrabajoOt): string | null {
  return t.tipoLabel;
}

/** Tipos de trabajo interno que Operaciones le asigna a una cuadrilla. */
export const TIPOS_TAREA = {
  deposito: "Depósito",
  mantenimiento: "Mantenimiento",
  traslado: "Traslado",
  retiro: "Retiro de material",
  capacitacion: "Capacitación",
  otro: "Otro",
} as const;

export type TipoTarea = keyof typeof TIPOS_TAREA;

export function tipoTareaLabel(t: string | null | undefined): string {
  return TIPOS_TAREA[(t ?? "otro") as TipoTarea] ?? TIPOS_TAREA.otro;
}

/**
 * De dónde salió la fila. El tablero lee de dos bases —las obras de Odoo, las tareas
 * operativas de Supabase— y las mezcla en un solo array para que la capacidad de la
 * celda y el armado de bloques no tengan que saberlo. Esto es lo único que las separa,
 * y lo miran sólo las escrituras, para saber a qué backend escribir.
 */
export type OrigenAsignacion = "ot" | "tarea";

/**
 * Datos propios de una tarjeta de operaciones. Van EN la asignación y no en un mapa
 * aparte —al revés que las OTs, que se buscan por id en `ots`— porque una tarea no
 * tiene ficha ni existe fuera del tablero: todo lo que hay que mostrar cabe acá.
 */
export type DatosTarea = {
  /** Días de la misma tarea. Es la clave con la que se agrupan en una tarjeta. */
  grupoId: number;
  titulo: string;
  tipo: string;
  /** Sin parte diario: el cierre de una tarea es un sí o un no. */
  hecha: boolean;
};

export type AsignacionTablero = {
  id: number;
  /**
   * De qué lado vive. Por defecto "ot": todo lo que ya existía lo es, y así el tipo no
   * obliga a tocar cada sitio que construye una asignación.
   */
  origen?: OrigenAsignacion;
  /** 0 cuando `origen` es "tarea": no hay OT detrás. */
  otId: number;
  /** Sólo en las tareas operativas. */
  tarea?: DatosTarea;
  fecha: string; // yyyy-MM-dd
  cuadrillaId: number | null;
  fraccion: number; // 0.10 | 0.25 | 0.50 | 0.75 | 1
  estado: EstadoAsignacion;
  ordenDia: number;
  notas: string | null;
  /** Parte diario del cierre. Si tiene valor, la jornada ya se cerró. */
  parteId: number | null;
};

/** Alta de una tarjeta de operaciones. Una fila por día. */
export type NuevaTarea = {
  titulo: string;
  tipo: TipoTarea;
  notas?: string | null;
  cuadrillaId: number | null;
  fecha: string;
  fraccion: FraccionStr;
  ordenDia?: number;
};

export type CambioTarea = {
  titulo?: string;
  tipo?: TipoTarea;
  notas?: string | null;
  cuadrillaId?: number | null;
  fecha?: string;
  fraccion?: FraccionStr;
  ordenDia?: number;
  hecha?: boolean;
};

export type OtTablero = {
  id: number;
  titulo: string;
  tipo: string;
  estado: string;
  urgencia: string;
  motivoUrgencia: string | null;
  /** Jornadas previstas. x_duracion_est manda; x_jornadas_num es el fallback. */
  jornadas: number;
  personalPorJornada: number;
  cuadrillaPrevistaId: number | null;
  habSemaforo: string;
  habAlerta: string | null;
  habVencimiento: string | null;
  tecnico: string | null;
  contactoObra: string | null;
  telObra: string | null;
  observaciones: string | null;
  diasObra: number;
  horasHombre: number;
  cantDocs: number;
  docIds: number[];
  ordenVenta: string | null;
  /** Lo que dice el plan. La escribe el tablero. */
  fechaProgramada: string | null;
  /**
   * Lo que Comercial le prometió al cliente. La escribe una persona en Odoo y el tablero
   * NO la toca: es contra esto que se mide si la planificación llega tarde.
   */
  fechaComprometida: string | null;
  /**
   * El PISO: antes de esta fecha la obra no puede entrar. Lo acuerda Comercial con el
   * cliente ("a partir del 12 puede entrar").
   *
   * SON TRES FECHAS Y NO HAY QUE MEZCLARLAS. `fechaDesde` y `fechaAntesDe` son la VENTANA
   * del cliente —restricciones, y el tablero las valida—; `fechaComprometida` es NUESTRA
   * promesa dentro de esa ventana, que ordena la cola y mide el desvío pero no restringe
   * nada. El caso que las separa: el cliente pide "antes del 15" y Comercial promete el
   * 12; perder el 12 es un desvío, perder el 15 es incumplir.
   *
   * Casi siempre es null: la mayoría de las obras entran cuando hay lugar.
   */
  fechaDesde: string | null;
  /**
   * El TECHO: la obra tiene que estar TERMINADA antes de esta fecha. Lo pone el cliente
   * ("necesito la protección armada antes del 15") y junto con `fechaDesde` describe la
   * ventana real.
   *
   * OJO CON LA ASIMETRÍA: el piso se mide contra el primer día y esto contra el ÚLTIMO de
   * la obra entera. Ver src/lib/tablero/ventana.ts.
   */
  fechaAntesDe: string | null;
  url: string;
};

/** Jornada ya ejecutada (o no ejecutada) según el parte diario. */
export type ParteTablero = {
  id: number;
  otId: number;
  fecha: string;
  cuadrillaId: number | null;
  estado: string; // previsto | ejecutado | no_ejecutado
  motivoNoEjec: string | null;
};

/**
 * Lo que se lee al ABRIR la ficha de una OT, y sólo entonces.
 *
 * Va aparte del payload del tablero a propósito: eso trae 52 OTs en la llamada que más
 * se repite, y nada de esto hace falta hasta que alguien hace clic en una tarjeta.
 *
 * Mezcla la OT con su orden de venta porque la pregunta del que planifica no distingue:
 * quién es el cliente y dónde queda la obra viven en sale.order, no en la OT.
 */
export type DetalleOt = {
  /**
   * QUÉ HAY QUE EJECUTAR: la estructura concreta que la cuadrilla tiene que montar o
   * bajar. Es la primera pregunta del que abre la tarjeta y hasta ahora el panel no la
   * contestaba — el único texto era `observaciones`, que es otra cosa (accesos, horarios).
   *
   * Lo escribe Comercial en la OT de Odoo, precargado con el párrafo técnico de la
   * propuesta de la venta.
   */
  detalleTecnico: string | null;
  /**
   * Cuándo Operaciones confirmó en obra el estado de la estructura. Si tiene fecha, el
   * detalle técnico de arriba NO es lo vendido: es lo que se armó de verdad.
   */
  estructuraConfirmadaEl: string | null;
  /** De la orden de venta. Hasta ahora el cliente salía de partir el título de la OT,
   *  que no siempre lo trae ("Desarme · S00719 · Av. Callao 1810"). */
  cliente: string | null;
  direccionObra: string | null;
  /**
   * Teléfono de la ficha de obra del cliente en Odoo. La OT tiene su propio contacto
   * (x_tel_obra) pero está cargado en el 12% de las OTs; éste, en la mayoría.
   */
  telFichaCliente: string | null;
  /** Nombre completo. En la OT el técnico son iniciales ("GS"), que no dicen nada. */
  tecnicoNombre: string | null;
  vendedor: string | null;
  /** Etapa del trámite de habilitación (a…f). Ver ETAPA_LABEL. */
  habEtapa: string | null;
  habDias: number;
  /** "Tentativa — puede moverse" / "Confirmada — fecha firme", sobre la fecha comprometida. */
  fechaFirmeza: string | null;
  /** Rango ya ejecutado, calculado por Odoo: "11/02 al 25/07/2026 (6 jornadas)". */
  periodo: string | null;
  /** Desvío de lo ejecutado contra lo estimado ("-34%"). */
  desvio: string | null;
  /** Sugerencia de duración con su explicación (sirve sobre todo para el desarme). */
  duracionSugerida: string | null;
  /**
   * Qué se arma, y qué necesita esta jornada además de la cuadrilla: el alambre de
   * concertina y si el cliente contrató un técnico de SyH que tiene que estar en obra.
   * Lo carga Comercial en la venta; acá se muestra, no se edita.
   */
  trabajo: TrabajoOt;
};

export type DocumentoOt = {
  id: number;
  nombre: string;
  mimetype: string;
  url: string;
};

/**
 * Avance de una OT en el tablero. Permite distinguir la obra que nunca se planificó de
 * la que se empezó y quedó suspendida a mitad, esperando retomarse.
 */
export type ProgresoOt = {
  otId: number;
  /** Jornadas con asignación en el tablero (en cualquier fecha). */
  asignadas: number;
  /** De esas, las que ya tienen parte diario cargado. */
  cerradas: number;
};

export type TableroPayload = {
  cuadrillas: CuadrillaTablero[];
  asignaciones: AsignacionTablero[];
  ots: OtTablero[];
  partes: ParteTablero[];
  progreso: ProgresoOt[];
};

export type NuevaAsignacion = {
  otId: number;
  fecha: string;
  cuadrillaId: number | null;
  fraccion: FraccionStr;
  estado: EstadoAsignacion;
  ordenDia: number;
  notas?: string | null;
};

export type CambioAsignacion = {
  fecha?: string;
  cuadrillaId?: number | null;
  fraccion?: FraccionStr;
  estado?: EstadoAsignacion;
  ordenDia?: number;
  notas?: string | null;
};

export type MovimientoAsignacion = {
  id: number;
  fecha: string;
  cuadrillaId?: number | null;
  ordenDia?: number;
};
