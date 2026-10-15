/**
 * Reglas de código → (familia, sistema, medidas) de las piezas ABA.
 *
 * Es el ESPEJO de la semilla de tec_pieza_mapa en supabase/migrations/20261015000001_modelador.sql:
 * si cambia una, cambiar la otra (semillas.test.ts compara estas reglas con el fixture del núcleo).
 *
 * Además sirve de red: si Odoo trae un código nuevo que sigue la convención (p. ej. HOR-048-300)
 * y todavía nadie lo cargó en tec_pieza_mapa, catalogoDesdeFilas lo infiere de acá. Un código que
 * ya tiene alguna fila en tec_pieza_mapa (aunque esté inactiva) NO se infiere: manda OT.
 */
import type { Familia, SistemaPieza } from '../modelo/index.ts';

export interface EntradaInferida {
  familia: Familia;
  sistema: SistemaPieza;
  largo: number | null;
  alto: number | null;
  ancho: number | null;
  variante: string | null;
  rinde?: number;
  unidad?: string;
}

const m100 = (s: string) => Number(s) / 100;
const e = (familia: Familia, sistema: SistemaPieza, med: Partial<Pick<EntradaInferida, 'largo' | 'alto' | 'ancho' | 'variante'>> = {}, extra: Pick<EntradaInferida, 'rinde' | 'unidad'> = {}): EntradaInferida => ({
  familia, sistema, largo: med.largo ?? null, alto: med.alto ?? null, ancho: med.ancho ?? null, variante: med.variante ?? null, ...extra,
});

/** Códigos sin medida (exactos). */
const FIJOS: Record<string, EntradaInferida[]> = {
  'TORN-600-FIJA': [e('base_regulable', 'comun')],
  'TORN-600-MOVIL': [e('base_regulable', 'comun', { variante: 'movil' })],
  'TORN-300-FIJA': [e('base_fija', 'comun')],
  'COLL-CORTO': [e('collarin', 'multi')],
  'MAD-BASE-10x10': [e('accesorio', 'comun', { variante: 'madera_base' })],
  'RUEDA-STD': [e('rueda', 'comun')],
  'RUEDA-STD-FRENO': [e('rueda_freno', 'comun')],
  'ESC-INT-MULTI': [e('escalera_interior', 'multi')],
  'ESC-INT-BAST': [e('escalera_interior', 'bastidor')],
  'BAR-ESC-MULTI': [e('baranda_escalera', 'multi')],
  'BAR-ESC-BAST': [e('baranda_escalera', 'bastidor')],
  'ESFERA-SEG': [e('esfera', 'comun')],
  'NUDO-FIJO': [e('grampa_fija', 'comun')],
  'NUDO-GIR': [e('grampa_giratoria', 'comun')],
  'PLACA-FEN-122x244': [e('fenolico', 'comun', {}, { rinde: 2.9768, unidad: 'placa' })],
  'MEDIA-SOMBRA-5': [e('media_sombra', 'comun', {}, { rinde: 200, unidad: 'rollo 4×50 m' })],
  'ALAMB-CONC-45x10': [e('accesorio', 'comun', { variante: 'concertina' }, { rinde: 10, unidad: 'rollo 10 m' })],
};

type Regla = [RegExp, (g: string[]) => EntradaInferida[]];

const REGLAS: Regla[] = [
  [/^VERT-(\d{3})-(CE|SE)$/, (g) => [e('vertical', 'multi', { largo: m100(g[1]), variante: g[2] })]],
  [/^HOR-048-(\d{3})$/, (g) => [e('horizontal', 'multi', { largo: m100(g[1]) }), e('baranda', 'multi', { largo: m100(g[1]) })]],
  [/^DIAG-(\d{3})x(\d{3})$/, (g) => [e('diagonal', 'multi', { alto: m100(g[1]), largo: m100(g[2]) })]],
  [/^DIAG-PL-(\d{3})x(\d{3})$/, (g) => [e('diagonal_planta', 'multi', { largo: m100(g[1]), ancho: m100(g[2]) })]],
  [/^TAB-MET-(\d{3})$/, (g) => [e('tablon', g[1] === '150' || g[1] === '250' ? 'comun' : 'multi', { largo: m100(g[1]) })]],
  [/^TAB-ESC-(\d{3})$/, (g) => [e('tablon_escotilla', 'comun', { largo: m100(g[1]) })]],
  [/^RDPE-(\d{3})$/, (g) => [e('rodapie', g[1] === '090' || g[1] === '130' ? 'bastidor' : g[1] === '150' || g[1] === '250' ? 'comun' : 'multi', { largo: m100(g[1]) })]],
  [/^(VIGA-CEL|VIGA-PTE|MENSULA)-(\d{3})$/, (g) => [e(g[1] === 'VIGA-CEL' ? 'viga_celosia' : g[1] === 'VIGA-PTE' ? 'viga_puente' : 'mensula', 'multi', { largo: m100(g[2]) })]],
  [/^ZANCA-ESC-(\d{3})x(\d{3})$/, (g) => [e('zanca', 'multi', { ancho: m100(g[1]), largo: m100(g[2]) })]],
  [/^BAST-(AND|PAS|PEA|BAR)-(\d{3})x(\d{3})$/, (g) => [e(g[1] === 'BAR' ? 'bastidor_baranda' : 'bastidor', 'bastidor', { ancho: m100(g[2]), alto: m100(g[3]) })]],
  [/^RIEND-(\d{3})-(H|D)$/, (g) => [e(g[2] === 'H' ? 'rienda_h' : 'rienda_d', 'bastidor', { largo: m100(g[1]) })]],
  [/^MOD-(AND|PEA)-[A-Z-]+-(\d{3})x(\d{3})x(\d{3})$/, (g) => [e('modulo_kit', 'bastidor', { ancho: m100(g[2]), largo: m100(g[3]), alto: m100(g[4]) })]],
  [/^CAÑO-(\d{3})$/, (g) => [e('cano', 'comun', { largo: m100(g[1]) })]],
];

/** Qué entradas de mapa le corresponden a un código según la convención ABA. [] si no sigue ninguna. */
export function mapeoPorCodigo(codigo: string): EntradaInferida[] {
  const fijo = FIJOS[codigo];
  if (fijo) return fijo.map((x) => ({ ...x }));
  for (const [re, f] of REGLAS) {
    const g = re.exec(codigo);
    if (g) return f(g);
  }
  return [];
}

/** Para el test que verifica que la migración tiene las mismas reglas. */
export const PATRONES_SEMILLA: string[] = REGLAS.map(([re]) => re.source);
export const CODIGOS_FIJOS_SEMILLA: string[] = Object.keys(FIJOS);
