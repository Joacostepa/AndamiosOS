// alzado.js · alzado desplegado en SVG: celdas vano × nivel de la estructura seleccionada.
// Selección por clic / arrastre / rótulos de fila y columna; pincel de overrides (un arrastre = un paso).
import { setOverride, fmt } from './motor.js';
import { st, seleccionar, emit, preview, commit, estructuraSel, resueltaSel } from './estado.js';
import { LETRAS, rangoCeldas, etiquetaCelda } from './ui-base.js';

export const PINCELES = [
  { n: 1, id: 'abertura', nombre: 'Abertura' },
  { n: 2, id: 'sinPlataforma', nombre: 'Sin plataforma' },
  { n: 3, id: 'lona', nombre: 'Lona' },
  { n: 4, id: 'mensula', nombre: 'Ménsula' },
  { n: 5, id: 'anclaje', nombre: 'Anclaje' },
];

let raiz = null;
let geo = null; // {celdas: Map key→{x,y,w,h,c}, ...}
let gesto = null;

export function iniciarAlzado(el) {
  raiz = el;
  raiz.addEventListener('pointerdown', alApretar);
  raiz.addEventListener('pointermove', alMover);
  raiz.addEventListener('pointerup', alSoltar);
  raiz.addEventListener('pointercancel', alSoltar);
  raiz.addEventListener('pointerleave', () => { if (!gesto && st.hover.celda) { st.hover.celda = null; emit('hover'); } });
  new ResizeObserver(() => renderAlzado()).observe(raiz);
  document.getElementById('alzado-frentes')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-af]');
    if (!b) return;
    st.alzadoFrente = b.dataset.af === 'todos' ? 'todos' : +b.dataset.af;
    renderAlzado();
  });
}

/** Marca la celda bajo el cursor sin rehacer todo el SVG. */
export function marcarHover() {
  if (!raiz) return;
  raiz.querySelectorAll('.cel.hov').forEach((r) => r.classList.remove('hov'));
  const c = st.hover.celda;
  if (c && !st.sel.celdas.includes(c)) raiz.querySelector(`.cel[data-c="${c}"]`)?.classList.add('hov');
}

