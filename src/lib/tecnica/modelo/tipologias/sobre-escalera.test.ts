// Estructura sobre escalera y plataforma en hueco de escalera (pedido 8b, fotos 12 y 13).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../index.ts';
import { bomPlano, porFamilia } from '../test-utils.ts';
import { FAMILIAS_GOLDEN, golden, problemasDeArmado } from './nuevas-test-utils.ts';
import { normalizarSobreEscalera } from './sobre-escalera.ts';
import { normalizarHuecoEscalera } from './hueco-escalera.ts';
import { perfilDeEscalera, ySueloPerfil } from './nuevas-comunes.ts';

const C = M.CATALOGO_FIXTURE;
const build = (d: M.Diseno) => M.construir(d, C);

test('perfil de escalera: peldaños y descanso', () => {
  const p = perfilDeEscalera({ inicio: 1, huella: 0.3, contrahuella: 0.18, peldanos: 4, descansoTras: 2, descansoLargo: 1.2 });
  assert.equal(ySueloPerfil(p, 0.5), 0);
  assert.equal(ySueloPerfil(p, 1.05), 0.18);
  assert.equal(ySueloPerfil(p, 1.35), 0.36);
  assert.equal(ySueloPerfil(p, 2.4), 0.36, 'descanso');
  assert.equal(ySueloPerfil(p, 2.6), 0.54);
});

test('sobre escalera / hueco: normalizar total', () => {
  assert.doesNotThrow(() => normalizarSobreEscalera({ escalera: 'x', perfil: [{ s: 'a' }] } as never));
  const r = normalizarHuecoEscalera({ piso: 'vidrio', armado: 'x' } as never);
  assert.equal(r.params.piso, 'fenolico');
  assert.equal(r.params.armado, 'multi');
});

test('sobre escalera y hueco: golden, apoyos a distinto nivel, bien armados y misma BOM en libre', () => {
  const esperado: Record<string, Record<string, number>> = {
    sobre_escalera: { vertical: 10, horizontal: 31, diagonal: 6, tablon: 6, base_regulable: 6, cano: 4 },
    hueco_escalera: { vertical: 12, horizontal: 28, diagonal: 2, base_regulable: 6, cano: 4 },
  };
  for (const [id, g] of Object.entries(esperado)) {
    const d = M.crearDiseno(id);
    const r = build(d);
    assert.deepEqual(golden(porFamilia(r), FAMILIAS_GOLDEN), g, id);
    assert.deepEqual(problemasDeArmado(r), [], id);
    const esq = r.estructuras[0].esqueleto;
    assert.ok(new Set(esq.columnas.map((c) => c.yBase)).size > 1, `${id}: apoyos a distinto nivel`);
    for (const c of esq.columnas) {
      const ext = c.yBase - (c.ySuelo ?? 0);
      assert.ok(ext >= 0.25 - 1e-9 && ext <= 0.75 + 1e-9, `${id}: tornillón dentro de rango (${ext})`);
    }
    // todas las cotas de anillo caen en roseta de cada columna que llega
    for (const c of esq.columnas) for (const y of esq.cotas) if (y >= c.yBase && y <= c.yTope) assert.ok(Math.abs(((y - c.yBase) / 0.5) % 1) < 1e-6 || Math.abs(((y - c.yBase) / 0.5) % 1 - 1) < 1e-6, `${id}: ${c.id} @ ${y}`);
    assert.deepEqual(bomPlano(build(M.convertirALibre(d, 'E1', C))), bomPlano(r), id);
  }
  assert.ok(build(M.crearDiseno('hueco_escalera')).bom.some((l) => l.codigo === 'PLACA-FEN-122x244'));
});

test('sobre escalera: perfil editable a mano y regla de esbeltez con «Anclar al muro»', () => {
  let d = M.crearDiseno('sobre_escalera', { params: { perfil: [{ s: -10, y: 0 }, { s: 2, y: 0.9 }, { s: 4, y: 1.8 }] } });
  let r = build(d);
  const bases = r.estructuras[0].esqueleto.columnas.map((c) => c.ySuelo);
  assert.ok(bases.includes(0.9) && bases.includes(1.8));
  const av = r.avisos.find((a) => a.regla === 'esbeltez.hb')!;
  assert.ok(av);
  d = M.aplicarReparacion(d, av.reparaciones[0].accion, C);
  r = build(d);
  assert.ok(!r.avisos.some((a) => a.regla === 'esbeltez.hb'));
  assert.ok(r.piezas.some((p) => p.familia === 'anclaje'));
  assert.deepEqual(problemasDeArmado(r), []);
});

test('sobre escalera: sigue una escalera del contexto (volumen «escalera») y la plataforma baja avisa', () => {
  let d = M.crearDiseno('sobre_escalera');
  d.contexto.volumenes.push({ id: 'ESC', tipo: 'escalera', planta: [[0, 0], [6, 0], [6, 1.2], [0, 1.2]], yBase: 0, yTope: 3, escalera: { origen: [0, 0], rumbo: 0, peldanos: Array.from({ length: 15 }, (_, i) => ({ s: 0.5 + i * 0.3, huella: 0.3, contrahuella: 0.2 })), descansos: [] } });
  d = M.setParam(d, 'E1', 'params.volumenId', 'ESC');
  const r = build(d);
  assert.ok(new Set(r.estructuras[0].esqueleto.columnas.map((c) => c.ySuelo)).size >= 2);
  assert.deepEqual(problemasDeArmado(r), []);
  let d2 = M.crearDiseno('hueco_escalera', { params: { cota: 1.5, escalera: { inicio: 0, huella: 0.3, contrahuella: 0.2, peldanos: 12 } } });
  const av = build(d2).avisos.find((a) => a.regla === 'escalera.cota')!;
  assert.ok(av);
  d2 = M.aplicarReparacion(d2, av.reparaciones[0].accion, C);
  assert.ok(!build(d2).avisos.some((a) => a.regla === 'escalera.cota'));
});

test('hueco de escalera armado todo con caño y grampa (foto 13)', () => {
  const r = build(M.crearDiseno('hueco_escalera', { params: { armado: 'cano_grampa' } }));
  assert.equal(r.piezas.filter((p) => p.familia === 'horizontal' || p.familia === 'baranda').length, 0);
  assert.ok(r.piezas.filter((p) => p.familia === 'cano').length > 20);
  assert.ok(r.bom.some((l) => l.esAjuste));
});
