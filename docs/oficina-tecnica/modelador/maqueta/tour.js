// tour.js · recorrido guiado de 4 pasos y tareas de prueba con cronómetro opcional (§3 de la propuesta).
import { crearDiseno, ejemploParana631, fmt } from './motor.js';
import { st, commit, seleccionar } from './estado.js';
import { $, $$, h, toast, leer, guardar, tn } from './ui-base.js';

const PASOS = [
  { sel: '#sec-galeria', titulo: 'Plantillas', texto: 'Elegís qué vas a armar. Clic en una plantilla (o T para torre, P para pórtico) y movés el cursor: se encastra sola en las caras que se iluminan.' },
  { sel: '#vista3d', titulo: 'Vista 3D', texto: 'Las manijas coral alargan de a vano y suben de a nivel, con el conteo de kg en vivo. Mientras la arrastrás podés tipear el número y Enter. Pasá el mouse por una pieza para ver su ficha.' },
  { sel: '#sec-alzado', titulo: 'Alzado desplegado', texto: 'Acá se edita fino. Elegí celdas (clic, arrastre o rótulos N y V) y apretá O para abrir un local: propone la viga puente sola. B es el pincel: abertura, sin plataforma, lona, ménsula, anclaje.' },
  { sel: '#col-der', titulo: 'Propiedades y lista en vivo', texto: 'Chips para sistema, profundidad, plataformas y cubierta. Abajo, la lista con códigos ABA, kg y stock. En la barra inferior: m², toneladas y faltantes. Todo dice PREDIMENSIONADO.' },
];

const fachadas = () => st.diseno.estructuras.filter((e) => e.tipo === 'fachada');
const TAREAS = [
  {
    id: 'L', titulo: 'Fachada en L con abertura', meta: 120,
    desc: 'Av. Corrientes 1234: frentes de 16 y 9 m, 15 m de alto. Abrí un local de 2 vanos × 2 niveles en PB y dejá la viga que propone.',
    prep: () => {
      const d = crearDiseno('estructura_pantalla', { frentes: [{ largo: 10 }], altura: 12, nombre: 'Prueba · Av. Corrientes 1234' });
      d.estructuras[0].nombre = 'Fachada';
      commit(d, 'Empezar tarea: fachada en L');
      seleccionar({ estructuraId: 'E1', celdas: [], frente: null });
    },
    ok: () => fachadas().some((e) => e.params.frentes.length >= 2 && Object.values(e.overrides || {}).filter((o) => o.abertura).length >= 4)
      && st.res.piezas.some((p) => p.tipo === 'viga' && fachadas().some((e) => e.id === p.estructuraId)),
  },
  {
    id: 'T', titulo: 'Torre escalera adosada', meta: 60,
    desc: 'Apretá T y soltá la torre sobre la cara exterior del Frente B. Mirá qué unión se armó en el árbol.',
    prep: () => { if (!fachadas().some((e) => e.params.frentes.length >= 2)) commit(ejemploParana631(), 'Empezar tarea: torre'); },
    ok: () => st.diseno.uniones.some((u) => u.modo !== 'apoyo' && [u.a, u.b].some((x) => st.diseno.estructuras.find((e) => e.id === x.estructuraId)?.tipo === 'torre')),
  },
  {
    id: 'P', titulo: 'Pórtico peatonal de 10 ml', meta: 60,
    desc: 'Apretá P y ubicá un pórtico de 10 ml sobre la vereda, con 2,50 libres. Probá también "Usar como base de la fachada".',
    ok: () => st.diseno.estructuras.some((e) => e.tipo === 'portico' && e.params.clase !== 'vehicular' && Math.abs(e.params.largo - 10) <= 1.3 && e.params.alturaLibre >= 2.5),
  },
  {
    id: 'S', titulo: 'Toneladas y faltantes', meta: 5,
    desc: 'Respondé en 5 segundos: ¿cuántas toneladas lleva la obra y qué falta en stock? Tocá el stock de la barra inferior para ver la lista.',
    ok: () => st.flags.consultoStock,
    respuesta: () => `${tn(st.res.resumen.pesoKg)}${st.res.resumen.pesoParcial ? '* (mínimo, hay códigos sin peso)' : ''} t · faltan ${st.res.resumen.faltantesStock.map((f) => `${f.codigo} (${f.falta})`).join(', ') || 'nada'}`,
  },
  {
    id: 'I', titulo: 'Imagen para Comercial', meta: 30,
    desc: 'Sacá la imagen para la propuesta. ¿Sirve tal cual o la retocarías?',
    ok: () => st.flags.imagenExportada,
  },
  {
    id: 'V', titulo: 'Voladizo con ménsulas', meta: 90, nuevo: true,
    desc: 'Hay una marquesina de 1,20 en PB: retirá el andamio a 1,20 y acercate a la fachada con ménsulas de 1,09 desde N2. Probá también una ménsula hacia afuera con el pincel 4.',
    ok: () => fachadas().some((e) => (e.params.retiro ?? 0) >= 1 && ((e.params.mensulas || []).some((m) => m.lado === 'fachada') || Object.values(e.overrides || {}).some((o) => o.mensula === 'fachada')))
      && !st.res.avisos.some((a) => a.nivel === 'error' && /ménsula/.test(a.texto)),
  },
  {
    id: 'G', titulo: 'Pórtico vehicular', meta: 60, nuevo: true,
    desc: 'Ingreso de camiones: pórtico vehicular de 6 m de luz y 4,50 de gálibo (Shift+P o la galería). Revisá qué viga eligió.',
    ok: () => st.diseno.estructuras.some((e) => e.tipo === 'portico' && e.params.clase === 'vehicular' && e.params.luz >= 5 && e.params.galibo >= 4.5),
  },
];

