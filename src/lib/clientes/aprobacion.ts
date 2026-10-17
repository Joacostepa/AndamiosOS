// La tarjeta de aprobación (paso 6): las reglas, sin base ni red. Puro, con tests
// (aprobacion.test.ts). Lo que toca Supabase, Odoo y Meta está en aprobar.ts.
//
// docs/sofia/crm-propuesta.md §7 (la tarjeta), §6 (la ventana de 24 h), §9 (la racha de la
// etapa 2) y §13 (paso 6), con lo que decidió JS el 15/10 (§12):
//   · LA DECISIÓN SE TOMA UNA SOLA VEZ: cada acción pasa de unos estados a otro con un UPDATE
//     condicionado (tomarUnaVez). Si dos tocan Aprobar a la vez, gana el primero y el segundo
//     lee «Ya lo aprobó Sandra»;
//   · AL APROBAR SE VUELVE A CALCULAR con el motor y las tarifas de hoy. Si el monto no es el
//     que vio la persona en la tarjeta, no se manda nada y se avisa (verificarRecalculo);
//   · «Corregir» pide qué cambia (metros, piezas, precio, texto u otro) y un motivo, recalcula y
//     muestra el nuevo antes de mandar. Metros, piezas y precio cortan la racha; texto y otro no;
//   · la ventana de 24 h: con la ventana cerrada no sale texto libre (modoEnvio), y con menos de
//     2 h la tarjeta avisa antes de aprobar (avisoVentana);
//   · el mensaje para el cliente es un texto fijo del servidor (§2, «Presupuesto aprobado»): los
//     números salen del motor, la validez y la renovación de los mismos parámetros que el PDF.
//     La pareja se nombra recién al confirmar, y siempre «Sandra, que trabaja con Gabriel».

import { recalcular, type DatosBorrador, type ResultadoBorrador } from "../asistente/borrador.ts";
import { pesos, type Tarifas } from "../cotizador/tipos.ts";
import { textosBandejaFacil } from "./facil.ts";
import { nombreParaSaludo } from "./saludo.ts";

// ── Estados ─────────────────────────────────────────────────────────────────────────────

export type TipoAprobacion = "precio" | "tecnico" | "traspaso" | "texto_bloqueado";

export type EstadoAprobacion =
  | "pendiente"
  /** Alguien tocó Aprobar: se está guardando en Odoo. Es el candado. */
  | "ejecutando"
  /** Odoo o el PDF fallaron: al cliente no le llegó nada. Se reintenta. */
  | "error"
  | "aprobada"
  | "corregida"
  /** Aprobada y en Odoo, pero con la ventana de 24 h cerrada: falta mandarla con la plantilla. */
  | "falta_plantilla"
  | "rechazada"
  | "tomada"
  | "vencida"
  /** Un texto bloqueado que no se manda. */
  | "descartada";

/** Las que ya salieron (o salieron hasta donde se podía) con el OK de una persona. */
export const ESTADOS_APROBADOS: readonly EstadoAprobacion[] = ["aprobada", "corregida", "falta_plantilla"];
/** Las que ya no esperan a nadie. */
export const ESTADOS_DECIDIDOS: readonly EstadoAprobacion[] = ["aprobada", "corregida", "falta_plantilla", "rechazada", "tomada", "descartada", "vencida"];

export type AccionTarjeta =
  /** Aprobar (precio), Confirmar (técnico) o Editar y mandar (texto bloqueado). */
  | "aprobar"
  /**
   * Volver a intentar lo que falló (Odoo, el PDF o WhatsApp), o mandar una «falta la plantilla»
   * cuando el cliente volvió a escribir y la ventana se abrió. Saltea lo ya hecho.
   */
  | "reintentar"
  /** Rechazar / Lo tomo yo / Descartar. */
  | "rechazar";

/** Una acción ejecutando hace más de esto se cortó (Vercel corta a los 300 s): se puede reintentar. */
export const EJECUTANDO_VENCE_MS = 6 * 60_000;

