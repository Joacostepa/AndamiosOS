// Bandeja en voladizo (pedido 8b, foto 11): sin patas, postes anclados, vigas voladas y tornapuntas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../index.ts';
import { bomPlano, porFamilia } from '../test-utils.ts';
import { FAMILIAS_GOLDEN, golden, problemasDeArmado } from './nuevas-test-utils.ts';
import { normalizarBandejaVoladizo } from './bandeja-voladizo.ts';

const C = M.CATALOGO_FIXTURE;
const build = (d: M.Diseno) => M.construir(d, C);

test('voladizo: normalizar total (alto de poste a la grilla de rosetas)', () => {
  const r = normalizarBandejaVoladizo({ altoPoste: 1.8, vuelo: 99, cota: 0 } as never);
  assert.equal(r.params.altoPoste, 2);
  assert.equal(r.params.vuelo, 3);
  assert.ok(r.params.cota >= r.params.altoPoste + 0.5);
});

test('voladizo: golden, sin bases ni patas en la vereda, todo anclado', () => {
  const d = M.crearDiseno('bandeja_voladizo');
  const r = build(d);
  assert.deepEqual(golden(porFamilia(r), FAMILIAS_GOLDEN), { vertical: 5, horizontal: 8, diagonal: 2, viga_celosia: 5, anclaje: 5, cano: 45 });
  assert.deepEqual(problemasDeArmado(r), []);
  assert.equal(r.piezas.filter((p) => /base|rueda|collarin/.test(p.familia)).length, 0);
  // nada baja de la cota del pie de los postes
  const pie = 4.5 - 2;
  assert.ok(r.piezas.every((p) => Math.min(p.a[1], p.b[1]) >= pie - 1e-6));
  // amarre abajo (ANC) y anclaje estructural arriba (código propio) con su tracción PREDIMENSIONADO
  assert.equal(r.bom.filter((l) => l.codigo === 'ANC-VOL-PLACA').reduce((s, l) => s + l.cantidad, 0), 5);
  assert.match(r.avisos.find((a) => a.regla === 'voladizo.anclaje')!.texto, /kN de tracción.*PREDIMENSIONADO/);
  // arriostramiento en planta bajo la bandeja
  assert.ok(r.piezas.filter((p) => p.familia === 'cano' && /bvdp\d+$/.test(p.elemento || '')).length >= 2);
  // cada viga se dibuja con su largo de catálogo y su raíz en el poste (no entra en la fachada)
  for (const v of r.piezas.filter((p) => p.familia === 'viga_celosia')) {
    assert.ok(Math.abs(Math.hypot(v.b[0] - v.a[0], v.b[2] - v.a[2]) - v.medidas.largo!) < 0.002);
    assert.ok(Math.min(v.a[2], v.b[2]) >= 0.15 - 1e-6);
  }
  assert.deepEqual(bomPlano(build(M.convertirALibre(d, 'E1', C))), bomPlano(r));
});

test('voladizo: tornapuntas nodo a nodo desde el pie del poste; sin tornapuntas avisa y se repara', () => {
  const r = build(M.crearDiseno('bandeja_voladizo'));
  const postes = new Set(r.piezas.filter((p) => p.familia === 'vertical').map((p) => `${p.a[0]}|${p.a[1]}|${p.a[2]}`));
  const tp = r.piezas.filter((p) => p.familia === 'cano' && /:tp\d+$/.test(p.elemento || ''));
  assert.equal(tp.length, 5);
  assert.ok(tp.every((p) => postes.has(`${p.a[0]}|${p.a[1]}|${p.a[2]}`)), 'el pie de la tornapunta está en la roseta de abajo del poste');
  let d = M.crearDiseno('bandeja_voladizo', { params: { tornapuntas: false } });
  const av = build(d).avisos.find((a) => a.regla === 'voladizo.tornapunta')!;
  assert.ok(av);
  d = M.aplicarReparacion(d, av.reparaciones[0].accion, C);
  assert.ok(!build(d).avisos.some((a) => a.regla === 'voladizo.tornapunta'));
});

test('voladizo con ménsulas (vuelo ≤ 1,09) y medida libre', () => {
  const r = build(M.crearDiseno('bandeja_voladizo', { params: { vuelo: 1.09, largo: 6.2 }, medida: 'libre' }));
  assert.equal(r.piezas.filter((p) => p.familia === 'mensula').length, r.piezas.filter((p) => p.familia === 'vertical').length);
  assert.deepEqual(problemasDeArmado(r), []);
});
