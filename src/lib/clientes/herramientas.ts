// Las 11 herramientas de Tomás (crm-propuesta.md §13, más las 4 del alquiler simple del 12/11:
// docs/sofia/alquiler-simple-propuesta.md §10). Lista CERRADA. Con tests (herramientas.test.ts).
//
// REGLAS DE TODAS:
//   · NINGUNA RECIBE EL ID DE OTRO CLIENTE: trabajan sobre la ficha de ESTA charla, que les pasa
//     el turno. Los esquemas son estrictos: una clave de más («cliente_id», «telefono»,
//     «partner_id») es un error, no se ignora.
//   · NINGUNA DEVUELVE PLATA NI DATOS DE OTROS: ni montos, ni saldos, ni deuda, ni tarifas, ni
//     nombres de quién lo va a atender. La cotización vuelve como «cotización #N pendiente»; si el
//     cliente tiene historial o deuda, el modelo recibe EXACTAMENTE lo mismo que si no (el motivo
//     queda para la tarjeta del equipo). En el alquiler simple tampoco el flete, el mínimo ni el
//     porcentaje del recargo: el precio lo manda el servidor cuando una persona aprueba.
//   · Lo verificable lo escribe el servidor (CABA, el lote del catastro, el CUIT válido, el flete
//     del barrio, lo que dicen los documentos), nunca el modelo: anotar_ficha no tiene esos campos.
//   · Lo que necesita el botón de una persona (precio, técnico, traspaso) queda PENDIENTE en
//     cli_aprobaciones para la tarjeta del paso 6. La charla pasa a «Espera tu OK».
//
// Lo que tocan afuera (catastro, Odoo, USIG, la base) llega en `ServiciosSofia`: así se prueban
// con servicios simulados, y en producción los arma agente.ts.

import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { validarCuit } from "../cotizador/cuit.ts";
import type { ConsultaLote } from "../catastro/caba.ts";
import type { Tarifas } from "../cotizador/tipos.ts";
import { frenteDelLote } from "../asistente/borrador.ts";
import { armarBorradorFacil, esFacil, fichaVacia, type BanderaIA, type ContextoFacil, type FichaCliente, type ParametrosFacil, escanearPalabras } from "./facil.ts";
import type { Asignacion } from "./asignacion.ts";
import {
  condicionesAlquilerSimple, cotizarAlquilerSimple, DEPOSITO, esFranjaDeposito, franjaSegunModalidad, pedidoVacio, resumenParaTomas, textoFecha, textoFranja,
  validarEntrega,
  type CodigoEntrega, type FleteAlquiler, type Franja, type ParametrosAlquiler, type PedidoAlquiler, type ResultadoAlquiler,
} from "./alquiler-simple.ts";
import type { Flete } from "../odoo/alquiler-simple.ts";
import { documentosVacios, estadoDocumentos, leerDocumentos, textoDocumentosParaTomas, type DocumentosAlquiler } from "./documentos.ts";

// ── La ficha de la charla ───────────────────────────────────────────────────────────────

export type PiezaPedida = { descripcion: string; cantidad: number };

/** La ficha de Sofía: la del paso 4 (FichaCliente) más lo de los otros trabajos. */
export type FichaSofia = FichaCliente & {
  /** El trabajo que va a hacer el cliente, en pocas palabras («pintar la fachada», «cambiar las luces del galpón»). */
  tarea: string | null;
  mail: string | null;
  /** «usted» si el cliente escribe de usted. */
  trato: "vos" | "usted" | null;
  obra: { pisos: number | null; tienePlanos: boolean | null; descripcion: string | null } | null;
  /** Días y franjas para una visita, como los dijo el cliente. */
  visita: string | null;
  alquiler: AlquilerFicha | null;
};

/**
 * Dónde se entrega el alquiler simple, como lo resolvió el servidor (USIG): el barrio en CABA, la
 * localidad afuera, y el método de envío de Odoo. SIN EL PRECIO del flete: ese no se guarda en la
 * ficha (se vuelve a leer de Odoo al cotizar).
 */
export type UbicacionAlquiler = {
  direccion: string;
  enCaba: boolean;
  lugar: string | null;
  partido: string | null;
  normalizada: string;
  fleteId: number | null;
  fleteNombre: string | null;
};

/**
 * El alquiler de la charla. Las seis primeras son las de preparar_pedido_simple (lo cotiza una
 * persona, desde el 17/10); las otras, del alquiler simple que cotiza el servidor (12/11). Las
 * charlas viejas guardaron sólo las seis primeras: leerFicha completa lo que falta.
 */
export type AlquilerFicha = {
  sabePiezas: boolean;
  piezas: PiezaPedida[];
  dias: number | null;
  entrega: "retira" | "envio" | null;
  barrio: string | null;
  notas: string | null;
  /** Lo que juntó Tomás para cotizar_alquiler_simple (§3): se suma en cada llamada. */
  pedido: PedidoAlquiler | null;
  ubicacion: UbicacionAlquiler | null;
  /** Por qué no salió solo la última vez (grupo «trabajo», para la tarjeta de preparar_pedido_simple). */
  porQueNo: string[];
  /** El último presupuesto que quedó pendiente para la tarjeta. */
  cotizacion: { numero: number; at: string; fecha: string; franja: Franja } | null;
  /** El cliente aceptó el presupuesto (§6: recién ahí se piden los documentos). */
  aceptado: { at: string; presupuesto: number; fecha: string; franja: Franja } | null;
  /** Los documentos (documentos.ts): los clasifica el servidor, Tomás ve sólo qué falta. */
  documentos: DocumentosAlquiler | null;
  /** El aviso de retiro (§6: con 24 h, a este mismo WhatsApp). */
  retiro: { avisadoAt: string; fecha: string; franja: Franja; direccion: string | null } | null;
};

export function alquilerVacio(): AlquilerFicha {
  return {
    sabePiezas: false, piezas: [], dias: null, entrega: null, barrio: null, notas: null,
    pedido: null, ubicacion: null, porQueNo: [], cotizacion: null, aceptado: null, documentos: null, retiro: null,
  };
}

export function fichaSofiaVacia(): FichaSofia {
  return { ...fichaVacia(), tarea: null, mail: null, trato: null, obra: null, visita: null, alquiler: null };
}

/** El alquiler guardado (del formato del 17/10 o del 12/11) → completo. */
function leerAlquiler(g: unknown): AlquilerFicha | null {
  if (!g || typeof g !== "object") return null;
  const a = g as Partial<AlquilerFicha>;
  // Los pedidos de antes del 12/11 a la tarde guardaban `aceptaPeldano` (hoy aceptaPlataforma).
  const viejo = a.pedido as (PedidoAlquiler & { aceptaPeldano?: boolean | null }) | null | undefined;
  const pedido = viejo && typeof viejo === "object"
    ? {
        ...pedidoVacio(),
        ...viejo,
        piezasFueraDeCatalogo: Array.isArray(viejo.piezasFueraDeCatalogo) ? viejo.piezasFueraDeCatalogo : [],
        aceptaPlataforma: typeof viejo.aceptaPlataforma === "boolean" ? viejo.aceptaPlataforma : typeof viejo.aceptaPeldano === "boolean" ? viejo.aceptaPeldano : null,
      }
    : null;
  if (pedido) delete (pedido as { aceptaPeldano?: unknown }).aceptaPeldano;
  return {
    ...alquilerVacio(),
    ...a,
    piezas: Array.isArray(a.piezas) ? a.piezas : [],
    porQueNo: Array.isArray(a.porQueNo) ? a.porQueNo : [],
    pedido,
    documentos: leerDocumentos(a.documentos),
  };
}

/** Lo guardado en cli_conversaciones.ficha (puede ser {} o de una versión vieja) → completa. */
export function leerFicha(guardada: unknown, telefono: string | null): FichaSofia {
  const g = guardada && typeof guardada === "object" ? (guardada as Partial<FichaSofia>) : {};
  const f = { ...fichaSofiaVacia(), ...g };
  f.mensajesCliente = Array.isArray(f.mensajesCliente) ? f.mensajesCliente : [];
  f.banderas = Array.isArray(f.banderas) ? f.banderas : [];
  if (!f.telefono && telefono) f.telefono = telefono;
  if (f.segmento !== "gama_alta") f.segmento = null;
  f.alquiler = leerAlquiler(f.alquiler);
  return f;
}

// ── Lo de afuera ───────────────────────────────────────────────────────────────────────

export type TipoPendiente = "precio" | "tecnico";
/** alquiler: el alquiler simple que cotiza el servidor (12/11); simple: el que arma una persona. */
export type CarrilPendiente = "facil" | "simple" | "alquiler" | "tecnico";

/** De la dirección al flete (src/lib/odoo/alquiler-simple.ts: barrioDeDireccion + fleteParaUbicacion). */
export type ResultadoFleteAlquiler =
  | { estado: "ok"; enCaba: boolean; lugar: string | null; partido: string | null; normalizada: string; flete: Flete | null }
  | { estado: "ambigua"; opciones: string[] }
  | { estado: "no_encontrada"; motivo: string };

/** El último presupuesto de alquiler simple de la charla (cli_aprobaciones, carril «alquiler»). */
export type PresupuestoAlquiler = {
  numero: number;
  /** El estado de cli_aprobaciones: pendiente, aprobada, corregida, falta_plantilla… */
  estado: string;
  /** La entrega con que se cotizó (payload.alquiler.entrega). */
  entrega: { fecha: string; franja: Franja } | null;
  /** La orden de Odoo que creó la aprobación (pasos.ordenAlquiler). */
  ordenAlquiler: { id: number; nombre: string } | null;
};

