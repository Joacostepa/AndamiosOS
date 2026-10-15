// vista3d.js · vista 3D de la maqueta (three@0.160.0).
// InstancedMesh por geometría base (tubos, placas, cubiertas) + una malla invisible para picking.
// Render a demanda: solo se dibuja cuando algo cambia. Manijas de largo/altura, colocación con snap,
// overlays de celdas (selección, hover, errores) y exportación PNG iso con fondo blanco.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { construir, setParam, agregarEstructura, buscarSnap, crearDiseno, PLANTILLAS, fmt } from './motor.js';
import { st, commit } from './estado.js';
import { evalExpr, kg, LETRAS } from './ui-base.js';

// ── paletas (sobrias; rojo reservado para errores, coral para selección) ──
const PAL_OSCURO = {
  vertical: '#c3c9d2', horizontal: '#7f8897', baranda: '#d3a23e', diagonal: '#5a8bc6', plataforma: '#8d7a64',
  fenolico: '#b58b57', rodapie: '#6f5f4d', base: '#59626e', collarin: '#59626e', anclaje: '#3dbb8c', mensula: '#b383db',
  viga: '#d8b54a', escalera: '#3fb5ae', zanca: '#3fb5ae', bastidor: '#9fb4ca', rienda: '#5a8bc6', cruceta: '#5a8bc6',
  accesorio: '#dfe3e8', esfera: '#ff8a3d', cubierta: '#2c5a46', lona: '#cfd5dc',
  muro: '#34373c', muroBorde: '#4a4e55', suelo: '#1d1e21', grilla1: '#2c2e33', grilla2: '#24262a',
  sel: '#e2683c', hover: '#ffffff', err: '#ff4d4d', fondo: '#18191b',
};
const PAL_CLARO = {
  vertical: '#4f5966', horizontal: '#7c8592', baranda: '#c08712', diagonal: '#2d6bb3', plataforma: '#9b8366',
  fenolico: '#a87a43', rodapie: '#7a654c', base: '#3a424d', collarin: '#3a424d', anclaje: '#1b9a6a', mensula: '#8a4cc0',
  viga: '#b68a10', escalera: '#1b8d87', zanca: '#1b8d87', bastidor: '#5b7895', rienda: '#2d6bb3', cruceta: '#2d6bb3',
  accesorio: '#9aa3ad', esfera: '#e8651a', cubierta: '#2f5a47', lona: '#9aa3ad',
  muro: '#d3d6da', muroBorde: '#b7bbc1', suelo: '#e4e6e9', grilla1: '#cfd2d6', grilla2: '#d9dbde',
  sel: '#d9531f', hover: '#111111', err: '#e01e1e', fondo: '#eceef1',
};
const PAL_EXPORT = { ...PAL_CLARO, suelo: '#f3f4f6', muro: '#e3e5e8', muroBorde: '#c4c8cd', fondo: '#ffffff' };

export const LEYENDA = [
  ['vertical', 'Verticales'], ['horizontal', 'Horizontales'], ['baranda', 'Barandas'], ['diagonal', 'Diagonales'],
  ['plataforma', 'Plataformas'], ['anclaje', 'Anclajes'], ['mensula', 'Ménsulas'], ['viga', 'Vigas'], ['escalera', 'Accesos'],
];

const RADIO = {
  vertical: 0.026, horizontal: 0.022, baranda: 0.02, diagonal: 0.017, base: 0.03, collarin: 0.034, anclaje: 0.016,
  mensula: 0.024, viga: 0.022, escalera: 0.02, zanca: 0.032, bastidor: 0.022, rienda: 0.012, cruceta: 0.012, accesorio: 0.04,
};

let pal = PAL_OSCURO;
let renderer, scene, camera, controls, cont, canvas, overlay, cb = {};
let gObra, gOver, gGhost, gManijas, gPuertos, suelo, grilla;
let mallas = {};
let mapas = {};
let piezas = [];
let hoverPi = -1;
let bbox = new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1));
let vistaActual = 3;
let chips = []; // overlays HTML posicionados en 3D: {el, pos:Vector3}
let manijaActiva = null; // {def, buffer, drag, t0, k, prev}
let colocando = null;
let pendiente = false;
let ultimoEv = null, movPend = false;
let downXY = null;
const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();
const PLANO = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const Y = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Color();

const matTubo = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.35, roughness: 0.5 });
const matCaja = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.15, roughness: 0.75 });
const matCub = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, roughness: 1 });
const matPick = new THREE.MeshBasicMaterial({ visible: false });
// edificio de contexto semitransparente: se ve el andamio a través (no tapa torres ni la planta)
const matMuro = new THREE.MeshStandardMaterial({ color: 0x34373c, roughness: 0.95, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false });
let verContexto = true;
const geoCil = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
const geoCaja = new THREE.BoxGeometry(1, 1, 1);

