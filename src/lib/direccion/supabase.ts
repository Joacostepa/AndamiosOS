// Supabase en Dirección: la app tiene que andar ANTES de que se aplique la migración
// (supabase/migrations/20261015000006_direccion.sql). Lo que lee de las tablas propias
// degrada a "sin datos guardados"; lo que escribe contesta un mensaje amable.

/** Mensaje para quien intenta guardar algo antes de que existan las tablas. */
export const MENSAJE_TABLA_FALTANTE = "Todavía no se puede guardar en Dirección: falta terminar la instalación. Lo que ves en pantalla sigue al día.";

type ErrorSupabase = { code?: string | null; message?: string | null } | null | undefined;

/** ¿El error es "esa tabla no existe"? (Postgres 42P01 o PostgREST PGRST205/PGRST204). */
export function esTablaFaltante(error: ErrorSupabase): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /relation .* does not exist|could not find the table|schema cache/i.test(error.message ?? "");
}

/** ¿La RLS rechazó la escritura? (42501 o el texto de PostgREST). */
export function esSinPermiso(error: ErrorSupabase): boolean {
  if (!error) return false;
  return error.code === "42501" || /row-level security|permission denied/i.test(error.message ?? "");
}