export type ServiciosSofia = {
  /** USIG + catastro de CABA (consultarLote). Puede tirar si el catastro no responde. */
  verificarDireccion(direccion: string): Promise<ConsultaLote>;
  /** Lo que el servidor sabe y el modelo no (F5–F7 de §4) y los parámetros de lo fácil. */
  contextoFacil(ficha: FichaSofia): Promise<ContextoFacil>;
  tarifas(): Promise<Tarifas>;
  /** La regla de §5 con lo que el servidor sabe del cliente. La propuesta no sale al modelo. */
  asignar(ficha: FichaSofia): Promise<Asignacion>;
  /**
   * Deja algo pendiente para la tarjeta del equipo (cli_aprobaciones). Si ya hay uno pendiente
   * del mismo tipo y carril en esta charla, lo actualiza y devuelve el mismo número.
   */
  registrarPendiente(p: {
    tipo: TipoPendiente;
    carril: CarrilPendiente;
    resumen: string;
    montoPropuesto: number | null;
    payload: Record<string, unknown>;
  }): Promise<{ numero: number; yaEstaba: boolean }>;
  /** El barrio o la localidad de la dirección y su flete de la lista de Odoo (§5). Puede tirar. */
  fleteAlquiler(direccion: string): Promise<ResultadoFleteAlquiler>;
  /** Los precios del alquiler simple (Parámetros) y lo del cliente que el modelo no ve (F7, socios). */
  contextoAlquiler(ficha: FichaSofia): Promise<{ parametros: ParametrosAlquiler; deudaVencida: boolean | null; cuentaSocio?: boolean }>;
  /** Los feriados de los próximos días (YYYY-MM-DD): ni se entrega ni se retira (§6). */
  feriados(): Promise<readonly string[]>;
  presupuestoAlquiler(): Promise<PresupuestoAlquiler | null>;
  /**
   * Un evento en la bandeja y la campanita de Comercial: el cliente aceptó, pide el retiro.
   * `logistica`: también a Operaciones (el retiro mueve una camioneta).
   */
  avisarEquipo(texto: string, titulo: string, o?: { logistica?: boolean }): Promise<void>;
  /** YYYY-MM-DD, hora de Buenos Aires. */
  hoy: string;
  /** El momento (para las 24 h del retiro). Sin esto, la hora del servidor. */
  ahora?: () => Date;
};

/** Lo que una herramienta le pide al turno, además de su resultado. */
export type Efecto =
  | { estado: "espera_ok"; motivo: string }
  | { estado: "derivada"; motivo: string; resumen: string; urgente: boolean; textoFijo: "seguridad" | null; silenciar: boolean };

export type ResultadoHerramienta = { contenido: string; esError?: boolean; efecto?: Efecto };

export type ContextoHerramienta = { ficha: FichaSofia; servicios: ServiciosSofia };

// ── Esquemas ───────────────────────────────────────────────────────────────────────────

const BANDERAS = ["descuento", "fecha", "nocturno", "condiciones", "enojo", "seguridad", "persona", "tramo", "otro_trabajo"] as const satisfies readonly BanderaIA[];

const texto = (max: number) => z.string().trim().min(1).max(max);

const esquemaFicha = z.object({
  nombre: texto(80).optional().describe("A nombre de quién va el presupuesto (persona, consorcio o empresa), como lo dijo el cliente."),
  tipo_cliente: z.enum(["particular", "consorcio", "empresa"]).optional().describe("Para quién es: él mismo, un consorcio, o una empresa/constructora/organismo."),
  tarea: texto(120).optional().describe("Qué trabajo va a hacer el cliente, en pocas palabras: «pintar la fachada», «demolición», «arreglar balcones», «cambiar luces del galpón»."),
  trabajo: z.enum(["bandeja", "alquiler_simple", "fachada", "otro"]).optional().describe("bandeja de protección; alquiler de material sin montaje; andamio de fachada; otro trabajo."),
  altura_bandeja: z.number().min(1).max(12).optional().describe("Altura de la bandeja en metros. La estándar es 3."),
  necesita_andamio: z.boolean().optional().describe("Si además de la bandeja necesita andamio para trabajar en el frente."),
  direccion: texto(160).optional().describe("La dirección de la obra como la dio el cliente (calle, altura y localidad). Después verificala con verificar_direccion."),
  cubre_todo_el_frente: z.boolean().optional().describe("Si la bandeja va por todo el frente (true) o sólo por una parte (false)."),
  metros_cliente: z.number().positive().max(500).optional().describe("Si el cliente dijo una medida en metros lineales."),
  mail: z.string().trim().email().max(120).optional(),
  trato: z.enum(["vos", "usted"]).optional().describe("usted si el cliente escribe de usted."),
  pisos: z.number().int().min(0).max(80).optional(),
  tiene_planos: z.boolean().optional(),
  descripcion_obra: texto(400).optional().describe("Qué trabajo es, en pocas palabras (para fachadas y otros trabajos)."),
  disponibilidad_visita: texto(200).optional().describe("Días y franjas en que puede recibir una visita, como los dijo."),
  banderas: z.array(z.enum(BANDERAS)).max(9).optional()
    .describe("Marcá lo que veas: pide descuento, una fecha, trabajo de noche, condiciones especiales, enojo, seguridad en obra, pide una persona, sólo un tramo, otro trabajo además de la bandeja. Sólo se agregan, no se sacan."),
}).strict();

const esquemaCuit = z.object({ cuit: z.string().trim().min(8).max(20).describe("El CUIT o CUIL que dio el cliente.") }).strict();

const esquemaDireccion = z.object({
  direccion: texto(160).describe("Calle y altura, con la localidad si no es Capital («Los Aromos 1234, CABA»)."),
}).strict();

const esquemaNada = z.object({}).strict();

const esquemaSimple = z.object({
  sabe_piezas: z.boolean().describe("false si el cliente no sabe qué piezas necesita (lo calcula el equipo)."),
  piezas: z.array(z.object({ descripcion: texto(80), cantidad: z.number().int().min(1).max(500) }).strict()).max(20).optional()
    .describe("Las piezas como las pidió: «cuerpo de andamio» 3, «tablón» 4, «juego de ruedas» 1."),
  dias: z.number().int().min(1).max(730).optional(),
  entrega: z.enum(["retira", "envio"]).optional(),
  barrio: texto(80).optional().describe("Barrio o localidad de entrega."),
  notas: texto(400).optional().describe("Lo que contó el cliente que sirva (para qué es, altura, si va en la vereda)."),
}).strict();

const esquemaTecnico = z.object({
  motivo: z.enum(["trabajo_no_facil", "visita", "otro"]),
  resumen: texto(600).describe("Qué pide y qué datos juntaste, para la persona que lo toma."),
  disponibilidad: texto(200).optional(),
}).strict();

/**
 * Los motivos que puede elegir Sofía. Los de abajo de gama_alta que no estaban salen del análisis
 * de los chats (docs/sofia/analisis-chats-propuesta.md, D3), aprobado por JS el 16/10.
 * «Urgente» y «Quiere avanzar» van arriba en la bandeja (vista.ts, esPrioritaria).
 */
export const MOTIVOS_DERIVACION = {
  seguridad_obra: "Seguridad en obra · urgente",
  desprendimiento: "Urgente · se desprende algo del edificio",
  quiere_avanzar: "Quiere avanzar",
  pide_persona: "Pide hablar con una persona",
  gama_alta: "Gama alta",
  obra_en_curso: "Obra en curso (retiro, desarme, renovación)",
  administracion: "Facturas, pagos o cobranzas",
  estafa_pago: "Víctima de una estafa que ya pagó",
  enojo_reclamo: "Enojo o reclamo",
  trabajo_no_facil: "Trabajo no fácil",
  regateo_o_pago: "Regateo, descuento o condiciones de pago",
  pregunta_presupuesto: "Pregunta por el presupuesto",
  no_entiende: "No se entienden",
  adjunto_ilegible: "Audio o adjunto que no se pudo leer",
  fuera_de_tema: "No es un pedido",
} as const;
export type MotivoDerivacion = keyof typeof MOTIVOS_DERIVACION;

const esquemaDerivar = z.object({
  motivo: z.enum(Object.keys(MOTIVOS_DERIVACION) as [MotivoDerivacion, ...MotivoDerivacion[]]),
  resumen: texto(600).describe("Qué pidió y qué datos juntaste, en una o dos líneas, para la persona que lo toma."),
}).strict();

type Def = {
  nombre: string;
  descripcion: string;
  esquema: z.ZodType;
  ejecutar: (input: never, ctx: ContextoHerramienta) => Promise<ResultadoHerramienta>;
};

const json = (o: unknown) => JSON.stringify(o);

// ── anotar_ficha ───────────────────────────────────────────────────────────────────────

