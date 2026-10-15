// app.js · interfaz de la maqueta del Modelador ABA: paneles, atajos, historial, toasts y modales.
import {
  PLANTILLAS, CATALOGO, CRITERIOS, SIMPLIFICACIONES, PREDIMENSIONADO, VERSION_MOTOR,
  ejemploParana631, crearDiseno, setParam, setOverride, aplicarReparacion, cambiarSistema, quitarEstructura,
  agregarEstructura, unir, fmt,
} from './motor.js';
import { st, on, emit, iniciar, commit, deshacer, rehacer, seleccionar, estructuraSel, resueltaSel } from './estado.js';
import { $, $$, h, toast, modal, cerrarModal, hayModal, evalExpr, etiquetaCelda, rangoCeldas, kg, tn, LETRAS, iconoSvg, copiarTexto, leer, guardar } from './ui-base.js';
import * as V from './vista3d.js';
import { iniciarAlzado, renderAlzado, marcarHover, PINCELES, textoSeleccion } from './alzado.js';
import { abrirTour, verificarTareas, tourAbierto } from './tour.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const NOMBRE_TIPO = { fachada: 'Fachada', torre: 'Torre', portico: 'Pórtico' };
const iconoDe = (est) => PLANTILLAS.find((p) => p.id === est.plantilla)?.icono || 'fachada';

// ───────────────────────────── arranque ─────────────────────────────
function arrancar() {
  iniciarAlzado($('#alzado'));
  V.iniciar3d({
    contenedor: $('#vista3d'), canvas: $('#lienzo'), overlay: $('#overlay3d'),
    callbacks: {
      alHover: fichaPieza,
      alClic: clicPieza,
      alternarUnion,
      alColocar: hintColocacion,
      alColocado: colocado,
      alVista: (n) => $$('.cubo [data-vista]').forEach((b) => b.classList.toggle('on', b.dataset.vista === String(n))),
      alManija: (activa) => { if (activa) $('#ficha').hidden = true; },
    },
  });
  renderGaleria();
  renderPinceles();
  renderLeyenda();
  enlazar();
  on(alCambiar);
  iniciar(ejemploParana631());
  setTimeout(() => {
    const r = st.res.reglasAplicadas.find((x) => /^Agregué \d+ anclajes por la media sombra/.test(x.texto));
    if (r) toastRegla(r);
  }, 900);
  if (!leer('aba-modelador-visto', false)) {
    setTimeout(() => toast({
      tipo: 'info', texto: 'Obra de ejemplo con una fachada en L ya generada.', sub: 'Probá el recorrido de 7 tareas con cronómetro, o tocá ? para ver los atajos.',
      acciones: [{ etiqueta: 'Abrir recorrido', fn: () => abrirTour() }], ms: 6000,
    }), 1600);
    guardar('aba-modelador-visto', true);
  }
}

// ───────────────────────────── ciclo de render ─────────────────────────────
function alCambiar(tipo, info) {
  if (tipo === 'diseno') {
    // pincel arrastrando: solo el alzado; el 3D, el árbol y la lista se actualizan al soltar (commit)
    if (info.preview) { renderAlzado(); return; }
    V.cargar(!!info.inicial);
    renderTodo();
    if (!info.preview) {
      toastsDeCambio(info);
      verificarTareas();
    }
  } else if (tipo === 'sel') {
    renderArbol();
    renderProps();
    renderAlzado();
    $('#alzado-info').textContent = textoSeleccion();
    V.recolorear();
    V.actualizarOverlays();
  } else if (tipo === 'hover') {
    marcarHover();
    V.actualizarOverlays();
    const c = st.hover.celda;
    $('#alzado-info').textContent = c && !st.sel.celdas.includes(c) ? `${etiquetaCelda(c)} · ${descCelda(c)}` : textoSeleccion();
  }
}

function renderTodo() {
  $('#obra-nombre').textContent = st.diseno.nombre;
  const ob = st.diseno.obra;
  $('#obra-sub').textContent = ob ? `${ob.direccion} · desde la obra · ${st.diseno.estructuras.length} estructura${st.diseno.estructuras.length > 1 ? 's' : ''}` : `Sin obra vinculada · ${st.diseno.estructuras.length} estructura${st.diseno.estructuras.length > 1 ? 's' : ''}`;
  $('#chip-est').hidden = !ob?.estimado;
  if (ob?.mlEstimados) $('#chip-est').textContent = `${fmt(ob.mlEstimados, 0)} ml estimado`;
  $('#btn-undo').disabled = !st.pasado.length;
  $('#btn-redo').disabled = !st.futuro.length;
  $('#btn-undo').title = st.pasado.length ? `Deshacer: ${st.pasado.at(-1).nombre} (Ctrl+Z)` : 'Nada para deshacer';
  $('#btn-redo').title = st.futuro.length ? `Rehacer: ${st.futuro.at(-1).nombre} (Ctrl+Shift+Z)` : 'Nada para rehacer';
  $('#ms3d').textContent = `${st.res.resumen.piezasModelo.toLocaleString('es-AR')} piezas`;
  renderArbol();
  renderProps();
  renderLista();
  renderPie();
  renderAlzado();
  $('#alzado-info').textContent = textoSeleccion();
  const hayBastidor = st.diseno.estructuras.some((e) => e.sistema === 'bastidor');
  $$('#seg-bom [data-bom]').forEach((b) => {
    b.classList.toggle('on', b.dataset.bom === (st.diseno.modoBom || 'kit'));
    b.disabled = !hayBastidor;
    b.title = hayBastidor ? (b.dataset.bom === 'kit' ? 'Bastidores como kit MOD-AND-STD' : 'Bastidores en piezas sueltas') : 'Solo aplica a bastidores: esta obra no tiene ninguno';
  });
}

// ───────────────────────────── toasts de reglas y avisos ─────────────────────────────
const REGLA_SILENCIOSA = /^(Fusioné|Diagonales|Barandas|Bastidor 1,30|Bandeja de fenólico|Pórtico peatonal:|Pórtico vehicular:)|desembarco|el acceso es por la torre/;
/** Clave de una regla sin los números: "Agregué 12 anclajes…" y "Agregué 14 anclajes…" son la misma regla. */
const claveRegla = (t) => String(t).replace(/\d+(?:[.,]\d+)*/g, '#');
/** "Deshacer" de un toast: solo revierte si no hubo otro cambio desde que apareció el toast. */
function deshacerDesde(n) {
  return () => {
    if (st.pasado.length === n) deshacer();
    else toast({ tipo: 'info', texto: 'Ya hiciste otros cambios después de esto.', sub: 'Usá Deshacer (Ctrl+Z) paso a paso; el botón de arriba muestra qué deshace.', clave: 'deshacer-viejo' });
  };
}
function toastRegla(r) {
  const esViga = /^Propuse viga/.test(r.texto);
  const acciones = [];
  const n = st.pasado.length;
  if (r.deshacer) acciones.push({
    etiqueta: esViga ? 'Sin viga' : 'Deshacer',
    fn: () => st.pasado.length !== n ? deshacerDesde(n)() : commit(aplicarReparacion(st.diseno, r.deshacer), `Deshacer regla: ${r.texto.slice(0, 48)}`),
  });
  toast({ tipo: 'regla', texto: r.texto, sub: esViga ? 'La abertura de más de un vano necesita viga. Regla automática.' : 'Regla automática (provisoria)', acciones, clave: 'regla:' + claveRegla(r.texto) });
}
function toastsDeCambio(info) {
  if (info.historial) {
    const otra = info.historial === 'deshacer' ? 'Rehacer' : 'Deshacer';
    toast({ tipo: 'info', texto: `${info.historial === 'deshacer' ? 'Deshice' : 'Rehice'}: ${info.nombre}`, acciones: [{ etiqueta: otra, fn: () => (otra === 'Rehacer' ? rehacer() : deshacer()) }], ms: 4000 });
    return;
  }
  if (!info.prevRes) return;
  const antes = new Set(info.prevRes.reglasAplicadas.map((r) => claveRegla(r.texto)));
  const nuevas = st.res.reglasAplicadas.filter((r) => !antes.has(claveRegla(r.texto)) && !REGLA_SILENCIOSA.test(r.texto) && !/comparte|se apoya/.test(r.texto));
  nuevas.slice(0, 2).forEach(toastRegla);
  const errAntes = new Set(info.prevRes.avisos.filter((a) => a.nivel === 'error').map((a) => a.texto));
  for (const a of st.res.avisos.filter((x) => x.nivel === 'error' && !errAntes.has(x.texto)).slice(0, 1)) {
    toast({ tipo: 'error', texto: a.texto, sub: PREDIMENSIONADO, acciones: (a.reparaciones || []).slice(0, 2).map((r) => ({ etiqueta: r.etiqueta, fn: () => commit(aplicarReparacion(st.diseno, r.accion), r.etiqueta) })), ms: 9000 });
  }
}

