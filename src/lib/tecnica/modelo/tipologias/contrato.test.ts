// Contrato del registro: corre para TODAS las tipologías registradas (también las nuevas de _nuevas.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../index.ts';
import { registrarTodas, type Tipologia } from './registro.ts';
import { bomPlano, coordenadasFinitas, diagonalesFueraDeNodo } from '../test-utils.ts';

const C = M.CATALOGO_FIXTURE;

test('registro: ids de tipología y de preset únicos; repetir uno tira en el arranque', () => {
  const ids = M.TIPOLOGIAS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  const presets = M.TIPOLOGIAS.flatMap((t) => t.presets.map((p) => p.id));
  assert.equal(new Set(presets).size, presets.length);
  assert.throws(() => registrarTodas([M.TIPOLOGIAS[0], M.TIPOLOGIAS[0]]), /repetida/);
  const copia = { ...M.TIPOLOGIAS[1], id: 'otra' } as Tipologia;
  assert.throws(() => registrarTodas([M.TIPOLOGIAS[1], copia]), /Preset repetido/);
  assert.equal(M.tipologia('fachada')!.id, 'fachada');
  assert.equal(M.tipologia('no-existe'), undefined);
});

test('galería: presets agrupados por categoría, con la estructura libre al final', () => {
  const g = M.presetsGaleria();
  assert.ok(g.length >= 4);
  assert.equal(g.at(-1)!.categoria, 'libre');
  for (const grupo of g) for (const p of grupo.presets) assert.equal(M.tipologia(p.tipologia)!.categoria, grupo.categoria);
});

for (const tip of M.TIPOLOGIAS) {
  test(`contrato «${tip.id}»: normalizar es total, campos y presets bien formados`, () => {
    for (const parcial of [{}, { altura: -5, largo: 'abc', frentes: null, ancho: 1e9 }, { altura: Number.NaN }]) {
      for (const s of tip.sistemas) {
        const r = tip.normalizar(parcial as never, s);
        assert.ok(r.params && typeof r.params === 'object');
        assert.ok(Array.isArray(r.avisos));
      }
    }
    assert.ok(tip.campos.every((c) => c.ruta.startsWith('params.') && c.etiqueta));
    assert.ok(tip.presets.length > 0);
    assert.ok(tip.version >= 1 && tip.nombre && tip.descripcion);
  });

  for (const p of tip.presets) {
    test(`contrato «${tip.id}/${p.id}»: construye, diagonales en nodos y «Convertir a libre» da la misma BOM`, () => {
      const d = M.crearDiseno(p.id);
      const r = M.construir(d, C);
      assert.ok(r.piezas.length > 0);
      assert.ok(coordenadasFinitas(r));
      assert.deepEqual(diagonalesFueraDeNodo(r), []);
      if (tip.id === 'libre') return;
      const libre = M.convertirALibre(d, 'E1', C);
      assert.equal(libre.estructuras[0].tipologia, 'libre');
      assert.equal(libre.estructuras[0].convertidaDe!.tipologia, tip.id);
      const rl = M.construir(libre, C);
      assert.deepEqual(bomPlano(rl), bomPlano(r));
      assert.ok(rl.avisos.some((a) => a.regla === 'libre.convertida'));
      assert.equal(rl.estructuras[0].regenerable, false);
    });
  }
}

test('convertir a libre: Paraná 631 con overrides y torre unida mantiene la BOM y los puertos', () => {
  let d = M.ejemploParana631();
  d = M.setOverride(d, 'E1', 'f0e3@N4', { mensula: 'afuera', lona: true });
  d = M.agregarEstructura(d, 'torre_escalera', { unirA: { estructuraId: 'E1', puerto: 'f0:ext', s: 5 } }).diseno;
  const r = M.construir(d, C);
  const l = M.convertirALibre(d, 'E1', C);
  const rl = M.construir(l, C);
  assert.deepEqual(bomPlano(rl), bomPlano(r));
  assert.deepEqual(rl.puertos.filter((p) => p.estructuraId === 'E1').map((p) => p.id), r.puertos.filter((p) => p.estructuraId === 'E1').map((p) => p.id));
  // y se puede seguir editando a mano
  const e = l.estructuras[0].esqueleto!;
  const v = e.vanos.find((x) => x.cara === 'exterior')!;
  const l2 = M.editarEsqueleto(l, 'E1', { op: 'agregarVano', desde: { vanoId: v.id }, hacia: 'afuera', medida: 0.73 });
  assert.ok(M.construir(l2, C).piezas.length > rl.piezas.length);
  // se puede deshacer: el diseño original sigue intacto
  assert.equal(d.estructuras[0].tipologia, 'fachada');
});
