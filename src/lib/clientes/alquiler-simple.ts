// El alquiler simple que cotiza Tomás: el armado, el precio, la fecha y los textos. Puro, con
// tests (alquiler-simple.test.ts). Sin IA: la regla está escrita acá y el precio lo pone el motor.
//
// docs/sofia/alquiler-simple-propuesta.md, cerrada con JS el 12/11 (tabla de la §11):
//   · el andamio (§2): módulos de 1,80 m de 1,30 (estándar) o 0,90 (angosto), de 2,50 o 1,50
//     (junior) de largo; baranda arriba, piso completo de tablones y ruedas o tornillones;
//   · la altura (§4): plataforma + 2 m para trabajar, plataforma + 1,90 m de techo para la
//     cabeza; hasta 3 módulos sin anclar; la plataforma arriba de un módulo o, como alternativa,
//     un tablón en un peldaño de cualquier módulo (fila 19), que se cobra igual (fila 14);
//   · el precio (§5): un solo total por 30 días con el flete adentro, el mínimo operativo si no
//     llega, el recargo de la franja de una hora sobre el total (fila 15) y la renovación por día;
//   · la entrega (§6): nunca el mismo día, ni domingos ni feriados, sábados de 8 a 12; sólo en
//     CABA (fila 16). O lo retira el cliente en el depósito (fila 17): sin flete, con el mínimo,
//     de lunes a viernes de 10 a 12 o de 13 a 16;
//   · cuándo no es fácil (§8): pasa a un vendedor.
//
// TOMÁS NUNCA VE PLATA (herramientas.ts, «ninguna devuelve plata»): el precio lo calcula este
// archivo para la tarjeta y para el mensaje que manda el SERVIDOR cuando una persona aprueba
// (mensajePresupuestoAlquiler). A Tomás le llega sólo resumenParaTomas, que describe el armado
// sin montos ni porcentajes y pasa limpio por el filtro de salida (detectarPlata, con tests).
// Tampoco ve lo del cliente (deuda, cuenta de los socios): eso queda en el grupo «cliente» de
// los motivos, para la tarjeta del equipo, y el resumen sale igual con o sin deuda.
//
// Los precios llegan como argumento (ParametrosAlquiler, de Parámetros): así se prueba sin base.
// Las medidas son constantes (MEDIDAS): ver el porqué ahí.

import type { Feriado } from "../feriados/argentina.ts";
import { escanearPalabras, TEXTO_GAMA_ALTA, type BanderaIA, type CodigoAlerta, type FichaCliente } from "./facil.ts";
import type { FilaParametro } from "../cotizador/tarifas.ts";

// ── Parámetros (los precios y los topes: los mueve JS) ─────────────────────────────────

export type ParametrosAlquiler = {
  /** `alquiler_simple_precio_pieza`: módulo, módulo baranda o tablón, por 30 días ($ 18.000). */
  precioPieza: number;
  /** `alquiler_simple_ruedas`: el juego de 4 ruedas, por 30 días ($ 36.000, fila 4). */
  ruedasJuego: number;
  /** `alquiler_simple_tornillones`: el juego de 4 tornillones, por 30 días ($ 36.000, fila 4). */
  tornillonesJuego: number;
  /** `alquiler_simple_minimo`: el mínimo operativo, neto y con el flete adentro ($ 500.000). */
  minimoOperativo: number;
  /** `alquiler_simple_max_modulos`: el tope para que salga solo, sin contar barandas (10, fila 9). */
  maxModulos: number;
  /** `alquiler_simple_recargo_franja`: el recargo de la franja de una hora, en % (20, fila 15). */
  recargoFranjaPct: number;
};

/** Las claves de cotizacion_parametros (migración 20261112000001_alquiler_simple_parametros). */
export const CLAVES_PARAMETROS_ALQUILER = [
  "alquiler_simple_precio_pieza",
  "alquiler_simple_ruedas",
  "alquiler_simple_tornillones",
  "alquiler_simple_minimo",
  "alquiler_simple_max_modulos",
  "alquiler_simple_recargo_franja",
] as const;

/**
 * De las filas de cotizacion_parametros. Como parametrosFacilDesdeFilas: si falta una clave,
 * corta con la lista (la migración 20261112000001 las agrega; regla de los dos pasos en
 * docs/asistente-comercial/handoff.md).
 */
export function parametrosAlquilerDesdeFilas(filas: FilaParametro[]): ParametrosAlquiler {
  const porClave = new Map(filas.map((f) => [f.clave, f]));
  const faltan: string[] = [];
  const v = (clave: (typeof CLAVES_PARAMETROS_ALQUILER)[number]) => {
    const f = porClave.get(clave);
    if (!f || f.valor === null || f.valor === undefined || Number.isNaN(Number(f.valor))) {
      faltan.push(clave);
      return 0;
    }
    return Number(f.valor);
  };
  const p: ParametrosAlquiler = {
    precioPieza: v("alquiler_simple_precio_pieza"),
    ruedasJuego: v("alquiler_simple_ruedas"),
    tornillonesJuego: v("alquiler_simple_tornillones"),
    minimoOperativo: v("alquiler_simple_minimo"),
    maxModulos: v("alquiler_simple_max_modulos"),
    recargoFranjaPct: v("alquiler_simple_recargo_franja"),
  };
  if (faltan.length) throw new Error(`Faltan parámetros del alquiler simple: ${faltan.join(", ")}. Revisá Comercial → Parámetros de cotización.`);
  if (!(p.precioPieza > 0) || !(p.ruedasJuego > 0) || !(p.tornillonesJuego > 0) || !(p.minimoOperativo >= 0)) {
    throw new Error("Los precios del alquiler simple tienen que ser mayores que cero (y el mínimo, cero o más).");
  }
  if (!Number.isInteger(p.maxModulos) || p.maxModulos < 1) throw new Error("alquiler_simple_max_modulos tiene que ser un entero de 1 o más.");
  if (!(p.recargoFranjaPct >= 0)) throw new Error("alquiler_simple_recargo_franja no puede ser negativo.");
  return p;
}

// ── Medidas (constantes, no parámetros) ────────────────────────────────────────────────

/**
 * Las medidas del andamio y los márgenes de altura, en metros.
 *
 * DECISIÓN: van en el código, no en Parámetros. Son la ficha técnica (FT-01) y dos márgenes de
 * seguridad que confirmó JS el 12/11 (fila 1), no precios: no cambian con la lista. Si alguien
 * los moviera desde Parámetros, la tabla de la §4 y los tests dejarían de decir la verdad sin
 * que nadie lo note, y un error ahí es una persona con la cabeza contra el techo o un andamio sin
 * anclar a 9 m. Si cambia el material, se cambia acá, con sus tests.
 *
 * - `base`: las ruedas suman 0,15 m (§2). Con tornillones se toma la misma altura: son husillos
 *   regulables y la tabla de la §4 está confirmada con ruedas; la diferencia es de centímetros.
 * - `peldanos`: los de la escalera de cada bastidor, medidos desde abajo de SU módulo. La
 *   plataforma en un peldaño se puede armar en cualquier módulo (JS, 12/11, fila 19): en el
 *   segundo, el de 0,80 queda a 0,15 + 1,80 + 0,80 = 2,75 m.
 * - `hastaElTecho`: si tiene que trabajar hasta 10 cm del techo o más arriba, es trabajar en el
 *   techo («pintar la pared hasta arriba» con un techo de 3 m). Es también el margen con el que
 *   una plataforma «llega al techo» (plataforma + 2 m a 10 cm o menos): si queda más lejos, se
 *   cotiza igual y Tomás le aclara hasta dónde llega para que lo confirme (fila 19).
 *
 * - `techoMaxSinAnclar`: un trabajo en el techo de hasta 8 m se cotiza con 3 módulos (la plataforma a
 *   5,55 m, llega cómodo a ~7,55) y, si no llega cómodo, se confirma; un techo más alto es trabajar
 *   a más de ~7,5 m: hay que anclar (§8). DECISIÓN de la revisión del 12/11 (para que la vea JS):
 *   con 8 m la cabeza queda a 55 cm del techo, el margen del que hablaba el ejemplo de JS.
 *
 * Ya no está el margen de 50 cm de la cabeza al techo (`cabezaAlTecho`, del 12/11 a la mañana):
 * mandaba a un vendedor los cielorrasos en que la cabeza entraba pero la plataforma quedaba más
 * abajo. JS decidió que se cotizan y se le aclara al cliente (fila 19).
 */
export const MEDIDAS = {
  base: 0.15,
  modulo: 1.8,
  alcance: 2.0,
  cabeza: 1.9,
  peldanos: [0.4, 0.8, 1.2],
  maxModulosSinAnclar: 3,
  hastaElTecho: 0.1,
  techoMaxSinAnclar: 8,
  /** Ancho de un tablón: la plataforma en un peldaño es de uno solo (§4). */
  tablon: 0.3,
} as const;

/**
 * El depósito donde retira el cliente (filas 17 y 22): Cucha Cucha 2345, CABA, el mismo que dicen
 * las órdenes que hoy «retiran en depósito» en Odoo (S03008, S02929, S02769, S01563). Maturín 2570
 * es la oficina, no el depósito. Abre de lunes a viernes que no sean feriado, de 10 a 16, y de 12
 * a 13 está cerrado. El retiro y la devolución se coordinan con 24 h de anticipación, hasta el
 * comienzo de la franja, por este mismo WhatsApp.
 *
 * `texto` va sin paréntesis («Cucha Cucha 2345, CABA»): casi siempre se escribe entre paréntesis.
 */
export const DEPOSITO = { direccion: "Cucha Cucha 2345", texto: "Cucha Cucha 2345, CABA" } as const;

/** Todo en centímetros enteros adentro: 0,15 + 1,80 × 2 en coma flotante no da 3,75. */
const cm = (m: number) => Math.round(m * 100);
const BASE = cm(MEDIDAS.base);
const MODULO = cm(MEDIDAS.modulo);
const ALCANCE = cm(MEDIDAS.alcance);
const CABEZA = cm(MEDIDAS.cabeza);
const HASTA_EL_TECHO = cm(MEDIDAS.hastaElTecho);
const TECHO_MAX = cm(MEDIDAS.techoMaxSinAnclar);
const PELDANOS = MEDIDAS.peldanos.map(cm);
const MAX_SIN_ANCLAR = MEDIDAS.maxModulosSinAnclar;

/** «3,95», «0,80», «5»: como en la propuesta. */
export function metros(m: number): string {
  const c = cm(m);
  if (c % 100 === 0) return String(c / 100);
  return (c / 100).toFixed(2).replace(".", ",");
}

// ── Las piezas ─────────────────────────────────────────────────────────────────────────