// ───────────────────────────── árbol ─────────────────────────────
function renderArbol() {
  const raiz = $('#arbol');
  const sc = raiz.scrollTop;
  raiz.innerHTML = '';
  const res = st.res;
  for (const est of st.diseno.estructuras) {
    const r = res.estructuras.find((x) => x.id === est.id);
    if (!r) continue;
    const sel = st.sel.estructuraId === est.id;
    const nOv = Object.keys(est.overrides || {}).length;
    const errs = res.avisos.filter((a) => a.estructuraId === est.id && a.nivel === 'error').length;
    const avs = res.avisos.filter((a) => a.estructuraId === est.id && a.nivel === 'aviso').length;
    let meta = '';
    if (r.tipo === 'fachada') meta = `${fmt(r.ml, 1)} ml · ${fmt(r.alturaReal, 1)} m`;
    else if (r.tipo === 'torre') meta = `${fmt(r.frentes[0].S[1])}×${fmt(r.prof)} · h ${fmt(r.alturaReal, 1)}`;
    else meta = r.clase === 'vehicular' ? `luz ${fmt(r.viga?.luz ?? 0)} · gálibo ${fmt(r.galibo)}` : `${fmt(r.ml, 1)} ml · ${fmt(r.yTope)} libres`;
    raiz.append(h('div.nodo', {
      class: sel && st.sel.frente == null ? 'sel' : '', role: 'button', tabindex: 0, title: `${est.nombre} · ${est.sistema === 'bastidor' ? 'bastidor' : 'multidireccional'}`,
      on: { click: () => { st.alzadoFrente = undefined; seleccionar({ estructuraId: est.id, frente: null, celdas: sel ? st.sel.celdas : [] }); }, keydown: (e) => { if (e.key === 'Enter') { st.alzadoFrente = undefined; seleccionar({ estructuraId: est.id, frente: null }); } } },
    },
    h('span.caret', r.tipo === 'fachada' ? '▾' : '▸'),
    h('span.tipo-ic', { html: iconoSvg(iconoDe(est)) }),
    h('span.nom2', h('span.nom', est.nombre), h('span.meta', meta)),
    errs ? h('span.punto.err', { title: `${errs} error${errs > 1 ? 'es' : ''}` }) : avs ? h('span.punto.av', { title: `${avs} aviso${avs > 1 ? 's' : ''}` }) : null,
    nOv ? h('span.punto.ov', { title: `${nOv} ajuste${nOv > 1 ? 's' : ''} de celda` }) : null));
    if (r.tipo === 'fachada') {
      r.frentes.forEach((F, f) => raiz.append(h('div.nodo.hijo', {
        class: sel && st.sel.frente === f ? 'sel' : '', role: 'button', tabindex: 0,
        on: { click: () => { st.alzadoFrente = f; seleccionar({ estructuraId: est.id, frente: f, celdas: [] }); }, keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); st.alzadoFrente = f; seleccionar({ estructuraId: est.id, frente: f, celdas: [] }); } } },
      }, h('span.nom', `Frente ${LETRAS[f]}${f > 0 ? (F.angulo > 0 ? ' ⟂' : F.angulo < 0 ? ' ⟂−' : ' →') : ''}`), h('span.meta', `${fmt(F.largo)} · ${F.vanos.length} v`))));
    }
  }
  const uniones = res.uniones;
  raiz.append(h('div.sub-h', `Uniones (${uniones.length})`));
  if (!uniones.length) raiz.append(h('div.nota', { style: { padding: '0 8px' } }, 'Sin uniones. Apretá T y soltá la torre sobre una cara.'));
  for (const u of uniones) {
    const modoTxt = u.modo === 'vertical_compartida' ? 'vertical compartida' : u.modo === 'vano_giro' ? (u.tipo === 'esquina' ? 'vano de giro' : 'vano de conexión 0,73') : u.modo === 'apoyo' ? 'apoyo' : u.modo === 'nudos_giratorios' ? 'nudos giratorios' : u.modo;
    const titulo = u.tipo === 'esquina' ? `${st.diseno.estructuras.find((e) => e.id === u.estructuraId)?.nombre}: ${LETRAS[u.a.frente]} ↔ ${LETRAS[u.b.frente]}` : `${u.nombreB} ↔ ${u.nombreA}`;
    raiz.append(h('div.union', { class: st.ultimaUnion === u.id ? 'nueva' : '' },
      h('span.et', titulo),
      u.alternar ? h('button.btn.xs', { type: 'button', title: 'Cambiar el tipo de unión', on: { click: () => alternarUnion(u) } }, 'Cambiar') : h('span'),
      h('div.sub',
        h('span', modoTxt),
        u.modo === 'vertical_compartida' ? h('span.mono', `· ${u.compartidas} vert. compartida${u.compartidas === 1 ? '' : 's'}`) : null,
        u.tipo === 'estructura' ? h('button.btn.xs.ghost', { type: 'button', on: { click: () => commit(aplicarReparacion(st.diseno, { tipo: 'quitarUnion', unionId: u.id }), `Desunir ${u.nombreB}`) } }, 'Desunir') : null)));
  }
  raiz.scrollTop = sc;
}

function alternarUnion(u) {
  if (!u.alternar) return;
  const modo = u.alternar.modo;
  const txt = u.tipo === 'esquina' ? `Esquina ${LETRAS[u.a.frente]}↔${LETRAS[u.b.frente]}: ${modo === 'vano_giro' ? 'vano de giro' : 'vertical compartida'}` : `${u.nombreB}: ${modo === 'vano_giro' ? 'vano de conexión' : 'vertical compartida'}`;
  commit(aplicarReparacion(st.diseno, u.alternar), txt);
}

// ───────────────────────────── galería ─────────────────────────────
const NUEVAS = new Set(['voladizo', 'portico_vehicular']);
const TECLA = { torre_escalera: 'T', portico_peatonal: 'P', portico_vehicular: '⇧P', estructura: 'F' };
function renderGaleria() {
  const g = $('#galeria');
  g.innerHTML = '';
  for (const p of PLANTILLAS) {
    g.append(h('button.pl', {
      type: 'button', 'data-pl': p.id, title: `${p.descripcion}\nClic: ubicar en la obra`,
      on: { click: () => V.empezarColocacion(p.id) },
    },
    h('span', { html: iconoSvg(p.icono) }),
    h('span.n', p.nombre),
    h('span.k', p.sistema === 'bastidor' ? 'bastidor' : 'multidireccional', TECLA[p.id] ? h('kbd', TECLA[p.id]) : null, NUEVAS.has(p.id) ? h('span.nuevo', 'nuevo') : null)));
  }
}

function hintColocacion(ev) {
  const el = $('#hint3d');
  $('#vista3d').classList.toggle('colocando', ev.estado !== 'fin');
  if (ev.estado === 'fin') { el.hidden = true; el.innerHTML = ''; $$('.pl').forEach((b) => b.classList.remove('activa')); return; }
  $$('.pl').forEach((b) => b.classList.toggle('activa', b.querySelector('.n')?.textContent === ev.nombre));
  el.hidden = false;
  el.innerHTML = '';
  let estado;
  if (ev.estado === 'inicio') estado = h('span', 'Pasá el cursor sobre el andamio existente: las líneas azules marcan dónde encastra.');
  else if (ev.snap) {
    const m = ev.snap.modo === 'apoyo' ? 'como base / apoyo' : ev.snap.modo === 'vano_giro' ? 'vano de conexión' : 'vertical compartida';
    estado = h('span', 'Encastra en ', h('b', ev.snap.etiqueta), ` · ${m}`);
  } else estado = h('span', ev.alt ? 'Sin unir (Alt)' : 'Libre: acercate a una línea azul para unir');
  el.append(h('b', ev.nombre), estado, h('span.dim', 'Clic coloca · Alt sin unir · R gira · Esc cancela'));
}

function colocado({ estructuraId, snap, nombre }) {
  seleccionar({ estructuraId, frente: null, celdas: [] });
  const u = st.res.uniones.find((x) => x.tipo === 'estructura' && (x.b.estructuraId === estructuraId || x.a.estructuraId === estructuraId));
  if (snap && u) {
    st.ultimaUnion = u.id;
    setTimeout(() => { if (st.ultimaUnion === u.id) { st.ultimaUnion = null; renderArbol(); } }, 5000);
    renderArbol();
    let texto;
    if (u.modo === 'vertical_compartida') texto = `Comparte ${u.compartidas} vertical${u.compartidas === 1 ? '' : 'es'} con ${u.nombreA}`;
    else if (u.modo === 'apoyo') texto = `${u.apoyado} se apoya sobre ${u.soporte}`;
    else texto = `${u.nombreB}: unión con ${u.nombreA} por vano de conexión 0,73`;
    const acciones = [];
    const n = st.pasado.length;
    if (u.alternar) acciones.push({ etiqueta: u.modo === 'vano_giro' ? 'Vertical compartida' : 'Usar vano de conexión', fn: () => (st.pasado.length === n ? alternarUnion(u) : deshacerDesde(n)()) });
    acciones.push({ etiqueta: 'Deshacer', fn: deshacerDesde(n) });
    const est = st.diseno.estructuras.find((e) => e.id === estructuraId);
    const sub = est?.tipo === 'torre' ? `Hereda la altura de la fachada (${fmt(resueltaSel()?.alturaReal ?? 0)} m) y la fachada deja de llevar escaleras internas.` : u.modo === 'apoyo' ? 'Las verticales de arriba arrancan en el tope del pórtico.' : 'La unión quedó en el árbol.';
    toast({ tipo: 'ok', texto, sub, acciones, ms: 9000 });
  } else {
    toast({ tipo: 'info', texto: `Agregué ${nombre.toLowerCase()} sin unir.`, sub: 'Para unir la estructura: deshacé y volvé a ubicarla con el cursor sobre el andamio, cerca de una línea azul.', acciones: [{ etiqueta: 'Deshacer', fn: deshacerDesde(st.pasado.length) }] });
  }
}

// ───────────────────────────── 3D: hover y clic ─────────────────────────────
function fichaPieza(p, e) {
  const el = $('#ficha');
  if (!p || !e || V.manijaEnUso() || V.colocacionActiva()) { el.hidden = true; return; }
  const it = CATALOGO.piezas[p.codigo];
  const largo = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]);
  const est = st.diseno.estructuras.find((x) => x.id === p.estructuraId);
  el.innerHTML = '';
  el.append(
    h('div.c', p.codigo, it.plausible ? h('span.tag.pl', { style: { marginLeft: '6px' }, title: 'Código plausible: todavía no existe en Odoo' }, 'código a crear') : null),
    h('div.d', it.descripcion),
    h('dl',
      h('dt', 'Largo'), h('dd', it.largo ? `${fmt(it.largo)} m` : p.medida ? `${fmt(p.medida)} ${it.unidad === 'm²' || it.rinde > 5 ? 'm²' : 'm'}` : `${fmt(largo)} m`),
      h('dt', 'Peso'), h('dd', it.peso_kg == null ? h('span.tag.sp', 'sin peso') : `${fmt(it.peso_kg, 1)} kg`),
      h('dt', 'Celda'), h('dd', p.celda ? etiquetaCelda(p.celda, est?.tipo === 'fachada') : '—'),
      h('dt', 'Estructura'), h('dd', est?.nombre || p.estructuraId),
      p.kit ? [h('dt', 'Kit'), h('dd', p.kit.codigo.replace('MOD-AND-', ''))] : null,
    ),
    h('div.nota', { style: { marginTop: '6px' } }, 'Peso ilustrativo'),
  );
  el.hidden = false;
  const x = Math.min(window.innerWidth - el.offsetWidth - 12, e.clientX + 16);
  const y = Math.min(window.innerHeight - el.offsetHeight - 12, e.clientY + 14);
  el.style.left = `${x}px`; el.style.top = `${y}px`;
}

function clicPieza(p, e) {
  $('#ficha').hidden = true;
  if (!p) { if (st.sel.celdas.length) seleccionar({ celdas: [] }); return; }
  const est = st.diseno.estructuras.find((x) => x.id === p.estructuraId);
  const celdas = p.celda && est?.tipo === 'fachada' ? [p.celda] : [];
  const misma = st.sel.estructuraId === p.estructuraId;
  seleccionar({
    estructuraId: p.estructuraId,
    frente: celdas.length ? +celdas[0].split(':')[0] : misma ? st.sel.frente : null,
    celdas: e?.shiftKey && misma ? [...new Set([...st.sel.celdas, ...celdas])] : celdas,
  });
}

// ───────────────────────────── propiedades ─────────────────────────────
function campoNum(id, valor, alAplicar, { unidad = 'm', min = 0.01, ph = '', ancho } = {}) {
  let hecho = false;
  const inp = h('input.campo', { id, type: 'text', inputmode: 'decimal', autocomplete: 'off', value: valor == null ? '' : fmt(valor), placeholder: ph, style: ancho ? { width: ancho } : null, title: 'Admite expresiones: 12+2,5' });
  const ir = () => {
    if (hecho) return;
    const txt = inp.value.trim();
    if (!txt && ph) { hecho = true; if (valor != null) alAplicar(null); return; }
    const v = evalExpr(txt);
    if (v == null || v < min) { inp.classList.add('err'); inp.title = `Valor inválido (mínimo ${fmt(min)})`; return; }
    inp.classList.remove('err');
    if (valor != null && Math.abs(v - valor) < 1e-6) return;
    hecho = true;
    alAplicar(v);
  };
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); ir(); }
    if (e.key === 'Escape') { inp.value = valor == null ? '' : fmt(valor); inp.blur(); }
  });
  // al salir con Tab, se aplica después del cambio de foco: así renderProps devuelve el foco al campo siguiente
  inp.addEventListener('change', () => setTimeout(ir, 0));
  inp.addEventListener('focus', () => inp.select());
  return h('div.unidad', inp, unidad ? h('span', unidad) : null);
}
function chips(opciones, actual, alElegir, { nombre } = {}) {
  return h('div.chips', { role: 'group', 'aria-label': nombre || '' }, opciones.map(([v, et]) => h('button.chip', {
    type: 'button', class: (Array.isArray(actual) ? actual.includes(v) : actual === v) ? 'on' : '', 'aria-pressed': String(actual === v),
    on: { click: () => { if (actual !== v) alElegir(v); } },
  }, et)));
}
function toggle(id, texto, valor, alCambiar) {
  return h('label.toggle', { for: id }, h('input', { id, type: 'checkbox', checked: !!valor, on: { change: (e) => alCambiar(e.target.checked) } }), texto);
}
const fila = (lab, ...cont) => h('div.fila', h('span.lab', lab), h('div', { style: { minWidth: 0 } }, ...cont));
const grupo = (titulo, ...cont) => h('section.grupo', titulo ? h('h4', ...[].concat(titulo)) : null, ...cont);
const P = (ruta, valor, nombre) => commit(setParam(st.diseno, st.sel.estructuraId, ruta, valor), nombre);

