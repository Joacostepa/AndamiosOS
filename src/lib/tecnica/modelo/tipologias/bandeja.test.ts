// Bandeja de protección (pedido 2): visera 90°/45°, ménsulas o vigas en voladizo, fenólico + lona.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../index.ts';
import { bomPlano, porFamilia } from '../test-utils.ts';
import { FAMILIAS_GOLDEN, golden, problemasDeArmado } from './nuevas-test-utils.ts';
import { normalizarBandeja } from './bandeja.ts';

const C = M.CATALOGO_FIXTURE;
const build = (d: M.Diseno) => M.construir(d, C);

test('bandeja: normalizar con params vacíos o absurdos no tira y avisa', () => {
  assert.doesNotThrow(() => normalizarBandeja({}));
  const r = normalizarBandeja({ ancho: 1e9, cota: -4, visera: { tipo: 'rara', alto: Number.NaN } } as never);
  assert.equal(r.params.ancho, 3);
  assert.equal(r.params.cota, 2);
  assert.equal(r.params.visera.tipo, '45');
  assert.ok(r.avisos.length >= 2);
});

test('bandeja: golden por preset, bien armada y «Convertir a libre» da la misma BOM', () => {
  const esperado: Record<string, Record<string, number>> = {
    bandeja_45: { vertical: 20, horizontal: 43, diagonal: 4, tablon: 8, mensula: 5, base_regulable: 10, anclaje: 7, cano: 25 },
    bandeja_90: { vertical: 20, horizontal: 43, diagonal: 4, tablon: 8, mensula: 5, base_regulable: 10, anclaje: 7, cano: 25 },
    bandeja_amplia: { vertical: 30, horizontal: 43, diagonal: 6, tablon: 8, viga_celosia: 5, base_regulable: 10, anclaje: 7, cano: 36 },
  };
  for (const [id, g] of Object.entries(esperado)) {
    const d = M.crearDiseno(id);
    const r = build(d);
    assert.deepEqual(golden(porFamilia(r), FAMILIAS_GOLDEN), g, id);
    assert.deepEqual(problemasDeArmado(r), [], id);
    assert.deepEqual(r.resumen.sinCodigo, [], id);
    assert.deepEqual(bomPlano(build(M.convertirALibre(d, 'E1', C))), bomPlano(r), id);
  }
});

test('bandeja: visera vertical a 90° y a 45°, con lona y fenólico', () => {
  const v90 = build(M.crearDiseno('bandeja_90')).piezas.filter((p) => p.elemento?.startsWith('bpv') || p.elemento?.includes(':mont'));
  const mont90 = v90.filter((p) => p.familia === 'cano' && p.elemento!.includes(':mont') && !p.elemento!.includes(':g'));
  assert.ok(mont90.length === 5 && mont90.every((p) => Math.abs(p.a[0] - p.b[0]) < 1e-6 && Math.abs(p.a[2] - p.b[2]) < 1e-6), 'montantes verticales');
  const r45 = build(M.crearDiseno('bandeja_45'));
  const mont45 = r45.piezas.filter((p) => p.familia === 'cano' && p.elemento?.includes(':mont') && !p.elemento.includes(':g'));
  assert.ok(mont45.every((p) => Math.abs(Math.abs(p.b[1] - p.a[1]) - Math.hypot(p.b[0] - p.a[0], p.b[2] - p.a[2])) < 0.002), 'montantes a 45°');
  assert.ok(r45.bom.some((l) => l.codigo === 'LONA-PVC' && (l.medida || 0) > 10));
  assert.ok(r45.bom.some((l) => l.codigo === 'PLACA-FEN-122x244'));
  // las ménsulas arrancan en un nodo de la cara exterior (columna × cota de la bandeja)
  const cols = new Set(r45.piezas.filter((p) => p.familia === 'vertical').map((p) => `${p.a[0]}|${p.a[2]}`));
  assert.ok(r45.piezas.filter((p) => p.familia === 'mensula').every((p) => cols.has(`${p.a[0]}|${p.a[2]}`)));
});

