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
  obra: { direccion: string | null; enCaba: boolean | null };
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
};

export function borradorVacio(): DatosBorrador {
  return {
    cliente: { partnerId: null, razonSocial: null, contacto: null, celular: null, email: null, cuit: null, domicilio: null, esNuevo: false },
    obra: { direccion: null, enCaba: null },
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
  for (const c of d.calculos.complementarios ?? []) parciales.push({ grupo: "complementario", r: cotizarComplementario(c, t) });

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
  const avisos = [...parciales.flatMap((p) => p.r.avisos), ...(lineas.length ? chequear(lineas, totales, t) : [])];
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