// ───────────────────────────── inicio ─────────────────────────────
export function iniciar3d(opts) {
  cont = opts.contenedor; canvas = opts.canvas; overlay = opts.overlay; cb = opts.callbacks || {};
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));
  const sol = new THREE.DirectionalLight(0xffffff, 1.4);
  sol.position.set(20, 40, 30);
  scene.add(sol);
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 3000);
  camera.position.set(30, 22, 34);
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.screenSpacePanning = true;
  controls.maxPolarAngle = Math.PI * 0.499;
  controls.addEventListener('change', pedirRender);

  suelo = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x1d1e21, roughness: 1 }));
  suelo.rotation.x = -Math.PI / 2;
  suelo.position.y = -0.005;
  scene.add(suelo);
  gObra = new THREE.Group(); gOver = new THREE.Group(); gGhost = new THREE.Group(); gManijas = new THREE.Group(); gPuertos = new THREE.Group();
  scene.add(gObra, gOver, gGhost, gManijas, gPuertos);

  aplicarTema();
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  mq.addEventListener?.('change', () => { aplicarTema(); recolorear(); });
  new MutationObserver(() => { aplicarTema(); recolorear(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  new ResizeObserver(redimensionar).observe(cont);
  redimensionar();

  canvas.addEventListener('pointermove', (e) => { ultimoEv = e; if (!movPend) { movPend = true; requestAnimationFrame(procesarMovimiento); } });
  canvas.addEventListener('pointerdown', alApretar);
  canvas.addEventListener('pointerup', alSoltar);
  canvas.addEventListener('pointerleave', () => { if (!manijaActiva?.drag) setHover(-1, null); });
  canvas.addEventListener('dblclick', () => encuadrar());
}

function aplicarTema() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--viewport').trim() || '#18191b';
  _c.set(v);
  const lum = 0.2126 * _c.r + 0.7152 * _c.g + 0.0722 * _c.b;
  pal = lum > 0.5 ? PAL_CLARO : PAL_OSCURO;
  scene.background = new THREE.Color(pal.fondo);
  suelo.material.color.set(pal.suelo);
  matMuro.color.set(pal.muro);
  crearGrilla();
  pedirRender();
}
function quitarGrilla() {
  if (!grilla) return;
  grilla.parent?.remove(grilla);
  grilla.geometry.dispose();
  grilla.material.dispose?.();
  grilla = null;
}
function crearGrilla() {
  quitarGrilla();
  if (!gObra) return;
  const c = bbox.getCenter(new THREE.Vector3());
  const tam = Math.ceil(Math.max(bbox.max.x - bbox.min.x, bbox.max.z - bbox.min.z) + 24);
  grilla = new THREE.GridHelper(tam, Math.round(tam), pal.grilla1, pal.grilla2);
  grilla.position.set(Math.round(c.x), 0.002, Math.round(c.z));
  gObra.add(grilla);
}
/** Muestra u oculta el edificio de contexto (muros y losas). */
export function alternarContexto(v = !verContexto) {
  verContexto = v;
  gObra?.traverse((o) => { if (o.userData.contexto) o.visible = verContexto; });
  pedirRender();
  return verContexto;
}
export const contextoVisible = () => verContexto;
export const paletaActual = () => pal;

function redimensionar() {
  const w = cont.clientWidth, h = cont.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  pedirRender();
}

export function pedirRender() {
  if (pendiente) return;
  pendiente = true;
  requestAnimationFrame(() => {
    pendiente = false;
    renderer.render(scene, camera);
    posicionarChips();
  });
}

// ───────────────────────────── carga del modelo ─────────────────────────────
function vaciar(g) {
  for (const o of [...g.children]) {
    g.remove(o);
    o.traverse?.((x) => {
      if (x.geometry && x.geometry !== geoCil && x.geometry !== geoCaja) x.geometry.dispose();
      if (x.material && ![matTubo, matCaja, matCub, matPick, matMuro].includes(x.material)) x.material.dispose?.();
    });
    if (o.isInstancedMesh) o.dispose();
  }
}

function claveColor(p) {
  if (p.codigo === 'PLACA-FEN-122x244') return 'fenolico';
  if (p.codigo === 'ESFERA-SEG') return 'esfera';
  if (p.codigo === 'LONA-PVC') return 'lona';
  return p.tipo;
}

export function cargar(primeraVez = false) {
  const res = st.res;
  quitarGrilla();
  vaciar(gObra);
  piezas = res.piezas;
  hoverPi = -1;
  const uDe = (p) => {
    const e = res.estructuras.find((x) => x.id === p.estructuraId);
    const m = /\/f(\d+)/.exec(p.owner);
    const F = e?.frentes[m ? +m[1] : 0];
    return F ? F.u : [1, 0];
  };
  const tubos = [], cajas = [], cubs = [], picks = [];
  const mT = () => new THREE.Matrix4();
  piezas.forEach((p, pi) => {
    const a = p.a, b = p.b;
    if (p.tipo === 'cubierta') {
      const dx = b[0] - a[0], dz = b[2] - a[2];
      const L = Math.hypot(dx, dz), H = Math.abs(b[1] - a[1]);
      _q.setFromAxisAngle(Y, -Math.atan2(dz, dx));
      _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      cubs.push({ pi, m: mT().compose(_p, _q, _s.set(L, H, 0.01)) });
      return;
    }
    if (p.tipo === 'plataforma' && p.codigo === 'PLACA-FEN-122x244') {
      const u = uDe(p), n = [-u[1], u[0]];
      const dx = b[0] - a[0], dz = b[2] - a[2];
      const dl = Math.abs(dx * u[0] + dz * u[1]), dw = Math.abs(dx * n[0] + dz * n[1]);
      _q.setFromAxisAngle(Y, -Math.atan2(u[1], u[0]));
      _p.set((a[0] + b[0]) / 2, a[1], (a[2] + b[2]) / 2);
      cajas.push({ pi, m: mT().compose(_p, _q, _s.set(dl, 0.022, dw)) });
      picks.push({ pi, m: mT().compose(_p, _q, _s.set(dl, 0.08, dw)) });
      return;
    }
    if (p.tipo === 'plataforma' || p.tipo === 'rodapie') {
      const dx = b[0] - a[0], dz = b[2] - a[2];
      const L = Math.hypot(dx, dz);
      if (L > 1e-3) {
        _q.setFromAxisAngle(Y, -Math.atan2(dz, dx));
        _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
        const [alto, ancho] = p.tipo === 'plataforma' ? [0.045, 0.3] : [0.15, 0.025];
        cajas.push({ pi, m: mT().compose(_p, _q, _s.set(L - 0.02, alto, ancho)) });
        picks.push({ pi, m: mT().compose(_p, _q, _s.set(L, Math.max(alto, 0.08), Math.max(ancho, 0.08))) });
        return;
      }
    }
    const r = RADIO[p.tipo] || 0.02;
    const segs = p.primitivas?.length ? p.primitivas : [{ a, b }];
    for (const sg of segs) {
      const m = mT(), mp = mT();
      tuboMat(sg.a, sg.b, r, m, mp);
      tubos.push({ pi, m });
      picks.push({ pi, m: mp });
    }
  });

  const crear = (geo, mat, lista, clave) => {
    if (!lista.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, lista.length);
    const mapa = new Int32Array(lista.length);
    lista.forEach((it, i) => { im.setMatrixAt(i, it.m); mapa[i] = it.pi; });
    im.instanceMatrix.needsUpdate = true;
    im.setColorAt(0, _c.set('#ffffff'));
    mapas[clave] = mapa;
    mallas[clave] = im;
    gObra.add(im);
    return im;
  };
  mallas = {}; mapas = {};
  crear(geoCil, matTubo, tubos, 'tubos');
  crear(geoCaja, matCaja, cajas, 'cajas');
  const mc = crear(geoCaja, matCub, cubs, 'cubs');
  if (mc) mc.renderOrder = 2;
  const pk = crear(geoCaja, matPick, picks, 'pick');
  if (pk) pk.computeBoundingSphere();

  // muros del edificio (contexto) detrás de cada frente de fachada
  for (const e of res.estructuras) {
    if (e.tipo !== 'fachada') continue;
    const est = st.diseno.estructuras.find((x) => x.id === e.id);
    const retiro = Math.max(0.05, est?.params?.retiro ?? 0.2);
    for (const F of e.frentes) {
      const s0 = F.S[0] - 0.25, s1 = F.S[F.S.length - 1] + 0.25;
      const prof = 7, H = e.alturaReal + 2.5;
      const geo = new THREE.BoxGeometry(s1 - s0, H, prof);
      const muro = new THREE.Mesh(geo, matMuro);
      const cs = (s0 + s1) / 2, ct = -retiro - prof / 2;
      muro.position.set(F.origen[0] + F.u[0] * cs + F.n[0] * ct, H / 2, F.origen[1] + F.u[1] * cs + F.n[1] * ct);
      muro.rotation.y = -Math.atan2(F.u[1], F.u[0]);
      muro.userData.muro = true;
      muro.userData.contexto = true;
      muro.visible = verContexto;
      muro.renderOrder = 1;
      gObra.add(muro);
      const bordes = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: pal.muroBorde }));
      bordes.position.copy(muro.position); bordes.rotation.copy(muro.rotation);
      bordes.userData.contexto = true;
      bordes.visible = verContexto;
      gObra.add(bordes);
      // líneas de losas cada 3 m sobre la cara del edificio
      const pts = [];
      for (let y = 3; y < H - 0.5; y += 3) {
        const A = [F.origen[0] + F.u[0] * s0 + F.n[0] * (-retiro + 0.01), y, F.origen[1] + F.u[1] * s0 + F.n[1] * (-retiro + 0.01)];
        const B = [F.origen[0] + F.u[0] * s1 + F.n[0] * (-retiro + 0.01), y, F.origen[1] + F.u[1] * s1 + F.n[1] * (-retiro + 0.01)];
        pts.push(...A, ...B);
      }
      if (pts.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        const losas = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: pal.muroBorde, transparent: true, opacity: 0.6 }));
        losas.userData.contexto = true;
        losas.visible = verContexto;
        gObra.add(losas);
      }
    }
  }

  // caja envolvente
  bbox = new THREE.Box3();
  for (const p of piezas) { bbox.expandByPoint(_p.set(...p.a)); bbox.expandByPoint(_p.set(...p.b)); }
  if (bbox.isEmpty()) bbox.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1));
  // el edificio de contexto entra en el encuadre (si no, sale cortado arriba)
  if (verContexto) {
    for (const e of res.estructuras) {
      if (e.tipo !== 'fachada') continue;
      for (const F of e.frentes) {
        const H = e.alturaReal + 2.5;
        for (const s of [F.S[0], F.S[F.S.length - 1]]) bbox.expandByPoint(_p.set(F.origen[0] + F.u[0] * s, H, F.origen[1] + F.u[1] * s));
      }
    }
  }
  crearGrilla();

  recolorear();
  actualizarOverlays();
  if (primeraVez) vista(3, false);
  pedirRender();
}