function renderProps() {
  const raiz = $('#props');
  const FOCOS = 'input, button, select, [tabindex]';
  const act = document.activeElement && raiz.contains(document.activeElement) ? document.activeElement : null;
  const foco = act?.id || null;
  const focoIdx = act && !foco ? [...raiz.querySelectorAll(FOCOS)].indexOf(act) : -1;
  const sc = raiz.scrollTop;
  raiz.innerHTML = '';
  const est = estructuraSel();
  const r = resueltaSel();
  if (!est || !r) {
    raiz.append(h('div.grupo', h('p.nota', 'La obra no tiene estructuras. Elegí una plantilla a la izquierda.')));
    return;
  }
  // cabecera
  raiz.append(h('div.p-head',
    h('span.tipo-ic', { html: iconoSvg(iconoDe(est)) }),
    h('input', { id: 'p-nombre', value: est.nombre, 'aria-label': 'Nombre', on: { change: (e) => { const v = e.target.value.trim(); if (v && v !== est.nombre) P('nombre', v, `Renombrar a ${v}`); }, keydown: (e) => { if (e.key === 'Enter') e.target.blur(); } } }),
    h('span.badge', NOMBRE_TIPO[est.tipo] + (r.clase === 'vehicular' ? ' vehicular' : '')),
    h('button.btn.icono.ghost.sm', { type: 'button', title: 'Borrar estructura (Supr)', 'aria-label': 'Borrar estructura', on: { click: borrarEstructura } }, '×'),
  ));

  // semáforo
  const avisos = st.res.avisos.filter((a) => a.estructuraId === est.id);
  if (avisos.length) {
    raiz.append(grupo(['Semáforo', h('span.dim', { style: { textTransform: 'none', letterSpacing: 0, fontWeight: 400 } }, PREDIMENSIONADO.toLowerCase())],
      avisos.map((a) => h('div.aviso', { class: a.nivel },
        h('div', a.texto),
        a.reparaciones?.length ? h('div.acc', a.reparaciones.map((rp) => h('button.btn.xs', { type: 'button', on: { click: () => commit(aplicarReparacion(st.diseno, rp.accion), rp.etiqueta) } }, rp.etiqueta))) : null))));
  }

  // sistema
  const sis = [['multi', 'Multidireccional'], ['bastidor', 'Bastidor']];
  const gSis = grupo('Sistema', chips(sis, est.sistema, (s) => {
    const { avisos: av } = cambiarSistema(est, s);
    commit(aplicarReparacion(st.diseno, { tipo: 'sistema', estructuraId: est.id, sistema: s }), `Sistema → ${s === 'bastidor' ? 'bastidor' : 'multidireccional'}`);
    if (av.length) toast({ tipo: 'info', texto: `Cambié a ${s === 'bastidor' ? 'bastidor' : 'multidireccional'} con las mismas medidas.`, sub: av.join(' '), ms: 10000 });
  }, { nombre: 'Sistema' }));
  if (est.sistema === 'bastidor') gSis.append(h('div.supuesto', `Supuesto sin confirmar: bastidor de 1,80 de alto, 0,90 (pasillo, por defecto) o 1,30 de ancho. Esta estructura usa ${fmt(r.prof)}. Kit MOD-AND-STD = 1 bastidor + 2 riendas H + 2 riendas D.`));
  else gSis.append(h('div.nota', 'Coronet: vanos 2,50 / 2,00 / 1,50 / 1,25 / 1,09 / 0,73 · profundidades 0,73 / 1,09 / 1,25.'));
  if (est.tipo === 'portico' && est.params.clase === 'vehicular') gSis.append(h('div.nota', 'El pórtico vehicular va solo en multidireccional (vigas de celosía).'));
  raiz.append(gSis);

  if (est.tipo === 'fachada') propsFachada(raiz, est, r);
  else if (est.tipo === 'torre') propsTorre(raiz, est, r);
  else propsPortico(raiz, est, r);

  propsCeldas(raiz, est, r);

  if (foco) { const el = document.getElementById(foco); if (el) { el.focus(); el.select?.(); } }
  else if (focoIdx >= 0) raiz.querySelectorAll(FOCOS)[focoIdx]?.focus();
  raiz.scrollTop = sc;
}

function propsFachada(raiz, est, r) {
  const p = est.params;
  const g = grupo(['Frentes', h('button.btn.xs', { type: 'button', on: { click: () => agregarFrente(est) } }, '+ Frente')]);
  r.frentes.forEach((F, f) => {
    const fr = p.frentes[f];
    const d = F.relleno.desvio;
    const estado = Math.abs(d) < 0.005 ? h('span.ok', 'exacto') : h('span', { class: Math.abs(d) > CRITERIOS.toleranciaRelleno ? 'warn' : 'ok' }, d > 0 ? `sobran ${fmt(d)}` : `faltan ${fmt(-d)}`);
    const caja = h('div.frente', { class: st.sel.frente === f ? 'sel' : '' },
      h('div.frente-top',
        h('span.letra', LETRAS[f]),
        campoNum(`f-largo-${f}`, fr.largo, (v) => P(`params.frentes.${f}.largo`, v, `Largo Frente ${LETRAS[f]} ${fmt(fr.largo)} → ${fmt(v)} m`), { ancho: '70px' }),
        f > 0 ? chips([[90, '90°'], [-90, '−90°'], [0, '0°']], fr.angulo ?? 90, (v) => P(`params.frentes.${f}.angulo`, v, `Ángulo Frente ${LETRAS[f]} → ${v}°`), { nombre: 'Ángulo' }) : h('span.dim', { style: { fontSize: '11.5px' } }, 'arranque'),
        h('span', { style: { flex: 1 } }),
        p.frentes.length > 1 ? h('button.btn.xs.ghost', { type: 'button', title: 'Quitar frente', on: { click: () => quitarFrente(est, f) } }, '×') : null),
      h('div.relleno', F.texto, estado, F.relleno.elegido ? h('button.btn.xs.ghost', { type: 'button', style: { marginLeft: '4px' }, on: { click: () => P(`params.frentes.${f}.vanos`, undefined, `Frente ${LETRAS[f]}: relleno automático`) } }, 'auto') : null),
      F.relleno.alternativas.length ? h('div.chips', F.relleno.alternativas.slice(0, 4).map((a) => h('button.chip.alt', {
        type: 'button', title: `${a.texto} (${Math.abs(a.desvio) < 0.005 ? 'exacto' : a.desvio > 0 ? 'sobran ' + fmt(a.desvio) : 'faltan ' + fmt(-a.desvio)})`,
        on: { click: () => commit(aplicarReparacion(st.diseno, a.id === 'centrado' ? { tipo: 'param', estructuraId: est.id, ruta: 'params.ajuste', valor: p.ajuste === 'centrado' ? 'final' : 'centrado' } : { tipo: 'vanos', estructuraId: est.id, frente: f, vanos: a.vanos }), `Frente ${LETRAS[f]}: ${a.etiqueta.toLowerCase()}`) },
      }, `${a.etiqueta}: `, h('b', a.texto)))) : null,
      h('div.frente-top', h('span.dim', { style: { fontSize: '11.5px' } }, 'Altura propia'), campoNum(`f-alt-${f}`, fr.altura ?? null, (v) => P(`params.frentes.${f}.altura`, v ?? undefined, `Altura Frente ${LETRAS[f]} → ${v == null ? 'la general' : fmt(v)}`), { ph: `= ${fmt(p.altura)}`, ancho: '70px' }), h('span.dim.mono', { style: { fontSize: '11px' } }, `${F.niveles.length} niveles`)),
    );
    g.append(caja);
    if (f > 0 && (fr.angulo ?? 90) > 0 && est.sistema !== 'bastidor') {
      const modo = p.esquinas?.[f - 1] || 'vertical_compartida';
      g.append(fila(`Esquina ${LETRAS[f - 1]}↔${LETRAS[f]}`, chips([['vertical_compartida', 'Vertical compartida'], ['vano_giro', `Vano de giro ${fmt(r.prof)}`]], modo,
        (v) => commit(aplicarReparacion(st.diseno, { tipo: 'esquina', estructuraId: est.id, indice: f - 1, modo: v }), `Esquina ${LETRAS[f - 1]}↔${LETRAS[f]}: ${v === 'vano_giro' ? 'vano de giro' : 'vertical compartida'}`))));
    }
  });
  g.append(h('div.nota', 'Tipeá el largo y Enter (admite 12+2,5). Con la manija del 3D, de a vano; mientras la arrastrás podés tipear el número.'));
  raiz.append(g);

  const bast = est.sistema === 'bastidor';
  const g2 = grupo('Medidas',
    fila('Altura', h('div.frente-top', campoNum('p-altura', p.altura, (v) => P('params.altura', v, `Altura ${fmt(p.altura)} → ${fmt(v)} m`), { ancho: '70px' }), h('span.dim.mono', { style: { fontSize: '11.5px' } }, `real ${fmt(r.alturaReal)} · ${r.frentes[0].niveles.length} niveles`))),
    fila('Profundidad', chips((bast ? CATALOGO.medidas.bastidor.anchos : CATALOGO.medidas.multi.profundidades).map((v) => [v, fmt(v)]), r.prof, (v) => P('params.profundidad', v, `Profundidad → ${fmt(v)}`))),
    fila('Retiro', h('div.frente-top', campoNum('p-retiro', p.retiro ?? 0.2, (v) => P('params.retiro', v, `Retiro → ${fmt(v)} m`), { min: 0, ancho: '70px' }), h('span.dim', { style: { fontSize: '11.5px' } }, (p.retiro ?? 0.2) > CRITERIOS.retiroLibre ? 'baranda del lado fachada' : 'lado fachada libre'))),
    bast ? null : fila('Plataformas', chips([['cada_2m', 'Cada 2 m'], ['cada_nivel', 'Cada nivel'], ['solo_trabajo', 'Solo arriba'], ['ninguna', 'Ninguna']], p.modoPlataforma, (v) => P('params.modoPlataforma', v, `Plataformas: ${v.replace('_', ' ')}`))),
    fila('Cubierta', chips([['nada', 'Nada'], ['media_sombra', 'Media sombra'], ['lona', 'Lona']], p.cubierta, (v) => P('params.cubierta', v, `Cubierta: ${v.replace('_', ' ')}`))),
    bast ? null : fila('Ajuste', chips([['final', 'Al final'], ['centrado', 'Centrado']], p.ajuste || 'final', (v) => P('params.ajuste', v, `Vano de ajuste ${v}`))),
    fila('Accesos', chips([['auto', 'Automático'], ['ninguno', 'Ninguno']], Array.isArray(p.accesos) && !p.accesos.length ? 'ninguno' : 'auto', (v) => P('params.accesos', v === 'auto' ? 'auto' : [], `Accesos: ${v}`))),
    h('div.chips', { style: { gap: '12px' } },
      toggle('p-bandeja', 'Bandeja en PB', p.bandejaPB, (v) => P('params.bandejaPB', v, v ? 'Bandeja en PB' : 'Sin bandeja')),
      toggle('p-via', 'Vía pública', p.viaPublica, (v) => P('params.viaPublica', v, v ? 'Vía pública' : 'Sin vía pública')),
      toggle('p-anclada', 'Anclada', p.anclada !== false, (v) => P('params.anclada', v, v ? 'Anclada' : 'Sin anclajes')),
      toggle('p-conc', 'Concertina', p.concertina, (v) => P('params.concertina', v, v ? 'Concertina' : 'Sin concertina'))),
  );
  raiz.append(g2);

  // ménsulas (voladizo)
  const ms = p.mensulas || [];
  const g3 = grupo(['Ménsulas', h('button.btn.xs', { type: 'button', disabled: bast, on: { click: () => P('params.mensulas', [...ms, { lado: (p.retiro ?? 0.2) > 0.6 ? 'fachada' : 'afuera', brazo: (p.retiro ?? 0.2) > 1.15 ? 1.09 : 0.73, desdeNivel: 1 }], 'Agregar ménsulas') } }, '+ Ménsulas')]);
  if (!ms.length) g3.append(h('div.nota', 'Para salvar un retiro o una marquesina: ménsulas hacia la fachada. Para ganar ancho: hacia afuera. Para celdas sueltas usá el pincel 4.'));
  ms.forEach((m, i) => {
    const R = (k, v, n) => P(`params.mensulas.${i}.${k}`, v, n);
    g3.append(h('div.frente',
      h('div.frente-top', chips([['fachada', 'Hacia la fachada'], ['afuera', 'Hacia afuera']], m.lado, (v) => R('lado', v, `Ménsula hacia ${v === 'afuera' ? 'afuera' : 'la fachada'}`)), h('span', { style: { flex: 1 } }),
        h('button.btn.xs.ghost', { type: 'button', title: 'Quitar', on: { click: () => P('params.mensulas', ms.filter((_, j) => j !== i), 'Quitar ménsulas') } }, '×')),
      fila('Brazo', chips(CATALOGO.medidas.multi.mensulas.map((v) => [v, fmt(v)]), m.brazo, (v) => R('brazo', v, `Ménsula de ${fmt(v)}`))),
      fila('Niveles', h('div.frente-top', h('span.dim', 'desde N'), campoNum(`m-desde-${i}`, (m.desdeNivel ?? 0) + 1, (v) => R('desdeNivel', Math.max(0, Math.round(v) - 1), `Ménsulas desde N${Math.round(v)}`), { unidad: '', min: 1, ancho: '46px' }),
        h('span.dim', 'hasta N'), campoNum(`m-hasta-${i}`, m.hastaNivel == null ? null : m.hastaNivel + 1, (v) => R('hastaNivel', v == null ? undefined : Math.max(0, Math.round(v) - 1), `Ménsulas hasta ${v == null ? 'arriba' : 'N' + Math.round(v)}`), { unidad: '', min: 1, ph: 'arriba', ancho: '58px' }))),
      r.frentes.length > 1 ? fila('Frentes', chips([['todos', 'Todos'], ...r.frentes.map((_, f) => [String(f), LETRAS[f]])], m.frentes ? (m.frentes.length === 1 ? String(m.frentes[0]) : 'todos') : 'todos', (v) => R('frentes', v === 'todos' ? undefined : [+v], `Ménsulas en ${v === 'todos' ? 'todos los frentes' : 'Frente ' + LETRAS[+v]}`))) : null,
    ));
  });
  if (ms.length) g3.append(h('div.nota', 'Ménsulas de 0,73 y 1,09 son códigos plausibles (no están en Odoo). Verificación M09 pendiente.'));
  raiz.append(g3);
}

