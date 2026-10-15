/**
 * Alta, edición y baja de volúmenes en el diseño (contexto.volumenes). Puras: devuelven copias.
 * Los salientes se recalculan cuando cambia su padre; al quitar un volumen se van sus salientes.
 */
import type { Diseno, Volumen } from '../tipos.ts';
import { clone } from '../util.ts';
import { volumenDesdeDef } from './geometria.ts';
import { type DefVolumen, VERSION_VOLUMENES, type VolumenModelado } from './tipos.ts';

function proximoIdVolumen(vols: Volumen[]): string {
  let n = 0;
  for (const v of vols) {
    const m = /^V(\d+)$/.exec(v.id);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `V${n + 1}`;
}

const esModelado = (v: Volumen): v is VolumenModelado => !!(v as VolumenModelado).def;

/** Recalcula los volúmenes modelados (padres primero, después los salientes). */
function recalcular(vols: Volumen[]): { volumenes: Volumen[]; avisos: string[] } {
  const avisos: string[] = [];
  const out = vols.map((v) => ({ ...v }));
  const esSaliente = (v: Volumen) => (esModelado(v) && v.def.tipo === 'saliente' ? 1 : 0);
  const orden = [...out.keys()].sort((a, b) => esSaliente(out[a]) - esSaliente(out[b]));
  for (const i of orden) {
    const v = out[i];
    if (!esModelado(v)) continue;
    const r = volumenDesdeDef(v.id, v.def, out, v.nombre);
    out[i] = r.volumen;
    avisos.push(...r.avisos.map((t) => `${v.nombre || v.id}: ${t}`));
  }
  return { volumenes: out, avisos };
}

/** Agrega un volumen dibujado a partir de medidas. */
export function agregarVolumen(diseno: Diseno, def: DefVolumen, o: { nombre?: string; id?: string } = {}): { diseno: Diseno; volumenId: string; avisos: string[] } {
  const d = clone(diseno);
  d.contexto = d.contexto || { terreno: 'cemento', enVereda: false, claseCarga: 3, volumenes: [] };
  d.contexto.volumenes = d.contexto.volumenes || [];
  const id = o.id && !d.contexto.volumenes.some((v) => v.id === o.id) ? o.id : proximoIdVolumen(d.contexto.volumenes);
  const r = volumenDesdeDef(id, def, d.contexto.volumenes, o.nombre);
  d.contexto.volumenes.push(r.volumen);
  return { diseno: d, volumenId: id, avisos: r.avisos };
}

/** Cambia la definición (o el nombre) de un volumen y recalcula sus salientes. */
export function actualizarVolumen(diseno: Diseno, volumenId: string, cambios: { def?: DefVolumen; nombre?: string }): { diseno: Diseno; avisos: string[] } {
  const d = clone(diseno);
  const vols = d.contexto?.volumenes || [];
  const i = vols.findIndex((v) => v.id === volumenId);
  if (i < 0) return { diseno: d, avisos: [`No encuentro el volumen «${volumenId}».`] };
  const v = vols[i] as VolumenModelado;
  const def = cambios.def ?? v.def;
  if (!def) {
    if (cambios.nombre !== undefined) vols[i] = { ...v, nombre: cambios.nombre };
    return { diseno: d, avisos: [] };
  }
  vols[i] = { ...v, def, defVersion: VERSION_VOLUMENES, ...(cambios.nombre !== undefined ? { nombre: cambios.nombre } : {}) } as VolumenModelado;
  const r = recalcular(vols);
  d.contexto.volumenes = r.volumenes;
  return { diseno: d, avisos: r.avisos };
}

/** Quita un volumen (y sus salientes). Las estructuras que lo usaban quedan con aviso «no encuentro el volumen». */
export function quitarVolumen(diseno: Diseno, volumenId: string): Diseno {
  const d = clone(diseno);
  if (!d.contexto?.volumenes) return d;
  d.contexto.volumenes = d.contexto.volumenes.filter((v) => v.id !== volumenId && !(esModelado(v) && v.def.tipo === 'saliente' && v.def.padre === volumenId));
  return d;
}

/** Sube los volúmenes guardados a la versión actual (los sin `def` quedan como están). */
export function migrarVolumenes(diseno: Diseno): Diseno {
  const d = clone(diseno);
  if (!d.contexto?.volumenes?.length) return d;
  const vols = d.contexto.volumenes.map((v) => (esModelado(v) && (v.defVersion ?? 0) < VERSION_VOLUMENES ? { ...v, defVersion: VERSION_VOLUMENES } : v));
  d.contexto.volumenes = recalcular(vols).volumenes;
  return d;
}
