// Mover volúmenes (arrastre en el 3D estilo SketchUp y en la planta): definición, salientes, plantillas,
// inferencia de ejes, encastre y textos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../index.ts';
import type { Diseno, DefVolumen, V2 } from '../index.ts';

const C = M.CATALOGO_FIXTURE;
const vacio = (): Diseno => {
  const d = M.crearDiseno('libre_vacia');
  d.estructuras = [];
  return d;
};
const conVolumen = (def: DefVolumen, nombre = 'Edificio') => M.agregarVolumen(vacio(), def, { nombre }).diseno;
const caja: DefVolumen = { tipo: 'caja', origen: [0, 0], rumbo: 0, largo: 12, ancho: 8, alto: 11 };
const def = (d: Diseno, id: string) => (d.contexto.volumenes.find((v) => v.id === id) as M.VolumenModelado).def;
const cerca = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const corrido = (antes: V2[], despues: V2[], dx: number, dz: number) => antes.length === despues.length && antes.every((q, i) => cerca(despues[i][0], q[0] + dx) && cerca(despues[i][1], q[1] + dz));

test('caja con patio: se mueve el origen y el patio va con ella; un solo cambio, sin tocar el resto', () => {
  const d0 = conVolumen({ ...caja, huecos: [{ nombre: 'Patio', planta: [[4, 3], [9, 3], [9, 7], [4, 7]] }] } as DefVolumen);
  const r = M.moverVolumen(d0, 'V1', [3.2, 0, -1]);
  assert.deepEqual(r.delta, [3.2, 0, -1]);
  assert.deepEqual(r.movidos, ['V1']);
  const dv = def(r.diseno, 'V1') as Extract<DefVolumen, { tipo: 'caja' }>;
  assert.deepEqual(dv.origen, [3.2, -1]);
  assert.equal(dv.yBase, undefined, 'sin vertical no aparece la base');
  assert.ok(corrido(def(d0, 'V1').tipo === 'caja' ? (def(d0, 'V1') as { huecos: { planta: V2[] }[] }).huecos[0].planta : [], dv.huecos![0].planta, 3.2, -1), 'el patio se movió');
  assert.ok(corrido(d0.contexto.volumenes[0].planta, r.diseno.contexto.volumenes[0].planta, 3.2, -1));
  assert.equal(d0.contexto.volumenes[0].planta[0][0], 0, 'el original queda igual');
});

test('el saliente sigue al edificio en planta y en altura', () => {
  let d = conVolumen(caja);
  d = M.agregarVolumen(d, { tipo: 'saliente', padre: 'V1', lado: 0, desde: 0, largo: 12, vuelo: 0.4, yBase: 10.5, espesor: 0.3, clase: 'cornisa', repetir: { cada: 3, hasta: 10.5 } }, { nombre: 'Cornisa' }).diseno;
  const antes = d.contexto.volumenes[1].planta;
  const r = M.moverVolumen(d, 'V1', [5, 2, 0]);
  assert.deepEqual(r.movidos, ['V1', 'V2']);
  assert.ok(corrido(antes, r.diseno.contexto.volumenes[1].planta, 5, 0), 'la cornisa se movió con el edificio');
  const s = def(r.diseno, 'V2') as Extract<DefVolumen, { tipo: 'saliente' }>;
  assert.equal(s.yBase, 12.5);
  assert.equal(s.repetir!.hasta, 12.5);
  assert.equal(r.diseno.contexto.volumenes[0].yTope, 13);
  assert.equal(M.nombreMovimiento('Edificio', r.delta), 'Edificio: mover 5,39 m');
});

