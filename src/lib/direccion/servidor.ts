// Punto de entrada del SERVIDOR de Dirección: obtener una pantalla (en vivo, cacheada, con
// respaldo en el snapshot), el dólar, y el cálculo sin caché para el cron.
//
//   const r = await obtenerPantalla("caja", { conSocios });   // server component o API
//   if (!r.ok) → <EstadoVacio> con r.motivo
//   r.lectura.odooCaido → <BandaOdooCaido>
//
// Lo reservado se recorta acá, por usuario, DESPUÉS de la caché compartida.

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { CALCULADORES } from "./calculo/index.ts";
import type { CtxCalculo } from "./calculo/contrato.ts";
import { cacheConTags, cachePantalla, claveParams, TAG_DOLAR } from "./cache.ts";
import { leerSerieDolar, tcHoy, type SerieDolar } from "./dolar.ts";
import { diaBA, hoyBA, horaBA } from "./formato.ts";
import { EscrituraProhibidaError, motivoPublico, OdooError } from "./odoo-lectura.ts";
import { filtrarReservado } from "./reservado.ts";
import { accionesQueInvalidan, inicioDiaBA, ultimoSnapshot } from "./snapshot.ts";
import { esTablaFaltante } from "./supabase.ts";
import { PANTALLAS_IDS, type PantallaId, type RespuestaPantalla, type ResultadoPantalla, type TcDia } from "./tipos.ts";

// ─── Dólar ─────────────────────────────────────────────────────────────────────────────

const serieCacheada = cacheConTags("serie-dolar", (hoy: string) => leerSerieDolar(hoy), [TAG_DOLAR]);

/** La serie del dólar de Odoo (cacheada 10 min, tag "direccion:dolar"). Tira si Odoo no responde. */
export function obtenerSerieDolar(): Promise<SerieDolar> {
  return serieCacheada(hoyBA());
}

/** El dólar de hoy para el encabezado. null si Odoo no responde o no hay cotización. */
export async function obtenerDolarHoy(): Promise<TcDia | null> {
  try {
    return tcHoy(await obtenerSerieDolar(), hoyBA());
  } catch {
    return null;
  }
}

// ─── Pantallas ─────────────────────────────────────────────────────────────────────────

/** El contexto de un cálculo. Lo comparten calculadores y nodos de desglose. */
export async function contextoCalculo(hoy: string, params: Record<string, string>): Promise<CtxCalculo> {
  const dolar = await obtenerSerieDolar();
  return {
    hoy,
    ahora: new Date().toISOString(),
    params,
    dolar,
    tc: tcHoy(dolar, hoy),
    pantalla: (p, otros = {}) => resultadoCrudo(p, otros) as never,
    supabase: createAdminClient,
  };
}

/**
 * El snapshot de HOY de una pantalla (lo guarda el cron de las 04:30), si sigue vigente: nadie
 * pidió "Actualizar ahora" después (de esa pantalla o de una que la invalida). Así la primera
 * lectura del día no va a Odoo. Sin la tabla (migración sin aplicar) o con un error, null: se
 * calcula en vivo. Lee con la service role (sin recortar): el recorte va después, por usuario.
 */
async function snapshotVigente(p: PantallaId, hoy: string): Promise<ResultadoPantalla | null> {
  try {
    const db = createAdminClient();
    const snap = await ultimoSnapshot(db, p, inicioDiaBA(hoy));
    if (!snap || snap.pantalla !== p || !Array.isArray(snap.cifras) || !snap.lectura?.tomadoAt) return null;
    if (diaBA(snap.lectura.tomadoAt) !== hoy) return null;
    const acciones = accionesQueInvalidan(p);
    let q = db.from("direccion_auditoria").select("created_at").gt("created_at", snap.lectura.tomadoAt);
    q = acciones === "todas" ? q.like("accion", "actualizar:%") : q.in("accion", acciones);
    const { data, error } = await q.limit(1);
    if (error) return esTablaFaltante(error) ? snap : null; // ante la duda, en vivo
    if (data && data.length) return null; // alguien actualizó después del snapshot
    return { ...snap, lectura: { tomadoAt: snap.lectura.tomadoAt, fuente: "snapshot" } };
  } catch (e) {
    console.warn(`[direccion] snapshot de hoy (${p}):`, e instanceof Error ? e.message : e);
    return null;
  }
}

