// ui-base.js · utilidades de interfaz sin estado: DOM, toasts, modales, expresiones, íconos.
import { fmt } from './motor.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** h('div.clase#id', {attrs, on:{click}}, ...hijos) */
export function h(tag, props = {}, ...hijos) {
  const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(tag);
  const el = document.createElement(m[1] || 'div');
  for (const p of (m[2] || '').match(/[.#][\w-]+/g) || []) {
    if (p[0] === '.') el.classList.add(p.slice(1)); else el.id = p.slice(1);
  }
  if (props != null && props !== false && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { hijos.unshift(props); props = {}; }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'class') el.className += ' ' + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of hijos.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** "12+2,5" → 14.5 ; null si no es una expresión numérica válida. */
export function evalExpr(txt) {
  const s = String(txt ?? '').trim().replace(/,/g, '.').replace(/[×x]/g, '*');
  if (!s || !/^[\d.+\-*/()\s]+$/.test(s)) return null;
  try {
    const v = Function(`"use strict";return (${s})`)();
    return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null;
  } catch { return null; }
}

export const etiquetaCelda = (celda, conFrente = true) => {
  const [f, v, n] = celda.split(':').map(Number);
  return `${conFrente ? `Frente ${LETRAS[f]} · ` : ''}V${v + 1} · N${n + 1}`;
};
/** "N1–N2 V2–V3" para un conjunto de celdas */
export function rangoCeldas(celdas) {
  if (!celdas.length) return '';
  const xs = celdas.map((c) => c.split(':').map(Number));
  const fs = [...new Set(xs.map((x) => x[0]))];
  const v0 = Math.min(...xs.map((x) => x[1])) + 1, v1 = Math.max(...xs.map((x) => x[1])) + 1;
  const n0 = Math.min(...xs.map((x) => x[2])) + 1, n1 = Math.max(...xs.map((x) => x[2])) + 1;
  const fr = fs.length === 1 ? `Frente ${LETRAS[fs[0]]} ` : `Frentes ${fs.map((f) => LETRAS[f]).join('+')} `;
  return `${fr}N${n0}${n1 > n0 ? '–N' + n1 : ''} V${v0}${v1 > v0 ? '–V' + v1 : ''}`;
}

export const kg = (v) => Math.round(v).toLocaleString('es-AR');
export const tn = (v) => fmt(v / 1000, 1);
export { fmt };

// ── toasts ──
/** clave: toasts con la misma clave se reemplazan (por defecto, el texto sin números). Máximo 2 a la vez. */
export function toast({ texto, sub, tipo = 'info', acciones = [], ms = 6500, clave }) {
  const raiz = document.getElementById('toasts');
  const k = clave || `${tipo}:${String(texto).replace(/\d+(?:[.,]\d+)*/g, '#')}`;
  for (const viejo of [...raiz.children]) if (viejo.dataset.clave === k) viejo.remove();
  const ic = { regla: '↺', ok: '✓', info: 'i', error: '!' }[tipo] || 'i';
  const el = h('div.toast', { class: tipo, role: 'status' },
    h('span.ic', ic),
    h('div.tx', texto, sub ? h('small', sub) : null,
      acciones.length ? h('div.acc', acciones.map((a) => h('button', { type: 'button', on: { click: () => { a.fn(); cerrar(); } } }, a.etiqueta))) : null),
    h('button.x', { type: 'button', 'aria-label': 'Cerrar', on: { click: () => cerrar() } }, '×'),
  );
  el.dataset.clave = k;
  let t = setTimeout(cerrar, ms);
  el.addEventListener('mouseenter', () => clearTimeout(t));
  el.addEventListener('mouseleave', () => { t = setTimeout(cerrar, 2500); });
  function cerrar() { clearTimeout(t); el.remove(); }
  raiz.append(el);
  while (raiz.children.length > 2) raiz.firstChild.remove();
  return cerrar;
}

// ── modales ──
let modalAbierto = null;
export function modal({ titulo, cuerpo, pie = [], clase = '', alCerrar }) {
  cerrarModal();
  const fondo = h('div.modal-fondo', { on: { mousedown: (e) => { if (e.target === fondo) cerrarModal(); } } });
  const caja = h('div.modal', { class: clase, role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo || 'Diálogo' });
  if (titulo) caja.append(h('div.modal-h', h('h3', titulo), h('button.btn.icono.ghost', { type: 'button', 'aria-label': 'Cerrar', on: { click: () => cerrarModal() } }, '×')));
  if (cuerpo) caja.append(h('div.modal-b', cuerpo));
  if (pie.length) caja.append(h('div.modal-f', pie));
  fondo.append(caja);
  document.getElementById('modal-root').append(fondo);
  modalAbierto = { fondo, alCerrar };
  const f = caja.querySelector('input') || caja.querySelector('button.pri') || caja.querySelector('.modal-b button, .modal-f button, button');
  if (f) setTimeout(() => f.focus(), 0);
  return caja;
}
export function cerrarModal() {
  if (!modalAbierto) return false;
  const m = modalAbierto;
  modalAbierto = null;
  m.fondo.remove();
  m.alCerrar?.();
  return true;
}
export const hayModal = () => !!modalAbierto;

export async function copiarTexto(txt) {
  try { await navigator.clipboard.writeText(txt); return true; } catch { return false; }
}

// ── storage tolerante ──
export function leer(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } }
export function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin storage */ } }

// ── íconos de plantilla (esquemas de línea) ──
const IC = {
  pantalla: '<path d="M4 30h40M8 30V12M24 30V12M40 30V12M6 12h36M6 9h36M8 12l16-3M24 12l16-3"/><circle cx="8" cy="22" r="1.6"/><circle cx="40" cy="22" r="1.6"/>',
  fachada: '<path d="M3 4v26M3 30h42"/><path d="M10 6v24M22 6v24M34 6v24M10 6h24M10 14h24M10 22h24"/><path d="M10 22l12-8M22 22l12-8" opacity=".6"/>',
  bastidor: '<path d="M4 30h40"/><path d="M8 30V6h14v24M26 30V6h14v24M8 10h14M26 10h14M8 26l14-14M26 26l14-14"/>',
  voladizo: '<path d="M2 4v26M2 30h44"/><path d="M14 30V4M26 30V4M14 6h12M14 14h12M14 22h12M14 14H6l8 4M14 22H6l8 4"/><path d="M6 14v-2M6 22v-2" opacity=".6"/>',
  escalera: '<path d="M14 30V2M34 30V2M14 4h20M4 30h40"/><path d="M14 30l20-7M34 23l-20-7M14 16l20-7M34 9l-20-5" />',
  torre: '<path d="M16 30V2M32 30V2M16 4h16M16 12h16M16 20h16M4 30h40M20 30V6h8" opacity=".9"/>',
  portico: '<path d="M2 30h44M8 30V14M40 30V14M4 14h40M4 11h40M8 14l6-3M40 14l-6-3"/><path d="M21 30v-6m0 0l-2 6m2-6l2 6m-2-6v-3" opacity=".7"/><circle cx="21" cy="19" r="1.5"/>',
  camion: '<path d="M2 30h44M6 30V8M12 30V8M36 30V8M42 30V8M6 8h36M12 4h24M12 8l3-4l3 4l3-4l3 4l3-4l3 4l3-4l3 4M6 18h6M36 18h6"/><rect x="17" y="20" width="12" height="7" rx="1" opacity=".7"/>',
};
export const iconoSvg = (k) => `<svg viewBox="0 0 48 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k] || IC.fachada}</svg>`;
