// Tipos de dominio del tablero, compartidos entre el servidor (capa Odoo) y el
// cliente (hooks y componentes). Viven acá y no en src/lib/odoo/asignaciones.ts para
// que el bundle del browser nunca tenga que tocar el módulo server-only de Odoo.
//
// Ya vienen normalizados: sin `false` de Odoo, sin tuplas many2one.

import type { FraccionStr } from "./fracciones";

export type { FraccionStr };

export type EstadoAsignacion = "tentativa" | "confirmada";

export type CuadrillaTablero = {
  id: number;
  nombre: string;
  tercerizada: boolean;
};

export type AsignacionTablero = {
  id: number;
  otId: number;
  fecha: string; // yyyy-MM-dd
  cuadrillaId: number | null;
  fraccion: number; // 0.10 | 0.25 | 0.50 | 0.75 | 1
  estado: EstadoAsignacion;
  ordenDia: number;
  notas: string | null;
  /** Parte diario del cierre. Si tiene valor, la jornada ya se cerró. */
  parteId: number | null;
};

export type OtTablero = {
  id: number;
  titulo: string;
  tipo: string;
  estado: string;
  urgencia: string;
  motivoUrgencia: string | null;
  /** Jornadas previstas. x_duracion_est manda; x_jornadas_num es el fallback. */
  jornadas: number;
  personalPorJornada: number;
  cuadrillaPrevistaId: number | null;
  habSemaforo: string;
  habAlerta: string | null;
  habVencimiento: string | null;
  tecnico: string | null;
  contactoObra: string | null;
  telObra: string | null;
  observaciones: string | null;
  diasObra: number;
  horasHombre: number;
  cantDocs: number;
  docIds: number[];
  ordenVenta: string | null;
  /** Lo que dice el plan. La escribe el tablero. */
  fechaProgramada: string | null;
  /**
   * Lo que Comercial le prometió al cliente. La escribe una persona en Odoo y el tablero
   * NO la toca: es contra esto que se mide si la planificación llega tarde.
   */
  fechaComprometida: string | null;
  url: string;
};

/** Jornada ya ejecutada (o no ejecutada) según el parte diario. */
export type ParteTablero = {
  id: number;
  otId: number;
  fecha: string;
  cuadrillaId: number | null;
  estado: string; // previsto | ejecutado | no_ejecutado
  motivoNoEjec: string | null;
};

/**
 * Lo que se lee al ABRIR la ficha de una OT, y sólo entonces.
 *
 * Va aparte del payload del tablero a propósito: eso trae 52 OTs en la llamada que más
 * se repite, y nada de esto hace falta hasta que alguien hace clic en una tarjeta.
 *
 * Mezcla la OT con su orden de venta porque la pregunta del que planifica no distingue:
 * quién es el cliente y dónde queda la obra viven en sale.order, no en la OT.
 */
export type DetalleOt = {
  /** De la orden de venta. Hasta ahora el cliente salía de partir el título de la OT,
   *  que no siempre lo trae ("Desarme · S00719 · Av. Callao 1810"). */
  cliente: string | null;
  direccionObra: string | null;
  /**
   * Teléfono de la ficha de obra del cliente en Odoo. La OT tiene su propio contacto
   * (x_tel_obra) pero está cargado en el 12% de las OTs; éste, en la mayoría.
   */
  telFichaCliente: string | null;
  /** Nombre completo. En la OT el técnico son iniciales ("GS"), que no dicen nada. */
  tecnicoNombre: string | null;
  vendedor: string | null;
  /** Etapa del trámite de habilitación (a…f). Ver ETAPA_LABEL. */
  habEtapa: string | null;
  habDias: number;
  /** "Tentativa — puede moverse" / "Confirmada — fecha firme", sobre la fecha comprometida. */
  fechaFirmeza: string | null;
  /** Rango ya ejecutado, calculado por Odoo: "11/02 al 25/07/2026 (6 jornadas)". */
  periodo: string | null;
  /** Desvío de lo ejecutado contra lo estimado ("-34%"). */
  desvio: string | null;
  /** Sugerencia de duración con su explicación (sirve sobre todo para el desarme). */
  duracionSugerida: string | null;
};

export type DocumentoOt = {
  id: number;
  nombre: string;
  mimetype: string;
  url: string;
};

/**
 * Avance de una OT en el tablero. Permite distinguir la obra que nunca se planificó de
 * la que se empezó y quedó suspendida a mitad, esperando retomarse.
 */
export type ProgresoOt = {
  otId: number;
  /** Jornadas con asignación en el tablero (en cualquier fecha). */
  asignadas: number;
  /** De esas, las que ya tienen parte diario cargado. */
  cerradas: number;
};

export type TableroPayload = {
  cuadrillas: CuadrillaTablero[];
  asignaciones: AsignacionTablero[];
  ots: OtTablero[];
  partes: ParteTablero[];
  progreso: ProgresoOt[];
};

export type NuevaAsignacion = {
  otId: number;
  fecha: string;
  cuadrillaId: number | null;
  fraccion: FraccionStr;
  estado: EstadoAsignacion;
  ordenDia: number;
  notas?: string | null;
};

export type CambioAsignacion = {
  fecha?: string;
  cuadrillaId?: number | null;
  fraccion?: FraccionStr;
  estado?: EstadoAsignacion;
  ordenDia?: number;
  notas?: string | null;
};

export type MovimientoAsignacion = {
  id: number;
  fecha: string;
  cuadrillaId?: number | null;
  ordenDia?: number;
};
