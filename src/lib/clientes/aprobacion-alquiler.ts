// La tarjeta de aprobación del ALQUILER SIMPLE (carril «alquiler»): las reglas, sin base ni red.
// Puro, con tests (aprobacion-alquiler.test.ts). Lo que toca Supabase, Odoo y Meta está en
// aprobar.ts (aprobarAlquiler), con el mismo orden y las mismas garantías que la bandeja fácil.
//
// docs/sofia/alquiler-simple-propuesta.md §1 («lo aprueba JS con la misma tarjeta»), §5 (un solo
// precio por 30 días), §6 (la entrega) y §10 («al aprobar, crea la orden en Odoo con los productos
// de alquiler y las fechas, el método de envío del barrio y la línea de mínimo operativo»).
//
// Qué hay acá:
//   · leer lo que dejó la herramienta de Tomás en cli_aprobaciones.payload.alquiler (pedido,
//     resultado del motor, flete de Odoo y la entrega pedida);
//   · RECALCULAR con los parámetros y el flete de hoy (el motor, cotizarAlquilerSimple): lo que
//     se aprueba es lo de hoy, y si no es lo que vio la persona, no se manda (verificarRecalculo,
//     de aprobacion.ts, como en la bandeja);
//   · lo que bloquea mandarlo (lo que se sale de las reglas de la §8, un dato que falta, una fecha
//     que ya no se puede) y lo que sólo se avisa (palabras de alerta, deuda: decide la persona);
//   · «Corregir»: el total, las cantidades, la fecha o el texto, con motivo;
//   · lo que va a Odoo (CotizacionParaOdoo de src/lib/odoo/alquiler-simple.ts) y la nota interna;
//   · lo que muestra la tarjeta (TarjetaAlquiler, en vista-aprobacion.ts).
//
// TOMÁS NO VE NADA DE ESTO: es para la tarjeta del equipo, Odoo y el mensaje que manda el
// SERVIDOR al aprobar (mensajePresupuestoAlquiler del motor).

import {
  cotizarAlquilerSimple, DEPOSITO, describirArmado, mensajePresupuestoAlquiler, metros, pesos, textoFecha, textoFranja, textoNoLlega, textoPeldano,
  type Armado, type ClienteAlquiler, type CodigoMotivoAlquiler, type CodigoPieza, type FleteAlquiler, type Franja,
  type CodigoConfirmacion, type LineaAlquiler, type MotivoAlquiler, type ParametrosAlquiler, type PedidoAlquiler, type PrecioAlquiler, type ResultadoAlquiler,
} from "./alquiler-simple.ts";
import {
  BARRIOS_CABA_EN_LISTA, CODIGOS_PIEZA, FRANJA_DEPOSITO_MANANA, FRANJA_DEPOSITO_TARDE, FRANJA_MANANA, FRANJA_TARDE, lineasOrdenAlquilerSimple, normalizarLugar,
  type CotizacionParaOdoo, type Flete, type Franja as FranjaOdoo,
} from "../odoo/alquiler-simple.ts";
import type { Feriado } from "../feriados/argentina.ts";
import type { FichaCliente } from "./facil.ts";
import type { TipoCorreccion } from "./aprobacion.ts";

// ── Lo que dejó Tomás ───────────────────────────────────────────────────────────────────

/** El flete del barrio como lo guarda la herramienta: el método de envío de Odoo (354 a 450). */
export type FleteGuardado = { carrierId: number; nombre: string; precio: number };

/** La entrega pedida: el día (AAAA-MM-DD) y la franja (§6). */
export type EntregaPedida = { fecha: string; franja: Franja };

export type PayloadAlquiler = {
  pedido: PedidoAlquiler;
  /** El resultado del motor cuando Tomás lo armó: de acá salen la deuda y la cuenta de los socios. */
  resultado: ResultadoAlquiler;
  /** null si retira en el depósito (pedido.retiraEnDeposito): no hay flete. */
  flete: FleteGuardado | null;
  entrega: EntregaPedida | null;
  /** La dirección de entrega (ficha.direccion). */
  direccion: string | null;
};

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function franjaValida(v: unknown): Franja | null {
  const f = obj(v);
  if (!f) return null;
  if (f.tipo === "manana" || f.tipo === "tarde" || f.tipo === "deposito_manana" || f.tipo === "deposito_tarde") return { tipo: f.tipo };
  if (f.tipo === "hora" && typeof f.desde === "number" && Number.isFinite(f.desde)) return { tipo: "hora", desde: f.desde };
  return null;
}

/**
 * El flete guardado. El contrato con la herramienta dice `{ id, nombre, precio }`; el módulo de
 * Odoo lo llama `carrierId`. Se aceptan los dos para no depender de cuál quedó.
 */
function fleteValido(v: unknown): FleteGuardado | null {
  const f = obj(v);
  if (!f) return null;
  const id = Number(f.carrierId ?? f.id);
  const precio = Number(f.precio);
  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(precio)) return null;
  return { carrierId: id, nombre: typeof f.nombre === "string" ? f.nombre : "", precio };
}