function tuboMat(a, b, r, out, pickOut) {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const L = _d.length();
  _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  if (L < 1e-4) {
    _q.identity();
    out.compose(_p, _q, _s.set(0.07, 0.14, 0.07));
    pickOut.compose(_p, _q, _s.set(0.16, 0.16, 0.16));
    return;
  }
  _d.divideScalar(L);
  _q.setFromUnitVectors(Y, _d);
  out.compose(_p, _q, _s.set(r, L, r));
  const g = Math.max(r * 3, 0.09);
  pickOut.compose(_p, _q, _s.set(g, L, g));
}

// ───────────────────────────── color ─────────────────────────────
function colorDe(pi, P = pal, conEstados = true) {
  const p = piezas[pi];
  if (conEstados) {
    if (pi === hoverPi) return P.hover;
    if (st.bomResaltado && p.codigo === st.bomResaltado) return P.sel;
    if (p.celda && p.estructuraId === st.sel.estructuraId && selSet.has(p.celda)) return P.sel;
    if (p.celda && errSet.has(`${p.estructuraId}|${p.celda}`)) return P.err;
  }
  return P[claveColor(p)] || P.horizontal;
}
let selSet = new Set(), errSet = new Set();
export function recolorear(P = pal, conEstados = true) {
  selSet = new Set(st.sel.celdas);
  errSet = new Set((st.res?.avisos || []).filter((a) => a.nivel === 'error' && a.celda).flatMap((a) => celdasDeAviso(a)));
  for (const k of ['tubos', 'cajas', 'cubs']) {
    const im = mallas[k];
    if (!im) continue;
    const mapa = mapas[k];
    for (let i = 0; i < mapa.length; i++) im.setColorAt(i, _c.set(colorDe(mapa[i], P, conEstados)));
    im.instanceColor.needsUpdate = true;
  }
  pedirRender();
}
function celdasDeAviso(a) {
  const out = [`${a.estructuraId}|${a.celda}`];
  for (const r of a.reparaciones || []) for (const c of r.accion?.celdas || []) out.push(`${a.estructuraId}|${c}`);
  return out;
}
function recolorPieza(pi) {
  if (pi < 0) return;
  for (const k of ['tubos', 'cajas', 'cubs']) {
    const im = mallas[k];
    if (!im) continue;
    const mapa = mapas[k];
    let toc = false;
    for (let i = 0; i < mapa.length; i++) if (mapa[i] === pi) { im.setColorAt(i, _c.set(colorDe(pi))); toc = true; }
    if (toc) im.instanceColor.needsUpdate = true;
  }
}

