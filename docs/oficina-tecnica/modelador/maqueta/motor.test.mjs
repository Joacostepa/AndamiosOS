// Tests del motor paramétrico de la maqueta. Correr con:
//   node --test docs/oficina-tecnica/modelador/maqueta/motor.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from './motor.js';

const TIPOS = new Set(['vertical', 'horizontal', 'baranda', 'diagonal', 'plataforma', 'rodapie', 'base', 'collarin', 'anclaje', 'mensula', 'viga', 'escalera', 'zanca', 'bastidor', 'rienda', 'cruceta', 'cubierta', 'accesorio']);
const cuenta = (r, pred) => r.piezas.filter(pred).length;
const bomDe = (r, codigo) => r.bom.find((l) => l.codigo === codigo)?.cantidad || 0;
const textos = (arr) => arr.map((x) => x.texto).join('\n');

test('catálogo: medidas Coronet confirmadas, pesos nulos a propósito y plausibles marcados', () => {
  assert.deepEqual(M.CATALOGO.medidas.multi.vanos, [2.5, 2.0, 1.5, 1.25, 1.09, 0.73]);
  assert.deepEqual(M.CATALOGO.medidas.multi.profundidades, [0.73, 1.09, 1.25]);
  const items = Object.values(M.CATALOGO.piezas);
  assert.ok(items.filter((i) => i.peso_kg === null).length >= 3, 'hay códigos sin peso');
  assert.ok(items.some((i) => i.plausible) && items.some((i) => i.enOdoo));
  for (const k of Object.keys(M.CATALOGO.kits)) assert.ok(M.CATALOGO.piezas[k], `kit ${k} en catálogo`);
});

test('plantillas: todas las tipologías pedidas, con params y construibles', () => {
  const ids = M.PLANTILLAS.map((p) => p.id);
  for (const id of ['pantalla', 'estructura_pantalla', 'fachada_bastidor', 'torre_escalera', 'torre_acceso', 'portico_peatonal', 'portico_vehicular', 'voladizo']) assert.ok(ids.includes(id), id);
  for (const p of M.PLANTILLAS) {
    assert.ok(p.nombre && p.descripcion && p.icono && p.params, p.id);
    const r = M.construir(M.crearDiseno(p.id));
    assert.ok(r.piezas.length > 20, `${p.id} genera piezas`);
    for (const pz of r.piezas) {
      assert.ok(TIPOS.has(pz.tipo), `tipo ${pz.tipo}`);
      assert.ok(M.CATALOGO.piezas[pz.codigo], `código ${pz.codigo}`);
      for (const v of [...pz.a, ...pz.b]) assert.ok(Number.isFinite(v));
    }
    assert.equal(r.resumen.etiqueta, 'PREDIMENSIONADO');
  }
});

test('rellenarLargo: 14,00 → 5×2,50 + 1,50 con alternativas', () => {
  const r = M.rellenarLargo(14);
  assert.equal(r.texto, '14,00 → 5×2,50 + 1,50');
  assert.equal(r.desvio, 0);
  assert.ok(r.alternativas.some((a) => a.texto === '7×2,00'));
  assert.ok(r.alternativas.every((a) => a.texto !== '5×2,50 + 1,50'));
  const c = M.rellenarLargo(14, 'multi', { ajuste: 'centrado' });
  assert.equal(c.vanos[0], 2.5);
  assert.notEqual(c.vanos[c.vanos.length - 1], 1.5);
  const b = M.rellenarLargo(14, 'bastidor');
  assert.ok(b.vanos.every((v) => v === 2.5 || v === 1.5));
  assert.equal(b.desvio, 0);
  for (const L of [3.1, 7.7, 9.99, 22, 31.4]) {
    const x = M.rellenarLargo(L);
    assert.ok(Math.abs(x.desvio) <= 0.1 + 1e-9, `${L} → ${x.texto}`);
    assert.ok(x.vanos.every((v) => M.CATALOGO.medidas.multi.vanos.includes(v)));
  }
});

test('ejemplo Paraná 631: fachada en L generada, resumen y 2–3 faltantes ilustrativos', () => {
  const d = M.ejemploParana631();
  assert.match(d.nombre, /Paraná 631/);
  const r = M.construir(d);
  const F = r.estructuras[0].frentes;
  assert.equal(F.length, 2);
  assert.equal(F[0].texto, '14,00 → 5×2,50 + 1,50');
  assert.ok(r.resumen.m2 > 380 && r.resumen.m2 < 440, `m2 ${r.resumen.m2}`);
  assert.equal(r.resumen.pesoParcial, true);
  assert.ok(r.resumen.codigosSinPeso.includes('DIAG-200x250'));
  assert.ok(r.resumen.faltantesStock.length >= 2 && r.resumen.faltantesStock.length <= 3, JSON.stringify(r.resumen.faltantesStock));
  assert.match(r.resumen.texto, /PREDIMENSIONADO/);
  // Frente B: cuadro de esquina 0,73 + relleno de 8,00 (2×2,50 + 2×1,50)
  assert.deepEqual(F[1].vanos, [0.73, 2.5, 2.5, 1.5, 1.5]);
  assert.equal(F[1].S[0], -0.73);
  assert.equal(F[1].S[1], 0);
  assert.equal(r.celdas.filter((c) => c.estructuraId === 'E1').length, (6 + 5) * F[0].niveles.length);
  assert.match(textos(r.reglasAplicadas), /Agregué \d+ anclajes por la media sombra/);
  assert.ok(r.uniones.some((u) => u.tipo === 'esquina' && u.modo === 'vertical_compartida' && u.compartidas === 2));
  assert.ok(r.puertos.some((p) => p.id === 'f1:ext'));
  // última plataforma a H−1 y baranda remata en H
  assert.equal(F[0].niveles.at(-1).cota, 17);
  assert.equal(F[0].alturaReal, 18);
});

