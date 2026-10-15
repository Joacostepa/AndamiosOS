/**
 * Reglas DESCRIPCIÓN → (familia, sistema, medidas) de las piezas ABA, para el catálogo real.
 *
 * En producción el sync con Odoo deja los códigos como «ODOO-<n>» y la medida queda en la
 * descripción («HORIZONTAL ø48.3 x 2.50 m», «RODAPIE 1,09m»…), así que las reglas por código de
 * semillas.ts no encuentran nada. Estas reglas leen la descripción NORMALIZADA (sin acentos ni ø,
 * en mayúsculas, coma decimal → punto, espacios colapsados).
 *
 * Es la FUENTE de supabase/migrations/20261015000005_modelador_mapa_por_descripcion.sql: el bloque
 * de INSERTs de esa migración es `sqlSemillaDescripcion()` tal cual (mapa-descripcion.test.ts lo
 * verifica). Si cambia una regla, regenerar el bloque (ver el test).
 *
 * Las regex usan solo lo común a JS y a las ARE de Postgres: nada de \b (en Postgres es backspace),
 * nada de lookbehind ni cuantificadores no codiciosos. Cada captura queda determinada por el
 * patrón anclado, así que la codicia distinta de los dos motores no cambia lo capturado.
 */
import type { Familia, SistemaPieza } from '../modelo/index.ts';
import type { EntradaInferida } from './semillas.ts';

/** '$1' = la captura 1 en metros tal cual; '$1/100' = captura 1 en centímetros. */
type Valor = number | `$${number}` | `$${number}/100` | null;
type Sistema = SistemaPieza | { grupo: number; por: [number[], SistemaPieza][]; resto: SistemaPieza };

export interface ReglaDescripcion {
  id: string;
  /** Regex sobre la descripción normalizada (ver normalizarDescripcion). */
  patron: string;
  familia: Familia;
  sistema: Sistema;
  largo?: Valor;
  alto?: Valor;
  ancho?: Valor;
  variante?: string;
  prioridad?: number;
  rinde?: number;
  unidad?: string;
}

const M = String.raw` ?M\.?`; // «m», «m.», « m», « m.»
const N = String.raw`(\d+\.\d+)`; // medida con decimales (la coma ya es punto)

/** Sistema de tablones y rodapiés: el mismo criterio que la semilla por código. */
const SIS_TABLON: Sistema = { grupo: 1, por: [[[1.5, 2.5], 'comun']], resto: 'multi' };
const SIS_RODAPIE: Sistema = { grupo: 1, por: [[[0.9, 1.3], 'bastidor'], [[1.5, 2.5], 'comun']], resto: 'multi' };