function propsTorre(raiz, est, r) {
  const p = est.params;
  const unida = st.diseno.uniones.find((u) => u.modo !== 'apoyo' && (u.a.estructuraId === est.id || u.b.estructuraId === est.id));
  const fach = unida ? st.diseno.estructuras.find((e) => e.id === (unida.a.estructuraId === est.id ? unida.b.estructuraId : unida.a.estructuraId)) : null;
  raiz.append(grupo('Torre',
    est.sistema === 'bastidor' ? h('div.nota', 'Cuerpo de bastidor 1,30 × 2,50 × 1,80 con escalera interna.') : [
      fila('Largo', chips([[2.5, '2,50'], [2.0, '2,00'], [1.5, '1,50']], p.largo, (v) => P('params.largo', v, `Torre largo ${fmt(v)}`))),
      fila('Ancho', chips([[1.09, '1,09'], [1.25, '1,25'], [1.5, '1,50'], [2.5, '2,50']], p.ancho, (v) => P('params.ancho', v, `Torre ancho ${fmt(v)}`))),
    ],
    fila('Altura', fach ? h('div.nota', `Heredada de ${fach.nombre}: `, h('b.mono', fmt(r.alturaReal))) : h('div.frente-top', campoNum('t-altura', p.altura, (v) => P('params.altura', v, `Altura torre → ${fmt(v)}`), { ancho: '70px' }), h('span.dim.mono', { style: { fontSize: '11.5px' } }, `real ${fmt(r.alturaReal)}`))),
    fila('Acceso', chips([['escalera', 'Escalera con descansos'], ['interna', 'Escalera interna']], p.acceso, (v) => P('params.acceso', v, `Acceso: ${v}`))),
    fila('Desembarco', chips([['cada_nivel', 'En cada nivel'], ['ultimo', 'Solo arriba']], p.desembarco, (v) => P('params.desembarco', v, `Desembarco: ${v === 'ultimo' ? 'solo arriba' : 'cada nivel'}`))),
    h('div.chips', { style: { gap: '12px' } },
      toggle('t-anclada', 'Anclada', p.anclada, (v) => P('params.anclada', v, v ? 'Torre anclada' : 'Torre sin anclar')),
      toggle('t-pata', 'Pata de gallo', p.pataDeGallo, (v) => P('params.pataDeGallo', v, v ? 'Pata de gallo' : 'Sin pata de gallo'))),
    !unida ? h('div.nota', 'Sin unir. Para adosarla: deshacé y volvé a ubicarla con T, con el cursor sobre el andamio de la fachada.') : null,
  ));
}

function propsPortico(raiz, est, r) {
  const p = est.params;
  const fach = st.diseno.estructuras.find((e) => e.tipo === 'fachada');
  const yaBase = st.diseno.estructuras.some((e) => (e.apoyaEn || []).includes(est.id));
  const comoBase = fach && !yaBase ? h('button.btn.sm', {
    type: 'button', title: 'La fachada se apoya sobre el pórtico (las verticales arrancan en el tope)',
    on: { click: () => commit(unir(st.diseno, { estructuraId: fach.id, puerto: 'f0:base', s: 0 }, { estructuraId: est.id }, 'apoyo'), `${est.nombre} como base de ${fach.nombre}`) },
  }, `Usar como base de ${fach.nombre}`) : yaBase ? h('div.nota', 'Es la base de una fachada (unión de apoyo).') : null;
  if (p.clase === 'vehicular') {
    raiz.append(grupo('Pórtico vehicular',
      fila('Luz', h('div.frente-top', chips([[5, '5,00'], [6, '6,00'], [7.5, '7,50']], p.luz, (v) => P('params.luz', v, `Luz ${fmt(v)} m`)), campoNum('pv-luz', p.luz, (v) => P('params.luz', v, `Luz ${fmt(v)} m`), { ancho: '58px' }))),
      h('div.relleno', r.frentes[0].texto),
      fila('Gálibo', h('div.frente-top', campoNum('pv-galibo', p.galibo, (v) => P('params.galibo', v, `Gálibo ${fmt(v)} m`), { ancho: '70px' }), h('span.dim.mono', { style: { fontSize: '11.5px' } }, `libre ${fmt(r.galibo)} · piso ${fmt(r.yTope)}`))),
      fila('Profundidad', chips([[1.09, '1,09'], [1.25, '1,25']], p.profundidad, (v) => P('params.profundidad', v, `Profundidad ${fmt(v)}`))),
      fila('Torres', chips([[1.09, '1,09'], [1.25, '1,25'], [1.5, '1,50'], [2.5, '2,50']], p.anchoTorre, (v) => P('params.anchoTorre', v, `Torres de ${fmt(v)}`))),
      h('div.chips', { style: { gap: '12px' } },
        toggle('pv-arriba', 'Estructura arriba', p.estructuraArriba, (v) => P('params.estructuraArriba', v, v ? 'Con estructura arriba' : 'Sin estructura arriba')),
        toggle('pv-anclado', 'Anclado', p.anclado, (v) => P('params.anclado', v, v ? 'Anclado' : 'Sin anclar'))),
      comoBase,
      h('div.nota', 'Vigas de celosía de 5,00 / 6,00 / 7,50: códigos a crear en Odoo. Falta verificar la viga en la memoria de cálculo.'),
    ));
    return;
  }
  const bast = est.sistema === 'bastidor';
  raiz.append(grupo('Pórtico peatonal',
    fila('Largo', h('div.frente-top', campoNum('pp-largo', p.largo, (v) => P('params.largo', v, `Pórtico ${fmt(p.largo)} → ${fmt(v)} m`), { ancho: '70px' }))),
    h('div.relleno', r.frentes[0].texto),
    fila('Altura libre', h('div.frente-top', campoNum('pp-libre', p.alturaLibre, (v) => P('params.alturaLibre', v, `Altura libre ${fmt(v)}`), { ancho: '70px' }), h('span.dim.mono', { style: { fontSize: '11.5px' } }, `≥ ${fmt(CRITERIOS.galiboPeatonal)}`))),
    fila('Paso', chips((bast ? [[1.3, '1,30'], [0.9, '0,90']] : [[1.25, '1,25'], [1.5, '1,50'], [2.5, '2,50']]), r.prof, (v) => P('params.ancho', v, `Paso ${fmt(v)}`))),
    h('div.chips', { style: { gap: '12px' } },
      toggle('pp-arriba', 'Estructura arriba', p.estructuraArriba, (v) => P('params.estructuraArriba', v, v ? 'Con estructura arriba' : 'Sin estructura arriba')),
      toggle('pp-anclado', 'Anclado', p.anclado, (v) => P('params.anclado', v, v ? 'Anclado' : 'Sin anclar'))),
    comoBase,
  ));
}

