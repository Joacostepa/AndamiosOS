// Validación de los bodies de /api/tecnica/modelador/** y del diseño entrante.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../modelo/index.ts';
import { crearSchema, esPng, generarSchema, patchSchema, plantillaSchema, validarDisenoEntrante } from './validar.ts';

const UUID = '6f1c2a34-1b2c-4d5e-8f90-0123456789ab';

test('patch: guardar el diseño exige la revisión que se leyó', () => {
  assert.equal(patchSchema.safeParse({ diseno: {} }).success, false);
  assert.equal(patchSchema.safeParse({ diseno: {}, revision: 3 }).success, true);
  assert.equal(patchSchema.safeParse({ nombre: 'Fachada' }).success, true, 'renombrar no pide revisión');
  assert.equal(patchSchema.safeParse({ revision: 3 }).success, false, 'nada para guardar');
  assert.equal(patchSchema.safeParse({ obra_id: 'no-es-uuid' }).success, false);
  assert.equal(patchSchema.safeParse({ obra_id: null }).success, true, 'desvincular de la obra');
});

test('crear: con diseño o desde una plantilla', () => {
  assert.equal(crearSchema.safeParse({ nombre: 'X', diseno: {} }).success, true);
  assert.equal(crearSchema.safeParse({ desdePlantilla: UUID, obra_id: UUID }).success, true);
  assert.equal(crearSchema.safeParse({ nombre: '   ', diseno: {} }).success, false);
  assert.equal(crearSchema.safeParse({ nombre: 'x'.repeat(121), diseno: {} }).success, false);
});

test('plantilla y generar', () => {
  assert.equal(plantillaSchema.safeParse({ nombre: 'Bandeja 45', categoria: 'bandeja' }).success, true);
  assert.equal(plantillaSchema.safeParse({ nombre: 'Bandeja 45', categoria: 'otra' }).success, false);
  const g = generarSchema.parse({ obra_id: UUID, revision: 2 });
  assert.deepEqual(g.decisiones, {});
  assert.equal(g.aceptoOmitidas, false);
  assert.equal(generarSchema.safeParse({ obra_id: UUID, revision: 2, decisiones: { [UUID]: 'pisar' } }).success, false);
});

test('validarDisenoEntrante: un diseño del núcleo pasa; basura y tamaños enormes no', () => {
  const ok = validarDisenoEntrante(JSON.parse(JSON.stringify(M.ejemploParana631())));
  assert.equal(ok.ok, true);
  assert.equal(validarDisenoEntrante('hola').ok, false);
  assert.equal(validarDisenoEntrante(null).ok, false);
  const grande = { ...M.ejemploParana631(), nombre: 'x'.repeat(2_100_000) };
  const r = validarDisenoEntrante(grande);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /2 MB/);
});

test('esPng mira la firma, no el Content-Type', () => {
  assert.equal(esPng(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])), true);
  assert.equal(esPng(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0])), false);
});