test('ids estables y construir() puro', () => {
  const d = M.ejemploParana631();
  const antes = JSON.stringify(d);
  const r1 = M.construir(d), r2 = M.construir(d);
  assert.equal(JSON.stringify(d), antes, 'no muta el diseño');
  assert.deepEqual(r1.piezas.map((p) => p.id), r2.piezas.map((p) => p.id));
  assert.equal(new Set(r1.piezas.map((p) => p.id)).size, r1.piezas.length, 'ids únicos');
  // cambiar la cubierta no cambia los ids de las verticales
  const r3 = M.construir(M.setParam(d, 'E1', 'params.cubierta', 'nada'));
  const vert = (r) => r.piezas.filter((p) => p.tipo === 'vertical').map((p) => p.id).sort();
  assert.deepEqual(vert(r1), vert(r3));
});

test('fusionarNodos: la esquina comparte dos verticales y la torre dos', () => {
  const d = M.ejemploParana631();
  const r = M.construir(d);
  const bases = cuenta(r, (p) => p.tipo === 'base');
  assert.equal(bases, 7 * 2 + 6 * 2 - 2);
  const { diseno: d2 } = M.agregarEstructura(d, 'torre_escalera', { unirA: { estructuraId: 'E1', puerto: 'f1:ext', s: 2.5 } });
  const r2 = M.construir(d2);
  const u = r2.uniones.find((x) => x.tipo === 'estructura');
  assert.equal(u.modo, 'vertical_compartida');
  assert.equal(u.compartidas, 2);
  assert.equal(cuenta(r2, (p) => p.tipo === 'base'), bases + 4 - 2);
  assert.match(textos(r2.reglasAplicadas), /comparte 2 verticales con Fachada L · Frente B/);
  assert.equal(d2.estructuras[1].params.altura, 18, 'hereda la altura');
  assert.match(textos(r2.reglasAplicadas), /acceso es por la torre/);
  assert.equal(bomDe(r2, 'ESC-INT-MULTI'), 0);
  // sin doble conteo de verticales por nodo
  const porNodoY = new Map();
  for (const p of r2.piezas.filter((x) => x.tipo === 'vertical' && x.nodo)) {
    const k = `${p.nodo}|${Math.round(p.a[1] * 100)}`;
    porNodoY.set(k, (porNodoY.get(k) || 0) + 1);
  }
  assert.ok([...porNodoY.values()].every((n) => n === 1));
});

test('esquina conmutable a vano de giro', () => {
  const d = M.aplicarReparacion(M.ejemploParana631(), { tipo: 'esquina', estructuraId: 'E1', indice: 0, modo: 'vano_giro' });
  const r = M.construir(d);
  const u = r.uniones.find((x) => x.tipo === 'esquina');
  assert.equal(u.modo, 'vano_giro');
  assert.ok(r.piezas.some((p) => p.tipo === 'base' && Math.abs(p.a[0] - 14.73) < 1e-6 && Math.abs(p.a[2] - 0.73) < 1e-6), 'vertical de esquina');
  assert.deepEqual(u.alternar.modo, 'vertical_compartida');
});

test('abertura 2×2: propone viga, quita verticales interiores; sin viga da error con reparación', () => {
  const d0 = M.ejemploParana631();
  const celdas = ['0:1:0', '0:2:0', '0:1:1', '0:2:1'];
  const d = M.aplicarReparacion(d0, { tipo: 'overrides', estructuraId: 'E1', celdas, valor: { abertura: true } });
  const r0 = M.construir(d0), r = M.construir(d);
  assert.equal(cuenta(r, (p) => p.tipo === 'viga'), 2);
  assert.equal(cuenta(r, (p) => p.tipo === 'base'), cuenta(r0, (p) => p.tipo === 'base') - 2);
  assert.match(textos(r.reglasAplicadas), /Propuse viga VIGA-CEL-500/);
  assert.ok(r.celdas.find((c) => c.celda === '0:1:0').estado.abertura);
  assert.ok(!r.piezas.some((p) => p.tipo === 'plataforma' && p.celda === '0:1:0'));
  const sin = M.setOverride(d, 'E1', '0:1:0', { viga: false });
  const rs = M.construir(sin);
  const av = rs.avisos.find((a) => a.nivel === 'error' && /sin viga/.test(a.texto));
  assert.ok(av && av.reparaciones.length === 1);
  const arreglado = M.construir(M.aplicarReparacion(sin, av.reparaciones[0].accion));
  assert.equal(cuenta(arreglado, (p) => p.tipo === 'viga'), 2);
  // los overrides sobreviven a regenerar con otra altura
  const alto = M.setParam(d, 'E1', 'params.altura', 14);
  assert.deepEqual(alto.estructuras[0].overrides, d.estructuras[0].overrides);
  assert.equal(cuenta(M.construir(alto), (p) => p.tipo === 'viga'), 2);
});

