// La bandeja del pañol, del lado del servidor: lee las filas, les pone nombre a las OTs con
// Odoo y se las pasa a la cuenta pura (bandeja.ts).
//
// La usan dos llamadores con dos clientes distintos, y por eso recibe el `db`:
//   - /api/panol/bandeja, con la sesión del usuario (la RLS del pañol decide qué se lee);
//   - el barrido diario de avisos, con service role (el cron no trae cookies).
//
// ODOO ES UN LUJO ACÁ, NO UNA DEPENDENCIA: sólo aporta la dirección de cada OT. Si no
// contesta en unos segundos, la bandeja sale igual diciendo "OT 4812". Una bandeja que no
// abre porque Odoo está lento es peor que una que dice un número.

import type { SupabaseClient } from "@supabase/supabase-js";
import { read } from "@/lib/odoo/client";
import { armarBandeja, otsReferidas, type Bandeja, type ConteoCrudo, type EntradaBandeja, type FaltanteGranel, type OtResumen, type UltimoMovimiento, type Yo } from "./bandeja";
import { hoyBA } from "./estado";
import type { Articulo, ClaveParametro, Saldo, TipoMovimiento, Ubicacion, Unidad, Variante } from "./tipos";

type M2O = [number, string] | false;

/** Nombre, dirección y cliente de cada OT. Nunca tira: lo que no se pudo leer queda sin nombre. */
export async function resolverOts(ids: number[]): Promise<Record<number, OtResumen>> {
  if (ids.length === 0) return {};
  const salida: Record<number, OtResumen> = {};
  try {
    const ots = await read<{ id: number; x_name: string | false; x_direccion_obra: string | false; x_obra_id: M2O }>(
      "x_aba_orden_trabajo", ids, ["x_name", "x_direccion_obra", "x_obra_id"],
    );
    const obras = [...new Set(ots.map((o) => (Array.isArray(o.x_obra_id) ? o.x_obra_id[0] : null)).filter((x): x is number => !!x))];
    const clienteDeObra = new Map<number, string>();
    if (obras.length) {
      const filas = await read<{ id: number; x_cliente_id: M2O }>("x_aba_obra", obras, ["x_cliente_id"]).catch(() => []);
      for (const f of filas) if (Array.isArray(f.x_cliente_id)) clienteDeObra.set(f.id, f.x_cliente_id[1]);
    }
    for (const o of ots) {
      salida[o.id] = {
        id: o.id,
        nombre: o.x_name || null,
        direccion: o.x_direccion_obra || null,
        cliente: Array.isArray(o.x_obra_id) ? clienteDeObra.get(o.x_obra_id[0]) ?? null : null,
      };
    }
  } catch (e) {
    console.error("[panol] no se pudieron leer las OTs de Odoo para la bandeja", e instanceof Error ? e.message : e);
  }
  return salida;
}

/** Con un tope: la bandeja no espera a Odoo más de lo que espera la gente. */
function conTope<T>(p: Promise<T>, ms: number, siNo: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(siNo), ms))]);
}

function falla(r: { error: { message: string } | null }, que: string) {
  if (r.error) throw new Error(`No se pudo leer ${que}: ${r.error.message}`);
}

/**
 * Quién mira: su legajo (para "lo contaste vos") y si está a cargo del pañol. Desde el
 * barrido no hay nadie mirando y no hace falta.
 */
export async function yoEnElPanol(db: SupabaseClient, userId: string | null): Promise<Yo> {
  if (!userId) return { userId: null, personaId: null, esEncargado: false };
  const [perfil, legajo] = await Promise.all([
    db.from("user_profiles").select("rol, activo, permisos").eq("id", userId).maybeSingle(),
    db.from("personal").select("id").eq("user_id", userId).maybeSingle(),
  ]);
  const p = perfil.data as { rol: string; activo: boolean; permisos: Record<string, string> | null } | null;
  const esEncargado = !!p?.activo && (p.rol === "admin" || p.permisos?.panol === "editar");
  return { userId, personaId: (legajo.data?.id as string | undefined) ?? null, esEncargado };
}

/** La medianoche de ayer en Buenos Aires (UTC−3 todo el año: sin horario de verano desde 2009). */
function inicioDeAyer(ahora: Date): string {
  const hoy = hoyBA(ahora);
  const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return `${ayer}T00:00:00-03:00`;
}

