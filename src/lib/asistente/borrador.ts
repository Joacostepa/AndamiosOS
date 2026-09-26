// El presupuesto en construcción: qué contiene, cómo se recalcula y qué falta para emitirlo.
//
// ES UN OBJETO, NO TEXTO DE CHAT. El modelo lo completa con herramientas (actualizar_borrador,
// cotizar_*), la pantalla lo muestra al lado de la conversación, y el PDF y la orden de Odoo
// salen de acá. Si la charla se va por las ramas, el borrador sigue siendo la verdad.
//
// SE GUARDAN LAS ENTRADAS DE LOS CÁLCULOS, NO SÓLO LOS RESULTADOS (`calculos`). Recalcular
// es correr el motor de nuevo con las tarifas vigentes: así re-emitir un presupuesto viejo a
// valor de hoy es cambiar la fecha, no rehacer cuentas a mano.
//
// Puro (sin base ni red): lo usan el servidor y los tests.

import { cotizarBandeja, type EntradaBandeja } from "../cotizador/bandeja.ts";
import { cotizarFachada, type EntradaFachada } from "../cotizador/fachada.ts";
import { cotizarAlquiler, type EntradaAlquiler, type PiezaDeLista } from "../cotizador/alquiler.ts";
import { cotizarManoObra, type EntradaManoObra } from "../cotizador/mano-obra.ts";
import { cotizarComplementario, type EntradaComplementario } from "../cotizador/complementarios.ts";
import { calcularTotales, type Totales } from "../cotizador/totales.ts";
import { chequear } from "../cotizador/chequeos.ts";
import { validarCuit } from "../cotizador/cuit.ts";
import type { Aviso, Linea, Pendiente, Resultado, Tarifas } from "../cotizador/tipos.ts";
import type { Lote } from "../catastro/caba.ts";

export type Modelo = "A" | "B" | "C" | "D";
export type Contrato = "Obra " | "Simple" | "Alquiler Sin Montaje";

export type DatosBorrador = {
  cliente: {
    partnerId: number | null;
    razonSocial: string | null;
    contacto: string | null;
    celular: string | null;
    email: string | null;
    cuit: string | null;
    domicilio: string | null;
    /** true = no está en Odoo y hay que darlo de alta al guardar (con confirmación). */
    esNuevo: boolean;
  };
  obra: {
    direccion: string | null;
    enCaba: boolean | null;
    /** El lote verificado contra el catastro (verificar_frente_lote). Sólo lo escribe esa herramienta. */
    lote: Lote | null;
  };
  modelo: Modelo | null;
  contrato: Contrato | null;
  /** Resumen corto para el nombre del PDF y la oportunidad: "Bandeja de protección 10 m.l.". */
  referencia: string | null;
  seccion1: string | null;
  seccion2: { titulo: string; contenido: string }[];
  render: { eleccion: "biblioteca" | "propio" | "ninguno" | null; renderId: string | null; path: string | null };
  epigrafe: string | null;
  calculos: {
    bandeja?: EntradaBandeja;
    fachada?: EntradaFachada;
    alquiler?: EntradaAlquiler;
    manoObra?: EntradaManoObra;
    complementarios?: EntradaComplementario[];
  };
  lineasManuales: Linea[];
  /** null: la que corresponda al modelo. Un número: la que se pactó. */
  renovacionPct: number | null;
  condiciones: { formaPago: string | null; actualizacionCac: boolean; periodoDias: number; mostrarTotalConIva: boolean };
  aclaraciones: string | null;
  /** Lo confirmado por el técnico. NUNCA se asume (criterio §4.9). */
  jornadas: { armado: number | null; desarme: number | null; personas: number | null };
  /** "Trabajo a ejecutar" de Odoo: lo que se sepa se precarga, así Confirmar no frena. */
  trabajo: {
    ambito: "obra" | "evento" | null;
    tipoObra: string | null;
    tipoEvento: string | null;
    concertina: "si" | "no" | null;
    llevaPermiso: "si" | "no" | null;
    permisoModalidad: "sin_permiso" | "con_expediente" | "esperar_permiso" | null;
    syhPresencial: "si" | "no" | null;
    fechaFinEstimada: string | null;
  };
  /** Decisiones que el criterio manda preguntar, con lo que se eligió (encuadre, salto, MO…). */
  decisiones: Record<string, string>;
  conflictoCanal: { revisado: boolean; resultado: string | null };
  /** Perfil comercial (tipo de cliente, etapa, competencia): va a la nota interna, no al PDF. */
  perfilComercial: Record<string, string>;
  /** Notas internas para el chatter de la orden. */
  notasInternas: string | null;
  /**
   * Opcionales estándar que el vendedor sacó (técnico de SyH, memoria de cálculo): no vuelven a
   * aparecer solos. Vuelven si se agregan a mano con agregar_complementario.
   */
  opcionalesDescartados: OpcionalEstandar[];
};