const DESC_OV = { abertura: 'abertura', viga: 'viga', sinPlataforma: 'sin plataforma', lona: 'lona', mensula: 'ménsula', anclaje: 'anclaje' };
function descOverride(o) {
  return Object.entries(o).map(([k, v]) => {
    if (k === 'viga') return v === false ? 'sin viga' : 'con viga';
    if (k === 'mensula') return v === false ? 'sin ménsula' : `ménsula ${v === 'afuera' ? 'afuera' : 'a fachada'}`;
    if (k === 'anclaje') return v ? '+ anclaje' : '− anclaje';
    return DESC_OV[k] || k;
  }).join(', ');
}
function descCelda(celda) {
  const c = st.res.celdas.find((x) => x.estructuraId === st.sel.estructuraId && x.celda === celda);
  if (!c) return '';
  const e = c.estado, t = [];
  t.push(`${fmt(c.vano)} × ${fmt(c.y1 - c.y0)}`);
  if (e.abertura) t.push('abertura');
  if (e.plataforma) t.push(e.bandeja ? 'bandeja' : 'plataforma');
  if (e.acceso) t.push('acceso');
  if (e.mensula) t.push(`ménsula ${e.mensula}`);
  if (e.lona) t.push('lona');
  if (e.bajoApoyo) t.push('bajo el apoyo');
  return t.join(' · ');
}

function propsCeldas(raiz, est, r) {
  const ov = est.overrides || {};
  const keys = Object.keys(ov);
  const sel = st.sel.celdas;
  if (est.tipo === 'fachada' && sel.length) {
    const todas = (k) => sel.every((c) => ov[c]?.[k]);
    const set = (valor, nombre) => commit(aplicarReparacion(st.diseno, { tipo: 'overrides', estructuraId: est.id, celdas: sel, valor }), `${nombre} ${rangoCeldas(sel)}`);
    raiz.append(grupo([sel.length === 1 ? `Celda ${etiquetaCelda(sel[0])}` : `${sel.length} celdas · ${rangoCeldas(sel)}`, h('button.btn.xs.ghost', { type: 'button', on: { click: () => seleccionar({ celdas: [] }) } }, 'Deseleccionar')],
      sel.length === 1 ? h('div.nota', descCelda(sel[0])) : null,
      h('div.chips',
        h('button.chip', { type: 'button', class: todas('abertura') ? 'on' : '', on: { click: () => accionAbertura() } }, 'Abertura ', h('kbd', 'O')),
        h('button.chip', { type: 'button', class: todas('sinPlataforma') ? 'on' : '', on: { click: () => set({ sinPlataforma: todas('sinPlataforma') ? null : true }, 'Sin plataforma') } }, 'Sin plataforma'),
        h('button.chip', { type: 'button', class: todas('lona') ? 'on' : '', on: { click: () => set({ lona: todas('lona') ? null : true }, 'Lona') } }, 'Lona'),
        h('button.chip', { type: 'button', class: sel.every((c) => ov[c]?.mensula === 'afuera') ? 'on' : '', on: { click: () => set({ mensula: sel.every((c) => ov[c]?.mensula === 'afuera') ? null : 'afuera' }, 'Ménsula afuera') } }, 'Ménsula afuera'),
        h('button.chip', { type: 'button', class: sel.every((c) => ov[c]?.mensula === 'fachada') ? 'on' : '', on: { click: () => set({ mensula: sel.every((c) => ov[c]?.mensula === 'fachada') ? null : 'fachada' }, 'Ménsula a fachada') } }, 'Ménsula a fachada'),
        h('button.chip', { type: 'button', class: todas('anclaje') ? 'on' : '', on: { click: () => set({ anclaje: todas('anclaje') ? null : true }, 'Anclaje') } }, '+ Anclaje'),
        sel.some((c) => ov[c]) ? h('button.chip', { type: 'button', on: { click: () => commit(aplicarReparacion(st.diseno, { tipo: 'overrides', estructuraId: est.id, celdas: sel, valor: null }), `Volver a lo generado ${rangoCeldas(sel)}`) } }, '↺ Volver a lo generado') : null),
    ));
  }
  if (keys.length) {
    raiz.append(grupo([h('span', h('span.punto.ov', { style: { display: 'inline-block', marginRight: '6px' } }), `${keys.length} ajuste${keys.length > 1 ? 's' : ''} de celda`),
      h('button.btn.xs', { type: 'button', on: { click: () => { const d = clone(st.diseno); d.estructuras.find((e) => e.id === est.id).overrides = {}; commit(d, `Quitar ${keys.length} ajustes de celda`); } } }, 'Quitar todos')],
      h('div', { style: { display: 'grid', gap: '3px' } }, keys.sort().slice(0, 30).map((k) => h('div.ov-item',
        h('button.btn.xs.ghost', { type: 'button', title: 'Elegir celda', on: { click: () => seleccionar({ celdas: [k], frente: +k.split(':')[0] }) } }, h('span.k', etiquetaCelda(k))),
        h('span.v', descOverride(ov[k])),
        h('button.btn.xs.ghost', { type: 'button', title: 'Volver a lo generado', 'aria-label': 'Volver a lo generado', on: { click: () => commit(setOverride(st.diseno, est.id, k, null), `Volver a lo generado ${etiquetaCelda(k)}`) } }, '↺')))),
      h('div.nota', 'Los ajustes de celda se mantienen aunque cambies el largo o la altura.'),
    ));
  }
}

// ───────────────────────────── acciones de edición ─────────────────────────────
function accionAbertura() {
  const est = estructuraSel();
  if (!est || est.tipo !== 'fachada') { toast({ tipo: 'info', texto: 'Las aberturas son para fachadas. Elegí una fachada.' }); return; }
  const sel = st.sel.celdas;
  if (!sel.length) { toast({ tipo: 'info', texto: 'Primero elegí celdas en el alzado (clic o arrastre) y después apretá O.' }); return; }
  const ov = est.overrides || {};
  const quitar = sel.every((c) => ov[c]?.abertura);
  const d = aplicarReparacion(st.diseno, { tipo: 'overrides', estructuraId: est.id, celdas: sel, valor: quitar ? { abertura: null, viga: null } : { abertura: true } });
  commit(d, `${quitar ? 'Cerrar abertura' : 'Abertura'} ${rangoCeldas(sel)}`);
}

function borrarEstructura() {
  const est = estructuraSel();
  if (!est) return;
  if (st.diseno.estructuras.length === 1) { toast({ tipo: 'info', texto: 'Es la única estructura de la obra. Para empezar otra, usá "Nueva obra…".' }); return; }
  commit(quitarEstructura(st.diseno, est.id), `Borrar ${est.nombre}`);
  toast({ tipo: 'info', texto: `Borré ${est.nombre} y sus uniones.`, acciones: [{ etiqueta: 'Deshacer', fn: deshacerDesde(st.pasado.length) }] });
}

function agregarFrente(est) {
  const d = clone(st.diseno);
  const e = d.estructuras.find((x) => x.id === est.id);
  e.params.frentes.push({ largo: 5, angulo: 90 });
  e.params.esquinas = [...(e.params.esquinas || [])];
  while (e.params.esquinas.length < e.params.frentes.length - 1) e.params.esquinas.push('vertical_compartida');
  commit(d, `Agregar Frente ${LETRAS[e.params.frentes.length - 1]}`);
  seleccionar({ frente: e.params.frentes.length - 1 });
  setTimeout(() => { const i = document.getElementById(`f-largo-${e.params.frentes.length - 1}`); i?.focus(); i?.select(); }, 0);
}
function quitarFrente(est, f) {
  const d = clone(st.diseno);
  const e = d.estructuras.find((x) => x.id === est.id);
  e.params.frentes.splice(f, 1);
  if (f === 0 && e.params.frentes[0]) delete e.params.frentes[0].angulo;
  if (e.params.esquinas) e.params.esquinas.splice(Math.max(0, f - 1), 1);
  const ov = {};
  for (const [k, v] of Object.entries(e.overrides || {})) {
    const [ff, vv, nn] = k.split(':').map(Number);
    if (ff === f) continue;
    ov[`${ff > f ? ff - 1 : ff}:${vv}:${nn}`] = v;
  }
  e.overrides = ov;
  st.sel.frente = null; st.sel.celdas = [];
  commit(d, `Quitar Frente ${LETRAS[f]}`);
}
/** K: parte el frente en la columna izquierda de la celda elegida (frente nuevo a 0°, misma altura). */
function partirFrente() {
  const est = estructuraSel(), r = resueltaSel();
  if (!est || est.tipo !== 'fachada') return;
  const c = st.sel.celdas[0];
  if (!c) { toast({ tipo: 'info', texto: 'Elegí una celda: parto el frente a la izquierda de esa columna (K).' }); return; }
  const [f, v] = c.split(':').map(Number);
  const F = r.frentes[f];
  if (v === 0) { toast({ tipo: 'info', texto: 'Elegí una celda que no esté en el primer vano del frente.' }); return; }
  const d = clone(st.diseno);
  const e = d.estructuras.find((x) => x.id === est.id);
  const fr = e.params.frentes[f];
  const sCorte = F.S[v];
  const nuevo = { largo: Math.round((fr.largo - sCorte) * 1000) / 1000, angulo: 0, vanos: F.vanos.slice(v) };
  if (fr.altura != null) nuevo.altura = fr.altura;
  fr.largo = Math.round(sCorte * 1000) / 1000;
  fr.vanos = F.vanos.slice(0, v);
  e.params.frentes.splice(f + 1, 0, nuevo);
  e.params.esquinas = [...(e.params.esquinas || [])];
  e.params.esquinas.splice(f, 0, 'vertical_compartida');
  const ov = {};
  for (const [k, val] of Object.entries(e.overrides || {})) {
    const [ff, vv, nn] = k.split(':').map(Number);
    if (ff < f || (ff === f && vv < v)) ov[k] = val;
    else if (ff === f) ov[`${f + 1}:${vv - v}:${nn}`] = val;
    else ov[`${ff + 1}:${vv}:${nn}`] = val;
  }
  e.overrides = ov;
  st.sel.celdas = []; st.sel.frente = f + 1;
  commit(d, `Partir Frente ${LETRAS[f]} en V${v + 1}`);
  toast({ tipo: 'ok', texto: `Partí el Frente ${LETRAS[f]}: ahora cada parte puede tener su propia altura.`, acciones: [{ etiqueta: 'Deshacer', fn: deshacerDesde(st.pasado.length) }] });
}
function duplicar() {
  const est = estructuraSel(), r = resueltaSel();
  if (!est) return;
  const largo = est.tipo === 'fachada' ? r.frentes[0].S.at(-1) : r.frentes[0].S.at(-1);
  const u = r.frentes[0].u;
  const off = largo + 2;
  const { diseno, estructuraId } = agregarEstructura(st.diseno, est.plantilla, {
    params: clone(est.params), sistema: est.sistema, nombre: `${est.nombre} (copia)`,
    origen: [Math.round((est.origen[0] + u[0] * off) * 100) / 100, Math.round((est.origen[1] + u[1] * off) * 100) / 100], rumbo: est.rumbo,
  });
  const d = clone(diseno);
  d.estructuras.find((e) => e.id === estructuraId).overrides = clone(est.overrides || {});
  commit(d, `Duplicar ${est.nombre}`);
  seleccionar({ estructuraId, celdas: [], frente: null });
}