/** Desde qué estados se puede hacer cada acción. Lo usa el UPDATE condicionado. */
export function estadosDesde(accion: AccionTarjeta): EstadoAprobacion[] {
  switch (accion) {
    case "aprobar":
    case "rechazar":
      return ["pendiente"];
    case "reintentar":
      return ["error", "ejecutando", "falta_plantilla"];
  }
}

/** Lo que se lee cuando alguien llegó tarde. */
export function motivoYaDecidida(estado: EstadoAprobacion, quien: string | null, tipo: TipoAprobacion = "precio"): string {
  const q = quien ?? "otra persona";
  const que = tipo === "tecnico" ? "confirmó" : tipo === "texto_bloqueado" ? "resolvió" : "aprobó";
  switch (estado) {
    case "pendiente":
      return "Sigue pendiente: volvé a mirar.";
    case "ejecutando":
      return `Ya lo ${que} ${q}: se está guardando en Odoo.`;
    case "error":
      return `Ya lo ${que} ${q}, pero falló al guardar: usá «Reintentar».`;
    case "aprobada":
      return `Ya lo ${que} ${q}.`;
    case "corregida":
      return `Ya lo corrigió y lo mandó ${q}.`;
    case "falta_plantilla":
      return `Ya lo aprobó ${q}: está en Odoo y falta mandarlo con la plantilla (la ventana de 24 h estaba cerrada).`;
    case "rechazada":
      return `${q} decidió no mandarlo.`;
    case "tomada":
      return `Lo tomó ${q}.`;
    case "descartada":
      return `${q} lo descartó.`;
    case "vencida":
      return "Venció: Tomás armó otro o la charla se cerró.";
  }
}

/**
 * El repositorio mínimo para tomar la decisión una sola vez: un UPDATE condicionado al estado
 * (en Supabase, `.eq("id").in("estado", desde)`), que devuelve la fila si la cambió y null si no.
 */
export type RepoUnaVez<F, C = Partial<F>> = {
  actualizarSi(id: string, desde: EstadoAprobacion[], cambios: C): Promise<F | null>;
  leer(id: string): Promise<F | null>;
};

export type FilaDecision = { id: string; estado: EstadoAprobacion; tipo: TipoAprobacion; decididoPor: string | null; updatedAt: string };

/**
 * Toma la aprobación para una acción. Gana el primero: el segundo recibe el motivo con el nombre
 * de quien la tomó. «reintentar» desde «error» o «falta_plantilla», y desde «ejecutando» sólo si
 * quedó colgada (EJECUTANDO_VENCE_MS).
 */
export async function tomarUnaVez<F extends FilaDecision, C>(
  repo: RepoUnaVez<F, C>,
  id: string,
  accion: AccionTarjeta,
  cambios: C,
  nombreDe: (usuarioId: string | null) => Promise<string | null> = async () => null,
  ahora: number = Date.now(),
): Promise<{ ok: true; fila: F } | { ok: false; motivo: string; fila: F | null }> {
  let desde = estadosDesde(accion);
  if (accion === "reintentar") {
    const actual = await repo.leer(id);
    if (!actual) return { ok: false, motivo: "Esa aprobación ya no existe.", fila: null };
    const colgada = actual.estado === "ejecutando" && ahora - new Date(actual.updatedAt).getTime() > EJECUTANDO_VENCE_MS;
    if (actual.estado !== "error" && actual.estado !== "falta_plantilla" && !colgada) {
      return { ok: false, motivo: actual.estado === "ejecutando" ? "Se está guardando ahora: esperá un momento." : motivoYaDecidida(actual.estado, await nombreDe(actual.decididoPor), actual.tipo), fila: actual };
    }
    desde = [actual.estado];
  }
  const fila = await repo.actualizarSi(id, desde, cambios);
  if (fila) return { ok: true, fila };
  const actual = await repo.leer(id);
  if (!actual) return { ok: false, motivo: "Esa aprobación ya no existe.", fila: null };
  return { ok: false, motivo: motivoYaDecidida(actual.estado, await nombreDe(actual.decididoPor), actual.tipo), fila: actual };
}