/** Los códigos que comparte el motor con el módulo de Odoo, que los mapea a productos. */
export type CodigoPieza =
  | "modulo_130x250" | "modulo_090x250" | "modulo_130x150" | "modulo_090x150"
  | "baranda_130" | "baranda_090" | "tablon_250" | "tablon_150" | "ruedas_juego" | "tornillones_juego";

/**
 * Las líneas de la orden: las piezas, el flete (el método de envío del barrio), el mínimo
 * operativo (la diferencia hasta el mínimo) y el recargo de la franja de una hora.
 */
export type CodigoLinea = CodigoPieza | "flete" | "minimo_operativo" | "recargo_franja";

/** La línea de la renovación en Odoo: «RENOVACIÓN ALQUILER SIMPLE (SIN MONTAJE)» (§5). */
export const CODIGO_RENOVACION = "renovacion" as const;
export const PRODUCTO_RENOVACION = "RENOVACIÓN ALQUILER SIMPLE (SIN MONTAJE)";

export const DESCRIPCION_PIEZA: Record<CodigoPieza, string> = {
  modulo_130x250: "Módulo STD 1,30 × 2,50 × 1,80",
  modulo_090x250: "Módulo angosto 0,90 × 2,50 × 1,80",
  modulo_130x150: "Módulo junior STD 1,30 × 1,50 × 1,80",
  modulo_090x150: "Módulo junior angosto 0,90 × 1,50 × 1,80",
  baranda_130: "Módulo baranda STD 1,30",
  baranda_090: "Módulo baranda angosto 0,90",
  tablon_250: "Tablón metálico 2,50",
  tablon_150: "Tablón metálico 1,50",
  ruedas_juego: "Juego de ruedas (4 u.)",
  tornillones_juego: "Juego de tornillones (4 u.)",
};

/** estandar: bastidor de 1,30 · angosto: de 0,90 (el de pasillo). */
export type Ancho = "estandar" | "angosto";
/** largo: 2,50 · junior: 1,50. */
export type Largo = "largo" | "junior";
export type Apoyo = "ruedas" | "tornillones";
export type Lugar = "adentro" | "afuera";
export type Piso = "liso" | "desparejo";

const LARGO_M: Record<Largo, number> = { largo: 2.5, junior: 1.5 };
/** Piso completo arriba: 4 tablones en el de 1,30 y 3 en el de 0,90 (fila 2). */
export const TABLONES_PISO: Record<Ancho, number> = { estandar: 4, angosto: 3 };

const codigoModulo = (a: Ancho, l: Largo): CodigoPieza =>
  `modulo_${a === "estandar" ? "130" : "090"}x${l === "largo" ? "250" : "150"}` as CodigoPieza;
const codigoBaranda = (a: Ancho): CodigoPieza => (a === "estandar" ? "baranda_130" : "baranda_090");
const codigoTablon = (l: Largo): CodigoPieza => (l === "largo" ? "tablon_250" : "tablon_150");
const codigoApoyo = (a: Apoyo): CodigoPieza => (a === "ruedas" ? "ruedas_juego" : "tornillones_juego");

// ── Franjas ────────────────────────────────────────────────────────────────────────────

/**
 * La franja de entrega (§6): de 8 a 12, de 13 a 16, o una hora particular (con recargo) que
 * empieza en `desde` (horas: 10 = 10:00, 9.5 = 9:30) y dura una hora.
 *
 * Si retira en el depósito (fila 17), las del depósito: de 10 a 12 o de 13 a 16, de lunes a
 * viernes (de 12 a 13 el depósito para). En el depósito no hay franja de una hora ni recargo.
 * Son otros tipos y no las mismas con otro horario: así ningún texto dice «de 8 a 12» para el
 * depósito por olvidarse de la modalidad.
 */
export type Franja =
  | { tipo: "manana" } | { tipo: "tarde" } | { tipo: "hora"; desde: number }
  | { tipo: "deposito_manana" } | { tipo: "deposito_tarde" };

/** Las ventanas de entrega en horas: lunes a viernes 8-12 y 13-16; sábados sólo 8-12. */
const VENTANAS_SEMANA: [number, number][] = [[8, 12], [13, 16]];
const VENTANAS_SABADO: [number, number][] = [[8, 12]];

const hora = (h: number) => {
  const min = Math.round((h % 1) * 60);
  return min ? `${Math.floor(h)}:${String(min).padStart(2, "0")}` : String(Math.floor(h));
};

/** «de 8 a 12», «de 13 a 16», «de 10 a 11»; en el depósito, «de 10 a 12» o «de 13 a 16». */
export function textoFranja(f: Franja): string {
  if (f.tipo === "manana") return "de 8 a 12";
  if (f.tipo === "tarde" || f.tipo === "deposito_tarde") return "de 13 a 16";
  if (f.tipo === "deposito_manana") return "de 10 a 12";
  return `de ${hora(f.desde)} a ${hora(f.desde + 1)}`;
}

/** ¿Es una franja del depósito? */
export const esFranjaDeposito = (f: Franja | null | undefined): boolean => f?.tipo === "deposito_manana" || f?.tipo === "deposito_tarde";

/**
 * La franja según cómo llega el andamio. Tomás pregunta «a la mañana o a la tarde» en los dos
 * casos y el servidor la pasa a la de la modalidad: en el depósito, la mañana es de 10 a 12 y la
 * tarde de 13 a 16. Una franja de una hora no existe en el depósito: null (hay que preguntar
 * de nuevo, con las del depósito).
 */
export function franjaSegunModalidad(f: Franja | null, deposito: boolean): Franja | null {
  if (!f) return null;
  if (deposito) {
    if (f.tipo === "manana") return { tipo: "deposito_manana" };
    if (f.tipo === "tarde") return { tipo: "deposito_tarde" };
    return f.tipo === "hora" ? null : f;
  }
  if (f.tipo === "deposito_manana") return { tipo: "manana" };
  if (f.tipo === "deposito_tarde") return { tipo: "tarde" };
  return f;
}

// ── El pedido (lo que junta Tomás) ─────────────────────────────────────────────────────

/** Lo que el cliente ya dijo que quiere («2 módulos con ruedas»): se valida y se completa. */
export type PiezasPedidas = {
  /** Módulos de alto de cada torre. */
  modulosPorTorre: number;
  torres?: number | null;
  ancho?: Ancho | null;
  largo?: Largo | null;
  apoyo?: Apoyo | null;
  /** false: no quiere la baranda. No se lleva, pero se cobra igual (fila 8). */
  conBaranda?: boolean | null;
  /** Tablones por torre, si los dijo. Menos que el piso completo se completa. */
  tablonesPorTorre?: number | null;
};

export type PedidoAlquiler = {
  lugar: Lugar | null;
  /** Hasta qué altura tiene que trabajar, en metros. */
  alturaTrabajo: number | null;
  /** El trabajo es el cielorraso o el techo: manda el techo (§4). */
  trabajoEnTecho: boolean;
  /** La altura del techo, en metros (adentro, o un alero afuera). */
  alturaTecho: number | null;
  /** «Espacio de sobra»: no hace falta medir el ancho ni el largo. */
  espacioDeSobra: boolean;
  /** El ancho libre en el piso, en metros. */
  anchoLibre: number | null;
  /** El largo libre en el piso, en metros. */
  largoLibre: number | null;
  /** El largo a cubrir con varias torres en fila, en metros. */
  largoACubrir: number | null;
  /** Cuántas torres quiere (separadas o en fila). */
  torres: number | null;
  piso: Piso | null;
  /** Si ya sabe qué piezas quiere. null: arma Tomás según las reglas. */
  piezas: PiezasPedidas | null;
  /** Lo que pide y no está en la §2 (puntales, caños, nudos, paso peatonal, escalera, ménsulas). */
  piezasFueraDeCatalogo: string[];
  montaje: boolean;
  /** Dijo que hay que anclar el andamio. */
  anclar: boolean;
  /** Lo necesita sí o sí en el día. */
  paraHoy: boolean;
  /** La fecha de entrega pedida (YYYY-MM-DD). */
  fecha: string | null;
  franja: Franja | null;
  /**
   * La respuesta a la plataforma que hay que confirmarle (fila 19): un tablón en un peldaño, o
   * una plataforma que no llega cómodo al techo. null: todavía no se le preguntó. La herramienta
   * la borra si cambia la altura, el techo o lo que pidió (ya no es la misma plataforma).
   */
  aceptaPlataforma: boolean | null;
  /**
   * true: lo retira él en el depósito (fila 17), sin flete. false: dijo que no puede retirarlo.
   * null: no lo dijo (en CABA va con envío; en provincia se le ofrece el depósito, fila 16).
   */
  retiraEnDeposito: boolean | null;
};

export function pedidoVacio(): PedidoAlquiler {
  return {
    lugar: null, alturaTrabajo: null, trabajoEnTecho: false, alturaTecho: null, espacioDeSobra: false, anchoLibre: null, largoLibre: null,
    largoACubrir: null, torres: null, piso: null, piezas: null, piezasFueraDeCatalogo: [], montaje: false, anclar: false, paraHoy: false,
    fecha: null, franja: null, aceptaPlataforma: null, retiraEnDeposito: null,
  };
}

// ── Lo que sabe el servidor ────────────────────────────────────────────────────────────

/**
 * El flete del barrio (§5, los métodos de envío 354 a 450 de Odoo). Cubre la entrega y el
 * retiro: una sola línea por pedido. `fuera_de_lista`: el barrio no está, va a un vendedor.
 * `provincia`: la obra está fuera de CABA. No se entrega ni se retira fuera de CABA (JS, 12/11,
 * fila 16): no hay flete y Tomás le ofrece retirarlo en el depósito.
 */
export type FleteAlquiler =
  | { tipo: "lista"; barrio: string; monto: number; metodoEnvioId?: number | null }
  | { tipo: "fuera_de_lista"; barrio: string | null }
  | { tipo: "provincia"; lugar: string | null };

/**
 * Lo del cliente que ya maneja facil.ts (las palabras de alerta, las banderas de la IA, la gama
 * alta) más lo que sabe el servidor (la deuda y la cuenta de los socios). No se duplica: se
 * escanea con escanearPalabras y se filtra a lo que aplica al alquiler (ALERTAS_ALQUILER).
 */
export type ClienteAlquiler = Pick<FichaCliente, "mensajesCliente" | "banderas" | "segmento"> & {
  /** F7: deuda vencida. null = no se pudo revisar (cuenta como «no»). Al cliente nunca se le dice. */
  deudaVencida: boolean | null;
  cuentaSocio?: boolean;
};

