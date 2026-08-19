// Tipos del módulo Informe de Obra — compartidos entre servidor y cliente.
//
// Ver docs/modulo-informe-de-obra.md.
//
// Estas formas son las que se congelan en `informes_obra.datos` (jsonb). Cambiarlas no
// migra lo ya guardado: los informes viejos conservan la forma que tenían al generarse,
// que es justamente el punto de congelarlos. Si hace falta la forma nueva, se regenera y
// sale una versión 2.

/** Los 7 valores de x_estado_costeo en Odoo. Ninguno cae en un `else` mudo. */
export type EstadoCosteo =
  | "completo" | "sin_ot" | "falta_armado" | "falta_desarme"
  | "sin_mo" | "pendiente" | "no_aplica";

export const COSTEO_CORTO: Record<Exclude<EstadoCosteo, "completo">, string> = {
  sin_ot:
    "Esta obra se cerró sin ninguna OT registrada. No hay costo de mano de obra ni de " +
    "fletes, así que el margen no es real.",
  falta_armado:
    "Falta la OT de armado. El costo está incompleto y el margen que muestra Odoo es " +
    "más alto que el real.",
  falta_desarme:
    "Falta la OT de desarme. El costo está incompleto: el desarme se ejecutó pero no " +
    "quedó registrado.",
  sin_mo:
    "Hay OTs pero ningún parte con horas-hombre: sólo se computaron fletes. El costo de " +
    "mano de obra de esta obra es cero, que no puede ser.",
  pendiente:
    "La obra figura desarmada pero su costeo está pendiente. Es una contradicción de " +
    "estado en Odoo, no un dato faltante de la app.",
  no_aplica:
    "El costeo no aplica a esta venta. No debería haber llegado a generar informe: " +
    "revisar el filtro de tipo de contrato.",
};

export type TipoInconsistencia =
  | "sin_costear" | "jornada_sin_parte" | "parte_sin_horas" | "parte_sin_cuadrilla"
  | "ot_sin_estimacion" | "sin_fotos" | "margen_fuera_de_rango";

export type Inconsistencia = {
  tipo: TipoInconsistencia;
  /** Una línea, con la consecuencia. No "faltan fotos" sino qué significa que falten. */
  detalle: string;
  /** Cuántos registros afecta, cuando aplica (3 partes sin horas). */
  cantidad?: number;
};

export type Visita = {
  fecha: string;
  /** Varios partes el mismo día son UNA visita: un traslado, una cuadrilla tomada. */
  partes: number;
  horasHombre: number;
  fletes: number;
  cuadrillas: string[];
  tipos: string[];
};

export type JornadaInforme = {
  parteId: number;
  fecha: string;
  cuadrilla: string | null;
  tipo: string;
  horasHombre: number;
  fletes: number;
  /** Costo del día en pesos y su equivalente al CCL de ESE día. */
  costo: number;
  costoUsd: number;
  sector: string | null;
  /** Primera línea de las notas. El relato entero vive ahí y no en campos separados. */
  nota: string | null;
  fotos: number;
  incidencias: number;
  estado: string | null;
};

/**
 * §2. Es CONDICIONAL: `null` cuando alguna OT de la obra no tiene `x_duracion_est`.
 *
 * Nunca se completa con el fallback de `x_jornadas_num` —que devuelve el `1` por default
 * de la importación— porque un desvío calculado contra un número inventado parece
 * información y es peor que ningún desvío.
 */
export type Estimado = {
  jornadasEstimadas: number;
  visitasReales: number;
  desvioVisitas: number;
  /** Σ x_duracion_est × 5 personas × 8 h. NO es x_jornadas_hombre_estimadas. */
  horasHombreEstimadas: number;
  horasHombreReales: number;
  desvioHoras: number;
};

