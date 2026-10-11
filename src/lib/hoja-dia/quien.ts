// De dónde es quien recibe algo de la Hoja del día: una persona de Legajos (`personal`), una
// persona externa del Pañol (`pan_personas_externas`) o el referente de un contratista
// (`hd_contratistas`). Los links, los códigos de Telegram y los mensajes guardan el id en
// la columna que corresponde (persona_id / externa_id / contratista_id: exactamente una).
//
// SOLO SERVER-SIDE (lee con la service role).

import { createAdminClient } from "@/lib/supabase/admin";
import type { DiaHoja } from "./tipos";
import { persona } from "./estado";

export type Origen = {
  tabla: "personal" | "pan_personas_externas" | "hd_contratistas";
  /** La columna en hd_links, hd_telegram_codigos y hd_telegram_mensajes. */
  col: "persona_id" | "externa_id" | "contratista_id";
  /** La columna del celular en su tabla. */
  tel: "telefono" | "celular";
  /** La columna del nombre corto ("Ortega", "Quintana"). */
  nombre: "apellido" | "nombre";
};

export const ORIGENES: readonly Origen[] = [
  { tabla: "personal", col: "persona_id", tel: "telefono", nombre: "apellido" },
  { tabla: "pan_personas_externas", col: "externa_id", tel: "telefono", nombre: "apellido" },
  { tabla: "hd_contratistas", col: "contratista_id", tel: "celular", nombre: "nombre" },
];

/** El origen de alguien que está en el día (sin ir a la base). */
export function origenEnDia(dia: DiaHoja, pid: string): Origen {
  const p = persona(dia, pid);
  return p?.contratista ? ORIGENES[2] : p?.externa ? ORIGENES[1] : ORIGENES[0];
}

/** El origen de un id, buscándolo en las tres tablas (null si no existe). */
export async function origenDe(pid: string): Promise<Origen | null> {
  const adm = createAdminClient();
  const rs = await Promise.all(ORIGENES.map((o) => adm.from(o.tabla).select("id").eq("id", pid).maybeSingle()));
  const i = rs.findIndex((r) => r.data);
  return i >= 0 ? ORIGENES[i] : null;
}

/** El id de quien es dueño de una fila de hd_links / hd_telegram_codigos. */
export const idDeFila = (f: Record<string, unknown>): string => String(f.persona_id ?? f.externa_id ?? f.contratista_id);

/** El origen de una fila de hd_links / hd_telegram_codigos. */
export const origenDeFila = (f: Record<string, unknown>): Origen =>
  f.persona_id ? ORIGENES[0] : f.externa_id ? ORIGENES[1] : ORIGENES[2];

/** El chat de Telegram de alguien (cualquiera de las tres tablas). */
export async function chatDe(pid: string): Promise<number | null> {
  const adm = createAdminClient();
  const rs = await Promise.all(ORIGENES.map((o) => adm.from(o.tabla).select("telegram_chat_id").eq("id", pid).maybeSingle()));
  const v = rs.map((r) => r.data?.telegram_chat_id).find((x) => x != null) ?? null;
  return v == null ? null : Number(v);
}

/** Quién tiene vinculado un chat de Telegram (cualquiera de las tres tablas). */
export async function quienDeChat(chat: number): Promise<{ id: string; origen: Origen; nombre: string } | null> {
  const adm = createAdminClient();
  for (const o of ORIGENES) {
    const r = await adm.from(o.tabla).select(`id, ${o.nombre}`).eq("telegram_chat_id", chat).maybeSingle();
    const fila = r.data as Record<string, unknown> | null;
    if (fila) return { id: String(fila.id), origen: o, nombre: String(fila[o.nombre] ?? "") };
  }
  return null;
}

/** Suelta un chat de Telegram de todos los demás (un chat, una persona). */
export async function soltarChat(chat: number, menos: string): Promise<void> {
  const adm = createAdminClient();
  const v = { telegram_chat_id: null, telegram_usuario: null, telegram_vinculado_at: null };
  await Promise.all(ORIGENES.map((o) => adm.from(o.tabla).update(v).eq("telegram_chat_id", chat).neq("id", menos)));
}
