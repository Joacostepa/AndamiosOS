// ¿Es una bandeja «fácil»? Y si lo es, el borrador que la cotiza. Puro, con tests
// (facil.test.ts). Sin IA: la regla está escrita acá y el precio lo pone el motor.
//
// docs/clientes/crm-propuesta.md §4 (reglas F1 a F9) con lo que decidió JS el 15/10 (§12):
//   · fácil = bandeja de protección de 3 m sola, en CABA, frente verificado sin esquina, que
//     cubre todo el frente y mide hasta `agente_facil_max_ml` (25 m.l.), cliente nuevo, sin
//     deuda, dirección no cotizada en 12 meses y nada raro en lo que escribió el cliente;
//   · el precio es la tarifa vigente del motor (hoy $140.000 el m.l.), sin bonificación;
//   · 1 jornada de armado y 1 de desarme (`agente_facil_jornadas`): excepción escrita al
//     criterio §4.9, sólo para este armado (decisión 6). Sólo mueven el opcional de SyH;
//   · los 4 opcionales estándar: concertina, gestoría, técnico de SyH y memoria de cálculo;
//   · el precio sale siempre «+ IVA» (con el total con IVA al lado, Ley 24.240).
//
// LA IA SÓLO PUEDE BAJAR UN PEDIDO DE FÁCIL A NO FÁCIL, NUNCA SUBIRLO: sus banderas suman
// motivos en contra, y además el código escanea solo el texto del cliente (escanearPalabras).
// Basta un motivo para que no sea fácil. Lo que no se sabe (catastro caído, Odoo sin responder)
// cuenta como «no»: ante la duda, lo ve una persona.
//
// Los parámetros (tope de metros, jornadas, render, empresas) llegan como argumento: así se
// prueba sin base, y en producción salen de Parámetros (parametrosFacilDesdeFilas).

import { borradorVacio, frenteDelLote, recalcular, type DatosBorrador, type ResultadoBorrador } from "../asistente/borrador.ts";
import type { Lote } from "../catastro/caba.ts";
import type { FilaParametro } from "../cotizador/tarifas.ts";
import type { Tarifas } from "../cotizador/tipos.ts";
import { detectarPlata } from "./filtro-salida.ts";
import { normalizar, primeraCoincidencia } from "./texto.ts";

// ── Parámetros ─────────────────────────────────────────────────────────────────────────

export type ParametrosFacil = {
  /** `agente_facil_max_ml`: el único tope de metros (§4, decisión 5). 25 al arrancar. */
  maxMl: number;
  /** `agente_facil_jornadas`: jornadas de armado, y otras tantas de desarme (decisión 6). */
  jornadas: number;
  /** `agente_facil_render`: el id del render genérico de bandeja en la biblioteca. */
  renderId: string | null;
  /**
   * `agente_facil_empresas_con_persona` (decisión 20, pendiente): si está prendido, una
   * empresa, constructora u organismo (o CUIT 30/33/34) no es fácil aunque el trabajo lo sea:
   * el bot arma el borrador y lo manda una persona. Apagado por defecto.
   */
  empresasConPersona: boolean;
};

/** Diferencia máxima entre los metros que dice el cliente y el frente del catastro (F4). */
export const TOLERANCIA_METROS_CLIENTE = 0.05;

/**
 * De las filas de cotizacion_parametros. Como tarifasDesdeParametros: si falta una clave, corta
 * con la lista (la migración 20261016000002 las agrega; ver la regla de los dos pasos en
 * docs/asistente-comercial/handoff.md).
 */
