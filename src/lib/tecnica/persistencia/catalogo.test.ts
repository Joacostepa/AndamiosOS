// catalogoDesdeFilas: el catálogo armado desde las filas de la base se comporta como el del fixture,
// no inventa pesos ni códigos, y respeta lo que cargó Oficina Técnica en tec_pieza_mapa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../modelo/index.ts';
import { catalogoDesdeFilas, type FilaMapa, type FilaPieza, type FilasCatalogo, type FilaStock } from './catalogo.ts';

const FX = M.CATALOGO_FIXTURE;
const idDe = (codigo: string) => `id-${codigo}`;

/** Simula lo que devuelve la base a partir del fixture (pesos en string, como numeric). */
function filasDesdeFixture(opciones: { conMapa?: boolean; sinPlausibles?: boolean } = {}): FilasCatalogo {
  const plaus = new Set(M.CODIGOS_PLAUSIBLES);
  const items = Object.values(FX.piezas).filter((p) => !(opciones.sinPlausibles && plaus.has(p.codigo)));
  const piezas: FilaPieza[] = items.map((p) => ({
    id: idDe(p.codigo), codigo: p.codigo, descripcion: p.descripcion, categoria: 'otro',
    sistema_andamio: p.sistema === 'bastidor' ? 'tubular' : 'multidireccional',
    peso_kg: p.peso_kg === null ? null : String(p.peso_kg), unidad_medida: 'unidad', activo: true,
  }));
  const stock: FilaStock[] = items.filter((p) => p.stock).map((p) => ({ pieza_id: idDe(p.codigo), en_deposito: p.stock!.enDeposito, comprometido: p.stock!.comprometido }));
  const codigos = new Set(items.map((p) => p.codigo));
  const mapa: FilaMapa[] = opciones.conMapa === false ? [] : FX.mapa.filter((e) => codigos.has(e.codigo)).map((e) => ({
    familia: e.familia, sistema: e.sistema, largo_m: e.largo, alto_m: e.alto, ancho_m: e.ancho, variante: e.variante,
    codigo: e.codigo, prioridad: e.prioridad, rinde: FX.piezas[e.codigo]?.rinde ?? null, unidad_compra: FX.piezas[e.codigo]?.rinde ? FX.piezas[e.codigo].unidad : null, activo: true,
  }));
  const kits = Object.entries(FX.kits).flatMap(([kit, comp]) => Object.entries(comp).map(([pieza, cantidad]) => ({ kit_codigo: kit, pieza_codigo: pieza, cantidad: String(cantidad) })));
  return { piezas, stock, mapa, kits };
}

const bomPorCodigo = (bom: M.LineaBom[]) => Object.fromEntries(bom.map((l) => [l.clave, l.cantidad]));

test('con el mapa completo, la BOM y el peso del ejemplo Paraná 631 salen iguales que con el fixture', () => {
  const { catalogo } = catalogoDesdeFilas(filasDesdeFixture(), { inferir: false });
  assert.equal(catalogo.fuente, 'base');
  const d = M.ejemploParana631();
  const a = M.construir(d, FX);
  const b = M.construir(d, catalogo);
  assert.deepEqual(bomPorCodigo(b.bom), bomPorCodigo(a.bom));
  assert.equal(b.resumen.pesoKg, a.resumen.pesoKg);
  // y la línea trae el id real de catalogo_piezas (lo necesita computo_items)
  const hor = b.bom.find((l) => l.codigo === 'HOR-048-250');
  assert.equal(hor?.piezaId, idDe('HOR-048-250'));
});

test('con tec_pieza_mapa vacío, la convención del código reproduce el mapa (y lo avisa)', () => {
  const { catalogo, avisos } = catalogoDesdeFilas(filasDesdeFixture({ conMapa: false, sinPlausibles: true }));
  const { catalogo: conMapa } = catalogoDesdeFilas(filasDesdeFixture({ sinPlausibles: true }), { inferir: false });
  assert.ok(avisos.some((a) => a.regla === 'catalogo.inferidas'));
  const d = M.ejemploParana631();
  assert.deepEqual(bomPorCodigo(M.construir(d, catalogo).bom), bomPorCodigo(M.construir(d, conMapa).bom));
});

test('sin plausibles, lo que no existe en Odoo queda «sin código» (no se inventa)', () => {
  const { catalogo } = catalogoDesdeFilas(filasDesdeFixture({ sinPlausibles: true }), { inferir: false });
  assert.equal(M.resolverCodigo(catalogo, 'mensula', { largo: 0.73 }, 'multi'), null);
  assert.equal(M.resolverCodigo(catalogo, 'mensula', { largo: 0.45 }, 'multi'), 'MENSULA-045');
  assert.equal(M.resolverCodigo(catalogo, 'lona', {}, 'comun'), null);
});