let abierto = false;
let paso = 0;
let modo = 'pasos';
let estado = leer('aba-modelador-tareas', {}); // id → {hecha, ms, inicio}
let medir = leer('aba-modelador-medir', true);
let tic = null;
let plegado = false; // con una tarea en curso, el panel se pliega a una pastilla para no tapar el alzado ni el 3D

export const tourAbierto = () => abierto;

export function abrirTour(enTareas = false) {
  abierto = true;
  modo = enTareas || leer('aba-modelador-tour-visto', false) ? 'tareas' : 'pasos';
  paso = 0;
  render();
}
function cerrar() {
  abierto = false;
  quitarFoco();
  $('#tour-root').innerHTML = '';
  clearInterval(tic); tic = null;
}
function quitarFoco() { $$('.foco').forEach((x) => x.classList.remove('foco')); }

const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function render() {
  const raiz = $('#tour-root');
  raiz.innerHTML = '';
  quitarFoco();
  if (!abierto) return;
  const caja = h('div.tour', { role: 'dialog', 'aria-label': 'Recorrido' });
  const enCurso = TAREAS.find((t) => estado[t.id]?.inicio && !estado[t.id]?.hecha);
  if (modo === 'tareas' && plegado && enCurso) {
    caja.classList.add('plegado');
    const e = estado[enCurso.id];
    caja.append(h('div.tour-h',
      h('b', { title: enCurso.desc }, enCurso.titulo),
      medir ? h('span.crono', { 'data-crono': enCurso.id }, mmss(Date.now() - e.inicio)) : null,
      h('button.btn.xs', { type: 'button', on: { click: () => terminar(enCurso, true) } }, 'Marcar hecha'),
      h('button.btn.xs.ghost', { type: 'button', title: 'Ver la consigna y las demás tareas', 'aria-expanded': 'false', on: { click: () => { plegado = false; render(); } } }, 'Ver consigna'),
      h('button.btn.icono.ghost.sm', { type: 'button', 'aria-label': 'Cerrar', on: { click: cerrar } }, '×')));
    raiz.append(caja);
    if (!tic) tic = setInterval(actualizarCronos, 500);
    return;
  }
  if (modo === 'pasos') {
    const p = PASOS[paso];
    document.querySelector(p.sel)?.classList.add('foco');
    caja.append(
      h('div.tour-h', h('span.paso-n', `PASO ${paso + 1} DE ${PASOS.length}`), h('b', p.titulo), h('button.btn.icono.ghost.sm', { type: 'button', 'aria-label': 'Cerrar', on: { click: cerrar } }, '×')),
      h('div.tour-b', h('p', p.texto),
        h('div', { style: { display: 'flex', gap: '6px', justifyContent: 'flex-end' } },
          h('button.btn.sm.ghost', { type: 'button', on: { click: () => { modo = 'tareas'; guardar('aba-modelador-tour-visto', true); render(); } } }, 'Saltar a las tareas'),
          paso > 0 ? h('button.btn.sm', { type: 'button', on: { click: () => { paso--; render(); } } }, 'Atrás') : null,
          h('button.btn.sm.pri', { type: 'button', on: { click: () => { if (paso < PASOS.length - 1) paso++; else { modo = 'tareas'; guardar('aba-modelador-tour-visto', true); } render(); } } }, paso < PASOS.length - 1 ? 'Siguiente' : 'Ver tareas'))),
    );
  } else {
    const hechas = TAREAS.filter((t) => estado[t.id]?.hecha).length;
    caja.append(
      h('div.tour-h', h('b', `Tareas de prueba · ${hechas}/${TAREAS.length}`),
        enCurso ? h('button.btn.xs.ghost', { type: 'button', title: 'Plegar el panel para trabajar', 'aria-expanded': 'true', on: { click: () => { plegado = true; render(); } } }, 'Plegar') : null,
        h('label.toggle', { for: 'tour-medir', title: 'Cronómetro opcional para medir los tiempos meta' }, h('input', { id: 'tour-medir', type: 'checkbox', checked: medir, on: { change: (e) => { medir = e.target.checked; guardar('aba-modelador-medir', medir); render(); } } }), 'Cronómetro'),
        h('button.btn.icono.ghost.sm', { type: 'button', 'aria-label': 'Cerrar', on: { click: cerrar } }, '×')),
      h('div.tour-b',
        h('p.nota', 'Probá sin explicación. Cada tarea se marca sola cuando el modelo la cumple.'),
        TAREAS.map((t) => tarjeta(t)),
        h('div', { style: { display: 'flex', gap: '6px', justifyContent: 'space-between' } },
          h('button.btn.sm.ghost', { type: 'button', on: { click: () => { modo = 'pasos'; paso = 0; render(); } } }, 'Ver los 4 pasos'),
          h('button.btn.sm.ghost', { type: 'button', on: { click: () => { estado = {}; guardar('aba-modelador-tareas', estado); render(); } } }, 'Reiniciar tiempos'))),
    );
  }
  raiz.append(caja);
  if (!tic) tic = setInterval(actualizarCronos, 500);
}