async function anotarFicha(i: z.infer<typeof esquemaFicha>, { ficha }: ContextoHerramienta): Promise<ResultadoHerramienta> {
  const anotado: string[] = [];
  const poner = <K extends keyof FichaSofia>(k: K, v: FichaSofia[K] | undefined, nombre: string) => {
    if (v === undefined) return;
    ficha[k] = v as FichaSofia[K];
    anotado.push(nombre);
  };
  poner("nombre", i.nombre, "nombre");
  poner("tarea", i.tarea, "tarea");
  poner("tipoCliente", i.tipo_cliente, "tipo de cliente");
  poner("trabajo", i.trabajo, "trabajo");
  poner("alturaBandeja", i.altura_bandeja, "altura");
  poner("necesitaAndamio", i.necesita_andamio, "andamio");
  if (i.direccion !== undefined && i.direccion !== ficha.direccion) {
    // Otra dirección: lo verificado era de la anterior (esFacil también lo mira).
    ficha.direccion = i.direccion;
    ficha.enCaba = null;
    ficha.lote = null;
    anotado.push("dirección (falta verificarla)");
  }
  poner("cubreTodoElFrente", i.cubre_todo_el_frente, "todo el frente");
  poner("metrosCliente", i.metros_cliente, "metros");
  poner("mail", i.mail, "mail");
  poner("trato", i.trato, "trato");
  poner("visita", i.disponibilidad_visita, "visita");
  if (i.pisos !== undefined || i.tiene_planos !== undefined || i.descripcion_obra !== undefined) {
    const o = ficha.obra ?? { pisos: null, tienePlanos: null, descripcion: null };
    ficha.obra = {
      pisos: i.pisos ?? o.pisos,
      tienePlanos: i.tiene_planos ?? o.tienePlanos,
      descripcion: i.descripcion_obra ?? o.descripcion,
    };
    anotado.push("obra");
  }
  if (i.banderas?.length) {
    ficha.banderas = [...new Set([...ficha.banderas, ...i.banderas])];
    anotado.push(`marcas (${i.banderas.join(", ")})`);
  }
  return { contenido: anotado.length ? `Anotado: ${anotado.join(", ")}.` : "No había nada nuevo para anotar." };
}

// ── validar_cuit ───────────────────────────────────────────────────────────────────────

async function validarCuitHerr(i: z.infer<typeof esquemaCuit>, { ficha }: ContextoHerramienta): Promise<ResultadoHerramienta> {
  const r = validarCuit(i.cuit);
  if (!r.valido) {
    // El motivo de cuit.ts habla del verificador; no dice nada del cliente.
    return { contenido: json({ valido: false, motivo: r.motivo, que_hacer: "Pedile que lo revise (puede ser un número mal tipeado)." }) };
  }
  ficha.cuit = r.normalizado;
  // Sólo el dígito: no dice si ya es cliente ni de quién es (§13). El nuevo chequeo de historial
  // y deuda con el CUIT lo hace el servidor al aprobar (paso 6).
  return { contenido: json({ valido: true, cuit: r.normalizado, tipo: r.tipo === "persona_juridica" ? "sociedad" : "persona" }) };
}

// ── verificar_direccion ────────────────────────────────────────────────────────────────

const ml = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

async function verificarDireccion(i: z.infer<typeof esquemaDireccion>, { ficha, servicios }: ContextoHerramienta): Promise<ResultadoHerramienta> {
  ficha.direccion = i.direccion;
  ficha.enCaba = null;
  ficha.lote = null;
  let r: ConsultaLote;
  try {
    r = await servicios.verificarDireccion(i.direccion);
  } catch {
    return { contenido: json({ resultado: "sin_respuesta", que_hacer: "El catastro no responde ahora. Seguí juntando los datos: el equipo la verifica." }) };
  }
  switch (r.estado) {
    case "encontrado": {
      ficha.enCaba = true;
      ficha.lote = r.lote;
      const frente = frenteDelLote(r.lote);
      return {
        contenido: json({
          resultado: "verificada",
          en_caba: true,
          direccion_oficial: r.lote.direccionOficial,
          frente_m: frente ? ml(frente) : null,
          esquina: r.lote.esquina,
          ...(r.lote.esquina && r.lote.calles.length ? { calles: r.lote.calles } : {}),
          ...(frente ? {} : { nota: "El catastro no tiene la medida del frente." }),
        }),
      };
    }
    case "puerta_no_oficial":
      ficha.enCaba = true;
      return {
        contenido: json({
          resultado: "altura_no_oficial",
          que_hacer: "Esa altura no es una puerta oficial. Preguntale cuál de estas es la obra (o el número de la puerta).",
          opciones: r.vecinas.map((v) => v.direccion).filter(Boolean),
        }),
      };
    case "fuera_de_caba":
      ficha.enCaba = false;
      return { contenido: json({ resultado: "fuera_de_caba", direccion_normalizada: r.direccion, nota: "Fuera de CABA el frente lo mide el equipo." }) };
    case "no_encontrado":
      return { contenido: json({ resultado: "no_encontrada", motivo: r.motivo, que_hacer: "Pedile calle y altura (y la localidad si no es Capital)." }) };
  }
}

// ── preparar_cotizacion_facil ──────────────────────────────────────────────────────────

/** Lo que falta preguntar antes de poder decidir si es fácil (no son motivos para derivar). */
export function faltantesBandeja(f: FichaSofia): string[] {
  const falta: string[] = [];
  if (!f.trabajo) falta.push("qué trabajo necesita");
  else if (f.trabajo !== "bandeja") return falta;
  if (f.alturaBandeja === null) falta.push("la altura de la bandeja (si no la aclaró, es la estándar de 3 m: anotala)");
  if (f.necesitaAndamio === null) falta.push("si necesita también andamio para trabajar en el frente o sólo la bandeja");
  if (!f.direccion) falta.push("la dirección de la obra");
  else if (f.enCaba === null || (f.enCaba && (!f.lote || f.lote.direccionConsultada.trim() !== f.direccion.trim()))) {
    falta.push("verificar la dirección con verificar_direccion");
  }
  if (f.cubreTodoElFrente === null) falta.push("si la bandeja va por todo el frente");
  if (!f.nombre) falta.push("a nombre de quién va el presupuesto");
  return falta;
}

/** Por qué no es fácil, en palabras para el modelo: SÓLO lo del trabajo (lo del cliente nunca). */
const POR_QUE_NO: Record<string, string> = {
  trabajo: "no es sólo una bandeja de 3 m",
  palabras: "el pedido tiene algo que tiene que ver una persona",
  bandera: "marcaste algo que tiene que ver una persona",
  caba: "es fuera de CABA",
  frente: "no se pudo verificar la medida del frente",
  esquina: "es una esquina",
  cubre_frente: "es sólo una parte del frente",
  tope_ml: "el frente es más largo que lo que se cotiza directo",
  metros_cliente: "los metros que dijo no coinciden con el catastro",
  gama_alta: "es un cliente de gama alta",
};

const QUE_HACER_GAMA_ALTA =
  "Es un cliente de gama alta: no se cotiza directo. Juntá lo básico (superficie o metros, altura, para qué es, plazo, si arma ABA, planos o memoria de cálculo) y usá derivar_a_persona con el motivo gama_alta.";

const QUE_DECIR_PENDIENTE =
  "Decile que ya tenés todo, que el presupuesto lo prepara el equipo y que le llega por este mismo chat (fuera de horario, cuándo le escribe una persona). Sin montos, sin plazos («en un rato» también es un plazo) y sin nombres.";

async function prepararCotizacionFacil(_i: z.infer<typeof esquemaNada>, { ficha, servicios }: ContextoHerramienta): Promise<ResultadoHerramienta> {
  if (ficha.trabajo && ficha.trabajo !== "bandeja") {
    return { contenido: json({ estado: "no_corresponde", que_hacer: "Esto es para bandejas. Para otros trabajos usá preparar_pedido_simple o pedir_tecnico." }) };
  }
  // Gama alta: nunca una cotización fácil, aunque falten datos.
  if (ficha.segmento === "gama_alta") return { contenido: json({ estado: "no_es_facil", motivos: [POR_QUE_NO.gama_alta], que_hacer: QUE_HACER_GAMA_ALTA }) };
  const falta = faltantesBandeja(ficha);
  if (falta.length) return { contenido: json({ estado: "faltan_datos", preguntar: falta }) };

  const contexto = await servicios.contextoFacil(ficha);
  const r = esFacil(ficha, contexto);
  if (!r.trabajoFacil) {
    const motivos = [...new Set(r.enContra.filter((x) => x.grupo === "trabajo").map((x) => POR_QUE_NO[x.codigo] ?? "lo tiene que ver una persona"))];
    return {
      contenido: json({
        estado: "no_es_facil",
        motivos,
        que_hacer: "Este presupuesto lo arma el equipo. Usá pedir_tecnico con un resumen y decile que se lo pasás al equipo para que quede bien.",
      }),
    };
  }
  // El trabajo es fácil. Si el cliente no (historial, deuda, dirección cotizada, cuenta de los
  // socios, empresa), igual se arma el borrador y queda para su pareja (§4): el modelo recibe
  // lo mismo en los dos casos, para no filtrar el motivo.
  const tarifas = await servicios.tarifas();
  const b = armarBorradorFacil(ficha, tarifas, {
    parametros: contexto.parametros as ParametrosFacil,
    hoy: servicios.hoy,
    conflictoCanal: contexto.direccionCotizada === null ? undefined : contexto.direccionCotizada ? "La dirección se cotizó en los últimos 12 meses" : null,
    tipoCliente: ficha.tipoCliente,
  });
  const asignacion = await servicios.asignar(ficha).catch(() => null);
  const frente = b.metros;
  const { numero } = await servicios.registrarPendiente({
    tipo: "precio",
    carril: "facil",
    resumen: `Bandeja de 3 m · ${frente ? `${ml(frente)} m.l.` : "s/medida"} · ${ficha.direccion ?? ""}`.trim(),
    montoPropuesto: b.resultado.totales?.subtotal ?? null,
    payload: {
      facil: r.facil,
      motivos: r.motivos,
      enContra: r.enContra,
      problemas: b.problemas,
      metros: b.metros,
      datos: b.datos,
      resultado: b.resultado,
      asignacion,
    },
  });
  return {
    contenido: json({ estado: "pendiente", cotizacion: `#${numero}`, que_decir: QUE_DECIR_PENDIENTE }),
    efecto: { estado: "espera_ok", motivo: `cotización #${numero}` },
  };
}

// ── preparar_pedido_simple ─────────────────────────────────────────────────────────────

