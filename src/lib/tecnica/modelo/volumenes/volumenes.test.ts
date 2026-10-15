// Volúmenes de referencia: dibujar el edificio desde medidas, modelar arriba de una cara y choques.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../index.ts';
import type { Diseno, DefVolumen } from '../index.ts';
import { problemasDeArmado } from '../tipologias/nuevas-test-utils.ts';

const C = M.CATALOGO_FIXTURE;
const build = (d: Diseno) => M.construir(d, C);
const vacio = (): Diseno => {
  const d = M.crearDiseno('libre_vacia');
  d.estructuras = [];
  return d;
};
const conVolumen = (def: DefVolumen, nombre = 'Edificio') => M.agregarVolumen(vacio(), def, { nombre });
const caja: DefVolumen = { tipo: 'caja', origen: [0, 0], rumbo: 0, largo: 12, ancho: 8, alto: 11 };

test('caja desde medidas: planta antihoraria, 4 caras con normal hacia afuera y rumbo de fachada', () => {
  const { diseno, volumenId } = conVolumen(caja);
  const v = diseno.contexto.volumenes[0] as M.VolumenModelado;
  assert.equal(volumenId, 'V1');
  assert.equal(v.defVersion, M.VERSION_VOLUMENES);
  assert.equal(v.yTope, 11);
  const caras = M.carasDelDiseno(diseno);
  assert.equal(caras.length, 4);
  const frente = caras.find((c) => c.lado === 0)!;
  assert.deepEqual(frente.normal, [0, -1]);
  assert.equal(frente.largo, 12);
  assert.equal(frente.rumbo, 180);
  // el diseño con volúmenes se guarda y se vuelve a abrir igual
  const v2 = M.validarDiseno(JSON.parse(JSON.stringify(diseno)));
  assert.ok(v2.ok);
  assert.deepEqual(M.migrarVolumenes(diseno).contexto.volumenes, diseno.contexto.volumenes);
});

test('clic en una cara → fachada con el largo, el rumbo y la altura de la cara, sin chocar el volumen', () => {
  const { diseno } = conVolumen(caja);
  const cara = M.carasDelDiseno(diseno).find((c) => c.lado === 0)!;
  const r0 = M.agregarEnCara(diseno, cara.id, { retiro: 0.25 }, C);
  assert.ok(r0.estructuraId);
  const e = r0.diseno.estructuras[0];
  assert.equal(e.tipologia, 'fachada');
  assert.equal((e.params.frentes as { largo: number }[])[0].largo, 12);
  assert.equal(e.params.altura, 12);
  const r = build(r0.diseno);
  assert.deepEqual(M.detectarChoques(r0.diseno, r), []);
  // la fachada queda del lado de afuera (z < 0) a 0,25 de la pared
  const zs = r.piezas.filter((p) => p.familia === 'vertical').map((p) => p.a[2]);
  assert.ok(Math.abs(Math.max(...zs) + 0.25) < 1e-6);
  assert.deepEqual(problemasDeArmado(r), []);
});

test('seguir el contorno: planta en L (esquina convexa y entrante) → una fachada con frentes a ±90°', () => {
  const L = M.agregarVolumen(vacio(), { tipo: 'prisma', planta: [[0, 0], [14, 0], [14, 6], [8, 6], [8, 12], [0, 12]], alto: 9, medianeras: [5] }, { nombre: 'L' }).diseno;
  const c0 = M.carasDelDiseno(L).find((c) => c.lado === 1)!;
  const cad = M.cadenaContorno(L, c0);
  assert.deepEqual(cad.map((c) => c.lado), [4, 3, 2, 1, 0], 'del lado 4 al 0, cortando en la medianera');
  const prop = M.propuestaParaCara(L, c0.id, { seguir: 'contorno' })!;
  const fr = prop.opciones.params!.frentes as { largo: number; angulo?: number }[];
  assert.equal(fr.length, 5);
  assert.deepEqual(fr.slice(1).map((f) => f.angulo), [90, -90, 90, 90], 'convexa, entrante, convexa, convexa');
  const d = M.agregarEnCara(L, c0.id, { seguir: 'contorno' }, C).diseno;
  const r = build(d);
  assert.deepEqual(M.detectarChoques(d, r), []);
  assert.ok(r.piezas.length > 500);
});