/**
 * Lo que hay en cli_aprobaciones.payload para el carril «alquiler»: `{ alquiler: { pedido,
 * resultado, flete, entrega }, alertas, asignacion, direccion }`. Tira si falta el pedido o el
 * resultado (sin eso no hay qué aprobar); la entrega, si no vino aparte, es la del pedido.
 */
export function leerPayloadAlquiler(payload: Record<string, unknown> | null | undefined): PayloadAlquiler {
  const a = obj(payload?.alquiler);
  const pedido = obj(a?.pedido) as PedidoAlquiler | null;
  const resultado = obj(a?.resultado) as ResultadoAlquiler | null;
  if (!pedido || !resultado) throw new Error("La cotización de alquiler no tiene el pedido o el resultado del motor: pedile a Tomás que la vuelva a armar.");
  const e = obj(a?.entrega);
  const fecha = typeof e?.fecha === "string" ? e.fecha : pedido.fecha;
  const franja = franjaValida(e?.franja) ?? franjaValida(pedido.franja);
  // Los pedidos armados antes del 12/11 a la tarde: `aceptaPeldano` (hoy aceptaPlataforma) y sin
  // la modalidad (eran todos con envío).
  const viejo = pedido as PedidoAlquiler & { aceptaPeldano?: boolean | null };
  return {
    pedido: {
      ...pedido,
      piezasFueraDeCatalogo: Array.isArray(pedido.piezasFueraDeCatalogo) ? pedido.piezasFueraDeCatalogo : [],
      aceptaPlataforma: typeof pedido.aceptaPlataforma === "boolean" ? pedido.aceptaPlataforma : typeof viejo.aceptaPeldano === "boolean" ? viejo.aceptaPeldano : null,
      retiraEnDeposito: typeof pedido.retiraEnDeposito === "boolean" ? pedido.retiraEnDeposito : null,
    },
    resultado,
    flete: fleteValido(a?.flete),
    entrega: fecha && franja ? { fecha, franja } : null,
    direccion: typeof payload?.direccion === "string" && payload.direccion.trim() ? payload.direccion.trim() : null,
  };
}

/**
 * La entrega del presupuesto, para comparar la que acepta el cliente (cliente_acepta_alquiler).
 * Primero la que se aprobó y le llegó (payload.envioAlquiler, que deja aprobar.ts, con la
 * corrección de fecha si hubo); si todavía no se aprobó, la que cotizó Tomás. Si se leyera
 * siempre la de Tomás, con una corrección de la franja de una hora Tomás le diría al cliente que
 * el presupuesto «no tenía» el recargo que sí le llegó, y armaría otro. PURA.
 */
export function entregaDelPresupuesto(payload: Record<string, unknown> | null | undefined): EntregaPedida | null {
  for (const e of [obj(obj(payload?.envioAlquiler)?.entrega), obj(obj(payload?.alquiler)?.entrega)]) {
    const franja = franjaValida(e?.franja);
    if (typeof e?.fecha === "string" && franja) return { fecha: e.fecha, franja };
  }
  return null;
}

// ── El contexto de hoy ──────────────────────────────────────────────────────────────────

export type ContextoRecalculo = {
  parametros: ParametrosAlquiler;
  /** Los fletes de hoy (fletesAlquilerSimple). null: no se pudo leer Odoo. */
  fletes: Flete[] | null;
  hoy: string;
  feriados: readonly (Feriado | string)[];
  /** Lo que escribió el cliente hasta ahora (las palabras de alerta pueden haber cambiado). */
  ficha: Pick<FichaCliente, "mensajesCliente" | "banderas" | "segmento">;
  /** El momento: el retiro en el depósito necesita 24 h hasta la franja (fila 17). */
  ahora?: Date | null;
};

/**
 * El flete de HOY para el método de envío que eligió Tomás. Si el método ya no está en la lista
 * (lo archivaron), es «fuera de lista»: el motor lo saca de fácil y la tarjeta bloquea. Si no se
 * pudo leer Odoo, se usa el guardado con un aviso (para mostrar la tarjeta; al aprobar, aprobar.ts
 * exige leerlo).
 */