test('pesos: tal cual, y null o 0 es «sin peso»', () => {
  const filas: FilasCatalogo = {
    piezas: [
      { id: 'a', codigo: 'HOR-048-250', descripcion: 'H 2,50', peso_kg: '9.20', activo: true },
      { id: 'b', codigo: 'DIAG-200x250', descripcion: 'D', peso_kg: null, activo: true },
      { id: 'c', codigo: 'TORN-600-FIJA', descripcion: 'T', peso_kg: 0, activo: true },
    ],
    stock: [], mapa: [], kits: [],
  };
  const { catalogo } = catalogoDesdeFilas(filas);
  assert.equal(catalogo.piezas['HOR-048-250'].peso_kg, 9.2);
  assert.equal(catalogo.piezas['DIAG-200x250'].peso_kg, null);
  assert.equal(catalogo.piezas['TORN-600-FIJA'].peso_kg, null);
  assert.equal(catalogo.piezas['HOR-048-250'].stock, null, 'sin fila de stock: sin dato, no cero');
});

test('manda tec_pieza_mapa: una fila inactiva bloquea la inferencia y la familia no sale de `categoria`', () => {
  const filas: FilasCatalogo = {
    piezas: [
      { id: 'r', codigo: 'RIEND-250-H', descripcion: 'Rienda', categoria: 'anclaje', peso_kg: 4.4, activo: true },
      { id: 'h', codigo: 'HOR-048-200', descripcion: 'H 2,00', peso_kg: 7.5, activo: true },
    ],
    stock: [],
    mapa: [{ familia: 'horizontal', sistema: 'multi', largo_m: '2.000', alto_m: null, ancho_m: null, variante: null, codigo: 'HOR-048-200', prioridad: 100, activo: false }],
    kits: [],
  };
  const { catalogo } = catalogoDesdeFilas(filas);
  assert.equal(catalogo.piezas['RIEND-250-H'].familia, 'rienda_h');
  assert.equal(M.resolverCodigo(catalogo, 'horizontal', { largo: 2 }, 'multi'), null, 'OT la desactivó');
});

test('una fila cargada por OT gana sobre la inferida para la misma medida', () => {
  const filas: FilasCatalogo = {
    piezas: [
      { id: '1', codigo: 'HOR-048-250', descripcion: 'H', peso_kg: 9, activo: true },
      { id: '2', codigo: 'HOR-ESPECIAL-250', descripcion: 'H especial', peso_kg: 9, activo: true },
    ],
    stock: [],
    mapa: [{ familia: 'horizontal', sistema: 'multi', largo_m: 2.5, alto_m: null, ancho_m: null, variante: null, codigo: 'HOR-ESPECIAL-250', prioridad: 100, activo: true }],
    kits: [],
  };
  const { catalogo } = catalogoDesdeFilas(filas);
  assert.equal(M.resolverCodigo(catalogo, 'horizontal', { largo: 2.5 }, 'multi'), 'HOR-ESPECIAL-250');
});

test('medidas: los vanos salen de las horizontales con código; sin ninguna, los default con aviso', () => {
  const { catalogo } = catalogoDesdeFilas(filasDesdeFixture({ sinPlausibles: true }), { inferir: false });
  assert.deepEqual(catalogo.medidas.multi.vanos, [2.5, 2, 1.5, 1.25, 1.09, 0.73]);
  assert.deepEqual(catalogo.medidas.multi.profundidades, [0.73, 1.09, 1.25]);
  assert.ok(catalogo.medidas.multi.mensulas.includes(1.09), 'las ménsulas sin código se pueden dibujar igual');
  assert.equal(catalogo.medidas.canos[0], 0.1);
  const vacio = catalogoDesdeFilas({ piezas: [], stock: [], mapa: [], kits: [] });
  assert.deepEqual(vacio.catalogo.medidas.multi.vanos, M.medidasPorDefecto().multi.vanos);
  assert.ok(vacio.avisos.some((a) => a.regla === 'catalogo.sin_horizontales'));
});

test('kits: solo con códigos que existen', () => {
  const filas = filasDesdeFixture();
  filas.kits.push({ kit_codigo: 'MOD-NO-EXISTE', pieza_codigo: 'BAST-AND-130x180', cantidad: 1 });
  const { catalogo } = catalogoDesdeFilas(filas, { inferir: false });
  assert.equal(catalogo.kits['MOD-NO-EXISTE'], undefined);
  assert.deepEqual(catalogo.kits['MOD-AND-STD-130x250x180'], FX.kits['MOD-AND-STD-130x250x180']);
});
