// Lógica pura del Informe de Obra: visitas, desvíos, sectores e inconsistencias.
//
// Sin red ni React a propósito: es lo que hay que poder razonar y probar sin levantar
// nada, y es donde están las cuatro reglas que el diseño discute largo.
//
// ─────────────────────────────────────────────────────────────────────────────
// LAS CUATRO REGLAS
//
// 1. VISITAS, NO PARTES. Dos partes del mismo día son UNA visita: un traslado y una
//    cuadrilla tomada un día. En S00116 son 7 partes en 5 visitas, y el ritmo real es
//    23 días, no 15,3.
//
// 2. §2 ES TODO O NADA. Si alguna OT no tiene x_duracion_est, no hay desvío. NUNCA usar
//    x_jornadas_num: su compute cae a x_jornadas_estimadas y devuelve el `1` por default
//    de la importación, que PARECE una estimación. Hoy 997 de 1003 OTs están así.
//
// 3. HORAS-HOMBRE = Σ x_duracion_est × 5 × 8. No x_jornadas_hombre_estimadas, que es
//    jornadas × personas —persona-DÍAS— y compararlo contra x_horas_hombre mete un
//    factor 8.
//
// 4. SECTOR NORMALIZADO antes de contar distintos, o `ESTRUCTURA` y `ESTRUCTURAS`
//    disparan la sección por dos valores que son el mismo.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  DatosInforme, Economia, Estimado, EstadoCosteo, Inconsistencia, JornadaInforme,
  ParaCotizar, Visita,
} from "./tipos";

/**
 * La cuadrilla normal que Comercial asume al estimar. Verificado sobre 1300 líneas de
 * mano de obra: 5 personas es el 54,8% y la mediana; entre 4 y 5 está el 81%.
 */
export const EQUIPO_ESTANDAR = 5;

/**
 * Horas de una jornada completa. NO se calibra contra la duración media real de una
 * línea (4,9 h): la escala de x_duracion_est se define sola —sus etiquetas dicen
 * `'0.50' → Media jornada - 4 h` y `'1' → 1 jornada completa`—. Que el promedio ejecutado
 * sea menor significa que la mayoría de las jornadas son parciales, que es justo lo que
 * las fracciones capturan; calibrar mezclaría la unidad con su uso típico.
 */
export const HORAS_JORNADA = 8;

/** Fuera de esta banda, casi siempre es un costo que falta y no una obra excepcional. */
export const MARGEN_ALTO = 95;
export const MARGEN_BAJO = 20;

/**
 * Normalizador de sector.
 *
 * `normalizar()` de lib/tablero/titulo.ts no alcanza: sólo hace NFD y minúsculas. Acá
 * hace falta además colapsar espacios y saltos —conviven `ESTRUCTURA`, `ESTRUCTURAS` y
 * `ESTRUCTURA\nTABLONES`— y sacar el plural final.
 */