// ───────────────────────────── overlays (celdas, huella, manijas, chips) ─────────────────────────────
export function actualizarOverlays() {
  vaciar(gOver);
  vaciar(gManijas);
  for (const c of chips) c.el.remove();
  chips = [];
  const res = st.res;
  const celdas = res.celdas.filter((c) => c.estructuraId === st.sel.estructuraId);
  const sel = new Set(st.sel.celdas);
  const quads = (lista, color, op) => {
    if (!lista.length) return;
    const pos = [];
    for (const c of lista) {
      const e = c.esquinas;
      const e1 = new THREE.Vector3(...e[1]).sub(new THREE.Vector3(...e[0]));
      const e3 = new THREE.Vector3(...e[3]).sub(new THREE.Vector3(...e[0]));
      const n = e1.clone().cross(e3).normalize().multiplyScalar(0.06);
      const P = e.map((q) => [q[0] + n.x, q[1] + n.y, q[2] + n.z]);
      pos.push(...P[0], ...P[1], ...P[2], ...P[0], ...P[2], ...P[3]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false }));
    m.renderOrder = 3;
    gOver.add(m);
    const lp = [];
    for (const c of lista) {
      const e = c.esquinas;
      for (let i = 0; i < 4; i++) lp.push(...e[i], ...e[(i + 1) % 4]);
    }
    const gl = new THREE.BufferGeometry();
    gl.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    gOver.add(new THREE.LineSegments(gl, new THREE.LineBasicMaterial({ color, transparent: true, opacity: Math.min(1, op * 2.4) })));
  };
  quads(celdas.filter((c) => sel.has(c.celda)), pal.sel, 0.28);
  if (st.hover.celda && !sel.has(st.hover.celda)) quads(celdas.filter((c) => c.celda === st.hover.celda), pal.hover, 0.16);

  // huella de la estructura seleccionada
  const e = res.estructuras.find((x) => x.id === st.sel.estructuraId);
  if (e) {
    for (const hu of e.huellas || []) {
      const pts = hu.map(([x, z]) => new THREE.Vector3(x, 0.02, z));
      pts.push(pts[0].clone());
      gOver.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: pal.sel })));
    }
    crearManijas(e);
    crearChips(e);
  }
  pedirRender();
}

function mundo(F, s, y, t) {
  return new THREE.Vector3(F.origen[0] + F.u[0] * s + F.n[0] * t, y, F.origen[1] + F.u[1] * s + F.n[1] * t);
}

function defsManijas(e) {
  const est = st.diseno.estructuras.find((x) => x.id === e.id);
  if (!est) return [];
  const out = [];
  if (e.tipo === 'fachada') {
    const f = st.sel.frente ?? e.frentes.length - 1;
    const F = e.frentes[f];
    const sEnd = F.S[F.S.length - 1];
    out.push({ tipo: 'largo', estructuraId: e.id, frente: f, ruta: `params.frentes.${f}.largo`, valor0: est.params.frentes[f].largo, paso: 2.5,
      pos: mundo(F, sEnd + 0.55, e.alturaReal * 0.5, e.prof / 2), eje: new THREE.Vector3(F.u[0], 0, F.u[1]), etiqueta: `Frente ${LETRAS[f]}`, unidad: 'vanos' });
    const F0 = e.frentes[0];
    out.push({ tipo: 'altura', estructuraId: e.id, ruta: 'params.altura', valor0: est.params.altura, paso: e.sistema === 'bastidor' ? 1.8 : 2,
      pos: mundo(F0, (F0.S[0] + F0.S[F0.S.length - 1]) / 2, e.alturaReal + 0.75, e.prof / 2), eje: Y.clone(), etiqueta: 'Altura', unidad: 'niveles' });
  } else if (e.tipo === 'torre') {
    const heredada = st.diseno.uniones.some((u) => u.modo !== 'apoyo' && (u.a.estructuraId === e.id || u.b.estructuraId === e.id));
    if (!heredada) {
      const F = e.frentes[0];
      out.push({ tipo: 'altura', estructuraId: e.id, ruta: 'params.altura', valor0: est.params.altura, paso: 2,
        pos: mundo(F, F.S[1] / 2, e.alturaReal + 0.75, e.prof / 2), eje: Y.clone(), etiqueta: 'Altura', unidad: 'niveles' });
    }
  } else if (e.tipo === 'portico' && e.clase !== 'vehicular') {
    const F = e.frentes[0];
    out.push({ tipo: 'largo', estructuraId: e.id, frente: 0, ruta: 'params.largo', valor0: est.params.largo, paso: 2.5,
      pos: mundo(F, F.S[F.S.length - 1] + 0.55, e.alturaReal * 0.5, e.prof / 2), eje: new THREE.Vector3(F.u[0], 0, F.u[1]), etiqueta: 'Pórtico', unidad: 'vanos' });
  }
  return out;
}

function crearManijas(e) {
  for (const def of defsManijas(e)) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: pal.sel, depthTest: false, transparent: true });
    const esfera = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 12), mat);
    const cono1 = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 14), mat);
    const cono2 = cono1.clone();
    const q = new THREE.Quaternion().setFromUnitVectors(Y, def.eje);
    cono1.quaternion.copy(q); cono1.position.copy(def.eje).multiplyScalar(0.48);
    cono2.quaternion.copy(q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)));
    cono2.position.copy(def.eje).multiplyScalar(-0.48);
    g.add(esfera, cono1, cono2);
    g.position.copy(def.pos);
    g.renderOrder = 10;
    g.traverse((o) => { o.renderOrder = 10; o.userData.manija = def; });
    gManijas.add(g);
    if (manijaActiva && manijaActiva.def.ruta === def.ruta && manijaActiva.def.estructuraId === def.estructuraId) {
      manijaActiva.def = { ...def, valor0: manijaActiva.def.valor0 };
      if (manijaActiva.drag || manijaActiva.buffer || manijaActiva.k) chipEtiqueta(def.pos);
    }
  }
}