// ───────────────────────────── lista en vivo ─────────────────────────────
function renderLista() {
  const raiz = $('#lista');
  const sc = raiz.scrollTop;
  let filas = st.res.bom;
  if (st.filtroLista === 'falta') filas = filas.filter((l) => l.falta > 0);
  if (st.filtroLista === 'sinpeso') filas = filas.filter((l) => l.peso_unit == null);
  $$('#seg-filtro [data-filtro]').forEach((b) => b.classList.toggle('on', b.dataset.filtro === st.filtroLista));
  const tb = h('tbody');
  let fam = null;
  for (const l of filas) {
    if (l.familia !== fam) { fam = l.familia; tb.append(h('tr.fam', h('td', { colspan: 4 }, fam))); }
    tb.append(h('tr.it', {
      class: st.bomResaltado === l.codigo ? 'res' : '',
      on: { mouseenter: () => { st.bomResaltado = l.codigo; V.recolorear(); }, mouseleave: () => { st.bomResaltado = null; V.recolorear(); } },
      title: `${l.descripcion}${l.medida != null ? ` · ${fmt(l.medida)} ${l.unidad.includes('rollo 10') ? 'm' : 'm²'} medidos` : ''}`,
    },
    h('td', h('span.cod', l.codigo), ' ', l.esKit ? h('span.tag.kit', 'kit') : null, l.plausible ? h('span.tag.pl', { title: 'Código plausible: todavía no existe en Odoo' }, 'a crear') : null, h('span.desc', l.descripcion)),
    h('td.r.n', l.cantidad.toLocaleString('es-AR'), l.unidad !== 'u' ? h('span.dim', { style: { fontSize: '10px' } }, ` ${l.unidad.split(' ')[0]}`) : null),
    h('td.r.n', l.peso_total == null ? h('span.tag.sp', 'sin peso') : kg(l.peso_total)),
    h('td.r', l.falta > 0 ? h('span.st.falta', { title: `Stock ${l.stock} · faltan ${l.falta}` }, h('i'), `−${l.falta}`) : h('span.st', { class: l.semaforo, title: `Stock ${l.stock}` }, h('i'), l.semaforo === 'justo' ? 'justo' : 'ok'))));
  }
  if (st.ajustes.length) {
    tb.append(h('tr.fam', h('td', { colspan: 4 }, 'Ajustes manuales (no tocan el modelo)')));
    st.ajustes.forEach((a, i) => tb.append(h('tr.it',
      h('td', h('span.cod', a.codigo), h('span.desc', CATALOGO.piezas[a.codigo]?.descripcion || 'código manual')),
      h('td.r.n', (a.cantidad > 0 ? '+' : '') + a.cantidad),
      h('td.r', h('button.btn.xs.ghost', { type: 'button', on: { click: () => { st.ajustes.splice(i, 1); renderLista(); } } }, 'Quitar')),
      h('td'))));
  }
  raiz.innerHTML = '';
  raiz.append(h('table.bom', h('thead', h('tr', h('th', 'Código'), h('th.r', 'Cant.'), h('th.r', 'kg'), h('th.r', 'Stock'))), tb));
  if (!filas.length) raiz.append(h('div.nota', { style: { padding: '12px' } }, st.filtroLista === 'falta' ? 'No falta nada en stock.' : 'Todos los códigos tienen peso.'));
  raiz.scrollTop = sc;

  const pie = $('#lista-f');
  pie.innerHTML = '';
  const cods = Object.keys(CATALOGO.piezas);
  const dl = h('datalist#cods', cods.map((c) => h('option', { value: c })));
  const ic = h('input.campo', { id: 'aj-cod', list: 'cods', placeholder: 'código', style: { width: '128px' }, autocomplete: 'off' });
  const iq = h('input.campo', { id: 'aj-cant', placeholder: '+4', style: { width: '48px' }, inputmode: 'numeric' });
  const add = () => {
    const c = ic.value.trim().toUpperCase(), q = parseInt(iq.value, 10);
    if (!c || !q) { ic.classList.toggle('err', !c); iq.classList.toggle('err', !q); return; }
    st.ajustes.push({ codigo: c, cantidad: q });
    renderLista();
    toast({ tipo: 'ok', texto: `Ajuste manual: ${q > 0 ? '+' : ''}${q} ${c}.`, sub: 'Va al cómputo con origen "manual". El modelo no cambia.' });
  };
  iq.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  pie.append(h('span', 'Pesos y stock ilustrativos'), h('span.ajuste', dl, ic, iq, h('button.btn.xs', { type: 'button', on: { click: add } }, '+ ajuste manual')));
}

// ───────────────────────────── barra inferior ─────────────────────────────
function renderPie() {
  const r = st.res.resumen;
  const errores = st.res.avisos.filter((a) => a.nivel === 'error').length;
  const avisos = st.res.avisos.filter((a) => a.nivel === 'aviso').length;
  const pie = $('#pie');
  pie.innerHTML = '';
  pie.append(
    h('span.stat', h('b', fmt(r.m2, 0)), h('span', 'm²')),
    h('span.stat', { title: r.pesoParcial ? `Peso parcial: ${r.codigosSinPeso.join(', ')} sin peso. Es un mínimo.` : 'Peso ilustrativo' }, h('b', `${tn(r.pesoKg)}${r.pesoParcial ? '*' : ''}`), h('span', 't')),
    h('span.stat', h('b', r.piezas.toLocaleString('es-AR')), h('span', 'pzs')),
    h('span.stat', h('b', r.anclajes), h('span', 'anclajes')),
    h('button.stat', { type: 'button', class: r.faltantesStock.length ? 'falta' : '', title: 'Ver faltantes en la lista', on: { click: () => { st.filtroLista = r.faltantesStock.length ? 'falta' : 'todo'; st.flags.consultoStock = true; renderLista(); verificarTareas(); } } },
      h('span.st', { class: r.faltantesStock.length ? 'falta' : 'ok' }, h('i')), h('b', r.faltantesStock.length ? `${r.faltantesStock.length} faltan` : 'ok'), h('span', 'stock')),
    h('button.stat', { type: 'button', title: 'Ver avisos', on: { click: abrirAvisos } }, h('b', { style: { color: errores ? 'var(--err)' : avisos ? 'var(--warn)' : 'var(--ok)' } }, errores ? `${errores} error${errores > 1 ? 'es' : ''}` : avisos ? `${avisos} aviso${avisos > 1 ? 's' : ''}` : 'sin avisos'), h('span', 'semáforo')),
    h('span.predim', { title: 'Reglas provisorias, sin firma. No reemplaza la memoria de cálculo.' }, PREDIMENSIONADO),
    h('span.der2', r.pesoParcial ? h('span', `* peso parcial: ${r.codigosSinPeso.length} códigos sin peso`) : null, h('span.mono', `motor ${VERSION_MOTOR}`)),
  );
}

function abrirAvisos() {
  const lista = st.res.avisos;
  modal({
    titulo: `Semáforo geométrico · ${PREDIMENSIONADO}`, clase: 'chico',
    cuerpo: h('div', { style: { display: 'grid', gap: '6px' } },
      lista.map((a) => h('div.aviso', { class: a.nivel },
        h('div', a.estructuraId ? h('b', `${st.diseno.estructuras.find((e) => e.id === a.estructuraId)?.nombre}: `) : null, a.texto),
        a.reparaciones?.length ? h('div.acc', a.reparaciones.map((rp) => h('button.btn.xs', { type: 'button', on: { click: () => { cerrarModal(); commit(aplicarReparacion(st.diseno, rp.accion), rp.etiqueta); } } }, rp.etiqueta))) : null)),
      h('div.nota', { style: { marginTop: '6px' } }, 'Solo geometría: H/B, gálibo, paso, relleno, anclajes mínimos y choque de ménsula. Sin verificaciones M0x.')),
  });
}

// ───────────────────────────── cómputo e imagen ─────────────────────────────
function abrirComputo() {
  const r = st.res;
  const filas = [
    ...r.bom.map((l) => ({ codigo: l.codigo, descripcion: l.descripcion, cantidad: l.cantidad, unidad: l.unidad, peso_unit: l.peso_unit, origen: 'modelo', falta: l.falta })),
    ...st.ajustes.map((a) => ({ codigo: a.codigo, descripcion: CATALOGO.piezas[a.codigo]?.descripcion || '(código manual)', cantidad: a.cantidad, unidad: 'u', peso_unit: CATALOGO.piezas[a.codigo]?.peso_kg ?? null, origen: 'manual', falta: 0 })),
  ];
  const json = filas.map((f) => ({ computo_id: '<nuevo>', codigo: f.codigo, cantidad: f.cantidad, unidad: f.unidad, origen: f.origen, modelo_id: '<id del modelo>' }));
  const errores = r.avisos.filter((a) => a.nivel === 'error').length;
  const tabla = h('table.tab', h('thead', h('tr', h('th', 'Código'), h('th', 'Descripción'), h('th.n', 'Cant.'), h('th', 'Unidad'), h('th.n', 'kg u.'), h('th.n', 'kg total'), h('th.n', 'Falta'), h('th', 'origen'))),
    h('tbody', filas.map((f) => h('tr',
      h('td.cod', f.codigo), h('td', f.descripcion), h('td.n', f.cantidad.toLocaleString('es-AR')), h('td', f.unidad),
      h('td.n', f.peso_unit == null ? h('span.tag.sp', 'sin peso') : fmt(f.peso_unit, 1)), h('td.n', f.peso_unit == null ? '—' : kg(f.peso_unit * f.cantidad)),
      h('td.n', f.falta ? h('span.st.falta', h('i'), f.falta.toLocaleString('es-AR')) : '—'),
      h('td', h('span.badge', f.origen)))),
    h('tr.sum', h('td', { colspan: 2 }, `${filas.length} filas`), h('td.n', r.resumen.piezas.toLocaleString('es-AR')), h('td'), h('td'), h('td.n', `${kg(r.resumen.pesoKg)}${r.resumen.pesoParcial ? '*' : ''}`), h('td'), h('td'))));
  const pre = h('pre.json', JSON.stringify(json.slice(0, 4), null, 2) + (json.length > 4 ? `\n… y ${json.length - 4} filas más` : ''));
  pre.hidden = true;
  modal({
    titulo: 'Generar cómputo · vista previa',
    cuerpo: h('div',
      h('div.resumen-c',
        h('div', h('b', fmt(r.resumen.m2, 0)), h('span', 'm²')), h('div', h('b', `${tn(r.resumen.pesoKg)}${r.resumen.pesoParcial ? '*' : ''} t`), h('span', 'peso ilustrativo')),
        h('div', h('b', r.resumen.piezas.toLocaleString('es-AR')), h('span', 'piezas')), h('div', h('b', r.resumen.faltantesStock.length), h('span', 'faltan en stock')),
        h('div', h('b', r.resumen.modoBom === 'kit' ? 'kit' : 'despiezado'), h('span', 'modo'))),
      errores ? h('div.aviso.error', { style: { marginBottom: '10px' } },
        h('div', `Hay ${errores} error${errores > 1 ? 'es' : ''} en el semáforo: revisalo antes de generar.`),
        h('div.acc', h('button.btn.xs', { type: 'button', on: { click: () => { cerrarModal(); abrirAvisos(); } } }, 'Ver avisos'))) : null,
      r.resumen.faltantesStock.length ? h('p.nota', 'Faltan en stock: ', h('b', r.resumen.faltantesStock.map((f) => `${f.codigo} (${f.falta})`).join(', ')), '.') : null,
      h('p.nota', 'Estas filas se guardarían en el cómputo de la obra, marcadas como "modelo" (y "manual" para los ajustes). En la maqueta no se guarda nada. En la app, si el cómputo ya existe se muestran las diferencias antes de pisar, y queda bloqueado si está completado.'),
      tabla, pre),
    pie: [
      h('span.izq2', `${PREDIMENSIONADO} · pesos y stock ilustrativos`),
      h('button.btn', { type: 'button', on: { click: () => { pre.hidden = !pre.hidden; } } }, 'Ver JSON'),
      h('button.btn', { type: 'button', on: { click: async (e) => { const ok = await copiarTexto(JSON.stringify(json, null, 2)); e.target.textContent = ok ? 'Copiado' : 'No se pudo copiar'; if (!ok) { pre.hidden = false; } } } }, 'Copiar JSON'),
      h('button.btn.pri', { type: 'button', on: { click: () => { cerrarModal(); toast({ tipo: 'ok', texto: 'Maqueta: el cómputo no se guardó.', sub: `En la app quedaría con ${filas.length} filas vinculado al modelo.` }); } } }, 'Generar (simulado)'),
    ],
  });
}