export function fleteDeHoy(
  fletes: Flete[] | null,
  guardado: FleteGuardado | null,
  resultadoGuardado: ResultadoAlquiler,
): { alquiler: FleteAlquiler; odoo: FleteGuardado | null; aviso: string | null } {
  const anterior = resultadoGuardado.flete;
  const barrio = anterior?.tipo === "lista" || anterior?.tipo === "fuera_de_lista" ? anterior.barrio : anterior?.tipo === "provincia" ? anterior.lugar : guardado?.nombre ?? null;
  if (anterior?.tipo === "provincia") return { alquiler: anterior, odoo: null, aviso: null };
  // Un presupuesto de antes del 12/11 a la tarde con un flete del conurbano (fila 16): es provincia.
  if (guardado?.nombre.trim() && !BARRIOS_CABA_EN_LISTA.has(normalizarLugar(guardado.nombre))) {
    return {
      alquiler: { tipo: "provincia", lugar: barrio ?? guardado.nombre },
      odoo: null,
      aviso: `El flete ${guardado.nombre} es del conurbano: no se entrega fuera de CABA. Se le ofrece retirarlo en el depósito.`,
    };
  }
  if (!guardado) return { alquiler: { tipo: "fuera_de_lista", barrio }, odoo: null, aviso: null };
  const nombre = barrio ?? guardado.nombre;
  if (!fletes) {
    return {
      alquiler: { tipo: "lista", barrio: nombre, monto: guardado.precio, metodoEnvioId: guardado.carrierId },
      odoo: guardado,
      aviso: "No se pudo leer la lista de fletes de Odoo: se muestra el flete de cuando lo armó Tomás. Al aprobar se vuelve a leer.",
    };
  }
  const hoy = fletes.find((f) => f.carrierId === guardado.carrierId);
  if (!hoy) return { alquiler: { tipo: "fuera_de_lista", barrio: nombre }, odoo: null, aviso: `El método de envío ${guardado.nombre || guardado.carrierId} ya no está en la lista de fletes de Odoo.` };
  return { alquiler: { tipo: "lista", barrio: nombre, monto: hoy.precio, metodoEnvioId: hoy.carrierId }, odoo: { carrierId: hoy.carrierId, nombre: hoy.nombre, precio: hoy.precio }, aviso: null };
}

/**
 * El cliente para recalcular: las palabras y las banderas de la ficha de hoy, y la deuda y la
 * cuenta de los socios como las vio el servidor cuando Tomás lo armó (están en los motivos del
 * grupo «cliente»; volver a consultar la deuda es de la herramienta, no de la tarjeta).
 */
export function clienteParaRecalculo(ficha: ContextoRecalculo["ficha"], guardado: ResultadoAlquiler): ClienteAlquiler {
  const motivos = Array.isArray(guardado.motivos) ? guardado.motivos : [];
  const deuda = motivos.find((m) => m.codigo === "deuda");
  return {
    mensajesCliente: ficha.mensajesCliente ?? [],
    banderas: ficha.banderas ?? [],
    segmento: ficha.segmento ?? null,
    deudaVencida: !deuda ? null : deuda.ok ? false : /tiene deuda/i.test(deuda.texto) ? true : null,
    cuentaSocio: motivos.some((m) => m.codigo === "cuenta_socio"),
  };
}

// ── Lo que bloquea y lo que se avisa ────────────────────────────────────────────────────

/**
 * Lo que BLOQUEA aprobar: lo que la §8 manda a un vendedor por el trabajo (no se puede arreglar
 * con un OK) y la cuenta de los socios («no se le cotiza»). Las palabras de alerta, las banderas
 * de la IA, la gama alta y la deuda NO bloquean: la tarjeta las muestra en rojo y decide la
 * persona, como en la bandeja fácil («Fácil el trabajo, no el cliente»).
 */
export const MOTIVOS_QUE_BLOQUEAN: readonly CodigoMotivoAlquiler[] = [
  "para_hoy", "anclar", "techo_no_deja", "plataforma_rechazada", "espacio_ancho", "espacio_largo", "sin_flete", "fuera_de_caba", "piezas_fuera",
  "montaje", "tope_modulos", "cuenta_socio",
];

const BLOQUEO_CONFIRMACION: Partial<Record<CodigoConfirmacion, string>> = {
  plataforma: "Falta que el cliente diga si le sirve la plataforma (en un peldaño, o que no llega cómodo al techo).",
  deposito: "La obra está en provincia: falta que el cliente diga si lo retira en el depósito (no se entrega fuera de CABA).",
};

export function bloqueosAlquiler(r: ResultadoAlquiler, entrega: EntregaPedida | null): string[] {
  const b: string[] = [];
  for (const m of r.enContra) if (MOTIVOS_QUE_BLOQUEAN.includes(m.codigo)) b.push(m.texto);
  for (const f of r.faltan) b.push(`Falta un dato: ${f.pregunta}`);
  for (const c of r.aConfirmar) {
    b.push(BLOQUEO_CONFIRMACION[c.codigo] ?? (c.codigo === "fecha" ? `La fecha no se puede: ${c.texto} Corregí la fecha.` : c.texto));
  }
  if (!entrega) b.push("Falta la fecha o la franja de entrega.");
  if (!r.armado) b.push("No hay armado.");
  else if (!r.precio) b.push(r.modalidad === "deposito" ? "No hay precio." : "No hay precio: el flete del barrio no está en la lista.");
  return [...new Set(b)];
}

// ── Corregir ────────────────────────────────────────────────────────────────────────────