test('volumen escalonado: la cara al ras sube entera; la del retranqueo arma una estructura sobre la terraza', () => {
  const { diseno } = conVolumen({ tipo: 'escalonado', planta: [[0, 0], [10, 0], [10, 8], [0, 8]], tramos: [{ hasta: 9, retiro: 0 }, { hasta: 15, retiro: [3, 0, 0, 0] }] });
  const caras = M.carasDelDiseno(diseno);
  const ras = caras.find((c) => c.solidoId.endsWith(':s0') && c.lado === 1)!;
  assert.equal(ras.yTope, 15, 'el lado al ras llega al tope');
  assert.deepEqual(ras.tramosAltura, [{ desde: 0, hasta: 3, yTope: 9 }, { desde: 3, hasta: 8, yTope: 15 }]);
  // la fachada sobre esa cara se parte en dos frentes alineados de distinta altura
  const pr = M.propuestaParaCara(diseno, ras.id)!;
  const fr = pr.opciones.params!.frentes as { largo: number; angulo?: number; altura?: number }[];
  assert.deepEqual(fr.map((f) => [f.largo, f.angulo ?? null, f.altura ?? null]), [[5, null, null], [3, 0, 10]]);
  const dr = M.agregarEnCara(diseno, ras.id, {}, C).diseno;
  assert.deepEqual(M.detectarChoques(dr, build(dr)), []);
  const baja = caras.find((c) => c.solidoId.endsWith(':s0') && c.lado === 0)!;
  assert.equal(baja.yTope, 9);
  const alta = caras.find((c) => c.solidoId.endsWith(':s1') && c.lado === 0)!;
  assert.equal(alta.yBase, 9);
  const r = M.agregarEnCara(diseno, alta.id, {}, C);
  assert.equal(r.propuesta!.tipo, 'terraza');
  const res = build(r.diseno);
  const bases = res.piezas.filter((p) => p.familia === 'base_regulable');
  assert.ok(bases.length && bases.every((p) => Math.abs(Math.min(p.a[1], p.b[1]) - 9) < 1e-6));
  assert.deepEqual(M.detectarChoques(r.diseno, res), []);
  assert.deepEqual(problemasDeArmado(res), []);
});

test('cilindro con cúpula: la cara curva propone una envolvente del volumen que no lo choca', () => {
  const { diseno } = conVolumen({ tipo: 'cilindro', centro: [0, 0], radio: 3, alto: 8, lados: 12, cupula: { alto: 2 } }, 'Tanque');
  const v = diseno.contexto.volumenes[0];
  assert.equal(v.tipo, 'cupula');
  assert.equal(v.yTope, 10);
  assert.equal(M.solidosDe(v, diseno.contexto.volumenes).filter((s) => s.rol === 'cupula').length, 4);
  const cara = M.carasDelDiseno(diseno)[0];
  assert.equal(cara.tipo, 'curva');
  const r = M.agregarEnCara(diseno, cara.id, { retiro: 0.3 }, C);
  assert.equal(r.diseno.estructuras[0].tipologia, 'envolvente');
  const res = build(r.diseno);
  assert.deepEqual(M.detectarChoques(r.diseno, res), []);
  assert.deepEqual(problemasDeArmado(res), []);
});

