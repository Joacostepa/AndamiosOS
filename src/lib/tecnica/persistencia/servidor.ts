/**
 * Persistencia del modelador del lado del servidor (route handlers de /api/tecnica/modelador/**).
 * Todo va con la SESIÓN del usuario: la RLS (tec_puede_ver / tec_puede_editar / computos_puede_editar)
 * es la que decide. Nada de service role acá.
 *
 * Regla de oro (riesgo «BOM trucha»): el cómputo SIEMPRE se recalcula acá, con `construir`, desde el
 * diseño guardado y el catálogo de la base. Lo que mande el navegador no se escribe en computo_items.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { construir, ESQUEMA_DISENO, migrarDiseno, VERSION_MOTOR, type Catalogo, type Diseno, type Resultado } from '../modelo/index.ts';
import { catalogoDesdeFilas, type AvisoCatalogo, type FilaKit, type FilaMapa, type FilaPieza, type FilaStock } from './catalogo.ts';
import { computoBloqueado, diferenciasComputo, lineasParaComputo, metricasDe, totalesDiff } from './computo.ts';
import type { ItemComputoActual, ModeloFila, ModeloLista, ObraRef, OrigenItem, PreviaComputo, ResumenModelo } from './tipos.ts';

type Db = SupabaseClient;

export const BUCKET_MODELOS = 'tec-modelos';
export const rutaPortada = (id: string) => `${id}/portada.png`;

/** Error con status HTTP: lo traducen las rutas. */
export class ErrorModelador extends Error {
  status: number;
  extra?: Record<string, unknown>;
  constructor(mensaje: string, status: number, extra?: Record<string, unknown>) {
    super(mensaje);
    this.status = status;
    this.extra = extra;
  }
}

/** Un error de PostgREST/RPC en palabras y con su status. */
export function traducirErrorDb(e: { code?: string; message?: string } | null | undefined, porDefecto = 'No se pudo guardar.'): ErrorModelador {
  const code = e?.code ?? '';
  const msg = e?.message || porDefecto;
  if (code === '42501') return new ErrorModelador(msg.includes('permiso') ? msg : 'No tenés permiso para hacer esto.', 403);
  if (code === '40001') return new ErrorModelador(msg, 409);
  if (code === '55000') return new ErrorModelador(msg, 423);
  if (code === 'P0002' || code === 'PGRST116') return new ErrorModelador(code === 'PGRST116' ? 'No encuentro el modelo.' : msg, 404);
  if (code === '22023' || code === '23514' || code === '23503' || code === '22P02') return new ErrorModelador(code === '23514' ? 'Hay un dato que no se puede guardar así (revisá nombre, tamaño o plantilla con obra).' : msg, 400);
  if (code === '42P01' || code === '42883' || code === 'PGRST202' || code === 'PGRST205') {
    return new ErrorModelador('Falta aplicar la migración del modelador en la base (20261015000001…3).', 503);
  }
  return new ErrorModelador(msg, 500);
}

// ---------------------------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------------------------

async function todas<T>(q: () => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>): Promise<T[]> {
  const { data, error } = await q();
  if (error) throw traducirErrorDb(error, 'No se pudo leer el catálogo.');
  return (data as T[]) ?? [];
}

/** Catálogo real: catalogo_piezas + stock + tec_pieza_mapa + tec_kits (4 queries en paralelo). */
export async function cargarCatalogo(db: Db): Promise<{ catalogo: Catalogo; avisos: AvisoCatalogo[] }> {
  const [piezas, stock, mapa, kits] = await Promise.all([
    todas<FilaPieza>(() => db.from('catalogo_piezas').select('id, codigo, descripcion, categoria, sistema_andamio, peso_kg, unidad_medida, activo').range(0, 9999)),
    todas<FilaStock>(() => db.from('stock').select('pieza_id, en_deposito, comprometido').range(0, 9999)),
    todas<FilaMapa>(() => db.from('tec_pieza_mapa').select('familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, activo').range(0, 9999)),
    todas<FilaKit>(() => db.from('tec_kits').select('kit_codigo, pieza_codigo, cantidad').range(0, 9999)),
  ]);
  return catalogoDesdeFilas({ piezas, stock, mapa, kits });
}

export function construirEnServidor(diseno: Diseno, catalogo: Catalogo): Resultado {
  return construir(migrarDiseno(diseno), catalogo);
}