export function parametrosFacilDesdeFilas(filas: FilaParametro[]): ParametrosFacil {
  const porClave = new Map(filas.map((f) => [f.clave, f]));
  const faltan: string[] = [];
  const v = (clave: string) => {
    const f = porClave.get(clave);
    if (!f || f.valor === null || f.valor === undefined || Number.isNaN(Number(f.valor))) {
      faltan.push(clave);
      return 0;
    }
    return Number(f.valor);
  };
  // El render es texto y puede estar vacío (todavía no se eligió): la clave tiene que existir.
  const render = porClave.get("agente_facil_render");
  if (!render) faltan.push("agente_facil_render");
  const p: ParametrosFacil = {
    maxMl: v("agente_facil_max_ml"),
    jornadas: v("agente_facil_jornadas"),
    renderId: render?.texto?.trim() || null,
    empresasConPersona: v("agente_facil_empresas_con_persona") === 1,
  };
  if (faltan.length) throw new Error(`Faltan parámetros del agente de clientes: ${faltan.join(", ")}. Revisá Comercial → Parámetros de cotización.`);
  if (!(p.maxMl > 0) || !(p.jornadas > 0)) throw new Error("agente_facil_max_ml y agente_facil_jornadas tienen que ser mayores que cero.");
  return p;
}

// ── La ficha de la charla ───────────────────────────────────────────────────────────────

export type TipoTrabajo = "bandeja" | "alquiler_simple" | "fachada" | "otro";
export type TipoCliente = "particular" | "consorcio" | "empresa";

/** Lo que la IA puede marcar con anotar_ficha (§13). Sólo bajan a «no fácil». */
export type BanderaIA = "descuento" | "fecha" | "nocturno" | "condiciones" | "enojo" | "seguridad" | "persona" | "tramo" | "otro_trabajo";

/**
 * Lo que juntó la charla (cli_conversaciones.ficha). Lo que viene del cliente lo anota la IA;
 * lo verificable (CABA, el lote) lo escriben las herramientas del servidor, nunca la IA.
 */
export type FichaCliente = {
  nombre: string | null;
  /** El celular de WhatsApp. */
  telefono: string | null;
  cuit: string | null;
  /** Si el servidor lo encontró en Odoo (por phone_sanitized o CUIT). */
  partnerId?: number | null;
  /** La respuesta a «¿es para vos, para un consorcio o para una empresa o constructora?». */
  tipoCliente: TipoCliente | null;
  /** El botón que eligió el cliente. */
  trabajo: TipoTrabajo | null;
  /** Altura de la bandeja (3 es la estándar). */
  alturaBandeja: number | null;
  /** La respuesta a «¿necesitás también andamio para trabajar en el frente?». */
  necesitaAndamio: boolean | null;
  direccion: string | null;
  /** De la geocodificación USIG (verificar_direccion), no de lo que dice el cliente. */
  enCaba: boolean | null;
  /** Del catastro de CABA (verificar_direccion → consultarLote). */
  lote: Lote | null;
  /** El botón [Sí, todo] / [Sólo una parte]. */
  cubreTodoElFrente: boolean | null;
  /** Si el cliente dijo una medida. */
  metrosCliente: number | null;
  /** Todo lo que escribió el cliente (y la transcripción de sus audios). */
  mensajesCliente: string[];
  banderas: BanderaIA[];
};

export function fichaVacia(): FichaCliente {
  return {
    nombre: null, telefono: null, cuit: null, partnerId: null, tipoCliente: null, trabajo: null, alturaBandeja: null, necesitaAndamio: null,
    direccion: null, enCaba: null, lote: null, cubreTodoElFrente: null, metrosCliente: null, mensajesCliente: [], banderas: [],
  };
}

/** Lo que el servidor sabe y la IA no (§4, F5 a F7). null = no se pudo revisar. */
export type ContextoFacil = {
  parametros: ParametrosFacil;
  /** F5: cliente con historial en Odoo en los últimos 12 meses (por teléfono o CUIT). */
  clienteConHistorial: boolean | null;
  /** F7: deuda vencida. Al cliente nunca se le dice. */
  deudaVencida: boolean | null;
  /** F6: la dirección se cotizó en los últimos 12 meses (conflictoCanal). */
  direccionCotizada: boolean | null;
  /** Está en la lista de cuentas de los socios: nunca se le cotiza (§2). */
  cuentaSocio?: boolean;
};

