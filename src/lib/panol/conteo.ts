// Conteo cíclico (docs §6.7): qué se muestra para contar y cómo se lee el resultado.
//
// SE CUENTA A CIEGAS. La lista dice QUÉ figura en la estantería, nunca CUÁNTO: si el que
// cuenta ve el número del sistema, lo copia. Por eso `listaEsperada` no devuelve
// cantidades, aunque las tenga a mano.
//
// Lo esperado lo calcula la base al cerrar (pan_conteo_cerrar), ítem por ítem, corrigiendo
// lo que se movió después de que se contó ese ítem. Acá sólo se lee lo que quedó.
// Lógica pura (conteo.test.ts).

import type { Articulo, Saldo, Ubicacion, Unidad, Variante } from "./tipos.ts";
import { diferenciaSuperaUmbral } from "./estado.ts";

// ─── Filas de la base (no están en tipos.ts) ────────────────────────────────

export type EstadoConteo = "abierto" | "por_aprobar" | "aplicado" | "rechazado";

export type Conteo = {
  id: string;
  ubicacion_id: string;
  estado: EstadoConteo;
  umbral_pct: number | null;
  iniciado_at: string;
  cerrado_at: string | null;
  contado_por_id: string | null;
};

export type ConteoItem = {
  id: string;
  conteo_id: string;
  articulo_id: string;
  variante_id: string | null;
  unidad_id: string | null;
  contado: number | null;
  contado_at: string | null;
  esperado: number | null;
  encontrado_extra: boolean;
  nota: string | null;
};

/** La clave de un ítem, igual que el índice único de pan_conteo_items. */
export const claveItem = (articuloId: string, varianteId?: string | null, unidadId?: string | null) =>
  `${articuloId}|${varianteId ?? ""}|${unidadId ?? ""}`;

// ─── Árbol de ubicaciones ───────────────────────────────────────────────────

/** Los ids de la ubicación y todo lo que cuelga de ella (lo mismo que pan_subarbol). */
export function subarbol(ubicaciones: readonly Pick<Ubicacion, "id" | "padre_id">[], raiz: string): Set<string> {
  const hijos = new Map<string, string[]>();
  for (const u of ubicaciones) {
    if (!u.padre_id) continue;
    hijos.set(u.padre_id, [...(hijos.get(u.padre_id) ?? []), u.id]);
  }
  const salida = new Set<string>();
  const pila = [raiz];
  while (pila.length) {
    const id = pila.pop()!;
    if (salida.has(id)) continue;
    salida.add(id);
    pila.push(...(hijos.get(id) ?? []));
  }
  return salida;
}

/** "Pañol › Estantería E3 › Estante 2". */
export function rutaUbicacion(ubicaciones: readonly Pick<Ubicacion, "id" | "padre_id" | "nombre">[], id: string): string {
  const porId = new Map(ubicaciones.map((u) => [u.id, u]));
  const nombres: string[] = [];
  let actual = porId.get(id);
  const vistos = new Set<string>();
  while (actual && !vistos.has(actual.id)) {
    vistos.add(actual.id);
    nombres.unshift(actual.nombre);
    actual = actual.padre_id ? porId.get(actual.padre_id) : undefined;
  }
  return nombres.join(" › ");
}

// ─── Qué se cuenta ──────────────────────────────────────────────────────────

export type FilaEsperada = {
  clave: string;
  articuloId: string;
  varianteId: string | null;
  nombre: string;
  unidad: string;
  /** Dónde buscarlo: el cajón o estante. */
  donde: string;
};

export type UnidadEsperada = {
  clave: string;
  articuloId: string;
  unidadId: string;
  numero: string;
  nombre: string;
  donde: string;
};

type CatalogoConteo = {
  ubicaciones: readonly Ubicacion[];
  articulos: readonly Articulo[];
  variantes: readonly Variante[];
  unidades: readonly Unidad[];
  saldos: readonly Saldo[];
};