// ── Corregir ────────────────────────────────────────────────────────────────────────────

export type TipoCorreccion = "metros" | "piezas" | "precio" | "texto" | "otro";

export const TIPOS_CORRECCION: { id: TipoCorreccion; etiqueta: string }[] = [
  { id: "metros", etiqueta: "Metros" },
  { id: "piezas", etiqueta: "Piezas" },
  { id: "precio", etiqueta: "Precio" },
  { id: "texto", etiqueta: "Texto" },
  { id: "otro", etiqueta: "Otro" },
];

/** §9: una corrección de importe, metros o piezas vuelve la racha a cero; la de texto no. */
export const CORTAN_RACHA: ReadonlySet<TipoCorreccion> = new Set(["metros", "piezas", "precio"]);

export type QueVa = "opcional" | "base" | "no";

export type Correccion = {
  tipo: TipoCorreccion;
  /** Obligatorio: queda en cli_aprobaciones.motivo_correccion y en la nota de Odoo. */
  motivo: string;
  /** metros: los metros lineales de verdad. */
  metros?: number;
  /** precio: el $/m.l. de la bandeja (sin IVA). */
  precioMl?: number;
  /** piezas: qué va de la concertina y la gestoría (opcional, incluida en la base, o nada). */
  concertina?: QueVa;
  gestoria?: QueVa;
  /** texto (o cualquiera): el mensaje que le llega al cliente, si se cambió a mano. */
  texto?: string;
};

export const MOTIVO_MIN = 3;

/** null si la corrección se puede aplicar; si no, qué falta. */
export function validarCorreccion(c: Correccion): string | null {
  if (!c.motivo?.trim() || c.motivo.trim().length < MOTIVO_MIN) return "Escribí el motivo de la corrección: queda para el auditor y para la nota de Odoo.";
  switch (c.tipo) {
    case "metros":
      if (!(typeof c.metros === "number" && c.metros > 0 && c.metros <= 500)) return "Poné los metros lineales (más de 0).";
      return null;
    case "precio":
      if (!(typeof c.precioMl === "number" && c.precioMl > 0 && c.precioMl < 100_000_000)) return "Poné el precio por metro lineal, sin IVA.";
      return null;
    case "piezas":
      if (!c.concertina && !c.gestoria) return "Elegí qué cambia de la concertina o la gestoría.";
      return null;
    case "texto":
      if (!c.texto?.trim()) return "Escribí el texto que le tiene que llegar.";
      return null;
    case "otro":
      return null;
  }
}

/**
 * El borrador con la corrección aplicada (una copia: el original no cambia). Metros y precio
 * tocan la bandeja y rehacen los textos del PDF; piezas, la concertina y la gestoría. Texto y
 * otro no tocan los números.
 */
export function aplicarCorreccion(datos: DatosBorrador, c: Correccion, tarifas: Tarifas): DatosBorrador {
  const d = structuredClone(datos);
  const b = d.calculos.bandeja;
  if (!b) return d;
  if (c.tipo === "metros" && c.metros) {
    b.metros = Math.round(c.metros * 100) / 100;
    const direccion = d.obra.direccion?.trim();
    if (direccion) {
      const tx = textosBandejaFacil(direccion, b.metros, tarifas, d.jornadas.armado ?? 1);
      d.referencia = tx.referencia;
      d.seccion1 = tx.seccion1;
      d.seccion2 = tx.seccion2;
    }
    d.decisiones = { ...d.decisiones, metros: `${b.metros.toLocaleString("es-AR")} m.l. corregidos a mano: ${c.motivo.trim()}` };
  }
  if (c.tipo === "precio" && c.precioMl) {
    b.precioMl = Math.round(c.precioMl);
    b.motivoPrecio = c.motivo.trim();
  }
  if (c.tipo === "piezas") {
    if (c.concertina) b.concertina = c.concertina;
    if (c.gestoria) b.gestoria = c.gestoria;
    d.decisiones = { ...d.decisiones, piezas: c.motivo.trim() };
  }
  return d;
}