// ── Escaneo de palabras (F9) ────────────────────────────────────────────────────────────

export type CodigoAlerta = "descuento" | "fecha" | "nocturno" | "otro_trabajo" | "esquina" | "tramo" | "enojo" | "seguridad" | "persona";

export type AlertaPalabra = { codigo: CodigoAlerta; palabra: string; texto: string };

const MESES = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";

// Escritas como se dicen: patronPalabra las normaliza (tildes, letras dobles) igual que al texto.
const PALABRAS: { codigo: CodigoAlerta; texto: string; terminos: (string | RegExp)[] }[] = [
  {
    codigo: "seguridad",
    texto: "Habla de un problema de seguridad en una obra",
    terminos: [
      /(?:^|[^a-z])(peligr[a-z]*|derumb[a-z]*|lastim[a-z]*|herid[a-z]*|golpe[a-z]*|tambale[a-z]*|acidente[a-z]*)/,
      "tabla floja", "floja", "flojo", "flojas", "flojos", "suelta", "suelto", "se mueve", "se cayo", "se cae", "se va a caer", "se esta cayendo",
      "cayo", "caida", "se rompio", "rota", "roto", "riesgo", "emergencia", "se vino abajo", "se desarmo", "se volo",
    ],
  },
  {
    codigo: "enojo",
    texto: "Parece enojado o es un reclamo",
    terminos: [
      /(?:^|[^a-z])(estaf[a-z]*|indignad[a-z]*|inutil[a-z]*|pesim[a-z]*|desastr[a-z]*|reclam[a-z]*|denunci[a-z]*)/,
      "verguenza", "una mierda", "mierda", "chantas", "chanta", "harto", "harta", "queja", "defensa del consumidor", "nadie me contesta", "nadie contesta",
      "nadie responde", "nadie viene", "nadie vino", "no vino nadie", "no viene nadie", "malisimo", "boludo", "boludos", "pelotudo", "pelotudos", "carajo",
      "la puta", "hdp", "forro", "forros", "ladrones", "sinverguenzas",
    ],
  },
  {
    codigo: "persona",
    texto: "Pide hablar con una persona",
    terminos: [
      "persona", "humano", "operador", "operadora", "asesor", "asesora", "vendedor", "vendedora", "atencion al cliente", "quiero hablar",
      "hablar con", "pasame con", "comunicarme con", "contactarme con", "llamame", "llamarme", "me llaman", "me pueden llamar", "me podes llamar",
      "me puede llamar", "llamada", "llamen", "dueno", "encargado", "gerente",
      // El equipo por su nombre.
      "sandra", "rocio", "agustina", "tamara", "gabriel", "jorge", "joaquin", "stepansky", "riveros",
    ],
  },
  {
    codigo: "descuento",
    texto: "Pide descuento, regatea o plantea condiciones de pago",
    terminos: [
      /(?:^|[^a-z])(descuent[a-z]*|descont[a-z]*|rebaj[a-z]*|bonific[a-z]*|regate[a-z]*|financ[a-z]*|promo[a-z]*)/,
      "caro", "muy cara", "esta cara", "mas barato", "mas barata", "me haces precio", "haceme precio", "hacer precio", "hacerme precio", "mejor precio",
      "precio especial", "otro me cobra", "me cobran menos", "cobran menos", "contado", "efectivo", "cuotas", "tarjeta", "cheque", "cheques", "echeq",
      "sin factura", "en negro", "oferta", "competencia", "me lo dejas", "lo dejas en", "lo podes dejar",
    ],
  },
  {
    codigo: "fecha",
    texto: "Menciona una fecha, un día o un apuro",
    terminos: [
      /(?:^|[^a-z])(urgen[a-z]*|apurad[a-z]*|inmediat[a-z]*)/,
      "lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "sabados", "domingo", "domingos", "finde", "fin de semana", "feriado",
      "manana", "pasado manana", "para hoy", "hoy mismo", "desde hoy", "hoy a la", "hoy a las", "esta semana", "semana que viene", "proxima semana",
      "semana proxima", "cuanto antes", "lo antes posible", "ya mismo", "fecha", "plazo", "cuando arman", "cuando pueden", "cuando lo arman",
      new RegExp(`(?:^|[^a-z])((?:para|en|desde|hasta|antes de|despues de|principios de|fines de|fin de|mediados de) (?:${MESES}))(?![a-z])`),
      /(?:^|[^a-z0-9])((?:el|para el|desde el|hasta el|el dia) \d{1,2})(?![0-9a-z])/,
      /(?:^|[^0-9])(\d{1,2} ?\/ ?\d{1,2})(?![0-9])/,
    ],
  },
  {
    codigo: "nocturno",
    texto: "Pide trabajo de noche",
    terminos: ["noche", "de noche", "a la noche", "nocturno", "nocturna", "madrugada"],
  },
  {
    codigo: "otro_trabajo",
    texto: "Pide algo más que una bandeja de 3 m (andamio, pintura, pisos…)",
    terminos: [
      /(?:^|[^a-z])(andami[a-z]*|pint[aou][a-z]*|demol[a-z]*|apuntal[a-z]*)/,
      "pisos", "fachada", "torre", "colgante", "silleta", "balancin", "escalera", "tribuna", "escenario", "evento", "cuerpos", "cuerpo", "modulos",
      "tablones", "tablon", "ruedas", "media sombra", "puntales", "doble bandeja", "bandeja doble", "techo",
    ],
  },
  {
    codigo: "esquina",
    texto: "Dice que es una esquina",
    terminos: ["esquina", "esq", "ochava"],
  },
  {
    codigo: "tramo",
    texto: "Dice que es sólo una parte del frente",
    terminos: ["tramo", "una parte", "parte del frente", "la mitad", "un pedazo", "solo un lado", "un costado", "un sector"],
  },
];

