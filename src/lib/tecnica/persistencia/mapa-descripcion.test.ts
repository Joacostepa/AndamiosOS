// Mapa por descripción: las reglas de mapa-descripcion.ts contra el catálogo REAL de producción
// (__fixtures__/catalogo-real.json: codigo + descripcion + categoria, sin ids ni pesos) y la
// migración 20261015000005, que es el SQL generado desde las mismas reglas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../modelo/index.ts';
import { catalogoDesdeFilas, type FilaMapa, type FilasCatalogo } from './catalogo.ts';
import {
  REGLAS_DESCRIPCION, TRANSLATE_A, TRANSLATE_DE, kitsPorMedidas, mapeoPorDescripcion, normalizarDescripcion, sqlSemillaDescripcion,
} from './mapa-descripcion.ts';

interface FilaReal { codigo: string; descripcion: string; categoria: string | null }
const REAL: FilaReal[] = JSON.parse(readFileSync(new URL('./__fixtures__/catalogo-real.json', import.meta.url), 'utf8'));
const MIGRACION = readFileSync(new URL('../../../../supabase/migrations/20261015000005_modelador_mapa_por_descripcion.sql', import.meta.url), 'utf8');

/** Lo que dejaría la migración en tec_pieza_mapa / tec_kits con el catálogo real. */
function filasReales(): FilasCatalogo {
  const mapa: FilaMapa[] = REAL.flatMap((p) => mapeoPorDescripcion(p.descripcion).map((e) => ({
    familia: e.familia, sistema: e.sistema, largo_m: e.largo, alto_m: e.alto, ancho_m: e.ancho, variante: e.variante,
    codigo: p.codigo, prioridad: e.prioridad, rinde: e.rinde ?? null, unidad_compra: e.unidad ?? null, activo: true,
  })));
  const kits = Object.entries(kitsPorMedidas(mapa.map((m) => ({ ...m, largo: m.largo_m as number | null, alto: m.alto_m as number | null, ancho: m.ancho_m as number | null, prioridad: m.prioridad ?? 100 }))))
    .flatMap(([kit, comp]) => Object.entries(comp).map(([pieza, cantidad]) => ({ kit_codigo: kit, pieza_codigo: pieza, cantidad })));
  return {
    piezas: REAL.map((p) => ({ id: `id-${p.codigo}`, codigo: p.codigo, descripcion: p.descripcion, categoria: p.categoria, peso_kg: null, activo: true })),
    stock: [], mapa, kits,
  };
}

