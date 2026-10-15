"use client";

// Intenciones de la UI → operaciones del núcleo → commit. Todo lo que cambia el diseño pasa por
// acá (o por commit directo) para que el historial tenga un nombre legible.

import { toast } from "sonner";
import {
  agregarEstructura, aplicarReparacion, convertirALibre, editarEsqueleto, partirClave, quitarEstructura, setOverride,
  type Accion, type Diseno, type EstructuraResuelta, type OpEsqueleto, type OverrideCelda, type Resultado,
} from "@/lib/tecnica/modelo";
import { useEditor, type Pincel } from "./store";

const st = () => useEditor.getState();

export function aplicar(accion: Accion, nombre: string): boolean {
  const s = st();
  try {
    return s.commit(aplicarReparacion(s.diseno, accion, s.catalogo), nombre);
  } catch (e) {
    toast.error("No se pudo aplicar el cambio", { description: e instanceof Error ? e.message : undefined });
    return false;
  }
}

export function operarEsqueleto(estructuraId: string, op: OpEsqueleto, nombre: string): boolean {
  const s = st();
  try {
    return s.commit(editarEsqueleto(s.diseno, estructuraId, op, s.catalogo), nombre);
  } catch (e) {
    toast.error("No se pudo editar la estructura", { description: e instanceof Error ? e.message : undefined });
    return false;
  }
}

export function agregarPreset(presetId: string, nombre: string, opciones: Parameters<typeof agregarEstructura>[2] = {}): string | null {
  const s = st();
  try {
    const { diseno, estructuraId } = agregarEstructura(s.diseno, presetId, opciones, s.catalogo);
    if (!s.commit(diseno, `Agregar ${nombre}`)) return null;
    st().seleccionar({ estructuraId, celdas: [] });
    return estructuraId;
  } catch (e) {
    toast.error(`No se pudo agregar ${nombre.toLowerCase()}`, { description: e instanceof Error ? e.message : undefined });
    return null;
  }
}

export function borrarEstructura(id: string) {
  const s = st();
  const e = s.diseno.estructuras.find((x) => x.id === id);
  if (!e) return;
  if (s.commit(quitarEstructura(s.diseno, id), `Borrar ${e.nombre}`)) {
    toast(`Borré ${e.nombre}`, { action: { label: "Deshacer", onClick: () => st().deshacer() } });
  }
}

export function convertir(id: string) {
  const s = st();
  const e = s.diseno.estructuras.find((x) => x.id === id);
  if (!e) return;
  const antes = s.res.bom.reduce((t, l) => t + l.cantidad, 0);
  if (s.commit(convertirALibre(s.diseno, id, s.catalogo), `Convertir ${e.nombre} a estructura libre`)) {
    const despues = st().res.bom.reduce((t, l) => t + l.cantidad, 0);
    toast.success(`${e.nombre} ahora es una estructura libre`, {
      description: `Ya no se regenera por parámetros. ${antes === despues ? "La lista de piezas quedó igual." : "Revisá la lista: cambió al congelar."}`,
      action: { label: "Deshacer", onClick: () => st().deshacer() },
    });
  }
}

// ───────────── pinceles por celda ─────────────