function crearChips(e) {
  const res = st.res;
  for (const u of res.uniones) {
    if (u.tipo === 'esquina' && u.estructuraId === e.id && u.editable) {
      const F = e.frentes[u.b.frente];
      const pos = mundo(F, F.S[0] + (F.sIni < 0 ? 0 : 0), e.alturaReal + 1.1, e.prof);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'ov-chip';
      el.innerHTML = `<span>Esquina ${LETRAS[u.a.frente]}↔${LETRAS[u.b.frente]}: ${u.modo === 'vano_giro' ? 'vano de giro' : 'vertical compartida'}</span><span class="sw" title="Cambiar">⇄</span>`;
      el.title = 'Cambiar la variante de esquina';
      el.addEventListener('click', () => cb.alternarUnion?.(u));
      overlay.append(el);
      chips.push({ el, pos });
    }
    if (u.tipo === 'estructura' && (u.a.estructuraId === e.id || u.b.estructuraId === e.id)) {
      const rb = res.estructuras.find((x) => x.id === u.b.estructuraId);
      if (!rb) continue;
      const F = rb.frentes[0];
      const pos = mundo(F, F.S[F.S.length - 1] / 2, Math.max(rb.alturaReal, 2.5) + 1.1, rb.prof / 2);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'ov-chip';
      const modo = u.modo === 'vertical_compartida' ? `comparte ${u.compartidas} vert.` : u.modo === 'vano_giro' ? 'vano de conexión 0,73' : 'apoyo';
      el.innerHTML = `<span>${u.nombreB} · ${modo}</span>${u.alternar ? '<span class="sw" title="Cambiar">⇄</span>' : ''}`;
      if (u.alternar) el.addEventListener('click', () => cb.alternarUnion?.(u));
      overlay.append(el);
      chips.push({ el, pos });
    }
  }
}
let chipLabel = null;
function chipEtiqueta(pos) {
  if (!chipLabel) {
    chipLabel = document.createElement('div');
    chipLabel.className = 'ov-label';
  }
  overlay.append(chipLabel);
  chips.push({ el: chipLabel, pos: pos.clone(), label: true });
  pintarEtiqueta();
}
function pintarEtiqueta() {
  if (!chipLabel || !manijaActiva) return;
  const m = manijaActiva;
  const d = m.def;
  if (m.buffer) {
    chipLabel.className = 'ov-label';
    chipLabel.innerHTML = `${d.etiqueta}: ${m.buffer}<span class="cursor"></span> m<small>Enter aplica · Esc cancela</small>`;
    return;
  }
  const k = m.k || 0;
  const valor = Math.max(d.paso, d.valor0 + k * d.paso);
  const pr = m.prev;
  const dkg = pr ? pr.dkg : 0;
  const dn = pr ? pr.dn : k;
  chipLabel.className = 'ov-label' + (k < 0 ? ' menos' : '');
  chipLabel.innerHTML = `${k >= 0 ? '+' : '−'}${Math.abs(dn)} ${d.unidad} · ${dkg >= 0 ? '+' : '−'}${kg(Math.abs(dkg))} kg<small>${d.etiqueta} ${fmt(d.valor0)} → ${fmt(valor)} m · tipeá un número</small>`;
}

function posicionarChips() {
  if (!chips.length) return;
  const w = cont.clientWidth, h = cont.clientHeight;
  for (const c of chips) {
    const v = c.pos.clone().project(camera);
    const fuera = v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1;
    c.el.style.display = fuera ? 'none' : '';
    c.el.style.left = `${((v.x + 1) / 2) * w}px`;
    c.el.style.top = `${((1 - v.y) / 2) * h}px`;
  }
}

// ───────────────────────────── puntero ─────────────────────────────
function setRay(e) {
  const r = canvas.getBoundingClientRect();
  ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ptr, camera);
}
function hitManija() {
  const hit = ray.intersectObjects(gManijas.children, true)[0];
  return hit ? hit.object.userData.manija : null;
}
function hitPieza() {
  if (!mallas.pick) return -1;
  const hit = ray.intersectObject(mallas.pick, false)[0];
  return hit ? mapas.pick[hit.instanceId] : -1;
}

/** Punto en planta para ubicar: si el cursor pasa sobre el andamio (a cualquier altura) o sobre el edificio, se toma
 *  la proyección en el suelo de ese punto; si no, la intersección con el suelo. Así el encastre funciona apuntando
 *  al andamio y no solo a la franja de su base. */
function puntoColocacion() {
  const objetivos = [];
  if (mallas.pick) objetivos.push(mallas.pick);
  for (const o of gObra.children) if (o.userData.muro && o.visible) objetivos.push(o);
  const hit = objetivos.length ? ray.intersectObjects(objetivos, false)[0] : null;
  if (hit) return [hit.point.x, hit.point.z];
  const q = ray.ray.intersectPlane(PLANO, new THREE.Vector3());
  return q ? [q.x, q.z] : null;
}
const RADIO_SNAP = 3.5;

function procesarMovimiento() {
  movPend = false;
  const e = ultimoEv;
  if (!e) return;
  setRay(e);
  if (manijaActiva?.drag) { arrastrarManija(); return; }
  if (colocando) {
    const q = puntoColocacion();
    if (q) moverColocacion(q, e.altKey);
    return;
  }
  const m = hitManija();
  if (m) { canvas.style.cursor = 'grab'; setHover(-1, null); return; }
  const pi = hitPieza();
  canvas.style.cursor = pi >= 0 ? 'pointer' : '';
  setHover(pi, e);
}

function setHover(pi, e) {
  if (pi !== hoverPi) {
    const ant = hoverPi;
    hoverPi = pi;
    recolorPieza(ant);
    recolorPieza(pi);
    pedirRender();
  }
  cb.alHover?.(pi >= 0 ? piezas[pi] : null, e);
}

function alApretar(e) {
  downXY = [e.clientX, e.clientY];
  if (e.button !== 0) return;
  setRay(e);
  if (colocando) return;
  const def = hitManija();
  if (def) {
    e.preventDefault();
    controls.enabled = false;
    canvas.setPointerCapture(e.pointerId);
    const t0 = proyectarEje(def);
    manijaActiva = { def, buffer: '', drag: true, t0, k: 0, prev: null, base: st.diseno };
    canvas.style.cursor = 'grabbing';
    chipEtiqueta(def.pos);
    cb.alManija?.(true);
    pedirRender();
  }
}

function alSoltar(e) {
  const click = downXY && Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) < 5;
  downXY = null;
  if (manijaActiva?.drag) {
    manijaActiva.drag = false;
    controls.enabled = true;
    canvas.style.cursor = '';
    if (manijaActiva.k) aplicarManija(manijaActiva.def.valor0 + manijaActiva.k * manijaActiva.def.paso);
    else { pintarEtiqueta(); pedirRender(); }
    return;
  }
  if (!click || e.button !== 0) return;
  if (colocando) { confirmarColocacion(e.altKey); return; }
  if (manijaActiva) cancelarManija();
  setRay(e);
  const pi = hitPieza();
  cb.alClic?.(pi >= 0 ? piezas[pi] : null, e);
}

