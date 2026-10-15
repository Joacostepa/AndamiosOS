// Diseño: migración de la maqueta, validación, plantillas propias y unión embebida.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from './index.ts';

const C = M.CATALOGO_FIXTURE;

// Diseño guardado por la maqueta (esquema 1): celdas "f:v:n", plantilla y apoyaEn.
const MAQUETA = {
  version: 1, nombre: 'Maqueta vieja', obra: { nombre: 'Paraná 631' },
  contexto: { terreno: 'cemento', enVereda: true, claseCarga: 3 },
  estructuras: [
    { id: 'E1', plantilla: 'estructura_pantalla', tipo: 'fachada', nombre: 'Fachada L', sistema: 'multi', origen: [0, 0], rumbo: 0, apoyaEn: [],
      params: { frentes: [{ largo: 14 }, { largo: 8, angulo: 90 }], altura: 18, profundidad: 0.73, retiro: 0.2, niveles: 'arriba', modoPlataforma: 'cada_2m', bandejaPB: true, cubierta: 'media_sombra', viaPublica: true, concertina: false, anclada: true, accesos: 'auto', esquinas: ['vertical_compartida'], mensulas: [], brazoMensula: 0.73, ajuste: 'final', cuerpo: 'STD', terreno: 'cemento', pataDeGallo: false },
      overrides: { '0:1:0': { abertura: true }, '0:2:0': { abertura: true }, '0:1:1': { abertura: true }, '0:2:1': { abertura: true } } },
  ],
  uniones: [], modoBom: 'kit',
};

test('migrarDiseno: un JSON de la maqueta (esquema 1) abre y construye igual', () => {
  const d = M.migrarDiseno(MAQUETA);
  assert.equal(d.esquema, M.ESQUEMA_DISENO);
  assert.equal(d.estructuras[0].tipologia, 'fachada');
  assert.equal(d.estructuras[0].preset, 'estructura_pantalla');
  assert.deepEqual(Object.keys(d.estructuras[0].overrides).sort(), ['f0e1@N0', 'f0e1@N1', 'f0e2@N0', 'f0e2@N1']);
  const r = M.construir(d, C);
  assert.equal(r.piezas.filter((p) => p.familia === 'viga_celosia').length, 2);
  assert.equal(d.obra, null, 'la obra de la maqueta no tenía id');
});

test('validarDiseno: acepta un diseño bueno y explica los errores', () => {
  const ok = M.validarDiseno(M.ejemploParana631());
  assert.equal(ok.ok, true);
  const mal = M.validarDiseno({ esquema: 2, estructuras: [{ id: 'E1', tipologia: 'xx', sistema: 'otro', origen: [0], rumbo: 'a', params: null }], uniones: [{ id: 'U1', a: { estructuraId: 'E9' }, b: { estructuraId: 'E1' } }], modoBom: 'kit' });
  assert.equal(mal.ok, false);
  if (!mal.ok) {
    assert.ok(mal.errores.some((e) => /tipología desconocida/.test(e)));
    assert.ok(mal.errores.some((e) => /Unión U1/.test(e)));
  }
  assert.equal(M.validarDiseno(null).ok, false);
});

test('plantillas propias: instanciar renumera ids, limpia la obra y mueve el origen', () => {
  let d = M.ejemploParana631();
  d = M.agregarEstructura(d, 'torre_escalera', { unirA: { estructuraId: 'E1', puerto: 'f1:ext', s: 2.5 } }).diseno;
  d.obra = { id: 'o1', codigo: 'S01234', nombre: 'Obra' };
  const n = M.instanciarPlantilla(d, { origen: [10, 5], nombre: 'Copia' });
  assert.equal(n.obra, null);
  assert.deepEqual(n.estructuras.map((e) => e.id), ['E1', 'E2']);
  assert.deepEqual(n.estructuras[0].origen, [10, 5]);
  assert.equal(n.uniones[0].id, 'U1');
  assert.equal(n.nombre, 'Copia');
  const r0 = M.construir(d, C);
  const r1 = M.construir(n, C);
  assert.equal(r1.resumen.piezas, r0.resumen.piezas, 'misma BOM movida');
});

test('torre embebida en la fachada: comparte verticales y la fachada pierde plataformas en su huella', () => {
  const d0 = M.crearDiseno('estructura', { frentes: [{ largo: 12.5 }], altura: 10 });
  const r0 = M.construir(d0, C);
  const { diseno } = M.agregarEstructura(d0, 'torre_acceso', { params: { ancho: 0.73 }, unirA: { estructuraId: 'E1', puerto: 'f0:ext', s: 5, modo: 'embebida' } });
  const u = diseno.uniones[0];
  assert.equal(u.modo, 'embebida');
  assert.equal(u.a.puerto, 'f0:base');
  const r = M.construir(diseno, C);
  const ue = r.uniones.find((x) => x.id === u.id)!;
  assert.ok(ue.compartidas >= 2, `comparte ${ue.compartidas}`);
  assert.match(r.reglas.map((x) => x.texto).join('\n'), /embebida en/);
  const tabE1 = (x: M.Resultado) => x.piezas.filter((p) => p.estructuraId === 'E1' && p.familia === 'tablon').length;
  assert.ok(tabE1(r) < tabE1(r0));
});

test('agregarEstructura acepta tipología o preset; crearDiseno es puro', () => {
  const d = M.crearDiseno('fachada', { preset: 'pantalla' });
  assert.equal(d.estructuras[0].preset, 'pantalla');
  const { diseno, estructuraId } = M.agregarEstructura(d, 'torre', { preset: 'torre_acceso' });
  assert.equal(estructuraId, 'E2');
  assert.equal(diseno.estructuras[1].params.acceso, 'interna');
  assert.equal(d.estructuras.length, 1);
  assert.throws(() => M.crearDiseno('nada'), /desconocido/);
});