test('escalonado: conserva tramos y base; no sube (el formulario lo mide desde el piso)', () => {
  const d0 = conVolumen({ tipo: 'escalonado', planta: [[0, 0], [10, 0], [10, 8], [0, 8]], tramos: [{ hasta: 9, retiro: 0 }, { hasta: 15, retiro: [3, 0, 0, 0] }] });
  const m = M.movilidadDe(d0, 'V1')!;
  assert.equal(m.vertical, false);
  assert.match(m.motivoVertical!, /escalonado/);
  const r = M.moverVolumen(d0, 'V1', [1, 4, 2]);
  assert.deepEqual(r.delta, [1, 0, 2], 'la altura se descarta');
  const dv = def(r.diseno, 'V1') as Extract<DefVolumen, { tipo: 'escalonado' }>;
  assert.deepEqual(dv.tramos, (def(d0, 'V1') as Extract<DefVolumen, { tipo: 'escalonado' }>).tramos);
  assert.equal(dv.yBase, undefined);
  assert.deepEqual(dv.planta[0], [1, 2]);
});

test('cilindro: se mueve el centro y no cambia la cantidad de lados; sube con su cúpula', () => {
  const d0 = conVolumen({ tipo: 'cilindro', centro: [0, 0], radio: 3, alto: 8, lados: 16, cupula: { alto: 2 } }, 'Tanque');
  const r = M.moverVolumen(d0, 'V1', [-2, 1.5, 4]);
  const dv = def(r.diseno, 'V1') as Extract<DefVolumen, { tipo: 'cilindro' }>;
  assert.deepEqual(dv.centro, [-2, 4]);
  assert.equal(dv.lados, 16);
  assert.equal(dv.yBase, 1.5);
  assert.equal(r.diseno.contexto.volumenes[0].yTope, 11.5);
  assert.equal(M.nombreMovimiento('Tanque', [0, 1.5, 0]), 'Tanque: subir 1,50 m');
  assert.equal(M.nombreMovimiento('Tanque', [0, -0.5, 0]), 'Tanque: bajar 0,50 m');
});

test('prisma: se mueven todos los puntos; los ejes propios salen del lado más largo', () => {
  const planta: V2[] = [[0, 0], [14, 0], [14, 6], [8, 6], [8, 12], [0, 12]];
  const d0 = conVolumen({ tipo: 'prisma', planta, alto: 9 }, 'L');
  const r = M.moverVolumen(d0, 'V1', [0.5, 0, 0.25]);
  assert.ok(corrido(planta, (def(r.diseno, 'V1') as { planta: V2[] }).planta, 0.5, 0.25));
  const m = M.movilidadDe(d0, 'V1')!;
  assert.deepEqual(m.ejes.map((e) => e.eje), ['rojo', 'verde'], 'alineado al mundo: sin x ni z aparte');
  const girado = conVolumen({ ...caja, rumbo: 30 } as DefVolumen);
  assert.deepEqual(M.movilidadDe(girado, 'V1')!.ejes.map((e) => e.eje), ['rojo', 'verde', 'x', 'z']);
});

test('saliente solo: se desliza sobre su lado y no se sale de él', () => {
  let d = conVolumen(caja);
  d = M.agregarVolumen(d, { tipo: 'saliente', padre: 'V1', lado: 0, desde: 2, largo: 6, vuelo: 1.2, yBase: 3, espesor: 0.25, clase: 'marquesina' }, { nombre: 'Marquesina' }).diseno;
  const m = M.movilidadDe(d, 'V2')!;
  assert.equal(m.libre, false);
  assert.deepEqual(m.ids, ['V2']);
  // lo que se arrastra hacia afuera (z) se descarta; a lo largo se corre
  let r = M.moverVolumen(d, 'V2', [1.5, 0, -3]);
  assert.deepEqual(r.delta, [1.5, 0, 0]);
  assert.equal((def(r.diseno, 'V2') as { desde: number }).desde, 3.5);
  assert.deepEqual(r.diseno.contexto.volumenes[0].planta, d.contexto.volumenes[0].planta, 'el padre no se mueve');
  // tope: el lado mide 12 y el saliente 6 → desde ≤ 6
  r = M.moverVolumen(d, 'V2', [50, 0, 0]);
  assert.equal((def(r.diseno, 'V2') as { desde: number }).desde, 6);
  r = M.moverVolumen(d, 'V2', [-50, 1, 0]);
  assert.equal((def(r.diseno, 'V2') as { desde: number }).desde, 0);
  assert.equal((def(r.diseno, 'V2') as { yBase: number }).yBase, 4);
});