export async function leerBandeja(db: SupabaseClient, yo: Yo, opciones: { conNombresDeOt?: boolean } = {}): Promise<Bandeja> {
  const ahora = new Date();
  const [ub, ar, va, un, sa, pa, co, sinAlta, vales, falt, pe, ex, cu] = await Promise.all([
    db.from("pan_ubicaciones").select("*"),
    db.from("pan_articulos").select("*"),
    db.from("pan_variantes").select("*"),
    db.from("pan_unidades").select("*").eq("activo", true),
    db.from("pan_saldos").select("articulo_id, variante_id, lugar, cantidad").neq("cantidad", 0),
    db.from("pan_parametros").select("clave, valor"),
    db.from("pan_conteos").select("id, ubicacion_id, contado_por_tipo, contado_por_id, registrado_por, umbral_pct, cerrado_at").eq("estado", "por_aprobar").order("cerrado_at"),
    db.from("pan_sin_alta").select("id, descripcion, cantidad, foto_path, quien_tipo, quien_id, odoo_ot_id, created_at").is("resuelto_at", null).order("created_at", { ascending: false }),
    db.from("pan_vales").select("id, created_at").eq("sin_encargado", true).is("deshecho_at", null).gte("created_at", inicioDeAyer(ahora)),
    db.from("pan_movimientos").select("id, articulo_id, variante_id, cantidad, desde, capataz_id, created_at").eq("tipo", "faltante").is("unidad_id", null)
      .order("created_at", { ascending: false }).limit(500),
    db.from("personal").select("id, nombre, apellido, telefono, activo, user_id"),
    db.from("pan_personas_externas").select("id, nombre, apellido, telefono, activo"),
    db.from("cuadrillas").select("id, nombre, activo, responsable_id"),
  ]);
  falla(ub, "las ubicaciones"); falla(ar, "los artículos"); falla(va, "los talles"); falla(un, "las herramientas");
  falla(sa, "los saldos"); falla(pa, "los parámetros"); falla(co, "los conteos"); falla(sinAlta, "los artículos sin alta");
  falla(vales, "los vales"); falla(falt, "los faltantes"); falla(pe, "Legajos"); falla(ex, "las personas externas"); falla(cu, "las cuadrillas");

  const unidades = (un.data ?? []) as Unidad[];
  const conteos = (co.data ?? []) as Omit<ConteoCrudo, "items">[];
  const valesIds = (vales.data ?? []).map((v) => v.id as string);
  const conUltimo = unidades.filter((u) => u.estado === "en_revision" || u.estado === "en_mantenimiento").map((u) => u.id);

  // Segunda vuelta: lo que depende de la primera (ítems de los conteos, movimientos de los
  // vales, por qué está cada herramienta en revisión).
  const [items, movs, ult] = await Promise.all([
    conteos.length
      ? db.from("pan_conteo_items").select("conteo_id, articulo_id, variante_id, unidad_id, contado, esperado, encontrado_extra").in("conteo_id", conteos.map((c) => c.id))
      : Promise.resolve({ data: [], error: null }),
    valesIds.length
      ? db.from("pan_movimientos").select("vale_id, tipo").in("vale_id", valesIds)
      : Promise.resolve({ data: [], error: null }),
    conUltimo.length
      ? db.from("pan_movimientos").select("unidad_id, tipo, desde, estado_vuelta, motivo, quien_tipo, quien_id, odoo_ot_id, created_at")
          .in("unidad_id", conUltimo).neq("tipo", "anulacion").order("created_at", { ascending: false }).limit(conUltimo.length * 5)
      : Promise.resolve({ data: [], error: null }),
  ]);
  falla(items, "los ítems de los conteos"); falla(movs, "los movimientos sin encargado"); falla(ult, "los últimos movimientos");

  const ultimos: Record<string, UltimoMovimiento> = {};
  for (const m of (ult.data ?? []) as (UltimoMovimiento & { unidad_id: string })[]) {
    if (!ultimos[m.unidad_id]) ultimos[m.unidad_id] = m;
  }
  const tiposDeVale = new Map<string, TipoMovimiento[]>();
  for (const m of (movs.data ?? []) as { vale_id: string; tipo: TipoMovimiento }[]) {
    tiposDeVale.set(m.vale_id, [...(tiposDeVale.get(m.vale_id) ?? []), m.tipo]);
  }
  const itemsDe = new Map<string, ConteoCrudo["items"]>();
  for (const it of (items.data ?? []) as (ConteoCrudo["items"][number] & { conteo_id: string })[]) {
    itemsDe.set(it.conteo_id, [...(itemsDe.get(it.conteo_id) ?? []), {
      ...it, contado: it.contado === null ? null : Number(it.contado), esperado: it.esperado === null ? null : Number(it.esperado),
    }]);
  }

  const entrada: EntradaBandeja = {
    ahora: ahora.toISOString(),
    parametros: Object.fromEntries((pa.data ?? []).map((p) => [p.clave, Number(p.valor)])) as Partial<Record<ClaveParametro, number>>,
    ubicaciones: (ub.data ?? []) as Ubicacion[],
    articulos: (ar.data ?? []) as Articulo[],
    variantes: (va.data ?? []) as Variante[],
    unidades,
    saldos: ((sa.data ?? []) as Saldo[]).map((s) => ({ ...s, cantidad: Number(s.cantidad) })),
    conteos: conteos.map((c) => ({ ...c, items: itemsDe.get(c.id) ?? [] })),
    sinAlta: (sinAlta.data ?? []) as EntradaBandeja["sinAlta"],
    valesSinEncargado: (vales.data ?? []).map((v) => ({ id: v.id as string, created_at: v.created_at as string, movimientos: tiposDeVale.get(v.id as string) ?? [] })),
    faltantesGranel: ((falt.data ?? []) as FaltanteGranel[]).map((f) => ({ ...f, cantidad: Number(f.cantidad) })),
    ultimos,
    personas: [
      ...(pe.data ?? []).map((p) => ({ tipo: "persona" as const, id: p.id as string, nombre: `${p.nombre} ${p.apellido}`.trim(), telefono: p.telefono ?? null, activo: !!p.activo, userId: p.user_id ?? null })),
      ...(ex.data ?? []).map((p) => ({ tipo: "externa" as const, id: p.id as string, nombre: `${p.nombre} ${p.apellido}`.trim(), telefono: p.telefono ?? null, activo: !!p.activo, userId: null })),
    ],
    cuadrillas: (cu.data ?? []).map((c) => ({ id: c.id as string, nombre: c.nombre as string, activo: !!c.activo, responsableId: c.responsable_id ?? null })),
    ots: {},
    yo,
  };
  if (opciones.conNombresDeOt !== false) {
    entrada.ots = await conTope(resolverOts(otsReferidas(entrada)), 6000, {});
  }
  return armarBandeja(entrada);
}
