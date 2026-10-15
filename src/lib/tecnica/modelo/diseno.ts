/**
 * Diseño: creación y edición (todas puras: devuelven copias). Migración de diseños viejos (maqueta, esquema 1),
 * plantillas propias y «Convertir a estructura libre».
 */
import type { Accion, Diseno, Estructura, OpEsqueleto, OverrideCelda, Sistema, Union, V2 } from './tipos.ts';
import { ESQUEMA_DISENO } from './constantes.ts';
import { type Catalogo, catalogoVacio } from './catalogo/catalogo.ts';
import { aplicarOpEsqueleto } from './esqueleto/operaciones.ts';
import { generarTodas } from './construir.ts';
import { categoriaDe, presetPorId, tipologia } from './tipologias/indice.ts';
import { esqueletoDesdeMedidas, LIBRE, type ParamsLibre } from './tipologias/libre.ts';
import { rellenarLargo } from './medida/rellenar.ts';
import { unir, buscarSnap, puertosDe } from './uniones/unir.ts';
import { clone, setRuta } from './util.ts';

export { unir, buscarSnap, puertosDe };

const CLAVES_TOP = ['nombre', 'sistema', 'origen', 'rumbo', 'obra', 'medida'];

export interface OpcionesEstructura {
  preset?: string;
  params?: Record<string, unknown>;
  nombre?: string;
  sistema?: Sistema;
  origen?: V2;
  rumbo?: number;
  medida?: Estructura['medida'];
  apoyo?: Estructura['apoyo'];
  unirA?: { estructuraId: string; puerto: string; s?: number; modo?: Union['modo']; puertoPropio?: string };
}

/** Resuelve «tipología o preset» a {tipología, preset}. */
function resolverId(id: string, preset?: string): { tipId: string; preset?: string } {
  if (tipologia(id)) return { tipId: id, preset };
  const p = presetPorId(id);
  if (p) return { tipId: p.tipologia, preset: preset || p.id };
  throw new Error(`Tipología o preset desconocido: ${id}`);
}

function nuevaEstructura(idTipOPreset: string, id: string, o: OpcionesEstructura = {}, catalogo: Catalogo = catalogoVacio()): Estructura {
  const { tipId, preset } = resolverId(idTipOPreset, o.preset);
  const tip = tipologia(tipId)!;
  const pr = preset ? tip.presets.find((x) => x.id === preset) || presetPorId(preset) : tip.presets[0];
  let sistema: Sistema = o.sistema || pr?.sistema || tip.sistemas[0];
  if (!tip.sistemas.includes(sistema)) sistema = tip.sistemas[0];
  const base = { ...tip.porDefecto(), ...clone(pr?.params || {}), ...clone(o.params || {}) };
  const { params } = tip.normalizar(base as never, sistema);
  const est: Estructura = {
    id, tipologia: tip.id, tipologiaVersion: tip.version, ...(pr ? { preset: pr.id } : {}),
    nombre: o.nombre || pr?.nombre || tip.nombre, sistema,
    origen: o.origen ? [o.origen[0], o.origen[1]] : [0, 0], rumbo: o.rumbo || 0,
    apoyo: o.apoyo || { tipo: 'suelo' }, medida: o.medida || 'catalogo', params: params as Record<string, unknown>, overrides: {},
  };
  // la estructura libre guarda su esqueleto desde el arranque (se edita a mano)
  if (tip.id === LIBRE.id) est.esqueleto = esqueletoDesdeMedidas(est as Estructura & { params: ParamsLibre }, { catalogo, rellenar: rellenarLargo });
  return est;
}

function proximoId(diseno: Diseno): string {
  let n = 0;
  for (const e of diseno.estructuras) n = Math.max(n, +String(e.id).replace(/\D/g, '') || 0);
  return `E${n + 1}`;
}

function disenoVacio(nombre = 'Diseño sin nombre'): Diseno {
  return { esquema: ESQUEMA_DISENO, nombre, obra: null, contexto: { terreno: 'cemento', enVereda: true, claseCarga: 3, volumenes: [] }, estructuras: [], uniones: [], modoBom: 'kit', ajustesBom: [] };
}

/**
 * Crea un diseño con una estructura. Acepta id de tipología o de preset. Por compatibilidad con la maqueta,
 * las claves sueltas de `opciones` que no son de nivel superior se toman como params.
 */