async function prepararPedidoSimple(i: z.infer<typeof esquemaSimple>, { ficha, servicios }: ContextoHerramienta): Promise<ResultadoHerramienta> {
  const piezas = i.piezas ?? [];
  if (i.sabe_piezas && !piezas.length) return { contenido: json({ estado: "faltan_datos", preguntar: ["qué piezas y cuántas"] }), esError: true };
  ficha.trabajo = "alquiler_simple";
  const previo = ficha.alquiler ?? alquilerVacio();
  // Si antes pasó por cotizar_alquiler_simple y no salió solo, lo que juntó vale: el servicio es
  // siempre de 30 días (§5) y se entrega en la dirección que ya se ubicó.
  const cotizado = previo.pedido !== null;
  ficha.alquiler = {
    ...previo,
    sabePiezas: i.sabe_piezas,
    piezas,
    dias: i.dias ?? previo.dias ?? (cotizado ? 30 : null),
    entrega: i.entrega ?? previo.entrega ?? (cotizado ? "envio" : null),
    barrio: i.barrio ?? previo.barrio ?? previo.ubicacion?.lugar ?? (cotizado ? ficha.direccion : null),
    notas: i.notas ?? previo.notas ?? null,
  };
  const a = ficha.alquiler;
  const falta: string[] = [];
  if (a.dias === null) falta.push("por cuántos días");
  if (a.entrega === null) falta.push("si lo retira o se lo llevamos");
  if (a.entrega === "envio" && !a.barrio) falta.push("a qué barrio o localidad");
  if (falta.length) return { contenido: json({ estado: "faltan_datos", preguntar: falta }) };

  const asignacion = await servicios.asignar(ficha).catch(() => null);
  const alertas = ficha.mensajesCliente.flatMap(escanearPalabras);
  const { numero } = await servicios.registrarPendiente({
    tipo: "precio",
    carril: "simple",
    resumen: a.sabePiezas
      ? `Alquiler simple · ${a.piezas.map((p) => `${p.cantidad} ${p.descripcion}`).join(", ")} · ${a.dias} días · ${a.entrega === "retira" ? "retira" : `envío a ${a.barrio}`}`
      : `Alquiler simple · no sabe qué piezas (calcula el equipo) · ${a.dias} días`,
    // El precio lo pone la persona (§4: Tamara escribe o corrige el total). Acá no hay monto.
    montoPropuesto: null,
    // `alquiler` trae también lo que juntó cotizar_alquiler_simple (pedido, ubicación y por qué no
    // salió solo): la persona que lo cotiza no tiene que volver a preguntar.
    payload: { alquiler: a, alertas, asignacion, direccion: ficha.direccion },
  });
  return {
    contenido: json({
      estado: "pendiente",
      pedido: `#${numero}`,
      que_decir: a.sabePiezas
        ? QUE_DECIR_PENDIENTE
        : "Decile que eso lo calcula el equipo para que quede seguro, que ya le pasás lo que te contó y que le escriben por acá. Sin montos, sin plazos y sin nombres.",
    }),
    efecto: { estado: "espera_ok", motivo: `pedido de alquiler #${numero}` },
  };
}

// ── El alquiler simple (docs/sofia/alquiler-simple-propuesta.md, cerrada con JS el 12/11) ─

const FECHA = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "tiene que ser AAAA-MM-DD");
const FRANJA = z.enum(["manana", "tarde", "hora_particular"])
  .describe("manana: de 8 a 12 (en el depósito, de 10 a 12) · tarde: de 13 a 16 (no los sábados) · hora_particular: una franja de una hora pactada, con recargo por costos operativos (va con hora_desde; no existe en el depósito).");
const HORA = z.string().trim().regex(/^([01]?\d|2[0-3])(:[0-5]\d)?$/, "«10» o «9:30»")
  .describe("Sólo con hora_particular: a qué hora empieza la franja de una hora («10», «9:30»).");
const METROS = z.number().positive().max(30);

const esquemaAlquiler = z.object({
  lugar: z.enum(["adentro", "afuera"]).optional(),
  altura_trabajo_m: METROS.optional().describe("Hasta qué altura tiene que llegar a trabajar, en metros (lo más alto que tiene que tocar)."),
  trabajo_en_techo: z.boolean().optional().describe("true si el trabajo es el cielorraso o el techo (pintar el techo, cambiar una luz del techo)."),
  altura_techo_m: METROS.optional().describe("La altura del techo, en metros (adentro, o un alero afuera)."),
  espacio_de_sobra: z.boolean().optional().describe("true si dijo que hay espacio de sobra en el piso (no hace falta medir el ancho ni el largo)."),
  ancho_libre_m: METROS.optional().describe("El ancho libre en el piso, en metros."),
  largo_libre_m: METROS.optional().describe("El largo libre en el piso, en metros."),
  largo_a_cubrir_m: z.number().positive().max(60).optional().describe("Si tiene que cubrir un largo de pared con torres en fila, cuántos metros."),
  torres: z.number().int().min(1).max(20).optional().describe("Cuántas torres quiere, si lo dijo."),
  piso: z.enum(["liso", "desparejo"]).optional().describe("desparejo: vereda rota, tierra, un escalón."),
  piezas: z.object({
    modulos_por_torre: z.number().int().min(1).max(10),
    torres: z.number().int().min(1).max(20).optional(),
    ancho: z.enum(["estandar", "angosto"]).optional().describe("estandar: 1,30 · angosto: 0,90"),
    largo: z.enum(["largo", "junior"]).optional().describe("largo: 2,50 · junior: 1,50"),
    apoyo: z.enum(["ruedas", "tornillones"]).optional(),
    con_baranda: z.boolean().optional().describe("false si dijo que no quiere la baranda."),
    tablones_por_torre: z.number().int().min(0).max(10).optional(),
  }).strict().optional().describe("Sólo si el cliente ya dijo qué quiere («2 módulos con ruedas»): el servidor revisa que le sirva y lo completa."),
  piezas_fuera_de_catalogo: z.array(texto(60)).max(10).optional()
    .describe("Lo que pide y no es del alquiler simple: puntales, caños, nudos, paso peatonal, escalera, ménsulas."),
  montaje: z.boolean().optional().describe("true si pide que se lo armemos."),
  anclar: z.boolean().optional().describe("true si dice que hay que anclarlo (a la pared, a una estructura)."),
  para_hoy: z.boolean().optional().describe("true si lo necesita sí o sí en el día."),
  direccion: texto(160).optional().describe("Dónde se entrega: calle, altura y localidad si no es Capital. De ahí sale el flete (sólo se entrega en Capital)."),
  retira_en_deposito: z.boolean().optional()
    .describe(`true si lo retira y lo devuelve él en nuestro depósito (${DEPOSITO.texto}), sin flete; false si dijo que no puede retirarlo. Fuera de Capital es la única opción.`),
  fecha: FECHA.optional().describe("La fecha de entrega que pidió, AAAA-MM-DD (el día de hoy está en el aviso)."),
  franja: FRANJA.optional(),
  hora_desde: HORA.optional(),
  acepta_plataforma: z.boolean().optional().describe("Lo que contestó cuando le aclaraste la plataforma que te pidió confirmar (un tablón en un peldaño, o que no llega cómodo al techo)."),
  notas: texto(400).optional().describe("Lo que contó y sirva para el equipo (para qué es, si va en la vereda, el acceso)."),
}).strict();

const esquemaAceptar = z.object({
  fecha: FECHA.describe("El día de entrega (o en que pasa a retirarlo por el depósito) que confirmó, AAAA-MM-DD."),
  franja: FRANJA,
  hora_desde: HORA.optional(),
}).strict();

const esquemaDocumentos = z.object({
  solo_tiene_un_servicio: z.boolean().optional().describe("true si el cliente dijo que tiene un solo servicio a su nombre (alcanza con uno)."),
}).strict();

const esquemaRetiro = z.object({
  fecha: FECHA.describe("El día en que quiere el retiro (o en que lo devuelve en el depósito), AAAA-MM-DD."),
  franja: FRANJA,
  hora_desde: HORA.optional(),
  direccion: texto(160).optional().describe("Dónde está el andamio, si no es la de la ficha (o si es un alquiler de antes)."),
}).strict();

/** «10» → 10; «9:30» → 9,5. */
function horaANumero(h: string): number {
  const [hh, mm = "0"] = h.split(":");
  return Number(hh) + Number(mm) / 60;
}

/** La franja del esquema → la del motor. Con hora_particular hace falta la hora. */
function franjaDe(f: z.infer<typeof FRANJA>, hora: string | undefined): Franja | null {
  if (f === "manana") return { tipo: "manana" };
  if (f === "tarde") return { tipo: "tarde" };
  return hora ? { tipo: "hora", desde: horaANumero(hora) } : null;
}

const FALTA_HORA = { contenido: json({ estado: "faltan_datos", preguntar: ["a qué hora quiere la franja de una hora (por ejemplo «de 10 a 11»)"] }) };

/**
 * Lo que dijo el cliente se suma a lo que ya estaba (cada llamada trae sólo lo nuevo). Si cambia
 * algo de la altura (el lugar, la altura, el techo o lo que pidió), la plataforma que había
 * aceptado ya no es la misma: se borra la respuesta, salvo que venga en la misma llamada.
 */