export const REGLAS_DESCRIPCION: ReglaDescripcion[] = [
  { id: 'vertical CE', patron: `^VERTICAL ${N}${M} CON ESPIGA$`, familia: 'vertical', sistema: 'multi', largo: '$1', variante: 'CE' },
  { id: 'vertical SE', patron: `^VERTICAL ${N}${M} SIN ESPIGA$`, familia: 'vertical', sistema: 'multi', largo: '$1', variante: 'SE' },
  // la horizontal y la baranda son la misma pieza
  { id: 'horizontal', patron: String.raw`^HORIZONTAL (?:48\.3 ?X ?)?${N}${M}$`, familia: 'horizontal', sistema: 'multi', largo: '$1' },
  { id: 'baranda', patron: String.raw`^HORIZONTAL (?:48\.3 ?X ?)?${N}${M}$`, familia: 'baranda', sistema: 'multi', largo: '$1' },
  // DIAGONAL <alto> X <largo> m (P/COLOR). «DIAGONAL DE 2.00 X 2.00» (sin «m») es un duplicado: pierde.
  { id: 'diagonal', patron: String.raw`^DIAGONAL ${N} ?X ?${N}(?:${M})?(?: \(P/[A-Z]+\))?$`, familia: 'diagonal', sistema: 'multi', alto: '$1', largo: '$2' },
  { id: 'diagonal (DE)', patron: String.raw`^DIAGONAL DE ${N} ?X ?${N}(?:${M})?(?: \(P/[A-Z]+\))?$`, familia: 'diagonal', sistema: 'multi', alto: '$1', largo: '$2', prioridad: 110 },
  { id: 'diagonal_planta', patron: `^DIAGONAL (?:EN )?PLANTA ${N} ?X ?${N}${M}$`, familia: 'diagonal_planta', sistema: 'multi', largo: '$1', ancho: '$2' },
  // «TABLON METALICO 1.50 m 0.20» (tablón angosto) NO entra: el $ lo deja afuera
  { id: 'tablon', patron: `^TABLON METALICO ${N}${M}$`, familia: 'tablon', sistema: SIS_TABLON, largo: '$1' },
  { id: 'tablon_escotilla', patron: `^TABLON (?:CON )?ESCOTILLA ${N}${M}$`, familia: 'tablon_escotilla', sistema: 'comun', largo: '$1' },
  { id: 'rodapie', patron: `^RODAPIE ${N}${M}$`, familia: 'rodapie', sistema: SIS_RODAPIE, largo: '$1' },
  // Bastidores: el motor no pide variante; «pasillo» es el ancho (0,90) y «paso peatonal» el alto (2,50).
  { id: 'bastidor', patron: `^BASTIDOR (?:DE ANDAMIO|PASO PEATONAL)(?: PASILLO)? - ?${N}${M} ?X ?${N} ?H\\.?$`, familia: 'bastidor', sistema: 'bastidor', ancho: '$1', alto: '$2' },
  { id: 'bastidor_baranda', patron: `^BASTIDOR BARANDA(?: PASILLO)? - ?${N}${M} ?X ?${N} ?H\\.?$`, familia: 'bastidor_baranda', sistema: 'bastidor', ancho: '$1', alto: '$2' },
  { id: 'rienda_h', patron: `^RIENDA ANDAMIO (?:JR |JUNIOR )?${N}${M} - ?HORIZONTAL$`, familia: 'rienda_h', sistema: 'bastidor', largo: '$1' },
  // el largo nominal es el del vano (2.50); el real de la pieza va entre paréntesis (2.77)
  { id: 'rienda_d', patron: String.raw`^RIENDA ANDAMIO (?:JR |JUNIOR )?${N}${M}(?: \(\d+\.\d+${M}\))? - ?DIAGONAL$`, familia: 'rienda_d', sistema: 'bastidor', largo: '$1' },
  // MODULO DE ANDAMIO [STD|JUNIOR|PASILLO|PASO PEATONAL …] <ancho> X <largo> X <alto>.
  // «MODULO BARANDA DE ANDAMIO …» no entra: el motor no lo pide (la semilla por código tampoco).
  { id: 'modulo_kit', patron: `^MODULO DE ANDAMIO (?:[A-Z]+ )*${N} ?X ?${N} ?X ?${N}$`, familia: 'modulo_kit', sistema: 'bastidor', ancho: '$1', largo: '$2', alto: '$3' },
  // CAÑO - 2,50m (la Ñ queda N). «CAÑO ESTRUCTURAL …» no entra.
  { id: 'cano', patron: `^CANO - ?${N}${M}$`, familia: 'cano', sistema: 'comun', largo: '$1' },
  { id: 'grampa_fija', patron: '^NUDO FIJO$', familia: 'grampa_fija', sistema: 'comun' },
  { id: 'grampa_giratoria', patron: '^NUDO GIRATORIO$', familia: 'grampa_giratoria', sistema: 'comun' },
  { id: 'base_regulable', patron: String.raw`^TORNILLON (?:DE )?600 ?MM\.?(?: POR UNIDAD)? \(BASE FIJA\)$`, familia: 'base_regulable', sistema: 'comun' },
  { id: 'base_regulable movil', patron: String.raw`^TORNILLON (?:DE )?600 ?MM\.?(?: POR UNIDAD)? \(BASE MOVIL\)$`, familia: 'base_regulable', sistema: 'comun', variante: 'movil' },
  { id: 'base_fija', patron: String.raw`^TORNILLON (?:DE )?300 ?MM\.?(?: POR UNIDAD)? \(BASE FIJA\)$`, familia: 'base_fija', sistema: 'comun' },
  // «JUEGO DE RUEDAS … (4 U)», «RUEDA INTERMEDIA» y «DE GRAN PORTE» no entran
  { id: 'rueda', patron: '^RUEDA (?:DE ANDAMIO )?STANDARD(?:, POR UNIDAD)?$', familia: 'rueda', sistema: 'comun' },
  { id: 'rueda_freno', patron: '^RUEDA (?:DE ANDAMIO )?STANDARD CON FRENO(?:, POR UNIDAD)?$', familia: 'rueda_freno', sistema: 'comun' },
  { id: 'viga_celosia', patron: `^VIGA CELOSIA ${N}${M}$`, familia: 'viga_celosia', sistema: 'multi', largo: '$1' },
  { id: 'viga_puente', patron: `^VIGA PUENTE ${N}${M}$`, familia: 'viga_puente', sistema: 'multi', largo: '$1' },
  // ZANCA (LIMON) ESCALERA DENCANSO 150X250 → ancho 1,50 · largo 2,50 (en cm)
  { id: 'zanca', patron: String.raw`^ZANCA (?:\(LIMON\) )?ESCALERA [A-Z]+ (\d{3}) ?X ?(\d{3})$`, familia: 'zanca', sistema: 'multi', ancho: '$1/100', largo: '$2/100' },
  { id: 'escalera_interior multi', patron: String.raw`^ESCALERA INTERNA \(PARA MULTIDIRECCIONAL\)$`, familia: 'escalera_interior', sistema: 'multi' },
  { id: 'escalera_interior bastidor', patron: String.raw`^ESCALERA INTERNA \(PARA BASTIDOR\)$`, familia: 'escalera_interior', sistema: 'bastidor' },
  { id: 'baranda_escalera multi', patron: String.raw`^BARANDA DE ESCALERA INTERNA \(PARA MULTIDIRECCIONAL\)$`, familia: 'baranda_escalera', sistema: 'multi' },
  { id: 'baranda_escalera bastidor', patron: String.raw`^BARANDA DE ESCALERA INTERNA \(PARA BASTIDOR\)$`, familia: 'baranda_escalera', sistema: 'bastidor' },
  // «Ménsula 48.3x3.2mm & 32x2.5mm, 1 x 320mm W Tablón - 0.45M Q235, …» → 0,45
  { id: 'mensula', patron: `^MENSULA .* - ?${N} ?M(?: .*)?$`, familia: 'mensula', sistema: 'multi', largo: '$1' },
  // El collarín de arranque es el corto (0,33). El largo (0,48) y la «Grapa roseta (Roseta móvil)» no los pide el motor.
  { id: 'collarin', patron: String.raw`^COLLARIN CORTO(?: \(0\.33${M}\))?$`, familia: 'collarin', sistema: 'multi' },
  { id: 'esfera', patron: '^ESFERA DE SEGURIDAD$', familia: 'esfera', sistema: 'comun' },
  { id: 'madera_base', patron: '^MADERA BASE 10 ?X ?10 ?CM\\.?$', familia: 'accesorio', sistema: 'comun', variante: 'madera_base' },
  // Placa entera (1,22 × 2,44 = 2,9768 m²). La «Media Placa» y el «Scrap» no entran.
  { id: 'fenolico', patron: String.raw`^PLACA (?:DE )?FENOLICO 1\.22 ?X ?2\.44${M}$`, familia: 'fenolico', sistema: 'comun', rinde: 2.9768, unidad: 'placa' },
  { id: 'media_sombra', patron: String.raw`^MEDIA SOMBRA .*\(4 ?M ?X ?50 ?M\)$`, familia: 'media_sombra', sistema: 'comun', rinde: 200, unidad: 'rollo 4×50 m' },
  { id: 'concertina', patron: '^ALAMBRE CONCERTINA (?:DOBLE )?45 ?MM ?X ?10 ?M(?: .*)?$', familia: 'accesorio', sistema: 'comun', variante: 'concertina', rinde: 10, unidad: 'rollo 10 m' },
];