export function crearDiseno(tipologiaId = 'estructura_pantalla', opciones: Partial<OpcionesEstructura> & { obra?: Diseno['obra']; catalogo?: Catalogo } & Record<string, unknown> = {}): Diseno {
  const params: Record<string, unknown> = { ...((opciones.params as Record<string, unknown>) || {}) };
  for (const [k, v] of Object.entries(opciones)) if (!CLAVES_TOP.includes(k) && !['params', 'preset', 'obra', 'catalogo', 'apoyo'].includes(k)) params[k] = v;
  const d = disenoVacio(typeof opciones.nombre === 'string' ? opciones.nombre : 'Diseño sin nombre');
  d.obra = (opciones.obra as Diseno['obra']) || null;
  d.estructuras.push(nuevaEstructura(tipologiaId, 'E1', { preset: opciones.preset, params, sistema: opciones.sistema, origen: opciones.origen, rumbo: opciones.rumbo, medida: opciones.medida, apoyo: opciones.apoyo }, opciones.catalogo));
  return d;
}

/** Ejemplo de la maqueta: fachada en L 14 + 8 × 18 con estructura + pantalla (datos ilustrativos). */
export function ejemploParana631(): Diseno {
  // profundidad 0,73 a propósito: muestra el aviso de paso bajo la bandeja con su reparación (1,25)
  const d = crearDiseno('estructura_pantalla', { frentes: [{ largo: 14 }, { largo: 8, angulo: 90 }], altura: 18, profundidad: 0.73 });
  d.nombre = 'Obra de ejemplo · Paraná 631 (datos ilustrativos)';
  d.estructuras[0].nombre = 'Fachada L';
  return d;
}

export function agregarEstructura(diseno: Diseno, tipologiaOPreset: string, opciones: OpcionesEstructura = {}, catalogo: Catalogo = catalogoVacio()): { diseno: Diseno; estructuraId: string } {
  const d = clone(diseno);
  const id = proximoId(d);
  const est = nuevaEstructura(tipologiaOPreset, id, opciones, catalogo);
  d.estructuras.push(est);
  if (opciones.unirA) {
    const u = opciones.unirA;
    const modo = u.modo || (categoriaDe(est) === 'portico' ? 'apoyo' : 'vertical_compartida');
    return { diseno: unir(d, { estructuraId: u.estructuraId, puerto: u.puerto, s: u.s }, { estructuraId: id, puerto: u.puertoPropio }, modo, catalogo), estructuraId: id };
  }
  return { diseno: d, estructuraId: id };
}

export function quitarEstructura(diseno: Diseno, estructuraId: string): Diseno {
  const d = clone(diseno);
  d.estructuras = d.estructuras.filter((e) => e.id !== estructuraId);
  for (const e of d.estructuras) if (e.apoyo?.tipo === 'sobre_estructura' && e.apoyo.estructuraId === estructuraId) e.apoyo = { tipo: 'suelo' };
  d.uniones = d.uniones.filter((u) => u.a.estructuraId !== estructuraId && u.b.estructuraId !== estructuraId);
  return d;
}

/** Cambia un parámetro (ruta tipo "params.frentes.1.largo"). Cambiar un largo descarta el relleno elegido a mano. */
export function setParam(diseno: Diseno, estructuraId: string, ruta: string, valor: unknown): Diseno {
  const d = clone(diseno);
  const e = d.estructuras.find((x) => x.id === estructuraId);
  if (!e) return d;
  const r = ruta.startsWith('params.') || CLAVES_TOP.includes(ruta.split('.')[0]) || ruta.startsWith('overrides') || ruta.startsWith('apoyo') ? ruta : `params.${ruta}`;
  setRuta(e as unknown as Record<string, unknown>, r, valor === undefined ? undefined : clone(valor));
  const m = /^params\.frentes\.(\d+)\.largo$/.exec(r);
  const frentes = e.params.frentes as { vanos?: number[] }[] | undefined;
  if (m && frentes?.[+m[1]]) delete frentes[+m[1]].vanos;
  return d;
}

/** Override de celda (merge; null borra la celda o un campo). */
export function setOverride(diseno: Diseno, estructuraId: string, celda: string, valor: Partial<Record<keyof OverrideCelda, unknown>> | null): Diseno {
  const d = clone(diseno);
  const e = d.estructuras.find((x) => x.id === estructuraId);
  if (!e) return d;
  e.overrides = e.overrides || {};
  if (valor === null || valor === undefined) {
    delete e.overrides[celda];
    return d;
  }
  const nuevo: Record<string, unknown> = { ...(e.overrides[celda] || {}) };
  for (const [k, v] of Object.entries(valor)) {
    if (v === null || v === undefined) delete nuevo[k];
    else nuevo[k] = v;
  }
  if (Object.keys(nuevo).length) e.overrides[celda] = nuevo as OverrideCelda;
  else delete e.overrides[celda];
  return d;
}