// ── manijas ──
function proyectarEje(def) {
  const P0 = def.pos, A = def.eje, O = ray.ray.origin, D = ray.ray.direction;
  const w0 = P0.clone().sub(O);
  const a = A.dot(A), b = A.dot(D), c = D.dot(D), d = A.dot(w0), e2 = D.dot(w0);
  const den = a * c - b * b;
  if (Math.abs(den) < 1e-6) return 0;
  return (b * e2 - c * d) / den;
}
function arrastrarManija() {
  const m = manijaActiva;
  const t = proyectarEje(m.def);
  const minK = Math.ceil((m.def.paso - m.def.valor0) / m.def.paso);
  const k = Math.max(minK, Math.round((t - m.t0) / m.def.paso));
  if (k === m.k) return;
  m.k = k;
  m.buffer = '';
  m.prev = previsualizar(m.def, m.def.valor0 + k * m.def.paso);
  pintarEtiqueta();
  pedirRender();
}
function previsualizar(def, valor) {
  vaciar(gGhost);
  const d = setParam(st.diseno, def.estructuraId, def.ruta, valor);
  const r = construir(d);
  const eA = st.res.estructuras.find((x) => x.id === def.estructuraId);
  const eB = r.estructuras.find((x) => x.id === def.estructuraId);
  const dkg = r.resumen.pesoKg - st.res.resumen.pesoKg;
  let dn = 0;
  if (!eA || !eB) return { dkg, dn };
  const crece = valor >= def.valor0;
  const color = crece ? pal.sel : pal.err;
  const caja = (F, s0, s1, y0, y1, t0, t1) => {
    if (Math.abs(s1 - s0) < 1e-3 || Math.abs(y1 - y0) < 1e-3) return;
    const geo = new THREE.BoxGeometry(Math.abs(s1 - s0), Math.abs(y1 - y0), Math.abs(t1 - t0));
    const mm = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false }));
    mm.position.copy(mundo(F, (s0 + s1) / 2, (y0 + y1) / 2, (t0 + t1) / 2));
    mm.rotation.y = -Math.atan2(F.u[1], F.u[0]);
    const ed = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color }));
    ed.position.copy(mm.position); ed.rotation.copy(mm.rotation);
    gGhost.add(mm, ed);
  };
  if (def.tipo === 'largo') {
    const FA = eA.frentes[def.frente], FB = eB.frentes[def.frente];
    dn = FB.vanos.length - FA.vanos.length;
    caja(FA, FA.S[FA.S.length - 1], FB.S[FB.S.length - 1], 0, Math.max(eA.alturaReal, eB.alturaReal), 0, eA.prof);
  } else {
    dn = eB.frentes[0].niveles.length - eA.frentes[0].niveles.length;
    for (let i = 0; i < eA.frentes.length; i++) {
      const F = eA.frentes[i];
      caja(F, F.S[0], F.S[F.S.length - 1], eA.alturaReal, eB.frentes[i]?.alturaReal ?? eB.alturaReal, 0, eA.prof);
    }
  }
  return { dkg, dn };
}
function aplicarManija(valor) {
  const m = manijaActiva;
  if (!m) return;
  const def = m.def;
  vaciar(gGhost);
  const v = Math.max(def.paso >= 2 ? 1 : 0.5, Math.round(valor * 100) / 100);
  manijaActiva = null;
  chipLabel?.remove();
  cb.alManija?.(false);
  if (Math.abs(v - def.valor0) < 1e-6) { actualizarOverlays(); return; }
  const d = setParam(st.diseno, def.estructuraId, def.ruta, v);
  commit(d, `${def.etiqueta} ${fmt(def.valor0)} → ${fmt(v)} m`);
}
export function cancelarManija() {
  if (!manijaActiva) return false;
  manijaActiva = null;
  vaciar(gGhost);
  chipLabel?.remove();
  controls.enabled = true;
  cb.alManija?.(false);
  actualizarOverlays();
  return true;
}
export const manijaEnUso = () => !!manijaActiva;
/** Teclas mientras una manija está activa: números + Enter. Devuelve true si consumió la tecla. */
export function teclaManija(e) {
  const m = manijaActiva;
  if (!m) return false;
  if (e.key === 'Escape') { cancelarManija(); return true; }
  if (/^[0-9.,+]$/.test(e.key)) { m.buffer += e.key; m.k = 0; vaciar(gGhost); pintarEtiqueta(); return true; }
  if (e.key === 'Backspace') { m.buffer = m.buffer.slice(0, -1); pintarEtiqueta(); return true; }
  if (e.key === 'Enter') {
    const v = m.buffer ? evalExpr(m.buffer) : m.def.valor0 + m.k * m.def.paso;
    if (v != null && v > 0) aplicarManija(v); else cancelarManija();
    return true;
  }
  return false;
}
/** Activa la manija de largo/altura de la estructura seleccionada desde el teclado o la UI. */
export function activarManija(tipo) {
  const e = st.res.estructuras.find((x) => x.id === st.sel.estructuraId);
  if (!e) return false;
  const def = defsManijas(e).find((d) => d.tipo === tipo);
  if (!def) return false;
  manijaActiva = { def, buffer: '', drag: false, t0: 0, k: 0, prev: null };
  chipEtiqueta(def.pos);
  cb.alManija?.(true);
  pedirRender();
  return true;
}