export type Economia = {
  facturadoNeto: number;
  costoManoObra: number;
  costoFletes: number;
  costoOperativo: number;
  margenContribucion: number;
  margenPct: number;
  /**
   * Lo mismo en dólares, convertido al CCL de la fecha de CADA movimiento: las facturas
   * al día de emisión y los costos al día del parte diario.
   *
   * NO ES UN ADORNO, es la única columna comparable entre obras. Con esta inflación, un
   * costo por jornada de $404.800 de mayo y otro de agosto no se pueden poner al lado; en
   * USD sí. Y el margen en USD no coincide con el de pesos: esa diferencia es el efecto
   * del tipo de cambio, y es información, no ruido.
   *
   * Opcional porque los informes con `formato: 1` se generaron antes de incorporarla.
   */
  usd?: {
    facturadoNeto: number;
    costoOperativo: number;
    margenContribucion: number;
    margenPct: number;
  };
};

export type ParaCotizar = {
  costoPorVisita: number | null;
  costoPorHoraHombre: number | null;
  /**
   * Los mismos dos números en USD. SON LOS QUE SE REUSAN: un "costo por hora-hombre" en
   * pesos sólo sirve para la obra que lo produjo, porque a los tres meses la cifra ya no
   * significa lo mismo.
   */
  costoPorVisitaUsd: number | null;
  costoPorHoraHombreUsd: number | null;
  /** Días promedio entre VISITAS, no entre partes. */
  ritmoDias: number | null;
  huecoMaximoDias: number | null;
  fletesTotales: number;
  fletesEnArmado: number;
  fletesEnDesarme: number;
  tiposEstructura: string[];
};

/** El informe entero, tal como se congela en `datos`. */
export type DatosInforme = {
  /**
   * Formato de los datos. Sube si la forma cambia.
   *   1 — sólo pesos.
   *   2 — suma la columna en dólares al CCL de cada fecha (economia.usd, costoUsd).
   *
   * Los informes viejos NO se migran: conservan la forma que tenían al generarse, que es
   * el punto de congelarlos. La UI tiene que tolerar el formato 1.
   */
  formato: 1 | 2;
  venta: {
    id: number;
    nombre: string;
    cliente: string | null;
    /** Del título de la OT: sale.order no tiene campo de dirección. */
    direccion: string | null;
    tecnico: string | null;
  };
  periodo: {
    desde: string | null;
    hasta: string | null;
    dias: number | null;
    ots: number;
    partes: number;
    visitas: number;
  };
  /** null = "sin estimación previa". Ver el tipo Estimado. */
  estimado: Estimado | null;
  economia: Economia;
  jornadas: JornadaInforme[];
  visitas: Visita[];
  /** Sólo si la obra tiene más de un sector NORMALIZADO. null = no se muestra. */
  sectores: { nombre: string; partes: number; horasHombre: number }[] | null;
  registro: {
    incidencias: { tipo: string; descripcion: string; fecha: string | null }[];
    fotos: number;
    habilitacionEtapa: string | null;
    habilitacionSemaforo: string | null;
  };
  paraCotizar: ParaCotizar;
};

export type InformeObra = {
  id: string;
  odooSaleOrderId: number;
  version: number;
  generadoEn: string;
  generadoPor: string | null;
  estadoCosteo: EstadoCosteo;
  datos: DatosInforme;
  inconsistencias: Inconsistencia[];
  reabiertaEn: string | null;
};

/** Fila de la lista. Se deriva de `datos` para no traer el jsonb entero. */
export type InformeListado = {
  odooSaleOrderId: number;
  version: number;
  generadoEn: string;
  estadoCosteo: EstadoCosteo;
  venta: string;
  cliente: string | null;
  direccion: string | null;
  cierre: string | null;
  visitas: number;
  desvioVisitas: number | null;
  desvioHoras: number | null;
  margenPct: number;
  facturado: number;
  /** El comparable entre obras. null en los informes de formato 1. */
  facturadoUsd: number | null;
  margenPctUsd: number | null;
  inconsistencias: number;
};

export type FiltroInformes = "todas" | "inconsistencias" | "mal_costeadas" | "desvio";

export type ConteosInformes = Record<FiltroInformes, number>;

export type ListadoInformes = {
  informes: InformeListado[];
  conteos: ConteosInformes;
};