function anotarPedido(p: PedidoAlquiler, i: z.infer<typeof esquemaAlquiler>, franja: Franja | null): void {
  const alturaAntes = JSON.stringify([p.lugar, p.alturaTrabajo, p.trabajoEnTecho, p.alturaTecho, p.piezas?.modulosPorTorre ?? null]);
  if (i.lugar !== undefined) p.lugar = i.lugar;
  if (i.altura_trabajo_m !== undefined) p.alturaTrabajo = i.altura_trabajo_m;
  if (i.trabajo_en_techo !== undefined) p.trabajoEnTecho = i.trabajo_en_techo;
  if (i.altura_techo_m !== undefined) p.alturaTecho = i.altura_techo_m;
  if (i.espacio_de_sobra !== undefined) p.espacioDeSobra = i.espacio_de_sobra;
  if (i.ancho_libre_m !== undefined) p.anchoLibre = i.ancho_libre_m;
  if (i.largo_libre_m !== undefined) p.largoLibre = i.largo_libre_m;
  if (i.largo_a_cubrir_m !== undefined) p.largoACubrir = i.largo_a_cubrir_m;
  if (i.torres !== undefined) p.torres = i.torres;
  if (i.piso !== undefined) p.piso = i.piso;
  if (i.piezas) {
    p.piezas = {
      modulosPorTorre: i.piezas.modulos_por_torre,
      torres: i.piezas.torres ?? null,
      ancho: i.piezas.ancho ?? null,
      largo: i.piezas.largo ?? null,
      apoyo: i.piezas.apoyo ?? null,
      conBaranda: i.piezas.con_baranda ?? null,
      tablonesPorTorre: i.piezas.tablones_por_torre ?? null,
    };
  }
  if (i.piezas_fuera_de_catalogo?.length) p.piezasFueraDeCatalogo = [...new Set([...p.piezasFueraDeCatalogo, ...i.piezas_fuera_de_catalogo])];
  if (i.montaje !== undefined) p.montaje = i.montaje;
  if (i.anclar !== undefined) p.anclar = i.anclar;
  if (i.para_hoy !== undefined) p.paraHoy = i.para_hoy;
  if (i.fecha !== undefined) p.fecha = i.fecha;
  if (franja) p.franja = franja;
  if (i.retira_en_deposito !== undefined) p.retiraEnDeposito = i.retira_en_deposito;
  const alturaDespues = JSON.stringify([p.lugar, p.alturaTrabajo, p.trabajoEnTecho, p.alturaTecho, p.piezas?.modulosPorTorre ?? null]);
  if (alturaAntes !== alturaDespues) p.aceptaPlataforma = null;
  if (i.acepta_plataforma !== undefined) p.aceptaPlataforma = i.acepta_plataforma;
  // La franja de la modalidad: en el depósito, la mañana es de 10 a 12 (franjaSegunModalidad).
  p.franja = franjaSegunModalidad(p.franja, p.retiraEnDeposito === true);
}

const QUE_DECIR_ALQUILER =
  "Contale en una o dos líneas lo que le armaste y por qué le sirve, explicale las condiciones (abajo; con tus palabras, en pocos renglones, si todavía no se las explicaste) y decile que el presupuesto lo revisa el equipo y le llega por este mismo chat en unos minutos. Fuera de horario, aclarale cuándo le escribe una persona (está en el aviso). Sin montos ni porcentajes.";

const QUE_HACER_FUERA_DE_CABA =
  "No entregamos ni retiramos fuera de Capital, y no puede retirarlo en el depósito: decíselo con amabilidad, en una línea, sin vueltas. Si igual quiere avanzar de otra forma, usá derivar_a_persona con el motivo quiere_avanzar y un resumen. No ofrezcas escaleras.";

/** Qué hacer cuando el alquiler no sale solo (§8), según por qué. Sin montos. */
function queHacerNoFacil(r: ResultadoAlquiler): string {
  const c = new Set(r.enContra.filter((m) => m.grupo === "trabajo").map((m) => m.codigo));
  if (c.has("gama_alta")) return QUE_HACER_GAMA_ALTA;
  if (c.has("fuera_de_caba") && c.size === 1) return QUE_HACER_FUERA_DE_CABA;
  if (c.has("montaje") || c.has("anclar")) {
    return "No es un alquiler simple: lleva montaje o anclaje. Juntá lo que falte (dirección, altura, para cuándo), mandale el resumen para que lo confirme y usá pedir_tecnico con el motivo trabajo_no_facil.";
  }
  if ([...c].every((x) => x === "palabras" || x === "bandera")) {
    return "Algo del pedido lo tiene que ver una persona: usá derivar_a_persona con el motivo que corresponda (pide_persona, regateo_o_pago, enojo_reclamo) y un resumen.";
  }
  return "Lo cotiza un vendedor: usá preparar_pedido_simple (sabe_piezas en false, o las piezas si las pidió, y en notas lo que juntaste) y decile que lo ve un vendedor para que quede bien. No ofrezcas escaleras.";
}

/**
 * El resumen de la tarjeta: «Alquiler simple · 1 torre de 2 módulos · Palermo · lunes 16 de
 * noviembre, de 8 a 12». `flete` null: retira en el depósito.
 */
function resumenAlquiler(r: ResultadoAlquiler, flete: Flete | null, fecha: string, franja: Franja): string {
  const a = r.armado!;
  const torres = a.torres === 1 ? "1 torre" : `${a.torres} torres`;
  const ancho = a.ancho === "estandar" ? "1,30" : "0,90";
  const largo = a.largo === "largo" ? "2,50" : "1,50";
  return `Alquiler simple · ${torres} de ${a.modulosPorTorre} ${a.modulosPorTorre === 1 ? "módulo" : "módulos"} ${ancho} × ${largo}${a.peldano !== null ? " (plataforma en peldaño)" : ""} · ${flete ? flete.nombre : "retira en el depósito"} · ${textoFecha(fecha)}, ${textoFranja(franja)}`;
}

async function cotizarAlquiler(i: z.infer<typeof esquemaAlquiler>, { ficha, servicios }: ContextoHerramienta): Promise<ResultadoHerramienta> {
  let franja: Franja | null = null;
  if (i.franja) {
    franja = franjaDe(i.franja, i.hora_desde);
    if (!franja) return FALTA_HORA;
  }
  ficha.trabajo = "alquiler_simple";
  const a = (ficha.alquiler ??= alquilerVacio());
  const p = (a.pedido ??= pedidoVacio());
  anotarPedido(p, i, franja);
  if (i.notas) a.notas = i.notas;
  if (i.direccion !== undefined && i.direccion !== ficha.direccion) {
    ficha.direccion = i.direccion;
    ficha.enCaba = null;
    ficha.lote = null;
  }
  // Gama alta: nunca sale solo, aunque falten datos (como la bandeja).
  if (ficha.segmento === "gama_alta") return { contenido: json({ estado: "no_es_facil", motivos: ["es un cliente de gama alta"], que_hacer: QUE_HACER_GAMA_ALTA }) };

  // ── El flete, por la dirección (USIG → barrio o localidad → lista de Odoo) ──
  let flete: FleteAlquiler | null = null;
  let fleteOdoo: Flete | null = null;
  let preguntaDireccion: string | null = null;
  const dir = ficha.direccion?.trim() || null;
  const deposito = p.retiraEnDeposito === true;
  // En el depósito no hace falta el flete (el motor no lo mira), pero la dirección se ubica igual
  // para la ficha: la provincia de la obra va a la orden.
  if (dir) {
    try {
      const u = await servicios.fleteAlquiler(dir);
      if (u.estado === "ok") {
        // Fuera de CABA no hay flete (fila 16): el motor le ofrece retirarlo en el depósito.
        fleteOdoo = u.enCaba ? u.flete : null;
        ficha.enCaba = u.enCaba;
        a.ubicacion = { direccion: dir, enCaba: u.enCaba, lugar: u.lugar, partido: u.partido, normalizada: u.normalizada, fleteId: fleteOdoo?.carrierId ?? null, fleteNombre: fleteOdoo?.nombre ?? null };
        flete = !u.enCaba ? { tipo: "provincia", lugar: u.lugar }
          : fleteOdoo ? { tipo: "lista", barrio: fleteOdoo.nombre, monto: fleteOdoo.precio, metodoEnvioId: fleteOdoo.carrierId }
          : { tipo: "fuera_de_lista", barrio: u.lugar };
      } else {
        a.ubicacion = null;
        preguntaDireccion = u.estado === "ambigua"
          ? `Esa dirección existe en varios lugares: preguntale cuál es (${u.opciones.join(" · ")}).`
          : "No encontré la dirección: pedile calle y altura, y la localidad si no es Capital.";
      }
    } catch {
      preguntaDireccion = "No pude ubicar la dirección ahora: seguí con lo demás y volvé a probar en un rato.";
    }
  }
  // Si retira en el depósito, ni la dirección ni el flete hacen falta para cotizar.
  if (deposito) preguntaDireccion = null;

  // ── El motor ──
  const [contexto, feriados] = await Promise.all([servicios.contextoAlquiler(ficha), servicios.feriados()]);
  const r = cotizarAlquilerSimple(p, {
    parametros: contexto.parametros,
    flete,
    hoy: servicios.hoy,
    feriados,
    cliente: { mensajesCliente: ficha.mensajesCliente, banderas: ficha.banderas, segmento: ficha.segmento, deudaVencida: contexto.deudaVencida, cuentaSocio: contexto.cuentaSocio },
  });
  const enContraTrabajo = r.enContra.filter((m) => m.grupo === "trabajo");
  a.porQueNo = enContraTrabajo.map((m) => m.texto);
  // Lo que ve Tomás no cambia con lo del cliente (deuda, socios): «listo» se mide sólo con el trabajo.
  const trabajoListo = r.trabajoFacil && !r.faltan.length && !r.aConfirmar.length && r.precio !== null;
  const paraTomas = resumenParaTomas({ ...r, listo: trabajoListo });

  // §6 y §8: para el mismo día pasa sola a un vendedor.
  if (enContraTrabajo.some((m) => m.codigo === "para_hoy")) {
    return {
      contenido: json({
        estado: "derivada",
        que_decir: "La entrega (o el retiro en el depósito) es siempre desde el día siguiente: para el mismo día lo ve un vendedor. Decile en una línea que se lo pasás al equipo para ver qué se puede hacer y que le escriben por acá (fuera de horario, cuándo). Sin nombres ni plazos.",
      }),
      efecto: {
        estado: "derivada",
        motivo: "Alquiler simple para el mismo día",
        resumen: `Pide un alquiler simple para hoy.${a.ubicacion?.lugar ? ` En ${a.ubicacion.lugar}.` : ""} ${paraTomas.split("\n").slice(0, 2).join(" ")}`.slice(0, 600),
        urgente: false,
        textoFijo: null,
        silenciar: false,
      },
    };
  }
  if (!r.trabajoFacil) return { contenido: json({ estado: "no_es_facil", detalle: paraTomas, que_hacer: queHacerNoFacil(r) }) };

  const preguntar = r.faltan.map((f) => (f.codigo === "direccion" && preguntaDireccion ? preguntaDireccion : f.pregunta));
  if (preguntaDireccion && !preguntar.includes(preguntaDireccion)) preguntar.push(preguntaDireccion);
  if (!ficha.nombre) preguntar.push("¿A nombre de quién va el presupuesto?");
  if (preguntar.length || r.aConfirmar.length || !r.precio || (!deposito && !fleteOdoo) || !p.fecha || !r.franja) {
    return {
      contenido: json({
        estado: r.aConfirmar.length && !preguntar.length ? "confirmar" : "faltan_datos",
        ...(preguntar.length ? { preguntar } : {}),
        ...(r.aConfirmar.length ? { confirmar: r.aConfirmar.map((c) => c.texto) } : {}),
        detalle: paraTomas,
        que_hacer: "Preguntá de a una o dos cosas, con naturalidad, y volvé a llamar a esta herramienta con lo nuevo. Aconsejale lo que le sirve (sin montos).",
      }),
    };
  }

  // ── Sale solo: queda pendiente para la tarjeta (el precio lo manda el servidor al aprobar) ──
  // Si el cliente no es fácil (deuda, socios), igual se arma y lo decide la persona: el modelo
  // recibe lo mismo en los dos casos, para no filtrar el motivo (como la bandeja fácil).
  const asignacion = await servicios.asignar(ficha).catch(() => null);
  const alertas = ficha.mensajesCliente.flatMap(escanearPalabras);
  const entrega = { fecha: p.fecha, franja: r.franja };
  const fleteGuardado = deposito || !fleteOdoo ? null : fleteOdoo;
  const { numero } = await servicios.registrarPendiente({
    tipo: "precio",
    carril: "alquiler",
    resumen: resumenAlquiler(r, fleteGuardado, p.fecha, r.franja),
    montoPropuesto: r.precio.total,
    payload: {
      alquiler: { pedido: p, resultado: r, flete: fleteGuardado ? { id: fleteGuardado.carrierId, nombre: fleteGuardado.nombre, precio: fleteGuardado.precio } : null, entrega },
      alertas,
      asignacion,
      direccion: ficha.direccion,
    },
  });
  a.cotizacion = { numero, at: (servicios.ahora?.() ?? new Date()).toISOString(), ...entrega };
  return {
    contenido: json({ estado: "pendiente", presupuesto: `#${numero}`, detalle: paraTomas, que_decir: QUE_DECIR_ALQUILER, condiciones: condicionesAlquilerSimple(r.modalidad) }),
    efecto: { estado: "espera_ok", motivo: `presupuesto de alquiler #${numero}` },
  };
}