// ── colocación con snap ──
export function empezarColocacion(plantillaId) {
  cancelarManija();
  const pl = PLANTILLAS.find((p) => p.id === plantillaId);
  colocando = { plantillaId, nombre: pl.nombre, rumbo: 0, prop: null, snap: null };
  const movil = crearDiseno(plantillaId).estructuras[0];
  dibujarPuertos(movil.tipo);
  canvas.style.cursor = 'crosshair';
  cb.alColocar?.({ estado: 'inicio', nombre: pl.nombre, tipo: movil.tipo });
  // primer fantasma en el centro de la vista
  const c = controls.target;
  moverColocacion([c.x, c.z + 4], false);
}
export const colocacionActiva = () => !!colocando;
export function girarColocacion() {
  if (!colocando) return;
  colocando.rumbo = (colocando.rumbo + 90) % 360;
  if (colocando.ultimo) moverColocacion(colocando.ultimo, colocando.alt);
}
export function cancelarColocacion() {
  if (!colocando) return false;
  colocando = null;
  vaciar(gGhost); vaciar(gPuertos);
  canvas.style.cursor = '';
  cb.alColocar?.({ estado: 'fin' });
  pedirRender();
  return true;
}
function compatible(movilTipo, pt, est) {
  if (movilTipo === 'torre') return pt.tipo === 'cara' || (pt.tipo === 'extremo' && est.tipo === 'fachada');
  if (movilTipo === 'portico') return pt.tipo === 'base' && est.tipo === 'fachada';
  if (movilTipo === 'fachada') return pt.tipo === 'tope' && est.tipo === 'portico';
  return false;
}
function dibujarPuertos(movilTipo, activo = null) {
  vaciar(gPuertos);
  const pos = [];
  for (const pt of st.res.puertos) {
    const est = st.diseno.estructuras.find((e) => e.id === pt.estructuraId);
    if (!est || !compatible(movilTipo, pt, est)) continue;
    const y0 = pt.tipo === 'tope' ? pt.altura : 0.03;
    const y1 = pt.tipo === 'cara' || pt.tipo === 'extremo' ? Math.max(0.5, pt.altura || 3) : y0;
    pos.push(pt.p0[0], y0, pt.p0[2], pt.p1[0], y0, pt.p1[2]);
    if (y1 !== y0) pos.push(pt.p0[0], y0, pt.p0[2], pt.p0[0], y1, pt.p0[2], pt.p1[0], y0, pt.p1[2], pt.p1[0], y1, pt.p1[2]);
    for (const c of pt.cols) {
      const x = pt.p0[0] + pt.d[0] * c, z = pt.p0[2] + pt.d[2] * c;
      pos.push(x, y0, z, x, y0 + 0.35, z);
    }
  }
  if (pos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    gPuertos.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#4fb0ff', transparent: true, opacity: 0.85, depthTest: false })));
  }
  if (activo) {
    const pt = activo;
    const y = pt.tipo === 'tope' ? pt.altura : 0.05;
    const L = pt.largo;
    const geo = new THREE.BoxGeometry(L, 0.09, 0.09);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: pal.sel, depthTest: false }));
    m.position.set((pt.p0[0] + pt.p1[0]) / 2, y, (pt.p0[2] + pt.p1[2]) / 2);
    m.rotation.y = -Math.atan2(pt.d[2], pt.d[0]);
    m.renderOrder = 9;
    gPuertos.add(m);
  }
}
function moverColocacion(punto, alt) {
  const c = colocando;
  c.ultimo = punto; c.alt = alt;
  const movil = { ...crearDiseno(c.plantillaId).estructuras[0], id: '__movil', rumbo: c.rumbo };
  const snap = alt ? null : buscarSnap(st.diseno, movil, punto, { radio: RADIO_SNAP });
  // si el encastre (o la posición libre cuantizada) no cambió, no se reconstruye el fantasma
  const clave = snap ? `s|${snap.a.estructuraId}|${snap.a.puerto}|${snap.a.s}|${snap.modo}|${c.rumbo}` : `l|${Math.round(punto[0] * 4)}|${Math.round(punto[1] * 4)}|${c.rumbo}|${alt}`;
  if (clave === c.clave && c.prop) return;
  c.clave = clave;
  let prop;
  try {
    if (snap) {
      prop = agregarEstructura(st.diseno, c.plantillaId, { unirA: { estructuraId: snap.a.estructuraId, puerto: snap.a.puerto, s: snap.a.s, modo: snap.modo, puertoPropio: snap.b.puerto } });
    } else {
      const r0 = construir({ ...st.diseno, estructuras: [{ ...movil, origen: [0, 0] }], uniones: [] });
      const e0 = r0.estructuras[0];
      const L = e0 ? Math.max(...e0.huellas.flat().map((q) => q[0])) : 0;
      const W = e0 ? Math.max(...e0.huellas.flat().map((q) => q[1])) : 0;
      const off = new THREE.Vector2(L / 2, W / 2).rotateAround(new THREE.Vector2(0, 0), (c.rumbo * Math.PI) / 180);
      const o = [Math.round((punto[0] - off.x) * 4) / 4, Math.round((punto[1] - off.y) * 4) / 4];
      prop = agregarEstructura(st.diseno, c.plantillaId, { origen: o, rumbo: c.rumbo });
    }
  } catch { prop = null; }
  c.prop = prop; c.snap = snap;
  vaciar(gGhost);
  if (prop) {
    const r = construir(prop.diseno);
    const pos = [];
    for (const p of r.piezas) {
      if (p.estructuraId !== prop.estructuraId || p.tipo === 'cubierta') continue;
      for (const sg of p.primitivas?.length ? p.primitivas : [p]) pos.push(...sg.a, ...sg.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    gGhost.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: snap ? pal.sel : pal.hover, transparent: true, opacity: snap ? 0.9 : 0.55 })));
    c.resProp = r;
  }
  const pt = snap ? st.res.puertos.find((x) => x.estructuraId === snap.a.estructuraId && x.id === snap.a.puerto) : null;
  dibujarPuertos(crearDiseno(c.plantillaId).estructuras[0].tipo, pt);
  cb.alColocar?.({ estado: 'mover', snap, nombre: c.nombre, alt });
  pedirRender();
}
function confirmarColocacion(alt) {
  const c = colocando;
  if (!c?.prop) return;
  if (alt && c.snap) moverColocacion(c.ultimo, true);
  const { diseno, estructuraId } = c.prop;
  const snap = alt ? null : c.snap;
  const nombre = c.nombre;
  cancelarColocacion();
  commit(diseno, snap ? `Agregar ${nombre} (unión con ${snap.etiqueta.split(' · ').slice(0, 2).join(' · ')})` : `Agregar ${nombre}`);
  cb.alColocado?.({ estructuraId, snap, nombre });
}

// ───────────────────────────── cámara ─────────────────────────────
let anim = null;
function moverCamara(pos, target, animar = true) {
  const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animar || reducir) {
    camera.position.copy(pos); controls.target.copy(target); controls.update(); pedirRender(); return;
  }
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  const ini = performance.now();
  if (anim) cancelAnimationFrame(anim);
  const paso = (now) => {
    const k = Math.min(1, (now - ini) / 380);
    const e = 1 - Math.pow(1 - k, 3);
    camera.position.lerpVectors(p0, pos, e);
    controls.target.lerpVectors(t0, target, e);
    controls.update();
    pedirRender();
    if (k < 1) anim = requestAnimationFrame(paso);
  };
  anim = requestAnimationFrame(paso);
}
/** Dirección isométrica desde el lado del andamio: promedio de las normales de los frentes (la cámara queda del lado +n,
 *  fuera del edificio). Con un solo frente gira ~32° para dar una vista a tres cuartos. */
