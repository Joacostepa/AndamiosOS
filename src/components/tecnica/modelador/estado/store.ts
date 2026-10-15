"use client";

// Estado del editor del modelador (arquitectura §9.2): el diseño, el resultado de construir(),
// la selección y el historial con nombre (ring buffer de 200). Sin immer: las operaciones del
// núcleo ya devuelven copias. La vista 3D y el alzado LEEN de acá y emiten intenciones; los
// cambios entran siempre por commit() (con historial) o preview() (arrastre de pincel).

import { create } from "zustand";
import { avisosDeChoque, construir, type Aviso, type Catalogo, type Diseno, type Resultado } from "@/lib/tecnica/modelo";
import { migrarVolumenesPantalla } from "../volumenes/geometria";

export type Herramienta = "seleccionar" | "pincel" | "cara" | "colocar";

/** Pinceles por celda (alzado y 3D). En la estructura libre editan el esqueleto. */
export type Pincel =
  | "diagonal" | "sin_diagonal" | "horizontal" | "baranda" | "plataforma" | "sin_plataforma"
  | "abertura" | "lona" | "cano" | "mensula" | "anclaje" | "borrar";

export type EstadoGuardado = "guardado" | "pendiente" | "guardando" | "error" | "conflicto" | "local";

export interface Seleccion {
  estructuraId: string | null;
  /** Claves de celda del esqueleto (`vanoId@k` o `panoId@k`) de la estructura seleccionada. */
  celdas: string[];
  /** Volumen seleccionado (panel de volúmenes y vista planta). */
  volumen: string | null;
}

interface Paso {
  diseno: Diseno;
  nombre: string;
}

const MAX_HISTORIAL = 200;

export interface EstadoEditor {
  listo: boolean;
  diseno: Diseno;
  res: Resultado;
  /** Avisos de la pantalla (choques con volúmenes) que se suman a los del núcleo. */
  avisosPantalla: Aviso[];
  catalogo: Catalogo;
  sel: Seleccion;
  hover: string | null;
  herramienta: Herramienta;
  pincel: Pincel;
  /** Preset que se está ubicando en la escena (herramienta 'colocar'). */
  colocando: string | null;
  /** Separación a fachada y si sigue el contorno del volumen al crear una fachada desde una cara. */
  desdeCara: { retiro: number; contorno: boolean };
  bomResaltado: string | null;
  pasado: Paso[];
  futuro: Paso[];
  /** Último cambio, para los toasts de reglas nuevas. */
  ultimo: { nombre: string; prevRes: Resultado | null; historial?: "deshacer" | "rehacer"; n: number } | null;
  soloLectura: boolean;
  modeloId: string | null;
  revision: number | null;
  guardado: EstadoGuardado;
  /** Contador de cambios: el autoguardado guarda cuando difiere del último guardado. */
  version: number;
  versionGuardada: number;

  iniciar(d: Diseno, catalogo: Catalogo, opciones: { soloLectura: boolean; modeloId: string | null; revision: number | null }): void;
  cambiarCatalogo(catalogo: Catalogo): void;
  commit(d: Diseno, nombre: string, base?: Diseno): boolean;
  preview(d: Diseno): void;
  deshacer(): string | null;
  rehacer(): string | null;
  seleccionar(patch: Partial<Seleccion>): void;
  setHover(celda: string | null): void;
  setHerramienta(h: Herramienta): void;
  setPincel(p: Pincel): void;
  setColocando(preset: string | null): void;
  setDesdeCara(v: Partial<EstadoEditor["desdeCara"]>): void;
  setBomResaltado(codigo: string | null): void;
  marcarGuardado(revision: number, version: number): void;
  setGuardado(g: EstadoGuardado): void;
  /** La obra que vinculó el servidor (p. ej. al generar el cómputo): no es un cambio del usuario ni sube la versión. */
  setObraVinculada(obra: Diseno["obra"]): void;
}