// ── Recalcular ──────────────────────────────────────────────────────────────────────────

export function recalcularBorrador(datos: DatosBorrador, tarifas: Tarifas, hoy: string): ResultadoBorrador {
  return recalcular(datos, { tarifas, lista: null, hoy });
}

/** Lo que bloquea mandar el borrador recalculado (bloqueos del motor y faltantes del alta). */
export function bloqueosDelCalculo(r: ResultadoBorrador): string[] {
  const del_alta = new Set(["cliente_nuevo", "cuit"]);
  return [
    ...r.avisos.filter((a) => a.nivel === "bloqueo").map((a) => a.texto),
    ...r.faltantes.filter((f) => !del_alta.has(f.codigo)).map((f) => f.texto),
  ];
}

export type Recalculo = { ok: true } | { ok: false; antes: number; despues: number; texto: string };

/**
 * ¿El monto de hoy es el que vio la persona en la tarjeta? Si no (cambió la tarifa entre que
 * abrió la tarjeta y tocó Aprobar), no se manda: la tarjeta muestra el nuevo y se aprueba otra vez.
 * Hasta $1 de diferencia es redondeo.
 */
export function verificarRecalculo(montoVisto: number | null | undefined, recalculado: number): Recalculo {
  if (montoVisto === null || montoVisto === undefined || !Number.isFinite(montoVisto)) {
    return { ok: false, antes: NaN, despues: recalculado, texto: "No llegó el monto que viste en la tarjeta: volvé a mirarla y aprobá de nuevo." };
  }
  if (Math.abs(montoVisto - recalculado) <= 1) return { ok: true };
  return {
    ok: false,
    antes: montoVisto,
    despues: recalculado,
    texto: `Cambió el monto: el motor da hoy ${pesos(recalculado)} + IVA y la tarjeta mostraba ${pesos(montoVisto)}. No se mandó nada: revisá el nuevo y aprobá de nuevo.`,
  };
}

// ── La ventana de 24 h ──────────────────────────────────────────────────────────────────

// modoEnvio y avisoVentana viven en ventana.ts (la tarjeta los usa en la pantalla).
export { avisoVentana, modoEnvio, type AvisoVentana } from "./ventana.ts";

// ── Los textos para el cliente ──────────────────────────────────────────────────────────

/** Los nombres completos de los técnicos, como los dice el texto fijo («que trabaja con Jorge Riveros»). */
export const TECNICOS_COMPLETOS: Record<string, string> = {
  Jorge: "Jorge Riveros",
  Gabriel: "Gabriel Stepansky",
  Joaquín: "Joaquín Stepansky",
};

export const nombreTecnico = (t: string) => TECNICOS_COMPLETOS[t] ?? t;

export type Trato = "vos" | "usted" | null;

/** «Rocío, que trabaja con Jorge Riveros». Sin asistente, el técnico solo. */
function quienSigue(asistente: string | null, tecnico: string | null): string | null {
  if (asistente && tecnico) return `${asistente}, que trabaja con ${nombreTecnico(tecnico)}`;
  return asistente ?? (tecnico ? nombreTecnico(tecnico) : null);
}

/**
 * §5: el texto fijo al confirmar la pareja. «Ya tiene tu pedido Rocío, que trabaja con Jorge
 * Riveros. Te escribe por acá.» null si no hay a quién nombrar.
 */