test('pincel: sin plataforma, lona, ménsula y anclaje', () => {
  const d = M.ejemploParana631();
  const r0 = M.construir(d);
  const k = '0:3:4';
  const sinPlat = M.construir(M.setOverride(d, 'E1', k, { sinPlataforma: true }));
  assert.ok(r0.piezas.some((p) => p.tipo === 'plataforma' && p.celda === k));
  assert.ok(!sinPlat.piezas.some((p) => p.tipo === 'plataforma' && p.celda === k));
  const lona = M.construir(M.setOverride(d, 'E1', k, { lona: true }));
  assert.ok(lona.piezas.some((p) => p.codigo === 'LONA-PVC' && p.celda === k));
  const mens = M.construir(M.setOverride(d, 'E1', k, { mensula: 'afuera' }));
  assert.equal(cuenta(mens, (p) => p.tipo === 'mensula'), 2);
  const sinAnc = M.construir(M.setOverride(d, 'E1', '0:0:7', { anclaje: false }));
  assert.equal(sinAnc.resumen.anclajes, r0.resumen.anclajes - 1);
  assert.equal(M.setOverride(M.setOverride(d, 'E1', k, { lona: true }), 'E1', k, null).estructuras[0].overrides[k], undefined);
});

test('regla de anclajes por media sombra se puede deshacer', () => {
  const d = M.ejemploParana631();
  const r = M.construir(d);
  const regla = r.reglasAplicadas.find((x) => /media sombra/.test(x.texto));
  const n = +/Agregué (\d+)/.exec(regla.texto)[1];
  const r2 = M.construir(M.aplicarReparacion(d, regla.deshacer));
  assert.equal(r2.resumen.anclajes, r.resumen.anclajes - n);
  assert.ok(!r2.reglasAplicadas.some((x) => /media sombra/.test(x.texto)));
});

test('setParam del largo descarta el relleno elegido', () => {
  let d = M.aplicarReparacion(M.ejemploParana631(), { tipo: 'vanos', estructuraId: 'E1', frente: 0, vanos: [2, 2, 2, 2, 2, 2, 2] });
  assert.equal(M.construir(d).estructuras[0].frentes[0].texto, '14,00 → 7×2,00');
  d = M.setParam(d, 'E1', 'params.frentes.0.largo', 16);
  assert.equal(d.estructuras[0].params.frentes[0].vanos, undefined);
  assert.match(M.construir(d).estructuras[0].frentes[0].texto, /^16,00 → /);
});

test('cambiarSistema: multi ↔ bastidor con avisos y kit/despiezado', () => {
  const d = M.ejemploParana631();
  const { estructura, avisos } = M.cambiarSistema(d.estructuras[0], 'bastidor');
  assert.equal(estructura.sistema, 'bastidor');
  assert.ok(avisos.some((a) => /Frente A: 14,00 → 5×2,50 \+ 1,50/.test(a)));
  assert.ok(avisos.some((a) => /Altura real/.test(a)));
  const db = { ...d, estructuras: [estructura] };
  const rk = M.construir(db);
  assert.ok(rk.bom.some((l) => l.esKit));
  const desp = M.calcularBom(rk.piezas, 'despiezado');
  assert.ok(!desp.some((l) => l.esKit));
  const kits = rk.bom.filter((l) => /^MOD-AND/.test(l.codigo)).reduce((s, l) => s + l.cantidad, 0);
  const bastK = rk.bom.filter((l) => /^BAST-(AND|PAS)/.test(l.codigo)).reduce((s, l) => s + l.cantidad, 0);
  const bastD = desp.filter((l) => /^BAST-(AND|PAS)/.test(l.codigo)).reduce((s, l) => s + l.cantidad, 0);
  assert.equal(bastD, kits + bastK);
  const dd = M.aplicarReparacion(db, { tipo: 'modoBom', modo: 'despiezado' });
  assert.equal(M.construir(dd).resumen.modoBom, 'despiezado');
  // aviso de redondeo del bastidor
  const b = M.cambiarSistema(M.crearDiseno('estructura', { frentes: [{ largo: 12.9 }] }).estructuras[0], 'bastidor');
  assert.ok(b.avisos.some((a) => /sobran|faltan/.test(a)), b.avisos.join(' | '));
  // y de vuelta
  const back = M.cambiarSistema(estructura, 'multi');
  assert.equal(back.estructura.sistema, 'multi');
  assert.ok(M.CATALOGO.medidas.multi.profundidades.includes(back.estructura.params.profundidad));
  const veh = M.cambiarSistema(M.crearDiseno('portico_vehicular').estructuras[0], 'bastidor');
  assert.equal(veh.estructura.sistema, 'multi');
});

test('pórtico peatonal: gálibo ≥ 2,50 y paso ≥ 1,20 con reparación de un clic', () => {
  const ok = M.construir(M.crearDiseno('portico_peatonal'));
  assert.ok(!ok.avisos.some((a) => a.nivel === 'error'));
  assert.ok(ok.bom.some((l) => l.codigo === 'MOD-PEA-STD-130x250x250'));
  const multi = M.aplicarReparacion(M.crearDiseno('portico_peatonal'), { tipo: 'sistema', estructuraId: 'E1', sistema: 'multi' });
  const bajo = M.setParam(multi, 'E1', 'params.alturaLibre', 2.2);
  const rb = M.construir(bajo);
  const av = rb.avisos.find((a) => a.nivel === 'error' && /Altura libre/.test(a.texto));
  assert.ok(av);
  assert.equal(av.reparaciones[0].etiqueta, 'Subir a 2,50');
  assert.ok(!M.construir(M.aplicarReparacion(bajo, av.reparaciones[0].accion)).avisos.some((a) => a.nivel === 'error'));
  const angosto = M.construir(M.crearDiseno('portico_peatonal', { ancho: 0.9 }));
  assert.ok(angosto.avisos.some((a) => a.nivel === 'error' && /Paso libre/.test(a.texto)));
});