function dirIso(alto = 0.72) {
  const h = new THREE.Vector2();
  const ns = [];
  for (const e of st.res?.estructuras || []) {
    if (e.tipo !== 'fachada') continue;
    for (const F of e.frentes) { const L = F.S[F.S.length - 1] - F.S[0]; h.x += F.n[0] * L; h.y += F.n[1] * L; ns.push(F.n); }
  }
  if (h.lengthSq() < 1e-6) return new THREE.Vector3(0.95, alto, 1.15).normalize();
  h.normalize();
  const distintas = ns.some((n) => Math.abs(n[0] * ns[0][0] + n[1] * ns[0][1]) < 0.9);
  if (!distintas) h.rotateAround(new THREE.Vector2(0, 0), 0.56);
  h.multiplyScalar(1.49);
  return new THREE.Vector3(h.x, alto, h.y).normalize();
}
function distanciaPara(radio, cam = camera) {
  const fov = (cam.fov * Math.PI) / 180;
  const fovH = 2 * Math.atan(Math.tan(fov / 2) * cam.aspect);
  return (radio / Math.sin(Math.min(fov, fovH) / 2)) * 1.02;
}
export function vista(n, animar = true) {
  vistaActual = n;
  const sph = bbox.getBoundingSphere(new THREE.Sphere());
  const c = sph.center, D = distanciaPara(sph.radius);
  if (n === 1) {
    moverCamara(new THREE.Vector3(c.x, c.y + D * 1.05, c.z + 0.01), new THREE.Vector3(c.x, 0, c.z), animar);
  } else if (n === 2) {
    const e = st.res.estructuras.find((x) => x.id === st.sel.estructuraId) || st.res.estructuras[0];
    if (!e) return;
    const F = e.frentes[st.sel.frente ?? 0];
    const s0 = F.S[0], s1 = F.S[F.S.length - 1];
    const t = mundo(F, (s0 + s1) / 2, e.alturaReal / 2, e.prof);
    const r = Math.hypot(s1 - s0, e.alturaReal) / 2 + 1;
    const d = distanciaPara(r);
    moverCamara(t.clone().add(new THREE.Vector3(F.n[0], 0.04, F.n[1]).multiplyScalar(d)), t, animar);
  } else {
    const dir = dirIso(0.72);
    moverCamara(c.clone().add(dir.multiplyScalar(D)), c, animar);
  }
  cb.alVista?.(n);
}
export function encuadrar() {
  const sph = bbox.getBoundingSphere(new THREE.Sphere());
  const dir = camera.position.clone().sub(controls.target).normalize();
  moverCamara(sph.center.clone().add(dir.multiplyScalar(distanciaPara(sph.radius))), sph.center.clone());
}

// ───────────────────────────── exportación ─────────────────────────────
export function exportarPNG({ titulo = '', subtitulo = '', pie = '' } = {}) {
  const W = 1500, H = 940, PR = 2;
  const off = document.createElement('canvas');
  const r2 = new THREE.WebGLRenderer({ canvas: off, antialias: true, preserveDrawingBuffer: true });
  r2.setPixelRatio(PR);
  r2.setSize(W, H, false);
  r2.outputColorSpace = THREE.SRGBColorSpace;
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 3000);
  const sph = bbox.getBoundingSphere(new THREE.Sphere());
  const dir = dirIso(0.68);
  cam.position.copy(sph.center.clone().add(dir.multiplyScalar(distanciaPara(sph.radius * 0.92, cam))));
  cam.lookAt(sph.center);
  // estado de exportación: fondo blanco, sin overlays, paleta clara
  const vis = [gOver.visible, gGhost.visible, gManijas.visible, gPuertos.visible];
  gOver.visible = gGhost.visible = gManijas.visible = gPuertos.visible = false;
  const bg = scene.background;
  scene.background = new THREE.Color(PAL_EXPORT.fondo);
  const sueloC = suelo.material.color.clone(), muroC = matMuro.color.clone();
  suelo.material.color.set(PAL_EXPORT.suelo);
  matMuro.color.set(PAL_EXPORT.muro);
  if (grilla) grilla.visible = false;
  suelo.visible = false;
  recolorear(PAL_EXPORT, false);
  r2.render(scene, cam);
  // composición con rótulo
  const out = document.createElement('canvas');
  out.width = W * PR; out.height = (H + 104) * PR;
  const g = out.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, out.width, out.height);
  g.drawImage(off, 0, 0);
  g.scale(PR, PR);
  g.fillStyle = '#d85a30'; g.fillRect(36, H + 20, 5, 64);
  g.fillStyle = '#1b1b1b'; g.font = '600 27px "DM Sans", system-ui, sans-serif'; g.fillText(titulo, 54, H + 46);
  g.fillStyle = '#5b5b5b'; g.font = '400 18px "DM Sans", system-ui, sans-serif'; g.fillText(subtitulo, 54, H + 76);
  g.textAlign = 'right';
  g.fillStyle = '#9a6a00'; g.font = '700 16px "JetBrains Mono", ui-monospace, monospace'; g.fillText('PREDIMENSIONADO', W - 36, H + 46);
  g.fillStyle = '#7b7b7b'; g.font = '400 14px "DM Sans", system-ui, sans-serif'; g.fillText(pie, W - 36, H + 76);
  const url = out.toDataURL('image/png');
  // restaurar
  r2.dispose(); r2.forceContextLoss?.();
  scene.background = bg;
  suelo.material.color.copy(sueloC); matMuro.color.copy(muroC);
  if (grilla) grilla.visible = true;
  suelo.visible = true;
  [gOver.visible, gGhost.visible, gManijas.visible, gPuertos.visible] = vis;
  recolorear();
  return { url, canvas: out, ancho: W * PR, alto: (H + 104) * PR };
}

/** Punto del mundo → coordenadas de pantalla (cliente). Lo usan las pruebas automáticas. */
export function aPantalla(q) {
  const v = new THREE.Vector3(...q).project(camera);
  const r = canvas.getBoundingClientRect();
  return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
}