test('bandeja amplia: vigas de celosía voladas con tornapunta a 45° desde el anillo de abajo', () => {
  const r = build(M.crearDiseno('bandeja_amplia'));
  const vigas = r.piezas.filter((p) => p.familia === 'viga_celosia');
  assert.equal(vigas.length, 5);
  assert.ok(vigas.every((p) => p.codigo === 'VIGA-CEL-250'));
  assert.equal(r.piezas.filter((p) => p.elemento?.includes(':tp') && p.familia === 'cano').length, 5);
});

test('bandeja: regla propia «ménsula corta» y «vuelco» con reparación de un clic', () => {
  let d = M.crearDiseno('bandeja', { params: { ancho: 2, soporte: 'mensula' } });
  let r = build(d);
  const av = r.avisos.find((a) => a.regla === 'bandeja.mensula_corta')!;
  assert.ok(av && av.nivel === 'error');
  d = M.aplicarReparacion(d, av.reparaciones[0].accion, C);
  r = build(d);
  assert.ok(!r.avisos.some((a) => a.regla === 'bandeja.mensula_corta'));
  assert.ok(r.piezas.some((p) => p.familia === 'viga_celosia'));
  let d2 = M.crearDiseno('bandeja', { params: { anclada: false, ancho: 1.09 } });
  const vuelco = build(d2).avisos.find((a) => a.regla === 'bandeja.vuelco')!;
  assert.ok(vuelco);
  d2 = M.aplicarReparacion(d2, vuelco.reparaciones[0].accion, C);
  assert.ok(!build(d2).avisos.some((a) => a.regla === 'bandeja.vuelco'));
});

test('bandeja: medida libre (7,30 de largo) cierra exacto con caño y grampa y sigue bien armada', () => {
  const d = M.crearDiseno('bandeja_45', { params: { largo: 7.3 }, medida: 'libre' });
  const r = build(d);
  assert.deepEqual(problemasDeArmado(r), []);
  const xs = r.piezas.filter((p) => p.familia === 'vertical').map((p) => p.a[0]);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 7.3) < 0.006);
  assert.ok(r.bom.some((l) => l.esAjuste));
});

test('bandeja amplia: cada viga de celosía tiene la raíz sobre una vertical y se toma de las dos', () => {
  const r = build(M.crearDiseno('bandeja_amplia'));
  const verts = r.piezas.filter((p) => p.familia === 'vertical');
  const vigas = r.piezas.filter((p) => p.familia === 'viga_celosia');
  assert.equal(vigas.length, 5);
  for (const v of vigas) {
    const raiz = v.a[2] < v.b[2] ? v.a : v.b;
    // la raíz está en la vertical interior (t = 0) o detrás, hacia la fachada, sin pasar el retiro
    assert.ok(raiz[2] <= 1e-6 && raiz[2] >= -0.2, `raíz en t=${raiz[2]}`);
    assert.ok(verts.some((p) => Math.abs(p.a[0] - v.a[0]) < 1e-6 && Math.abs(p.a[2]) < 1e-6), 'hay vertical interior en ese s');
    assert.ok(Math.abs(Math.hypot(v.b[0] - v.a[0], v.b[2] - v.a[2]) - v.medidas.largo!) < 0.002, 'dibujada con su largo de catálogo');
    const g = r.piezas.filter((p) => p.familia === 'grampa_fija' && p.elemento?.startsWith(`${v.elemento}:g`));
    assert.equal(g.length, 4, '2 verticales × 2 cordones');
  }
  // pedir 2,00 (no entra con viga de catálogo): avisa el vuelo real con reparación
  const r2 = build(M.crearDiseno('bandeja_amplia', { params: { ancho: 2 } }));
  assert.ok(r2.avisos.some((a) => a.regla === 'bandeja.viga_largo' && a.reparaciones.length));
});
