// Lo que se toca en el celular y cómo queda mientras viaja (o espera señal).

import type { VistaPublica } from "@/lib/hoja-dia/vista";

export type { VistaPublica };

/** Un toque: es el cuerpo del POST /api/public/hoja/[token] (sin `at`). */
export type Toque =
  | { accion: "recibido" | "entendido"; version?: number }
  | { accion: "hecho" | "deshacer"; viajeId: string }
  | { accion: "no_pude"; viajeId: string; motivo: string };

/**
 * Un toque que todavía no confirmó el servidor. `at` es cuándo se tocó (ISO): sin señal se
 * manda después con esa hora, no con la de llegada. `cola`: espera señal; `enviando`: en camino.
 */
export type Pendiente = { id: string; toque: Toque; at: string; estado: "enviando" | "cola" };

/** Cómo terminó un toque: llegó, quedó en cola (sin señal) o el servidor dijo que no. */
export type ResultadoToque = { k: "ok" } | { k: "cola" } | { k: "error"; error: string };

/** Lo que el link puede hacer. Sin esto (vista previa), la vista no toca nada. */
export type AccionesCelular = {
  tocar: (t: Toque) => Promise<ResultadoToque>;
  /** Sacar de la cola un toque que todavía no salió (el "Deshacer" sin señal). */
  quitarDeCola: (id: string) => void;
  /**
   * La foto del remito (POST /api/public/hoja/[token]/viaje/[id]/foto). Si no viene (la
   * vista previa del escritorio), el botón avisa que se la mande al coordinador.
   */
  subirFoto?: (viajeId: string, archivo: File) => Promise<ResultadoToque>;
  reintentar?: () => void;
};

/** Estado de la conexión, para la franja de arriba. */
export type Conexion = {
  /** Lo que se ve es lo guardado (no hay red o el servidor no contestó). */
  sinConexion: boolean;
  /** "20:16": de cuándo es lo que se ve. */
  desde: string | null;
  /** Hay red pero el servidor no contestó: "No se pudo actualizar". */
  sinActualizar?: boolean;
};