function abrirImagen() {
  const r = st.res.resumen;
  const est = st.diseno.estructuras.map((e) => e.nombre).join(' + ');
  let img;
  try {
    img = V.exportarPNG({
      titulo: st.diseno.obra?.nombre || st.diseno.nombre,
      subtitulo: `${est} · ${fmt(r.m2, 0)} m² · altura ${fmt(r.alturaMax)} m · ${st.diseno.estructuras.some((e) => e.sistema === 'bastidor') ? 'multidireccional y bastidor' : 'multidireccional'}`,
      pie: 'Andamios Buenos Aires · imagen ilustrativa',
    });
  } catch (err) {
    toast({ tipo: 'error', texto: 'No pude generar la imagen en este navegador.', sub: String(err?.message || err) });
    return;
  }
  st.flags.imagenExportada = true;
  verificarTareas();
  const im = h('img', { src: img.url, alt: 'Vista isométrica del andamio para la propuesta' });
  const btnCopiar = h('button.btn.pri', {
    type: 'button',
    on: {
      click: async () => {
        // sin fetch(): el data: URL puede estar bloqueado por la CSP del Artifact. El Blob sale del canvas.
        const blob = new Promise((ok, mal) => img.canvas.toBlob((b) => (b ? ok(b) : mal(new Error('sin blob'))), 'image/png'));
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          btnCopiar.textContent = 'Copiada';
        } catch {
          btnCopiar.textContent = 'No se pudo copiar: usá clic derecho';
        }
        setTimeout(() => { btnCopiar.textContent = 'Copiar imagen'; }, 3000);
      },
    },
  }, 'Copiar imagen');
  modal({
    titulo: 'Imagen para la propuesta',
    cuerpo: h('div', im, h('p.nota', { style: { marginTop: '8px' } }, `PNG ${img.ancho} × ${img.alto} px, isométrica 3/4 con fondo blanco. Clic derecho sobre la imagen → "Guardar imagen como…".`)),
    pie: [h('span.izq2', 'En la app se guarda en Storage y entra sola en la propuesta.'), btnCopiar],
  });
}

// ───────────────────────────── nueva obra, atajos, paleta ─────────────────────────────
function nuevaObra() {
  modal({
    titulo: 'Nueva obra desde una plantilla', clase: 'chico',
    cuerpo: h('div.galeria', { style: { padding: 0 } }, PLANTILLAS.map((p) => h('button.pl', {
      type: 'button', on: {
        click: () => {
          cerrarModal();
          const d = crearDiseno(p.id, { nombre: `Obra nueva · ${p.nombre}` });
          d.estructuras[0].nombre = p.nombre;
          commit(d, `Nueva obra: ${p.nombre}`);
          seleccionar({ estructuraId: 'E1', celdas: [], frente: null });
          V.vista(3);
        },
      },
    }, h('span', { html: iconoSvg(p.icono) }), h('span.n', p.nombre), h('span.k', p.descripcion)))),
    pie: [h('span.izq2', 'Se puede deshacer con Ctrl+Z.'), h('button.btn', { type: 'button', on: { click: () => { cerrarModal(); commit(ejemploParana631(), 'Volver al ejemplo Paraná 631'); } } }, 'Volver al ejemplo Paraná 631')],
  });
}

