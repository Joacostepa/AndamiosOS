/**
 * Índice de tipologías (núcleo). Las tipologías nuevas entran por `_nuevas.ts` sin tocar este archivo.
 */
import { registrarTodas, type Preset, type Tipologia } from './registro.ts';
import { FACHADA_REGISTRO, FACHADA_BASTIDOR } from './fachada-bastidor.ts';
import { TORRE } from './torre.ts';
import { PORTICO } from './portico.ts';
import { LIBRE } from './libre.ts';
import { NUEVAS } from './_nuevas.ts';

export const TIPOLOGIAS: Tipologia[] = registrarTodas([FACHADA_REGISTRO, FACHADA_BASTIDOR, TORRE, PORTICO, ...NUEVAS, LIBRE] as unknown as Tipologia[]);

const POR_ID = new Map(TIPOLOGIAS.map((t) => [t.id, t]));

export function tipologia(id: string): Tipologia | undefined {
  return POR_ID.get(id);
}

export interface PresetGaleria extends Preset {
  tipologia: string;
  categoria: Tipologia['categoria'];
}

/** Busca un preset por id (en todas las tipologías). */
export function presetPorId(id: string): PresetGaleria | undefined {
  for (const t of TIPOLOGIAS) {
    const p = t.presets.find((x) => x.id === id);
    if (p) return { ...p, tipologia: t.id, categoria: t.categoria };
  }
  return undefined;
}

const ORDEN: { categoria: Tipologia['categoria']; etiqueta: string }[] = [
  { categoria: 'fachada', etiqueta: 'Fachadas' },
  { categoria: 'bandeja', etiqueta: 'Bandejas y protecciones' },
  { categoria: 'torre', etiqueta: 'Torres' },
  { categoria: 'portico', etiqueta: 'Pórticos' },
  { categoria: 'especial', etiqueta: 'Especiales' },
  { categoria: 'libre', etiqueta: 'Estructura libre' },
];

/** Presets agrupados por categoría, en el orden de la galería. */
export function presetsGaleria(): { categoria: Tipologia['categoria']; etiqueta: string; presets: PresetGaleria[] }[] {
  return ORDEN.map(({ categoria, etiqueta }) => ({
    categoria,
    etiqueta,
    presets: TIPOLOGIAS.filter((t) => t.categoria === categoria).flatMap((t) => t.presets.map((p) => ({ ...p, tipologia: t.id, categoria }))),
  })).filter((g) => g.presets.length);
}

/** Categoría efectiva: una estructura convertida a libre sigue siendo, para las uniones, lo que era. */
export function categoriaDe(est: { tipologia: string; convertidaDe?: { tipologia: string } }): Tipologia['categoria'] | undefined {
  if (est.convertidaDe) return tipologia(est.convertidaDe.tipologia)?.categoria;
  return tipologia(est.tipologia)?.categoria;
}