/**
 * Las palabras de alerta en un texto del cliente. Resiste tildes, mayúsculas, letras repetidas,
 * letras separadas y «x ciento» (ver texto.ts). Además, cualquier monto que escriba el cliente
 * («otro me cobra $100.000», «140 lucas») cuenta como regateo.
 */
export function escanearPalabras(texto: string): AlertaPalabra[] {
  const n = normalizar(texto);
  const alertas: AlertaPalabra[] = [];
  for (const p of PALABRAS) {
    const palabra = primeraCoincidencia(n, p.terminos);
    if (palabra) alertas.push({ codigo: p.codigo, palabra, texto: p.texto });
  }
  // Los signos se pierden al normalizar: «!!!» se mira en el texto original.
  const gritos = /!{3,}/.exec(texto ?? "");
  if (gritos && !alertas.some((a) => a.codigo === "enojo")) alertas.push({ codigo: "enojo", palabra: gritos[0], texto: "Parece enojado o es un reclamo" });
  if (!alertas.some((a) => a.codigo === "descuento")) {
    // Los números con forma de monto no: el cliente escribe su CUIT, su DNI o su dirección.
    const plata = detectarPlata(texto).hallazgos.find((h) => h.codigo !== "numero_de_monto");
    if (plata) alertas.push({ codigo: "descuento", palabra: plata.fragmento, texto: "Habla de plata (un monto, un porcentaje o un descuento)" });
  }
  return alertas;
}

// ── esFacil ─────────────────────────────────────────────────────────────────────────────

export type CodigoMotivo =
  | "trabajo" | "palabras" | "bandera" | "caba" | "frente" | "esquina" | "cubre_frente" | "tope_ml" | "metros_cliente"
  | "historial" | "conflicto_canal" | "deuda" | "cuenta_socio" | "empresa";

/** Una línea de «Por qué es fácil» en la tarjeta del vendedor: ✓ si ok, ✗ si no. */
export type Motivo = {
  codigo: CodigoMotivo;
  ok: boolean;
  texto: string;
  /** trabajo: lo que se cotiza · cliente: quién lo pide (F5–F7, socios, empresas). */
  grupo: "trabajo" | "cliente";
};