export function textoPareja(p: { asistente: string | null; tecnico: string | null; trato?: Trato }): string | null {
  const quien = quienSigue(p.asistente, p.tecnico);
  if (!quien) return null;
  const usted = p.trato === "usted";
  const escribe = p.asistente ? (usted ? "Le escribe por acá." : "Te escribe por acá.") : usted ? "Le escriben por acá." : "Te escriben por acá.";
  return `Ya tiene ${usted ? "su" : "tu"} pedido ${quien}. ${escribe}`;
}

export type DatosMensajePresupuesto = {
  /** El nombre de la ficha («Marcela Ríos», «Consorcio Las Lilas»): se saluda con el primer nombre, si lo es. */
  nombre: string | null;
  direccion: string | null;
  /** Los metros reales de la bandeja (no los facturables). */
  metros: number;
  /** El mínimo facturable (tarifa): con menos metros, se aclara. */
  minimoMl: number;
  periodoDias: number;
  neto: number;
  total: number;
  renovacion: number | null;
  validezDias: number;
  /** Los opcionales que van aparte en el PDF (por id del motor). */
  opcionales: string[];
  asistente: string | null;
  tecnico: string | null;
  trato?: Trato;
};

const ml = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });

const NOMBRE_OPCIONAL: [RegExp, string][] = [
  [/gestoria/, "el permiso de vía pública"],
  [/concertina/, "la concertina"],
  [/syh/, "seguridad e higiene"],
  [/ingenieria|memoria/, "la memoria"],
];