test('escalera de una plantilla: se mueve con su perfil y la estructura queda donde estaba', () => {
  const d0 = M.crearDiseno('sobre_escalera', { catalogo: C });
  const r0 = M.construir(d0, C);
  const d = M.vincularVolumenSugerido(d0, 'E1', ['escalera'], r0.estructuras[0].huella);
  const id = d.estructuras[0].params.volumenId as string;
  const v0 = d.contexto.volumenes.find((v) => v.id === id)!;
  const m = M.movilidadDe(d, id)!;
  assert.equal(m.vertical, false, 'la usa la estructura: no sube');
  assert.match(m.motivoVertical!, /Lo usa/);
  const r = M.moverVolumen(d, id, [2, 3, -1]);
  assert.deepEqual(r.delta, [2, 0, -1]);
  const v = r.diseno.contexto.volumenes.find((x) => x.id === id)!;
  assert.ok(corrido(v0.planta, v.planta, 2, -1));
  assert.deepEqual(v.escalera!.origen, [v0.escalera!.origen[0] + 2, v0.escalera!.origen[1] - 1]);
  assert.equal(v.yBase, v0.yBase);
  assert.deepEqual(r.diseno.estructuras, d.estructuras, 'las estructuras no se tocan');
  assert.doesNotThrow(() => M.construir(r.diseno, C));
});

test('patio suelto (sin definición) y azotea: se traslada la planta; sin movimiento no cambia nada', () => {
  const d = vacio();
  (d.contexto.volumenes as (M.Volumen & { hueco?: boolean })[]).push({ id: 'P', tipo: 'edificio', planta: [[0, 0], [5, 0], [5, 4], [0, 4]], yBase: 0, yTope: 9, hueco: true });
  const r = M.moverVolumen(d, 'P', [1, 0.5, 1]);
  const v = r.diseno.contexto.volumenes[0] as M.Volumen & { hueco?: boolean };
  assert.ok(corrido(d.contexto.volumenes[0].planta, v.planta, 1, 1));
  assert.equal(v.hueco, true);
  assert.equal(v.yTope, 9.5);
  const nada = M.moverVolumen(d, 'P', [0, 0, 0]);
  assert.equal(nada.diseno, d);
  assert.deepEqual(nada.movidos, []);
  assert.deepEqual(M.moverVolumen(d, 'NO', [1, 0, 0]).movidos, []);
});

test('inferencia: a 3° del eje se engancha; a 20° no; la proyección queda sobre el eje', () => {
  const ejes = M.movilidadDe(conVolumen(caja), 'V1')!.ejes;
  const a = (g: number): V2 => [Math.cos((g * Math.PI) / 180) * 4, Math.sin((g * Math.PI) / 180) * 4];
  assert.equal(M.inferirEje(a(3), ejes)?.eje, 'rojo');
  assert.equal(M.inferirEje(a(-3), ejes)?.eje, 'rojo');
  assert.equal(M.inferirEje(a(88), ejes)?.eje, 'verde');
  assert.equal(M.inferirEje(a(20), ejes), null);
  assert.equal(M.inferirEje([0, 0], ejes), null);
  const p = M.proyectar(a(3), [1, 0]);
  assert.ok(cerca(p[1], 0) && p[0] > 3.9);
});

test('punto en el eje: el rayo que pasa por arriba del eje vertical da la altura', () => {
  // rayo horizontal a 5 m de altura hacia el eje vertical en (10, 0)
  const t = M.puntoEnEje([0, 5, 0], [1, 0, 0], [10, 0, 0], [0, 1, 0]);
  assert.ok(t !== null && cerca(t, 5));
  assert.equal(M.puntoEnEje([0, 5, 0], [0, 1, 0], [10, 0, 0], [0, 1, 0]), null, 'paralelos');
  assert.equal(M.puntoEnEje([20, 5, 0], [1, 0, 0], [10, 0, 0], [0, 1, 0]), null, 'detrás de la cámara');
});