/** Edita el esqueleto de una estructura libre. */
export function editarEsqueleto(diseno: Diseno, estructuraId: string, op: OpEsqueleto, catalogo: Catalogo = catalogoVacio()): Diseno {
  const d = clone(diseno);
  const e = d.estructuras.find((x) => x.id === estructuraId);
  if (!e || !e.esqueleto) return d;
  e.esqueleto = aplicarOpEsqueleto(e.esqueleto, op, catalogo.medidas).esqueleto;
  return d;
}

/**
 * Congela el esqueleto efectivo (overrides y reglas ya aplicados) y pasa la estructura a «libre».
 * Desde ahí se edita a mano y ya NO se regenera por parámetros. Produce la misma BOM.
 */
export function convertirALibre(diseno: Diseno, estructuraId: string, catalogo: Catalogo = catalogoVacio()): Diseno {
  const d = clone(diseno);
  const e = d.estructuras.find((x) => x.id === estructuraId);
  if (!e || e.tipologia === LIBRE.id) return d;
  const g = generarTodas(d, catalogo).get(estructuraId);
  if (!g) return d;
  const esq = clone(g.esqueleto);
  esq.puertos = clone(g.gen.puertos || []);
  e.convertidaDe = { tipologia: e.tipologia, tipologiaVersion: e.tipologiaVersion, params: clone(e.params) };
  e.tipologia = LIBRE.id;
  e.tipologiaVersion = LIBRE.version;
  e.esqueleto = esq;
  e.params = {};
  e.overrides = {};
  return d;
}

/** Cambio de sistema de una estructura (compatible con la maqueta). */
export function cambiarSistema(estructura: Estructura, sistema: Sistema): { estructura: Estructura; avisos: string[] } {
  const e = clone(estructura);
  if (e.sistema === sistema) return { estructura: e, avisos: [] };
  const tip = tipologia(e.tipologia);
  if (!tip || !tip.sistemas.includes(sistema)) return { estructura: e, avisos: [`${tip?.nombre || e.tipologia} no se arma en ${sistema === 'bastidor' ? 'bastidor' : 'multidireccional'}.`] };
  const de = e.sistema;
  if (tip.cambiarSistema) {
    const r = tip.cambiarSistema(e.params as never, de, sistema);
    if (r.rechazado) return { estructura: e, avisos: r.avisos };
    e.params = r.params as Record<string, unknown>;
    e.sistema = sistema;
    const ov = Object.keys(e.overrides || {}).length;
    const avisos = [...r.avisos];
    if (ov) avisos.push(`${ov} override${ov > 1 ? 's' : ''} se conservan; los que caen fuera de la nueva grilla no se aplican.`);
    return { estructura: e, avisos };
  }
  e.sistema = sistema;
  return { estructura: e, avisos: [] };
}

function quitarUnion(diseno: Diseno, unionId: string): Diseno {
  const d = clone(diseno);
  d.uniones = d.uniones.filter((x) => x.id !== unionId);
  return d;
}

/** Aplica la acción de un aviso, de una regla («deshacer») o de la UI. */
export function aplicarReparacion(diseno: Diseno, accion: Accion | null | undefined, catalogo: Catalogo = catalogoVacio()): Diseno {
  if (!accion) return diseno;
  switch (accion.tipo) {
    case 'param':
      return setParam(diseno, accion.estructuraId, accion.ruta, accion.valor);
    case 'override':
      return setOverride(diseno, accion.estructuraId, accion.celda, accion.valor as never);
    case 'overrides': {
      let d = diseno;
      for (const c of accion.celdas) d = setOverride(d, accion.estructuraId, c, accion.valor as never);
      return d;
    }
    case 'esqueleto':
      return editarEsqueleto(diseno, accion.estructuraId, accion.op, catalogo);
    case 'medida': {
      const d = clone(diseno);
      const e = d.estructuras.find((x) => x.id === accion.estructuraId);
      if (e) {
        e.medida = accion.modo;
        const frentes = e.params.frentes as { vanos?: number[] }[] | undefined;
        if (Array.isArray(frentes)) for (const f of frentes) delete f.vanos;
      }
      return d;
    }
    case 'sistema': {
      const d = clone(diseno);
      const i = d.estructuras.findIndex((e) => e.id === accion.estructuraId);
      if (i >= 0) d.estructuras[i] = cambiarSistema(d.estructuras[i], accion.sistema).estructura;
      return d;
    }
    case 'modoUnion': {
      const u = diseno.uniones.find((x) => x.id === accion.unionId);
      if (!u) return diseno;
      return unir(quitarUnion(diseno, u.id), u.a, u.b, accion.modo, catalogo);
    }
    case 'quitarUnion':
      return quitarUnion(diseno, accion.unionId);
    case 'modoBom': {
      const d = clone(diseno);
      d.modoBom = accion.modo;
      return d;
    }
    case 'agregarEstructura':
      return agregarEstructura(diseno, accion.tipologia, { preset: accion.preset, ...(accion.opciones || {}) } as OpcionesEstructura, catalogo).diseno;
    case 'lote': {
      let d = diseno;
      for (const a of accion.acciones) d = aplicarReparacion(d, a, catalogo);
      return d;
    }
    default:
      return diseno;
  }
}