function opcionalesEnPalabras(ids: string[]): string | null {
  const nombres = NOMBRE_OPCIONAL.filter(([re]) => ids.some((id) => re.test(id))).map(([, n]) => n);
  if (!nombres.length) return null;
  const lista = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`;
  return lista.charAt(0).toUpperCase() + lista.slice(1);
}

/**
 * El mensaje del presupuesto aprobado (§2): lo arma el servidor, nunca el modelo. Va con el PDF
 * como documento. La validez y la renovación son las del PDF (Ley 24.240: oferta que obliga).
 */
export function mensajePresupuesto(d: DatosMensajePresupuesto): string {
  const usted = d.trato === "usted";
  const pila = nombreParaSaludo(d.nombre);
  const quien = quienSigue(d.asistente, d.tecnico);
  const obra = d.direccion?.trim() ? ` para ${d.direccion.trim()}` : "";
  const minimo = d.metros < d.minimoMl ? ` (se cobra el mínimo de ${ml(d.minimoMl)} m)` : "";
  const opc = opcionalesEnPalabras(d.opcionales);
  const pdf = usted ? "lo ve en el PDF" : "lo ves en el PDF";
  return [
    `Hola${pila ? ` ${pila}` : ""}, ¿cómo ${usted ? "está" : "estás"}? ${usted ? "Le mando" : "Te mando"} el presupuesto de la bandeja de protección${obra}.${quien ? ` ${usted ? "Se lo" : "Te lo"} preparó ${quien}.` : ""}`,
    [
      `Bandeja de ${ml(d.metros)} m${minimo} por ${d.periodoDias} días: ${pesos(d.neto)} + IVA (total ${pesos(d.total)}).`,
      d.renovacion ? `Si la obra sigue después de los ${d.periodoDias} días, cada mes adicional sale ${pesos(d.renovacion)} + IVA (${pdf}).` : null,
      opc ? `${opc} ${opc.includes(" y ") || opc.includes(",") ? "van" : "va"} aparte, como ${opc.includes(" y ") || opc.includes(",") ? "opcionales" : "opcional"}, y ${opc.includes(" y ") || opc.includes(",") ? "están" : "está"} en el PDF.` : null,
    ].filter(Boolean).join(" "),
    `El presupuesto vale ${d.validezDias} días. Cualquier duda ${usted ? "escríbame" : "escribime"} y lo vemos. ¡Muchas gracias por tenernos en cuenta!`,
  ].join("\n");
}

/** El mensaje del presupuesto a partir del cálculo del motor y la ficha. */
export function mensajeDesdeCalculo(p: {
  datos: DatosBorrador;
  resultado: ResultadoBorrador;
  tarifas: Tarifas;
  nombre: string | null;
  asistente: string | null;
  tecnico: string | null;
  trato?: Trato;
}): string {
  const r = p.resultado;
  const metros = p.datos.calculos.bandeja?.metros ?? 0;
  return mensajePresupuesto({
    nombre: p.nombre,
    direccion: p.datos.obra.direccion,
    metros,
    minimoMl: p.tarifas.bandeja.minimoMl,
    periodoDias: p.datos.condiciones.periodoDias,
    neto: r.totales.subtotal,
    total: r.totales.total,
    renovacion: r.totales.renovacion?.monto ?? null,
    validezDias: p.tarifas.validezDias,
    opcionales: r.lineas.filter((l) => l.seccion === "opcional").map((l) => l.id),
    asistente: p.asistente,
    tecnico: p.tecnico,
    trato: p.trato,
  });
}

// ── Después de decidir ──────────────────────────────────────────────────────────────────

export type Despues = "sofia" | "persona";

/**
 * Quién sigue la charla después de la decisión. La propuesta puede decirlo (payload.despues);
 * si no: después de mandar un precio sigue Sofía (el cliente suele contestar «gracias» o
 * preguntar); después de asignar un técnico, de un texto bloqueado o de «Lo tomo yo», una
 * persona. Con Sofía apagada, siempre una persona.
 */
export function destinoDespues(p: { tipo: TipoAprobacion; accion: "aprobar" | "rechazar"; iaActiva: boolean; propuesta?: unknown; elegido?: Despues | null }): Despues {
  if (!p.iaActiva) return "persona";
  if (p.elegido === "sofia" || p.elegido === "persona") return p.elegido;
  if (p.accion === "rechazar") return "persona";
  if (p.propuesta === "sofia" || p.propuesta === "persona") return p.propuesta;
  return p.tipo === "precio" ? "sofia" : "persona";
}

// ── La racha de la etapa 2 ──────────────────────────────────────────────────────────────

export const META_RACHA = 20;

export type DecisionRacha = { estado: EstadoAprobacion; correccionTipo: TipoCorreccion | null; decididoAt: string };

export type Racha = {
  /** Aprobados seguidos desde la última corrección de importe, metros o piezas. */
  actual: number;
  meta: number;
  completa: boolean;
  /** De esos, cuántos salieron sin ningún toque (para el «90 % o más sin ningún toque»). */
  sinTocar: number;
  /** Cuándo se cortó por última vez (null si nunca). */
  ultimoCorte: string | null;
};

/**
 * La racha de §9 (decisión 5b de JS: 20 seguidos). Cuenta las bandejas fáciles aprobadas en
 * orden; una corrección de metros, piezas o precio la vuelve a cero (ésa no cuenta); una de texto
 * u otro suma pero no es «sin tocar». Lo que no se mandó (rechazada, tomada) ni suma ni corta.
 */
export function racha(decisiones: DecisionRacha[], meta: number = META_RACHA): Racha {
  const orden = [...decisiones].sort((a, b) => a.decididoAt.localeCompare(b.decididoAt));
  let actual = 0;
  let sinTocar = 0;
  let ultimoCorte: string | null = null;
  for (const d of orden) {
    if (!ESTADOS_APROBADOS.includes(d.estado)) continue;
    if (d.correccionTipo && CORTAN_RACHA.has(d.correccionTipo)) {
      actual = 0;
      sinTocar = 0;
      ultimoCorte = d.decididoAt;
      continue;
    }
    actual++;
    if (!d.correccionTipo) sinTocar++;
  }
  return { actual, meta, completa: actual >= meta, sinTocar, ultimoCorte };
}

/** «racha 10 de 20», «racha vuelve a 0 de 20», «racha completa (23)». */
export function textoRacha(r: Racha): string {
  if (r.completa) return `racha completa (${r.actual} de ${r.meta})`;
  return `racha ${r.actual} de ${r.meta}`;
}