/**
 * Lo que se corrige en un alquiler (acotado, como pide la etapa):
 *   · precio: el TOTAL del servicio por 30 días, neto y sin el recargo de la franja (el recargo se
 *     vuelve a calcular sobre el nuevo total, fila 15);
 *   · piezas: los módulos de alto y la cantidad de torres. Se vuelve a pasar por el motor: si con
 *     eso no le sirve (no llega, no entra la cabeza, pasa el tope), bloquea;
 *   · fecha: el día y la franja de entrega (una franja de una hora suma el recargo);
 *   · texto: el mensaje que le llega, escrito a mano.
 * En la base (correccion_tipo) «fecha» queda como «otro»: el CHECK sólo acepta los cinco de la
 * bandeja y la fecha no cambia la plata del servicio.
 */
export type TipoCorreccionAlquiler = "precio" | "piezas" | "fecha" | "texto";

export const TIPOS_CORRECCION_ALQUILER: { id: TipoCorreccionAlquiler; etiqueta: string }[] = [
  { id: "precio", etiqueta: "Total" },
  { id: "piezas", etiqueta: "Cantidades" },
  { id: "fecha", etiqueta: "Fecha" },
  { id: "texto", etiqueta: "Texto" },
];

export const CORRECCION_EN_BASE: Record<TipoCorreccionAlquiler, TipoCorreccion> = { precio: "precio", piezas: "piezas", fecha: "otro", texto: "texto" };

export type CorreccionAlquiler = {
  tipo: TipoCorreccionAlquiler;
  /** Obligatorio: queda en cli_aprobaciones.motivo_correccion y en la nota de Odoo. */
  motivo: string;
  /** precio: el total del servicio por 30 días, neto, sin el recargo de la franja. */
  total?: number;
  /** piezas. */
  modulosPorTorre?: number;
  torres?: number;
  /** fecha. */
  fecha?: string;
  franja?: Franja;
  /** texto. */
  texto?: string;
};

const MOTIVO_MIN = 3;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** null si la corrección se puede aplicar; si no, qué falta. */
export function validarCorreccionAlquiler(c: CorreccionAlquiler): string | null {
  if (!c.motivo?.trim() || c.motivo.trim().length < MOTIVO_MIN) return "Escribí el motivo de la corrección: queda para el auditor y para la nota de Odoo.";
  switch (c.tipo) {
    case "precio":
      if (!(typeof c.total === "number" && Number.isFinite(c.total) && c.total > 0 && c.total < 100_000_000)) return "Poné el total del servicio por 30 días, sin IVA.";
      return null;
    case "piezas": {
      const okModulos = c.modulosPorTorre === undefined || (Number.isInteger(c.modulosPorTorre) && c.modulosPorTorre >= 1 && c.modulosPorTorre <= 10);
      const okTorres = c.torres === undefined || (Number.isInteger(c.torres) && c.torres >= 1 && c.torres <= 10);
      if (c.modulosPorTorre === undefined && c.torres === undefined) return "Poné cuántos módulos de alto o cuántas torres.";
      if (!okModulos) return "Los módulos de alto van de 1 a 10 (más de 3 hay que anclar: va a un vendedor).";
      if (!okTorres) return "Las torres van de 1 a 10.";
      return null;
    }
    case "fecha":
      if (!c.fecha && !c.franja) return "Elegí la fecha o la franja nueva.";
      if (c.fecha && !FECHA_RE.test(c.fecha)) return "La fecha va como AAAA-MM-DD.";
      if (c.franja && !franjaValida(c.franja)) return "La franja no es válida.";
      return null;
    case "texto":
      if (!c.texto?.trim()) return "Escribí el texto que le tiene que llegar.";
      return null;
  }
}

/**
 * El pedido y la entrega con la corrección aplicada (copias). Las cantidades se le pasan al motor
 * como «lo que pidió el cliente» con el resto del armado de hoy (ancho, largo, apoyo, baranda y
 * tablones): así el motor revisa la altura, la cabeza y el tope. Con las torres corregidas, el
 * largo a cubrir deja de mandar (lo decidió la persona).
 */
