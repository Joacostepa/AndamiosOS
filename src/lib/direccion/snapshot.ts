// Snapshot de Dirección en Supabase (tabla direccion_snapshots). Es una OPTIMIZACIÓN: la
// app calcula en vivo; el snapshot sirve para
//  1. mostrar algo cuando Odoo no responde (último resultado de cada pantalla, kpi_id '*');
//  2. la historia de cada cifra, para comparar ("vs lunes anterior", "vs semana pasada").
// Si la tabla no existe todavía, todo esto devuelve null / [] sin romper nada.
//
// Lo escribe sólo el cron (/api/cron/direccion) con la service role. SÓLO SERVIDOR.

import type { SupabaseClient } from "@supabase/supabase-js";
import { esTablaFaltante } from "./supabase.ts";
import { esDeSocios, filtrarReservado } from "./reservado.ts";
import { DEF } from "./diccionario.ts";
import type { Cifra, PantallaId, ResultadoPantalla } from "./tipos.ts";

const TABLA = "direccion_snapshots";

/** El comienzo del día en Buenos Aires (UTC−3, sin horario de verano), en ISO. */
export const inicioDiaBA = (dia: string): string => `${dia}T00:00:00-03:00`;

/**
 * Qué "Actualizar ahora" (direccion_auditoria, accion "actualizar:<p>") deja viejo el snapshot
 * de una pantalla: el de ella y el de La semana (que invalida todo). El de La semana lo deja
 * viejo cualquiera (La semana se arma con todas). Igual que tagsAInvalidar (cache-reglas.ts).
 */
export function accionesQueInvalidan(p: PantallaId): string[] | "todas" {
  return p === "semana" ? "todas" : [`actualizar:${p}`, "actualizar:semana"];
}

type FilaSnapshot = {
  tomado_at: string;
  pantalla: PantallaId;
  kpi_id: string;
  periodo: string | null;
  valor_ars: number | null;
  valor_usd: number | null;
  detalle: unknown;
  confianza: "ok" | "ver" | "inc" | null;
  reservado: boolean;
};

/**
 * Las filas de un resultado: una '*' con todo y una por cifra. Pura (la usa el test).
 *
 * Si el resultado trae algo reservado a socios (retiros en La semana, `detalle.reservado` en
 * Caja, …) la fila '*' completa va `reservado` y se agrega otra '*' ya recortada para el
 * resto: la RLS deja leer cada fila según el permiso, así nadie sin direccion-socios puede
 * leer retiros consultando la tabla directo.
 */
export function filasDeSnapshot(r: ResultadoPantalla, periodo: string | null = null): FilaSnapshot[] {
  const reservadaPantalla = r.pantalla === "socios";
  const fila = (detalle: unknown, reservado: boolean): FilaSnapshot => ({
    tomado_at: r.lectura.tomadoAt, pantalla: r.pantalla, kpi_id: "*", periodo, valor_ars: null, valor_usd: null, detalle, confianza: null, reservado,
  });
  const publico = reservadaPantalla ? null : filtrarReservado(r, false);
  const tieneReservado = !!publico && JSON.stringify(publico) !== JSON.stringify(r);
  const filas: FilaSnapshot[] = tieneReservado ? [fila(r, true), fila(publico, false)] : [fila(r, reservadaPantalla)];
  for (const c of r.cifras) {
    const m = c.valor.tipo === "monto" ? c.valor.monto : null;
    filas.push({
      tomado_at: r.lectura.tomadoAt,
      pantalla: r.pantalla,
      kpi_id: c.id ?? c.kpi,
      periodo,
      valor_ars: m ? m.ars : null,
      valor_usd: m ? (m.usd ?? (r.tc ? m.ars / r.tc.valor : null)) : null,
      detalle: c,
      confianza: c.confianza.nivel,
      // La misma regla que el recorte en pantalla (reservado.ts): marca, variante de socios o
      // indicador reservado en el diccionario (una cifra de retiros sin la marca igual se cierra).
      reservado: reservadaPantalla || esDeSocios(c) || !!DEF[c.kpi]?.reservado,
    });
  }
  return filas;
}

export async function guardarSnapshot(db: SupabaseClient, r: ResultadoPantalla): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const { error } = await db.from(TABLA).insert(filasDeSnapshot(r));
  if (!error) return { ok: true };
  return { ok: false, motivo: esTablaFaltante(error) ? "Falta la tabla direccion_snapshots (migración sin aplicar)." : error.message };
}

/**
 * El último resultado guardado de una pantalla (para cuando Odoo no responde, y el de hoy
 * para no releer Odoo). De dos filas '*' del mismo instante gana la completa (reservada), que
 * sólo ve quien puede (RLS) o la service role. `desde`: sólo si se tomó a partir de ese instante.
 */
export async function ultimoSnapshot(db: SupabaseClient, pantalla: PantallaId, desde?: string): Promise<ResultadoPantalla | null> {
  let q = db.from(TABLA).select("detalle, tomado_at").eq("pantalla", pantalla).eq("kpi_id", "*");
  if (desde) q = q.gte("tomado_at", desde);
  const { data, error } = await q
    .order("tomado_at", { ascending: false })
    .order("reservado", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (!esTablaFaltante(error)) console.warn("[direccion] snapshot:", error.message);
    return null;
  }
  return (data?.detalle as ResultadoPantalla | undefined) ?? null;
}

/**
 * La historia de una cifra (id o kpi) entre dos instantes, de la más nueva a la más vieja.
 * Para "vs lunes anterior": historiaCifra(db, "caja_disponible", { hasta: "<lunes> 23:59" }).
 */
export async function historiaCifra(
  db: SupabaseClient,
  id: string,
  rango: { desde?: string; hasta?: string; limite?: number } = {},
): Promise<{ tomadoAt: string; cifra: Cifra }[]> {
  let q = db.from(TABLA).select("tomado_at, detalle").eq("kpi_id", id);
  if (rango.desde) q = q.gte("tomado_at", rango.desde);
  if (rango.hasta) q = q.lte("tomado_at", rango.hasta);
  const { data, error } = await q.order("tomado_at", { ascending: false }).limit(rango.limite ?? 60);
  if (error) {
    if (!esTablaFaltante(error)) console.warn("[direccion] historia:", error.message);
    return [];
  }
  return (data ?? []).map((f) => ({ tomadoAt: f.tomado_at as string, cifra: f.detalle as Cifra }));
}