/**
 * Los estados de cli_aprobaciones en que el presupuesto ya le llegó. «falta_plantilla» NO: está
 * aprobado y en Odoo, pero la ventana estaba cerrada y no salió; nada lo manda solo hasta que una
 * persona toca «Mandar» en la tarjeta. Pedir los documentos ahí sería pedir requisitos sin que
 * haya visto el precio (§6, fila 11: primero el precio, después los requisitos).
 */
const PRESUPUESTO_ENVIADO = new Set(["aprobada", "corregida"]);
const PRESUPUESTO_EN_CAMINO = new Set(["pendiente", "ejecutando", "error", "falta_plantilla"]);

const FRANJA_DEPOSITO_NO_HORA = {
  contenido: json({ estado: "faltan_datos", preguntar: ["si pasa de 10 a 12 o de 13 a 16 (en el depósito no hay franja de una hora)"] }),
};

async function clienteAceptaAlquiler(i: z.infer<typeof esquemaAceptar>, { ficha, servicios }: ContextoHerramienta): Promise<ResultadoHerramienta> {
  const pedida = franjaDe(i.franja, i.hora_desde);
  if (!pedida) return FALTA_HORA;
  const p = await servicios.presupuestoAlquiler();
  if (!p) {
    return { contenido: json({ estado: "sin_presupuesto", que_hacer: "En esta charla no hay un presupuesto de alquiler simple. Si quiere avanzar con otro presupuesto, usá derivar_a_persona con quiere_avanzar." }) };
  }
  if (PRESUPUESTO_EN_CAMINO.has(p.estado)) {
    if (p.estado === "falta_plantilla") {
      // El cliente escribió: la ventana está abierta y el equipo lo puede mandar ya.
      await servicios.avisarEquipo(
        `El cliente quiere avanzar con el alquiler simple #${p.numero}${p.ordenAlquiler ? ` (${p.ordenAlquiler.nombre})` : ""}, pero el presupuesto no le llegó (faltaba la plantilla). La ventana de 24 h ya está abierta: mandalo desde la tarjeta.`,
        "WhatsApp de clientes · presupuesto sin mandar",
      );
    }
    return { contenido: json({ estado: "presupuesto_en_camino", que_decir: "El presupuesto todavía no le salió: decile que le llega por este mismo chat y que ahí lo confirman. Primero el precio, después los requisitos: no le pidas documentos todavía." }) };
  }
  if (!PRESUPUESTO_ENVIADO.has(p.estado)) {
    return { contenido: json({ estado: "presupuesto_no_salio", que_hacer: "Ese presupuesto no se le mandó (lo decidió el equipo). Usá derivar_a_persona con quiere_avanzar y un resumen." }) };
  }
  // Si el presupuesto es para retirar en el depósito, la franja es la del depósito (fila 17).
  const deposito = esFranjaDeposito(p.entrega?.franja) || (!p.entrega && ficha.alquiler?.pedido?.retiraEnDeposito === true);
  const franja = franjaSegunModalidad(pedida, deposito);
  if (!franja) return FRANJA_DEPOSITO_NO_HORA;
  const v = validarEntrega(i.fecha, franja, servicios.hoy, await servicios.feriados(), { deposito });
  if (!v.ok) {
    return {
      contenido: json({
        estado: "fecha_no_va",
        motivo: v.texto,
        ...(v.proxima ? { proxima: `${textoFecha(v.proxima.fecha)}${v.proxima.franja ? `, ${textoFranja(v.proxima.franja)}` : ""}` } : {}),
        que_decir: "Explicale por qué ese día o esa franja no van y ofrecele la próxima posible. Con lo que elija, volvé a llamar a esta herramienta.",
      }),
    };
  }
  // La franja de una hora cambia el precio (el recargo, fila 15): si no coincide con la cotizada,
  // el presupuesto se rehace. El día no cambia el precio.
  const cotizada = p.entrega?.franja ?? null;
  if (cotizada && (cotizada.tipo === "hora") !== (franja.tipo === "hora")) {
    return {
      contenido: json({
        estado: "cambia_el_presupuesto",
        que_hacer: franja.tipo === "hora"
          ? "La franja de una hora lleva un recargo por costos operativos que el presupuesto no tenía: decíselo (sin decir cuánto) y volvé a usar cotizar_alquiler_simple con la fecha y la franja nuevas, así el equipo le manda el presupuesto corregido."
          : "El presupuesto tenía la franja de una hora, con recargo; con una franja común cambia: volvé a usar cotizar_alquiler_simple con la fecha y la franja nuevas, así el equipo le manda el presupuesto corregido.",
      }),
    };
  }

  ficha.trabajo = "alquiler_simple";
  const a = (ficha.alquiler ??= alquilerVacio());
  const ahora = (servicios.ahora?.() ?? new Date()).toISOString();
  const igual = a.aceptado?.presupuesto === p.numero && a.aceptado.fecha === i.fecha && textoFranja(a.aceptado.franja) === textoFranja(franja);
  a.aceptado = { at: ahora, presupuesto: p.numero, fecha: i.fecha, franja };
  a.documentos ??= documentosVacios(ahora);
  if (!igual) {
    const otra = p.entrega && (p.entrega.fecha !== i.fecha || textoFranja(p.entrega.franja) !== textoFranja(franja))
      ? ` El presupuesto decía el ${textoFecha(p.entrega.fecha)}, ${textoFranja(p.entrega.franja)}: cambiala en la orden${p.ordenAlquiler ? ` ${p.ordenAlquiler.nombre}` : ""}.`
      : "";
    await servicios.avisarEquipo(
      `El cliente aceptó el alquiler simple #${p.numero}${p.ordenAlquiler ? ` (${p.ordenAlquiler.nombre})` : ""}: ${deposito ? `retira en el depósito (${DEPOSITO.texto})` : "entrega"} el ${textoFecha(i.fecha)}, ${textoFranja(franja)}.${otra} Tomás le pide los documentos (DNI y servicios); sin documentos no se entrega.`,
      "WhatsApp de clientes · aceptó un alquiler",
    );
  }
  const e = estadoDocumentos(a.documentos);
  return {
    contenido: json({
      estado: "aceptado",
      entrega: `${deposito ? "retira en el depósito el " : ""}${textoFecha(i.fecha)}, ${textoFranja(franja)}`,
      documentos: textoDocumentosParaTomas(e),
      que_decir: `${deposito
        ? `Confirmale el día y el horario en que pasa a retirarlo por el depósito (${DEPOSITO.texto}), y que venga con su vehículo y gente para cargarlo.`
        : "Confirmale el día y la franja (la hora exacta depende del recorrido de la camioneta)."}${e.completos
        ? " Los documentos ya están."
        : ` Pedile los documentos: la foto del DNI de frente y de dorso, y dos servicios a su nombre (luz, gas, agua, internet), o uno si no tiene dos. Se los pedimos a todos y sin los documentos no se ${deposito ? "entrega el material" : "entrega"}. Que los mande por acá.`}`,
    }),
  };
}