const ATAJOS = [
  ['V', 'Seleccionar'], ['B', 'Pincel de celdas'], ['1–5 (con pincel)', 'Abertura · sin plataforma · lona · ménsula · anclaje'], ['M', 'Pincel de ménsula'],
  ['O', 'Abertura en las celdas elegidas'], ['F', 'Nueva fachada'], ['T', 'Nueva torre escalera'], ['P', 'Nuevo pórtico peatonal'], ['Shift+P', 'Nuevo pórtico vehicular'],
  ['R (ubicando)', 'Girar 90°'], ['Alt (ubicando)', 'Ubicar sin unir'], ['L / H', 'Manija de largo / altura (tipeá + Enter)'], ['K', 'Partir frente en la celda'],
  ['1 / 2 / 3', 'Planta / alzado / 3D'], ['Z', 'Encuadrar'], ['A', 'Agrandar o achicar el alzado'], ['Supr', 'Quitar ajustes de las celdas elegidas; sin celdas, borrar la estructura'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Deshacer / rehacer'], ['Ctrl+D', 'Duplicar alineado'], ['Ctrl+K', 'Paleta de comandos'], ['Esc', 'Cancelar / deseleccionar'], ['?', 'Esta hoja'],
];
function abrirAtajos() {
  modal({
    titulo: 'Atajos de teclado',
    cuerpo: h('div', h('div.atajos', ATAJOS.map(([k, t]) => h('div', h('span', t), h('kbd', k)))),
      h('p.nota', { style: { marginTop: '12px' } }, 'En los campos podés tipear expresiones (12+2,5). Clic derecho y arrastre en el 3D mueven la cámara; la rueda acerca.')),
  });
}

function comandos() {
  const est = estructuraSel();
  const L = [
    ...PLANTILLAS.map((p) => ({ t: `Agregar ${p.nombre}`, g: 'Plantilla', k: TECLA[p.id], fn: () => V.empezarColocacion(p.id) })),
    { t: 'Nueva obra desde plantilla…', g: 'Obra', fn: nuevaObra },
    { t: 'Volver al ejemplo Paraná 631', g: 'Obra', fn: () => commit(ejemploParana631(), 'Volver al ejemplo Paraná 631') },
    { t: 'Generar cómputo', g: 'Salida', fn: abrirComputo },
    { t: 'Imagen para la propuesta', g: 'Salida', fn: abrirImagen },
    { t: 'Vista planta', g: 'Vista', k: '1', fn: () => V.vista(1) },
    { t: 'Vista alzado', g: 'Vista', k: '2', fn: () => V.vista(2) },
    { t: 'Vista 3D', g: 'Vista', k: '3', fn: () => V.vista(3) },
    { t: 'Encuadrar', g: 'Vista', k: 'Z', fn: () => V.encuadrar() },
    { t: 'Cómputo por kit', g: 'Lista', fn: () => setModoBom('kit') },
    { t: 'Cómputo despiezado', g: 'Lista', fn: () => setModoBom('despiezado') },
    { t: 'Ver faltantes de stock', g: 'Lista', fn: () => { st.filtroLista = 'falta'; st.flags.consultoStock = true; renderLista(); verificarTareas(); } },
    { t: 'Recorrido guiado y tareas', g: 'Ayuda', fn: () => abrirTour() },
    { t: 'Atajos de teclado', g: 'Ayuda', k: '?', fn: abrirAtajos },
    { t: 'Semáforo: ver avisos', g: 'Ayuda', fn: abrirAvisos },
  ];
  if (est) {
    L.push({ t: `Cambiar ${est.nombre} a ${est.sistema === 'bastidor' ? 'multidireccional' : 'bastidor'}`, g: 'Estructura', fn: () => commit(aplicarReparacion(st.diseno, { tipo: 'sistema', estructuraId: est.id, sistema: est.sistema === 'bastidor' ? 'multi' : 'bastidor' }), 'Cambiar sistema') });
    L.push({ t: `Duplicar ${est.nombre}`, g: 'Estructura', k: 'Ctrl D', fn: duplicar });
    L.push({ t: `Borrar ${est.nombre}`, g: 'Estructura', k: 'Supr', fn: borrarEstructura });
    if (est.tipo === 'fachada') {
      L.push({ t: 'Largo del frente (manija)', g: 'Estructura', k: 'L', fn: () => V.activarManija('largo') });
      L.push({ t: 'Partir frente en la celda elegida', g: 'Estructura', k: 'K', fn: partirFrente });
    }
    L.push({ t: 'Altura (manija)', g: 'Estructura', k: 'H', fn: () => V.activarManija('altura') });
  }
  return L;
}
/** Interpreta textos tipo "torre 2,50×1,50 h 12", "pórtico 10", "altura 15", "fachada 14 8 h 18". */
function interpretar(q) {
  const s = q.toLowerCase().replace(/,/g, '.');
  const nums = (s.match(/\d+(\.\d+)?/g) || []).map(Number);
  const hh = /\bh\s*(\d+(\.\d+)?)/.exec(s);
  if (/^torre/.test(s) && nums.length) {
    const [l, a] = nums;
    return { t: `Torre escalera ${fmt(l)} × ${fmt(a ?? 1.5)}${hh ? ` · h ${fmt(+hh[1])}` : ''}`, g: 'Crear', fn: () => {
      const { diseno, estructuraId } = agregarEstructura(st.diseno, 'torre_escalera', { params: { largo: l, ancho: a ?? 1.5, ...(hh ? { altura: +hh[1] } : {}) }, origen: [0, 6] });
      commit(diseno, 'Agregar torre (paleta)'); seleccionar({ estructuraId });
    } };
  }
  if (/^p[oó]rtico/.test(s) && nums.length) {
    const veh = /veh/.test(s);
    return { t: veh ? `Pórtico vehicular luz ${fmt(nums[0])}` : `Pórtico peatonal ${fmt(nums[0])} ml`, g: 'Crear', fn: () => {
      const { diseno, estructuraId } = agregarEstructura(st.diseno, veh ? 'portico_vehicular' : 'portico_peatonal', { params: veh ? { luz: nums[0] } : { largo: nums[0] }, origen: [0, 6] });
      commit(diseno, 'Agregar pórtico (paleta)'); seleccionar({ estructuraId });
    } };
  }
  if (/^(fachada|frentes)/.test(s) && nums.length && estructuraSel()?.tipo === 'fachada') {
    const largos = hh ? nums.filter((n) => n !== +hh[1]) : nums;
    return { t: `Frentes ${largos.map((n) => fmt(n)).join(' + ')}${hh ? ` · h ${fmt(+hh[1])}` : ''}`, g: 'Editar', fn: () => {
      const d = clone(st.diseno);
      const e = d.estructuras.find((x) => x.id === st.sel.estructuraId);
      e.params.frentes = largos.map((l, i) => (i ? { largo: l, angulo: e.params.frentes[i]?.angulo ?? 90 } : { largo: l }));
      e.params.esquinas = largos.slice(1).map((_, i) => e.params.esquinas?.[i] || 'vertical_compartida');
      if (hh) e.params.altura = +hh[1];
      commit(d, 'Frentes (paleta)');
    } };
  }
  if (/^altura/.test(s) && nums.length && estructuraSel()) return { t: `Altura ${fmt(nums[0])} m`, g: 'Editar', fn: () => P('params.altura', nums[0], `Altura → ${fmt(nums[0])}`) };
  return null;
}
function abrirPaleta() {
  let idx = 0;
  const inp = h('input', { id: 'paleta-q', placeholder: 'Comando o "torre 2,50×1,50 h 12"', autocomplete: 'off', 'aria-label': 'Comando' });
  const ul = h('ul', { role: 'listbox' });
  let vis = [];
  const pintar = () => {
    const q = inp.value.trim().toLowerCase();
    const ext = q ? interpretar(q) : null;
    vis = [...(ext ? [ext] : []), ...comandos().filter((c) => !q || c.t.toLowerCase().includes(q) || c.g.toLowerCase().includes(q))].slice(0, 14);
    idx = Math.min(idx, Math.max(0, vis.length - 1));
    ul.innerHTML = '';
    vis.forEach((c, i) => ul.append(h('li', { class: i === idx ? 'on' : '', role: 'option', on: { click: () => ejecutar(c), mousemove: () => { if (idx !== i) { idx = i; pintar(); } } } }, c.t, h('span.g', c.g, c.k ? h('kbd', c.k) : null))));
    if (!vis.length) ul.append(h('li.dim', 'Sin resultados'));
  };
  const ejecutar = (c) => { cerrarModal(); setTimeout(() => c.fn(), 0); };
  inp.addEventListener('input', () => { idx = 0; pintar(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { idx = Math.min(vis.length - 1, idx + 1); pintar(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); pintar(); e.preventDefault(); }
    if (e.key === 'Enter' && vis[idx]) ejecutar(vis[idx]);
  });
  const caja = modal({ cuerpo: null, clase: 'paleta' });
  caja.append(inp, ul, h('div.ej', 'Ejemplos: "torre 2,50×1,50 h 12" · "pórtico 10" · "pórtico vehicular 6" · "fachada 16 9 h 15" · "altura 21"'));
  pintar();
  inp.focus();
}

function agrandarAlzado(v) {
  const c = $('#centro');
  const on = c.classList.toggle('alzado-grande', v);
  const b = $('#btn-agrandar');
  if (b) { b.textContent = on ? 'Achicar' : 'Agrandar'; b.title = `${on ? 'Achicar' : 'Agrandar'} el alzado (A)`; b.setAttribute('aria-pressed', String(on)); }
  b?.append(' ', h('kbd', 'A'));
  setTimeout(() => { renderAlzado(); V.pedirRender?.(); }, 0);
}

function setModoBom(m) {
  if ((st.diseno.modoBom || 'kit') === m) return;
  const antes = st.res.resumen;
  commit(aplicarReparacion(st.diseno, { tipo: 'modoBom', modo: m }), m === 'kit' ? 'Cómputo por kit' : 'Cómputo despiezado');
  const dp = st.res.resumen.piezas - antes.piezas;
  toast({
    tipo: 'info', clave: 'modo-bom',
    texto: `${m === 'kit' ? 'Por kit' : 'Despiezado'}: ${dp === 0 ? 'mismas piezas' : `${dp > 0 ? '+' : '−'}${Math.abs(dp).toLocaleString('es-AR')} piezas`}, mismo peso.`,
    sub: 'Solo cambia cómo se listan los bastidores (kit MOD-AND-STD o piezas sueltas).', ms: 5000,
  });
}

// ───────────────────────────── pinceles y leyenda ─────────────────────────────
function renderPinceles() {
  const g = $('#pinceles');
  g.innerHTML = '';
  for (const p of PINCELES) {
    g.append(h('button', { type: 'button', class: st.herramienta === 'pincel' && st.pincel === p.n ? 'on' : '', title: `Pincel ${p.nombre} (${p.n})`, on: { click: () => setPincel(p.n) } }, h('kbd', String(p.n)), p.nombre));
  }
  if (st.herramienta === 'pincel' && st.pincel === 4) {
    g.append(h('button', { type: 'button', class: 'on', title: 'Lado de la ménsula', on: { click: () => { st.ladoMensula = st.ladoMensula === 'afuera' ? 'fachada' : 'afuera'; renderPinceles(); } } }, st.ladoMensula === 'afuera' ? '→ afuera' : '← a fachada'));
  }
  $$('[data-herr]').forEach((b) => b.classList.toggle('on', b.dataset.herr === st.herramienta));
  $('#alzado').classList.toggle('pincel', st.herramienta === 'pincel');
  $('#alzado-info').textContent = textoSeleccion();
}
function setHerramienta(hr) { st.herramienta = hr; renderPinceles(); }
function setPincel(n) { st.herramienta = 'pincel'; st.pincel = n; renderPinceles(); }
function renderLeyenda() {
  const pal = V.paletaActual();
  const el = $('#leyenda');
  el.innerHTML = '';
  for (const [k, t] of V.LEYENDA) el.append(h('span', h('i', { style: { background: pal[k] } }), t));
  el.append(h('span', h('i', { style: { background: pal.sel } }), 'Selección'), h('span', h('i', { style: { background: pal.err } }), 'Error'));
}

// ───────────────────────────── eventos ─────────────────────────────
function enlazar() {
  $('#btn-undo').addEventListener('click', () => deshacer());
  $('#btn-redo').addEventListener('click', () => rehacer());
  $('#btn-paleta').addEventListener('click', abrirPaleta);
  $('#btn-atajos').addEventListener('click', abrirAtajos);
  $('#btn-imagen').addEventListener('click', abrirImagen);
  $('#btn-computo').addEventListener('click', abrirComputo);
  $('#btn-tour').addEventListener('click', () => abrirTour());
  $('#btn-nueva').addEventListener('click', nuevaObra);
  $('#btn-abertura').addEventListener('click', accionAbertura);
  $$('.cubo [data-vista]').forEach((b) => b.addEventListener('click', () => (b.dataset.vista === 'z' ? V.encuadrar() : V.vista(+b.dataset.vista))));
  $$('[data-herr]').forEach((b) => b.addEventListener('click', () => setHerramienta(b.dataset.herr)));
  $$('#seg-filtro [data-filtro]').forEach((b) => b.addEventListener('click', () => { st.filtroLista = b.dataset.filtro; if (b.dataset.filtro === 'falta') { st.flags.consultoStock = true; verificarTareas(); } renderLista(); }));
  $$('#seg-bom [data-bom]').forEach((b) => b.addEventListener('click', () => setModoBom(b.dataset.bom)));
  $('#btn-agrandar').addEventListener('click', () => agrandarAlzado());
  $('#btn-contexto').addEventListener('click', () => { const v = V.alternarContexto(); $('#btn-contexto').classList.toggle('on', v); $('#btn-contexto').setAttribute('aria-pressed', String(v)); });
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  mq.addEventListener?.('change', () => setTimeout(renderLeyenda, 0));
  new MutationObserver(() => setTimeout(renderLeyenda, 0)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('keydown', teclado);
}

let armadoBorrar = 0;
function teclado(e) {
  const t = e.target;
  const enCampo = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!hayModal()) abrirPaleta(); else cerrarModal(); return; }
  if (e.key === 'Escape' && hayModal()) { cerrarModal(); return; }
  if (hayModal()) return;
  if (!enCampo && V.manijaEnUso() && V.teclaManija(e)) { e.preventDefault(); return; }
  if (mod && e.key.toLowerCase() === 'z') { if (enCampo) return; e.preventDefault(); if (e.shiftKey) rehacer(); else deshacer(); return; }
  if (mod && e.key.toLowerCase() === 'y') { if (enCampo) return; e.preventDefault(); rehacer(); return; }
  if (mod && e.key.toLowerCase() === 'd') { if (enCampo) return; e.preventDefault(); duplicar(); return; }
  if (enCampo || mod || e.altKey && !V.colocacionActiva()) return;
  const k = e.key;
  if (V.colocacionActiva()) {
    if (k === 'Escape') { V.cancelarColocacion(); return; }
    if (k === 'r' || k === 'R') { V.girarColocacion(); return; }
  }
  switch (k) {
    case 'Escape':
      if (V.cancelarManija()) return;
      if (st.sel.celdas.length) seleccionar({ celdas: [] });
      else if (st.herramienta === 'pincel') setHerramienta('seleccionar');
      return;
    case 'v': case 'V': setHerramienta('seleccionar'); return;
    case 'b': case 'B': setHerramienta('pincel'); return;
    case 'm': case 'M': setPincel(4); return;
    case 'o': case 'O': accionAbertura(); return;
    case 't': case 'T': V.empezarColocacion('torre_escalera'); return;
    case 'p': V.empezarColocacion('portico_peatonal'); return;
    case 'P': V.empezarColocacion(e.shiftKey ? 'portico_vehicular' : 'portico_peatonal'); return;
    case 'f': case 'F': V.empezarColocacion('estructura'); return;
    case 'k': case 'K': partirFrente(); return;
    case 'l': case 'L': if (!V.activarManija('largo')) toast({ tipo: 'info', texto: 'Esta estructura no tiene manija de largo.' }); return;
    case 'h': case 'H': if (!V.activarManija('altura')) toast({ tipo: 'info', texto: 'La altura de esta estructura viene heredada o no se edita con manija.' }); return;
    case 'z': case 'Z': V.encuadrar(); return;
    case '?': abrirAtajos(); return;
    case 'a': case 'A': agrandarAlzado(); return;
    case 'Backspace': {
      // En Mac la tecla "delete" es Backspace: pide una segunda pulsación para no borrar sin querer.
      e.preventDefault();
      const est = estructuraSel();
      if (!est || st.sel.celdas.length) return;
      if (Date.now() - armadoBorrar < 2500) { armadoBorrar = 0; borrarEstructura(); return; }
      armadoBorrar = Date.now();
      toast({ tipo: 'info', texto: `Apretá ⌫ otra vez para borrar ${est.nombre}.`, clave: 'armado-borrar', ms: 2500 });
      return;
    }
    case 'Delete': {
      // Con celdas elegidas nunca borra la estructura: limpia sus ajustes o avisa.
      const est = estructuraSel();
      if (st.sel.celdas.length) {
        const conOv = st.sel.celdas.filter((c) => est?.overrides?.[c]);
        if (conOv.length) commit(aplicarReparacion(st.diseno, { tipo: 'overrides', estructuraId: est.id, celdas: conOv, valor: null }), `Volver a lo generado ${rangoCeldas(conOv)}`);
        else toast({ tipo: 'info', texto: 'Las celdas elegidas no tienen ajustes para quitar.', sub: 'Para borrar la estructura entera: Esc para deseleccionar y después Supr.', clave: 'supr-sin-ajustes' });
        return;
      }
      borrarEstructura();
      return;
    }
    default:
      if (/^[1-5]$/.test(k) && !e.repeat) {
        if (st.herramienta === 'pincel') setPincel(+k);
        else if (k <= '3') V.vista(+k);
      }
  }
}

export { abrirComputo, abrirImagen, nuevaObra };
arrancar();
// gancho de depuración para pruebas automáticas: solo con ?debug en la URL (no se expone en la versión publicada)
if (/[?&]debug\b/.test(location.search)) window.__modelador = { st, V };