function tarjeta(t) {
  const e = estado[t.id] || {};
  const activa = e.inicio && !e.hecha;
  const crono = h('span.crono', { 'data-crono': t.id });
  if (e.hecha && e.ms != null) { crono.textContent = mmss(e.ms); crono.classList.add(e.ms <= t.meta * 1000 ? 'ok' : 'lento'); }
  else if (activa && medir) crono.textContent = mmss(Date.now() - e.inicio);
  return h('div.tarea', { class: e.hecha ? 'hecha' : activa ? 'activa' : '' },
    h('div.top2', h('b', e.hecha ? '✓ ' : '', t.titulo, t.nuevo ? h('span.tag.kit', { style: { marginLeft: '6px' } }, 'nuevo') : null), crono, h('span.meta2', `meta ${t.meta < 60 ? t.meta + ' s' : mmss(t.meta * 1000)}`)),
    h('div.desc2', t.desc),
    e.hecha && t.respuesta ? h('div.nota', 'Respuesta: ', h('b', t.respuesta())) : null,
    h('div', { style: { display: 'flex', gap: '6px' } },
      !e.hecha && !activa ? h('button.btn.xs.pri', { type: 'button', on: { click: () => empezar(t) } }, 'Empezar') : null,
      activa ? h('button.btn.xs', { type: 'button', on: { click: () => terminar(t, true) } }, 'Marcar hecha') : null,
      activa ? h('button.btn.xs.ghost', { type: 'button', on: { click: () => { delete estado[t.id]; guardar('aba-modelador-tareas', estado); render(); } } }, 'Cancelar') : null,
      e.hecha ? h('button.btn.xs.ghost', { type: 'button', on: { click: () => { delete estado[t.id]; guardar('aba-modelador-tareas', estado); render(); } } }, 'Repetir') : null),
  );
}

function empezar(t) {
  for (const k of Object.keys(estado)) if (estado[k].inicio && !estado[k].hecha) delete estado[k];
  if (t.id === 'S') st.flags.consultoStock = false;
  if (t.id === 'I') st.flags.imagenExportada = false;
  t.prep?.();
  estado[t.id] = { inicio: Date.now() };
  guardar('aba-modelador-tareas', estado);
  plegado = true;
  render();
}
function terminar(t, manual = false) {
  const e = estado[t.id] || {};
  const ms = e.inicio && medir ? Date.now() - e.inicio : null;
  estado[t.id] = { hecha: true, ms, manual };
  guardar('aba-modelador-tareas', estado);
  plegado = false;
  if (abierto) render();
  const tiempo = ms != null ? ` en ${mmss(ms)} (meta ${t.meta < 60 ? t.meta + ' s' : mmss(t.meta * 1000)})` : '';
  toast({ tipo: 'ok', texto: `Tarea lista: ${t.titulo}${tiempo}.`, sub: t.respuesta ? `Respuesta: ${t.respuesta()}` : ms != null && ms > t.meta * 1000 ? 'Pasó la meta: anotá dónde se trabó.' : undefined });
}

/** Se llama después de cada cambio del modelo: marca las tareas activas que ya se cumplen. */
export function verificarTareas() {
  for (const t of TAREAS) {
    const e = estado[t.id];
    if (!e?.inicio || e.hecha) continue;
    let ok = false;
    try { ok = t.ok(); } catch { ok = false; }
    if (ok) terminar(t);
  }
}

function actualizarCronos() {
  if (!abierto || !medir) return;
  for (const t of TAREAS) {
    const e = estado[t.id];
    if (!e?.inicio || e.hecha) continue;
    const el = document.querySelector(`[data-crono="${t.id}"]`);
    if (el) {
      const ms = Date.now() - e.inicio;
      el.textContent = mmss(ms);
      el.classList.toggle('lento', ms > t.meta * 1000);
    }
  }
}
void fmt;