/** Los que el borrador agrega solo en toda bandeja y fachada (ver opcionalesEstandar). */
export type OpcionalEstandar = "syh" | "ingenieria";

export function borradorVacio(): DatosBorrador {
  return {
    cliente: { partnerId: null, razonSocial: null, contacto: null, celular: null, email: null, cuit: null, domicilio: null, esNuevo: false },
    obra: { direccion: null, enCaba: null, lote: null },
    modelo: null,
    contrato: null,
    referencia: null,
    seccion1: null,
    seccion2: [],
    render: { eleccion: null, renderId: null, path: null },
    epigrafe: null,
    calculos: {},
    lineasManuales: [],
    renovacionPct: null,
    condiciones: { formaPago: null, actualizacionCac: true, periodoDias: 30, mostrarTotalConIva: true },
    aclaraciones: null,
    jornadas: { armado: null, desarme: null, personas: null },
    trabajo: { ambito: null, tipoObra: null, tipoEvento: null, concertina: null, llevaPermiso: null, permisoModalidad: null, syhPresencial: null, fechaFinEstimada: null },
    decisiones: {},
    conflictoCanal: { revisado: false, resultado: null },
    perfilComercial: {},
    notasInternas: null,
    opcionalesDescartados: [],
  };
}

/**
 * Aplica un cambio parcial. Objetos: se mezclan campo por campo. Listas: se reemplazan
 * enteras (sección 2, frentes). null borra. Un campo desconocido se ignora.
 */