/** Caracteres que se cambian (o borran, si no tienen par) antes de pasar a mayúsculas. Igual que en SQL. */
export const TRANSLATE_DE = 'áéíóúüñÁÉÍÓÚÜÑøØΦφ';
export const TRANSLATE_A = 'aeiouunAEIOUUN';

/** Espejo exacto de la función SQL tec_normalizar_descripcion. */
export function normalizarDescripcion(d: string): string {
  let s = '';
  for (const ch of d) {
    const i = TRANSLATE_DE.indexOf(ch);
    if (i < 0) s += ch;
    else if (i < TRANSLATE_A.length) s += TRANSLATE_A[i];
  }
  s = s.toUpperCase().replace(/(\d),(\d)/g, '$1.$2').replace(/\s+/g, ' ');
  return s.trim();
}

const valor = (v: Valor | undefined, g: RegExpExecArray): number | null => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return v;
  const [, n, cm] = /^\$(\d+)(\/100)?$/.exec(v)!;
  const x = Number(g[Number(n)]);
  return cm ? x / 100 : x;
};

const sistemaDe = (s: Sistema, g: RegExpExecArray): SistemaPieza => {
  if (typeof s === 'string') return s;
  const x = Number(g[s.grupo]);
  for (const [vals, sis] of s.por) if (vals.some((v) => Math.abs(v - x) < 0.0005)) return sis;
  return s.resto;
};