test('pórtico como base de la fachada (apoyo)', () => {
  const d = M.crearDiseno('estructura_pantalla', { frentes: [{ largo: 10 }], altura: 12 });
  const { diseno } = M.agregarEstructura(d, 'portico_peatonal', { unirA: { estructuraId: 'E1', puerto: 'f0:base', s: 0 } });
  assert.deepEqual(diseno.estructuras[0].apoyaEn, ['E2']);
  const r = M.construir(diseno);
  assert.equal(cuenta(r, (p) => p.estructuraId === 'E1' && p.tipo === 'base'), 0, 'la fachada no baja al piso');
  const tope = r.estructuras.find((e) => e.id === 'E2').yTope;
  const vertE1 = r.piezas.filter((p) => p.estructuraId === 'E1' && p.tipo === 'vertical');
  assert.ok(Math.min(...vertE1.map((p) => p.a[1])) >= tope - 1e-6);
  assert.match(textos(r.reglasAplicadas), /se apoya sobre Pórtico peatonal/);
});

test('pórtico vehicular: vigas de celosía, gálibo 4,50, luz máxima', () => {
  const r = M.construir(M.crearDiseno('portico_vehicular'));
  assert.equal(bomDe(r, 'VIGA-CEL-600'), 2);
  const est = r.estructuras[0];
  assert.ok(est.galibo >= 4.5);
  const largo = M.construir(M.crearDiseno('portico_vehicular', { luz: 8.5 }));
  const e = largo.avisos.find((a) => a.nivel === 'error');
  assert.ok(e && /7,50/.test(e.texto));
  const bajo = M.construir(M.crearDiseno('portico_vehicular', { galibo: 3.8 }));
  assert.ok(bajo.avisos.some((a) => /Gálibo 3,80/.test(a.texto)));
  // como base de una fachada a mitad de frente
  const d = M.crearDiseno('estructura', { frentes: [{ largo: 20 }], altura: 12 });
  const { diseno } = M.agregarEstructura(d, 'portico_vehicular', { unirA: { estructuraId: 'E1', puerto: 'f0:base', s: 5 } });
  const rv = M.construir(diseno);
  assert.ok(rv.celdas.some((c) => c.estructuraId === 'E1' && c.estado.bajoApoyo));
  assert.ok(cuenta(rv, (p) => p.estructuraId === 'E1' && p.tipo === 'base') > 0);
});

test('voladizo con ménsulas: hacia la fachada, choque y reparación', () => {
  const r = M.construir(M.crearDiseno('voladizo'));
  assert.ok(cuenta(r, (p) => p.codigo === 'MENSULA-109') > 0);
  assert.ok(!r.avisos.some((a) => a.nivel === 'error'));
  assert.match(textos(r.reglasAplicadas), /Ménsulas hacia la fachada/);
  const d = M.crearDiseno('voladizo', { retiro: 0.6 });
  const rc = M.construir(d);
  const e = rc.avisos.find((a) => a.nivel === 'error' && /choca/.test(a.texto));
  assert.ok(e);
  const fix = M.construir(M.aplicarReparacion(d, e.reparaciones[0].accion));
  assert.ok(!fix.avisos.some((a) => a.nivel === 'error'));
  const afuera = M.construir(M.crearDiseno('estructura', { mensulas: [{ lado: 'afuera', brazo: 0.73, desdeNivel: 3, hastaNivel: 3 }] }));
  assert.ok(cuenta(afuera, (p) => p.codigo === 'MENSULA-073') > 0);
  assert.ok(afuera.avisos.some((a) => /M09/.test(a.texto)));
  const bast = M.construir(M.crearDiseno('voladizo', { sistema: 'bastidor' }));
  assert.ok(bast.avisos.some((a) => /ménsulas son de multidireccional/.test(a.texto)));
});

test('torres: escalera con zancas, H/B > 3 suelta con reparaciones', () => {
  const r = M.construir(M.crearDiseno('torre_escalera'));
  assert.equal(bomDe(r, 'ZANCA-ESC-150x250'), r.estructuras[0].frentes[0].niveles.length);
  const av = r.avisos.find((a) => /H\/B/.test(a.texto));
  assert.ok(av);
  assert.deepEqual(av.reparaciones.map((x) => x.etiqueta).slice(0, 2), ['Anclar', 'Pata de gallo']);
  const anclada = M.construir(M.aplicarReparacion(M.crearDiseno('torre_escalera'), av.reparaciones[0].accion));
  assert.ok(!anclada.avisos.some((a) => /H\/B/.test(a.texto)));
  const pata = M.construir(M.crearDiseno('torre_escalera', { pataDeGallo: true, altura: 10 }));
  assert.ok(pata.piezas.some((p) => p.codigo === 'DIAG-150x250'));
  const acc = M.construir(M.crearDiseno('torre_acceso'));
  assert.ok(bomDe(acc, 'ESC-INT-MULTI') > 0 && bomDe(acc, 'TAB-ESC-250') > 0);
});

test('pantalla: bandeja de fenólico a ≥ 2,50, esferas y mínimo de anclajes', () => {
  const r = M.construir(M.crearDiseno('pantalla'));
  assert.ok(bomDe(r, 'PLACA-FEN-122x244') > 0 && bomDe(r, 'ESFERA-SEG') > 0);
  assert.ok(r.estructuras[0].frentes[0].niveles[0].cota >= 2.5);
  assert.ok(r.resumen.anclajes >= 5);
});

