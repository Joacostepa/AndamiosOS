// Vista 3D del modelador (port de la maqueta vista3d.js a TS, three@0.160.0).
//
// Módulo IMPERATIVO, sin estado global: el editor crea una Escena con un contenedor y callbacks,
// y le pasa los datos con actualizar(). InstancedMesh por geometría base (tubos y cajas), una
// malla de láminas con color por vértice, mallas invisibles para picking (piezas, celdas y caras
// de volúmenes) y render a demanda: solo se dibuja cuando algo cambia.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  agregarEstructura, buscarSnap, construir, crearDiseno,
  type Catalogo, type CeldaResuelta, type Diseno, type Pieza, type Resultado, type Snap, type V2, type V3,
} from "@/lib/tecnica/modelo";
import { carasDe, solidosDelDiseno, type Cara, type VolumenRef } from "../volumenes/geometria";
import { ES_CAJA, ES_LAMINA, grupoColor, leerPaleta, paletaExport, type GrupoColor, type Paleta } from "./paleta";

export type ModoVista = "iso" | "planta" | "frente";

export interface DatosEscena {
  res: Resultado;
  diseno: Diseno;
  catalogo: Catalogo;
  estructuraSel: string | null;
  celdasSel: string[];
  hover: string | null;
  volumenSel: string | null;
  herramienta: "seleccionar" | "pincel" | "cara" | "colocar";
  bomResaltado: string | null;
  /** Celdas con error o aviso: `${estructuraId}|${clave}`. */
  errores: Set<string>;
  verVolumenes: boolean;
}

export interface CallbacksEscena {
  alClic(info: { pieza: Pieza | null; estructuraId: string | null; celda: string | null; shift: boolean; arrastre: boolean }): void;
  alHover(info: { pieza: Pieza | null; estructuraId: string | null; celda: string | null; x: number; y: number } | null): void;
  /** Pincel arrastrado sobre celdas (pointerdown → move → up). */
  alPintar?(info: { estructuraId: string; celda: string; fase: "inicio" | "mover" | "fin" }): void;
  alClicCara(info: { volumenId: string; caraId: string }): void;
  alClicVolumen(grupo: string | null): void;
  alColocar(info: { estado: "mover" | "fin"; snap: Snap | null; alt: boolean }): void;
  alColocado(info: { diseno: Diseno; estructuraId: string; snap: Snap | null }): void;
}

const RADIO: Partial<Record<GrupoColor, number>> = {
  vertical: 0.026, horizontal: 0.022, baranda: 0.02, diagonal: 0.017, base: 0.03, anclaje: 0.016, mensula: 0.024,
  viga: 0.03, escalera: 0.022, bastidor: 0.022, rienda: 0.012, cano: 0.02, accesorio: 0.03, esfera: 0.06, rueda: 0.06,
};
const Y = new THREE.Vector3(0, 1, 0);
const RADIO_SNAP = 3.5;

const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _d = new THREE.Vector3();
const _c = new THREE.Color();

function tuboMat(a: V3, b: V3, r: number, out: THREE.Matrix4, pick: THREE.Matrix4) {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const L = _d.length();
  _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  if (L < 1e-4) {
    _q.identity();
    out.compose(_p, _q, _s.set(0.07, 0.1, 0.07));
    pick.compose(_p, _q, _s.set(0.16, 0.16, 0.16));
    return;
  }
  _d.divideScalar(L);
  _q.setFromUnitVectors(Y, _d);
  out.compose(_p, _q, _s.set(r, L, r));
  const g = Math.max(r * 3, 0.09);
  pick.compose(_p, _q, _s.set(g, L, g));
}

function vaciar(g: THREE.Object3D, compartidas: Set<unknown>) {
  for (const o of [...g.children]) {
    g.remove(o);
    o.traverse((x) => {
      const m = x as THREE.Mesh;
      if (m.geometry && !compartidas.has(m.geometry)) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (mat && !Array.isArray(mat) && !compartidas.has(mat)) mat.dispose();
    });
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  }
}