// ───────────── migración, validación y plantillas ─────────────
const TIPO_MAQUETA: Record<string, string> = {
  pantalla: 'fachada', estructura_pantalla: 'fachada', estructura: 'fachada', voladizo: 'fachada', fachada_bastidor: 'fachada_bastidor',
  torre_escalera: 'torre', torre_acceso: 'torre', portico_peatonal: 'portico', portico_vehicular: 'portico',
};

/** Sube un diseño viejo al esquema actual. Esquema 1 = maqueta (celdas "f:v:n", plantilla, apoyaEn). */
export function migrarDiseno(json: unknown): Diseno {
  const x = clone(json) as Record<string, unknown>;
  const esquema = typeof x.esquema === 'number' ? x.esquema : typeof x.version === 'number' ? (x.version as number) : 1;
  if (esquema >= ESQUEMA_DISENO) {
    const d = x as unknown as Diseno;
    d.ajustesBom = d.ajustesBom || [];
    d.uniones = d.uniones || [];
    d.contexto = Object.assign({ terreno: 'cemento', enVereda: false, claseCarga: 3, volumenes: [] }, d.contexto || {});
    for (const e of d.estructuras || []) {
      const tip = tipologia(e.tipologia);
      if (tip?.migrarParams && e.tipologiaVersion < tip.version) {
        e.params = tip.migrarParams(e.params, e.tipologiaVersion) as Record<string, unknown>;
        e.tipologiaVersion = tip.version;
      }
    }
    return d;
  }
  const ests = (x.estructuras as Record<string, unknown>[]) || [];
  const obra = x.obra as Record<string, unknown> | null | undefined;
  const ctx = (x.contexto as Record<string, unknown>) || {};
  const d: Diseno = {
    esquema: ESQUEMA_DISENO,
    nombre: String(x.nombre || 'Diseño sin nombre'),
    obra: obra && obra.id ? { id: String(obra.id), codigo: String(obra.codigo || ''), nombre: String(obra.nombre || '') } : null,
    contexto: { terreno: (ctx.terreno as Diseno['contexto']['terreno']) || 'cemento', enVereda: !!ctx.enVereda, claseCarga: Number(ctx.claseCarga) || 3, volumenes: [] },
    estructuras: ests.map((e) => {
      const plantilla = String(e.plantilla || '');
      const tipId = TIPO_MAQUETA[plantilla] || (e.tipo === 'torre' ? 'torre' : e.tipo === 'portico' ? 'portico' : 'fachada');
      const tip = tipologia(tipId)!;
      const overrides: Record<string, OverrideCelda> = {};
      for (const [k, v] of Object.entries((e.overrides as Record<string, OverrideCelda>) || {})) {
        const m = /^(\d+):(\d+):(\d+)$/.exec(k);
        if (m && tip.categoria === 'fachada') overrides[`f${m[1]}e${m[2]}@N${m[3]}`] = v;
      }
      return {
        id: String(e.id), tipologia: tipId, tipologiaVersion: 1, ...(plantilla ? { preset: plantilla } : {}),
        nombre: String(e.nombre || tip.nombre), sistema: (e.sistema as Sistema) || tip.sistemas[0],
        origen: (e.origen as V2) || [0, 0], rumbo: Number(e.rumbo) || 0, apoyo: { tipo: 'suelo' }, medida: 'catalogo',
        params: (e.params as Record<string, unknown>) || {}, overrides,
      } as Estructura;
    }),
    uniones: ((x.uniones as Union[]) || []).map((u) => ({ id: u.id, a: u.a, b: u.b, modo: u.modo })),
    modoBom: x.modoBom === 'despiezado' ? 'despiezado' : 'kit',
    ajustesBom: [],
  };
  return d;
}

