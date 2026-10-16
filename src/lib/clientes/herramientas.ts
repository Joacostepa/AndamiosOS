// Las 7 herramientas de Sofía (crm-propuesta.md §13). Lista CERRADA. Con tests
// (herramientas.test.ts).
//
// REGLAS DE TODAS:
//   · NINGUNA RECIBE EL ID DE OTRO CLIENTE: trabajan sobre la ficha de ESTA charla, que les pasa
//     el turno. Los esquemas son estrictos: una clave de más («cliente_id», «telefono»,
//     «partner_id») es un error, no se ignora.
//   · NINGUNA DEVUELVE PLATA NI DATOS DE OTROS: ni montos, ni saldos, ni deuda, ni tarifas, ni
//     nombres de quién lo va a atender. La cotización vuelve como «cotización #N pendiente»; si el
//     cliente tiene historial o deuda, el modelo recibe EXACTAMENTE lo mismo que si no (el motivo
//     queda para la tarjeta del equipo).
//   · Lo verificable lo escribe el servidor (CABA, el lote del catastro, el CUIT válido), nunca
//     el modelo: anotar_ficha no tiene esos campos.
//   · Lo que necesita el botón de una persona (precio, técnico, traspaso) queda PENDIENTE en
//     cli_aprobaciones para la tarjeta del paso 6. La charla pasa a «Espera tu OK».
//
// Lo que tocan afuera (catastro, Odoo, la base) llega en `ServiciosSofia`: así se prueban con
// servicios simulados, y en producción los arma agente.ts.

import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { validarCuit } from "../cotizador/cuit.ts";
import type { ConsultaLote } from "../catastro/caba.ts";
import type { Tarifas } from "../cotizador/tipos.ts";
import { frenteDelLote } from "../asistente/borrador.ts";
import { armarBorradorFacil, esFacil, fichaVacia, type BanderaIA, type ContextoFacil, type FichaCliente, type ParametrosFacil, escanearPalabras } from "./facil.ts";
import type { Asignacion } from "./asignacion.ts";

// ── La ficha de la charla ───────────────────────────────────────────────────────────────

export type PiezaPedida = { descripcion: string; cantidad: number };

/** La ficha de Sofía: la del paso 4 (FichaCliente) más lo de los otros trabajos. */
export type FichaSofia = FichaCliente & {
  mail: string | null;
  /** «usted» si el cliente escribe de usted. */
  trato: "vos" | "usted" | null;
  obra: { pisos: number | null; tienePlanos: boolean | null; descripcion: string | null } | null;
  /** Días y franjas para una visita, como los dijo el cliente. */
  visita: string | null;
  alquiler: {
    sabePiezas: boolean;
    piezas: PiezaPedida[];
    dias: number | null;
    entrega: "retira" | "envio" | null;
    barrio: string | null;
    notas: string | null;
  } | null;
};

export function fichaSofiaVacia(): FichaSofia {
  return { ...fichaVacia(), mail: null, trato: null, obra: null, visita: null, alquiler: null };
}

/** Lo guardado en cli_conversaciones.ficha (puede ser {} o de una versión vieja) → completa. */
export function leerFicha(guardada: unknown, telefono: string | null): FichaSofia {
  const g = guardada && typeof guardada === "object" ? (guardada as Partial<FichaSofia>) : {};
  const f = { ...fichaSofiaVacia(), ...g };
  f.mensajesCliente = Array.isArray(f.mensajesCliente) ? f.mensajesCliente : [];
  f.banderas = Array.isArray(f.banderas) ? f.banderas : [];
  if (!f.telefono && telefono) f.telefono = telefono;
  return f;
}

// ── Lo de afuera ───────────────────────────────────────────────────────────────────────

export type TipoPendiente = "precio" | "tecnico";
export type CarrilPendiente = "facil" | "simple" | "tecnico";

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
  /** YYYY-MM-DD, hora de Buenos Aires. */
  hoy: string;
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

export const MOTIVOS_DERIVACION = {
  seguridad_obra: "Seguridad en obra · urgente",
  pide_persona: "Pide hablar con una persona",
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
};

const QUE_DECIR_PENDIENTE =
  "Decile que ya tenés todo y que se lo confirmás en un rato con el presupuesto (fuera de horario, cuándo le escribe una persona). Sin montos, sin plazos y sin nombres.";

async function prepararCotizacionFacil(_i: z.infer<typeof esquemaNada>, { ficha, servicios }: ContextoHerramienta): Promise<ResultadoHerramienta> {
  if (ficha.trabajo && ficha.trabajo !== "bandeja") {
    return { contenido: json({ estado: "no_corresponde", que_hacer: "Esto es para bandejas. Para otros trabajos usá preparar_pedido_simple o pedir_tecnico." }) };
  }
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
  ficha.alquiler = {
    sabePiezas: i.sabe_piezas,
    piezas,
    dias: i.dias ?? ficha.alquiler?.dias ?? null,
    entrega: i.entrega ?? ficha.alquiler?.entrega ?? null,
    barrio: i.barrio ?? ficha.alquiler?.barrio ?? null,
    notas: i.notas ?? ficha.alquiler?.notas ?? null,
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

// ── pedir_tecnico ──────────────────────────────────────────────────────────────────────

async function pedirTecnico(i: z.infer<typeof esquemaTecnico>, { ficha, servicios }: ContextoHerramienta): Promise<ResultadoHerramienta> {
  if (i.disponibilidad) ficha.visita = i.disponibilidad;
  const asignacion = await servicios.asignar(ficha);
  const { numero } = await servicios.registrarPendiente({
    tipo: "tecnico",
    carril: "tecnico",
    resumen: i.resumen,
    montoPropuesto: null,
    payload: { motivo: i.motivo, resumen: i.resumen, disponibilidad: i.disponibilidad ?? null, asignacion, ficha: { ...ficha, mensajesCliente: undefined } },
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

async function derivarAPersona(i: z.infer<typeof esquemaDerivar>): Promise<ResultadoHerramienta> {
  const seguridad = i.motivo === "seguridad_obra";
  return {
    contenido: seguridad
      ? json({ estado: "derivada", urgente: true, que_decir: "El sistema ya le mandó al cliente el texto de seguridad. No escribas nada más: respondé [nada]." })
      : json({ estado: "derivada", que_decir: "Decile en una línea que se lo pasás al equipo y que le escriben por acá (fuera de horario, cuándo). Sin nombres ni plazos." }),
    efecto: {
      estado: "derivada",
      motivo: MOTIVOS_DERIVACION[i.motivo],
      resumen: i.resumen,
      urgente: seguridad,
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
    nombre: "preparar_pedido_simple",
    descripcion: "Deja PENDIENTE un pedido de alquiler de material sin montaje (cuerpos, tablones, ruedas) para que el equipo ponga el precio. Si el cliente no sabe qué piezas necesita, sabe_piezas en false: lo calcula el equipo.",
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