export type ResultadoFacil = {
  facil: boolean;
  /**
   * El trabajo es fácil aunque el cliente no (ya es cliente, dirección cotizada, deuda,
   * empresa): el bot arma igual el borrador y se lo deja a la pareja, con la marca «revisá el
   * precio pactado» (§4). Nunca sale solo.
   */
  trabajoFacil: boolean;
  /** Todos los chequeos, a favor y en contra, en el orden de la tarjeta. */
  motivos: Motivo[];
  /** Sólo los que fallaron, para el «No es fácil: ✗ esquina». */
  enContra: Motivo[];
  /** Los metros que se cotizarían (el frente del catastro), si se saben. */
  metros: number | null;
  alertas: AlertaPalabra[];
};

const ml = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

/** CUIT de sociedad (30, 33, 34): para la decisión 20. */
function cuitDeSociedad(cuit: string | null): boolean {
  const d = (cuit ?? "").replace(/\D/g, "");
  return d.length === 11 && ["30", "33", "34"].includes(d.slice(0, 2));
}

/** El lote verificado en el catastro para la dirección de la ficha (no el de otra dirección). */
function loteVigente(f: FichaCliente): Lote | null {
  const l = f.lote;
  if (!l || l.fuente !== "catastro" || !f.direccion?.trim()) return null;
  return l.direccionConsultada.trim() === f.direccion.trim() ? l : null;
}