export function aplicarCambios<T extends Record<string, unknown>>(base: T, cambios: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(cambios)) {
    if (!(k in base) || v === undefined) continue;
    const actual = out[k];
    if (v !== null && typeof v === "object" && !Array.isArray(v) && actual !== null && typeof actual === "object" && !Array.isArray(actual)) {
      out[k] = aplicarCambios(actual as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

/** Completa con los defaults lo que falte (borradores guardados con una versión anterior). */
export function normalizarBorrador(datos: unknown): DatosBorrador {
  return aplicarCambiosProfundo(borradorVacio(), (datos ?? {}) as Record<string, unknown>);
}

function aplicarCambiosProfundo(base: DatosBorrador, datos: Record<string, unknown>): DatosBorrador {
  const out = aplicarCambios(base as unknown as Record<string, unknown>, datos) as unknown as DatosBorrador;
  // `calculos` y `decisiones` tienen claves libres: se toman tal cual vienen.
  if (datos.calculos && typeof datos.calculos === "object") out.calculos = datos.calculos as DatosBorrador["calculos"];
  if (datos.decisiones && typeof datos.decisiones === "object") out.decisiones = datos.decisiones as Record<string, string>;
  if (datos.perfilComercial && typeof datos.perfilComercial === "object") out.perfilComercial = datos.perfilComercial as Record<string, string>;
  return out;
}

// ── Recalcular ──────────────────────────────────────────────────────────────────────────

export type Faltante = { codigo: string; texto: string };

export type ResultadoBorrador = {
  lineas: Linea[];
  totales: Totales;
  renovacionPct: number | null;
  avisos: Aviso[];
  pendientes: Pendiente[];
  /** Lo que falta para poder guardar en Odoo / emitir. Vacío = se puede. */
  faltantes: Faltante[];
  calculadoCon: { listaAlquiler: string | null; fecha: string };
};

/** Pasados estos metros de altura, la memoria de cálculo es obligatoria (Decreto 911/96, criterio §6.1). */
export const ALTURA_MEMORIA_OBLIGATORIA = 6;

/** Altura de la estructura que se cotiza (la mayor, si hay bandeja y fachada). */
function alturaEstructura(d: DatosBorrador): number | null {
  const h = Math.max(d.calculos.bandeja?.altura ?? 0, d.calculos.fachada?.altura ?? 0);
  return h > 0 ? h : null;
}

/** Jornadas con técnico de SyH: las de armado más las de desarme (una jornada corta cuenta entera). */
function jornadasSyh(d: DatosBorrador): number | null {
  const { armado, desarme } = d.jornadas;
  if (!armado || !desarme) return null;
  return Math.ceil(armado) + Math.ceil(desarme);
}

/**
 * Los opcionales de toda bandeja y fachada (Joaquín, 26/09): el técnico de SyH por jornada y la
 * memoria de cálculo. La concertina no va acá: es parte de la bandeja y por defecto es opcional.
 *
 * Salen solos salvo que ya estén cargados a mano (en cualquier sección) o que el vendedor los
 * haya sacado. No dependen de que el asistente se acuerde.
 *
 * Pasados los 6 m de altura la memoria de cálculo es obligatoria por ley, así que va en la base.
 */
function opcionalesEstandar(d: DatosBorrador): EntradaComplementario[] {
  if (!d.calculos.bandeja && !d.calculos.fachada) return [];
  const cargados = new Set((d.calculos.complementarios ?? []).map((c) => c.tipo));
  const fuera = new Set(d.opcionalesDescartados);
  const salen: EntradaComplementario[] = [];
  if (!cargados.has("syh") && !fuera.has("syh")) salen.push({ tipo: "syh", seccion: "opcional" });
  if (!cargados.has("ingenieria") && !fuera.has("ingenieria")) {
    const obligatoria = (alturaEstructura(d) ?? 0) > ALTURA_MEMORIA_OBLIGATORIA;
    salen.push({ tipo: "ingenieria", seccion: obligatoria ? "base" : "opcional" });
  }
  return salen;
}

/** Pasados los 6 m, dónde quedó la memoria de cálculo: en la base está bien; si no, se avisa. */
function avisoMemoria(d: DatosBorrador, lineas: Linea[]): Aviso[] {
  const h = alturaEstructura(d);
  if (h === null || h <= ALTURA_MEMORIA_OBLIGATORIA) return [];
  const ing = lineas.find((l) => l.id === "ingenieria");
  const ley = `pasados los ${ALTURA_MEMORIA_OBLIGATORIA} m la memoria de cálculo es obligatoria (Decreto 911/96)`;
  if (!ing) return [{ nivel: "advertencia", codigo: "memoria_obligatoria", texto: `Estructura de ${h} m sin memoria de cálculo: ${ley}. Si no se cobra, que quede claro por qué.` }];
  if (ing.seccion !== "base") return [{ nivel: "advertencia", codigo: "memoria_obligatoria", texto: `Estructura de ${h} m con la memoria de cálculo como ${ing.seccion}: ${ley}, así que corresponde en la base.` }];
  return [{ nivel: "info", codigo: "memoria_obligatoria", texto: `Estructura de ${h} m: ${ley}, por eso va en la base y no como opcional.` }];
}

const suma = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
const m = (n: number) => `${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })} m`;

/** El frente del lote para comparar: la suma de las caras medidas, o el de AGIP si no hay plano. */
export function frenteDelLote(lote: Lote): number | null {
  return lote.caras.length ? suma(lote.caras) : lote.frenteCatastro;
}

/**
 * Criterio, Geometría 3 y 4: en CABA el frente se verifica contra la parcela (Joaquín, 26/09:
 * "siempre"), y si es esquina se pregunta si van los dos frentes o uno. Sin verificar no se
 * puede guardar. Fuera de CABA el frente lo da el cliente y no bloquea.
 *
 * Los m.l. cotizados que no cierran con el frente son una advertencia, no un bloqueo: una obra
 * puede ocupar dos lotes o cubrir sólo un tramo (Arengreen 655: 24 m.l. contra lotes de 5,63
 * y 8 m).
 */
export function chequeoLote(d: DatosBorrador): { avisos: Aviso[]; faltante: Faltante | null } {
  const cotizados = [
    d.calculos.bandeja ? { que: "La bandeja", ml: d.calculos.bandeja.metros } : null,
    d.calculos.fachada ? { que: "La estructura en fachada", ml: suma(d.calculos.fachada.frentes) } : null,
  ].filter((x): x is { que: string; ml: number } => x !== null);
  if (!cotizados.length || d.obra.enCaba === false) return { avisos: [], faltante: null };

  const lote = d.obra.lote;
  const vigente = lote !== null && lote.direccionConsultada.trim() === (d.obra.direccion ?? "").trim();
  if (!vigente) {
    return {
      avisos: [],
      faltante: {
        codigo: "frente_lote",
        texto: lote
          ? "Cambió la dirección de la obra: hay que volver a verificar el frente del lote (verificar_frente_lote)."
          : "Falta verificar el frente del lote contra el catastro de la Ciudad (verificar_frente_lote).",
      },
    };
  }
  const frente = frenteDelLote(lote);
  if (!frente) {
    return { avisos: [], faltante: { codigo: "frente_lote", texto: "El catastro no tiene la medida del frente: pedísela al vendedor (verificar_frente_lote con frenteConfirmado)." } };
  }

  const origen = lote.fuente === "vendedor" ? `según el vendedor: ${lote.nota ?? "sin detalle"}` : `catastro, parcela ${lote.smp}`;
  const avisos: Aviso[] = [{ nivel: "info", codigo: "frente_lote", texto: `Frente del lote: ${lote.caras.length > 1 ? `${lote.caras.map(m).join(" + ")} = ` : ""}${m(frente)} (${origen}).` }];
  if (lote.esquina) {
    const decidido = d.decisiones.esquina;
    avisos.push({
      nivel: decidido ? "info" : "advertencia",
      codigo: "esquina",
      texto: `El lote es esquina (${lote.calles.join(" y ") || "dos caras"}${lote.caras.length > 1 ? `: ${lote.caras.map(m).join(" y ")}` : ""}). ${decidido ? `Se decidió: ${decidido}.` : "¿Van los dos frentes o uno solo? Anotalo en decisiones.esquina."}`,
    });
  }
  const menor = lote.esquina && lote.caras.length > 1 ? Math.min(...lote.caras) : frente;
  for (const c of cotizados) {
    const tolerancia = Math.max(1, frente * 0.05);
    if (c.ml > frente + tolerancia) {
      avisos.push({ nivel: "advertencia", codigo: "frente_mayor", texto: `${c.que} tiene ${m(c.ml)}.l. y el frente del lote es ${m(frente)} (${origen}): ¿toma lotes vecinos o la medida está mal?` });
    } else if (c.ml < menor - tolerancia) {
      avisos.push({ nivel: "advertencia", codigo: "frente_menor", texto: `${c.que} tiene ${m(c.ml)}.l. y el frente del lote es ${m(frente)} (${origen}): ¿cubre sólo un tramo?` });
    }
  }
  return { avisos, faltante: null };
}

export type ContextoCalculo = { tarifas: Tarifas; lista: { id: string; piezas: PiezaDeLista[] } | null; hoy: string };

export function recalcular(d: DatosBorrador, ctx: ContextoCalculo): ResultadoBorrador {
  const t = ctx.tarifas;
  const parciales: { grupo: string; r: Resultado }[] = [];
  if (d.calculos.bandeja) parciales.push({ grupo: "bandeja", r: cotizarBandeja(d.calculos.bandeja, t) });
  if (d.calculos.fachada) parciales.push({ grupo: "fachada", r: cotizarFachada(d.calculos.fachada, t) });
  if (d.calculos.alquiler) {
    parciales.push({
      grupo: "alquiler",
      r: ctx.lista
        ? cotizarAlquiler(d.calculos.alquiler, ctx.lista, t)
        : { lineas: [], avisos: [{ nivel: "bloqueo", codigo: "sin_lista", texto: "No hay lista de alquiler vigente: cargala en Parámetros de cotización." }], pendientes: [] },
    });
  }
  if (d.calculos.manoObra) parciales.push({ grupo: "mano_obra", r: cotizarManoObra(d.calculos.manoObra, t) });
  // Al técnico de SyH, si no le dijeron cuántas jornadas, le tocan las de armado + desarme.
  const jornadas = jornadasSyh(d);
  const conJornadas = (c: EntradaComplementario): EntradaComplementario =>
    c.tipo === "syh" && c.jornadas === undefined && jornadas !== null ? { ...c, jornadas, detalle: "armado y desarme" } : c;
  for (const c of d.calculos.complementarios ?? []) parciales.push({ grupo: "complementario", r: cotizarComplementario(conJornadas(c), t) });
  for (const c of opcionalesEstandar(d)) {
    // El técnico de SyH aparece cuando se saben las jornadas (se preguntan siempre, §4.9).
    if (c.tipo === "syh" && jornadas === null) continue;
    parciales.push({ grupo: "complementario", r: cotizarComplementario(conJornadas(c), t) });
  }

  // Una misma línea (p. ej. la gestoría) puede salir de dos cálculos: gana la primera.
  const vistas = new Set<string>();
  const lineas: Linea[] = [];
  for (const l of [...parciales.flatMap((p) => p.r.lineas), ...d.lineasManuales]) {
    if (vistas.has(l.id)) continue;
    vistas.add(l.id);
    lineas.push(l);
  }

  const renovacionPct =
    d.renovacionPct ??
    parciales.find((p) => p.grupo === "fachada")?.r.renovacionPct ??
    parciales.find((p) => p.grupo === "bandeja")?.r.renovacionPct ??
    parciales.find((p) => p.grupo === "alquiler")?.r.renovacionPct ??
    null;

  const totales = calcularTotales(lineas, { ivaPct: t.ivaPct, renovacionPct });
  const avisos = [...parciales.flatMap((p) => p.r.avisos), ...avisoMemoria(d, lineas), ...chequeoLote(d).avisos, ...(lineas.length ? chequear(lineas, totales, t) : [])];
  const pendientes = parciales.flatMap((p) => p.r.pendientes);

  return {
    lineas,
    totales,
    renovacionPct,
    avisos,
    pendientes,
    faltantes: faltantesParaEmitir(d, { lineas, avisos, pendientes }),
    calculadoCon: { listaAlquiler: ctx.lista?.id ?? null, fecha: ctx.hoy },
  };
}

/** El checklist del criterio (§5) aplicado: lo que tiene que estar antes de guardar en Odoo. */
export function faltantesParaEmitir(d: DatosBorrador, r: { lineas: Linea[]; avisos: Aviso[]; pendientes: Pendiente[] }): Faltante[] {
  const f: Faltante[] = [];
  const c = d.cliente;
  if (!c.partnerId && !c.esNuevo) f.push({ codigo: "cliente", texto: "Falta el cliente: buscarlo en Odoo (\"ya soy cliente\" no alcanza) o marcarlo como nuevo." });
  if (c.esNuevo) {
    const faltan = (["razonSocial", "contacto", "celular", "email", "cuit", "domicilio"] as const).filter((k) => !c[k]?.trim());
    if (faltan.length) f.push({ codigo: "cliente_nuevo", texto: `Para dar de alta al cliente faltan: ${faltan.join(", ")}.` });
    if (c.cuit && !validarCuit(c.cuit).valido) f.push({ codigo: "cuit", texto: `El CUIT ${c.cuit} no valida: confirmalo contra la constancia antes de cargarlo.` });
  }
  if (!d.obra.direccion?.trim()) f.push({ codigo: "obra", texto: "Falta la dirección de la obra." });
  else {
    const lote = chequeoLote(d).faltante;
    if (lote) f.push(lote);
  }
  if (!d.contrato) f.push({ codigo: "contrato", texto: "Falta el tipo de contrato (Obra, Simple o Alquiler Sin Montaje)." });
  const conMontaje = d.contrato === "Obra ";
  if (conMontaje && (d.jornadas.armado === null || d.jornadas.desarme === null)) {
    f.push({ codigo: "jornadas", texto: "Faltan las jornadas de armado y de desarme: las confirma el técnico, nunca se asumen." });
  }
  if (!d.render.eleccion) f.push({ codigo: "render", texto: "Falta decidir el render: el genérico de la biblioteca, uno propio de la obra o ninguno." });
  if (!d.seccion1?.trim()) f.push({ codigo: "seccion1", texto: "Falta el alcance (Sección 1)." });
  if (!d.seccion2.length) f.push({ codigo: "seccion2", texto: "Falta el anexo técnico (Sección 2)." });
  if (!r.lineas.some((l) => l.seccion === "base")) f.push({ codigo: "oferta", texto: "La oferta no tiene líneas." });
  if (!d.conflictoCanal.revisado) f.push({ codigo: "conflicto_canal", texto: "Falta revisar si otro vendedor ya cotizó esta dirección." });
  for (const p of r.pendientes) f.push({ codigo: `pendiente:${p.codigo}`, texto: p.pregunta });
  for (const a of r.avisos.filter((x) => x.nivel === "bloqueo")) f.push({ codigo: `bloqueo:${a.codigo}`, texto: a.texto });
  return f;
}

// ── Derivados para Odoo ─────────────────────────────────────────────────────────────────

const OPCIONES_DURACION = ["0.10", "0.25", "0.50", "0.75", "1", "2", "3", "4", "5", "6", "8", "10", "15"];

/** Jornadas → la opción de la selección x_dur_armado/x_dur_desarme (la más chica que alcanza). */
export function opcionDuracion(jornadas: number | null): string | null {
  if (jornadas === null || !(jornadas > 0)) return null;
  return OPCIONES_DURACION.find((o) => Number(o) >= jornadas - 1e-9) ?? "15";
}

/** Texto plano para x_alcance_tecnico (lo lee el detalle técnico de la OT en Operaciones). */
export function alcanceTecnico(d: DatosBorrador): string | null {
  const limpio = (s: string) => s.replace(/\*\*/g, "").replace(/^[*\-•]\s+/gm, "· ").trim();
  const partes = [d.seccion1 ? limpio(d.seccion1) : "", ...d.seccion2.slice(0, 3).map((b) => `${b.titulo}: ${limpio(b.contenido)}`)].filter(Boolean);
  const texto = partes.join("\n\n");
  return texto ? texto.slice(0, 3000) : null;
}