test('puertos, buscarSnap y unir', () => {
  const d = M.ejemploParana631();
  const movil = { id: 'X', tipo: 'torre', plantilla: 'torre_escalera', sistema: 'multi', origen: [0, 0], rumbo: 0, apoyaEn: [], params: { ...M.PLANTILLAS.find((p) => p.id === 'torre_escalera').params }, overrides: {} };
  const s = M.buscarSnap(d, movil, [15.5, -3]);
  assert.equal(s.a.puerto, 'f1:ext');
  assert.equal(s.modo, 'vertical_compartida');
  assert.equal(M.buscarSnap(d, movil, [60, 60]), null);
  const pts = M.puertosDe(d.estructuras[0]);
  const ext = pts.find((p) => p.id === 'f0:ext');
  assert.deepEqual(ext.cols, [0, 2.5, 5, 7.5, 10, 12.5, 14]);
  // vano de conexión entre torre y fachada
  const { diseno } = M.agregarEstructura(d, 'torre_escalera', { unirA: { estructuraId: 'E1', puerto: 'f0:ext', s: 5, modo: 'vano_giro' } });
  const r = M.construir(diseno);
  const u = r.uniones.find((x) => x.tipo === 'estructura');
  assert.equal(u.modo, 'vano_giro');
  assert.ok(r.piezas.some((p) => p.owner === u.id && p.codigo === 'HOR-048-073'));
  const sinUnion = M.aplicarReparacion(diseno, { tipo: 'quitarUnion', unionId: u.id });
  assert.equal(sinUnion.uniones.length, 0);
  const quitada = M.quitarEstructura(diseno, 'E2');
  assert.equal(quitada.estructuras.length, 1);
  assert.equal(quitada.uniones.length, 0);
});

test('rendimiento: fachada 22 ml × 18 m en < 15 ms', () => {
  const d = M.ejemploParana631();
  for (let i = 0; i < 8; i++) M.construir(d); // calentamiento JIT
  const t = [];
  for (let i = 0; i < 15; i++) {
    const t0 = performance.now();
    M.construir(d);
    t.push(performance.now() - t0);
  }
  t.sort((a, b) => a - b);
  const mediana = t[Math.floor(t.length / 2)];
  console.log(`  construir() 22 ml × 18 m: mediana ${mediana.toFixed(2)} ms, mín ${t[0].toFixed(2)} ms, ${M.construir(d).piezas.length} piezas`);
  assert.ok(mediana < 15, `mediana ${mediana} ms`);
});

// ── esquinas en L: geometría construible ──
const MMx = (v) => Math.round(v * 1000);
const esHoriz = (p) => ['horizontal', 'baranda', 'rodapie'].includes(p.tipo) && Math.abs(p.a[1] - p.b[1]) < 1e-6 && Math.hypot(p.b[0] - p.a[0], p.b[2] - p.a[2]) > 0.05;
function columnasDe(r) {
  const cols = new Map(); // x|z → [yMin, yMax]
  for (const p of r.piezas) {
    if (p.tipo !== 'vertical' || Math.abs(p.a[0] - p.b[0]) > 1e-6 || Math.abs(p.a[2] - p.b[2]) > 1e-6) continue;
    const k = `${MMx(p.a[0])}|${MMx(p.a[2])}`;
    const y0 = Math.min(p.a[1], p.b[1]), y1 = Math.max(p.a[1], p.b[1]);
    const c = cols.get(k);
    cols.set(k, c ? [Math.min(c[0], y0), Math.max(c[1], y1)] : [y0, y1]);
  }
  return [...cols].map(([k, yy]) => { const [x, z] = k.split('|').map((v) => +v / 1000); return { x, z, y0: yy[0], y1: yy[1] }; });
}
/** Tubos horizontales que pasan por una columna que no es su extremo. */
function cruces(r) {
  const cols = columnasDe(r);
  const out = [];
  for (const p of r.piezas.filter(esHoriz)) {
    const dx = p.b[0] - p.a[0], dz = p.b[2] - p.a[2], L2 = dx * dx + dz * dz, L = Math.sqrt(L2);
    for (const c of cols) {
      if (p.a[1] < c.y0 - 1e-6 || p.a[1] > c.y1 + 1e-6) continue;
      const t = ((c.x - p.a[0]) * dx + (c.z - p.a[2]) * dz) / L2;
      if (t * L < 0.01 || (1 - t) * L < 0.01) continue;
      if (Math.hypot(p.a[0] + t * dx - c.x, p.a[2] + t * dz - c.z) < 0.005) out.push(`${p.id} pasa por (${c.x}; ${c.z})`);
    }
  }
  return out;
}
/** Tubos horizontales colineales que se superponen (> 1 cm) a la misma altura. */
function superpuestos(r) {
  const hs = r.piezas.filter(esHoriz);
  const porY = new Map();
  for (const p of hs) { const k = MMx(p.a[1]); if (!porY.has(k)) porY.set(k, []); porY.get(k).push(p); }
  const out = [];
  for (const g of porY.values()) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    const p = g[i], q = g[j];
    if ((p.tipo === 'rodapie') !== (q.tipo === 'rodapie')) continue;
    const ux = p.b[0] - p.a[0], uz = p.b[2] - p.a[2], L = Math.hypot(ux, uz);
    const cr = (x, z) => Math.abs(((x - p.a[0]) * uz - (z - p.a[2]) * ux) / L);
    if (cr(q.a[0], q.a[2]) > 0.005 || cr(q.b[0], q.b[2]) > 0.005) continue;
    const pr = (x, z) => ((x - p.a[0]) * ux + (z - p.a[2]) * uz) / L;
    const t0 = Math.min(pr(q.a[0], q.a[2]), pr(q.b[0], q.b[2])), t1 = Math.max(pr(q.a[0], q.a[2]), pr(q.b[0], q.b[2]));
    if (Math.min(L, t1) - Math.max(0, t0) > 0.01) out.push(`${p.id} ⟂ ${q.id}`);
  }
  return out;
}
const piesDe = (r) => r.piezas.filter((p) => p.tipo === 'base' && /^TORN/.test(p.codigo)).map((p) => [p.a[0], p.a[2]]);
function piesRepetidos(r, dMin = 0.15) {
  const pies = piesDe(r), out = [];
  for (let i = 0; i < pies.length; i++) for (let j = i + 1; j < pies.length; j++) if (Math.hypot(pies[i][0] - pies[j][0], pies[i][1] - pies[j][1]) < dMin) out.push(`${pies[i]} ~ ${pies[j]}`);
  return out;
}

