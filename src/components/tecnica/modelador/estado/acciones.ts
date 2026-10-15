"use client";

// Intenciones de la UI → operaciones del núcleo → commit. Todo lo que cambia el diseño pasa por
// acá (o por commit directo) para que el historial tenga un nombre legible.

import { toast } from "../util/toast";
import {
  agregarEstructura, aplicarReparacion, construir, convertirALibre, editarEsqueleto, partirClave, quitarEstructura, setOverride,
  tipologia, vincularVolumenSugerido, volumenesCompatibles, VUELO_MENSULA_DEFECTO, vueloMensula,
  type Accion, type Catalogo, type Diseno, type EstructuraResuelta, type OpEsqueleto, type OverrideCelda, type Resultado,
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

/**
 * Si la tipología depende de un volumen del contexto (escalera, losa, puente, azotea) y el diseño no tiene
 * ninguno compatible, lo crea con las medidas de la estructura y la vincula; si hay uno solo, la vincula a
 * ese. Así el contexto se ve en el 3D sin tipear ids.
 */
export function conContexto(diseno: Diseno, estructuraId: string, catalogo: Catalogo): Diseno {
  const est = diseno.estructuras.find((e) => e.id === estructuraId);
  const campo = est ? tipologia(est.tipologia)?.campos.find((c) => c.tipo === "volumen" && c.ruta === "params.volumenId") : undefined;
  if (!est || !campo?.volumenes || (est.params as Record<string, unknown>).volumenId) return diseno;
  const compatibles = volumenesCompatibles(diseno, campo.volumenes);
  if (compatibles.length === 1) {
    const d = structuredClone(diseno);
    const e = d.estructuras.find((x) => x.id === estructuraId)!;
    e.params = { ...e.params, volumenId: compatibles[0].id };
    return d;
  }
  if (compatibles.length > 1) return diseno;
  try {
    const huella = construir(diseno, catalogo).estructuras.find((e) => e.id === estructuraId)?.huella ?? [];
    return vincularVolumenSugerido(diseno, estructuraId, campo.volumenes, huella);
  } catch {
    return diseno;
  }
}

export function agregarPreset(presetId: string, nombre: string, opciones: Parameters<typeof agregarEstructura>[2] = {}): string | null {
  const s = st();
  try {
    const r = agregarEstructura(s.diseno, presetId, opciones, s.catalogo);
    const estructuraId = r.estructuraId;
    const diseno = conContexto(r.diseno, estructuraId, s.catalogo);
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
  { id: "mensula", etiqueta: "Ménsula", ayuda: "Voladizo hacia afuera en los nodos de la celda, con el vuelo elegido (0,45 = ménsula; más = horizontal + diagonal 2,00). Repintar con otro vuelo lo cambia; con el mismo, lo saca." },
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

const mismoVuelo = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) < 0.001;

/** Lo que hace un pincel sobre un diseño (sin commit). `vuelo`: el del pincel de ménsula. */
export function pintarDiseno(diseno: Diseno, res: Resultado, estructuraId: string, celdas: string[], pincel: Pincel, catalogo = st().catalogo, vuelo = st().vueloMensula): Diseno {
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
        case "mensula": {
          // mismo vuelo en los dos nodos: se saca; si no, se pone (o se cambia) con el vuelo elegido
          const ns = nodosDeCelda(r, clave);
          const sacar = ns.length > 0 && ns.every((n) => mismoVuelo(esq.nodos[n]?.mensula?.brazo, vuelo));
          for (const n of ns) {
            const m = esq.nodos[n]?.mensula;
            ops.push({ op: "nodo", clave: n, valor: { mensula: sacar ? null : { ...(m ?? { dir: "afuera" }), brazo: vuelo } } });
          }
          break;
        }
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
      case "mensula": {
        if (!actual.mensula) {
          valor = { mensula: "afuera", brazoMensula: vuelo };
          break;
        }
        // vuelo que tiene hoy la celda: el del override o, en diseños viejos, el que armó la plantilla
        const enNodos = nodosDeCelda(r, clave).map((n) => r.esqueleto.nodos[n]?.mensula?.brazo).find((b) => b !== undefined);
        const hoy = vueloMensula(actual.brazoMensula, enNodos ?? VUELO_MENSULA_DEFECTO);
        valor = mismoVuelo(hoy, vuelo) ? { mensula: null, brazoMensula: null } : { brazoMensula: vuelo };
        break;
      }
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
  const nombre = pincel === "mensula" ? `${NOMBRE_PINCEL[pincel]} ${s.vueloMensula.toFixed(2).replace(".", ",")}` : NOMBRE_PINCEL[pincel];
  return s.commit(d, `${nombre} en ${celdas.length} celda${celdas.length === 1 ? "" : "s"}`, base);
}

/** ¿El pincel aplica a esta estructura? (algunos solo editan el esqueleto de la libre). */
export function pincelDisponible(pincel: Pincel, tipologia: string): boolean {
  const p = PINCELES.find((x) => x.id === pincel);
  if (!p) return false;
  if (p.soloLibre && tipologia !== "libre") return false;
  return true;
}