export interface EntradaDescripcion extends EntradaInferida {
  regla: string;
  prioridad: number;
}

/** Qué entradas de mapa le corresponden a una descripción. [] si no sigue ninguna regla. */
export function mapeoPorDescripcion(descripcion: string): EntradaDescripcion[] {
  const d = normalizarDescripcion(descripcion);
  const out: EntradaDescripcion[] = [];
  for (const r of REGLAS_DESCRIPCION) {
    const g = new RegExp(r.patron).exec(d);
    if (!g) continue;
    out.push({
      regla: r.id, familia: r.familia, sistema: sistemaDe(r.sistema, g),
      largo: valor(r.largo, g), alto: valor(r.alto, g), ancho: valor(r.ancho, g), variante: r.variante ?? null,
      prioridad: r.prioridad ?? 100,
      ...(r.rinde ? { rinde: r.rinde } : {}), ...(r.unidad ? { unidad: r.unidad } : {}),
    });
  }
  return out;
}

/**
 * Composición SUPUESTA de los módulos de bastidor (la de la maqueta): 1 bastidor del mismo ancho y
 * alto + 2 riendas H + 2 riendas D del mismo largo. Espejo del INSERT en tec_kits de la migración.
 */
export function kitsPorMedidas(mapa: { familia: string; largo: number | null; alto: number | null; ancho: number | null; variante: string | null; codigo: string; prioridad: number }[]): Record<string, Record<string, number>> {
  const igual = (a: number | null, b: number | null) => a !== null && b !== null && Math.abs(a - b) < 0.0005;
  const mejor = (pred: (e: (typeof mapa)[number]) => boolean) =>
    mapa.filter(pred).sort((a, b) => a.prioridad - b.prioridad || a.codigo.localeCompare(b.codigo))[0]?.codigo;
  const kits: Record<string, Record<string, number>> = {};
  for (const m of mapa.filter((e) => e.familia === 'modulo_kit')) {
    const bast = mejor((e) => e.familia === 'bastidor' && igual(e.ancho, m.ancho) && igual(e.alto, m.alto) && e.variante === null);
    const rh = mejor((e) => e.familia === 'rienda_h' && igual(e.largo, m.largo));
    const rd = mejor((e) => e.familia === 'rienda_d' && igual(e.largo, m.largo));
    if (!bast || !rh || !rd) continue;
    kits[m.codigo] = { [bast]: 1, [rh]: 2, [rd]: 2 };
  }
  return kits;
}

// ───────────── generador del SQL de la migración ─────────────

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

function sqlValor(v: Valor | undefined): string {
  if (v === undefined || v === null) return 'NULL';
  if (typeof v === 'number') return String(v);
  const [, n, cm] = /^\$(\d+)(\/100)?$/.exec(v)!;
  return cm ? `g[${n}]::numeric / 100` : `g[${n}]::numeric`;
}

function sqlSistema(s: Sistema): string {
  if (typeof s === 'string') return q(s);
  const ramas = s.por.map(([vals, sis]) => `WHEN g[${s.grupo}]::numeric IN (${vals.join(', ')}) THEN ${q(sis)}`).join(' ');
  return `CASE ${ramas} ELSE ${q(s.resto)} END`;
}

/** El bloque de INSERTs de la migración 20261015000005, una sentencia por regla. */
export function sqlSemillaDescripcion(): string {
  return REGLAS_DESCRIPCION.map((r) => [
    `-- ${r.id}`,
    'INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)',
    `SELECT ${q(r.familia)}, ${sqlSistema(r.sistema)}, ${sqlValor(r.largo)}, ${sqlValor(r.alto)}, ${sqlValor(r.ancho)}, ${r.variante ? q(r.variante) : 'NULL'}, codigo, ${r.prioridad ?? 100}, ${r.rinde ?? 'NULL'}, ${r.unidad ? q(r.unidad) : 'NULL'}, 'semilla-descripcion'`,
    `FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), ${q(r.patron)}) AS g FROM catalogo_piezas) m`,
    'WHERE g IS NOT NULL',
    'ON CONFLICT DO NOTHING;',
  ].join('\n')).join('\n\n') + '\n';
}
