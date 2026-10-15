/**
 * Registro de tipologías (pedido 8e). Una tipología nueva es un archivo que exporta un objeto `Tipologia`
 * más su test, y se suma a `_nuevas.ts`. La UI arma el panel de parámetros desde `campos` y la galería
 * desde `presets`.
 */
import type { Apoyo, Aviso, Diseno, Elemento, Esqueleto, Estructura, Poligono, Puerto, Regla, Sistema, UnionResuelta } from '../tipos.ts';
import type { Catalogo } from '../catalogo/catalogo.ts';
import type { Criterios } from '../criterios.ts';
import type { rellenarLargo } from '../medida/rellenar.ts';

export interface Campo {
  ruta: string;
  etiqueta: string;
  tipo: 'medida' | 'entero' | 'opcion' | 'bool' | 'frentes' | 'poligono' | 'lista_medidas' | 'texto';
  unidad?: 'm' | 'm²' | '°';
  min?: number;
  max?: number;
  paso?: number;
  opciones?: { valor: string | number; etiqueta: string }[];
  visibleSi?: { ruta: string; igual?: unknown; distinto?: unknown };
  ayuda?: string;
  grupo?: 'Medidas' | 'Protección' | 'Apoyo' | 'Accesos' | 'Avanzado';
  catalogo?: 'vanos' | 'profundidades' | 'mensulas' | 'vigasCelosia';
}

export interface Preset {
  id: string;
  nombre: string;
  descripcion: string;
  icono: string;
  tecla?: string;
  params: Record<string, unknown>;
  sistema?: Sistema;
}

/**
 * Relaciones con otras estructuras que el núcleo resuelve antes de generar (§11).
 * Las huellas de los soportes vienen en coordenadas LOCALES de la estructura que se genera.
 */
export interface Relaciones {
  soportes: { estructuraId: string; nombre: string; huellas: Poligono[]; yTope: number }[];
  /** Hay otra estructura apoyada encima (pórtico con estructura arriba). */
  conArriba: boolean;
  /** Ids de estructuras unidas por cara (no apoyo). */
  unidaA: string[];
  /** La fachada tiene una torre unida: el acceso es por la torre. */
  accesoPorTorre: boolean;
  /** Torre unida a una fachada: altura y fase de rosetas heredadas. */
  alturaHeredada?: number;
  arrHeredado?: number;
}

export interface CtxGenerar {
  diseno: Diseno;
  catalogo: Catalogo;
  criterios: Criterios;
  rellenar: typeof rellenarLargo;
  relaciones: Relaciones;
}

export interface Generado {
  esqueleto: Esqueleto;
  elementos?: Elemento[];
  avisos: Omit<Aviso, 'id'>[];
  reglas: Omit<Regla, 'id'>[];
  metricas: { m2: number; ml: number; alturaReal: number; huella: Poligono };
  puertos?: Omit<Puerto, 'estructuraId'>[];
  sinReglas?: string[];
  /** §11: datos propios para la UI (frentes, relleno…). */
  info?: Record<string, unknown>;
  /** §11: uniones internas (esquinas de fachada), en el formato del Resultado. */
  uniones?: UnionResuelta[];
}

export interface Tipologia<P extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  version: number;
  nombre: string;
  descripcion: string;
  categoria: 'fachada' | 'bandeja' | 'torre' | 'portico' | 'especial' | 'libre';
  sistemas: Sistema[];
  apoyos: Apoyo['tipo'][];
  porDefecto(): P;
  normalizar(parcial: Partial<P>, sistema: Sistema): { params: P; avisos: string[] };
  campos: Campo[];
  presets: Preset[];
  generar(est: Estructura & { params: P }, ctx: CtxGenerar): Generado;
  migrarParams?(viejos: Record<string, unknown>, versionVieja: number): P;
  /** §11 opcional: ajustes propios al cambiar de sistema (multi ↔ bastidor). */
  cambiarSistema?(params: P, de: Sistema, a: Sistema): { params: P; avisos: string[]; rechazado?: boolean };
}

/** Valida ids únicos de tipología y de preset. Tira en el arranque si se repiten. */
export function registrarTodas(lista: Tipologia[]): Tipologia[] {
  const ids = new Set<string>();
  const presets = new Set<string>();
  for (const t of lista) {
    if (!t || !t.id) throw new Error('Tipología sin id');
    if (ids.has(t.id)) throw new Error(`Tipología repetida: ${t.id}`);
    ids.add(t.id);
    for (const p of t.presets) {
      if (presets.has(p.id)) throw new Error(`Preset repetido: ${p.id} (en ${t.id})`);
      presets.add(p.id);
    }
  }
  return Object.freeze([...lista]) as Tipologia[];
}