test('esquina L multi (vertical compartida): sin cruces, sin superposiciones, sin verticales duplicadas', () => {
  const r = M.construir(M.ejemploParana631());
  assert.deepEqual(cruces(r), [], 'ningún tubo pasa por una columna');
  assert.deepEqual(superpuestos(r), [], 'ninguna horizontal superpuesta');
  assert.deepEqual(piesRepetidos(r), [], 'un solo pie por punto');
  // cuadro de esquina 0,73 × 0,73: 4 columnas en (14;0), (14;0,73), (14,73;0), (14,73;0,73)
  const cols = columnasDe(r).map((c) => `${c.x}|${c.z}`);
  for (const k of ['14|0', '14|0.73', '14.73|0', '14.73|0.73']) assert.ok(cols.includes(k), `columna ${k}`);
  // el cuadro tiene tablones de 0,73 en cada nivel con plataforma
  const F = r.estructuras[0].frentes;
  const nPlat = F[1].niveles.filter((l) => l.plataforma).length;
  const enCuadro = (p) => p.tipo === 'plataforma' && Math.min(p.a[0], p.b[0]) >= 14 - 1e-6 && Math.max(p.a[0], p.b[0]) <= 14.73 + 1e-6 && Math.min(p.a[2], p.b[2]) >= -1e-6 && Math.max(p.a[2], p.b[2]) <= 0.73 + 1e-6;
  assert.equal(cuenta(r, (p) => enCuadro(p) && p.codigo === 'TAB-MET-073'), 2 * nPlat);
  // ningún anclaje de B apunta a la plataforma de A (todos los de B van hacia x < 14)
  const ancB = r.piezas.filter((p) => p.tipo === 'anclaje' && p.owner === 'E1/f1');
  assert.ok(ancB.length > 0);
  assert.ok(ancB.every((p) => p.a[2] <= 1e-6 && p.b[0] < p.a[0]), 'anclajes de B contra la pared');
  // ninguna diagonal transversal en el plano de paso de A al cuadro (x = 14, z 0..0,73)
  assert.ok(!r.piezas.some((p) => p.tipo === 'diagonal' && Math.abs(p.a[0] - 14) < 1e-6 && Math.abs(p.b[0] - 14) < 1e-6 && p.a[2] >= -1e-6 && p.b[2] >= -1e-6));
  // sin baranda interior cruzando el paso
  assert.ok(!r.piezas.some((p) => p.tipo === 'baranda' && Math.abs(p.a[0] - 14) < 1e-6 && Math.abs(p.b[0] - 14) < 1e-6 && Math.max(p.a[2], p.b[2]) > 0.5));
});

test('esquina L multi (vano de giro): sin cruces ni pies duplicados', () => {
  const d = M.aplicarReparacion(M.ejemploParana631(), { tipo: 'esquina', estructuraId: 'E1', indice: 0, modo: 'vano_giro' });
  const r = M.construir(d);
  assert.deepEqual(cruces(r), []);
  assert.deepEqual(superpuestos(r), []);
  assert.deepEqual(piesRepetidos(r), []);
  assert.equal(r.estructuras[0].frentes[1].S[0], 0);
});

test('esquina L de bastidor: B con su propio par de pies, cuadro cerrado con caño y grampas', () => {
  const d = M.ejemploParana631();
  d.estructuras[0] = M.cambiarSistema(d.estructuras[0], 'bastidor').estructura;
  const r = M.construir(d);
  const [A, B] = r.estructuras[0].frentes;
  const w = r.estructuras[0].prof;
  assert.ok(B.S[0] >= 0.18 - 1e-9, `B arranca separado (${B.S[0]})`);
  assert.deepEqual(piesRepetidos(r), [], 'ningún pie compartido ni pisado');
  // cada bastidor apoya en pies propios: ningún pie con dos bastidores
  const porPie = new Map();
  for (const p of r.piezas.filter((x) => x.tipo === 'bastidor' && /^BAST-(AND|PAS|PEA)/.test(x.codigo))) {
    for (const q of [p.a, [p.a[0] + (p.b[0] - p.a[0]), 0, p.a[2] + (p.b[2] - p.a[2])]]) {
      const k = `${MMx(q[0])}|${MMx(q[2])}|${MMx(p.a[1])}`;
      porPie.set(k, (porPie.get(k) || 0) + 1);
    }
  }
  assert.ok([...porPie.values()].every((n) => n === 1), 'un bastidor por pie y nivel');
  // pies: 2 por bastidor de cada tira + 1 parante de esquina
  assert.equal(piesDe(r).length, 2 * A.S.length + 2 * B.S.length + 1);
  // cuadro de esquina: x 14..14+w, z −sep..w → tablones, 2 lados de baranda doble y rodapié en cada nivel
  const sx = 14, N = A.niveles.length;
  const dentro = (p) => Math.min(p.a[0], p.b[0]) >= sx - 1e-6 && Math.max(p.a[0], p.b[0]) <= sx + w + 1e-6 && Math.min(p.a[2], p.b[2]) >= -B.S[0] - 1e-6 && Math.max(p.a[2], p.b[2]) <= w + 1e-6;
  const esq = r.piezas.filter((p) => p.owner === 'E1/c1');
  assert.equal(esq.filter((p) => p.tipo === 'plataforma' && /^TAB/.test(p.codigo) && dentro(p)).length, 3 * N);
  assert.equal(esq.filter((p) => p.tipo === 'baranda').length, 4 * N);
  assert.equal(esq.filter((p) => p.tipo === 'rodapie').length, 2 * N);
  assert.ok(bomDe(r, 'NUDO-FIJO') > 0 && r.bom.some((l) => /^CANO-048/.test(l.codigo)));
  assert.ok(!r.bom.some((l) => l.codigo === 'NUDO-GIR'), 'ya no hay nudos sueltos sin función');
  assert.deepEqual(cruces(r), []);
});