export function esFacil(ficha: FichaCliente, contexto: ContextoFacil): ResultadoFacil {
  const p = contexto.parametros;
  const motivos: Motivo[] = [];
  const trabajo = (codigo: CodigoMotivo, ok: boolean, texto: string) => motivos.push({ codigo, ok, texto, grupo: "trabajo" });
  const cliente = (codigo: CodigoMotivo, ok: boolean, texto: string) => motivos.push({ codigo, ok, texto, grupo: "cliente" });

  // F1: bandeja de 3 m sola.
  if (ficha.trabajo !== "bandeja") {
    const que = { alquiler_simple: "alquiler de material", fachada: "andamio de fachada", otro: "otro trabajo" } as const;
    trabajo("trabajo", false, ficha.trabajo ? `No es una bandeja: ${que[ficha.trabajo]}` : "Falta saber qué trabajo pide");
  } else if (ficha.alturaBandeja !== 3) {
    trabajo("trabajo", false, ficha.alturaBandeja ? `Bandeja de ${ml(ficha.alturaBandeja)} m (la fácil es la de 3 m)` : "Falta la altura de la bandeja");
  } else if (ficha.necesitaAndamio !== false) {
    trabajo("trabajo", false, ficha.necesitaAndamio ? "También necesita andamio para el frente" : "Falta confirmar que no necesita andamio para el frente");
  } else {
    trabajo("trabajo", true, "Bandeja de 3 m sola");
  }

  // F9: el escaneo del código y las banderas de la IA. Basta una.
  const alertas = ficha.mensajesCliente.flatMap(escanearPalabras);
  const porCodigo = new Map<string, AlertaPalabra>();
  for (const a of alertas) if (!porCodigo.has(a.codigo)) porCodigo.set(a.codigo, a);
  for (const a of porCodigo.values()) trabajo("palabras", false, `${a.texto} («${a.palabra}»)`);
  const BANDERA: Record<BanderaIA, string> = {
    descuento: "La IA marcó: pide descuento o regatea",
    fecha: "La IA marcó: pide una fecha",
    nocturno: "La IA marcó: trabajo de noche",
    condiciones: "La IA marcó: condiciones especiales",
    enojo: "La IA marcó: enojo o reclamo",
    seguridad: "La IA marcó: problema de seguridad en obra",
    persona: "La IA marcó: pide hablar con una persona",
    tramo: "La IA marcó: sólo una parte del frente",
    otro_trabajo: "La IA marcó: pide otro trabajo",
  };
  for (const b of new Set(ficha.banderas)) trabajo("bandera", false, BANDERA[b] ?? `La IA marcó: ${b}`);
  if (!porCodigo.size && !ficha.banderas.length) trabajo("palabras", true, "Sin palabras de alerta");

  // F2: CABA, según USIG.
  trabajo("caba", ficha.enCaba === true, ficha.enCaba === true ? "CABA" : ficha.enCaba === false ? "Fuera de CABA" : "Falta verificar que sea CABA");

  // F3: frente verificado en el catastro, sin esquina.
  const lote = loteVigente(ficha);
  const frente = lote ? frenteDelLote(lote) : null;
  if (!lote) {
    trabajo("frente", false, ficha.lote?.fuente === "vendedor" ? "Frente sin verificar en el catastro (lo dio una persona)" : ficha.lote ? "Cambió la dirección: hay que volver a verificar el frente" : "Frente sin verificar en el catastro");
  } else if (!frente) {
    trabajo("frente", false, "El catastro no tiene la medida del frente");
  } else {
    trabajo("frente", true, `Frente verificado: ${ml(frente)} m (parcela ${lote.smp ?? "s/d"})`);
  }
  if (lote) trabajo("esquina", !lote.esquina, lote.esquina ? `Esquina${lote.calles.length ? ` (${lote.calles.join(" y ")})` : ""}` : "Sin esquina");

  // F4: cubre todo el frente, hasta el tope, y los metros del cliente no difieren más del 5 %.
  trabajo(
    "cubre_frente",
    ficha.cubreTodoElFrente === true,
    ficha.cubreTodoElFrente === true ? "Cubre todo el frente" : ficha.cubreTodoElFrente === false ? "Sólo una parte del frente" : "Falta confirmar que cubre todo el frente",
  );
  if (frente) {
    trabajo("tope_ml", frente <= p.maxMl, frente <= p.maxMl ? `${ml(frente)} m.l. ≤ ${ml(p.maxMl)}` : `${ml(frente)} m.l.: pasa el tope de ${ml(p.maxMl)}`);
    if (ficha.metrosCliente !== null && ficha.metrosCliente > 0) {
      const difiere = Math.abs(ficha.metrosCliente - frente) / frente > TOLERANCIA_METROS_CLIENTE;
      trabajo("metros_cliente", !difiere, difiere
        ? `El cliente dijo ${ml(ficha.metrosCliente)} m y el catastro dice ${ml(frente)} m`
        : `Los metros del cliente coinciden con el catastro`);
    }
  }

  // F5: cliente nuevo. F6: dirección no cotizada. F7: sin deuda.
  const h = contexto.clienteConHistorial;
  cliente("historial", h === false, h === false ? "Cliente nuevo" : h ? "Ya es cliente (historial en 12 meses): revisá el precio pactado" : "No se pudo revisar si ya es cliente");
  const c = contexto.direccionCotizada;
  cliente("conflicto_canal", c === false, c === false ? "Sin conflicto de canal" : c ? "La dirección se cotizó en los últimos 12 meses" : "No se pudo revisar si la dirección ya se cotizó");
  const d = contexto.deudaVencida;
  cliente("deuda", d === false, d === false ? "Sin deuda vencida" : d ? "Tiene deuda vencida (no decírselo al cliente)" : "No se pudo revisar la deuda");
  if (contexto.cuentaSocio) cliente("cuenta_socio", false, "Cuenta de los socios: no se le cotiza");
  if (p.empresasConPersona && (ficha.tipoCliente === "empresa" || cuitDeSociedad(ficha.cuit))) {
    cliente("empresa", false, "Empresa, constructora u organismo: lo manda una persona");
  }

  const enContra = motivos.filter((m) => !m.ok);
  return {
    facil: enContra.length === 0,
    trabajoFacil: !enContra.some((m) => m.grupo === "trabajo"),
    motivos,
    enContra,
    metros: frente,
    alertas,
  };
}

// ── armarBorradorFacil ──────────────────────────────────────────────────────────────────