export const PINCELES: { id: Pincel; etiqueta: string; tecla?: string; ayuda: string; soloLibre?: boolean; soloPlantilla?: boolean }[] = [
  { id: "diagonal", etiqueta: "Diagonal", tecla: "1", ayuda: "Pone la diagonal en la celda (alterna el sentido en altura)." },
  { id: "sin_diagonal", etiqueta: "Sin diagonal", tecla: "2", ayuda: "Saca la diagonal de la celda." },
  { id: "horizontal", etiqueta: "Horizontal", tecla: "3", ayuda: "Pone o saca el horizontal del anillo.", soloLibre: true },
  { id: "baranda", etiqueta: "Baranda", tecla: "4", ayuda: "Doble baranda (0,50 y 1,00) con rodapié.", soloLibre: true },
  { id: "plataforma", etiqueta: "Plataforma", tecla: "5", ayuda: "Plataforma en el paño (tocá la planta del paño)." },
  { id: "sin_plataforma", etiqueta: "Sin plataforma", tecla: "6", ayuda: "Saca la plataforma del paño." },
  { id: "abertura", etiqueta: "Abertura", tecla: "7", ayuda: "Paso sin horizontales intermedios ni diagonal." },
  { id: "lona", etiqueta: "Lona", tecla: "8", ayuda: "Cerramiento de lona en la cara." },
  { id: "cano", etiqueta: "Caño y grampa", tecla: "9", ayuda: "Arma la celda con caño y grampa (medida libre)." },
  { id: "mensula", etiqueta: "Ménsula", ayuda: "Ménsula hacia afuera en los nodos de la celda." },
  { id: "anclaje", etiqueta: "Anclaje", ayuda: "Anclaje a la fachada en los nodos de la celda." },
  { id: "borrar", etiqueta: "Limpiar", tecla: "0", ayuda: "Vuelve la celda a lo que dicen las reglas." },
];

/**
 * Clave de override para una celda de una plantilla. En la fachada, los overrides de nivel
 * (abertura, lona, ménsula…) van en la banda del nivel: si se tocó una banda intermedia
 * (barandas), se lleva al nivel de arriba.
 */
export function claveOverride(r: EstructuraResuelta, clave: string): string {
  if (r.tipologia !== "fachada") return clave;
  const m = /^f(\d+)[eit](\d+)@(\d+)$/.exec(clave);
  if (!m) return clave;
  const f = +m[1];
  const k = +m[3];
  const frentes = (r.info?.frentes as { niveles?: { cota: number }[] }[] | undefined) ?? [];
  const cotas = r.esqueleto.cotas;
  const ks = (frentes[f]?.niveles ?? []).map((n) => cotas.findIndex((c) => Math.abs(c - n.cota) < 0.002)).filter((x) => x >= 0).sort((a, b) => a - b);
  const K = ks.find((x) => x >= k) ?? ks[ks.length - 1] ?? k;
  return `f${f}e${m[2]}@${K}`;
}

function esPano(r: EstructuraResuelta, clave: string) {
  const { id } = partirClave(clave);
  return r.esqueleto.panos.some((p) => p.id === id);
}

function nodosDeCelda(r: EstructuraResuelta, clave: string): string[] {
  const { id, k } = partirClave(clave);
  const v = r.esqueleto.vanos.find((x) => x.id === id);
  if (!v) return [];
  return [`${v.a}@${k}`, `${v.b}@${k}`];
}