export class Escena {
  private cont: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private cb: CallbacksEscena;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 3000);
  private controls: OrbitControls;
  private pal: Paleta;
  private gObra = new THREE.Group();
  private gVol = new THREE.Group();
  private gOver = new THREE.Group();
  private gGhost = new THREE.Group();
  private gPuertos = new THREE.Group();
  private suelo: THREE.Mesh;
  private grilla: THREE.GridHelper | null = null;
  private geoCil = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
  private geoCaja = new THREE.BoxGeometry(1, 1, 1);
  private matTubo = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.35, roughness: 0.5 });
  private matCaja = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.15, roughness: 0.75 });
  private matLam = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, roughness: 1 });
  private matPick = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
  private compartidas: Set<unknown>;
  private mallas: { tubos?: THREE.InstancedMesh; cajas?: THREE.InstancedMesh; pick?: THREE.InstancedMesh; lam?: THREE.Mesh } = {};
  private mapas: { tubos?: Int32Array; cajas?: Int32Array; pick?: Int32Array; lam?: Int32Array } = {};
  private pickCeldas: { malla: THREE.Mesh | null; claves: string[]; estructuraId: string | null } = { malla: null, claves: [], estructuraId: null };
  private carasPick: THREE.Mesh[] = [];
  private volMallas: THREE.Mesh[] = [];
  private datos: DatosEscena | null = null;
  private resCargado: Resultado | null = null;
  private volsCargados: unknown = null;
  private volSelCargado: string | null = null;
  private bbox = new THREE.Box3(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
  private hoverPi = -1;
  private hoverCara: Cara | null = null;
  private carasPorId = new Map<string, Cara>();
  private pendiente = false;
  private ultimoEv: PointerEvent | null = null;
  private movPend = false;
  private downXY: [number, number] | null = null;
  private pintando = false;
  private ultimaPintada: string | null = null;
  private ray = new THREE.Raycaster();
  private ptr = new THREE.Vector2();
  private plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private colocando: { preset: string; rumbo: number; clave: string; prop: { diseno: Diseno; estructuraId: string } | null; snap: Snap | null; ultimo: V2 | null; alt: boolean } | null = null;
  private obs: (ResizeObserver | MutationObserver)[] = [];
  private anim = 0;
  private modo: ModoVista = "iso";
  private destruida = false;
  private entorno: RoomEnvironment | null = null;

  constructor(contenedor: HTMLDivElement, cb: CallbacksEscena) {
    this.cont = contenedor;
    this.cb = cb;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "block h-full w-full outline-none";
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute("aria-label", "Vista 3D del modelo");
    contenedor.appendChild(this.canvas);
    this.compartidas = new Set<unknown>([this.geoCil, this.geoCaja, this.matTubo, this.matCaja, this.matLam, this.matPick]);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.entorno = new RoomEnvironment(this.renderer);
    this.scene.environment = pmrem.fromScene(this.entorno, 0.04).texture;
    pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));
    const sol = new THREE.DirectionalLight(0xffffff, 1.4);
    sol.position.set(20, 40, 30);
    this.scene.add(sol);
    this.camera.position.set(30, 22, 34);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = false;
    this.controls.screenSpacePanning = true;
    this.controls.maxPolarAngle = Math.PI * 0.499;
    this.controls.addEventListener("change", () => this.pedirRender());
    this.suelo = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x1d1e21, roughness: 1 }));
    this.suelo.rotation.x = -Math.PI / 2;
    this.suelo.position.y = -0.005;
    this.scene.add(this.suelo, this.gObra, this.gVol, this.gOver, this.gGhost, this.gPuertos);
    this.pal = leerPaleta();
    this.aplicarTema();

    const ro = new ResizeObserver(() => this.redimensionar());
    ro.observe(contenedor);
    const mo = new MutationObserver(() => {
      this.pal = leerPaleta();
      this.aplicarTema();
      this.recolorear();
      this.reconstruirVolumenes();
      this.overlays();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    this.obs.push(ro, mo);
    this.redimensionar();

    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("pointerleave", this.onLeave);
    this.canvas.addEventListener("dblclick", this.onDbl);
  }

  destruir() {
    this.destruida = true;
    cancelAnimationFrame(this.anim);
    for (const o of this.obs) o.disconnect();
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointerleave", this.onLeave);
    this.canvas.removeEventListener("dblclick", this.onDbl);
    this.controls.dispose();
    for (const g of [this.gObra, this.gVol, this.gOver, this.gGhost, this.gPuertos]) vaciar(g, this.compartidas);
    this.geoCil.dispose();
    this.geoCaja.dispose();
    // materiales compartidos, suelo, grilla y entorno: si no, cada ida y vuelta lista ↔ editor dejaba
    // recursos de GPU vivos hasta agotar los contextos WebGL del navegador
    for (const m of [this.matTubo, this.matCaja, this.matLam, this.matPick]) m.dispose();
    this.suelo.geometry.dispose();
    (this.suelo.material as THREE.Material).dispose();
    if (this.grilla) {
      this.grilla.geometry.dispose();
      const gm = this.grilla.material as THREE.Material | THREE.Material[];
      for (const m of Array.isArray(gm) ? gm : [gm]) m.dispose();
    }
    this.scene.environment?.dispose();
    this.scene.environment = null;
    this.entorno?.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) x.dispose();
    });
    this.entorno = null;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  // ───────────── tema y tamaño ─────────────
  private aplicarTema() {
    this.scene.background = new THREE.Color(this.pal.fondo);
    (this.suelo.material as THREE.MeshStandardMaterial).color.set(this.pal.suelo);
    this.crearGrilla();
    this.pedirRender();
  }

  private crearGrilla() {
    if (this.grilla) {
      this.scene.remove(this.grilla);
      this.grilla.geometry.dispose();
      (this.grilla.material as THREE.Material).dispose();
    }
    const c = this.bbox.getCenter(new THREE.Vector3());
    const tam = Math.ceil(Math.max(this.bbox.max.x - this.bbox.min.x, this.bbox.max.z - this.bbox.min.z) + 24);
    this.grilla = new THREE.GridHelper(tam, Math.round(tam), this.pal.grilla1, this.pal.grilla2);
    this.grilla.position.set(Math.round(c.x), 0.002, Math.round(c.z));
    this.scene.add(this.grilla);
  }

  private redimensionar() {
    const w = this.cont.clientWidth;
    const h = this.cont.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.pedirRender();
  }

  pedirRender() {
    if (this.pendiente || this.destruida) return;
    this.pendiente = true;
    requestAnimationFrame(() => {
      this.pendiente = false;
      if (!this.destruida) this.renderer.render(this.scene, this.camera);
    });
  }

  // ───────────── datos ─────────────
  /** Actualiza la escena: reconstruye lo que cambió (piezas, volúmenes) y repinta selección y hover. */
  actualizar(d: DatosEscena) {
    const primera = !this.datos;
    this.datos = d;
    if (d.res !== this.resCargado) {
      this.resCargado = d.res;
      this.cargarPiezas();
    }
    if (d.diseno.contexto.volumenes !== this.volsCargados || d.volumenSel !== this.volSelCargado) {
      this.volsCargados = d.diseno.contexto.volumenes;
      this.volSelCargado = d.volumenSel;
      this.reconstruirVolumenes();
    }
    this.gVol.visible = d.verVolumenes;
    this.recolorear();
    this.overlays();
    if (primera) this.vista("iso", false);
    this.canvas.style.cursor = d.herramienta === "cara" || d.herramienta === "colocar" ? "crosshair" : d.herramienta === "pincel" ? "cell" : "";
    this.pedirRender();
  }

  private estructuraDe(id: string) {
    return this.datos?.res.estructuras.find((e) => e.id === id) ?? null;
  }

  /** Dirección horizontal "a lo largo" para una lámina sin celda (bandejas y viseras de elementos). */
  private dirLargo(p: Pieza): V2 {
    const e = this.estructuraDe(p.estructuraId);
    if (!e) return [1, 0];
    const rb = (e.marco.rumbo * Math.PI) / 180;
    const frentes = (e.info?.frentes as { rumbo?: number; origen?: V2; S?: number[] }[] | undefined) ?? [];
    if (frentes.length > 1) {
      const m: V2 = [(p.a[0] + p.b[0]) / 2, (p.a[2] + p.b[2]) / 2];
      let mejor: V2 = [Math.cos(rb), Math.sin(rb)];
      let dmin = Infinity;
      for (const F of frentes) {
        if (F.rumbo === undefined || !F.origen) continue;
        const r = ((e.marco.rumbo + F.rumbo) * Math.PI) / 180;
        const u: V2 = [Math.cos(r), Math.sin(r)];
        const o: V2 = [
          e.marco.origen[0] + Math.cos(rb) * F.origen[0] - Math.sin(rb) * F.origen[1],
          e.marco.origen[1] + Math.sin(rb) * F.origen[0] + Math.cos(rb) * F.origen[1],
        ];
        const L = F.S ? F.S[F.S.length - 1] : 10;
        const t = Math.max(0, Math.min(L, (m[0] - o[0]) * u[0] + (m[1] - o[1]) * u[1]));
        const dd = Math.hypot(m[0] - (o[0] + u[0] * t), m[1] - (o[1] + u[1] * t));
        if (dd < dmin) {
          dmin = dd;
          mejor = u;
        }
      }
      return mejor;
    }
    return [Math.cos(rb), Math.sin(rb)];
  }

  private cargarPiezas() {
    const d = this.datos!;
    vaciar(this.gObra, this.compartidas);
    this.mallas = {};
    this.mapas = {};
    this.hoverPi = -1;
    const piezas = d.res.piezas;
    const celdasPorId = new Map<string, CeldaResuelta>(d.res.celdas.map((c) => [c.id, c]));
    const tubos: { pi: number; m: THREE.Matrix4 }[] = [];
    const cajas: { pi: number; m: THREE.Matrix4 }[] = [];
    const picks: { pi: number; m: THREE.Matrix4 }[] = [];
    const lamPos: number[] = [];
    const lamPi: number[] = [];
    const quad = (pi: number, q: THREE.Vector3[]) => {
      if (q.length < 3) return;
      for (let i = 1; i < q.length - 1; i++) {
        lamPos.push(q[0].x, q[0].y, q[0].z, q[i].x, q[i].y, q[i].z, q[i + 1].x, q[i + 1].y, q[i + 1].z);
        lamPi.push(pi);
      }
    };
    piezas.forEach((p, pi) => {
      const a = p.a;
      const b = p.b;
      if (ES_LAMINA.has(p.familia)) {
        const horizontal = Math.abs(a[1] - b[1]) < 0.01;
        if (horizontal && p.celda) {
          const c = celdasPorId.get(`${p.estructuraId}:${p.celda}`);
          if (c && c.tipo === "pano") {
            quad(pi, c.esquinas.map((e) => new THREE.Vector3(e[0], a[1], e[2])));
            return;
          }
        }
        let L: V2;
        const dx = b[0] - a[0];
        const dz = b[2] - a[2];
        if (!horizontal && p.celda && Math.hypot(dx, dz) > 0.05) L = [dx / Math.hypot(dx, dz), dz / Math.hypot(dx, dz)];
        else L = this.dirLargo(p);
        const dl = dx * L[0] + dz * L[1];
        const A = new THREE.Vector3(...a);
        const B = new THREE.Vector3(...b);
        const Ld = new THREE.Vector3(L[0] * dl, 0, L[1] * dl);
        quad(pi, [A, A.clone().add(Ld), B, B.clone().sub(Ld)]);
        return;
      }
      if (ES_CAJA.has(p.familia)) {
        const dx = b[0] - a[0];
        const dz = b[2] - a[2];
        const L = Math.hypot(dx, dz);
        if (L > 1e-3) {
          _q.setFromAxisAngle(Y, -Math.atan2(dz, dx));
          _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
          const [alto, ancho] = p.familia === "rodapie" ? [0.15, 0.025] : [0.045, 0.3];
          cajas.push({ pi, m: new THREE.Matrix4().compose(_p, _q, _s.set(L - 0.02, alto, ancho)) });
          picks.push({ pi, m: new THREE.Matrix4().compose(_p, _q, _s.set(L, Math.max(alto, 0.08), Math.max(ancho, 0.08))) });
          return;
        }
      }
      const r = RADIO[grupoColor(p)] ?? 0.02;
      const segs = p.primitivas?.length ? p.primitivas : [{ a, b }];
      for (const sg of segs) {
        const m = new THREE.Matrix4();
        const mp = new THREE.Matrix4();
        tuboMat(sg.a, sg.b, r, m, mp);
        tubos.push({ pi, m });
        picks.push({ pi, m: mp });
      }
    });
    const crear = (geo: THREE.BufferGeometry, mat: THREE.Material, lista: { pi: number; m: THREE.Matrix4 }[], clave: "tubos" | "cajas" | "pick") => {
      if (!lista.length) return;
      const im = new THREE.InstancedMesh(geo, mat, lista.length);
      const mapa = new Int32Array(lista.length);
      lista.forEach((it, i) => {
        im.setMatrixAt(i, it.m);
        mapa[i] = it.pi;
      });
      im.instanceMatrix.needsUpdate = true;
      if (clave !== "pick") im.setColorAt(0, _c.set("#ffffff"));
      im.computeBoundingSphere();
      this.mapas[clave] = mapa;
      this.mallas[clave] = im;
      this.gObra.add(im);
    };
    crear(this.geoCil, this.matTubo, tubos, "tubos");
    crear(this.geoCaja, this.matCaja, cajas, "cajas");
    crear(this.geoCaja, this.matPick, picks, "pick");
    if (lamPos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(lamPos, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(lamPos.length), 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, this.matLam);
      m.renderOrder = 2;
      this.mallas.lam = m;
      this.mapas.lam = Int32Array.from(lamPi);
      this.gObra.add(m);
    }
    // caja envolvente (con los volúmenes visibles adentro)
    this.bbox = new THREE.Box3();
    for (const p of piezas) {
      this.bbox.expandByPoint(_p.set(...p.a));
      this.bbox.expandByPoint(_p.set(...p.b));
    }
    for (const so of solidosDelDiseno(d.diseno)) for (const q of so.planta) {
      this.bbox.expandByPoint(_p.set(q[0], so.yTope, q[1]));
      this.bbox.expandByPoint(_p.set(q[0], Math.min(0, so.yBase), q[1]));
    }
    if (this.bbox.isEmpty()) this.bbox.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
    this.crearGrilla();
  }

  private colorPieza(pi: number, P: Paleta, estados: boolean): string {
    const d = this.datos!;
    const p = d.res.piezas[pi];
    if (estados) {
      if (pi === this.hoverPi) return P.hover;
      if (d.bomResaltado && (p.codigo === d.bomResaltado || `SIN:${p.familia}` === d.bomResaltado.split(":").slice(0, 2).join(":"))) return P.sel;
      if (p.celda && p.estructuraId === d.estructuraSel && d.celdasSel.includes(p.celda)) return P.sel;
      if (p.celda && d.errores.has(`${p.estructuraId}|${p.celda}`)) return P.err;
    }
    if (p.ajuste) return P.ajuste;
    return P.fam[grupoColor(p)] ?? P.fam.horizontal;
  }

  private recolorear(P: Paleta = this.pal, estados = true) {
    if (!this.datos) return;
    for (const k of ["tubos", "cajas"] as const) {
      const im = this.mallas[k];
      const mapa = this.mapas[k];
      if (!im || !mapa) continue;
      for (let i = 0; i < mapa.length; i++) im.setColorAt(i, _c.set(this.colorPieza(mapa[i], P, estados)));
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    const lam = this.mallas.lam;
    const mapaL = this.mapas.lam;
    if (lam && mapaL) {
      const col = lam.geometry.getAttribute("color") as THREE.BufferAttribute;
      for (let t = 0; t < mapaL.length; t++) {
        _c.set(this.colorPieza(mapaL[t], P, estados));
        for (let v = 0; v < 3; v++) col.setXYZ(t * 3 + v, _c.r, _c.g, _c.b);
      }
      col.needsUpdate = true;
    }
    this.pedirRender();
  }

  private recolorPieza(pi: number) {
    if (pi < 0 || !this.datos) return;
    for (const k of ["tubos", "cajas"] as const) {
      const im = this.mallas[k];
      const mapa = this.mapas[k];
      if (!im || !mapa) continue;
      let toco = false;
      for (let i = 0; i < mapa.length; i++) if (mapa[i] === pi) {
        im.setColorAt(i, _c.set(this.colorPieza(pi, this.pal, true)));
        toco = true;
      }
      if (toco && im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  // ───────────── volúmenes de referencia ─────────────
  private reconstruirVolumenes() {
    vaciar(this.gVol, this.compartidas);
    this.carasPick = [];
    this.volMallas = [];
    this.carasPorId.clear();
    const d = this.datos;
    if (!d) return;
    const vols = d.diseno.contexto.volumenes as VolumenRef[];
    const porId = new Map(vols.map((v) => [v.id, v]));
    // los sólidos de la lógica oficial: tramos del escalonado, balcones repetidos, cúpula, patios
    for (const so of solidosDelDiseno(d.diseno)) {
      if (so.planta.length < 3) continue;
      const v = porId.get(so.volumenId);
      const def = v?.def;
      // la cúpula se dibuja como media esfera (más abajo), no por rodajas
      if (so.rol === "cupula" && def?.tipo === "cilindro") continue;
      const hueco = so.rol === "hueco" || !!v?.hueco;
      const sel = d.volumenSel === so.volumenId;
      const alto = Math.max(0.05, so.yTope - so.yBase);
      const shape = new THREE.Shape(so.planta.map((q) => new THREE.Vector2(q[0], -q[1])));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: alto, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, so.yBase, 0);
      const color = hueco ? this.pal.hueco : this.pal.volumen;
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, transparent: true, opacity: hueco ? 0.08 : sel ? 0.34 : 0.2, depthWrite: false });
      const malla = new THREE.Mesh(geo, mat);
      malla.renderOrder = 1;
      malla.userData = { grupo: so.volumenId, volumenId: so.volumenId };
      this.gVol.add(malla);
      this.volMallas.push(malla);
      const bordes = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: sel ? this.pal.sel : hueco ? this.pal.hueco : this.pal.volumenBorde, transparent: true, opacity: 0.9 }));
      this.gVol.add(bordes);
      if (so.rol === "cuerpo" && def?.tipo === "cilindro" && def.cupula) {
        const dome = new THREE.Mesh(new THREE.SphereGeometry(def.radio, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat.clone());
        dome.scale.set(1, def.cupula.alto / def.radio, 1);
        dome.position.set(def.centro[0], so.yTope, def.centro[1]);
        this.gVol.add(dome);
      }
      // líneas de losas cada 3 m (lectura de la escala)
      if (!hueco && (so.rol === "cuerpo" || so.rol === "tramo") && v?.tipo === "edificio" && alto > 4) {
        const pts: number[] = [];
        for (let y = so.yBase + 3; y < so.yTope - 0.5; y += 3) {
          for (let i = 0; i < so.planta.length; i++) {
            const a = so.planta[i];
            const b = so.planta[(i + 1) % so.planta.length];
            pts.push(a[0], y, a[1], b[0], y, b[1]);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
        this.gVol.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: this.pal.volumenBorde, transparent: true, opacity: 0.35 })));
      }
    }
    // caras para «clic en una cara» (lógica oficial: fachada, terraza, envolvente o patio)
    for (const v of vols) {
      for (const c of carasDe(v, d.diseno)) {
        this.carasPorId.set(c.id, c);
        const g = new THREE.BufferGeometry();
        const P = [c.a[0], c.yBase, c.a[1], c.b[0], c.yBase, c.b[1], c.b[0], c.yTope, c.b[1], c.a[0], c.yTope, c.a[1]];
        g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
        g.setIndex([0, 1, 2, 0, 2, 3]);
        const m = new THREE.Mesh(g, this.matPick);
        m.userData = { volumenId: c.volumenId, caraId: c.id };
        this.gVol.add(m);
        this.carasPick.push(m);
      }
    }
    if (this.hoverCara) this.hoverCara = this.carasPorId.get(this.hoverCara.id) ?? null;
    this.pedirRender();
  }

  // ───────────── overlays: celdas, huella, cara bajo el cursor ─────────────
  private overlays() {
    vaciar(this.gOver, this.compartidas);
    const d = this.datos;
    if (!d) return;
    const celdas = d.res.celdas.filter((c) => c.estructuraId === d.estructuraSel);
    const clave = (c: CeldaResuelta) => c.id.slice(c.estructuraId.length + 1);
    const sel = new Set(d.celdasSel);
    const quads = (lista: CeldaResuelta[], color: string, op: number) => {
      if (!lista.length) return;
      const pos: number[] = [];
      const lp: number[] = [];
      for (const c of lista) {
        const e = c.esquinas;
        if (e.length < 3) continue;
        const e1 = new THREE.Vector3(...e[1]).sub(new THREE.Vector3(...e[0]));
        const e3 = new THREE.Vector3(...e[e.length - 1]).sub(new THREE.Vector3(...e[0]));
        const n = e1.clone().cross(e3).normalize().multiplyScalar(0.05);
        const P = e.map((q) => [q[0] + n.x, q[1] + n.y, q[2] + n.z]);
        for (let i = 1; i < P.length - 1; i++) pos.push(...P[0], ...P[i], ...P[i + 1]);
        for (let i = 0; i < e.length; i++) lp.push(...e[i], ...e[(i + 1) % e.length]);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false }));
      m.renderOrder = 3;
      this.gOver.add(m);
      const gl = new THREE.BufferGeometry();
      gl.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
      this.gOver.add(new THREE.LineSegments(gl, new THREE.LineBasicMaterial({ color, transparent: true, opacity: Math.min(1, op * 2.6) })));
    };
    quads(celdas.filter((c) => sel.has(clave(c))), this.pal.sel, 0.28);
    if (d.hover && !sel.has(d.hover)) quads(celdas.filter((c) => clave(c) === d.hover), this.pal.hover, 0.14);
    // huella de la estructura seleccionada
    const e = d.res.estructuras.find((x) => x.id === d.estructuraSel);
    if (e && e.huella.length > 2) {
      const pts = e.huella.map(([x, z]) => new THREE.Vector3(x, 0.02, z));
      pts.push(pts[0].clone());
      this.gOver.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: this.pal.sel })));
    }
    // cara del volumen bajo el cursor (herramienta "Fachada desde cara")
    if (this.hoverCara && d.herramienta === "cara") {
      const c = this.hoverCara;
      {
        const off = 0.03;
        const P = [
          c.a[0] + c.normal[0] * off, c.yBase, c.a[1] + c.normal[1] * off, c.b[0] + c.normal[0] * off, c.yBase, c.b[1] + c.normal[1] * off,
          c.b[0] + c.normal[0] * off, c.yTope, c.b[1] + c.normal[1] * off, c.a[0] + c.normal[0] * off, c.yTope, c.a[1] + c.normal[1] * off,
        ];
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
        g.setIndex([0, 1, 2, 0, 2, 3]);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: this.pal.sel, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
        m.renderOrder = 4;
        this.gOver.add(m);
      }
    }
    // capa invisible para tocar celdas vacías (estructura libre y pincel)
    this.pickCeldas = { malla: null, claves: [], estructuraId: d.estructuraSel };
    if (celdas.length) {
      const pos: number[] = [];
      const claves: string[] = [];
      for (const c of celdas) {
        const e = c.esquinas;
        for (let i = 1; i < e.length - 1; i++) {
          pos.push(...e[0], ...e[i], ...e[i + 1]);
          claves.push(clave(c));
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      const m = new THREE.Mesh(g, this.matPick);
      this.gOver.add(m);
      this.pickCeldas = { malla: m, claves, estructuraId: d.estructuraSel };
    }
    this.pedirRender();
  }

  // ───────────── puntero ─────────────
  private setRay(e: PointerEvent | MouseEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ptr, this.camera);
  }

  private hitPieza(): { pi: number; dist: number } | null {
    const pk = this.mallas.pick;
    if (!pk || !this.mapas.pick) return null;
    const hit = this.ray.intersectObject(pk, false)[0];
    return hit && hit.instanceId !== undefined ? { pi: this.mapas.pick[hit.instanceId], dist: hit.distance } : null;
  }

  private hitCelda(): { clave: string; dist: number } | null {
    const m = this.pickCeldas.malla;
    if (!m) return null;
    const hit = this.ray.intersectObject(m, false)[0];
    return hit && hit.faceIndex !== undefined && hit.faceIndex !== null ? { clave: this.pickCeldas.claves[hit.faceIndex], dist: hit.distance } : null;
  }

  private hitCara(): { volumenId: string; caraId: string } | null {
    if (!this.gVol.visible) return null;
    const hit = this.ray.intersectObjects(this.carasPick, false)[0];
    return hit ? (hit.object.userData as { volumenId: string; caraId: string }) : null;
  }

  private hitVolumen(): string | null {
    if (!this.gVol.visible) return null;
    const hit = this.ray.intersectObjects(this.volMallas, false)[0];
    return hit ? (hit.object.userData.grupo as string) : null;
  }

  private onMove = (e: PointerEvent) => {
    this.ultimoEv = e;
    if (this.movPend) return;
    this.movPend = true;
    requestAnimationFrame(() => {
      this.movPend = false;
      this.procesarMovimiento();
    });
  };

  private procesarMovimiento() {
    const e = this.ultimoEv;
    const d = this.datos;
    if (!e || !d) return;
    this.setRay(e);
    if (this.colocando) {
      const q = this.puntoColocacion();
      if (q) this.moverColocacion(q, e.altKey);
      return;
    }
    if (d.herramienta === "cara") {
      const c = this.hitCara();
      const k = c?.caraId ?? null;
      const ant = this.hoverCara?.id ?? null;
      if (k !== ant) {
        this.hoverCara = k ? (this.carasPorId.get(k) ?? null) : null;
        this.overlays();
      }
      return;
    }
    const hp = this.hitPieza();
    const hc = this.hitCelda();
    if (this.pintando && hc && this.pickCeldas.estructuraId && hc.clave !== this.ultimaPintada) {
      this.ultimaPintada = hc.clave;
      this.cb.alPintar?.({ estructuraId: this.pickCeldas.estructuraId, celda: hc.clave, fase: "mover" });
    }
    const pi = hp && (!hc || hp.dist <= hc.dist + 0.3) ? hp.pi : -1;
    if (pi !== this.hoverPi) {
      const ant = this.hoverPi;
      this.hoverPi = pi;
      this.recolorPieza(ant);
      this.recolorPieza(pi);
      this.pedirRender();
    }
    const pieza = pi >= 0 ? d.res.piezas[pi] : null;
    const celda = pieza?.celda && pieza.estructuraId === d.estructuraSel ? pieza.celda : hc?.clave ?? null;
    this.canvas.style.cursor = d.herramienta === "pincel" ? "cell" : pieza || hc ? "pointer" : "";
    this.cb.alHover(pieza || celda ? { pieza, estructuraId: pieza?.estructuraId ?? this.pickCeldas.estructuraId, celda, x: e.clientX, y: e.clientY } : null);
  }

  private onDown = (e: PointerEvent) => {
    this.downXY = [e.clientX, e.clientY];
    if (e.button !== 0 || !this.datos) return;
    if (this.datos.herramienta === "pincel" && !this.colocando) {
      this.setRay(e);
      const hc = this.hitCelda();
      if (hc && this.pickCeldas.estructuraId) {
        e.preventDefault();
        this.controls.enabled = false;
        this.canvas.setPointerCapture(e.pointerId);
        this.pintando = true;
        this.ultimaPintada = hc.clave;
        this.cb.alPintar?.({ estructuraId: this.pickCeldas.estructuraId, celda: hc.clave, fase: "inicio" });
      }
    }
  };

  private onUp = (e: PointerEvent) => {
    const click = !!this.downXY && Math.hypot(e.clientX - this.downXY[0], e.clientY - this.downXY[1]) < 5;
    this.downXY = null;
    if (this.pintando) {
      this.pintando = false;
      this.controls.enabled = true;
      if (this.pickCeldas.estructuraId && this.ultimaPintada) this.cb.alPintar?.({ estructuraId: this.pickCeldas.estructuraId, celda: this.ultimaPintada, fase: "fin" });
      this.ultimaPintada = null;
      return;
    }
    if (!click || e.button !== 0 || !this.datos) return;
    this.setRay(e);
    if (this.colocando) {
      this.confirmarColocacion();
      return;
    }
    if (this.datos.herramienta === "cara") {
      const c = this.hitCara();
      if (c) this.cb.alClicCara(c);
      return;
    }
    const hp = this.hitPieza();
    const hc = this.hitCelda();
    if (hp && (!hc || hp.dist <= hc.dist + 0.3)) {
      const p = this.datos.res.piezas[hp.pi];
      this.cb.alClic({ pieza: p, estructuraId: p.estructuraId, celda: p.celda ?? null, shift: e.shiftKey, arrastre: false });
      return;
    }
    if (hc) {
      this.cb.alClic({ pieza: null, estructuraId: this.pickCeldas.estructuraId, celda: hc.clave, shift: e.shiftKey, arrastre: false });
      return;
    }
    const vol = this.hitVolumen();
    if (vol) {
      this.cb.alClicVolumen(vol);
      return;
    }
    this.cb.alClic({ pieza: null, estructuraId: null, celda: null, shift: e.shiftKey, arrastre: false });
  };

  private onLeave = () => {
    if (this.pintando) return;
    if (this.hoverPi >= 0) {
      const ant = this.hoverPi;
      this.hoverPi = -1;
      this.recolorPieza(ant);
      this.pedirRender();
    }
    this.cb.alHover(null);
  };

  private onDbl = () => this.encuadrar();

  // ───────────── colocación con encastre ─────────────
  private puntoColocacion(): V2 | null {
    const objetivos: THREE.Object3D[] = [];
    if (this.mallas.pick) objetivos.push(this.mallas.pick);
    if (this.gVol.visible) objetivos.push(...this.volMallas);
    const hit = objetivos.length ? this.ray.intersectObjects(objetivos, false)[0] : null;
    if (hit) return [hit.point.x, hit.point.z];
    const q = this.ray.ray.intersectPlane(this.plano, new THREE.Vector3());
    return q ? [q.x, q.z] : null;
  }

  empezarColocacion(preset: string) {
    if (!this.datos) return;
    this.colocando = { preset, rumbo: 0, clave: "", prop: null, snap: null, ultimo: null, alt: false };
    this.dibujarPuertos(null);
    const c = this.controls.target;
    this.moverColocacion([c.x, c.z + 4], false);
  }

  girarColocacion() {
    const c = this.colocando;
    if (!c) return;
    c.rumbo = (c.rumbo + 90) % 360;
    c.clave = "";
    if (c.ultimo) this.moverColocacion(c.ultimo, c.alt);
  }

  cancelarColocacion() {
    if (!this.colocando) return false;
    this.colocando = null;
    vaciar(this.gGhost, this.compartidas);
    vaciar(this.gPuertos, this.compartidas);
    this.cb.alColocar({ estado: "fin", snap: null, alt: false });
    this.pedirRender();
    return true;
  }

  private dibujarPuertos(activo: { p0: V3; p1: V3; d: V3; largo: number; tipo: string; altura: number } | null) {
    vaciar(this.gPuertos, this.compartidas);
    const d = this.datos;
    if (!d) return;
    const pos: number[] = [];
    for (const pt of d.res.puertos) {
      const y0 = pt.tipo === "tope" ? pt.altura : 0.03;
      const y1 = pt.tipo === "cara" || pt.tipo === "extremo" ? Math.max(0.5, pt.altura || 3) : y0;
      pos.push(pt.p0[0], y0, pt.p0[2], pt.p1[0], y0, pt.p1[2]);
      if (y1 !== y0) pos.push(pt.p0[0], y0, pt.p0[2], pt.p0[0], y1, pt.p0[2], pt.p1[0], y0, pt.p1[2], pt.p1[0], y1, pt.p1[2]);
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      this.gPuertos.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: this.pal.hueco, transparent: true, opacity: 0.7, depthTest: false })));
    }
    if (activo) {
      const y = activo.tipo === "tope" ? activo.altura : 0.05;
      const m = new THREE.Mesh(new THREE.BoxGeometry(activo.largo, 0.09, 0.09), new THREE.MeshBasicMaterial({ color: this.pal.sel, depthTest: false }));
      m.position.set((activo.p0[0] + activo.p1[0]) / 2, y, (activo.p0[2] + activo.p1[2]) / 2);
      m.rotation.y = -Math.atan2(activo.d[2], activo.d[0]);
      m.renderOrder = 9;
      this.gPuertos.add(m);
    }
  }

  private moverColocacion(punto: V2, alt: boolean) {
    const c = this.colocando;
    const d = this.datos;
    if (!c || !d) return;
    c.ultimo = punto;
    c.alt = alt;
    let movil;
    try {
      movil = { ...crearDiseno(c.preset, { catalogo: d.catalogo }).estructuras[0], id: "__movil", rumbo: c.rumbo };
    } catch {
      return;
    }
    let snap: Snap | null = null;
    if (!alt) {
      try {
        snap = buscarSnap(d.diseno, movil, punto, { radio: RADIO_SNAP, catalogo: d.catalogo });
      } catch {
        snap = null;
      }
    }
    const clave = snap ? `s|${snap.a.estructuraId}|${snap.a.puerto}|${snap.a.s}|${snap.modo}|${c.rumbo}` : `l|${Math.round(punto[0] * 4)}|${Math.round(punto[1] * 4)}|${c.rumbo}`;
    if (clave === c.clave && c.prop) return;
    c.clave = clave;
    let prop: { diseno: Diseno; estructuraId: string } | null = null;
    try {
      if (snap) {
        prop = agregarEstructura(d.diseno, c.preset, { unirA: { estructuraId: snap.a.estructuraId, puerto: snap.a.puerto, s: snap.a.s, modo: snap.modo, puertoPropio: snap.b.puerto } }, d.catalogo);
      } else {
        const r0 = construir({ ...d.diseno, estructuras: [{ ...movil, origen: [0, 0] }], uniones: [] }, d.catalogo);
        const hu = r0.estructuras[0]?.huella ?? [];
        const L = hu.length ? Math.max(...hu.map((q) => q[0])) : 0;
        const W = hu.length ? Math.max(...hu.map((q) => q[1])) : 0;
        const off = new THREE.Vector2(L / 2, W / 2).rotateAround(new THREE.Vector2(0, 0), (c.rumbo * Math.PI) / 180);
        const o: V2 = [Math.round((punto[0] - off.x) * 4) / 4, Math.round((punto[1] - off.y) * 4) / 4];
        prop = agregarEstructura(d.diseno, c.preset, { origen: o, rumbo: c.rumbo }, d.catalogo);
      }
    } catch {
      prop = null;
    }
    c.prop = prop;
    c.snap = snap;
    vaciar(this.gGhost, this.compartidas);
    if (prop) {
      const r = construir(prop.diseno, d.catalogo);
      const pos: number[] = [];
      for (const p of r.piezas) {
        if (p.estructuraId !== prop.estructuraId || ES_LAMINA.has(p.familia)) continue;
        for (const sg of p.primitivas?.length ? p.primitivas : [p]) pos.push(...sg.a, ...sg.b);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      this.gGhost.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: snap ? this.pal.sel : this.pal.hover, transparent: true, opacity: snap ? 0.9 : 0.55 })));
    }
    const pt = snap ? d.res.puertos.find((x) => x.estructuraId === snap!.a.estructuraId && x.id === snap!.a.puerto) ?? null : null;
    this.dibujarPuertos(pt);
    this.cb.alColocar({ estado: "mover", snap, alt });
    this.pedirRender();
  }

  private confirmarColocacion() {
    const c = this.colocando;
    if (!c?.prop) return;
    const { diseno, estructuraId } = c.prop;
    const snap = c.snap;
    this.cancelarColocacion();
    this.cb.alColocado({ diseno, estructuraId, snap });
  }

  // ───────────── cámara ─────────────
  private moverCamara(pos: THREE.Vector3, target: THREE.Vector3, animar = true) {
    const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    cancelAnimationFrame(this.anim);
    if (!animar || reducir) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      this.pedirRender();
      return;
    }
    const p0 = this.camera.position.clone();
    const t0 = this.controls.target.clone();
    const ini = performance.now();
    const paso = (now: number) => {
      const k = Math.min(1, (now - ini) / 380);
      const e = 1 - Math.pow(1 - k, 3);
      this.camera.position.lerpVectors(p0, pos, e);
      this.controls.target.lerpVectors(t0, target, e);
      this.controls.update();
      this.pedirRender();
      if (k < 1) this.anim = requestAnimationFrame(paso);
    };
    this.anim = requestAnimationFrame(paso);
  }

  private dirIso(alto = 0.72): THREE.Vector3 {
    const h = new THREE.Vector2();
    for (const e of this.datos?.res.estructuras ?? []) {
      const r = (e.marco.rumbo * Math.PI) / 180;
      h.x += -Math.sin(r) * (e.ml || 1);
      h.y += Math.cos(r) * (e.ml || 1);
    }
    if (h.lengthSq() < 1e-6) return new THREE.Vector3(0.95, alto, 1.15).normalize();
    h.normalize().rotateAround(new THREE.Vector2(0, 0), 0.56).multiplyScalar(1.49);
    return new THREE.Vector3(h.x, alto, h.y).normalize();
  }

  private distanciaPara(radio: number, cam: THREE.PerspectiveCamera = this.camera) {
    const fov = (cam.fov * Math.PI) / 180;
    const fovH = 2 * Math.atan(Math.tan(fov / 2) * cam.aspect);
    return (radio / Math.sin(Math.min(fov, fovH) / 2)) * 1.02;
  }

  vista(n: ModoVista, animar = true) {
    this.modo = n;
    const sph = this.bbox.getBoundingSphere(new THREE.Sphere());
    const c = sph.center;
    const D = this.distanciaPara(sph.radius);
    if (n === "planta") {
      this.moverCamara(new THREE.Vector3(c.x, c.y + D * 1.05, c.z + 0.01), new THREE.Vector3(c.x, 0, c.z), animar);
    } else if (n === "frente") {
      const e = this.datos?.res.estructuras.find((x) => x.id === this.datos?.estructuraSel) ?? this.datos?.res.estructuras[0];
      if (!e) return;
      const r = (e.marco.rumbo * Math.PI) / 180;
      const nrm = new THREE.Vector3(-Math.sin(r), 0.04, Math.cos(r));
      const pts = e.huella.length ? e.huella : [e.marco.origen];
      const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length;
      const cz = pts.reduce((s, q) => s + q[1], 0) / pts.length;
      const t = new THREE.Vector3(cx, e.alturaReal / 2, cz);
      const rad = Math.hypot(e.ml || 5, e.alturaReal) / 2 + 1;
      this.moverCamara(t.clone().add(nrm.multiplyScalar(this.distanciaPara(rad))), t, animar);
    } else {
      this.moverCamara(c.clone().add(this.dirIso(0.72).multiplyScalar(D)), c, animar);
    }
  }

  get vistaActual() {
    return this.modo;
  }

  encuadrar() {
    const sph = this.bbox.getBoundingSphere(new THREE.Sphere());
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.moverCamara(sph.center.clone().add(dir.multiplyScalar(this.distanciaPara(sph.radius))), sph.center.clone());
  }

  // ───────────── imagen PNG ─────────────
  /** Imagen isométrica con fondo blanco y rótulo (título, subtítulo, PREDIMENSIONADO). */
  png({ titulo = "", subtitulo = "", pie = "" }: { titulo?: string; subtitulo?: string; pie?: string } = {}): { url: string; blob: () => Promise<Blob | null> } {
    // Se renderiza con el MISMO renderer (sin abrir otro contexto WebGL), a 1500 × 940 y 1× para que la
    // portada quede bien por debajo del tope de subida (4 MB), y se copia al canvas 2D en la misma tarea
    // (antes de que el navegador presente el cuadro). Todo el estado se restaura en el finally.
    const W = 1500;
    const H = 940;
    const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 3000);
    const sph = this.bbox.getBoundingSphere(new THREE.Sphere());
    cam.position.copy(sph.center.clone().add(this.dirIso(0.68).multiplyScalar(this.distanciaPara(sph.radius * 0.92, cam))));
    cam.lookAt(sph.center);
    const PE = paletaExport(this.pal);
    const vis = [this.gOver.visible, this.gGhost.visible, this.gPuertos.visible] as const;
    const bg = this.scene.background;
    const tam = this.renderer.getSize(new THREE.Vector2());
    const pr = this.renderer.getPixelRatio();
    const out = document.createElement("canvas");
    out.width = W;
    out.height = H + 104;
    const g = out.getContext("2d")!;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, out.width, out.height);
    try {
      this.gOver.visible = this.gGhost.visible = this.gPuertos.visible = false;
      this.scene.background = new THREE.Color(PE.fondo);
      if (this.grilla) this.grilla.visible = false;
      this.suelo.visible = false;
      this.recolorear(PE, false);
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(W, H, false);
      this.renderer.render(this.scene, cam);
      g.drawImage(this.canvas, 0, 0, W, H);
    } finally {
      this.renderer.setPixelRatio(pr);
      this.renderer.setSize(tam.x, tam.y, false);
      this.scene.background = bg;
      if (this.grilla) this.grilla.visible = true;
      this.suelo.visible = true;
      [this.gOver.visible, this.gGhost.visible, this.gPuertos.visible] = vis;
      this.recolorear();
      this.renderer.render(this.scene, this.camera);
    }
    const fuente = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
    g.fillStyle = this.pal.sel;
    g.fillRect(36, H + 20, 5, 64);
    g.fillStyle = "#1b1b1b";
    g.font = `600 27px ${fuente}`;
    g.fillText(titulo, 54, H + 46);
    g.fillStyle = "#5b5b5b";
    g.font = `400 18px ${fuente}`;
    g.fillText(subtitulo, 54, H + 76);
    g.textAlign = "right";
    g.fillStyle = "#9a6a00";
    g.font = "700 16px ui-monospace, monospace";
    g.fillText("PREDIMENSIONADO", W - 36, H + 46);
    g.fillStyle = "#7b7b7b";
    g.font = `400 14px ${fuente}`;
    g.fillText(pie, W - 36, H + 76);
    const url = out.toDataURL("image/png");
    return { url, blob: () => new Promise((res) => out.toBlob((b) => res(b), "image/png")) };
  }
}