async function calcular(p: PantallaId, hoy: string, clave: string, opts: { vivo?: boolean } = {}): Promise<ResultadoPantalla> {
  // El snapshot del día sirve para la vista por defecto (no guarda cada período de Ventas).
  if (!opts.vivo && !clave) {
    const snap = await snapshotVigente(p, hoy);
    if (snap) return snap;
  }
  const params = Object.fromEntries(new URLSearchParams(clave));
  const ctx = await contextoCalculo(hoy, params);
  const salida = await CALCULADORES[p].calcular(ctx);
  return { ...salida, pantalla: p, tc: ctx.tc, lectura: { tomadoAt: new Date().toISOString(), fuente: "vivo" } };
}

const cacheadas = Object.fromEntries(
  PANTALLAS_IDS.map((p) => [p, cachePantalla(p, "pantalla", (hoy: string, clave: string) => calcular(p, hoy, clave))]),
) as Record<PantallaId, (hoy: string, clave: string) => Promise<ResultadoPantalla>>;

/** Resultado cacheado y SIN recortar. Sólo para calculadores/nodos (ctx.pantalla). */
export function resultadoCrudo(p: PantallaId, params: Record<string, string> = {}): Promise<ResultadoPantalla> {
  return cacheadas[p](hoyBA(), claveParams(params));
}

/** Calcula sin caché y en vivo desde Odoo, sin mirar el snapshot (el cron). */
export function calcularSinCache(p: PantallaId, params: Record<string, string> = {}): Promise<ResultadoPantalla> {
  return calcular(p, hoyBA(), claveParams(params), { vivo: true });
}

/** Lo que ve quien mira cuando Odoo no responde: nunca el error crudo (URL, error interno). */
function mensajeOdoo(e: unknown): string {
  return e instanceof OdooError ? motivoPublico(e) : "Error inesperado al calcular.";
}

/**
 * Una pantalla para quien mira: en vivo (cacheada); si Odoo no responde, el último snapshot
 * con la banda; si tampoco hay snapshot, el estado vacío. Recorta lo reservado.
 * La pantalla "socios" sin `conSocios` no se calcula ni se lee: tira.
 */
export async function obtenerPantalla<D = unknown>(
  p: PantallaId,
  opts: { conSocios: boolean; params?: Record<string, string> },
): Promise<RespuestaPantalla<D>> {
  if (p === "socios" && !opts.conSocios) throw new Error("Dirección: la pantalla Socios exige direccion-socios.");
  const params = opts.params ?? {};
  try {
    const r = await resultadoCrudo(p, params);
    return { ok: true, ...(filtrarReservado(r, opts.conSocios) as ResultadoPantalla<D>) };
  } catch (e) {
    if (e instanceof EscrituraProhibidaError) throw e; // un bug, no una caída de Odoo
    console.error(`[direccion] ${p}:`, e instanceof Error ? e.message : e);
    const hora = horaBA(new Date());
    // El respaldo sólo sirve para la vista por defecto (el snapshot no guarda cada período).
    const snap = Object.keys(params).length === 0 ? await ultimoSnapshot(await createClient(), p) : null;
    if (snap) {
      const conBanda: ResultadoPantalla = { ...snap, lectura: { ...snap.lectura, fuente: "snapshot", odooCaido: { hora, mensaje: mensajeOdoo(e) } } };
      return { ok: true, ...(filtrarReservado(conBanda, opts.conSocios) as ResultadoPantalla<D>) };
    }
    return { ok: false, pantalla: p, motivo: "Todavía no hay datos. Odoo no respondió.", hora };
  }
}
