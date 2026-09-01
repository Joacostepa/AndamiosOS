// Quién confirmó una jornada y cuándo. Vive en Supabase (plan_confirmaciones); ver la
// migración 20260831000005 para por qué no está en Odoo.
//
// Los tipos van acá, no en el servicio, para que el bundle del browser no tenga que
// tocar nada server-only — igual que tipos.ts y tipos-nota.ts.

export type EstadoConfirmacion = "confirmada" | "tentativa";

export type Confirmacion = {
  id: string;
  asignacionId: number;
  otId: number;
  /** El día que se estaba confirmando. null en registros viejos o sin fecha. */
  fecha: string | null;
  estado: EstadoConfirmacion;
  autorNombre: string | null;
  createdAt: string;
};

/** Lo que la app manda al cambiar el estado de un bloque. */
export type RegistroConfirmacion = {
  otId: number;
  /** Una entrada por jornada, en el mismo orden que los ids que se están cambiando. */
  fechas: (string | null)[];
};
