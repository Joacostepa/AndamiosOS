// Días suspendidos: la marca que deja "correr el día" en cada cuadrilla que no salió.
// Viven en Supabase (plan_suspensiones); ver la migración 20261002000001.
//
// Los tipos van acá y no en el servicio para que el bundle del browser no toque el
// módulo de servidor, igual que tipos-nota.ts.

export type SuspensionDia = {
  id: string;
  fecha: string; // yyyy-MM-dd
  cuadrillaId: number;
  motivo: string;
  loteId: string | null;
  autorNombre: string | null;
};

/** Clave `cuadrilla:fecha` para buscar la marca de una celda. */
export const claveSuspension = (cuadrillaId: number, fecha: string) => `${cuadrillaId}:${fecha}`;