/**
 * Lo que figura en el subárbol de una ubicación, SIN cantidades.
 *
 * Entra un artículo si tiene saldo ahí (aunque sea negativo: justamente hay que contarlo) o
 * si ése es su lugar propio, aunque hoy figure en cero (así un "se acabó" también se
 * confirma). Las herramientas con número no entran como artículo: se escanean una por una.
 */
export function listaEsperada(cat: CatalogoConteo, ubicacionId: string): { articulos: FilaEsperada[]; unidades: UnidadEsperada[] } {
  const ids = subarbol(cat.ubicaciones, ubicacionId);
  const nombreUbic = new Map(cat.ubicaciones.map((u) => [u.id, u.nombre]));
  const art = new Map(cat.articulos.map((a) => [a.id, a]));
  const talle = new Map(cat.variantes.map((v) => [v.id, v]));
  const filas = new Map<string, FilaEsperada>();

  const sumar = (a: Articulo, varianteId: string | null, ubic: string | null) => {
    const clave = claveItem(a.id, varianteId);
    if (filas.has(clave)) return;
    const propia = a.ubicacion_id && ids.has(a.ubicacion_id) ? a.ubicacion_id : ubic;
    const t = varianteId ? talle.get(varianteId)?.nombre : undefined;
    filas.set(clave, {
      clave,
      articuloId: a.id,
      varianteId,
      nombre: t ? `${a.nombre} · talle ${t}` : a.nombre,
      unidad: a.unidad,
      donde: (propia && nombreUbic.get(propia)) || "",
    });
  };

  for (const s of cat.saldos) {
    if (!s.lugar.startsWith("u:") || !ids.has(s.lugar.slice(2)) || Number(s.cantidad) === 0) continue;
    const a = art.get(s.articulo_id);
    if (!a || !a.activo || a.tipo === "herramienta") continue;
    sumar(a, s.variante_id, s.lugar.slice(2));
  }
  for (const a of cat.articulos) {
    if (!a.activo || a.tipo === "herramienta" || !a.ubicacion_id || !ids.has(a.ubicacion_id)) continue;
    if (a.tiene_talles) {
      const suyos = cat.variantes.filter((v) => v.articulo_id === a.id && v.activo).sort((x, y) => x.orden - y.orden);
      for (const v of suyos) sumar(a, v.id, a.ubicacion_id);
      if (suyos.length === 0) sumar(a, null, a.ubicacion_id);
    } else {
      sumar(a, null, a.ubicacion_id);
    }
  }

  const unidades: UnidadEsperada[] = cat.unidades
    .filter((u) => u.activo && u.lugar.startsWith("u:") && ids.has(u.lugar.slice(2)))
    .map((u) => ({
      clave: claveItem(u.articulo_id, null, u.id),
      articuloId: u.articulo_id,
      unidadId: u.id,
      numero: u.numero,
      nombre: art.get(u.articulo_id)?.nombre ?? "Herramienta",
      donde: nombreUbic.get(u.lugar.slice(2)) ?? "",
    }))
    .sort((x, y) => x.donde.localeCompare(y.donde, "es", { numeric: true }) || x.numero.localeCompare(y.numero, "es", { numeric: true }));

  const articulos = [...filas.values()].sort(
    (x, y) => x.donde.localeCompare(y.donde, "es", { numeric: true }) || x.nombre.localeCompare(y.nombre, "es"),
  );
  return { articulos, unidades };
}

// ─── Qué salió ──────────────────────────────────────────────────────────────

export type Diferencia = {
  item: ConteoItem;
  contado: number;
  esperado: number;
  /** contado − esperado. */
  dif: number;
  supera: boolean;
};