// ── resto de hallazgos de revisión ──
function libreMaxVertical(r, estId) {
  let peor = 0;
  for (const c of columnasDe({ piezas: r.piezas.filter((p) => p.estructuraId === estId) })) {
    const ys = new Set();
    for (const p of r.piezas) {
      if (p.tipo !== 'horizontal' || Math.abs(p.a[1] - p.b[1]) > 1e-6) continue;
      if ([p.a, p.b].some((q) => Math.abs(q[0] - c.x) < 1e-3 && Math.abs(q[2] - c.z) < 1e-3)) ys.add(Math.round(p.a[1] * 1000));
    }
    const arr = [...ys].sort((a, b) => a - b).map((y) => y / 1000);
    for (let i = 1; i < arr.length; i++) peor = Math.max(peor, arr[i] - arr[i - 1]);
    if (arr.length) peor = Math.max(peor, arr[0] - c.y0);
  }
  return peor;
}

test('PB: ninguna vertical queda más de 2,00 sin horizontales (también con vía pública)', () => {
  for (const d of [M.ejemploParana631(), M.crearDiseno('estructura'), M.crearDiseno('voladizo')]) {
    const r = M.construir(d);
    const libre = libreMaxVertical(r, 'E1');
    assert.ok(libre <= 2 + 1e-6, `${d.estructuras[0].plantilla}: ${libre}`);
  }
  // con vía pública el travesaño intermedio queda ≥ 2,00 (paso libre)
  const r = M.construir(M.ejemploParana631());
  assert.ok(r.piezas.filter((p) => /:tm/.test(p.id)).every((p) => p.a[1] >= 2 - 1e-6));
});

test('paso bajo la bandeja: aviso con reparación a 1,25 y arranque alto avisado', () => {
  const d = M.ejemploParana631();
  const r = M.construir(d);
  const av = r.avisos.find((a) => /paso peatonal bajo la bandeja/.test(a.texto));
  assert.ok(av && /0,68/.test(av.texto), av?.texto);
  const r2 = M.construir(M.aplicarReparacion(d, av.reparaciones[0].accion));
  assert.ok(!r2.avisos.some((a) => /paso peatonal bajo la bandeja/.test(a.texto)));
  const alto = M.construir(M.crearDiseno('estructura', { altura: 12.2 }));
  const a2 = alto.avisos.find((a) => /arranque a 0,70/.test(a.texto));
  assert.ok(a2);
  const ok = M.construir(M.aplicarReparacion(M.crearDiseno('estructura', { altura: 12.2 }), a2.reparaciones[0].accion));
  assert.ok(!ok.avisos.some((a) => /arranque a/.test(a.texto)));
});

test('torre unida: sin baranda de fachada frente al desembarco; puente de 0,73 con barandas en los extremos', () => {
  for (const modo of ['vertical_compartida', 'vano_giro']) {
    const { diseno } = M.agregarEstructura(M.ejemploParana631(), 'torre_escalera', { unirA: { estructuraId: 'E1', puerto: 'f0:ext', s: 5, modo } });
    const r = M.construir(diseno);
    const des = r.celdas.filter((c) => c.estructuraId === 'E2' && c.estado.desembarco).map((c) => c.y1);
    assert.ok(des.length > 0);
    // ninguna baranda de E1 en z = 0,73 entre x = 5 y 7,5 sobre un desembarco
    const tapa = r.piezas.filter((p) => p.estructuraId === 'E1' && (p.tipo === 'baranda' || p.tipo === 'rodapie') && Math.abs(p.a[2] - 0.73) < 1e-6 && Math.abs(p.b[2] - 0.73) < 1e-6 && Math.min(p.a[0], p.b[0]) >= 5 - 1e-6 && Math.max(p.a[0], p.b[0]) <= 7.5 + 1e-6 && des.some((c) => p.a[1] > c && p.a[1] <= c + 1.01));
    assert.deepEqual(tapa.map((p) => p.id), [], modo);
    assert.match(textos(r.reglasAplicadas), /saqué \d+ barandas y rodapiés/);
    if (modo === 'vano_giro') {
      const nNiv = r.estructuras.find((e) => e.id === 'E2').frentes[0].niveles.length;
      assert.equal(cuenta(r, (p) => /:cbar/.test(p.id) && p.tipo === 'baranda' && p.codigo === 'HOR-048-073'), 4 * nNiv);
      assert.equal(cuenta(r, (p) => /:crod/.test(p.id)), 2 * nNiv);
    }
  }
});

