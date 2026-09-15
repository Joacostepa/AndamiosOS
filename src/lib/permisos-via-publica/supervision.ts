import type { SupabaseClient } from "@supabase/supabase-js";

// Modo supervisado (JS, 2026-09-15): durante las primeras semanas con clientes reales nada sale
// solo hacia afuera ni avanza sin una persona. Cada paso es un interruptor en la bandeja; en
// "false" el paso espera un botón y la app avisa a quien gestiona el trámite.

export type Supervision = {
  /** true: "Iniciar trámite" le manda el link al cliente. false: se lo manda al vendedor para que se lo pase. */
  linkAlCliente: boolean;
  /** true: el pedido de endoso a Segucom sale solo cuando el cliente carga el dueño del lote. */
  endosoAutomatico: boolean;
  /** true: la encomienda del CPAU se pide sola con el legajo completo. */
  encomiendaAutomatica: boolean;
  /** true: la presentación en TAD se pide sola cuando el trámite está listo. */
  presentacionAutomatica: boolean;
};

/** Todo manual: lo que rige si la fila no existe o no se puede leer. */
export const SUPERVISION_INICIAL: Supervision = {
  linkAlCliente: false,
  endosoAutomatico: false,
  encomiendaAutomatica: false,
  presentacionAutomatica: false,
};

const CLAVES: Record<keyof Supervision, string> = {
  linkAlCliente: "link_al_cliente",
  endosoAutomatico: "endoso_automatico",
  encomiendaAutomatica: "encomienda_automatica",
  presentacionAutomatica: "presentacion_automatica",
};

export async function leerSupervision(db: SupabaseClient): Promise<Supervision> {
  const { data } = await db.from("pvp_config").select("valores").eq("id", "supervision").maybeSingle();
  const v = (data?.valores ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    (Object.keys(CLAVES) as (keyof Supervision)[]).map((k) => [k, v[CLAVES[k]] === true]),
  ) as Supervision;
}

export async function guardarSupervision(db: SupabaseClient, cambios: Partial<Supervision>, userId: string | null): Promise<Supervision> {
  const actual = await leerSupervision(db);
  const nueva = { ...actual, ...cambios };
  const valores = Object.fromEntries((Object.keys(CLAVES) as (keyof Supervision)[]).map((k) => [CLAVES[k], nueva[k]]));
  const { error } = await db.from("pvp_config").upsert({ id: "supervision", valores, updated_at: new Date().toISOString(), updated_by: userId });
  if (error) throw new Error(error.message);
  return nueva;
}