export type ResumenConteo = {
  /** Artículos por cantidad que no coinciden. */
  diferencias: Diferencia[];
  /** Artículos por cantidad que coinciden. */
  coinciden: number;
  /** Herramientas que figuraban y no aparecieron: quedan faltantes. */
  noAparecieron: ConteoItem[];
  /** Herramientas que aparecieron y figuraban en otro lado. */
  aparecieron: ConteoItem[];
  /** Herramientas escaneadas que estaban donde figuraban. */
  unidadesOk: number;
  /** ¿Alguna diferencia pide aprobación? La misma cuenta que pan_conteo_cerrar. */
  pideAprobacion: boolean;
};

export function resumenConteo(items: readonly ConteoItem[], umbralPct: number): ResumenConteo {
  const r: ResumenConteo = { diferencias: [], coinciden: 0, noAparecieron: [], aparecieron: [], unidadesOk: 0, pideAprobacion: false };
  for (const it of items) {
    if (it.contado === null) continue;
    const contado = Number(it.contado);
    const esperado = Number(it.esperado ?? 0);
    if (it.unidad_id) {
      if (contado === 0 && esperado === 1) {
        r.noAparecieron.push(it);
        r.pideAprobacion = true;
      } else if (contado === 1 && esperado === 0) r.aparecieron.push(it);
      else r.unidadesOk++;
      continue;
    }
    const dif = contado - esperado;
    if (dif === 0) {
      r.coinciden++;
      continue;
    }
    const supera = diferenciaSuperaUmbral(contado, esperado, umbralPct);
    if (supera) r.pideAprobacion = true;
    r.diferencias.push({ item: it, contado, esperado, dif, supera });
  }
  // Primero lo más grande (en proporción): es lo que alguien va a mirar.
  r.diferencias.sort((a, b) => Math.abs(b.dif) / Math.max(b.esperado, 1) - Math.abs(a.dif) / Math.max(a.esperado, 1));
  return r;
}

const fmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });
export const numero = (n: number) => fmt.format(n);

/** "+40" / "−60", con el signo menos de verdad (se lee mejor que un guión). */
export function textoDif(dif: number): string {
  if (dif === 0) return "0";
  return `${dif > 0 ? "+" : "−"}${fmt.format(Math.abs(dif))}`;
}

// ─── Qué toca contar ────────────────────────────────────────────────────────

export type ParaContar = {
  ubicacion: Ubicacion;
  ultimo: Conteo | null;
  /** El que quedó abierto o esperando aprobación, si hay. */
  pendiente: Conteo | null;
};

/**
 * Las estanterías (y estantes sueltos sin estantería) ordenadas por lo que hace más que no
 * se cuenta: nunca contadas primero. Las que esperan aprobación van al final: ya están.
 */
export function paraContar(ubicaciones: readonly Ubicacion[], conteos: readonly Conteo[]): ParaContar[] {
  const porId = new Map(ubicaciones.map((u) => [u.id, u]));
  const candidatas = ubicaciones.filter(
    (u) => u.activo && (u.tipo === "estanteria" || (u.tipo === "estante" && porId.get(u.padre_id ?? "")?.tipo !== "estanteria")),
  );
  const salida = candidatas.map((u) => {
    const suyos = conteos.filter((c) => c.ubicacion_id === u.id).sort((a, b) => b.iniciado_at.localeCompare(a.iniciado_at));
    const ultimo = suyos.find((c) => c.estado === "aplicado") ?? null;
    const pendiente = suyos.find((c) => c.estado === "abierto" || c.estado === "por_aprobar") ?? null;
    return { ubicacion: u, ultimo, pendiente };
  });
  const peso = (p: ParaContar) => (p.pendiente?.estado === "por_aprobar" ? 1 : 0);
  return salida.sort(
    (a, b) =>
      peso(a) - peso(b) ||
      (a.ultimo?.iniciado_at ?? "").localeCompare(b.ultimo?.iniciado_at ?? "") ||
      a.ubicacion.orden - b.ubicacion.orden ||
      a.ubicacion.nombre.localeCompare(b.ubicacion.nombre, "es", { numeric: true }),
  );
}