test('la migración 20261015000005 es el SQL generado desde las reglas (y normaliza igual)', () => {
  assert.ok(MIGRACION.includes(sqlSemillaDescripcion()), 'regenerar el bloque «Reglas» de la migración con sqlSemillaDescripcion()');
  assert.ok(MIGRACION.includes(`translate(COALESCE(d, ''), '${TRANSLATE_DE}', '${TRANSLATE_A}')`), 'tec_normalizar_descripcion no traduce lo mismo que normalizarDescripcion');
  for (const r of REGLAS_DESCRIPCION) assert.doesNotMatch(r.patron, /\\b|\*\?|\+\?|\?\?|\(\?<[=!]/, `${r.id}: sintaxis que no es igual en JS y en Postgres`);
});

test('normalizar: acentos, ø, mayúsculas, coma decimal y espacios', () => {
  assert.equal(normalizarDescripcion('  Ménsula  1,22 x ø2,44 m.  CAÑO (BASE MÓVIL) '), 'MENSULA 1.22 X 2.44 M. CANO (BASE MOVIL)');
  assert.equal(normalizarDescripcion('HORIZONTAL Ø48.3 x 2.50 m'), 'HORIZONTAL 48.3 X 2.50 M');
});

test('catálogo real: códigos mapeados por familia', () => {
  const porFamilia: Record<string, number> = {};
  for (const p of REAL) for (const e of mapeoPorDescripcion(p.descripcion)) porFamilia[e.familia] = (porFamilia[e.familia] || 0) + 1;
  assert.deepEqual(porFamilia, {
    vertical: 10, horizontal: 6, baranda: 6, diagonal: 8, diagonal_planta: 1, tablon: 6, tablon_escotilla: 1, rodapie: 6,
    bastidor: 4, bastidor_baranda: 2, rienda_h: 2, rienda_d: 2, modulo_kit: 6, cano: 64, grampa_fija: 1, grampa_giratoria: 1,
    base_fija: 1, base_regulable: 2, rueda: 1, rueda_freno: 1, viga_celosia: 3, viga_puente: 2, zanca: 1,
    escalera_interior: 2, baranda_escalera: 2, mensula: 1, collarin: 1, esfera: 1, accesorio: 2, fenolico: 1, media_sombra: 1,
  });
});

test('catálogo real: medidas y sistema de piezas puntuales', () => {
  const { catalogo } = catalogoDesdeFilas(filasReales(), { inferir: false });
  const r = (f: M.Familia, m: M.Medidas, s: M.SistemaPieza = 'multi') => M.resolverCodigo(catalogo, f, m, s);
  assert.equal(r('vertical', { largo: 2, variante: 'CE' }), 'ODOO-128');
  assert.equal(r('vertical', { largo: 1, variante: 'SE' }), 'ODOO-125');
  assert.equal(r('horizontal', { largo: 2.5 }), 'ODOO-99');
  assert.equal(r('baranda', { largo: 0.73 }), 'ODOO-94');
  assert.equal(r('diagonal', { alto: 2, largo: 2.5 }), 'ODOO-92');
  assert.equal(r('diagonal', { alto: 1.5, largo: 2.5 }), 'ODOO-86');
  assert.equal(r('diagonal', { alto: 2, largo: 2 }), 'ODOO-91', 'el duplicado «DIAGONAL DE 2.00 X 2.00» pierde');
  assert.equal(r('diagonal_planta', { largo: 2.5, ancho: 2.5 }), 'ODOO-79');
  assert.equal(r('tablon', { largo: 2.5 }, 'bastidor'), 'ODOO-119', 'el tablón de 2,50 sirve a los dos sistemas');
  assert.equal(r('tablon', { largo: 0.73 }, 'bastidor'), null);
  assert.equal(r('rodapie', { largo: 1.3 }, 'bastidor'), 'ODOO-111');
  assert.equal(r('rodapie', { largo: 1.09 }), 'ODOO-109');
  assert.equal(r('bastidor', { ancho: 0.9, alto: 2.5 }, 'bastidor'), 'ODOO-11');
  assert.equal(r('bastidor_baranda', { ancho: 1.3, alto: 1 }, 'bastidor'), 'ODOO-8');
  assert.equal(r('rienda_d', { largo: 1.5 }, 'bastidor'), 'ODOO-106');
  assert.equal(r('modulo_kit', { ancho: 1.3, largo: 2.5, alto: 1.8 }, 'bastidor'), 'ODOO-138');
  assert.equal(r('cano', { largo: 6.4 }, 'comun'), 'ODOO-76');
  assert.equal(r('base_regulable', { variante: 'movil' }, 'comun'), 'ODOO-177');
  assert.equal(r('base_fija', {}, 'comun'), 'ODOO-175');
  assert.equal(r('zanca', { ancho: 1.5, largo: 2.5 }), 'ODOO-195');
  assert.equal(r('mensula', { largo: 0.45 }), 'ODOO-213');
  assert.equal(r('viga_puente', { largo: 1.5 }), 'ODOO-135');
  assert.equal(r('escalera_interior', {}, 'bastidor'), 'ODOO-81');
  assert.equal(r('fenolico', { largo: 3, ancho: 0.6 }, 'comun'), 'ODOO-183', 'por rinde');
  assert.equal(catalogo.piezas['ODOO-183'].rinde, 2.9768);
  assert.deepEqual(catalogo.kits['ODOO-138'], { 'ODOO-9': 1, 'ODOO-103': 2, 'ODOO-104': 2 });
  assert.deepEqual(catalogo.kits['ODOO-142'], { 'ODOO-9': 1, 'ODOO-105': 2, 'ODOO-106': 2 }, 'junior: riendas de 1,50');
});

test('catálogo real: lo que no es la pieza del motor no se mapea', () => {
  for (const d of [
    'TABLON METALICO 1.50 m 0.20', 'MODULO BARANDA DE ANDAMIO STD 1,30 X 2,50 X 1,80', 'CAÑO ESTRUCTURAL 50X20X2 MM S D. (TUBO)',
    'JUEGO DE RUEDAS DE ANDAMIO STANDARD (4 U)', 'RUEDA DE GRAN PORTE POR UNIDAD', 'Media Placa Fenólico 0,60 x 2,44 m.',
    'Puño con nudo giratorio Q235, M14x22mm HDG', 'COLLARIN LARGO (0.48 m)', 'Grapa roseta (Roseta móvil Coronet)',
    'VIGA MADERA H20 X 3M.', 'BARANDA TRIBUNA TRASERA 2.50 Mts. SUPERIOR', 'ESCALERA MARINERA 2 m.',
  ]) assert.deepEqual(mapeoPorDescripcion(d), [], d);
});

test('las descripciones del fixture del núcleo dan su mismo mapa (las reglas dicen lo mismo que las de código)', () => {
  const plaus = new Set(M.CODIGOS_PLAUSIBLES);
  const clave = (e: { familia: string; sistema: string; largo: number | null; alto: number | null; ancho: number | null; variante: string | null }) =>
    `${e.familia}|${e.sistema}|${e.largo ?? ''}|${e.alto ?? ''}|${e.ancho ?? ''}|${e.variante ?? ''}`;
  const porCodigo = new Map<string, string[]>();
  for (const e of M.CATALOGO_FIXTURE.mapa) porCodigo.set(e.codigo, [...(porCodigo.get(e.codigo) ?? []), clave(e)]);
  let n = 0;
  for (const [codigo, esperado] of porCodigo) {
    if (plaus.has(codigo)) continue;
    assert.deepEqual(mapeoPorDescripcion(M.CATALOGO_FIXTURE.piezas[codigo].descripcion).map(clave).sort(), [...esperado].sort(), codigo);
    n++;
  }
  assert.ok(n > 100, `comparé ${n}`);
});

/** Familias que el motor pide y que NO existen en el Odoo real: quedan «sin código» a propósito. */
const SIN_CODIGO_ESPERADO = new Set(['anclaje', 'recubrimiento', 'rodapie|1.5']);
const claveSin = (s: { familia: string; medidas: M.Medidas }) => (s.familia === 'rodapie' ? `rodapie|${s.medidas.largo}` : s.familia);

for (const [nombre, diseno] of [
  ['Paraná 631 (fachada L multidireccional)', () => M.ejemploParana631()],
  ['fachada de bastidores', () => M.crearDiseno('fachada_bastidor')],
] as const) {
  test(`catálogo real: ${nombre} resuelve todas las familias que existen en Odoo`, () => {
    const d = diseno();
    const { catalogo } = catalogoDesdeFilas(filasReales(), { inferir: false });
    const real = M.construir(d, catalogo);
    const fx = M.construir(d, M.CATALOGO_FIXTURE);
    const sin = real.resumen.sinCodigo.map(claveSin);
    assert.deepEqual(sin.filter((c) => !SIN_CODIGO_ESPERADO.has(c)), [], 'familias sin código que sí están en Odoo');
    // cada familia que usa el diseño (con el fixture) tiene al menos una pieza con código real
    const familias = new Set(fx.piezas.map((p) => p.familia));
    for (const f of familias) {
      if (f === 'anclaje' || f === 'recubrimiento') continue;
      assert.ok(real.piezas.some((p) => p.familia === f && p.codigo?.startsWith('ODOO-')), `${f} sin ningún código ODOO-`);
    }
    if (d.estructuras.some((e) => e.sistema === 'bastidor')) assert.ok(real.bom.some((l) => l.esKit && l.codigo?.startsWith('ODOO-')), 'cómputo por kit con el módulo real');
  });
}

test('sin tec_pieza_mapa, catalogoDesdeFilas infiere por descripción lo mismo que siembra la migración', () => {
  const filas = filasReales();
  const { catalogo: sembrado } = catalogoDesdeFilas(filas, { inferir: false });
  const { catalogo: inferido, avisos } = catalogoDesdeFilas({ ...filas, mapa: [] });
  assert.ok(avisos.some((a) => a.regla === 'catalogo.inferidas'));
  const d = M.ejemploParana631();
  const bom = (c: M.Catalogo) => Object.fromEntries(M.construir(d, c).bom.map((l) => [l.clave, l.cantidad]));
  assert.deepEqual(bom(inferido), bom(sembrado));
});