// ---------------------------------------------------------------------------------------------
// Modelos
// ---------------------------------------------------------------------------------------------

export const SELECT_LISTA =
  'id, nombre, descripcion, obra_id, cotizacion_ref, es_plantilla, plantilla_categoria, revision, resumen, imagen_path, updated_at, created_at, obra:obras(id, codigo, nombre), autor:user_profiles!created_by(nombre, apellido)';
export const SELECT_MODELO = `${SELECT_LISTA}, diseno, esquema, motor_version, archivado_at`;

type FilaCruda = Record<string, unknown> & {
  id: string;
  obra?: ObraRef | ObraRef[] | null;
  autor?: { nombre: string; apellido: string } | { nombre: string; apellido: string }[] | null;
};

const uno = <T>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

export function aLista(f: FilaCruda, imagenUrl: string | null = null): ModeloLista {
  const autor = uno(f.autor);
  return {
    id: f.id,
    nombre: f.nombre as string,
    descripcion: (f.descripcion as string | null) ?? null,
    obra_id: (f.obra_id as string | null) ?? null,
    obra: uno(f.obra),
    cotizacion_ref: (f.cotizacion_ref as string | null) ?? null,
    es_plantilla: f.es_plantilla === true,
    plantilla_categoria: (f.plantilla_categoria as string | null) ?? null,
    revision: f.revision as number,
    resumen: (f.resumen as ResumenModelo | null) ?? null,
    imagen_path: (f.imagen_path as string | null) ?? null,
    imagen_url: imagenUrl,
    updated_at: f.updated_at as string,
    created_at: f.created_at as string,
    autor: autor ? `${autor.nombre} ${autor.apellido}`.trim() : null,
  };
}

/** Pone en el diseño la obra de la columna obra_id (la columna manda; el diseño solo la muestra). */
export function conObra(diseno: Diseno, obra: ObraRef | null): Diseno {
  return { ...diseno, obra: obra ? { id: obra.id, codigo: obra.codigo, nombre: obra.nombre } : null };
}

export async function leerFilaModelo(db: Db, id: string): Promise<FilaCruda> {
  const { data, error } = await db.from('tec_modelos').select(SELECT_MODELO).eq('id', id).is('archivado_at', null).maybeSingle();
  if (error) throw traducirErrorDb(error, 'No se pudo leer el modelo.');
  if (!data) throw new ErrorModelador('No encuentro el modelo (o está archivado).', 404);
  return data as unknown as FilaCruda;
}