test('pórtico vehicular: baranda por tramos con montantes, tablones, anclajes y defensas', () => {
  const r = M.construir(M.crearDiseno('portico_vehicular'));
  assert.ok(bomDe(r, 'VERT-100-SE') >= 4, 'montantes intermedios');
  const bar = r.piezas.filter((p) => p.tipo === 'baranda' && p.owner === 'E1/p');
  assert.ok(bar.every((p) => Math.hypot(p.b[0] - p.a[0], p.b[2] - p.a[2]) <= 2.5 + 1e-6), 'ningún tramo de baranda > 2,50');
  assert.ok(cuenta(r, (p) => p.tipo === 'rodapie' && p.owner === 'E1/p') >= 6);
  assert.ok(cuenta(r, (p) => p.tipo === 'plataforma' && /^TAB-MET/.test(p.codigo) && p.owner === 'E1/p') >= 9);
  assert.ok(r.resumen.anclajes > 0, 'anclado: cuenta anclajes');
  assert.equal(bomDe(r, 'DEFENSA-VEH'), 2);
  assert.ok(r.avisos.some((a) => /defensas contra impacto/.test(a.texto)));
  const suelto = M.construir(M.setParam(M.crearDiseno('portico_vehicular'), 'E1', 'params.anclado', false));
  assert.equal(suelto.resumen.anclajes, 0);
  assert.ok(suelto.avisos.some((a) => /H\/B/.test(a.texto)));
});

test('laterales: bastidor y pórtico peatonal multi con baranda y rodapié en los extremos', () => {
  const b = M.construir(M.crearDiseno('fachada_bastidor'));
  assert.ok(bomDe(b, 'RDPE-130') + bomDe(b, 'RDPE-090') > 0);
  const pm = M.construir(M.crearDiseno('portico_peatonal', { sistema: 'multi' }));
  assert.ok(cuenta(pm, (p) => p.tipo === 'rodapie') >= pm.estructuras[0].frentes[0].vanos.length + 2);
  assert.ok(cuenta(pm, (p) => /:latL[01]_/.test(p.id)) === 4);
});

test('voladizo: la baranda lateral llega a la punta de la ménsula y el amarre largo lleva caño y grampas', () => {
  const r = M.construir(M.crearDiseno('voladizo'));
  const lat = r.piezas.filter((p) => /:latL[01]m_/.test(p.id) && p.tipo === 'baranda');
  assert.ok(lat.length > 0);
  assert.ok(lat.every((p) => Math.min(p.a[2], p.b[2]) <= -1.09 + 1e-6));
  assert.equal(bomDe(r, 'CANO-048-150'), bomDe(r, 'ANC-QUIM-M12'), 'un caño de 1,50 por anclaje con retiro 1,20');
});

test('cómputo: fenólico por despiece y verticales sin escalonar con suplemento arriba', () => {
  const r = M.construir(M.ejemploParana631());
  assert.equal(bomDe(r, 'PLACA-FEN-122x244'), 7); // 22,73 ml × 0,73 → 19 tiras de 1,22, 3 por placa
  assert.equal(bomDe(r, 'VERT-100-CE'), 0);
  assert.ok(bomDe(r, 'VERT-300-CE') > 0);
  const col = r.piezas.filter((p) => p.tipo === 'vertical' && p.id.startsWith('E1/f0:c0_0:v')).sort((a, b) => a.a[1] - b.a[1]);
  assert.equal(col[0].codigo, 'VERT-300-CE');
  assert.equal(col.at(-1).codigo, 'VERT-050-CE', 'suplemento arriba');
  const esc = M.construir(M.setParam(M.ejemploParana631(), 'E1', 'params.escalonarEmpalmes', true));
  assert.ok(bomDe(esc, 'VERT-100-CE') > 0, 'el escalonado queda como opción');
});

test('esquina entrante multi: el último vano de A es el cuadro y B apoya en sus dos columnas', () => {
  const r = M.construir(M.crearDiseno('estructura', { frentes: [{ largo: 10 }, { largo: 6, angulo: -90 }] }));
  const [A] = r.estructuras[0].frentes;
  assert.equal(A.vanos.at(-1), 0.73);
  assert.equal(r.uniones.find((u) => u.tipo === 'esquina').compartidas, 2);
  // sin baranda exterior de A en el lado de paso hacia B
  const sPaso = A.S.at(-2);
  assert.ok(!r.piezas.some((p) => p.owner === 'E1/f0' && p.tipo === 'baranda' && Math.min(p.a[0], p.b[0]) >= sPaso - 1e-6 && Math.abs(p.a[2] - 0.73) < 1e-6));
});

test('barrido: ninguna plantilla (multi y bastidor) ni L/U/entrante tiene cruces, superposiciones o pies repetidos', () => {
  const casos = [];
  for (const p of M.PLANTILLAS) for (const sis of ['multi', 'bastidor']) {
    const d = M.crearDiseno(p.id);
    if (d.estructuras[0].sistema !== sis) d.estructuras[0] = M.cambiarSistema(d.estructuras[0], sis).estructura;
    casos.push([`${p.id}/${sis}`, d]);
  }
  for (const [nom, frentes] of [['U', [{ largo: 10 }, { largo: 6, angulo: 90 }, { largo: 5, angulo: 90 }]], ['entrante', [{ largo: 10 }, { largo: 6, angulo: -90 }]]]) {
    for (const sis of ['multi', 'bastidor']) {
      const d = M.crearDiseno('estructura', { frentes });
      if (sis === 'bastidor') d.estructuras[0] = M.cambiarSistema(d.estructuras[0], sis).estructura;
      casos.push([`${nom}/${sis}`, d]);
    }
  }
  for (const [nom, d] of casos) {
    const r = M.construir(d);
    assert.deepEqual(cruces(r), [], `${nom}: cruces`);
    assert.deepEqual(superpuestos(r), [], `${nom}: superpuestos`);
    assert.deepEqual(piesRepetidos(r), [], `${nom}: pies`);
  }
});
