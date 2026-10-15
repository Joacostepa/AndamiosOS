// Semillas de tec_pieza_mapa: las reglas por código reproducen el mapa del fixture del núcleo y
// están en la migración tal cual (si cambia una, el test avisa).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATALOGO_FIXTURE, CODIGOS_PLAUSIBLES } from '../modelo/index.ts';
import { CODIGOS_FIJOS_SEMILLA, PATRONES_SEMILLA, mapeoPorCodigo } from './semillas.ts';

const clave = (e: { familia: string; sistema: string; largo: number | null; alto: number | null; ancho: number | null; variante: string | null }) =>
  `${e.familia}|${e.sistema}|${e.largo ?? ''}|${e.alto ?? ''}|${e.ancho ?? ''}|${e.variante ?? ''}`;

test('las reglas por código dan exactamente el mapa del fixture para los códigos reales', () => {
  const plausibles = new Set(CODIGOS_PLAUSIBLES);
  const porCodigo = new Map<string, string[]>();
  for (const e of CATALOGO_FIXTURE.mapa) porCodigo.set(e.codigo, [...(porCodigo.get(e.codigo) ?? []), clave(e)]);
  let comparados = 0;
  for (const [codigo, esperado] of porCodigo) {
    if (plausibles.has(codigo)) continue;
    const got = mapeoPorCodigo(codigo).map(clave).sort();
    assert.deepEqual(got, [...esperado].sort(), codigo);
    comparados++;
  }
  assert.ok(comparados > 100, `comparé ${comparados} códigos`);
});

test('rinde y unidad de los códigos que se compran por superficie o largo', () => {
  for (const codigo of ['PLACA-FEN-122x244', 'MEDIA-SOMBRA-5', 'ALAMB-CONC-45x10']) {
    const [e] = mapeoPorCodigo(codigo);
    assert.equal(e.rinde, CATALOGO_FIXTURE.piezas[codigo].rinde, codigo);
    assert.equal(e.unidad, CATALOGO_FIXTURE.piezas[codigo].unidad, codigo);
  }
});

test('un código que no sigue la convención no se mapea (queda «sin código»)', () => {
  for (const c of ['CAÑO-EST-50x20x2', 'HOR-048-25', 'TAB-MET-150-020', 'MOD-BAR-STD-130x250x180', 'GUANTES-DESCARNE', 'VERT-200-XX']) {
    assert.deepEqual(mapeoPorCodigo(c), [], c);
  }
});

test('la migración 20261015000001 siembra con las mismas reglas', () => {
  const sql = readFileSync(new URL('../../../../supabase/migrations/20261015000001_modelador.sql', import.meta.url), 'utf8');
  for (const patron of PATRONES_SEMILLA) assert.ok(sql.includes(`'${patron}'`), `falta el patrón ${patron} en la migración`);
  for (const codigo of CODIGOS_FIJOS_SEMILLA) assert.ok(sql.includes(`'${codigo}'`), `falta ${codigo} en la migración`);
});