export async function leerModelo(db: Db, id: string): Promise<ModeloFila> {
  const f = await leerFilaModelo(db, id);
  const [url, computo] = await Promise.all([
    firmar(db, (f.imagen_path as string | null) ?? null),
    db.from('computos').select('id, estado, modelo_revision').eq('modelo_id', id).order('version', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const base = aLista(f, url);
  const c = computo.data as { id: string; estado: string; modelo_revision: number | null } | null;
  return {
    ...base,
    diseno: conObra(migrarDiseno(f.diseno), base.obra),
    esquema: f.esquema as number,
    motor_version: f.motor_version as string,
    computo: c ? { id: c.id, estado: c.estado, modelo_revision: c.modelo_revision, desactualizado: c.modelo_revision !== base.revision } : null,
  };
}

export async function leerObra(db: Db, obraId: string): Promise<ObraRef> {
  const { data, error } = await db.from('obras').select('id, codigo, nombre').eq('id', obraId).maybeSingle();
  if (error) throw traducirErrorDb(error, 'No se pudo leer la obra.');
  if (!data) throw new ErrorModelador('No encuentro la obra.', 404);
  return data as ObraRef;
}

/** Columnas comunes de un INSERT de modelo. */
export function filaNueva(diseno: Diseno, extra: { nombre: string; descripcion?: string | null; obra_id?: string | null; cotizacion_ref?: string | null; es_plantilla?: boolean; plantilla_categoria?: string | null; resumen?: unknown }) {
  return {
    nombre: extra.nombre.slice(0, 120),
    descripcion: extra.descripcion ?? null,
    obra_id: extra.es_plantilla ? null : extra.obra_id ?? null,
    cotizacion_ref: extra.cotizacion_ref ?? null,
    es_plantilla: extra.es_plantilla ?? false,
    plantilla_categoria: extra.es_plantilla ? extra.plantilla_categoria ?? null : null,
    diseno: { ...diseno, nombre: extra.nombre.slice(0, 120) },
    esquema: diseno.esquema ?? ESQUEMA_DISENO,
    motor_version: VERSION_MOTOR,
    resumen: extra.resumen ?? null,
  };
}

// ---------------------------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------------------------

export async function firmar(db: Db, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await db.storage.from(BUCKET_MODELOS).createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

export async function firmarVarias(db: Db, paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!paths.length) return out;
  const { data } = await db.storage.from(BUCKET_MODELOS).createSignedUrls(paths, 600);
  for (const x of data ?? []) if (x.path && x.signedUrl) out.set(x.path, x.signedUrl);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Cómputo
// ---------------------------------------------------------------------------------------------

export interface ContextoComputo {
  modelo: FilaCruda;
  diseno: Diseno;
  resultado: Resultado;
  computo: { id: string; estado: string; modelo_id: string | null } | null;
  actuales: ItemComputoActual[];
}

/** Carga todo lo que hace falta para comparar o generar, y RECALCULA el modelo en el servidor. */
export async function contextoComputo(db: Db, modeloId: string, obraId: string, revision: number): Promise<ContextoComputo> {
  const modelo = await leerFilaModelo(db, modeloId);
  if (modelo.es_plantilla === true) throw new ErrorModelador('Una plantilla no genera cómputo: creá un modelo desde la plantilla.', 400);
  if ((modelo.revision as number) !== revision) {
    throw new ErrorModelador('El modelo cambió desde que lo abriste: guardá y volvé a generar.', 409, { revisionActual: modelo.revision });
  }
  if (modelo.obra_id && modelo.obra_id !== obraId) throw new ErrorModelador('El modelo está vinculado a otra obra.', 400);
  await leerObra(db, obraId);

  const [{ catalogo }, comp] = await Promise.all([
    cargarCatalogo(db),
    db.from('computos').select('id, estado, modelo_id').eq('obra_id', obraId).order('version', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (comp.error) throw traducirErrorDb(comp.error, 'No se pudo leer el cómputo de la obra.');
  const computo = (comp.data as ContextoComputo['computo']) ?? null;

  let actuales: ItemComputoActual[] = [];
  if (computo) {
    const { data, error } = await db.from('computo_items').select('pieza_id, cantidad_requerida, origen, modelo_cantidad, catalogo_piezas(codigo, descripcion)').eq('computo_id', computo.id);
    if (error) throw traducirErrorDb(error, 'No se pudieron leer los ítems del cómputo.');
    actuales = ((data ?? []) as unknown as { pieza_id: string; cantidad_requerida: number; origen: OrigenItem | null; modelo_cantidad: number | null; catalogo_piezas: { codigo: string; descripcion: string } | { codigo: string; descripcion: string }[] | null }[]).map((r) => {
      const cp = uno(r.catalogo_piezas);
      return { pieza_id: r.pieza_id, cantidad_requerida: r.cantidad_requerida, origen: r.origen ?? 'manual', modelo_cantidad: r.modelo_cantidad, codigo: cp?.codigo ?? null, descripcion: cp?.descripcion ?? null };
    });
  }

  const diseno = migrarDiseno(modelo.diseno);
  const resultado = construirEnServidor(diseno, catalogo);
  return { modelo, diseno, resultado, computo, actuales };
}

export function previaDesde(ctx: ContextoComputo, modeloId: string): PreviaComputo {
  const { lineas, omitidas } = lineasParaComputo(ctx.resultado.bom);
  const diff = diferenciasComputo(ctx.actuales, lineas);
  const bloqueado = computoBloqueado(ctx.computo?.estado);
  const otroModelo = !!ctx.computo?.modelo_id && ctx.computo.modelo_id !== modeloId;
  return {
    computo: {
      id: ctx.computo?.id ?? null,
      estado: ctx.computo?.estado ?? null,
      bloqueado,
      motivoBloqueo: bloqueado ? 'El cómputo está completado: no se regenera. Pasalo a «requiere ajuste» si hay que cambiarlo.' : null,
      otroModelo,
    },
    diff,
    omitidas,
    metricas: metricasDe(ctx.resultado, ctx.diseno),
    revision: ctx.modelo.revision as number,
    totales: totalesDiff(diff),
  };
}

/** Saca comodines de un texto de búsqueda para .ilike / .or de PostgREST. */
export const textoBusqueda = (q: string) => q.replace(/[%_,()*\\]/g, ' ').trim();
