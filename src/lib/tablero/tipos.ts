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
  fechaProgramada: string | null;
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