export function normalizarSector(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/S$/, "");
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00`) - Date.parse(`${desde}T00:00:00`)) / 86_400_000);
}

// ─── Visitas ────────────────────────────────────────────────────────────────

/**
 * Agrupa los partes por DÍA. Es la unidad física del trabajo: cada visita es un traslado
 * y una cuadrilla tomada, independientemente de cuántos partes se hayan cargado ese día
 * (típicamente uno de armado y uno de desarme, o dos cuadrillas).
 */
export function visitasDe(jornadas: JornadaInforme[]): Visita[] {
  const porFecha = new Map<string, Visita>();
  for (const j of jornadas) {
    if (!j.fecha) continue;
    const v = porFecha.get(j.fecha) ?? {
      fecha: j.fecha, partes: 0, horasHombre: 0, fletes: 0, cuadrillas: [], tipos: [],
    };
    v.partes++;
    v.horasHombre += j.horasHombre;
    v.fletes += j.fletes;
    if (j.cuadrilla && !v.cuadrillas.includes(j.cuadrilla)) v.cuadrillas.push(j.cuadrilla);
    if (j.tipo && !v.tipos.includes(j.tipo)) v.tipos.push(j.tipo);
    porFecha.set(j.fecha, v);
  }
  return [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ─── §2: estimado contra real ───────────────────────────────────────────────

export type OtParaEstimado = {
  id: number;
  /** El selection de Odoo: "0.10" | "0.25" | "0.50" | "0.75" | "1" | "2" | … o null. */
  duracionEst: string | null;
};

/**
 * Devuelve `null` —"sin estimación previa"— si ALGUNA OT de la obra no tiene
 * `x_duracion_est`. No se estima parcial ni se completa con el fallback.
 *
 * Hoy eso pasa en el ~99% de las obras: 997 de 1003 OTs no tienen el campo, que recién
 * pasó a ser obligatorio en la vista de Comercial. La sección se va a poblar con las
 * obras que se cierren de acá en adelante.
 */
export function estimadoDe(
  ots: OtParaEstimado[],
  visitasReales: number,
  horasHombreReales: number,
): Estimado | null {
  if (ots.length === 0) return null;
  if (ots.some((o) => !o.duracionEst)) return null;

  const jornadasEstimadas = ots.reduce((s, o) => s + (Number(o.duracionEst) || 0), 0);
  if (jornadasEstimadas <= 0) return null;

  const horasHombreEstimadas = jornadasEstimadas * EQUIPO_ESTANDAR * HORAS_JORNADA;

  return {
    jornadasEstimadas,
    visitasReales,
    desvioVisitas: pct(visitasReales, jornadasEstimadas),
    horasHombreEstimadas,
    horasHombreReales,
    desvioHoras: pct(horasHombreReales, horasHombreEstimadas),
  };
}

/** Desvío en porcentaje: +9 significa 9% por encima de lo estimado. */
function pct(real: number, estimado: number): number {
  if (estimado <= 0) return 0;
  return Math.round(((real - estimado) / estimado) * 1000) / 10;
}

// ─── Sectores ───────────────────────────────────────────────────────────────

/**
 * Devuelve `null` cuando la obra tiene un solo sector normalizado — que es el 97% de los
 * casos (256 de 263). La sección se omite entera, no se muestra vacía.
 */
export function sectoresDe(jornadas: JornadaInforme[]): DatosInforme["sectores"] {
  const porSector = new Map<string, { nombre: string; partes: number; horasHombre: number }>();
  for (const j of jornadas) {
    if (!j.sector?.trim()) continue;
    const clave = normalizarSector(j.sector);
    if (!clave) continue;
    const s = porSector.get(clave) ?? { nombre: j.sector.trim(), partes: 0, horasHombre: 0 };
    s.partes++;
    s.horasHombre += j.horasHombre;
    porSector.set(clave, s);
  }
  if (porSector.size <= 1) return null;
  return [...porSector.values()].sort((a, b) => b.horasHombre - a.horasHombre);
}

// ─── Para la próxima cotización ─────────────────────────────────────────────

export function paraCotizarDe(
  visitas: Visita[],
  jornadas: JornadaInforme[],
  economia: Economia,
): ParaCotizar {
  const costo = economia.costoManoObra + economia.costoFletes;
  const horas = jornadas.reduce((s, j) => s + j.horasHombre, 0);
  // El costo en USD sale de los PARTES, cada uno convertido al CCL de su propio día, y no
  // de convertir el total de pesos al dólar de hoy. Esa es toda la diferencia: una obra
  // de mayo y otra de agosto sólo se pueden comparar si cada una se valuó a su fecha.
  const costoUsd = jornadas.reduce((s, j) => s + j.costoUsd, 0) || economia.usd?.costoOperativo || 0;

  // Huecos ENTRE VISITAS, no entre partes. Contando partes, dos cargados el mismo día
  // meten un hueco de 0 que arrastra el promedio hacia abajo y no significa nada.
  const huecos = visitas.slice(1).map((v, i) => diasEntre(visitas[i].fecha, v.fecha));

  const esDesarme = (t: string) => t.toLowerCase().includes("desarme");

  return {
    costoPorVisita: visitas.length > 0 ? Math.round(costo / visitas.length) : null,
    costoPorHoraHombre: horas > 0 ? Math.round(costo / horas) : null,
    costoPorVisitaUsd:
      visitas.length > 0 && costoUsd > 0 ? Math.round(costoUsd / visitas.length) : null,
    costoPorHoraHombreUsd:
      horas > 0 && costoUsd > 0 ? Math.round((costoUsd / horas) * 100) / 100 : null,
    ritmoDias: huecos.length > 0
      ? Math.round((huecos.reduce((s, d) => s + d, 0) / huecos.length) * 10) / 10
      : null,
    huecoMaximoDias: huecos.length > 0 ? Math.max(...huecos) : null,
    fletesTotales: jornadas.reduce((s, j) => s + j.fletes, 0),
    fletesEnArmado: jornadas.filter((j) => !esDesarme(j.tipo)).reduce((s, j) => s + j.fletes, 0),
    fletesEnDesarme: jornadas.filter((j) => esDesarme(j.tipo)).reduce((s, j) => s + j.fletes, 0),
    tiposEstructura: [
      ...new Set(jornadas.map((j) => j.sector?.trim()).filter((s): s is string => !!s)),
    ],
  };
}

// ─── Inconsistencias ────────────────────────────────────────────────────────

export type ContextoInconsistencias = {
  estadoCosteo: EstadoCosteo;
  jornadas: JornadaInforme[];
  ots: OtParaEstimado[];
  /** Asignaciones del tablero que ya pasaron y nunca recibieron parte. */
  asignacionesSinParte: number;
  economia: Economia;
  fotos: number;
};

/**
 * Es lo que convierte al informe en algo que se lee dos veces. Cada chequeo dice la
 * CONSECUENCIA, no sólo el hecho: "faltan fotos" no mueve a nadie; "no hay constancia del
 * estado de entrega, que es lo primero que se pide ante un reclamo" sí.
 *
 * El informe no bloquea por esto: las lista y se genera igual.
 */
export function inconsistenciasDe(ctx: ContextoInconsistencias): Inconsistencia[] {
  const out: Inconsistencia[] = [];

  if (ctx.estadoCosteo !== "completo") {
    out.push({
      tipo: "sin_costear",
      detalle:
        `La obra se cerró con el costeo en "${ctx.estadoCosteo}": el margen que muestra ` +
        "no es comparable con el de una obra bien costeada.",
    });
  }

  if (ctx.asignacionesSinParte > 0) {
    out.push({
      tipo: "jornada_sin_parte",
      cantidad: ctx.asignacionesSinParte,
      detalle:
        `${ctx.asignacionesSinParte} jornada(s) quedaron planificadas y sin parte cargado. ` +
        "Esas horas se trabajaron y no entraron al costo.",
    });
  }

  const sinHoras = ctx.jornadas.filter((j) => j.horasHombre <= 0).length;
  if (sinHoras > 0) {
    out.push({
      tipo: "parte_sin_horas",
      cantidad: sinHoras,
      detalle:
        `${sinHoras} parte(s) sin horas-hombre. El costo de mano de obra de esos días es ` +
        "cero y el margen queda inflado.",
    });
  }

  const sinCuadrilla = ctx.jornadas.filter((j) => !j.cuadrilla).length;
  if (sinCuadrilla > 0) {
    out.push({
      tipo: "parte_sin_cuadrilla",
      cantidad: sinCuadrilla,
      detalle:
        `${sinCuadrilla} parte(s) sin cuadrilla asignada: no se puede saber quién ` +
        "ejecutó la obra ni imputar la jornada a un equipo.",
    });
  }

  const sinEstimacion = ctx.ots.filter((o) => !o.duracionEst).length;
  if (sinEstimacion > 0) {
    out.push({
      tipo: "ot_sin_estimacion",
      cantidad: sinEstimacion,
      detalle:
        `${sinEstimacion} OT(s) sin duración estimada. Sin ese dato esta obra no aporta ` +
        "nada a la calibración de las cotizaciones futuras.",
    });
  }

  if (ctx.fotos === 0 && ctx.jornadas.length > 0) {
    out.push({
      tipo: "sin_fotos",
      detalle:
        "La obra no tiene ninguna foto. Sin registro visual no hay constancia del estado " +
        "de entrega, que es lo primero que se pide ante un reclamo.",
    });
  }

  const m = ctx.economia.margenPct;
  if (m > MARGEN_ALTO || (m < MARGEN_BAJO && m !== 0)) {
    out.push({
      tipo: "margen_fuera_de_rango",
      detalle:
        `Margen de contribución del ${m}%: fuera de la banda ${MARGEN_BAJO}–${MARGEN_ALTO}%. ` +
        "Casi siempre es un costo que falta cargar, no una obra excepcional.",
    });
  }

  return out;
}
