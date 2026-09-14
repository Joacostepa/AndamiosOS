import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con service role: saltea RLS y administra auth.users.
 *
 * Sólo en el servidor, y sólo detrás de un chequeo explícito de quién llama
 * (ver exigirAdmin en lib/auth/servidor.ts). Es la llave maestra de la base.
 */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
