// Tipos del listado de partes diarios. Compartidos entre el servidor (capa Odoo) y el
// cliente, igual que src/lib/tablero/tipos.ts.

import type { ParteCargado } from "./tipos-parte";

/**
 * Una fila del listado. NO es un registro: es una jornada planificada, con su parte
 * colgando si ya se cargó. El parte se escribe en Odoo una sola vez, al guardar.
 */
export type JornadaListado = {
  asignacionId: number;
  fecha: string;
  otId: number;
  titulo: string;
  tipo: string;
  /** Cuadrilla PLANIFICADA. La real se elige al cargar y puede diferir. */
  cuadrillaId: number | null;
  fraccion: number;
  estadoAsignacion: "tentativa" | "confirmada";
  /** Dotación prevista de la OT. 0 = sin cargar → el campo arranca vacío, nunca en 1. */
  personalPrevisto: number;
  /** Viajes redondos sugeridos según la duración del bloque. */
  fleteSugerido: number;
  /** El parte, si ya está cargado. null = fila pendiente. */
  parte: ParteCargado | null;
  /**
   * Es la última jornada de su OT que quedaba sin parte Y no queda nada por planificar:
   * al guardarla se pregunta si la orden de trabajo terminó.
   */
  ultimaDeLaOt: boolean;
  /**
   * Qué había que ejecutar, según la OT. Precarga el as-built al cerrarla: el que carga
   * confirma o corrige, en vez de escribir desde cero en el celular.
   */
  detalleTecnico: string | null;
  /**
   * Iniciales del técnico de la obra ("JS", "GS"). Es a quién preguntarle cuando lo
   * que está en obra no coincide con lo que dice la OT — la pregunta que hoy se hace
   * por WhatsApp averiguando primero de quién es la obra.
   */
  tecnico: string | null;
  /** Tentativa cuya fecha ya pasó: va a la sección plegada del pie. */
  tentativaVencida: boolean;
};

export type ListadoJornadas = {
  fecha: string;
  /** Jornadas del día elegido (confirmadas, y sólo si la fecha ya llegó). */
  jornadas: JornadaListado[];
  /**
   * Tentativas de días pasados que nadie confirmó ni cargó. Confirmar es un gesto que se
   * olvida; si no aparecieran, una jornada trabajada no tendría dónde cargarse y su costo
   * de mano de obra nunca entraría al sistema.
   */
  sinConfirmar: JornadaListado[];
  cuadrillas: { id: number; nombre: string }[];
  /** OTs a las que se le puede agregar una jornada que pasó sin estar planificada. */
  otsDisponibles: { id: number; titulo: string; tipo: string }[];
};

/** Lo que el listado manda para guardar una fila. */
export type GuardarJornada = {
  asignacionId: number;
  datos: unknown;
  /** La persona contestó que la obra terminó. */
  finalizarOt?: boolean;
  /** No se ejecutó y se reprograma: se CREA una jornada nueva en esta fecha. */
  reprogramarA?: string | null;
};