test('encastre: esquina con esquina dentro de la tolerancia; si no, redondea a 0,05', () => {
  let d = conVolumen(caja);
  d = M.agregarVolumen(d, { tipo: 'caja', origen: [20, 0], rumbo: 0, largo: 4, ancho: 4, alto: 3 }, { nombre: 'Garita' }).diseno;
  const mov = M.formaMovil(d, ['V2']);
  const cand = M.candidatosEncastre(d, ['V2']);
  assert.ok(cand.puntos.every((c) => !/Garita/.test(c.etiqueta)), 'no encastra contra sí mismo');
  // la esquina (20,0) de la garita cerca de la esquina (12,0) del edificio
  let r = M.encastrar(mov.plantas, [-7.83, 0.12], cand, { tol: 0.4 });
  assert.deepEqual(r.delta, [-8, 0]);
  assert.equal(r.encastre?.tipo, 'esquina');
  assert.match(r.encastre!.etiqueta, /Edificio/);
  r = M.encastrar(mov.plantas, [-3.33, 1.17], cand, { tol: 0.2 });
  assert.deepEqual(r.delta, [-3.35, 1.15]);
  assert.equal(r.encastre, null);
  // contra un borde: queda pegada a la pared x = 12 y a lo largo sigue redondeando
  r = M.encastrar(mov.plantas, [-7.9, 2.33], cand, { tol: 0.3 });
  assert.deepEqual(r.delta, [-8, 2.35]);
  assert.equal(r.encastre?.tipo, 'borde');
  // en la cota: la base de la garita sobre el techo del edificio (11)
  const c = M.encastrarCota(mov.cotas, 10.8, cand, { tol: 0.3 });
  assert.equal(c.dy, 11);
  assert.match(c.cota!.etiqueta, /Arriba de Edificio/);
});

test('encastre sobre un eje: se corre hasta tocar la pared detrás de una fachada', () => {
  const d0 = M.agregarEstructura(vacio(), 'estructura', { origen: [0, 0] }, C).diseno;
  const res = M.construir(d0, C);
  const d = M.agregarVolumen(d0, { tipo: 'caja', origen: [0, -20], rumbo: 0, largo: 6, ancho: 6, alto: 6 }, { nombre: 'Edificio' }).diseno;
  const cand = M.candidatosEncastre(d, ['V1'], res);
  const pared = cand.lineas.find((l) => /^Pared/.test(l.etiqueta));
  const retiro = (d.estructuras[0].params.retiro as number | undefined) ?? 0.2;
  assert.ok(pared && cerca(pared.a[1], -retiro), 'la pared queda detrás de la fachada (z < 0)');
  assert.ok(cand.lineas.some((l) => /^Frente/.test(l.etiqueta)));
  // con el eje verde bloqueado: la cara que da a la fachada (z = −14) llega a la pared
  const mov = M.formaMovil(d, ['V1']).plantas;
  const r = M.encastrar(mov, [0, 14 - retiro - 0.15], cand, { tol: 0.4, dir: [0, 1] });
  assert.ok(cerca(r.delta[0], 0));
  assert.ok(cerca(r.delta[1], 14 - retiro), `${r.delta}`);
  assert.match(r.encastre!.etiqueta, /^Pared/);
});

test('distancia tipeada: en el sentido del movimiento, sobre el eje o en altura', () => {
  assert.deepEqual(M.deltaPorDistancia('rojo', [1, 0], 3.2, [-1, 0, 0.1]), [-3.2, 0, 0]);
  assert.deepEqual(M.deltaPorDistancia(null, null, 5, [3, 0, 4]), [3, 0, 4]);
  assert.deepEqual(M.deltaPorDistancia('azul', null, 2, [0, -0.3, 0]), [0, -2, 0]);
  assert.equal(M.deltaPorDistancia(null, null, 5, [0, 0, 0]), null);
  assert.equal(M.distanciaMovimiento([3, 0, 4]), 5);
  assert.equal(M.nombreMovimiento('Edificio', [3.2, 0, 0]), 'Edificio: mover 3,20 m');
});