export type OpcionesArmado = {
  parametros: ParametrosFacil;
  /** Fecha del cálculo (YYYY-MM-DD). */
  hoy: string;
  /**
   * El resultado de conflictoCanal, ya revisado por el servidor (F6). Sin esto el borrador no
   * se puede emitir, igual que en el asistente.
   */
  conflictoCanal?: string | null;
  tipoCliente?: TipoCliente | null;
};

export type BorradorFacil = {
  datos: DatosBorrador;
  resultado: ResultadoBorrador;
  /** Los metros cotizados (el frente del catastro). */
  metros: number | null;
  /**
   * Lo que impide mandarlo como fácil: precio que no es el de tarifa (F8), un bloqueo del motor,
   * un faltante del borrador o un parámetro sin cargar. Los datos del cliente para darlo de alta
   * (mail, domicilio, CUIT) no cuentan: se piden cuando dice «me interesa» (§4).
   */
  problemas: string[];
};

/** Lo que se pide al aprobar, no para cotizar (§4: «el CUIT no se pide para cotizar»). */
const FALTANTES_DEL_ALTA = new Set(["cliente_nuevo", "cuit"]);

const m = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

function textos(direccion: string, metros: number, t: Tarifas, jornadas: number) {
  const minimo = metros < t.bandeja.minimoMl;
  const jd = `${m(jornadas)} jornada${jornadas === 1 ? "" : "s"}`;
  return {
    referencia: `Bandeja de protección ${m(metros)} m.l.`,
    seccion1:
      `Provisión, armado y desarme de **bandeja de protección peatonal de 3 m** sobre la vereda de **${direccion}**, ` +
      `en **${m(metros)} m.l.** (todo el frente), por un período de **${m(t.periodoMinimoDias)} días**.` +
      (minimo ? ` El frente mide ${m(metros)} m: se factura el mínimo de ${m(t.bandeja.minimoMl)} m.l.` : ""),
    seccion2: [
      {
        titulo: "Sistema constructivo",
        contenido: "* Bandeja de protección peatonal de 3 m de altura, con estructura tubular y plataforma de protección.\n* Cumple con el Decreto 911/96.",
      },
      {
        titulo: "Descripción de la estructura",
        contenido: `* ${m(metros)} m.l. sobre la vereda, a lo largo de todo el frente (medido en el catastro de la Ciudad).` +
          (minimo ? `\n* Mínimo facturable: ${m(t.bandeja.minimoMl)} m.l.` : ""),
      },
      {
        titulo: "Plazos de armado y desarme",
        contenido: `* Armado: ${jd}.\n* Desarme: ${jd}.\n* Las fechas se coordinan al confirmar el presupuesto.`,
      },
      {
        titulo: "Alcance del servicio",
        contenido:
          `* Incluye: provisión del material, flete, armado y desarme, y el alquiler de los primeros ${m(t.periodoMinimoDias)} días.\n` +
          "* Opcionales: gestión del permiso de vía pública, alambre tipo concertina, técnico de Seguridad e Higiene y memoria de cálculo.\n" +
          `* Si la obra sigue después de los ${m(t.periodoMinimoDias)} días, cada mes adicional se cobra aparte (ver renovación).`,
      },
    ],
  };
}

/**
 * El borrador de la bandeja fácil, compatible con el del asistente comercial (DatosBorrador), y
 * su cálculo con el motor. Modelo A, contrato «Obra», los metros del catastro, la tarifa vigente
 * sin bonificación, las jornadas del parámetro y los 4 opcionales estándar (concertina y gestoría
 * los pone la bandeja; SyH y memoria, opcionalesEstandar del asistente).
 *
 * Se llama después de esFacil (o con trabajoFacil, para dejárselo a la pareja). No decide si es
 * fácil: arma lo que hay y avisa en `problemas` lo que no cierra.
 */