export function aplicarCorreccionAlquiler(
  p: PayloadAlquiler,
  armado: Armado | null,
  c: CorreccionAlquiler | null,
): { pedido: PedidoAlquiler; entrega: EntregaPedida | null } {
  const pedido: PedidoAlquiler = structuredClone(p.pedido);
  let entrega = p.entrega ? { ...p.entrega } : null;
  // El motor valida la fecha del pedido y el mensaje usa la de la entrega: que sean la misma.
  if (entrega) {
    pedido.fecha = entrega.fecha;
    pedido.franja = entrega.franja;
  }
  if (!c) return { pedido, entrega };
  if (c.tipo === "piezas" && armado) {
    const torres = c.torres ?? armado.torres;
    pedido.piezas = {
      modulosPorTorre: c.modulosPorTorre ?? armado.modulosPorTorre,
      torres,
      ancho: armado.ancho,
      largo: armado.largo,
      apoyo: armado.apoyo,
      conBaranda: armado.barandaSeLleva,
      tablonesPorTorre: armado.tablonesPorTorre,
    };
    pedido.torres = torres;
    if (c.torres !== undefined) pedido.largoACubrir = null;
  }
  if (c.tipo === "fecha") {
    const fecha = c.fecha ?? entrega?.fecha ?? pedido.fecha;
    const franja = (c.franja && franjaValida(c.franja)) ?? entrega?.franja ?? pedido.franja;
    entrega = fecha && franja ? { fecha, franja } : null;
    pedido.fecha = fecha ?? null;
    pedido.franja = franja ?? null;
  }
  return { pedido, entrega };
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/**
 * El precio con el TOTAL corregido a mano. Al cliente le llega un solo número (§5); en Odoo las
 * líneas tienen que sumar eso. Cómo se reparte:
 *   · si sube: la diferencia va a la línea «MÍNIMO OPERATIVO», que es la línea de ajuste que ya
 *     usa Tamara (§5: «se agrega la línea MÍNIMO OPERATIVO por la diferencia»);
 *   · si baja: primero se achica el mínimo operativo; si no alcanza, se bajan las piezas en
 *     proporción (el flete queda el de la lista del barrio). Menos que el flete no se puede.
 * El recargo de la franja de una hora se vuelve a calcular sobre el total nuevo (fila 15) y la
 * renovación por día sale del total nuevo (§5).
 */
export function precioConTotal(precio: PrecioAlquiler, total: number, recargoPct: number): PrecioAlquiler {
  const base = Math.round(total);
  if (!(base > precio.flete)) throw new Error(`El total tiene que ser más que el flete (${pesos(precio.flete)}).`);
  const delta = base - precio.base;
  let minimo = precio.minimoOperativo + delta;
  let factor = 1;
  if (minimo < 0) {
    const material = precio.material + minimo;
    factor = material / precio.material;
    minimo = 0;
  }
  const lineas: LineaAlquiler[] = [];
  for (const l of precio.lineas) {
    if (l.codigo === "flete") lineas.push({ ...l });
    else if ((CODIGOS_PIEZA as readonly string[]).includes(l.codigo)) {
      const pu = factor === 1 ? l.precioUnitario : centavos(l.precioUnitario * factor);
      lineas.push({ ...l, precioUnitario: pu, importe: centavos(pu * l.cantidad) });
    }
  }
  const material = centavos(lineas.filter((l) => l.codigo !== "flete").reduce((s, l) => s + l.importe, 0));
  if (minimo > 0) lineas.push({ codigo: "minimo_operativo", descripcion: "Mínimo operativo", cantidad: 1, precioUnitario: minimo, importe: minimo });
  const recargoFranja = precio.recargoFranja > 0 ? Math.round((base * recargoPct) / 100) : 0;
  const recargo = precio.lineas.find((l) => l.codigo === "recargo_franja");
  if (recargoFranja > 0 && recargo) lineas.push({ ...recargo, precioUnitario: recargoFranja, importe: recargoFranja });
  return {
    lineas,
    material,
    flete: precio.flete,
    minimoOperativo: minimo,
    base,
    recargoFranja,
    recargoFranjaPct: recargoFranja > 0 ? recargoPct : 0,
    total: base + recargoFranja,
    porDia: Math.round(base / 30),
  };
}

// ── Lo que va a Odoo ────────────────────────────────────────────────────────────────────

const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;

/** La franja del motor (horas) como la quiere el módulo de Odoo («HH:MM» a «HH:MM»). */
export function franjaParaOdoo(f: Franja): FranjaOdoo {
  if (f.tipo === "manana") return FRANJA_MANANA;
  if (f.tipo === "tarde") return FRANJA_TARDE;
  if (f.tipo === "deposito_manana") return FRANJA_DEPOSITO_MANANA;
  if (f.tipo === "deposito_tarde") return FRANJA_DEPOSITO_TARDE;
  return { desde: hhmm(f.desde), hasta: hhmm(f.desde + 1) };
}

/** Siempre el servicio de 30 días (§5): la devolución es la entrega + 30. */
export const DIAS_SERVICIO = 30;

export function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * La cotización para crearOrdenAlquilerSimple: las piezas con su precio, el flete, el mínimo y el
 * recargo. `flete` null: retira en el depósito (sin flete ni método de envío).
 */
export function cotizacionParaOdoo(precio: PrecioAlquiler, flete: FleteGuardado | null, entrega: EntregaPedida): CotizacionParaOdoo {
  return {
    piezas: precio.lineas
      .filter((l) => (CODIGOS_PIEZA as readonly string[]).includes(l.codigo))
      .map((l) => ({ codigo: l.codigo as CodigoPieza, cantidad: l.cantidad, precioUnitario: l.precioUnitario })),
    // El monto del motor (que salió del mismo método de envío): así la orden suma lo que se manda.
    flete: flete ? { carrierId: flete.carrierId, nombre: flete.nombre, precio: precio.flete } : null,
    minimoOperativo: precio.minimoOperativo,
    recargoFranja: precio.recargoFranja,
    recargoFranjaPct: precio.recargoFranjaPct,
    entrega: entrega.fecha,
    fin: sumarDias(entrega.fecha, DIAS_SERVICIO),
    franja: franjaParaOdoo(entrega.franja),
  };
}

// ── Recalcular ──────────────────────────────────────────────────────────────────────────

export type RecalculoAlquiler = {
  /** El motor con lo de hoy (y la corrección de cantidades o fecha, si hay). */
  resultado: ResultadoAlquiler;
  pedido: PedidoAlquiler;
  entrega: EntregaPedida | null;
  /** El precio que se manda: el del motor, o con el total corregido. */
  precio: PrecioAlquiler | null;
  /** El neto que se manda (servicio + recargo). null si no hay precio. */
  total: number | null;
  flete: FleteGuardado | null;
  /** El mensaje exacto que le llega al cliente. null si no se puede armar (ver bloqueos). */
  mensaje: string | null;
  cotizacion: CotizacionParaOdoo | null;
  /** Lo que impide aprobar. */
  bloqueos: string[];
  /** Lo que la persona tiene que mirar, pero no impide aprobar. */
  avisos: string[];
};

/**
 * Todo lo que necesita la tarjeta y el OK: el motor con los parámetros, el flete y la fecha de
 * hoy, la corrección, el mensaje y lo que va a Odoo. Nunca tira: lo que falla va a `bloqueos`.
 */
export function recalcularAlquiler(p: PayloadAlquiler, ctx: ContextoRecalculo, c: CorreccionAlquiler | null): RecalculoAlquiler {
  const avisos: string[] = [];
  // Retira en el depósito (fila 17): no hay flete que buscar (la corrección no cambia la modalidad).
  const deposito = p.pedido.retiraEnDeposito === true;
  const flete: { alquiler: FleteAlquiler | null; odoo: FleteGuardado | null; aviso: string | null } = deposito
    ? { alquiler: null, odoo: null, aviso: null }
    : fleteDeHoy(ctx.fletes, p.flete, p.resultado);
  if (flete.aviso) avisos.push(flete.aviso);
  const cliente = clienteParaRecalculo(ctx.ficha, p.resultado);
  const motor = (pedido: PedidoAlquiler) =>
    cotizarAlquilerSimple(pedido, { parametros: ctx.parametros, flete: flete.alquiler, hoy: ctx.hoy, feriados: ctx.feriados, cliente, ahora: ctx.ahora });

  // Las cantidades se corrigen sobre el armado de HOY (sin corregir).
  const armadoHoy = c?.tipo === "piezas" ? motor(p.pedido).armado : null;
  const corregido = aplicarCorreccionAlquiler(p, armadoHoy, c);
  const pedido = corregido.pedido;
  const resultado = motor(pedido);
  // La franja de la modalidad (franjaSegunModalidad, en el motor): la del depósito si retira ahí.
  // Si no tiene (una franja de una hora para el depósito), no hay entrega y bloquea.
  const entrega: EntregaPedida | null = corregido.entrega && resultado.franja ? { ...corregido.entrega, franja: resultado.franja } : null;
  const bloqueos = bloqueosAlquiler(resultado, entrega);
  if (c?.tipo === "piezas" && !armadoHoy) bloqueos.push("No hay armado para corregir las cantidades.");

  let precio = resultado.precio;
  if (precio && c?.tipo === "precio" && typeof c.total === "number") {
    try {
      precio = precioConTotal(precio, c.total, ctx.parametros.recargoFranjaPct);
    } catch (e) {
      bloqueos.push(e instanceof Error ? e.message : String(e));
    }
  }

  // El mensaje: el del motor, con el total corregido si lo hay. Con un total puesto a mano no se
  // dice «es el mínimo del servicio» ni lo que le entra sin pagar más (ya no es el mínimo).
  let mensaje: string | null = null;
  if (c?.tipo === "texto" && c.texto?.trim()) mensaje = c.texto.trim();
  else if (precio && entrega) {
    const paraMensaje: ResultadoAlquiler = c?.tipo === "precio"
      ? { ...resultado, precio: { ...precio, minimoOperativo: 0 }, entraSinPagarMas: [] }
      : { ...resultado, precio };
    try {
      mensaje = mensajePresupuestoAlquiler(paraMensaje, entrega.fecha, entrega.franja);
    } catch (e) {
      bloqueos.push(e instanceof Error ? e.message : String(e));
    }
  }

  // Lo que va a Odoo, y que sume lo mismo que se le dice al cliente.
  let cotizacion: CotizacionParaOdoo | null = null;
  if (precio && entrega && (flete.odoo || deposito)) {
    try {
      cotizacion = cotizacionParaOdoo(precio, deposito ? null : flete.odoo, entrega);
      const armado = lineasOrdenAlquilerSimple(cotizacion);
      // Con las piezas bajadas en proporción, el redondeo a centavos puede dejar unos centavos.
      if (Math.abs(armado.neto - precio.total) > 1) {
        bloqueos.push(`Las líneas para Odoo suman ${pesos(armado.neto)} y el total es ${pesos(precio.total)}: revisá la corrección.`);
      }
      avisos.push(...armado.avisos);
    } catch (e) {
      cotizacion = null;
      bloqueos.push(`No se pueden armar las líneas de Odoo: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (precio && !deposito && !flete.odoo && !bloqueos.length) bloqueos.push("No hay método de envío de Odoo para el flete.");

  return {
    resultado, pedido, entrega, precio, total: precio?.total ?? null, flete: flete.odoo, mensaje, cotizacion,
    bloqueos: [...new Set(bloqueos)], avisos: [...new Set(avisos)],
  };
}

// ── Para la tarjeta ─────────────────────────────────────────────────────────────────────

/** Lo que dijo el cliente, en renglones cortos («Lugar: afuera», «Trabajo hasta: 5 m»). */
export function datosDelPedido(pedido: PedidoAlquiler): { etiqueta: string; valor: string }[] {
  const d: { etiqueta: string; valor: string }[] = [];
  d.push({ etiqueta: "Lugar", valor: pedido.lugar === "adentro" ? "Adentro" : pedido.lugar === "afuera" ? "Afuera" : "—" });
  d.push({ etiqueta: "Cómo llega", valor: pedido.retiraEnDeposito === true ? `Retira en el depósito (${DEPOSITO.texto})` : "Se lo llevamos (envío)" });
  d.push({ etiqueta: "Trabajo", valor: pedido.trabajoEnTecho ? "En el techo (cielorraso)" : pedido.alturaTrabajo ? `Hasta ${metros(pedido.alturaTrabajo)} m` : "—" });
  if (pedido.alturaTecho || pedido.lugar === "adentro") d.push({ etiqueta: "Techo", valor: pedido.alturaTecho ? `${metros(pedido.alturaTecho)} m` : "—" });
  const espacio = pedido.espacioDeSobra
    ? "De sobra"
    : [pedido.anchoLibre ? `${metros(pedido.anchoLibre)} m de ancho` : null, pedido.largoLibre ? `${metros(pedido.largoLibre)} m de largo` : null].filter(Boolean).join(" × ") || "—";
  d.push({ etiqueta: "Espacio", valor: espacio });
  if (pedido.largoACubrir) d.push({ etiqueta: "Largo a cubrir", valor: `${metros(pedido.largoACubrir)} m` });
  d.push({ etiqueta: "Piso", valor: pedido.piso === "liso" ? "Liso" : pedido.piso === "desparejo" ? "Desparejo" : "—" });
  if (pedido.piezas) {
    const x = pedido.piezas;
    d.push({ etiqueta: "Pidió", valor: `${x.torres ?? 1} × ${x.modulosPorTorre} ${x.modulosPorTorre === 1 ? "módulo" : "módulos"}${x.apoyo ? ` con ${x.apoyo}` : ""}${x.conBaranda === false ? ", sin baranda" : ""}` });
  }
  return d;
}

/**
 * «Plataforma arriba a 3,75 m…» o «Plataforma EN EL PELDAÑO de 0,80 m del segundo módulo (a 2,75 m),
 * un solo tablón…», y si es en el techo y no llega cómodo, el techo.
 */
export function textoPlataforma(a: Armado): string {
  const alTecho = a.noLlega ? `. ${textoNoLlega(a.noLlega)} (se le aclaró al cliente)` : "";
  if (a.peldano === null) return `Plataforma arriba, a ${metros(a.alturaPlataforma)} m: trabaja hasta ~${metros(a.llegaHasta)} m (la cabeza llega a ${metros(a.cabezaHasta)} m)${alTecho}`;
  return `Plataforma EN ${textoPeldano(a.peldano, a.modulosPorTorre).replace("el peldaño", "EL PELDAÑO")} (a ${metros(a.alturaPlataforma)} m del piso), un solo tablón de 30 cm: trabaja hasta ~${metros(a.llegaHasta)} m (la cabeza llega a ${metros(a.cabezaHasta)} m). Se cobra igual que el módulo completo${alTecho}`;
}

/** Lo que le entra sin pagar más, en palabras (para la tarjeta). */
export function textoEntraSinPagarMas(r: ResultadoAlquiler): string[] {
  return r.entraSinPagarMas.map((s) =>
    s.tipo === "otra_torre" ? (s.cantidad === 1 ? "otra torre igual" : `hasta ${s.cantidad} torres más`) : `un módulo más de alto (llegaría a ~${metros(s.llegaHasta)} m)`);
}

/** Los motivos para «Por qué es fácil», sin el código. */
export function motivosParaTarjeta(r: ResultadoAlquiler): Pick<MotivoAlquiler, "ok" | "texto" | "grupo">[] {
  return r.motivos.map((m) => ({ ok: m.ok, texto: m.texto, grupo: m.grupo }));
}

// ── La nota interna de Odoo ─────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * La nota interna de la orden (chatter, no le llega al cliente): quién aprobó, la corrección,
 * el pedido, el armado, la entrega, el total y lo que hay que mirar. Los documentos (DNI y
 * servicios) se piden cuando el cliente acepta (§6) y se adjuntan después a esta orden.
 */
export function notaInternaAlquiler(p: {
  numero: number;
  aprobo: string;
  correccion: { tipo: TipoCorreccionAlquiler; motivo: string } | null;
  r: RecalculoAlquiler;
  direccion: string | null;
  sinCuit: boolean;
  avisos: string[];
}): string {
  const { r } = p;
  const a = r.resultado.armado;
  const pr = r.precio;
  const parrafos: string[] = [];
  parrafos.push(`<p><b>Alquiler simple cotizado por Tomás</b> (WhatsApp de clientes, cotización #${p.numero}), aprobado por ${esc(p.aprobo)}${p.correccion ? ` con una corrección (${esc(TIPOS_CORRECCION_ALQUILER.find((t) => t.id === p.correccion!.tipo)?.etiqueta.toLowerCase() ?? p.correccion.tipo)}): ${esc(p.correccion.motivo.trim())}` : " sin cambios"}.</p>`);
  parrafos.push(`<p><b>Pedido:</b> ${esc(datosDelPedido(r.pedido).map((d) => `${d.etiqueta}: ${d.valor}`).join(" · "))}.</p>`);
  if (a) {
    parrafos.push(`<p><b>Armado:</b> ${esc(describirArmado(a))}. ${esc(textoPlataforma(a))}.${a.ajustes.length ? ` ${esc(a.ajustes.join(" "))}` : ""}</p>`);
  }
  const deposito = r.resultado.modalidad === "deposito";
  if (r.entrega) {
    parrafos.push(deposito
      ? `<p><b>Retira en el depósito</b> (${esc(DEPOSITO.texto)}) el ${esc(textoFecha(r.entrega.fecha))}, ${esc(textoFranja(r.entrega.franja))}: sin flete, viene con su vehículo y gente para cargar. Lo devuelve ahí, desarmado, con 24 h de aviso.${p.direccion ? ` Obra: ${esc(p.direccion)}.` : ""} Servicio de ${DIAS_SERVICIO} días.</p>`
      : `<p><b>Entrega:</b> el ${esc(textoFecha(r.entrega.fecha))}, ${esc(textoFranja(r.entrega.franja))}${p.direccion ? `, en ${esc(p.direccion)}` : ""}. Servicio de ${DIAS_SERVICIO} días.</p>`);
  }
  if (pr) {
    const partes = [`<b>Total del servicio por ${DIAS_SERVICIO} días, ${deposito ? "retirando en el depósito (sin flete)" : "con la entrega y el retiro"}:</b> ${pesos(pr.base)} + IVA`];
    if (pr.minimoOperativo > 0) partes.push(`(con ${pesos(pr.minimoOperativo)} de mínimo operativo)`);
    if (pr.recargoFranja > 0) partes.push(`· recargo de la franja de una hora (${pr.recargoFranjaPct} %): ${pesos(pr.recargoFranja)} · en total ${pesos(pr.total)} + IVA`);
    partes.push(`· renovación por día: ${pesos(pr.porDia)} + IVA`);
    parrafos.push(`<p>${partes.join(" ")}.</p>`);
  }
  const mirar = [...(p.sinCuit ? ["cliente sin CUIT: completarlo antes de facturar"] : []), ...p.avisos];
  if (mirar.length) parrafos.push(`<p><b>Para mirar:</b> ${esc(mirar.join(" · "))}.</p>`);
  parrafos.push("<p>Los documentos (DNI de frente y dorso y dos servicios) se piden cuando el cliente acepta y se adjuntan a esta orden: sin ellos no se entrega (§6).</p>");
  return parrafos.join("");
}

// ── La racha del alquiler ──────────────────────────────────────────────────────────────

/**
 * DECISIÓN (auditoría y racha): el alquiler NO cuenta para la racha de la etapa 2 de la bandeja
 * (crm-propuesta §9, decisión 5b: «20 bandejas fáciles seguidas»), que es la que decide si la
 * bandeja sale sin aprobación. El alquiler tiene su propia racha, con la misma regla (una
 * corrección del total o de las cantidades la corta; una de texto o de fecha no), para que JS vea
 * cuántos aprueba sin tocar. «Revisar charlas» lista las decisiones de los dos carriles.
 */
export const CARRIL_ALQUILER = "alquiler" as const;
