// estado.js · estado de la maqueta: diseño, resultado de construir(), selección e historial con nombre.
import { construir } from './motor.js';

const subs = new Set();

export const st = {
  diseno: null,
  res: null,
  sel: { estructuraId: null, frente: null, celdas: [] }, // celdas: claves "f:v:n" de la estructura seleccionada
  hover: { celda: null },
  herramienta: 'seleccionar',
  pincel: 1,
  ladoMensula: 'afuera',
  bomResaltado: null,
  filtroLista: 'todo',
  ajustes: [], // ajustes manuales de la lista (no tocan el modelo)
  pasado: [],
  futuro: [],
  flags: { imagenExportada: false, consultoStock: false },
  ultimaUnion: null,
};

export const on = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export const emit = (tipo, info = {}) => { for (const f of subs) f(tipo, info); };

function aplicar(d) {
  st.diseno = d;
  st.res = construir(d);
  validarSel();
}
function validarSel() {
  const ids = st.diseno.estructuras.map((e) => e.id);
  if (!ids.includes(st.sel.estructuraId)) { st.sel.estructuraId = ids[0] || null; st.sel.celdas = []; st.sel.frente = null; }
  const existentes = new Set(st.res.celdas.filter((c) => c.estructuraId === st.sel.estructuraId).map((c) => c.celda));
  st.sel.celdas = st.sel.celdas.filter((c) => existentes.has(c));
  const est = st.res.estructuras.find((e) => e.id === st.sel.estructuraId);
  if (st.sel.frente != null && (!est || st.sel.frente >= est.frentes.length)) st.sel.frente = null;
}

export function iniciar(d) {
  st.pasado = []; st.futuro = [];
  aplicar(d);
  emit('diseno', { inicial: true });
}

/** Registra un paso de historial. base: diseño anterior cuando hubo previsualización (un arrastre = un paso). */
export function commit(d, nombre, base = null) {
  const prevRes = st.res;
  st.pasado.push({ diseno: base || st.diseno, nombre });
  if (st.pasado.length > 200) st.pasado.shift();
  st.futuro = [];
  aplicar(d);
  emit('diseno', { nombre, prevRes });
}

/** Cambia el diseño sin historial (arrastres de pincel). */
export function preview(d) {
  aplicar(d);
  emit('diseno', { preview: true });
}

export function deshacer() {
  const e = st.pasado.pop();
  if (!e) return null;
  const prevRes = st.res;
  st.futuro.push({ diseno: st.diseno, nombre: e.nombre });
  aplicar(e.diseno);
  emit('diseno', { nombre: e.nombre, prevRes, historial: 'deshacer' });
  return e.nombre;
}
export function rehacer() {
  const e = st.futuro.pop();
  if (!e) return null;
  const prevRes = st.res;
  st.pasado.push({ diseno: st.diseno, nombre: e.nombre });
  aplicar(e.diseno);
  emit('diseno', { nombre: e.nombre, prevRes, historial: 'rehacer' });
  return e.nombre;
}

export function seleccionar(patch) {
  Object.assign(st.sel, patch);
  validarSel();
  emit('sel');
}

export const estructuraSel = () => st.diseno.estructuras.find((e) => e.id === st.sel.estructuraId) || null;
export const resueltaSel = () => st.res.estructuras.find((e) => e.id === st.sel.estructuraId) || null;