test('marquesina: choca con la fachada → «Retirar y acercar con ménsulas» la resuelve de un clic', () => {
  let { diseno } = conVolumen(caja);
  diseno = M.agregarVolumen(diseno, { tipo: 'saliente', padre: 'V1', lado: 0, desde: 2, largo: 6, vuelo: 1.2, yBase: 3, espesor: 0.25, clase: 'marquesina' }, { nombre: 'Marquesina' }).diseno;
  const cara = M.carasDelDiseno(diseno).find((c) => c.volumenId === 'V1' && c.lado === 0)!;
  let d = M.agregarEnCara(diseno, cara.id, {}, C).diseno;
  let r = build(d);
  const av = M.avisosDeChoque(d, r, C.medidas);
  assert.equal(av.length, 1);
  assert.equal(av[0].nivel, 'error');
  assert.match(av[0].texto, /Marquesina/);
  assert.match(av[0].reparaciones[0].etiqueta, /ménsulas/);
  d = M.aplicarReparacion(d, av[0].reparaciones[0].accion, C);
  r = build(d);
  assert.deepEqual(M.avisosDeChoque(d, r, C.medidas), []);
  const men = r.piezas.filter((p) => p.familia === 'mensula');
  assert.ok(men.length > 0 && men.every((p) => p.a[1] > 3.25), 'ménsulas por encima de la marquesina');
  assert.ok(d.estructuras[0].params.retiro as number >= 1.35 - 1e-9);
});

test('balcones repetidos en cada piso: un solo aviso por fachada y «Retirar» lo resuelve', () => {
  let { diseno } = conVolumen(caja);
  diseno = M.agregarVolumen(diseno, { tipo: 'saliente', padre: 'V1', lado: 0, desde: 3, largo: 4, vuelo: 0.9, yBase: 3, espesor: 0.15, clase: 'balcon', repetir: { cada: 2.8, hasta: 9 } }, { nombre: 'Balcones' }).diseno;
  assert.equal(M.solidosDe(diseno.contexto.volumenes[1], diseno.contexto.volumenes).length, 3);
  const cara = M.carasDelDiseno(diseno).find((c) => c.volumenId === 'V1' && c.lado === 0)!;
  let d = M.agregarEnCara(diseno, cara.id, {}, C).diseno;
  const av = M.avisosDeChoque(d, build(d), C.medidas);
  assert.equal(av.length, 1);
  // la primera opción acerca el trabajo a la fachada con ménsulas en los niveles libres entre balcones
  const conMen = av[0].reparaciones.find((x) => /ménsulas .* entre balcones/.test(x.etiqueta));
  assert.ok(conMen, av[0].reparaciones.map((x) => x.etiqueta).join(' | '));
  const dm = M.aplicarReparacion(d, conMen!.accion, C);
  const rm = build(dm);
  assert.deepEqual(M.avisosDeChoque(dm, rm, C.medidas), []);
  assert.ok(rm.piezas.some((p) => p.familia === 'mensula'), 'hay ménsulas hacia la fachada');
  d = M.aplicarReparacion(d, av[0].reparaciones[av[0].reparaciones.length - 1].accion, C);
  assert.deepEqual(M.avisosDeChoque(d, build(d), C.medidas), []);
});

test('estructura metida en el edificio: «Correr afuera» la saca; los patios no chocan', () => {
  const { diseno } = conVolumen({ ...caja, huecos: [{ nombre: 'Patio', planta: [[4, 3], [9, 3], [9, 7], [4, 7]] }] } as DefVolumen);
  // una torre dentro del patio no choca
  let d = M.agregarEstructura(diseno, 'torre_movil_interior', { origen: [5, 4] }, C).diseno;
  assert.deepEqual(M.detectarChoques(d, build(d)), []);
  // una torre pisando el cuerpo sí, y se corre hacia afuera
  d = M.agregarEstructura(diseno, 'torre_movil_interior', { origen: [1, -0.5] }, C).diseno;
  const av = M.avisosDeChoque(d, build(d), C.medidas);
  assert.equal(av.length, 1);
  assert.match(av[0].reparaciones[0].etiqueta, /Correr/);
  d = M.aplicarReparacion(d, av[0].reparaciones[0].accion, C);
  assert.deepEqual(M.detectarChoques(d, build(d)), []);
  // la pared del patio propone un patio interno
  const pared = M.carasDelDiseno(diseno).find((c) => c.tipo === 'patio')!;
  const prop = M.propuestaParaCara(diseno, pared.id)!;
  assert.equal(prop.tipologia, 'patio_interno');
  const dp = M.agregarEnCara(diseno, pared.id, {}, C).diseno;
  const rp = build(dp);
  assert.deepEqual(M.detectarChoques(dp, rp), []);
  assert.ok(rp.piezas.length > 50);
});