/** Lo que hace un pincel sobre un diseño (sin commit). */
export function pintarDiseno(diseno: Diseno, res: Resultado, estructuraId: string, celdas: string[], pincel: Pincel, catalogo = st().catalogo): Diseno {
  const est = diseno.estructuras.find((e) => e.id === estructuraId);
  const r = res.estructuras.find((e) => e.id === estructuraId);
  if (!est || !r) return diseno;
  let d = diseno;
  if (est.tipologia === "libre") {
    const esq = r.esqueleto;
    for (const clave of celdas) {
      const { k } = partirClave(clave);
      const pano = esPano(r, clave);
      const ops: OpEsqueleto[] = [];
      const ce = esq.celdas[clave] ?? {};
      switch (pincel) {
        case "diagonal":
          if (!pano) ops.push({ op: "celda", clave, valor: { diagonal: k % 2 ? "baja" : "sube", abertura: null } });
          break;
        case "sin_diagonal":
          if (!pano) ops.push({ op: "celda", clave, valor: { diagonal: null } });
          break;
        case "horizontal":
          if (!pano) ops.push({ op: "celda", clave, valor: { horizontal: ce.horizontal === false } });
          break;
        case "baranda":
          if (!pano) ops.push({ op: "celda", clave, valor: { baranda: (ce.baranda ?? 0) > 0 ? 0 : 2, rodapie: !((ce.baranda ?? 0) > 0) } });
          break;
        case "plataforma":
          if (pano) ops.push({ op: "pano", clave, valor: { plataforma: "tablones" } });
          break;
        case "sin_plataforma":
          if (pano) ops.push({ op: "pano", clave, valor: { plataforma: null } });
          break;
        case "abertura":
          if (!pano) ops.push({ op: "celda", clave, valor: ce.abertura ? { abertura: null } : { abertura: true, diagonal: null } });
          break;
        case "lona":
          if (!pano) ops.push({ op: "celda", clave, valor: { cerramiento: ce.cerramiento === "lona" ? null : "lona" } });
          break;
        case "cano":
          if (!pano) ops.push({ op: "celda", clave, valor: { cano: !ce.cano } });
          break;
        case "mensula":
          for (const n of nodosDeCelda(r, clave)) ops.push({ op: "nodo", clave: n, valor: { mensula: esq.nodos[n]?.mensula ? null : { dir: "afuera", brazo: 0.73 } } });
          break;
        case "anclaje":
          for (const n of nodosDeCelda(r, clave)) ops.push({ op: "nodo", clave: n, valor: { anclaje: esq.nodos[n]?.anclaje ? null : true } });
          break;
        case "borrar":
          ops.push(pano ? { op: "pano", clave, valor: null } : { op: "celda", clave, valor: null });
          break;
      }
      for (const op of ops) d = editarEsqueleto(d, estructuraId, op, catalogo);
    }
    return d;
  }
  for (const clave of celdas) {
    const pano = esPano(r, clave);
    const ck = pano ? clave : claveOverride(r, clave);
    const { k } = partirClave(clave);
    const actual = est.overrides?.[ck] ?? {};
    let valor: Partial<Record<keyof OverrideCelda, unknown>> | null | undefined;
    switch (pincel) {
      case "diagonal": valor = pano ? null : { diagonal: k % 2 ? "baja" : "sube" }; break;
      case "sin_diagonal": valor = pano ? null : { diagonal: false }; break;
      case "plataforma": valor = { sinPlataforma: null }; break;
      case "sin_plataforma": valor = { sinPlataforma: true }; break;
      case "abertura": valor = { abertura: actual.abertura ? null : true }; break;
      case "lona": valor = { lona: actual.lona ? null : true }; break;
      case "cano": valor = { cano: actual.cano ? null : true }; break;
      case "mensula": valor = { mensula: actual.mensula ? null : "afuera" }; break;
      case "anclaje": valor = { anclaje: actual.anclaje ? null : true }; break;
      case "borrar": valor = null; break;
      default: valor = undefined;
    }
    if (valor === undefined) continue;
    if (valor === null && pincel !== "borrar") continue;
    d = setOverride(d, estructuraId, ck, valor);
  }
  return d;
}

const NOMBRE_PINCEL = Object.fromEntries(PINCELES.map((p) => [p.id, p.etiqueta])) as Record<Pincel, string>;

export function pintar(estructuraId: string, celdas: string[], pincel: Pincel, base?: Diseno) {
  const s = st();
  const desde = base ?? s.diseno;
  const d = pintarDiseno(desde, s.res, estructuraId, celdas, pincel);
  if (d === desde) return false;
  return s.commit(d, `${NOMBRE_PINCEL[pincel]} en ${celdas.length} celda${celdas.length === 1 ? "" : "s"}`, base);
}

/** ¿El pincel aplica a esta estructura? (algunos solo editan el esqueleto de la libre). */
export function pincelDisponible(pincel: Pincel, tipologia: string): boolean {
  const p = PINCELES.find((x) => x.id === pincel);
  if (!p) return false;
  if (p.soloLibre && tipologia !== "libre") return false;
  return true;
}