/** Selector de frente del alzado: con varios frentes y poco ancho, muestra uno solo ajustado al ancho. */
function pintarSelectorFrentes(e, todos, visibles) {
  const cont = document.getElementById('alzado-frentes');
  if (!cont) return;
  if (!e || e.tipo !== 'fachada' || todos.length < 2) { cont.hidden = true; cont.innerHTML = ''; return; }
  cont.hidden = false;
  const unico = visibles.length === 1 ? visibles[0] : null;
  cont.innerHTML = `<button type="button" data-af="todos" class="${unico == null ? 'on' : ''}" aria-pressed="${unico == null}">Todos</button>`
    + todos.map((f) => `<button type="button" data-af="${f}" class="${unico === f ? 'on' : ''}" aria-pressed="${unico === f}" title="Ver solo el Frente ${LETRAS[f]}">${LETRAS[f]}</button>`).join('');
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderAlzado() {
  if (!raiz) return;
  const e = resueltaSel();
  const W = raiz.clientWidth, H = raiz.clientHeight;
  if (!e || !W || !H) { raiz.innerHTML = '<div class="vacio">Elegí una estructura en el árbol o en el 3D.</div>'; return; }
  const est = estructuraSel();
  const celdas = st.res.celdas.filter((c) => c.estructuraId === e.id);
  if (!celdas.length) { raiz.innerHTML = '<div class="vacio">Esta estructura no tiene celdas para editar.</div>'; return; }
  raiz.classList.toggle('pincel', st.herramienta === 'pincel');
  const editable = e.tipo === 'fachada';

  const porF = new Map();
  for (const c of celdas) { if (!porF.has(c.f)) porF.set(c.f, []); porF.get(c.f).push(c); }
  const todosF = [...porF.keys()].sort((a, b) => a - b);
  const ML = 84, MR = 20, MT = 30, MB = 36, GAP = 22;
  // qué frentes se ven: elección explícita, o automático (uno solo si todos juntos quedan con celdas de menos de 28 px)
  let visF = todosF;
  const pedido = st.alzadoFrente;
  if (typeof pedido === 'number' && porF.has(pedido)) visF = [pedido];
  else if (pedido !== 'todos' && todosF.length > 1) {
    const largoTodos = todosF.reduce((s, f) => { const cs = porF.get(f); return s + Math.max(...cs.map((c) => c.s1)) - Math.min(...cs.map((c) => c.s0)); }, 0);
    const kTodos = (W - ML - MR - GAP * (todosF.length - 1)) / largoTodos;
    const vanoMin = Math.max(1.09, Math.min(...celdas.map((c) => c.s1 - c.s0))); // el cuadro de esquina de 0,73 no cuenta
    if (kTodos * vanoMin < 28) visF = [porF.has(st.sel.frente) ? st.sel.frente : todosF[0]];
  }
  pintarSelectorFrentes(e, todosF, visF);
  const frentes = visF.map((f) => ({ f, F: e.frentes[f] || e.frentes[0], cs: porF.get(f) }));
  const ext = frentes.map(({ cs }) => [Math.min(...cs.map((c) => c.s0)), Math.max(...cs.map((c) => c.s1))]);
  const ymax = Math.max(e.alturaReal, ...celdas.map((c) => c.y1));
  const largoTot = ext.reduce((s, [a, b]) => s + (b - a), 0);
  let k = Math.max(4, Math.min((W - ML - MR - GAP * (frentes.length - 1)) / largoTot, (H - MT - MB) / ymax));
  if (!editable) k = Math.min(k, 26); // torres y pórticos: alzado compacto, no una caja enorme
  const anchoDib = largoTot * k + GAP * (frentes.length - 1);
  const x0 = ML + Math.max(0, (W - ML - MR - anchoDib) / 2);
  const Y = (y) => MT + (ymax - y) * k;
  const sel = new Set(st.sel.celdas);
  const errs = new Set(st.res.avisos.filter((a) => a.nivel === 'error' && a.estructuraId === e.id && a.celda).flatMap((a) => [a.celda, ...(a.reparaciones || []).flatMap((r) => r.accion?.celdas || [])]));
  const ov = est?.overrides || {};

  geo = { celdas: new Map(), k };
  const partes = [];
  partes.push(`<defs>
    <pattern id="ph" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--fg-3)" stroke-width="1.2"/></pattern>
    <pattern id="pa" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="5" stroke="var(--fg-3)" stroke-width=".8" opacity=".6"/></pattern>
  </defs>`);
  // suelo
  partes.push(`<line x1="${x0 - 8}" y1="${Y(0)}" x2="${x0 + anchoDib + 8}" y2="${Y(0)}" stroke="var(--fg-3)" stroke-width="1"/>`);

  let xc = x0;
  const xDe = [];
  frentes.forEach(({ f, F, cs }, i) => {
    const [s0, s1] = ext[i];
    const base = xc;
    const X = (s) => base + (s - s0) * k;
    xDe[f] = X;
    // cabecera del frente
    const tit = e.tipo === 'fachada' ? `Frente ${LETRAS[f]} · ${F.texto}` : F.texto || e.nombre;
    const maxCh = Math.max(6, Math.floor((frentes.length === 1 ? W - x0 - MR : (s1 - s0) * k) / 6.9));
    const t = tit.length > maxCh ? tit.slice(0, maxCh - 1) + '…' : tit;
    partes.push(`<text x="${X(s0)}" y="${MT - 12}" font-size="11.5" fill="var(--fg-2)" font-family="var(--font-mono)">${esc(t)}<title>${esc(tit)}</title></text>`);
    // celdas
    for (const c of cs) {
      const x = X(c.s0), w = (c.s1 - c.s0) * k, y = Y(c.y1), hh = (c.y1 - c.y0) * k;
      geo.celdas.set(c.celda, { x, y, w, h: hh, c });
      const es = c.estado;
      const o = ov[c.celda] || {};
      let fill = 'transparent';
      if (es.bajoApoyo) fill = 'url(#pa)';
      else if (es.abertura) fill = 'url(#ph)';
      else if (es.lona) fill = 'var(--info-soft)';
      else if (es.cubierta === 'media_sombra' && !(es.bandeja && c.n === 0)) fill = 'var(--ok-soft)';
      const esSel = sel.has(c.celda), esHov = st.hover.celda === c.celda, esErr = errs.has(c.celda);
      partes.push(`<rect class="cel${esHov && !esSel ? ' hov' : ''}" data-c="${c.celda}" x="${x + 0.5}" y="${y + 0.5}" width="${Math.max(1, w - 1)}" height="${Math.max(1, hh - 1)}" fill="${fill}" stroke="${esErr ? 'var(--err)' : 'var(--line-2)'}" stroke-width="${esErr ? 1.6 : 1}"/>`);
      if (es.plataforma && !es.abertura) partes.push(`<line x1="${x + 1}" y1="${y + 1}" x2="${x + w - 1}" y2="${y + 1}" stroke="${es.bandeja ? 'var(--warn)' : 'var(--fg-2)'}" stroke-width="${es.bandeja ? 3.5 : 2.5}" pointer-events="none"/>`);
      if (o.sinPlataforma) partes.push(`<line x1="${x + 2}" y1="${y + 1}" x2="${x + w - 2}" y2="${y + 1}" stroke="var(--fg-3)" stroke-width="1.5" stroke-dasharray="3 3" pointer-events="none"/>`);
      if (es.acceso && !es.abertura) {
        const lx = x + Math.min(w * 0.18, 10), lw = Math.min(10, w * 0.3);
        let lad = `<g pointer-events="none" stroke="var(--fg-3)" stroke-width="1"><line x1="${lx}" y1="${y + 3}" x2="${lx}" y2="${y + hh - 2}"/><line x1="${lx + lw}" y1="${y + 3}" x2="${lx + lw}" y2="${y + hh - 2}"/>`;
        for (let r = y + 7; r < y + hh - 3; r += 5) lad += `<line x1="${lx}" y1="${r}" x2="${lx + lw}" y2="${r}"/>`;
        partes.push(lad + '</g>');
      }
      if (es.mensula) {
        const mx = es.mensula === 'afuera' ? x + w - 3 : x + 3, dir = es.mensula === 'afuera' ? 1 : -1;
        partes.push(`<path d="M${mx} ${y + 1} l${dir * 0} 0 l${-dir * 9} 0 l${dir * 9} 9 z" fill="var(--mensula)" opacity=".9" pointer-events="none"/>`);
      }
      if (esSel) partes.push(`<rect x="${x + 1}" y="${y + 1}" width="${Math.max(1, w - 2)}" height="${Math.max(1, hh - 2)}" fill="var(--primary-soft)" stroke="var(--primary)" stroke-width="1.5" pointer-events="none"/>`);
      if (c.override) partes.push(`<circle cx="${x + 6}" cy="${y + hh - 6}" r="3" fill="var(--primary)" pointer-events="none"><title>Ajuste de celda</title></circle>`);
      if (es.galibo) partes.push(`<text x="${x + w / 2}" y="${Y(es.galibo / 2)}" text-anchor="middle" font-size="12" fill="var(--fg-2)" font-family="var(--font-mono)" pointer-events="none">gálibo ${fmt(es.galibo)}</text>`);
    }
    // rótulos de columna
    const vs = [...new Set(cs.map((c) => c.v))].sort((a, b) => a - b);
    const wMin = Math.min(...cs.map((c) => (c.s1 - c.s0) * k));
    const salto = wMin >= 22 ? 1 : Math.ceil(22 / Math.max(1, wMin)); // si no entran, rótulo V cada tantos vanos
    for (const v of vs) {
      const c = cs.find((q) => q.v === v);
      const x = X(c.s0), w = (c.s1 - c.s0) * k;
      const conTexto = v % salto === 0;
      partes.push(`<g class="rot" data-col="${f}:${v}"><rect x="${x}" y="${Y(0) + 2}" width="${w}" height="${MB - 4}" fill="transparent"><title>V${v + 1} · ${fmt(c.vano)}</title></rect>
        ${conTexto ? `<text x="${x + w / 2}" y="${Y(0) + 15}" text-anchor="middle" font-size="11" fill="var(--fg-2)" font-family="var(--font-mono)">V${v + 1}</text>` : ''}
        ${w > 26 ? `<text x="${x + w / 2}" y="${Y(0) + 28}" text-anchor="middle" font-size="9.5" fill="var(--fg-3)" font-family="var(--font-mono)">${fmt(c.vano)}</text>` : ''}</g>`);
    }
    // separador entre frentes
    if (i < frentes.length - 1) {
      const xs = X(s1) + GAP / 2;
      partes.push(`<line x1="${xs}" y1="${MT - 4}" x2="${xs}" y2="${Y(0)}" stroke="var(--fg-3)" stroke-dasharray="2 4"/>`);
      const sig = frentes[i + 1];
      const giro = e.frentes[sig.f]?.angulo;
      partes.push(`<text x="${xs}" y="${Y(0) + 15}" text-anchor="middle" font-size="10" fill="var(--fg-3)">${giro ? (giro > 0 ? '90°' : '−90°') : '0°'}</text>`);
    }
    xc = X(s1) + GAP;
  });

  // piezas dibujadas sobre el alzado: diagonales, vigas, anclajes (posiciones reales del motor)
  const proyectar = (p, q) => {
    const m = /\/f(\d+)/.exec(p.owner);
    const f = m ? +m[1] : 0;
    const F = e.frentes[f];
    if (!F || !xDe[f]) return null;
    return [xDe[f]((q[0] - F.origen[0]) * F.u[0] + (q[2] - F.origen[1]) * F.u[1]), Y(q[1])];
  };
  const marcas = [];
  for (const p of st.res.piezas) {
    if (p.estructuraId !== e.id) continue;
    if (p.tipo === 'diagonal' && p.celda) {
      const A = proyectar(p, p.a), B = proyectar(p, p.b);
      if (A && B && Math.abs(A[0] - B[0]) > 2) marcas.push(`<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" stroke="var(--info)" stroke-width="1" opacity=".55"/>`);
    } else if (p.tipo === 'viga' && /i$/.test(p.id)) {
      const A = proyectar(p, p.a), B = proyectar(p, p.b);
      if (A && B) marcas.push(`<rect x="${Math.min(A[0], B[0])}" y="${A[1] - 3}" width="${Math.abs(B[0] - A[0])}" height="${Math.max(4, 0.5 * k)}" fill="var(--warn)" opacity=".85"><title>${p.codigo}</title></rect>`);
    } else if (p.tipo === 'anclaje') {
      const A = proyectar(p, p.a);
      if (A) marcas.push(`<rect x="${A[0] - 3}" y="${A[1] - 3}" width="6" height="6" transform="rotate(45 ${A[0]} ${A[1]})" fill="var(--ok)"/>`);
    }
  }
  partes.push(`<g pointer-events="none">${marcas.join('')}</g>`);

  // rótulos de fila (niveles del primer frente)
  const F0 = frentes[0].F;
  const niveles = [...new Set(celdas.map((c) => c.n))].sort((a, b) => a - b);
  // dos columnas: N centrado en la fila (izquierda) y cota del nivel alineada a su borde superior (derecha)
  const hMin = Math.min(...niveles.map((n) => { const c = celdas.find((q) => q.n === n); return (c.y1 - c.y0) * k; }));
  const saltoN = hMin >= 13 ? 1 : Math.ceil(13 / Math.max(1, hMin));
  let ultCota = -Infinity;
  for (const n of niveles) {
    const c = celdas.find((q) => q.n === n && q.f === frentes[0].f) || celdas.find((q) => q.n === n);
    const y = Y(c.y1), hh = (c.y1 - c.y0) * k;
    const cota = Math.abs(ultCota - y) >= 11 ? `<text x="${ML - 8}" y="${y + 3.5}" text-anchor="end" font-size="9.5" fill="var(--fg-3)" font-family="var(--font-mono)">${fmt(c.y1)}</text>` : '';
    if (cota) ultCota = y;
    partes.push(`<g class="rot" data-row="${n}"><rect x="0" y="${y}" width="${ML - 6}" height="${hh}" fill="transparent"><title>N${n + 1} · tope ${fmt(c.y1)} m</title></rect>
      ${n % saltoN === 0 ? `<text x="${ML - 50}" y="${y + hh / 2 + 4}" text-anchor="end" font-size="11" fill="var(--fg-2)" font-family="var(--font-mono)">N${n + 1}</text>` : ''}
      ${cota}</g>`);
  }
  const topeFila = Math.max(...celdas.map((c) => c.y1));
  if (F0 && Math.abs(topeFila - e.alturaReal) > 0.01) partes.push(`<text x="${ML - 8}" y="${Y(e.alturaReal) - 4}" text-anchor="end" font-size="9.5" fill="var(--primary)" font-family="var(--font-mono)">${fmt(e.alturaReal)}</text>`);
  if (!editable) partes.push(`<text x="${W - MR}" y="${H - 8}" text-anchor="end" font-size="11" fill="var(--fg-3)">Solo lectura: los ajustes de celda son para fachadas</text>`);

  raiz.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Alzado desplegado de ${esc(e.nombre)}">${partes.join('')}</svg>`;
}

// ───────────────────────────── gestos ─────────────────────────────
const celdaEn = (x, y) => document.elementFromPoint(x, y)?.closest?.('[data-c]')?.getAttribute('data-c') || null;

function rectSel(a, b) {
  const A = geo.celdas.get(a), B = geo.celdas.get(b);
  if (!A || !B) return [a];
  const x0 = Math.min(A.x, B.x), x1 = Math.max(A.x + A.w, B.x + B.w);
  const n0 = Math.min(A.c.n, B.c.n), n1 = Math.max(A.c.n, B.c.n);
  const out = [];
  for (const [k, g] of geo.celdas) {
    const cx = g.x + g.w / 2;
    if (cx >= x0 && cx <= x1 && g.c.n >= n0 && g.c.n <= n1) out.push(k);
  }
  return out;
}

function valorPincel(celda) {
  const est = estructuraSel();
  const o = est?.overrides?.[celda] || {};
  const c = st.res.celdas.find((q) => q.estructuraId === est.id && q.celda === celda);
  switch (st.pincel) {
    case 1: return o.abertura ? { abertura: null, viga: null } : { abertura: true };
    case 2: return o.sinPlataforma ? { sinPlataforma: null } : { sinPlataforma: true };
    case 3: return o.lona ? { lona: null } : { lona: true };
    case 4: return o.mensula ? { mensula: null } : c?.estado.mensula ? { mensula: false } : { mensula: st.ladoMensula };
    case 5: return o.anclaje === true ? { anclaje: false } : o.anclaje === false ? { anclaje: null } : { anclaje: true };
    default: return null;
  }
}

function alApretar(e) {
  if (e.button !== 0) return;
  const rot = e.target.closest?.('.rot');
  const est = estructuraSel();
  if (!est) return;
  if (rot) {
    const celdas = [...geo.celdas.keys()];
    let elegidas;
    if (rot.dataset.row != null) elegidas = celdas.filter((k) => +k.split(':')[2] === +rot.dataset.row);
    else { const [f, v] = rot.dataset.col.split(':').map(Number); elegidas = celdas.filter((k) => { const [ff, vv] = k.split(':').map(Number); return ff === f && vv === v; }); }
    seleccionar({ celdas: e.shiftKey ? [...new Set([...st.sel.celdas, ...elegidas])] : elegidas });
    return;
  }
  const c = celdaEn(e.clientX, e.clientY);
  if (!c) { if (!e.shiftKey) seleccionar({ celdas: [] }); return; }
  raiz.setPointerCapture(e.pointerId);
  if (st.herramienta === 'pincel' && est.tipo === 'fachada') {
    const valor = valorPincel(c);
    // el primer clic fija si el gesto agrega o quita
    gesto = { tipo: 'pincel', base: st.diseno, d: st.diseno, valor, pintadas: new Set() };
    pintar(c);
    return;
  }
  const f = +c.split(':')[0];
  gesto = { tipo: 'sel', ancla: c, previas: e.shiftKey ? [...st.sel.celdas] : [], ultimo: c };
  seleccionar({ celdas: [...new Set([...gesto.previas, c])], frente: f });
}

function pintar(c) {
  if (gesto.pintadas.has(c)) return;
  gesto.pintadas.add(c);
  gesto.d = setOverride(gesto.d, st.sel.estructuraId, c, gesto.valor);
  preview(gesto.d);
}

function alMover(e) {
  const c = celdaEn(e.clientX, e.clientY);
  if (gesto?.tipo === 'pincel') { if (c) pintar(c); return; }
  if (gesto?.tipo === 'sel') {
    if (c && c !== gesto.ultimo) {
      gesto.ultimo = c;
      seleccionar({ celdas: [...new Set([...gesto.previas, ...rectSel(gesto.ancla, c)])] });
    }
    return;
  }
  if (c !== st.hover.celda) { st.hover.celda = c; emit('hover'); }
}

function alSoltar() {
  const g = gesto;
  gesto = null;
  if (!g || g.tipo !== 'pincel') return;
  if (!g.pintadas.size || g.d === g.base) return;
  const nombre = `${PINCELES.find((p) => p.n === st.pincel).nombre} ${rangoCeldas([...g.pintadas])}${g.pintadas.size > 1 ? ` (${g.pintadas.size} celdas)` : ''}`;
  commit(g.d, `Pincel · ${nombre}`, g.base);
}

export function textoSeleccion() {
  const n = st.sel.celdas.length;
  if (!n) return st.herramienta === 'pincel' ? `Pincel ${PINCELES.find((p) => p.n === st.pincel).nombre}: pintá celdas (clic o arrastre)` : 'Clic o arrastre para elegir celdas · rótulos N y V eligen filas o columnas';
  if (n === 1) return `Celda ${etiquetaCelda(st.sel.celdas[0])}`;
  return `${n} celdas · ${rangoCeldas(st.sel.celdas)}`;
}