export function armarBorradorFacil(ficha: FichaCliente, tarifas: Tarifas, opciones: OpcionesArmado): BorradorFacil {
  const p = opciones.parametros;
  const problemas: string[] = [];
  const lote = loteVigente(ficha);
  const metros = lote ? frenteDelLote(lote) : null;
  const direccion = ficha.direccion?.trim() ?? "";

  const d = borradorVacio();
  d.cliente = {
    ...d.cliente,
    partnerId: ficha.partnerId ?? null,
    razonSocial: ficha.nombre?.trim() || null,
    contacto: ficha.nombre?.trim() || null,
    celular: ficha.telefono,
    cuit: ficha.cuit,
    esNuevo: !ficha.partnerId,
  };
  d.obra = { direccion: direccion || null, enCaba: ficha.enCaba, lote: ficha.lote };
  d.modelo = "A";
  d.contrato = "Obra ";
  d.jornadas = { armado: p.jornadas, desarme: p.jornadas, personas: null };
  d.render = p.renderId ? { eleccion: "biblioteca", renderId: p.renderId, path: null } : { eleccion: null, renderId: null, path: null };
  // «$X + IVA (total $Y)» para todos (decisión 8): el PDF muestra el neto y el total con IVA.
  d.condiciones = { ...d.condiciones, mostrarTotalConIva: true };
  d.trabajo = { ...d.trabajo, ambito: "obra" };
  d.decisiones = { jornadas: `${m(p.jornadas)} de armado y ${m(p.jornadas)} de desarme: regla del armado fácil (decisión 6 de JS, 15/10)` };
  if (opciones.conflictoCanal !== undefined) d.conflictoCanal = { revisado: true, resultado: opciones.conflictoCanal };
  const tipo = opciones.tipoCliente ?? ficha.tipoCliente;
  d.perfilComercial = { origen: "Asistente WA", ...(tipo ? { tipoCliente: tipo } : {}) };
  d.notasInternas = "Armado por el agente de clientes de WhatsApp (bandeja fácil): metros del catastro, tarifa vigente y jornadas fijas del parámetro.";

  if (metros && direccion) {
    const tx = textos(direccion, metros, tarifas, p.jornadas);
    d.referencia = tx.referencia;
    d.seccion1 = tx.seccion1;
    d.seccion2 = tx.seccion2;
    // Sin precioMl ni bonificación: el motor pone la tarifa (F8).
    d.calculos = { bandeja: { metros, altura: 3, concertina: "opcional", gestoria: "opcional", enCaba: true } };
  } else {
    problemas.push("Falta el frente verificado en el catastro: sin eso no hay metros para cotizar.");
  }

  const resultado = recalcular(d, { tarifas, lista: null, hoy: opciones.hoy });

  if (metros && metros > p.maxMl) problemas.push(`${m(metros)} m.l. pasa el tope de la bandeja fácil (${m(p.maxMl)} m.l.).`);
  if (!p.renderId) problemas.push("Falta el render genérico de bandeja (agente_facil_render en Parámetros).");
  // F8: el precio es el de la tarifa, sin bonificación ni desvíos.
  const bandeja = resultado.lineas.find((l) => l.id === "bandeja");
  if (bandeja && bandeja.precioUnitario !== tarifas.bandeja.m3) problemas.push("El precio de la bandeja no es el de la tarifa vigente.");
  for (const l of resultado.lineas) {
    if (l.descuentoPct) problemas.push(`«${l.descripcion}» tiene una bonificación: lo fácil sale a precio de lista.`);
    if (l.desvio) problemas.push(`«${l.descripcion}» se aparta de la tarifa (${l.desvio.motivo}).`);
  }
  for (const f of resultado.faltantes) {
    if (FALTANTES_DEL_ALTA.has(f.codigo)) continue;
    if (f.codigo === "render" && !p.renderId) continue; // ya está arriba
    if (f.codigo === "obra" || f.codigo === "frente_lote") {
      if (metros) problemas.push(f.texto);
      continue;
    }
    problemas.push(f.texto);
  }

  return { datos: d, resultado, metros, problemas: [...new Set(problemas)] };
}
