// Tipos del módulo de Órdenes de Trabajo. Compartidos entre la capa Odoo y el cliente.

/** Los filtros del listado. Reemplazan al filtro por estado, que no discrimina nada:
 *  955 de 1003 OTs están completadas, así que filtrar por estado deja siempre la misma
 *  lista gigante. Lo que sí discrimina es la habilitación y la fecha. */
export type FiltroOrdenes =
  | "abiertas"
  | "critica"
  | "proxima"
  | "sin_fecha"
  | "en_curso"
  | "cerradas";

export type OrdenListado = {
  id: number;
  titulo: string;
  tipo: string;
  estado: string;
  /** Venta de la que cuelga. El vínculo real: x_obra_id está vacío en las 1003. */
  ordenVenta: string | null;
  fechaProgramada: string | null;
  fechaComprometida: string | null;
  /** tentativa | confirmada | null (la puso una persona, no el tablero). */
  fechaFirmeza: string | null;
  habSemaforo: string;
  habAlerta: string | null;
  /** a_con | b_sin: si tiene fecha programada o falta coordinar. */
  grupoProg: string | null;
  cuadrillaPrevista: string | null;
  jornadas: number;
  /** 0 = la OT no tiene dotación cargada. */
  personalPorJornada: number;
  diasObra: number;
  cantDocs: number;
  esAdicional: boolean;
  aprobadaComercial: boolean;
  url: string;
};

export type ConteosOrdenes = Record<FiltroOrdenes, number>;

export type ListadoOrdenes = {
  ordenes: OrdenListado[];
  conteos: ConteosOrdenes;
};

/** Una jornada de la OT, para el bloque 3 de la ficha. */
export type JornadaDeOrden = {
  asignacionId: number;
  fecha: string;
  cuadrilla: string | null;
  estado: "tentativa" | "confirmada";
  parteId: number | null;
  /** Del parte, si está cargado. */
  personas: number | null;
  horaDesde: number | null;
  horaHasta: number | null;
  horasHombre: number | null;
  parteEstado: string | null;
};

export type OrdenDetalle = OrdenListado & {
  /** Desvío ya calculado por Odoo. Es un TEXTO ("+44%", "-81%"), no un número. */
  desvioTexto: string | null;
  /** El mismo desvío parseado. null si el texto no se entiende. */
  desvioPct: number | null;
  horasHombre: number;
  jornadasHombreEstimadas: number;
  costoManoObra: number;
  costoFletes: number;
  costoTotal: number;
  habEtapa: string | null;
  habVencimiento: string | null;
  contactoObra: string | null;
  telObra: string | null;
  observaciones: string | null;
  /** Qué estructura hay que montar o bajar. Ver DetalleOt.detalleTecnico en ./tipos. */
  detalleTecnico: string | null;
  urlVenta: string | null;
  /** Id de sale.order. Lo necesita el enlace al informe de obra, que se indexa por venta. */
  ventaId: number | null;
  jornadasPlanificadas: JornadaDeOrden[];
};

/**
 * "+44%" → 44. Odoo guarda el desvío como CHAR, así que no se puede comparar
 * directamente: en orden lexicográfico "+9%" es mayor que "+25%", y colorear sin parsear
 * pintaría de rojo un desvío del 9%.
 */
export function parseDesvio(texto: string | null): number | null {
  if (!texto) return null;
  const m = /^([+-]?)\s*(\d+(?:[.,]\d+)?)\s*%?$/.exec(texto.trim());
  if (!m) return null;
  const n = Number(m[2].replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return m[1] === "-" ? -n : n;
}