async function revisarDocumentos(i: z.infer<typeof esquemaDocumentos>, { ficha }: ContextoHerramienta): Promise<ResultadoHerramienta> {
  const d = ficha.alquiler?.aceptado ? ficha.alquiler.documentos : null;
  if (!d) {
    return { contenido: json({ estado: "no_corresponde", que_hacer: "Los documentos se piden cuando el cliente acepta el presupuesto de alquiler simple (cliente_acepta_alquiler). Primero el precio, después los requisitos." }) };
  }
  if (i.solo_tiene_un_servicio !== undefined) d.unSoloServicio = i.solo_tiene_un_servicio;
  const e = estadoDocumentos(d);
  return {
    contenido: json({
      estado: e.completos ? "completos" : "faltan",
      ya_estan: e.yaEstan,
      faltan: e.faltan,
      detalle: textoDocumentosParaTomas(e),
      que_decir: e.completos
        ? "Agradecele y confirmale que ya está todo para la entrega. No repitas ningún dato de los documentos."
        : "Pedile lo que falta, amable y en una línea. No repitas ningún dato de lo que mandó.",
    }),
  };
}

export type ResultadoRetiro = { ok: boolean; motivo: CodigoEntrega | "anticipacion" | null; texto: string; proxima: { fecha: string; franja: Franja } | null };

const HORA_MS = 3_600_000;
/** Dónde empieza la franja, en horas. */
const inicioFranja = (f: Franja) =>
  f.tipo === "manana" ? 8 : f.tipo === "tarde" || f.tipo === "deposito_tarde" ? 13 : f.tipo === "deposito_manana" ? 10 : f.desde;
/** La otra franja común del mismo día (para ofrecer la próxima). */
const OTRA_FRANJA: Partial<Record<Franja["tipo"], Franja>> = {
  manana: { tipo: "tarde" }, tarde: { tipo: "manana" }, deposito_manana: { tipo: "deposito_tarde" }, deposito_tarde: { tipo: "deposito_manana" },
};
/** Esa hora de ese día en Buenos Aires (UTC-3, sin horario de verano) → instante. */
const instanteBA = (fecha: string, horas: number) => Date.parse(`${fecha}T00:00:00Z`) + (horas + 3) * HORA_MS;
const diaSiguiente = (f: string) => new Date(Date.parse(`${f}T12:00:00Z`) + 24 * HORA_MS).toISOString().slice(0, 10);

/**
 * ¿Se puede retirar ese día en esa franja? (§6 y fila 13): las reglas de la entrega (nunca el
 * mismo día, ni domingos ni feriados, sábados de 8 a 12) y además 24 h de anticipación como
 * mínimo, medidas hasta el comienzo de la franja. Si no, la próxima posible: el primer día con la
 * misma franja (o, si es una de las comunes, la otra) que cumple todo. PURA.
 *
 * Con una franja del depósito es la devolución en el depósito (fila 17): las mismas 24 h, de
 * lunes a viernes, de 10 a 12 o de 13 a 16.
 */
export function validarRetiro(fecha: string, franja: Franja, ahora: Date, hoy: string, feriados: readonly string[]): ResultadoRetiro {
  const deposito = esFranjaDeposito(franja);
  const que = deposito ? "La devolución en el depósito" : "El retiro";
  const conTiempo = (f: string, fr: Franja) => instanteBA(f, inicioFranja(fr)) - ahora.getTime() >= 24 * HORA_MS;
  const otra = OTRA_FRANJA[franja.tipo];
  const opciones: Franja[] = otra ? [franja, otra] : [franja];
  const proxima = () => {
    let f = /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha > hoy ? fecha : diaSiguiente(hoy);
    for (let i = 0; i < 30; i++, f = diaSiguiente(f)) {
      for (const fr of opciones) if (validarEntrega(f, fr, hoy, feriados).ok && conTiempo(f, fr)) return { fecha: f, franja: fr };
    }
    return null;
  };
  const v = validarEntrega(fecha, franja, hoy, feriados);
  if (!v.ok) return { ok: false, motivo: v.motivo, texto: v.motivo === "hoy" ? `${que} no es en el mismo día en que avisan` : v.texto, proxima: proxima() };
  if (!conTiempo(fecha, franja)) {
    return { ok: false, motivo: "anticipacion", texto: `${que} se coordina con 24 h de anticipación como mínimo: para el ${textoFecha(fecha)}, ${textoFranja(franja)} no llega`, proxima: proxima() };
  }
  return { ok: true, motivo: null, texto: `${deposito ? "Devolución en el depósito" : "Retiro"} el ${textoFecha(fecha)}, ${textoFranja(franja)}`, proxima: { fecha, franja } };
}

/**
 * El fin del alquiler: el retiro (si se lo llevamos) o la devolución en el depósito (si lo retiró
 * él, fila 17). Cuál es lo dice el alquiler de la charla: el presupuesto aceptado o el pedido.
 */
async function pedirRetiro(i: z.infer<typeof esquemaRetiro>, { ficha, servicios }: ContextoHerramienta): Promise<ResultadoHerramienta> {
  const pedida = franjaDe(i.franja, i.hora_desde);
  if (!pedida) return FALTA_HORA;
  const al = ficha.alquiler;
  const deposito = al?.aceptado ? esFranjaDeposito(al.aceptado.franja) : al?.pedido?.retiraEnDeposito === true;
  const franja = franjaSegunModalidad(pedida, deposito);
  if (!franja) return FRANJA_DEPOSITO_NO_HORA;
  const ahora = servicios.ahora?.() ?? new Date();
  const v = validarRetiro(i.fecha, franja, ahora, servicios.hoy, await servicios.feriados());
  if (!v.ok) {
    return {
      contenido: json({
        estado: "fecha_no_va",
        motivo: v.texto,
        ...(v.proxima ? { proxima: `${textoFecha(v.proxima.fecha)}, ${textoFranja(v.proxima.franja)}` } : {}),
        que_decir: deposito
          ? "Explicale por qué no va (la devolución en el depósito se avisa con 24 h, nunca el mismo día; de lunes a viernes de 10 a 12 o de 13 a 16, sin feriados) y ofrecele la próxima posible. Con lo que elija, volvé a llamar a esta herramienta."
          : "Explicale por qué no va (el retiro se avisa con 24 h, nunca el mismo día; ni domingos ni feriados; los sábados de 8 a 12) y ofrecele la próxima posible. Con lo que elija, volvé a llamar a esta herramienta.",
      }),
    };
  }
  // En el depósito no hace falta la dirección: lo trae él.
  const direccion = deposito ? DEPOSITO.texto : i.direccion ?? al?.ubicacion?.normalizada ?? ficha.direccion ?? null;
  if (!direccion) return { contenido: json({ estado: "faltan_datos", preguntar: ["la dirección donde está el andamio"] }) };
  ficha.trabajo ??= "alquiler_simple";
  const a = (ficha.alquiler ??= alquilerVacio());
  a.retiro = { avisadoAt: ahora.toISOString(), fecha: i.fecha, franja, direccion };
  const num = a.aceptado ? ` simple #${a.aceptado.presupuesto}` : "";
  await servicios.avisarEquipo(
    deposito
      ? `El cliente avisa que devuelve el andamio del alquiler${num} en el depósito (${DEPOSITO.texto}): el ${textoFecha(i.fecha)}, ${textoFranja(franja)}. Coordinalo y confirmáselo por la charla.`
      : `El cliente pide el retiro del alquiler${num}: el ${textoFecha(i.fecha)}, ${textoFranja(franja)}${franja.tipo === "hora" ? " (franja de una hora: lleva el recargo)" : ""}, en ${direccion}. Coordinalo y confirmáselo por la charla.`,
    deposito ? "WhatsApp de clientes · devuelve en el depósito" : "WhatsApp de clientes · pide un retiro",
    { logistica: true },
  );
  return {
    contenido: json({
      estado: "anotado",
      [deposito ? "devolucion" : "retiro"]: `${textoFecha(i.fecha)}, ${textoFranja(franja)}`,
      que_decir: deposito
        ? `Confirmale que lo anotaste y que el equipo se lo confirma por acá. Recordale que lo traiga desarmado al depósito (${DEPOSITO.texto}), con su vehículo y gente para descargarlo, y que hasta que lo devuelva el alquiler sigue corriendo.`
        : `Confirmale que lo anotaste y que el equipo se lo confirma por acá. Recordale que el andamio tiene que estar desarmado y que tiene que haber gente para subirlo al camión (por el seguro, los choferes no pueden entrar), y que hasta que se retire el alquiler sigue corriendo.${franja.tipo === "hora" ? " La franja de una hora tiene un recargo por costos operativos (no digas cuánto)." : ""}`,
    }),
  };
}

// ── pedir_tecnico ──────────────────────────────────────────────────────────────────────

