// Caché de Dirección: el cálculo en vivo de cada pantalla dura 10 minutos y lleva el tag
// "direccion:<pantalla>". "Actualizar ahora" invalida ese tag (y el de La semana), como
// mucho una vez cada 5 minutos por usuario y pantalla. Odoo Online limita la concurrencia:
// esto es lo que evita que siete personas mirando el tablero sean siete lecturas enteras.
//
// Se usa `unstable_cache` y no "use cache": este último exige activar Cache Components en
// todo el proyecto (next.config), un cambio que toca todas las pantallas. Es lo mismo que
// hace el Mapa de obras (src/lib/odoo/mapa-obras.ts).
//
// SÓLO SERVIDOR. Las reglas puras (tags, límite) están en cache-reglas.ts.

import { revalidateTag, unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OdooError, EscrituraProhibidaError } from "./odoo-lectura.ts";
import { esTablaFaltante } from "./supabase.ts";
import { puedeActualizar, tagPantalla, tagsAInvalidar, TTL_PANTALLA_S } from "./cache-reglas.ts";
import type { PantallaId } from "./tipos.ts";

export * from "./cache-reglas.ts";

/** Sube si cambia la forma de los resultados: invalida toda la caché vieja de golpe. */
const VERSION = "direccion-v1";

let sinDataCache = false;

/** ¿El error es "no hay Data Cache de Next acá" (script, test)? Los de Odoo NO lo son. */
function esFueraDeNext(e: unknown): boolean {
  if (e instanceof OdooError || e instanceof EscrituraProhibidaError) return false;
  const msg = e instanceof Error ? e.message : String(e);
  return /incrementalCache|Invariant|workStore|static generation store|outside a request scope/i.test(msg);
}

/**
 * Envuelve una función con la caché de una pantalla. Los argumentos son parte de la clave
 * (pasá hoy y los parámetros como argumentos, no por closure). El resultado tiene que ser
 * JSON serializable. Un error (Odoo caído) no se cachea.
 *
 *   const leer = cachePantalla("cobranzas", "partidas", async (hoy: string) => …);
 */
export function cachePantalla<A extends unknown[], R>(
  pantalla: PantallaId,
  nombre: string,
  fn: (...args: A) => Promise<R>,
  ttlSeg: number = TTL_PANTALLA_S,
): (...args: A) => Promise<R> {
  return cacheConTags(nombre, fn, [tagPantalla(pantalla)], ttlSeg, pantalla);
}

/** Igual, con tags propios (el dólar usa "direccion:dolar"). */
export function cacheConTags<A extends unknown[], R>(
  nombre: string,
  fn: (...args: A) => Promise<R>,
  tags: string[],
  ttlSeg: number = TTL_PANTALLA_S,
  prefijo = "global",
): (...args: A) => Promise<R> {
  const cacheada = unstable_cache(fn, [VERSION, prefijo, nombre], { revalidate: ttlSeg, tags });
  return async (...args: A) => {
    if (sinDataCache) return fn(...args);
    try {
      return await cacheada(...args);
    } catch (e) {
      if (!esFueraDeNext(e)) throw e;
      sinDataCache = true;
      console.warn("[direccion] sin Data Cache de Next: se calcula sin caché.", e instanceof Error ? e.message.slice(0, 120) : e);
      return fn(...args);
    }
  };
}

/** Invalida ya (no stale-while-revalidate) lo que "Actualizar ahora" tiene que releer. */
export function invalidarPantalla(p: PantallaId): void {
  for (const t of tagsAInvalidar(p)) revalidateTag(t, { expire: 0 });
}

// Respaldo del límite cuando direccion_auditoria todavía no existe: por instancia, mejor que nada.
const ultimaEnMemoria = new Map<string, number>();

/**
 * ¿Puede este usuario actualizar esta pantalla ahora? Si puede, lo registra (auditoría) y
 * devuelve ok. `db` es la service role (la ruta ya chequeó la sesión): los usuarios no
 * tienen INSERT en direccion_auditoria. Lee sólo las filas de `userId`.
 */
export async function controlarActualizacion(
  db: SupabaseClient,
  userId: string,
  pantalla: PantallaId,
  ahora: number = Date.now(),
): Promise<ReturnType<typeof puedeActualizar>> {
  const accion = `actualizar:${pantalla}`;
  const clave = `${userId}|${pantalla}`;
  let ultima: number | null = ultimaEnMemoria.get(clave) ?? null;
  let hayTabla = true;

  const { data, error } = await db
    .from("direccion_auditoria")
    .select("created_at")
    .eq("usuario", userId)
    .eq("accion", accion)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (!esTablaFaltante(error)) console.warn("[direccion] límite de actualizar:", error.message);
    hayTabla = false;
  } else if (data?.created_at) {
    ultima = Math.max(ultima ?? 0, new Date(data.created_at as string).getTime());
  }

  const r = puedeActualizar(ultima, ahora);
  if (!r.ok) return r;
  ultimaEnMemoria.set(clave, ahora);
  if (hayTabla) {
    const { error: e2 } = await db.from("direccion_auditoria").insert({ usuario: userId, accion, detalle: {} });
    if (e2 && !esTablaFaltante(e2)) console.warn("[direccion] no se registró la actualización:", e2.message);
  }
  return r;
}