test('alta, edición y baja: el saliente sigue a su padre y se va con él; normalizar nunca tira', () => {
  let { diseno } = conVolumen(caja);
  diseno = M.agregarVolumen(diseno, { tipo: 'saliente', padre: 'V1', lado: 0, desde: 0, largo: 12, vuelo: 0.4, yBase: 10.5, espesor: 0.3, clase: 'cornisa' }).diseno;
  const antes = diseno.contexto.volumenes[1].planta;
  diseno = M.actualizarVolumen(diseno, 'V1', { def: { ...caja, origen: [5, 0] } }).diseno;
  const despues = diseno.contexto.volumenes[1].planta;
  assert.ok(despues.every((q, i) => Math.abs(q[0] - antes[i][0] - 5) < 1e-6), 'la cornisa se movió con el edificio');
  diseno = M.quitarVolumen(diseno, 'V1');
  assert.equal(diseno.contexto.volumenes.length, 0);
  for (const basura of [null, 42, { tipo: 'prisma', planta: [[0, 0]] }, { tipo: 'escalonado' }, { tipo: 'saliente' }]) {
    assert.doesNotThrow(() => M.normalizarDef(basura));
  }
  assert.equal(M.normalizarDef({ tipo: 'nave' }).def.tipo, 'caja');
});

test('volúmenes sin definición (cargados a mano): prisma que choca; con `hueco: true` es un patio que no choca', () => {
  const d = M.agregarEstructura(vacio(), 'torre_movil_interior', { origen: [1, 1] }, C).diseno;
  d.contexto.volumenes.push({ id: 'X', tipo: 'edificio', planta: [[0, 0], [6, 0], [6, 6], [0, 6]], yBase: 0, yTope: 9 });
  assert.equal(M.detectarChoques(d, build(d)).length, 1);
  (d.contexto.volumenes as (M.Volumen & { hueco?: boolean })[]).push({ id: 'P', tipo: 'edificio', planta: [[0.5, 0.5], [5, 0.5], [5, 5], [0.5, 5]], yBase: 0, yTope: 9, hueco: true });
  assert.deepEqual(M.detectarChoques(d, build(d)), []);
});

test('volumen sugerido: la escalera del hueco y la losa del colgante se crean y quedan vinculadas', () => {
  for (const [preset, tipos] of [['hueco_escalera', ['escalera']], ['sobre_escalera', ['escalera']], ['colgante_losa', ['losa', 'puente', 'edificio']], ['torre_azotea', ['edificio', 'losa']]] as const) {
    const d0 = M.crearDiseno(preset, { catalogo: C });
    const r0 = build(d0);
    const d = M.vincularVolumenSugerido(d0, 'E1', [...tipos], r0.estructuras[0].huella);
    const id = d.estructuras[0].params.volumenId as string;
    assert.ok(id && d.contexto.volumenes.some((v) => v.id === id), preset);
    assert.equal(M.volumenesCompatibles(d, [...tipos]).length, 1, preset);
    const r = build(d);
    assert.ok(!r.avisos.some((a) => /sin_volumen/.test(a.regla)), `${preset}: vinculado`);
    if (preset === 'hueco_escalera' || preset === 'sobre_escalera') {
      // misma escalera que el perfil paramétrico: los mismos apoyos
      const bases = (x: M.Resultado) => x.estructuras[0].esqueleto.columnas.map((c) => c.ySuelo).sort().join(',');
      assert.equal(bases(r), bases(r0), `${preset}: mismos apoyos`);
    }
  }
});