/** Chequeo estructural mínimo (lo usa persistencia antes de guardar). Aplica migrarDiseno. */
export function validarDiseno(json: unknown): { ok: true; diseno: Diseno } | { ok: false; errores: string[] } {
  const errores: string[] = [];
  if (!json || typeof json !== 'object') return { ok: false, errores: ['El diseño no es un objeto.'] };
  let d: Diseno;
  try {
    d = migrarDiseno(json);
  } catch (err) {
    return { ok: false, errores: [`No se pudo leer el diseño: ${(err as Error).message}`] };
  }
  if (!Array.isArray(d.estructuras)) errores.push('Falta la lista de estructuras.');
  const ids = new Set<string>();
  for (const [i, e] of (d.estructuras || []).entries()) {
    if (!e || typeof e !== 'object') { errores.push(`Estructura ${i + 1}: no es un objeto.`); continue; }
    if (!e.id) errores.push(`Estructura ${i + 1}: sin id.`);
    if (ids.has(e.id)) errores.push(`Estructura ${e.id}: id repetido.`);
    ids.add(e.id);
    if (!tipologia(e.tipologia)) errores.push(`Estructura ${e.id}: tipología desconocida «${e.tipologia}».`);
    if (e.sistema !== 'multi' && e.sistema !== 'bastidor') errores.push(`Estructura ${e.id}: sistema inválido.`);
    if (!Array.isArray(e.origen) || e.origen.length !== 2 || !e.origen.every(Number.isFinite)) errores.push(`Estructura ${e.id}: origen inválido.`);
    if (!Number.isFinite(e.rumbo)) errores.push(`Estructura ${e.id}: rumbo inválido.`);
    if (!e.params || typeof e.params !== 'object') errores.push(`Estructura ${e.id}: params inválidos.`);
    if (e.tipologia === LIBRE.id && !e.esqueleto) errores.push(`Estructura ${e.id}: la estructura libre necesita su esqueleto.`);
  }
  for (const u of d.uniones || []) if (!ids.has(u.a?.estructuraId) || !ids.has(u.b?.estructuraId)) errores.push(`Unión ${u.id}: apunta a una estructura que no existe.`);
  if (!['kit', 'despiezado'].includes(d.modoBom)) errores.push('modoBom inválido.');
  return errores.length ? { ok: false, errores } : { ok: true, diseno: d };
}

/** Diseño nuevo a partir de una plantilla propia: renumera ids, limpia la obra y opcionalmente lo mueve. */
export function instanciarPlantilla(disenoPlantilla: Diseno, opciones: { origen?: V2; obra?: Diseno['obra']; nombre?: string } = {}): Diseno {
  const src = migrarDiseno(disenoPlantilla);
  const d = clone(src);
  const mapaE = new Map<string, string>();
  d.estructuras.forEach((e, i) => mapaE.set(e.id, `E${i + 1}`));
  const dx = opciones.origen && d.estructuras[0] ? opciones.origen[0] - d.estructuras[0].origen[0] : 0;
  const dz = opciones.origen && d.estructuras[0] ? opciones.origen[1] - d.estructuras[0].origen[1] : 0;
  for (const e of d.estructuras) {
    e.id = mapaE.get(e.id)!;
    e.origen = [e.origen[0] + dx, e.origen[1] + dz];
    if (e.apoyo?.tipo === 'sobre_estructura') e.apoyo = { tipo: 'sobre_estructura', estructuraId: mapaE.get(e.apoyo.estructuraId) || e.apoyo.estructuraId };
  }
  d.uniones = d.uniones.filter((u) => mapaE.has(u.a.estructuraId) && mapaE.has(u.b.estructuraId)).map((u, i) => ({ ...u, id: `U${i + 1}`, a: { ...u.a, estructuraId: mapaE.get(u.a.estructuraId)! }, b: { ...u.b, estructuraId: mapaE.get(u.b.estructuraId)! } }));
  d.obra = opciones.obra ?? null;
  if (opciones.nombre) d.nombre = opciones.nombre;
  d.ajustesBom = [];
  return d;
}