const VACIO: Diseno = {
  esquema: 2, nombre: "", obra: null, contexto: { terreno: "cemento", enVereda: false, claseCarga: 3, volumenes: [] },
  estructuras: [], uniones: [], modoBom: "kit", ajustesBom: [],
};

function calcular(d: Diseno, catalogo: Catalogo): { res: Resultado; avisosPantalla: Aviso[] } {
  const res = construir(d, catalogo);
  let avisosPantalla: Aviso[] = [];
  try {
    avisosPantalla = d.contexto?.volumenes?.length ? avisosDeChoque(d, res, catalogo.medidas) : [];
  } catch {
    avisosPantalla = [];
  }
  return { res, avisosPantalla };
}

function selValida(sel: Seleccion, d: Diseno, res: Resultado): Seleccion {
  const ids = d.estructuras.map((e) => e.id);
  let { estructuraId, celdas, volumen } = sel;
  if (estructuraId && !ids.includes(estructuraId)) {
    estructuraId = ids[0] ?? null;
    celdas = [];
  }
  if (celdas.length) {
    const existen = new Set(res.celdas.filter((c) => c.estructuraId === estructuraId).map((c) => c.id.slice(c.estructuraId.length + 1)));
    celdas = celdas.filter((c) => existen.has(c));
  }
  if (volumen && !d.contexto.volumenes.some((v) => v.id === volumen)) volumen = null;
  return { estructuraId, celdas, volumen };
}