export type ContextoAlquiler = {
  parametros: ParametrosAlquiler;
  /** null: todavía no se sabe dónde es. */
  flete: FleteAlquiler | null;
  /** YYYY-MM-DD, en Buenos Aires. */
  hoy: string;
  /** Los feriados (de feriadosDelRango, src/lib/feriados/argentina.ts) o sus fechas. */
  feriados: readonly (Feriado | string)[];
  /** Sin esto no se revisan las alertas ni la deuda: en producción va siempre. */
  cliente?: ClienteAlquiler | null;
  /**
   * El momento, para las 24 h del retiro en el depósito (hasta el comienzo de la franja). Sin
   * esto, en el depósito vale sólo «nunca el mismo día» (los tests de la tabla de alturas).
   */
  ahora?: Date | null;
};

// ── Fechas y franjas (§6) ──────────────────────────────────────────────────────────────

export type CodigoEntrega = "fecha_invalida" | "hoy" | "pasada" | "domingo" | "feriado" | "sabado_tarde" | "sabado_deposito" | "fuera_de_franja" | "anticipacion";

export type ResultadoEntrega = {
  ok: boolean;
  motivo: CodigoEntrega | null;
  /** Para Tomás y la tarjeta, sin montos. */
  texto: string;
  /** Lo pedido si se puede; si no, la próxima fecha posible (con la franja más parecida). */
  proxima: { fecha: string; franja: Franja | null } | null;
};

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
function fechaValida(f: string): boolean {
  if (!FECHA_RE.test(f)) return false;
  const d = new Date(`${f}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
}
const diaSemana = (f: string) => new Date(`${f}T12:00:00Z`).getUTCDay();
function sumarDias(f: string, n: number): string {
  const d = new Date(`${f}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** «lunes 16 de noviembre». */
export function textoFecha(f: string): string {
  const d = new Date(`${f}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

function fechasFeriado(feriados: readonly (Feriado | string)[]): Set<string> {
  return new Set(feriados.map((f) => (typeof f === "string" ? f : f.fecha)));
}

/**
 * La franja cabe en el día: la mañana siempre; la tarde, no los sábados; la hora, dentro de una
 * ventana; las del depósito, nunca los sábados (abre de lunes a viernes).
 */
function franjaCabe(f: Franja, sabado: boolean): boolean {
  if (f.tipo === "manana") return true;
  if (f.tipo === "tarde" || f.tipo === "deposito_manana" || f.tipo === "deposito_tarde") return !sabado;
  if (!Number.isFinite(f.desde)) return false;
  return (sabado ? VENTANAS_SABADO : VENTANAS_SEMANA).some(([a, b]) => f.desde >= a && f.desde + 1 <= b);
}

/** La franja más parecida que cabe ese día: la hora más cercana, o la mañana en vez de la tarde. */
function franjaQueCabe(f: Franja, sabado: boolean): Franja {
  if (franjaCabe(f, sabado)) return f;
  if (f.tipo !== "hora" || !Number.isFinite(f.desde)) return { tipo: "manana" };
  const ventanas = sabado ? VENTANAS_SABADO : VENTANAS_SEMANA;
  // El comienzo más cercano que entra en alguna ventana (12 → 11; 16 → 15). Empate: el de antes.
  const candidatos = ventanas.map(([a, b]) => Math.min(Math.max(f.desde, a), b - 1));
  const mejor = candidatos.reduce((m, d) => (Math.abs(d - f.desde) < Math.abs(m - f.desde) ? d : m));
  return { tipo: "hora", desde: mejor };
}

const HORA_MS = 3_600_000;

/** Dónde empieza la franja, en horas (la del depósito a la mañana, a las 10). */
export function inicioFranja(f: Franja): number {
  if (f.tipo === "manana") return 8;
  if (f.tipo === "tarde" || f.tipo === "deposito_tarde") return 13;
  if (f.tipo === "deposito_manana") return 10;
  return f.desde;
}

/** Esa hora de ese día en Buenos Aires (UTC−3, sin horario de verano) → instante. */
export const instanteBA = (fecha: string, horas: number) => Date.parse(`${fecha}T00:00:00Z`) + (horas + 3) * HORA_MS;

/** ¿Hay 24 h de anticipación desde `ahora` hasta el comienzo de la franja? */
export const con24h = (fecha: string, franja: Franja, ahora: Date) => instanteBA(fecha, inicioFranja(franja)) - ahora.getTime() >= 24 * HORA_MS;

/** La otra franja del depósito (para ofrecer la próxima el mismo día). */
const OTRA_DEPOSITO: Partial<Record<Franja["tipo"], Franja>> = { deposito_manana: { tipo: "deposito_tarde" }, deposito_tarde: { tipo: "deposito_manana" } };

/**
 * ¿Se puede entregar (o retirar) ese día en esa franja? (§6 y fila 13 de la §11)
 *   · nunca hoy ni antes (si lo necesita en el día, pasa a un vendedor: motivo `hoy`);
 *   · ni domingos ni feriados;
 *   · los sábados, sólo de 8 a 12;
 *   · de lunes a viernes, de 8 a 12 o de 13 a 16, o una hora adentro de esas ventanas (de 12 a 13
 *     no se entrega ni se retira: ninguna hora particular cae ahí, fila 24).
 * En el depósito (fila 17: una franja del depósito, o `deposito` sin franja) las mismas reglas
 * con sus franjas: nunca hoy, ni domingos ni feriados, y tampoco los sábados. Y con `ahora`, 24 h
 * de anticipación hasta el comienzo de la franja (fila 17: «se coordina con 24 h»).
 * Si no se puede, devuelve el motivo y la próxima fecha posible: el primer día desde la pedida
 * (o desde mañana) en el que entra la misma franja (en el depósito, o la otra del mismo día). Si
 * la franja no entra en ningún día (una hora de 12 a 13), se ofrece la hora más cercana que sí
 * entra. `franja` null: sólo el día.
 */
export function validarEntrega(
  fecha: string, franja: Franja | null, hoy: string, feriados: readonly (Feriado | string)[], o: { deposito?: boolean; ahora?: Date | null } = {},
): ResultadoEntrega {
  const deposito = o.deposito === true || esFranjaDeposito(franja);
  const ahora = deposito ? o.ahora ?? null : null;
  const fer = fechasFeriado(feriados);
  const diaOk = (f: string) => diaSemana(f) !== 0 && !fer.has(f) && !(deposito && diaSemana(f) === 6);
  // Sin franja, en el depósito se mide hasta que abre (las 10).
  const aTiempo = (f: string, fr: Franja | null) => !ahora || con24h(f, fr ?? { tipo: "deposito_manana" }, ahora);

  // La próxima posible desde `desde`, con la franja pedida si entra algún día de la semana.
  const proximaDesde = (desde: string, fr: Franja | null) => {
    const preferida = fr && !franjaCabe(fr, false) ? franjaQueCabe(fr, false) : fr;
    const opciones: (Franja | null)[] = preferida && ahora && OTRA_DEPOSITO[preferida.tipo] ? [preferida, OTRA_DEPOSITO[preferida.tipo]!] : [preferida];
    for (let i = 0, f = desde; i < 60; i++, f = sumarDias(f, 1)) {
      if (!diaOk(f)) continue;
      for (const op of opciones) {
        if ((!op || franjaCabe(op, diaSemana(f) === 6)) && aTiempo(f, op)) return { fecha: f, franja: op };
      }
    }
    return null;
  };
  const manana = sumarDias(hoy, 1);
  const no = (motivo: CodigoEntrega, texto: string, desde: string): ResultadoEntrega => ({ ok: false, motivo, texto, proxima: proximaDesde(desde, franja) });

  if (!fechaValida(fecha)) return no("fecha_invalida", `La fecha «${fecha}» no es válida`, manana);
  if (fecha === hoy) return no("hoy", deposito ? "Lo quiere retirar hoy: el retiro en el depósito es desde el día siguiente" : "Lo pide para hoy: la entrega es desde el día siguiente", manana);
  if (fecha < hoy) return no("pasada", `El ${textoFecha(fecha)} ya pasó`, manana);
  const dia = diaSemana(fecha);
  if (dia === 0) return no("domingo", `El ${textoFecha(fecha)} es domingo: los domingos no se entrega ni se retira`, fecha);
  if (fer.has(fecha)) return no("feriado", `El ${textoFecha(fecha)} es feriado: no se entrega ni se retira`, fecha);
  if (deposito && dia === 6) return no("sabado_deposito", `El ${textoFecha(fecha)} es sábado: el depósito abre de lunes a viernes`, fecha);
  if (franja && !franjaCabe(franja, dia === 6)) {
    if (dia === 6) return no("sabado_tarde", `Los sábados se entrega sólo de 8 a 12 (pidió ${textoFranja(franja)})`, fecha);
    return no("fuera_de_franja", `La franja ${textoFranja(franja)} no entra: de lunes a viernes es de 8 a 12 o de 13 a 16 (de 12 a 13 no se entrega)`, fecha);
  }
  if (!aTiempo(fecha, franja)) {
    return no("anticipacion", `El retiro en el depósito se coordina con 24 h de anticipación: para el ${textoFecha(fecha)}${franja ? `, ${textoFranja(franja)}` : ""} no llega`, fecha);
  }
  const que = deposito ? "Retira en el depósito" : "Entrega";
  return { ok: true, motivo: null, texto: `${que} el ${textoFecha(fecha)}${franja ? `, ${textoFranja(franja)}` : ""}`, proxima: { fecha, franja } };
}

// ── La altura (§4) ─────────────────────────────────────────────────────────────────────

/**
 * Dónde queda la plataforma: arriba de `modulos` módulos (`peldano` null), o un tablón en un
 * peldaño del módulo de arriba de la torre (`peldano`: 0,40 / 0,80 / 1,20, medido desde abajo
 * de ese módulo). Un peldaño de un módulo de más abajo no hace falta: es el mismo nivel con una
 * torre más baja.
 */
type Nivel = { modulos: number; plataforma: number; peldano: number | null };
/**
 * A qué tiene que llegar la plataforma + 2 m (cm) y el techo, si hay. En el techo, `llegar` es el
 * techo menos `hastaElTecho`: si la plataforma no llega a eso, se cotiza igual y se confirma.
 */
type Objetivo = { llegar: number; techo: number | null; enTecho: boolean };
type MotivoAltura = "anclar" | "techo_no_deja" | "no_llega" | "no_entra";
/** `llega`: la plataforma + 2 m alcanza el objetivo. Si no, se cotiza igual y se confirma (fila 19). */
type SolucionAltura = { ok: true; nivel: Nivel; llega: boolean } | { ok: false; motivo: MotivoAltura; nivel?: Nivel };

const arriba = (n: number): Nivel => ({ modulos: n, plataforma: BASE + MODULO * n, peldano: null });
/** Los peldaños del módulo de arriba de una torre de `n`, del más alto al más bajo. */
const peldanosDe = (n: number): Nivel[] =>
  [...PELDANOS].sort((a, b) => b - a).map((p) => ({ modulos: n, plataforma: BASE + MODULO * (n - 1) + p, peldano: p }));
/** Los niveles posibles con `n` módulos: arriba y, como alternativa, los peldaños del de arriba. */
const nivelesDe = (n: number): Nivel[] => [arriba(n), ...peldanosDe(n)];
const llega = (nv: Nivel, o: Objetivo) => nv.plataforma + ALCANCE >= o.llegar;
const entra = (nv: Nivel, o: Objetivo) => o.techo === null || nv.plataforma + CABEZA <= o.techo;
const masAlto = (niveles: Nivel[]): Nivel | null => niveles.reduce<Nivel | null>((m, nv) => (!m || nv.plataforma > m.plataforma ? nv : m), null);

/**
 * La plataforma (JS, 12/11, fila 19: «en los peldaños se puede apoyar tablón como alternativa»).
 * Los niveles posibles son arriba de cada módulo y, como alternativa, un tablón en cualquier
 * peldaño de cualquier módulo, siempre con la base de 0,15 y hasta 3 módulos.
 *
 *   · Trabajo en el techo: la plataforma más alta que deja entrar la cabeza (plataforma + 1,90 ≤
 *     techo). Si la más alta de arriba de un módulo ya llega al techo, va esa («si sirve igual»:
 *     piso completo y baranda); el peldaño, cuando acerca más al techo.
 *   · Trabajo hasta una altura: la menor cantidad de módulos que llega con la cabeza adentro;
 *     con esa cantidad, arriba si entra la cabeza y, si no, el peldaño más alto del módulo de
 *     arriba que entra y llega.
 *   · En los dos: si ninguna plataforma con la cabeza adentro llega, va la más alta que deja
 *     entrar la cabeza y `llega` en false: se cotiza y Tomás se lo aclara para que lo confirme
 *     (aConfirmar «plataforma»). Ya no va a un vendedor por el margen de 50 cm.
 *   · A un vendedor sólo va lo que no tiene ninguna plataforma posible (la cabeza no entra en
 *     ninguna: «techo_no_deja») o hay que anclar: trabajar a más de ~7,55 m, o un techo de más de
 *     `techoMaxSinAnclar` (8 m).
 *
 * Con `fijo` (lo que pidió el cliente) se prueba sólo esa cantidad de módulos. Si con eso no
 * llega y lo recomendado sí, o lo recomendado es una plataforma arriba más alta, es «no_llega»
 * (se cotiza lo recomendado). Si lo recomendado tampoco llega y es un tablón en un peldaño, se
 * respeta lo que pidió: no se cambia el piso completo por un tablón que tampoco llega.
 */
function resolverAltura(o: Objetivo, fijo: number | null): SolucionAltura {
  if (fijo !== null && fijo > MAX_SIN_ANCLAR) return { ok: false, motivo: "anclar" };
  if (o.enTecho ? o.techo !== null && o.techo > TECHO_MAX : o.llegar > arriba(MAX_SIN_ANCLAR).plataforma + ALCANCE) return { ok: false, motivo: "anclar" };
  const cantidades = fijo !== null ? [fijo] : Array.from({ length: MAX_SIN_ANCLAR }, (_, i) => i + 1);
  const niveles = cantidades.flatMap(nivelesDe);
  const conCabeza = niveles.filter((nv) => entra(nv, o));
  const alto = masAlto(conCabeza);
  if (!alto) return { ok: false, motivo: fijo !== null ? "no_entra" : "techo_no_deja" };

  let nivel: Nivel;
  if (o.enTecho) {
    const arribaAlto = masAlto(conCabeza.filter((nv) => nv.peldano === null));
    nivel = arribaAlto && (arribaAlto === alto || llega(arribaAlto, o)) ? arribaAlto : alto;
  } else {
    // En orden: 1 módulo (arriba, después sus peldaños), 2 módulos… El primero que entra y llega.
    nivel = niveles.find((nv) => entra(nv, o) && llega(nv, o)) ?? alto;
  }
  if (fijo !== null && !llega(nivel, o)) {
    const rec = resolverAltura(o, null);
    if (rec.ok && rec.nivel.plataforma > nivel.plataforma && (rec.llega || rec.nivel.peldano === null)) return { ok: false, motivo: "no_llega", nivel };
  }
  return { ok: true, nivel, llega: llega(nivel, o) };
}

/** «El techo está a 5 m: no llega a trabajar cómodo en el techo» o «Tiene que trabajar hasta 3 m: no llega cómodo hasta ahí». */
export function textoNoLlega(n: { hasta: number; enTecho: boolean }): string {
  return n.enTecho
    ? `El techo está a ${metros(n.hasta)} m: no llega a trabajar cómodo en el techo`
    : `Tiene que trabajar hasta ${metros(n.hasta)} m: no llega cómodo hasta ahí`;
}

/** «el peldaño de 0,80 m», «el peldaño de 0,80 m del segundo módulo». En metros. */
export function textoPeldano(peldano: number, modulos: number): string {
  const ordinal = ["", "primer", "segundo", "tercer"][modulos] ?? `${modulos}.º`;
  return `el peldaño de ${metros(peldano)} m${modulos > 1 ? ` del ${ordinal} módulo` : ""}`;
}

// ── El resultado ───────────────────────────────────────────────────────────────────────

export type CodigoMotivoAlquiler =
  | "para_hoy" | "altura" | "anclar" | "techo_no_deja" | "plataforma_rechazada" | "espacio" | "espacio_ancho" | "espacio_largo"
  | "flete" | "sin_flete" | "deposito" | "fuera_de_caba" | "piezas_fuera" | "montaje" | "tope_modulos"
  | "palabras" | "bandera" | "gama_alta" | "deuda" | "cuenta_socio";

/**
 * Una línea de «Por qué es fácil» en la tarjeta del equipo: ✓ si ok, ✗ si no. Mismo formato que
 * Motivo de facil.ts. `cliente`: quién lo pide (deuda, socios); NUNCA llega a Tomás.
 */
export type MotivoAlquiler = { codigo: CodigoMotivoAlquiler; ok: boolean; texto: string; grupo: "trabajo" | "cliente" };

export type CodigoFaltante = "lugar" | "altura" | "techo" | "ancho" | "largo" | "piso" | "direccion" | "fecha" | "franja";
/** Un dato que falta, con la pregunta para Tomás (sin montos). */
export type DatoFaltante = { codigo: CodigoFaltante; pregunta: string };

/**
 * plataforma: un tablón en un peldaño, o una plataforma que no llega cómodo al techo (fila 19) ·
 * deposito: la obra está en provincia y no se entrega: ¿lo retira en el depósito? (fila 16) ·
 * piezas_no_sirven: lo que pidió no le sirve · fecha: la fecha no se puede.
 */
export type CodigoConfirmacion = "plataforma" | "deposito" | "piezas_no_sirven" | "fecha";
/** Algo que Tomás tiene que confirmar con el cliente antes de la tarjeta (sin montos). */
export type Confirmacion = { codigo: CodigoConfirmacion; texto: string };

export type Armado = {
  /** cliente: lo que pidió, validado y completado · recomendado: lo que arman las reglas. */
  origen: "cliente" | "recomendado";
  torres: number;
  modulosPorTorre: number;
  ancho: Ancho;
  largo: Largo;
  apoyo: Apoyo;
  /** Metros, desde el piso. */
  alturaPlataforma: number;
  /**
   * null: la plataforma va arriba. Si no, el peldaño (0,40 / 0,80 / 1,20, desde abajo de su
   * módulo) del módulo de arriba de la torre: un solo tablón de 30 cm (fila 19).
   */
  peldano: number | null;
  /** Hasta dónde trabaja cómodo (plataforma + 2 m). */
  llegaHasta: number;
  /** Hasta dónde llega la cabeza (plataforma + 1,90 m). */
  cabezaHasta: number;
  /**
   * Lo que la plataforma no alcanza cómodo (plataforma + 2 m): el techo (si el trabajo es en el
   * techo, a más de 10 cm) o la altura de trabajo. Se cotiza igual y se confirma con el cliente
   * (fila 19). null: llega.
   */
  noLlega: { hasta: number; enTecho: boolean } | null;
  tablonesPorTorre: number;
  /** La baranda se cobra siempre; si el cliente no la quiere, no se lleva (fila 8). */
  barandaSeLleva: boolean;
  /** Para la orden, ya sumadas todas las torres. */
  piezas: { codigo: CodigoPieza; cantidad: number }[];
  /** Lo que se completó o se cambió de lo que pidió el cliente, y por qué. Sin montos. */
  ajustes: string[];
};

export type LineaAlquiler = { codigo: CodigoLinea; descripcion: string; cantidad: number; precioUnitario: number; importe: number };

/** Todo neto: el IVA no se suma acá (se cotiza siempre «+ IVA»). */
export type PrecioAlquiler = {
  lineas: LineaAlquiler[];
  material: number;
  /** 0 si retira en el depósito (no hay línea de flete). */
  flete: number;
  /** La línea «MÍNIMO OPERATIVO»: la diferencia hasta el mínimo, o 0 si llega. */
  minimoOperativo: number;
  /** El servicio de 30 días con la entrega y el retiro (o retirando en el depósito): material + flete + mínimo. */
  base: number;
  /** El recargo de la franja de una hora, sobre `base` (fila 15). 0 si no hay. */
  recargoFranja: number;
  /** Lo que paga: base + recargo. */
  total: number;
  /** El porcentaje con el que se calculó el recargo (de Parámetros), para el texto. */
  recargoFranjaPct: number;
  /** La renovación por día: base ÷ 30, redondeada (para el texto; ver montoRenovacion). */
  porDia: number;
};

/** Lo que le entra sin pagar más cuando no llega al mínimo (§7). Sin montos. */
export type SugerenciaMinimo = { tipo: "otra_torre"; cantidad: number } | { tipo: "modulo_mas"; llegaHasta: number };

/** envio: lo llevamos y lo retiramos (sólo CABA) · deposito: lo retira y lo devuelve él (fila 17). */
export type Modalidad = "envio" | "deposito";

export type ResultadoAlquiler = {
  modalidad: Modalidad;
  /** Sin ningún motivo en contra: el trabajo y el cliente. */
  facil: boolean;
  /** El trabajo es fácil aunque el cliente no (deuda, socios): igual se arma, lo ve una persona. */
  trabajoFacil: boolean;
  /** Fácil, sin datos que falten ni nada que confirmar, con precio: va a la tarjeta. */
  listo: boolean;
  motivos: MotivoAlquiler[];
  enContra: MotivoAlquiler[];
  faltan: DatoFaltante[];
  aConfirmar: Confirmacion[];
  armado: Armado | null;
  /** null si no hay armado, o si va con envío y el flete no está en la lista. */
  precio: PrecioAlquiler | null;
  entrega: ResultadoEntrega | null;
  /** La franja ya pasada a la de la modalidad (franjaSegunModalidad). */
  franja: Franja | null;
  entraSinPagarMas: SugerenciaMinimo[];
  flete: FleteAlquiler | null;
};

// ── Lo del cliente (facil.ts, filtrado) ────────────────────────────────────────────────

/**
 * Las alertas de facil.ts que aplican al alquiler. Las otras son de la bandeja o son el pedido
 * mismo, y harían «no fácil» a casi todos:
 *   · fecha: Tomás pregunta para cuándo; «para hoy» lo marca `paraHoy` o validarEntrega;
 *   · otro_trabajo: «andamio», «módulos», «ruedas», «techo», «escalera» son el pedido;
 *   · esquina y tramo: son del frente de la bandeja;
 *   · nocturno: la entrega es de día (validarEntrega); de noche trabaja el cliente;
 *   · seguridad: «la vereda está rota» (piso desparejo) o «golpearme la cabeza» (el techo) son
 *     datos del pedido. Lo que la IA marque como problema de seguridad sí cuenta (BANDERAS).
 */
export const ALERTAS_ALQUILER: readonly CodigoAlerta[] = ["descuento", "enojo", "persona", "gama_alta"];
/** Las banderas de la IA que aplican al alquiler (las de fecha, noche, tramo y otro trabajo no). */
export const BANDERAS_ALQUILER: readonly BanderaIA[] = ["descuento", "condiciones", "enojo", "seguridad", "persona"];

const TEXTO_BANDERA: Partial<Record<BanderaIA, string>> = {
  descuento: "La IA marcó: pide descuento o regatea",
  condiciones: "La IA marcó: condiciones especiales",
  enojo: "La IA marcó: enojo o reclamo",
  seguridad: "La IA marcó: problema de seguridad",
  persona: "La IA marcó: pide hablar con una persona",
};

/** Las palabras de alerta, la gama alta, la deuda y la cuenta de los socios, para la tarjeta. */
export function motivosDelCliente(c: ClienteAlquiler): MotivoAlquiler[] {
  const motivos: MotivoAlquiler[] = [];
  const alertas = c.mensajesCliente.flatMap(escanearPalabras).filter((a) => ALERTAS_ALQUILER.includes(a.codigo));
  const porCodigo = new Map<CodigoAlerta, (typeof alertas)[number]>();
  for (const a of alertas) if (!porCodigo.has(a.codigo)) porCodigo.set(a.codigo, a);
  const gama = porCodigo.get("gama_alta");
  porCodigo.delete("gama_alta");
  if (gama || c.segmento === "gama_alta") motivos.push({ codigo: "gama_alta", ok: false, texto: gama?.texto ?? TEXTO_GAMA_ALTA, grupo: "trabajo" });
  for (const a of porCodigo.values()) motivos.push({ codigo: "palabras", ok: false, texto: `${a.texto} («${a.palabra}»)`, grupo: "trabajo" });
  const banderas = [...new Set(c.banderas)].filter((b) => BANDERAS_ALQUILER.includes(b));
  for (const b of banderas) motivos.push({ codigo: "bandera", ok: false, texto: TEXTO_BANDERA[b] ?? `La IA marcó: ${b}`, grupo: "trabajo" });
  if (!motivos.length) motivos.push({ codigo: "palabras", ok: true, texto: "Sin palabras de alerta", grupo: "trabajo" });
  const d = c.deudaVencida;
  motivos.push({ codigo: "deuda", ok: d === false, texto: d === false ? "Sin deuda vencida" : d ? "Tiene deuda vencida (no decírselo al cliente)" : "No se pudo revisar la deuda", grupo: "cliente" });
  if (c.cuentaSocio) motivos.push({ codigo: "cuenta_socio", ok: false, texto: "Cuenta de los socios: no se le cotiza", grupo: "cliente" });
  return motivos;
}

// ── cotizarAlquilerSimple ──────────────────────────────────────────────────────────────

const positivo = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
const entero = (n: number | null | undefined, min: number): number | null => (typeof n === "number" && Number.isInteger(n) && n >= min ? n : null);
const ANCHO_TXT: Record<Ancho, string> = { estandar: "estándar (1,30)", angosto: "angosto (0,90)" };
const LARGO_TXT: Record<Largo, string> = { largo: "de 2,50", junior: "junior (1,50)" };

const PREGUNTA: Record<CodigoFaltante, string> = {
  lugar: "¿Es adentro o afuera?",
  altura: "¿Qué trabajo van a hacer y hasta qué altura tienen que llegar?",
  techo: "¿Cuánto mide el techo?",
  ancho: "¿Cuánto espacio libre hay de ancho en el piso?",
  largo: "¿Cuánto espacio libre hay de largo en el piso?",
  piso: "¿El piso es liso, o desparejo (vereda rota, tierra, un escalón)?",
  direccion: "¿Dónde es? (para el flete)",
  fecha: "¿Para cuándo lo necesitan?",
  franja: "¿Te queda mejor de 8 a 12 o de 13 a 16?",
};
/** En el depósito no hace falta la dirección y las franjas son otras (fila 17). */
const PREGUNTA_DEPOSITO: Partial<Record<CodigoFaltante, string>> = {
  fecha: "¿Qué día querés pasar a retirarlo por el depósito?",
  franja: "¿Pasás de 10 a 12 o de 13 a 16?",
};

/**
 * El pedido de alquiler simple: el armado (§4), el precio (§5), la entrega o el retiro en el
 * depósito (§6) y si es fácil (§8). Nunca tira: lo que falta va en `faltan`, lo que se sale de las
 * reglas en `enContra`.
 */
export function cotizarAlquilerSimple(pedido: PedidoAlquiler, ctx: ContextoAlquiler): ResultadoAlquiler {
  const p = ctx.parametros;
  const motivos: MotivoAlquiler[] = [];
  const faltan: DatoFaltante[] = [];
  const aConfirmar: Confirmacion[] = [];
  // Lo retira en el depósito (fila 17). Los pedidos guardados antes no tienen el campo: envío.
  const deposito = pedido.retiraEnDeposito === true;
  const modalidad: Modalidad = deposito ? "deposito" : "envio";
  const trabajo = (codigo: CodigoMotivoAlquiler, ok: boolean, texto: string) => motivos.push({ codigo, ok, texto, grupo: "trabajo" });
  const falta = (codigo: CodigoFaltante) => {
    if (!faltan.some((f) => f.codigo === codigo)) faltan.push({ codigo, pregunta: (deposito ? PREGUNTA_DEPOSITO[codigo] : undefined) ?? PREGUNTA[codigo] });
  };

  // Lo que pidió el cliente, si es válido (una cantidad de módulos entera y positiva).
  const pedidas = pedido.piezas && entero(pedido.piezas.modulosPorTorre, 1) !== null ? pedido.piezas : null;

  // La franja de la modalidad: en el depósito, de 10 a 12 o de 13 a 16 (una de una hora no existe).
  const franja = franjaSegunModalidad(pedido.franja ?? null, deposito);

  // §8: para hoy. La fecha se valida igual, para ofrecer la próxima.
  const entrega = pedido.fecha ? validarEntrega(pedido.fecha, franja, ctx.hoy, ctx.feriados, { deposito, ahora: ctx.ahora }) : null;
  const paraHoy = pedido.paraHoy || entrega?.motivo === "hoy";
  trabajo("para_hoy", !paraHoy, paraHoy
    ? (deposito ? "Lo quiere retirar hoy: el retiro en el depósito es desde el día siguiente" : "Lo necesita para hoy: la entrega es desde el día siguiente")
    : "No es para hoy");

  // ── La altura ──
  const techo = positivo(pedido.alturaTecho) ? cm(pedido.alturaTecho) : null;
  const trabajoAlto = positivo(pedido.alturaTrabajo) ? cm(pedido.alturaTrabajo) : null;
  // Si tiene que llegar hasta el techo (o a 10 cm), es trabajar en el techo.
  const enTecho = pedido.trabajoEnTecho || (techo !== null && trabajoAlto !== null && trabajoAlto >= techo - HASTA_EL_TECHO);
  if (pedido.lugar === null && techo === null && !enTecho) falta("lugar");
  if ((pedido.lugar === "adentro" || enTecho) && techo === null) falta("techo");
  if (!enTecho && trabajoAlto === null) falta("altura");

  let altura: SolucionAltura | null = null;
  let recomendada: SolucionAltura | null = null;
  const objetivo: Objetivo | null =
    // En el techo: que la plataforma + 2 m quede a 10 cm del techo o menos (si no, se confirma).
    enTecho && techo !== null ? { llegar: techo - HASTA_EL_TECHO, techo, enTecho: true }
    : !enTecho && trabajoAlto !== null && !(pedido.lugar === "adentro" && techo === null) ? { llegar: trabajoAlto, techo, enTecho: false }
    : null;
  if (objetivo) {
    recomendada = resolverAltura(objetivo, null);
    altura = pedidas ? resolverAltura(objetivo, pedidas.modulosPorTorre) : recomendada;
  }
  // «al techo de 5 m» o «a 5 m»: lo que tiene que alcanzar, con la preposición.
  const aObjetivo = objetivo ? (objetivo.enTecho ? `al techo de ${metros((techo as number) / 100)} m` : `a ${metros(objetivo.llegar / 100)} m`) : "";
  const modulosTxt = (n: number) => `${n} ${n === 1 ? "módulo" : "módulos"}`;
  const nivelTxt = (nv: Nivel) => (nv.peldano !== null ? `con un tablón en ${textoPeldano(nv.peldano / 100, nv.modulos)}` : `arriba de ${modulosTxt(nv.modulos)}`);

  // Lo que pidió no le sirve: se cotiza lo recomendado y Tomás lo confirma con el cliente.
  let origen: Armado["origen"] = pedidas ? "cliente" : "recomendado";
  if (pedidas && altura && !altura.ok && altura.motivo !== "anclar" && recomendada && !recomendada.ok) {
    // Ni lo que pidió ni lo recomendado: manda el motivo de las reglas (anclar o el techo).
    altura = recomendada;
  } else if (pedidas && altura && !altura.ok && altura.motivo !== "anclar" && recomendada?.ok) {
    const n = pedidas.modulosPorTorre;
    const r = recomendada.nivel;
    const nv = altura.nivel ?? arriba(n);
    const porque = altura.motivo === "no_llega"
      ? `con ${modulosTxt(n)} llega hasta ~${metros((nv.plataforma + ALCANCE) / 100)} m y tiene que llegar ${aObjetivo}`
      : `con ${modulosTxt(n)} la plataforma queda a ${metros(arriba(n).plataforma / 100)} m y no entra la cabeza (techo de ${metros((techo as number) / 100)} m)`;
    aConfirmar.push({
      codigo: "piezas_no_sirven",
      texto: `Lo que pidió no le sirve: ${porque}. Se cotiza lo que ${recomendada.llega ? "sí le sirve" : "más se acerca"}, ${modulosTxt(r.modulos)}${r.peldano !== null ? ` con la plataforma en ${textoPeldano(r.peldano / 100, r.modulos)}` : ""}: confirmalo con el cliente.`,
    });
    altura = recomendada;
    origen = "recomendado";
  }

  if (pedido.anclar) trabajo("anclar", false, "Dice que hay que anclar el andamio");
  if (altura && !altura.ok) {
    if (altura.motivo === "anclar") {
      trabajo("anclar", false, pedidas && pedidas.modulosPorTorre > MAX_SIN_ANCLAR
        ? `Pide ${pedidas.modulosPorTorre} módulos de alto: más de ${MAX_SIN_ANCLAR} hay que anclar`
        : `Tiene que llegar ${aObjetivo}: sin anclar llega hasta ~${metros((arriba(MAX_SIN_ANCLAR).plataforma + ALCANCE) / 100)} m con ${MAX_SIN_ANCLAR} módulos`);
    } else {
      // Ninguna plataforma posible: la cabeza no entra en ninguna (un techo de menos de 2,45 m).
      // Si entra en alguna pero ninguna llega, no es esto: se cotiza la más alta y se confirma.
      trabajo("techo_no_deja", false, `Techo de ${metros((techo as number) / 100)} m: no deja pararse con la cabeza adentro en ninguna plataforma, ni con un tablón en el peldaño más bajo`);
    }
  }
  const nivel = altura?.ok ? altura.nivel : null;
  // Lo que no alcanza cómodo: el techo, o la altura de trabajo (fila 19 y revisión del 12/11).
  const noLlega: Armado["noLlega"] = altura?.ok && !altura.llega && objetivo
    ? { hasta: (objetivo.enTecho ? (techo as number) : objetivo.llegar) / 100, enTecho: objetivo.enTecho }
    : null;
  if (nivel) {
    if (pedido.aceptaPlataforma === false && (nivel.peldano !== null || noLlega)) {
      trabajo("plataforma_rechazada", false, `No le sirve la plataforma que se puede armar (a ${metros(nivel.plataforma / 100)} m, ${nivelTxt(nivel)})`);
    } else if (!pedido.anclar) {
      trabajo("altura", true, `Llega a ~${metros((nivel.plataforma + ALCANCE) / 100)} m con ${modulosTxt(nivel.modulos)}${nivel.peldano !== null ? ` (plataforma en ${textoPeldano(nivel.peldano / 100, nivel.modulos)})` : ""}, sin anclar`);
    }
    // El peldaño (un tablón) o una plataforma que no llega cómodo: se confirma (fila 19).
    if ((nivel.peldano !== null || noLlega) && pedido.aceptaPlataforma === null) {
      const donde = nivel.peldano !== null
        ? `La plataforma va en ${textoPeldano(nivel.peldano / 100, nivel.modulos)} de la escalera del bastidor, a ${metros(nivel.plataforma / 100)} m del piso: es de un solo tablón de 30 cm.`
        : `La plataforma queda arriba de ${modulosTxt(nivel.modulos)}, a ${metros(nivel.plataforma / 100)} m del piso.`;
      const alTecho = noLlega ? ` ${textoNoLlega(noLlega)}.` : "";
      aConfirmar.push({
        codigo: "plataforma",
        texto: `${donde} La cabeza llega a ${metros((nivel.plataforma + CABEZA) / 100)} m y trabaja cómodo hasta ~${metros((nivel.plataforma + ALCANCE) / 100)} m.${alTecho} Aclaráselo y preguntale si le sirve.`,
      });
    }
  }

  // ── El ancho y el largo ──
  const ajustes: string[] = [];
  const espacio = (libre: number | null, umbralGrande: number, umbralChico: number) =>
    pedido.espacioDeSobra ? "grande" : libre === null ? null : libre >= umbralGrande ? "grande" : libre >= umbralChico ? "chico" : "no_entra";
  const anchoLibre = positivo(pedido.anchoLibre) ? cm(pedido.anchoLibre) : null;
  const largoLibre = positivo(pedido.largoLibre) ? cm(pedido.largoLibre) : positivo(pedido.largoACubrir) ? cm(pedido.largoACubrir) : null;
  const eAncho = espacio(anchoLibre, 130, 90);
  const eLargo = espacio(largoLibre, 250, 150);
  let ancho: Ancho | null = eAncho === "grande" ? "estandar" : eAncho === "chico" ? "angosto" : null;
  let largo: Largo | null = eLargo === "grande" ? "largo" : eLargo === "chico" ? "junior" : null;
  if (pedidas?.ancho) {
    if (pedidas.ancho === "estandar" && ancho === "angosto") ajustes.push(`Pidió el estándar (1,30), pero tiene ${metros((anchoLibre as number) / 100)} m libres de ancho: va el angosto (0,90).`);
    else ancho = eAncho === "no_entra" ? null : pedidas.ancho;
  }
  if (pedidas?.largo) {
    if (pedidas.largo === "largo" && largo === "junior") ajustes.push(`Pidió el de 2,50, pero tiene ${metros((largoLibre as number) / 100)} m libres de largo: va el junior (1,50).`);
    else largo = eLargo === "no_entra" ? null : pedidas.largo;
  }
  if (eAncho === "no_entra") trabajo("espacio_ancho", false, `Hay ${metros((anchoLibre as number) / 100)} m libres de ancho: el angosto necesita 0,90`);
  else if (ancho === null) falta("ancho");
  if (eLargo === "no_entra") trabajo("espacio_largo", false, `Hay ${metros((largoLibre as number) / 100)} m libres de largo: el junior necesita 1,50`);
  else if (largo === null) falta("largo");
  if (ancho && largo) trabajo("espacio", true, `Entra el ${ANCHO_TXT[ancho]} ${LARGO_TXT[largo]}`);

  // ── Ruedas o tornillones ──
  let apoyo: Apoyo | null = pedidas?.apoyo ?? (pedido.piso === "liso" ? "ruedas" : pedido.piso === "desparejo" ? "tornillones" : null);
  if (apoyo === "ruedas" && pedido.piso === "desparejo") {
    apoyo = "tornillones";
    if (pedidas?.apoyo === "ruedas") ajustes.push("Pidió ruedas, pero el piso es desparejo: van tornillones, que se regulan para que quede a nivel.");
  }
  if (!apoyo) falta("piso");

  // ── Las torres y las piezas ──
  const modulosPorTorre = nivel?.modulos ?? null;
  const largoTorre = largo ? cm(LARGO_M[largo]) : null;
  const porLargo = positivo(pedido.largoACubrir) && largoTorre ? Math.ceil(cm(pedido.largoACubrir) / largoTorre) : 1;
  const torres = Math.max(entero(pedidas?.torres, 1) ?? entero(pedido.torres, 1) ?? 1, porLargo);
  if (modulosPorTorre !== null) {
    const total = modulosPorTorre * torres;
    trabajo("tope_modulos", total <= p.maxModulos, total <= p.maxModulos
      ? `${total} ${total === 1 ? "módulo" : "módulos"} en total (tope ${p.maxModulos})`
      : `${total} módulos en total: pasa el tope de ${p.maxModulos}`);
  }

  let armado: Armado | null = null;
  if (nivel && ancho && largo && apoyo && modulosPorTorre !== null) {
    const piso = TABLONES_PISO[ancho];
    const pedidosTablones = entero(pedidas?.tablonesPorTorre, 0);
    if (pedidosTablones !== null && pedidosTablones < piso) {
      ajustes.push(`Pidió ${pedidosTablones} ${pedidosTablones === 1 ? "tablón" : "tablones"}: va el piso completo, ${piso} en el ${ancho === "estandar" ? "de 1,30" : "de 0,90"}, para pararse con seguridad.`);
    }
    const tablonesPorTorre = Math.max(piso, pedidosTablones ?? 0);
    const barandaSeLleva = pedidas?.conBaranda !== false;
    if (!barandaSeLleva) ajustes.push("No quiere la baranda: va siempre en el precio, así que no se lleva pero se cobra igual.");
    armado = {
      origen,
      torres,
      modulosPorTorre,
      ancho,
      largo,
      apoyo,
      alturaPlataforma: nivel.plataforma / 100,
      peldano: nivel.peldano === null ? null : nivel.peldano / 100,
      llegaHasta: (nivel.plataforma + ALCANCE) / 100,
      cabezaHasta: (nivel.plataforma + CABEZA) / 100,
      noLlega,
      tablonesPorTorre,
      barandaSeLleva,
      piezas: [
        { codigo: codigoModulo(ancho, largo), cantidad: modulosPorTorre * torres },
        { codigo: codigoBaranda(ancho), cantidad: torres },
        { codigo: codigoTablon(largo), cantidad: tablonesPorTorre * torres },
        { codigo: codigoApoyo(apoyo), cantidad: torres },
      ],
      ajustes,
    };
  }

  // ── El flete, o el depósito ──
  // En provincia no se entrega ni se retira (fila 16): se le ofrece el depósito. En CABA puede
  // elegirlo igual (fila 17). En el depósito no hace falta la dirección.
  const flete = ctx.flete;
  if (deposito) {
    trabajo("deposito", true, `Retira y devuelve en el depósito (${DEPOSITO.texto}): sin flete`);
  } else if (!flete) {
    falta("direccion");
  } else if (flete.tipo === "provincia") {
    const lugar = flete.lugar ? `en ${flete.lugar} (provincia)` : "en provincia";
    if (pedido.retiraEnDeposito === false) {
      trabajo("fuera_de_caba", false, `La obra está ${lugar}: no entregamos ni retiramos fuera de CABA, y no puede retirarlo en el depósito`);
    } else {
      aConfirmar.push({
        codigo: "deposito",
        texto: `La obra está ${lugar}: no entregamos ni retiramos fuera de CABA. Ofrecele retirarlo en nuestro depósito, en ${DEPOSITO.texto}, de lunes a viernes de 10 a 12 o de 13 a 16, viniendo con su vehículo y gente para cargarlo. Anotá lo que conteste (retira_en_deposito).`,
      });
    }
  } else if (flete.tipo === "fuera_de_lista") {
    trabajo("sin_flete", false, flete.barrio ? `El barrio «${flete.barrio}» no está en la lista de fletes` : "No se encontró el barrio en la lista de fletes");
  } else {
    trabajo("flete", true, `Flete ${flete.barrio} (entrega y retiro)`);
  }

  // §8: piezas fuera de la §2 y montaje.
  const fuera = pedido.piezasFueraDeCatalogo.map((x) => x.trim()).filter(Boolean);
  if (fuera.length) trabajo("piezas_fuera", false, `Pide piezas que no son del alquiler simple: ${fuera.join(", ")}`);
  if (pedido.montaje) trabajo("montaje", false, "Pide montaje");

  // ── La fecha ──
  if (!pedido.fecha) {
    if (!paraHoy) falta("fecha");
  } else if (entrega && !entrega.ok && entrega.motivo !== "hoy") {
    const prox = entrega.proxima;
    aConfirmar.push({
      codigo: "fecha",
      texto: `${entrega.texto}.${prox ? ` La próxima posible: el ${textoFecha(prox.fecha)}${prox.franja ? `, ${textoFranja(prox.franja)}` : ""}.` : ""}`,
    });
  }
  if (!franja && !paraHoy) falta("franja");

  // ── El cliente ──
  if (ctx.cliente) motivos.push(...motivosDelCliente(ctx.cliente));

  // ── El precio ──
  const precio = !armado ? null
    : deposito ? calcularPrecio(armado, null, franja, p)
    : flete?.tipo === "lista" ? calcularPrecio(armado, flete, franja, p)
    : null;
  const entraSinPagarMas = armado && precio ? sugerenciasMinimo(armado, precio, techo, p) : [];

  const enContra = motivos.filter((m) => !m.ok);
  const facil = enContra.length === 0;
  return {
    modalidad,
    facil,
    trabajoFacil: !enContra.some((m) => m.grupo === "trabajo"),
    listo: facil && faltan.length === 0 && aConfirmar.length === 0 && precio !== null,
    motivos,
    enContra,
    faltan,
    aConfirmar,
    armado,
    precio,
    entrega,
    franja,
    entraSinPagarMas,
    flete,
  };
}

// ── El precio (§5) ─────────────────────────────────────────────────────────────────────

/**
 * Un solo total por 30 días: las piezas, el flete del barrio (una línea, entrega y retiro), la
 * diferencia hasta el mínimo operativo y, si pide una franja de una hora, el recargo.
 *
 * DECISIÓN (fila 15, «sobre el total del servicio»): el recargo se calcula DESPUÉS de completar
 * el mínimo, sobre el servicio entero (material + flete + mínimo). Es el ejemplo de JS: el de
 * Palermo sale $ 500.000 con el mínimo y el recargo da $ 100.000. Y la renovación por día sale
 * de la base SIN el recargo: el recargo paga una entrega a una hora fija, no el alquiler («el
 * total con el flete ÷ 30», §5). Por eso tampoco lo lleva la renovación (fila 21).
 *
 * `flete` null: retira en el depósito (fila 17). No hay línea de flete, pero el mínimo operativo
 * se cobra igual (todo material + mínimo) y no hay recargo de franja (no aplica en el depósito).
 */
export function calcularPrecio(armado: Armado, flete: { barrio: string; monto: number } | null, franja: Franja | null, p: ParametrosAlquiler): PrecioAlquiler {
  const unitario = (c: CodigoPieza) => (c === "ruedas_juego" ? p.ruedasJuego : c === "tornillones_juego" ? p.tornillonesJuego : p.precioPieza);
  const lineas: LineaAlquiler[] = armado.piezas
    .filter((x) => x.cantidad > 0)
    .map((x) => ({ codigo: x.codigo, descripcion: DESCRIPCION_PIEZA[x.codigo], cantidad: x.cantidad, precioUnitario: unitario(x.codigo), importe: x.cantidad * unitario(x.codigo) }));
  const material = lineas.reduce((s, l) => s + l.importe, 0);
  const montoFlete = flete ? Math.max(0, Math.round(flete.monto)) : 0;
  if (flete) lineas.push({ codigo: "flete", descripcion: `Flete ${flete.barrio} (entrega y retiro)`, cantidad: 1, precioUnitario: montoFlete, importe: montoFlete });
  const minimoOperativo = Math.max(0, p.minimoOperativo - material - montoFlete);
  if (minimoOperativo > 0) lineas.push({ codigo: "minimo_operativo", descripcion: "Mínimo operativo", cantidad: 1, precioUnitario: minimoOperativo, importe: minimoOperativo });
  const base = material + montoFlete + minimoOperativo;
  const recargoFranja = flete && franja?.tipo === "hora" ? Math.round((base * p.recargoFranjaPct) / 100) : 0;
  if (recargoFranja > 0) {
    lineas.push({ codigo: "recargo_franja", descripcion: `Recargo por franja de una hora (${textoFranja(franja as Franja)}, ${p.recargoFranjaPct} %)`, cantidad: 1, precioUnitario: recargoFranja, importe: recargoFranja });
  }
  return { lineas, material, flete: montoFlete, minimoOperativo, base, recargoFranja, recargoFranjaPct: recargoFranja > 0 ? p.recargoFranjaPct : 0, total: base + recargoFranja, porDia: Math.round(base / 30) };
}

/**
 * La renovación (más de 30 días, o vencido sin aviso): el servicio con el flete ÷ 30 por día
 * (§5 y filas 7 y 12). Se redondea al final: 500.000 ÷ 30 × 10 = 166.667, no 16.667 × 10.
 */
export function montoRenovacion(base: number, dias: number): number {
  return Math.round((base * dias) / 30);
}

/**
 * Lo que le entra sin pagar más si no llega al mínimo (§7): otra torre igual, o un módulo más de
 * alto en cada torre (si no hay que anclar, entra la cabeza y no va en el peldaño). Siempre
 * dentro del tope de módulos. El piso completo ya va siempre.
 */
function sugerenciasMinimo(a: Armado, precio: PrecioAlquiler, techo: number | null, p: ParametrosAlquiler): SugerenciaMinimo[] {
  const margen = precio.minimoOperativo;
  if (margen <= 0) return [];
  const s: SugerenciaMinimo[] = [];
  // Las torres son iguales: el material de una es el total dividido por la cantidad.
  const porTorre = precio.material / a.torres;
  const modulos = a.modulosPorTorre * a.torres;
  const torresMas = Math.min(Math.floor(margen / porTorre), Math.floor((p.maxModulos - modulos) / a.modulosPorTorre));
  if (torresMas >= 1) s.push({ tipo: "otra_torre", cantidad: torresMas });
  const n = a.modulosPorTorre + 1;
  const nv = arriba(n);
  if (a.peldano === null && n <= MAX_SIN_ANCLAR && p.precioPieza * a.torres <= margen && modulos + a.torres <= p.maxModulos && (techo === null || nv.plataforma + CABEZA <= techo)) {
    s.push({ tipo: "modulo_mas", llegaHasta: (nv.plataforma + ALCANCE) / 100 });
  }
  return s;
}

// ── Lo que ve Tomás (sin plata) ────────────────────────────────────────────────────────

/** Por qué no es fácil, en palabras que Tomás puede usar. Sólo los del grupo «trabajo». */
const POR_QUE_NO: Partial<Record<CodigoMotivoAlquiler, string>> = {
  para_hoy: "lo necesita para hoy y la entrega es desde el día siguiente",
  anclar: "hay que anclar el andamio",
  techo_no_deja: "con ese techo, ninguna plataforma deja trabajar con la cabeza adentro y llegar a donde tiene que trabajar, ni con un tablón en un peldaño",
  plataforma_rechazada: "no le sirve la plataforma que se puede armar",
  espacio_ancho: "el espacio es más angosto que el andamio angosto",
  espacio_largo: "el espacio es más corto que el andamio junior",
  sin_flete: "el barrio no está en la lista de fletes",
  fuera_de_caba: "la obra está en provincia (no entregamos ni retiramos fuera de CABA) y no puede retirarlo en el depósito",
  piezas_fuera: "pide piezas que no son del alquiler simple",
  montaje: "pide montaje",
  tope_modulos: "son más módulos de los que se cotizan directo",
  palabras: "escribió algo que tiene que ver una persona",
  bandera: "marcaste algo que tiene que ver una persona",
  gama_alta: "es un cliente de gama alta",
};

/**
 * Provincia y no puede retirarlo en el depósito (JS, 12/11, fila 23): Tomás se lo dice directo y
 * con amabilidad. No se deriva: la charla queda como cualquier otra. Sin montos.
 */
export const MENSAJE_PROVINCIA =
  "La obra está en provincia y no puede retirarlo en el depósito: decile directamente y con amabilidad que no llegamos con entregas a provincia (entregamos y retiramos sólo en Capital), y que si más adelante puede pasar a buscarlo por el depósito, se lo preparamos.";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «1 torre de 2 módulos estándar (1,30) de 2,50, con la baranda arriba, …». Sin montos. */
export function describirArmado(a: Armado): string {
  const torres = a.torres === 1 ? "1 torre" : `${a.torres} torres iguales`;
  const apoyo = a.apoyo === "ruedas" ? "ruedas con freno" : "tornillones (bases regulables) para el piso desparejo";
  const baranda = a.barandaSeLleva ? "la baranda arriba" : "la baranda (no la quiere: no se lleva)";
  return `${torres} de ${plural(a.modulosPorTorre, "módulo", "módulos")} ${ANCHO_TXT[a.ancho]} ${LARGO_TXT[a.largo]}, con ${baranda}, piso completo de ${plural(a.tablonesPorTorre, "tablón", "tablones")} y ${apoyo}`;
}

/**
 * Lo que Tomás puede saber del pedido: el armado, hasta dónde llega, lo que falta y lo que tiene
 * que confirmar. SIN NINGÚN MONTO NI PORCENTAJE (pasa limpio por detectarPlata: tests), y sin lo
 * del grupo «cliente»: con o sin deuda, el texto es el mismo.
 */
export function resumenParaTomas(r: ResultadoAlquiler): string {
  const l: string[] = [];
  const enContra = r.enContra.filter((m) => m.grupo === "trabajo");
  if (enContra.length === 1 && enContra[0].codigo === "fuera_de_caba") {
    // Provincia y no puede retirarlo (fila 23): no es para un vendedor, es un no amable.
    l.push(`${MENSAJE_PROVINCIA} No lo pases a nadie del equipo y no ofrezcas escaleras.`);
  } else if (enContra.length) {
    const motivos = [...new Set(enContra.map((m) => POR_QUE_NO[m.codigo] ?? "lo tiene que ver una persona"))];
    l.push(`No es un alquiler simple que se cotice directo: ${motivos.join("; ")}. Pasalo al equipo con un resumen y decile al cliente que lo ve un vendedor para que quede bien. No ofrezcas escaleras.`);
  }
  if (r.faltan.length) l.push(`Falta saber: ${r.faltan.map((f) => f.pregunta).join(" ")}`);

  const a = r.armado;
  if (a) {
    l.push(`${a.origen === "cliente" ? "Lo que pidió, revisado" : "Lo recomendado"}: ${describirArmado(a)}.`);
    if (a.torres > 1) l.push("Si van en fila, cada torre se cobra entera.");
    const alTecho = a.noLlega ? ` ${textoNoLlega(a.noLlega)}: aclaráselo.` : "";
    if (a.peldano === null) {
      l.push(`La plataforma queda arriba, a ${metros(a.alturaPlataforma)} m, y trabaja cómodo hasta ~${metros(a.llegaHasta)} m (la cabeza llega a ${metros(a.cabezaHasta)} m).${alTecho}`);
    } else {
      l.push(`La plataforma va como alternativa en ${textoPeldano(a.peldano, a.modulosPorTorre)} de la escalera del bastidor, a ${metros(a.alturaPlataforma)} m del piso. Es de un solo tablón de 30 cm (aclaráselo), la cabeza llega a ${metros(a.cabezaHasta)} m y trabaja cómodo hasta ~${metros(a.llegaHasta)} m.${alTecho} El servicio es el mismo que con la plataforma arriba. Si no le sirve, pasa a un vendedor.`);
    }
    l.push("La baranda va siempre incluida: si no la quiere, no se lleva, pero el servicio es el mismo. No la negocies.");
    for (const x of a.ajustes) l.push(x);
  }
  if (r.modalidad === "deposito") {
    l.push(`Lo retira y lo devuelve él en el depósito (${DEPOSITO.texto}): sin flete, con su vehículo y gente para cargar. Las condiciones del depósito van en el presupuesto.`);
  }
  for (const c of r.aConfirmar) {
    // La plataforma ya está explicada arriba, con el armado: acá sólo lo que tiene que hacer.
    l.push(c.codigo === "plataforma" && a ? "Preguntale si le sirve esa plataforma y anotá lo que conteste (acepta_plataforma)." : c.texto);
  }

  if (r.entraSinPagarMas.length) {
    const opciones = r.entraSinPagarMas.map((s) =>
      s.tipo === "otra_torre"
        ? (s.cantidad === 1 ? "otra torre igual" : `hasta ${s.cantidad} torres más iguales`)
        : `un módulo más de alto en cada torre (llegaría hasta ~${metros(s.llegaHasta)} m)`);
    l.push(`No llega al mínimo del servicio: decíselo de frente y ofrecele lo que le entra sin pagar más: ${opciones.join(" o ")}. Sin números: el presupuesto los manda el equipo.`);
  } else if (r.precio && r.precio.minimoOperativo > 0) {
    l.push("No llega al mínimo del servicio: el presupuesto sale con el mínimo. Sin números: lo manda el equipo.");
  }
  if (r.franja?.tipo === "hora") {
    l.push(`Pidió una franja de una hora (${textoFranja(r.franja)}): tiene un recargo por los costos operativos. Cuánto es lo dice el presupuesto, vos no lo digas.`);
  }
  if (r.listo) l.push("Está todo: el presupuesto lo aprueba el equipo y le llega por este chat. Sin montos.");
  return l.join("\n");
}

// ── Los textos para el cliente (los manda el servidor tras la aprobación) ──────────────

/** $ 500.000 (sin decimales, punto de miles). */
export function pesos(n: number): string {
  const s = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}$ ${s}`;
}

/**
 * Las condiciones de la §6, como las explica Tomás: claras y amables, de vos, sin markdown (es
 * WhatsApp). Fuente única: van en el prompt de Tomás y en el presupuesto. No tienen montos ni
 * porcentajes (el recargo de la franja de una hora lo dice el presupuesto), así que también
 * pasan por el filtro de salida si Tomás las repite.
 *
 * En el depósito (fila 17) son otras: no hay chofer ni camión, viene con su vehículo y gente para
 * cargar, y la devolución es en el depósito, desarmado y con 24 h de aviso. No hay franja de una
 * hora ni recargo. Ninguna de las dos pide el pagaré: es gestión administrativa (fila 20).
 */
export function condicionesAlquilerSimple(modalidad: Modalidad = "envio"): string {
  if (modalidad === "deposito") {
    return [
      "Te cuento cómo funciona.",
      `Lo retirás en nuestro depósito, en ${DEPOSITO.texto}, de lunes a viernes de 10 a 12 o de 13 a 16 (de 12 a 13 el depósito está cerrado). Sábados, domingos y feriados no. El retiro se coordina con 24 horas de anticipación, nunca en el mismo día.`,
      "No hay chofer ni camión: tenés que venir con tu vehículo y con gente para cargarlo.",
      "Para devolverlo, traelo desarmado al depósito, en los mismos días y horarios, y avisanos por este mismo WhatsApp con 24 horas de anticipación como mínimo.",
      "Si llega la fecha y no nos avisaste, el alquiler sigue corriendo y se cobra por día.",
    ].join("\n\n");
  }
  return [
    "Te cuento cómo funciona.",
    "La entrega es de un día para el otro, nunca en el mismo día. Entregamos y retiramos sólo en Capital, de lunes a viernes de 8 a 12 o de 13 a 16, y los sábados de 8 a 12. Domingos y feriados no. La hora exacta dentro de la franja depende del recorrido de las camionetas. Si necesitás un horario particular, podemos pactar una franja de una hora, con un recargo por los costos operativos.",
    "Por un tema de seguros, los choferes no pueden entrar a los domicilios: no tienen un seguro que cubra roturas o daños. Por eso, en la entrega tiene que haber gente para bajar el material del camión, y en el retiro el andamio tiene que estar desarmado y tiene que haber gente para subirlo.",
    "Para el retiro, avisanos por este mismo WhatsApp con 24 horas de anticipación como mínimo. No retiramos en el mismo día en que nos avisás.",
    "Si llega la fecha y no nos avisaste, el alquiler sigue corriendo y se cobra por día.",
  ].join("\n\n");
}

/**
 * El presupuesto que manda el servidor cuando una persona aprueba la tarjeta: un solo total por
 * 30 días con la entrega y el retiro, o retirándolo en el depósito (§5, «no se le manda el precio
 * desglosado»), el recargo si pidió una franja de una hora, lo que le entra si es el mínimo, la
 * renovación por día, las condiciones de su modalidad y el cierre «¿Te lo reservo para el
 * <día>?» (§7). Todo «+ IVA».
 *
 * Tira si el resultado no tiene precio o si la franja no coincide con la que se cotizó (una
 * franja de una hora sin recargo, o al revés; una del depósito con envío, o al revés): mejor un
 * error que un precio equivocado.
 */
export function mensajePresupuestoAlquiler(r: ResultadoAlquiler, fecha: string, franja: Franja): string {
  const pr = r.precio;
  const a = r.armado;
  if (!pr || !a) throw new Error("El alquiler simple no tiene precio: no se puede armar el presupuesto.");
  if ((franja.tipo === "hora") !== (pr.recargoFranja > 0)) {
    throw new Error("La franja del presupuesto no coincide con la cotizada (el recargo de la franja de una hora).");
  }
  const deposito = r.modalidad === "deposito";
  if (deposito !== esFranjaDeposito(franja)) throw new Error("La franja del presupuesto no es de la modalidad cotizada (envío o depósito).");
  const l: string[] = [];
  const alTecho = !a.noLlega ? ""
    : a.noLlega.enTecho ? ` El techo está a ${metros(a.noLlega.hasta)} m, así que al techo no llegás cómodo.`
    : ` Hasta ${metros(a.noLlega.hasta)} m no llegás cómodo.`;
  const llega = a.peldano === null
    ? `La plataforma queda a ${metros(a.alturaPlataforma)} m y llegás a trabajar cómodo hasta unos ${metros(a.llegaHasta)} m.${alTecho}`
    : `La plataforma va en un peldaño de la escalera, a ${metros(a.alturaPlataforma)} m: es de un solo tablón, de 30 cm, y llegás a trabajar cómodo hasta unos ${metros(a.llegaHasta)} m.${alTecho}`;
  l.push(`Te paso el presupuesto: ${describirArmadoCliente(a)}. ${llega}`);
  l.push(deposito
    ? `El servicio completo por 30 días, retirándolo vos en nuestro depósito de ${DEPOSITO.direccion}, sale ${pesos(pr.base)} + IVA.`
    : `El servicio completo por 30 días, con la entrega y el retiro, sale ${pesos(pr.base)} + IVA.`);
  if (pr.minimoOperativo > 0) {
    const s = r.entraSinPagarMas.map((x) =>
      x.tipo === "otra_torre" ? (x.cantidad === 1 ? "otra torre igual" : `hasta ${x.cantidad} torres más`) : `un módulo más de alto (llegarías hasta unos ${metros(x.llegaHasta)} m)`);
    l.push(`Es el mínimo del servicio${s.length ? `: con ese mismo precio te entra ${s.join(" o ")}, si te sirve` : ""}.`);
  }
  if (pr.recargoFranja > 0) {
    l.push(`Como pediste la entrega ${textoFranja(franja)}, se suma un recargo del ${String(pr.recargoFranjaPct).replace(".", ",")} % por los costos operativos de la franja de una hora (${pesos(pr.recargoFranja)} + IVA). En total, ${pesos(pr.total)} + IVA.`);
  }
  if (!a.barandaSeLleva) l.push(`La baranda va siempre incluida en el precio; como no la querés, no ${deposito ? "te la damos" : "la llevamos"}.`);
  l.push(`Si lo necesitás más tiempo, cada día de más es ${pesos(pr.porDia)} + IVA.`);
  l.push(condicionesAlquilerSimple(r.modalidad));
  l.push(deposito
    ? `¿Te lo reservo para retirarlo el ${textoFecha(fecha)}, ${textoFranja(franja)}?`
    : `¿Te lo reservo para el ${textoFecha(fecha)}, ${textoFranja(franja)}?`);
  return l.join("\n\n");
}

/**
 * El presupuesto en los mensajes en que sale por WhatsApp: el precio, y desde «Te cuento cómo
 * funciona.» las condiciones con el cierre («¿Te lo reservo…?»). Si no encuentra el corte, uno solo.
 */
export function partesDelPresupuesto(texto: string): string[] {
  const i = texto.indexOf("\n\nTe cuento cómo funciona.");
  if (i <= 0) return [texto];
  return [texto.slice(0, i).trim(), texto.slice(i).trim()];
}

/** El armado en palabras del cliente: sin códigos y sin piezas sueltas. */
function describirArmadoCliente(a: Armado): string {
  const torres = a.torres === 1 ? "una torre" : `${a.torres} torres`;
  const ancho = a.ancho === "estandar" ? "de 1,30" : "angosto, de 0,90";
  const largo = a.largo === "largo" ? "por 2,50" : "por 1,50 (junior)";
  const apoyo = a.apoyo === "ruedas" ? "ruedas con freno" : "bases regulables para el piso desparejo";
  return `${torres} de ${plural(a.modulosPorTorre, "módulo", "módulos")} ${ancho} ${largo}, con la baranda, el piso completo de tablones y ${apoyo}`;
}