async function pedirTecnico(i: z.infer<typeof esquemaTecnico>, { ficha, servicios }: ContextoHerramienta): Promise<ResultadoHerramienta> {
  if (i.disponibilidad) ficha.visita = i.disponibilidad;
  const asignacion = await servicios.asignar(ficha);
  // Para la tarjeta del equipo (nunca para el modelo): por qué una bandeja con los datos
  // completos no salió como fácil (JS, 16/10: «a nombre de Joaquín» la marcaba sin que se viera).
  let porQueNoFacil: string[] | null = null;
  if (ficha.trabajo === "bandeja" && !faltantesBandeja(ficha).length) {
    try {
      porQueNoFacil = esFacil(ficha, await servicios.contextoFacil(ficha)).enContra.map((m) => m.texto);
    } catch {
      porQueNoFacil = null;
    }
  }
  const { numero } = await servicios.registrarPendiente({
    tipo: "tecnico",
    carril: "tecnico",
    resumen: i.resumen,
    montoPropuesto: null,
    payload: { motivo: i.motivo, resumen: i.resumen, disponibilidad: i.disponibilidad ?? null, asignacion, porQueNoFacil, ficha: { ...ficha, mensajesCliente: undefined } },
  });
  // Al modelo, sólo «pendiente»: el nombre lo manda el servidor cuando alguien confirma (§5).
  return {
    contenido: json({
      estado: "pendiente",
      que_decir: "Decile que ya se lo pasás al equipo y que le escriben por este mismo chat (fuera de horario, cuándo). Sin nombres, sin fechas.",
    }),
    efecto: { estado: "espera_ok", motivo: `asignación pendiente #${numero}` },
  };
}

// ── derivar_a_persona ──────────────────────────────────────────────────────────────────

async function derivarAPersona(i: z.infer<typeof esquemaDerivar>, { ficha }: ContextoHerramienta): Promise<ResultadoHerramienta> {
  const seguridad = i.motivo === "seguridad_obra";
  // Desprendimiento: urgente para el equipo, pero sin el texto de guardia (es un pedido, no una
  // obra de ABA con riesgo) y Sofía sigue hablando.
  const urgente = seguridad || i.motivo === "desprendimiento";
  // Una charla de gama alta lo dice en el motivo, elija el modelo el que elija (salvo los urgentes).
  const gamaAlta = ficha.segmento === "gama_alta" && !urgente && i.motivo !== "gama_alta";
  const motivo = gamaAlta ? `Gama alta · ${MOTIVOS_DERIVACION[i.motivo]}` : MOTIVOS_DERIVACION[i.motivo];
  return {
    contenido: seguridad
      ? json({ estado: "derivada", urgente: true, que_decir: "El sistema ya le mandó al cliente el texto de seguridad. No escribas nada más: respondé [nada]." })
      : json({ estado: "derivada", que_decir: "Decile en una línea que se lo pasás al equipo y que le escriben por acá (fuera de horario, cuándo). Sin nombres ni plazos." }),
    efecto: {
      estado: "derivada",
      motivo,
      resumen: i.resumen,
      urgente,
      textoFijo: seguridad ? "seguridad" : null,
      silenciar: seguridad,
    },
  };
}

// ── La lista ───────────────────────────────────────────────────────────────────────────

const HERRAMIENTAS: Def[] = [
  {
    nombre: "anotar_ficha",
    descripcion: "Anota en la ficha de ESTA charla lo que dijo el cliente. Usala cada vez que el cliente da un dato. Lo verificado (CABA, el catastro, el CUIT) no se anota acá: lo ponen las otras herramientas.",
    esquema: esquemaFicha,
    ejecutar: anotarFicha as Def["ejecutar"],
  },
  {
    nombre: "validar_cuit",
    descripcion: "Valida el dígito verificador de un CUIT o CUIL. No dice si ya es cliente ni de quién es.",
    esquema: esquemaCuit,
    ejecutar: validarCuitHerr as Def["ejecutar"],
  },
  {
    nombre: "verificar_direccion",
    descripcion: "Verifica la dirección de la obra (USIG y catastro de la Ciudad): si es CABA, cuánto mide el frente de la parcela y si es esquina. La anota en la ficha.",
    esquema: esquemaDireccion,
    ejecutar: verificarDireccion as Def["ejecutar"],
  },
  {
    nombre: "preparar_cotizacion_facil",
    descripcion: "Con la ficha completa de una bandeja, decide con reglas del servidor si es una bandeja fácil y, si lo es, deja la cotización PENDIENTE para que la revise el equipo. Devuelve sólo «pendiente» (con su número), «faltan datos» o «no es fácil». Nunca devuelve montos.",
    esquema: esquemaNada,
    ejecutar: prepararCotizacionFacil as Def["ejecutar"],
  },
  {
    nombre: "cotizar_alquiler_simple",
    descripcion: "Alquiler simple (andamio sin montaje que arma el cliente: módulos, baranda, tablones, ruedas o tornillones). Anota lo que te dijo (se suma en cada llamada: pasá sólo lo nuevo), busca el flete por la dirección (sólo Capital) o anota que lo retira en el depósito, y arma con las reglas del servidor el andamio que le sirve. Devuelve qué falta preguntar, qué tenés que confirmar con el cliente, «pendiente» (el presupuesto lo aprueba el equipo y lo manda el sistema) o «no es fácil» con qué hacer. Nunca devuelve montos.",
    esquema: esquemaAlquiler,
    ejecutar: cotizarAlquiler as Def["ejecutar"],
  },
  {
    nombre: "preparar_pedido_simple",
    descripcion: "Deja PENDIENTE un pedido de alquiler de material sin montaje para que una persona ponga el precio: lo que no entra en las reglas de cotizar_alquiler_simple (cuando te dice que lo cotiza un vendedor) o piezas sueltas que no son un andamio armado. El retiro en el depósito lo cotiza cotizar_alquiler_simple. Si el cliente no sabe qué piezas necesita, sabe_piezas en false: lo calcula el equipo.",
    esquema: esquemaSimple,
    ejecutar: prepararPedidoSimple as Def["ejecutar"],
  },
  {
    nombre: "pedir_tecnico",
    descripcion: "Para trabajos que no son fáciles (fachadas, esquinas, fuera de CABA, obras grandes) o que necesitan visita: el servidor propone a quién va y deja la asignación PENDIENTE del botón de una persona. Devuelve sólo «pendiente».",
    esquema: esquemaTecnico,
    ejecutar: pedirTecnico as Def["ejecutar"],
  },
  {
    nombre: "cliente_acepta_alquiler",
    descripcion: "Cuando el presupuesto de alquiler simple YA le llegó y el cliente dice que sí: anota la aceptación con el día y la franja de entrega, o en que pasa a retirarlo por el depósito (los valida), avisa al equipo y te dice cómo pedirle los documentos.",
    esquema: esquemaAceptar,
    ejecutar: clienteAceptaAlquiler as Def["ejecutar"],
  },
  {
    nombre: "revisar_documentos",
    descripcion: "Qué documentos del alquiler (DNI de frente y de dorso, servicios a su nombre) ya llegaron y cuáles faltan. Las fotos las revisa el sistema; vos no las ves. Si el cliente dice que tiene un solo servicio a su nombre, solo_tiene_un_servicio en true.",
    esquema: esquemaDocumentos,
    ejecutar: revisarDocumentos as Def["ejecutar"],
  },
  {
    nombre: "pedir_retiro",
    descripcion: "El cliente avisa que terminó un alquiler sin montaje: que retiremos el andamio, o que lo devuelve en el depósito si lo retiró él. Valida el día y la franja (24 h de anticipación, nunca el mismo día, ni domingos ni feriados; el retiro, sábados de 8 a 12; el depósito, de lunes a viernes de 10 a 12 o de 13 a 16), lo anota y avisa al equipo.",
    esquema: esquemaRetiro,
    ejecutar: pedirRetiro as Def["ejecutar"],
  },
  {
    nombre: "derivar_a_persona",
    descripcion: "Pasa la charla a una persona del equipo, con un motivo de la lista y un resumen. Después de esto no seguís atendiendo la charla.",
    esquema: esquemaDerivar,
    ejecutar: derivarAPersona as Def["ejecutar"],
  },
];

const POR_NOMBRE = new Map(HERRAMIENTAS.map((h) => [h.nombre, h]));
export const NOMBRES_HERRAMIENTAS = HERRAMIENTAS.map((h) => h.nombre);

let definiciones: Anthropic.Beta.BetaToolUnion[] | null = null;

/** Las definiciones para la API, en un orden fijo (cambiarlas hace perder el caché una vez). */
export function definicionesSofia(): Anthropic.Beta.BetaToolUnion[] {
  if (definiciones) return definiciones;
  definiciones = HERRAMIENTAS.map((h) => {
    const esquema = z.toJSONSchema(h.esquema, { io: "input" }) as Record<string, unknown>;
    delete esquema.$schema;
    return { name: h.nombre, description: h.descripcion, input_schema: esquema as Anthropic.Beta.BetaTool.InputSchema };
  });
  return definiciones;
}

export async function ejecutarHerramientaSofia(nombre: string, input: unknown, ctx: ContextoHerramienta): Promise<ResultadoHerramienta> {
  const h = POR_NOMBRE.get(nombre);
  if (!h) return { contenido: `No existe la herramienta «${nombre}».`, esError: true };
  const p = h.esquema.safeParse(input ?? {});
  if (!p.success) {
    const detalle = p.error.issues.map((x) => `${x.path.join(".") || "(entrada)"}: ${x.message}`).join("; ");
    return { contenido: `Entrada inválida: ${detalle}`, esError: true };
  }
  try {
    return await h.ejecutar(p.data as never, ctx);
  } catch (e) {
    return { contenido: `Falló: ${e instanceof Error ? e.message : String(e)}`, esError: true };
  }
}