export const useEditor = create<EstadoEditor>((set, get) => ({
  listo: false,
  diseno: VACIO,
  res: construirVacio(),
  avisosPantalla: [],
  catalogo: { fuente: "fixture", piezas: {}, mapa: [], kits: {}, medidas: { multi: { vanos: [], profundidades: [], pasoRoseta: 0.5, pasoNivel: 2, mensulas: [], vigasCelosia: [], vigasPuente: [] }, bastidor: { vanos: [], anchos: [], alturaCuerpo: 1.8, alturaPaso: 1.8, alturaBaranda: 1 }, canos: [] } },
  sel: { estructuraId: null, celdas: [], volumen: null },
  hover: null,
  herramienta: "seleccionar",
  pincel: "diagonal",
  colocando: null,
  desdeCara: { retiro: 0.2, contorno: false },
  bomResaltado: null,
  pasado: [],
  futuro: [],
  ultimo: null,
  soloLectura: false,
  modeloId: null,
  revision: null,
  guardado: "guardado",
  version: 0,
  versionGuardada: 0,

  iniciar(d0, catalogo, o) {
    const d = migrarVolumenesPantalla(d0);
    const c = calcular(d, catalogo);
    set({
      listo: true, diseno: d, ...c, catalogo, pasado: [], futuro: [], ultimo: null,
      sel: { estructuraId: d.estructuras[0]?.id ?? null, celdas: [], volumen: null }, hover: null,
      herramienta: "seleccionar", colocando: null, bomResaltado: null,
      soloLectura: o.soloLectura, modeloId: o.modeloId, revision: o.revision,
      guardado: o.modeloId ? "guardado" : "local", version: 0, versionGuardada: 0,
    });
  },

  cambiarCatalogo(catalogo) {
    const { diseno, sel } = get();
    const c = calcular(diseno, catalogo);
    set({ catalogo, ...c, sel: selValida(sel, diseno, c.res) });
  },

  commit(d, nombre, base) {
    const st = get();
    if (st.soloLectura) return false;
    let c: ReturnType<typeof calcular>;
    try {
      c = calcular(d, st.catalogo);
    } catch (e) {
      console.error("[modelador] construir falló", e);
      return false;
    }
    const pasado = [...st.pasado, { diseno: base ?? st.diseno, nombre }];
    if (pasado.length > MAX_HISTORIAL) pasado.shift();
    set({
      diseno: d, ...c, pasado, futuro: [], sel: selValida(st.sel, d, c.res),
      ultimo: { nombre, prevRes: st.res, n: pasado.length }, version: st.version + 1,
      guardado: st.modeloId ? "pendiente" : "local",
    });
    return true;
  },

  preview(d) {
    const st = get();
    try {
      const c = calcular(d, st.catalogo);
      set({ diseno: d, ...c });
    } catch (e) {
      console.error("[modelador] construir falló", e);
    }
  },

  deshacer() {
    const st = get();
    const p = st.pasado[st.pasado.length - 1];
    if (!p || st.soloLectura) return null;
    const c = calcular(p.diseno, st.catalogo);
    set({
      diseno: p.diseno, ...c, pasado: st.pasado.slice(0, -1), futuro: [...st.futuro, { diseno: st.diseno, nombre: p.nombre }],
      sel: selValida(st.sel, p.diseno, c.res), ultimo: { nombre: p.nombre, prevRes: st.res, historial: "deshacer", n: st.pasado.length - 1 },
      version: st.version + 1, guardado: st.modeloId ? "pendiente" : "local",
    });
    return p.nombre;
  },

  rehacer() {
    const st = get();
    const p = st.futuro[st.futuro.length - 1];
    if (!p || st.soloLectura) return null;
    const c = calcular(p.diseno, st.catalogo);
    set({
      diseno: p.diseno, ...c, futuro: st.futuro.slice(0, -1), pasado: [...st.pasado, { diseno: st.diseno, nombre: p.nombre }],
      sel: selValida(st.sel, p.diseno, c.res), ultimo: { nombre: p.nombre, prevRes: st.res, historial: "rehacer", n: st.pasado.length + 1 },
      version: st.version + 1, guardado: st.modeloId ? "pendiente" : "local",
    });
    return p.nombre;
  },

  seleccionar(patch) {
    const st = get();
    set({ sel: selValida({ ...st.sel, ...patch }, st.diseno, st.res) });
  },
  setHover: (hover) => set({ hover }),
  setHerramienta: (herramienta) => set({ herramienta, ...(herramienta !== "colocar" ? { colocando: null } : {}) }),
  setPincel: (pincel) => set({ pincel, herramienta: "pincel" }),
  setColocando: (colocando) => set({ colocando, herramienta: colocando ? "colocar" : "seleccionar" }),
  setDesdeCara: (v) => set({ desdeCara: { ...get().desdeCara, ...v } }),
  setBomResaltado: (bomResaltado) => set({ bomResaltado }),
  marcarGuardado: (revision, version) =>
    set({ revision, versionGuardada: version, guardado: get().version === version ? "guardado" : "pendiente" }),
  setGuardado: (guardado) => set({ guardado }),
  setObraVinculada: (obra) => set({ diseno: { ...get().diseno, obra } }),
}));

function construirVacio(): Resultado {
  return {
    piezas: [], bom: [], avisos: [], reglas: [], estructuras: [], celdas: [], puertos: [], uniones: [],
    resumen: {
      m2: 0, ml: 0, alturaMax: 0, pesoKg: 0, pesoParcial: false, codigosSinPeso: [], sinCodigo: [], piezas: 0, piezasAjuste: 0,
      anclajes: 0, faltantesStock: [], modoBom: "kit", etiqueta: "PREDIMENSIONADO", catalogoFuente: "fixture", texto: "",
    },
    ms: 0,
  };
}

// ───────────── selectores ─────────────

export const estructuraSel = (s: EstadoEditor) => s.diseno.estructuras.find((e) => e.id === s.sel.estructuraId) ?? null;
export const resueltaSel = (s: EstadoEditor) => s.res.estructuras.find((e) => e.id === s.sel.estructuraId) ?? null;
/** Avisos del núcleo + los de la pantalla. */
export const todosLosAvisos = (s: EstadoEditor): Aviso[] => [...s.avisosPantalla, ...s.res.avisos];
