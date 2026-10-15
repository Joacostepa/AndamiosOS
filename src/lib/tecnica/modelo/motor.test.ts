// Tests del núcleo del modelador: los 32 de la maqueta, portados y adaptados al esqueleto.
// Correr: node --no-warnings --experimental-strip-types --test "src/lib/tecnica/**/*.test.ts"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from './index.ts';
import type { Diseno, Estructura, Pieza, Resultado } from './index.ts';

const C = M.CATALOGO_FIXTURE;
const build = (d: Diseno) => M.construir(d, C);
const cuenta = (r: Resultado, pred: (p: Pieza) => boolean) => r.piezas.filter(pred).length;
const bomDe = (r: Resultado, codigo: string) => r.bom.filter((l) => l.codigo === codigo).reduce((s, l) => s + l.cantidad, 0);
const textos = (arr: { texto: string }[]) => arr.map((x) => x.texto).join('\n');
const frentes = (r: Resultado, i = 0) => r.estructuras[i].info.frentes as { vanos: number[]; S: number[]; texto: string; niveles: { cota: number; plataforma: boolean }[]; alturaReal: number }[];
const FAMILIAS = new Set(['vertical', 'horizontal', 'baranda', 'diagonal', 'diagonal_planta', 'tablon', 'tablon_escotilla', 'rodapie', 'fenolico', 'base_fija', 'base_regulable', 'collarin', 'rueda', 'rueda_freno', 'estabilizador', 'anclaje', 'mensula', 'viga_celosia', 'viga_puente', 'zanca', 'escalera_interior', 'baranda_escalera', 'bastidor', 'bastidor_baranda', 'rienda_h', 'rienda_d', 'modulo_kit', 'cano', 'grampa_fija', 'grampa_giratoria', 'manguito', 'lona', 'media_sombra', 'chapa', 'colgador', 'recubrimiento', 'esfera', 'defensa', 'accesorio']);
const esBase = (p: Pieza) => p.familia === 'base_regulable' || p.familia === 'base_fija';
const esPlataforma = (p: Pieza) => p.familia === 'tablon' || p.familia === 'tablon_escotilla';

test('catálogo: medidas Coronet confirmadas, pesos nulos a propósito y plausibles marcados', () => {
  assert.deepEqual(C.medidas.multi.vanos, [2.5, 2.0, 1.5, 1.25, 1.09, 0.73]);
  assert.deepEqual(C.medidas.multi.profundidades, [0.73, 1.09, 1.25]);
  const items = Object.values(C.piezas);
  assert.ok(items.filter((i) => i.peso_kg === null).length >= 3, 'hay códigos sin peso');
  assert.ok(M.CODIGOS_PLAUSIBLES.length > 0 && M.CODIGOS_PLAUSIBLES.every((c) => C.piezas[c]));
  for (const k of Object.keys(C.kits)) assert.ok(C.piezas[k], `kit ${k} en catálogo`);
  assert.equal(C.fuente, 'fixture');
  assert.ok(C.piezas['CAÑO-010'] && C.piezas['CAÑO-640'], 'caños reales de 0,10 a 6,40');
});

test('presets: todas las tipologías pedidas, con params y construibles', () => {
  const ids = M.TIPOLOGIAS.flatMap((t) => t.presets.map((p) => p.id));
  for (const id of ['pantalla', 'estructura_pantalla', 'fachada_bastidor', 'torre_escalera', 'torre_acceso', 'portico_peatonal', 'portico_vehicular', 'voladizo', 'libre_vacia', 'libre_desde_medidas']) assert.ok(ids.includes(id), id);
  for (const t of M.TIPOLOGIAS) for (const p of t.presets) {
    assert.ok(p.nombre && p.descripcion && p.icono && p.params, p.id);
    const r = build(M.crearDiseno(p.id));
    assert.ok(r.piezas.length > 20, `${p.id} genera piezas`);
    for (const pz of r.piezas) {
      assert.ok(FAMILIAS.has(pz.familia), `familia ${pz.familia}`);
      if (pz.codigo) assert.ok(C.piezas[pz.codigo], `código ${pz.codigo}`);
      for (const v of [...pz.a, ...pz.b]) assert.ok(Number.isFinite(v));
    }
    assert.equal(r.resumen.etiqueta, 'PREDIMENSIONADO');
    if (t.id !== 'libre') assert.deepEqual(r.resumen.sinCodigo, [], `${p.id}: todo con código en el fixture`);
  }
});

test('rellenarLargo: 14,00 → 5×2,50 + 1,50 con alternativas', () => {
  const r = M.rellenarLargo(14);
  assert.equal(r.texto, '14,00 → 5×2,50 + 1,50');
  assert.equal(r.desvio, 0);
  assert.equal(r.modo, 'catalogo');
  assert.ok(r.alternativas.some((a) => a.texto === '7×2,00'));
  assert.ok(r.alternativas.every((a) => a.texto !== '5×2,50 + 1,50'));
  const c = M.rellenarLargo(14, 'multi', { ajuste: 'centrado' });
  assert.equal(c.vanos[0].medida, 2.5);
  assert.notEqual(c.vanos[c.vanos.length - 1].medida, 1.5);
  const b = M.rellenarLargo(14, 'bastidor');
  assert.ok(b.vanos.every((v) => v.medida === 2.5 || v.medida === 1.5));
  assert.equal(b.desvio, 0);
  for (const L of [3.1, 7.7, 9.99, 22, 31.4]) {
    const x = M.rellenarLargo(L);
    assert.ok(Math.abs(x.desvio) <= 0.1 + 1e-9, `${L} → ${x.texto}`);
    assert.ok(x.vanos.every((v) => C.medidas.multi.vanos.includes(v.medida) && !v.libre));
  }
});

test('ejemplo Paraná 631: fachada en L generada, resumen y 2–3 faltantes ilustrativos', () => {
  const d = M.ejemploParana631();
  assert.match(d.nombre, /Paraná 631/);
  const r = build(d);
  const F = frentes(r);
  assert.equal(F.length, 2);
  assert.equal(F[0].texto, '14,00 → 5×2,50 + 1,50');
  assert.ok(r.resumen.m2 > 380 && r.resumen.m2 < 440, `m2 ${r.resumen.m2}`);
  assert.equal(r.resumen.pesoParcial, true);
  assert.ok(r.resumen.codigosSinPeso.includes('DIAG-200x250'));
  assert.ok(r.resumen.faltantesStock.length >= 2 && r.resumen.faltantesStock.length <= 3, JSON.stringify(r.resumen.faltantesStock));
  assert.match(r.resumen.texto, /PREDIMENSIONADO/);
  assert.deepEqual(F[1].vanos, [0.73, 2.5, 2.5, 1.5, 1.5]);
  assert.equal(F[1].S[0], -0.73);
  assert.equal(F[1].S[1], 0);
  // una celda de cara por vano exterior y banda
  const ext = r.estructuras[0].esqueleto.vanos.filter((v) => v.cara === 'exterior');
  for (const v of ext) assert.ok(r.celdas.some((c) => c.vanoId === v.id && c.tipo === 'cara'), v.id);
  assert.match(textos(r.reglas), /Agregué \d+ anclajes por la media sombra/);
  assert.ok(r.uniones.some((u) => u.tipo === 'esquina' && u.modo === 'vertical_compartida' && u.compartidas === 2));
  assert.ok(r.puertos.some((p) => p.id === 'f1:ext'));
  // primer nivel a 2,00 del arranque (2,50) y cada 2,00: el último queda a 16,50 (la baranda llega a 17,50)
  assert.equal(F[0].niveles[0].cota, 2.5);
  assert.equal(F[0].niveles.at(-1)!.cota, 16.5);
  assert.equal(F[0].alturaReal, 17.5);
});

test('ids estables y construir() puro', () => {
  const d = M.ejemploParana631();
  const antes = JSON.stringify(d);
  const r1 = build(d);
  const r2 = build(d);
  assert.equal(JSON.stringify(d), antes, 'no muta el diseño');
  assert.deepEqual(r1.piezas.map((p) => p.id), r2.piezas.map((p) => p.id));
  assert.equal(new Set(r1.piezas.map((p) => p.id)).size, r1.piezas.length, 'ids únicos');
  const r3 = build(M.setParam(d, 'E1', 'params.cubierta', 'nada'));
  const vert = (r: Resultado) => r.piezas.filter((p) => p.familia === 'vertical').map((p) => p.id).sort();
  assert.deepEqual(vert(r1), vert(r3));
});

test('fusionarNodos: la esquina comparte dos verticales y la torre dos', () => {
  const d = M.ejemploParana631();
  const r = build(d);
  const bases = cuenta(r, esBase);
  assert.equal(bases, 7 * 2 + 6 * 2 - 2);
  const { diseno: d2 } = M.agregarEstructura(d, 'torre_escalera', { unirA: { estructuraId: 'E1', puerto: 'f1:ext', s: 2.5 } });
  const r2 = build(d2);
  const u = r2.uniones.find((x) => x.tipo === 'estructura')!;
  assert.equal(u.modo, 'vertical_compartida');
  assert.equal(u.compartidas, 2);
  assert.equal(cuenta(r2, esBase), bases + 4 - 2);
  assert.match(textos(r2.reglas), /comparte 2 verticales con Fachada L · Frente B/);
  assert.equal(d2.estructuras[1].params.altura, 17.5, 'hereda la altura');
  assert.match(textos(r2.reglas), /acceso es por la torre/);
  assert.equal(bomDe(r2, 'ESC-INT-MULTI'), 0);
  const porNodoY = new Map<string, number>();
  for (const p of r2.piezas.filter((x) => x.familia === 'vertical' && x.nodo)) {
    const k = `${p.nodo}|${Math.round(p.a[1] * 100)}`;
    porNodoY.set(k, (porNodoY.get(k) || 0) + 1);
  }
  assert.ok([...porNodoY.values()].every((n) => n === 1));
});

test('esquina conmutable a vano de giro', () => {
  const d = M.aplicarReparacion(M.ejemploParana631(), { tipo: 'param', estructuraId: 'E1', ruta: 'params.esquinas.0', valor: 'vano_giro' });
  const r = build(d);
  const u = r.uniones.find((x) => x.tipo === 'esquina')!;
  assert.equal(u.modo, 'vano_giro');
  assert.ok(r.piezas.some((p) => esBase(p) && Math.abs(p.a[0] - 14.73) < 1e-6 && Math.abs(p.a[2] - 0.73) < 1e-6), 'vertical de esquina');
  assert.deepEqual(u.alternar, { tipo: 'param', estructuraId: 'E1', ruta: 'params.esquinas.0', valor: 'vertical_compartida' });
});

test('abertura 2×2: propone viga, quita verticales interiores; sin viga da error con reparación', () => {
  const d0 = M.ejemploParana631();
  const celdas = ['f0e1@N0', 'f0e2@N0', 'f0e1@N1', 'f0e2@N1'];
  const d = M.aplicarReparacion(d0, { tipo: 'overrides', estructuraId: 'E1', celdas, valor: { abertura: true } });
  const r0 = build(d0);
  const r = build(d);
  const vigas = (x: Resultado) => cuenta(x, (p) => p.familia === 'viga_celosia' || p.familia === 'viga_puente');
  assert.equal(vigas(r), 2);
  assert.equal(cuenta(r, esBase), cuenta(r0, esBase) - 2);
  assert.match(textos(r.reglas), /Propuse viga celosía de 5,00/);
  const k0 = r.estructuras[0].esqueleto.cotas.indexOf(frentes(r)[0].niveles[0].cota);
  assert.ok(!r.piezas.some((p) => esPlataforma(p) && p.celda === `f0p1@${k0}`), 'sin plataforma en el hueco');
  const sin = M.setOverride(d, 'E1', 'f0e1@N0', { viga: false });
  const rs = build(sin);
  const av = rs.avisos.find((a) => a.nivel === 'error' && /sin viga/.test(a.texto));
  assert.ok(av && av.reparaciones.length === 1);
  const arreglado = build(M.aplicarReparacion(sin, av!.reparaciones[0].accion));
  assert.equal(vigas(arreglado), 2);
  const alto = M.setParam(d, 'E1', 'params.altura', 14);
  assert.deepEqual(alto.estructuras[0].overrides, d.estructuras[0].overrides);
  assert.equal(vigas(build(alto)), 2);
});

test('pincel: sin plataforma, lona, ménsula y anclaje', () => {
  const d = M.ejemploParana631();
  const r0 = build(d);
  const k = 'f0e3@N4';
  const kk = r0.estructuras[0].esqueleto.cotas.indexOf(frentes(r0)[0].niveles[4].cota);
  const sinPlat = build(M.setOverride(d, 'E1', k, { sinPlataforma: true }));
  assert.ok(r0.piezas.some((p) => esPlataforma(p) && p.celda === `f0p3@${kk}`));
  assert.ok(!sinPlat.piezas.some((p) => esPlataforma(p) && p.celda === `f0p3@${kk}`));
  const lona = build(M.setOverride(d, 'E1', k, { lona: true }));
  assert.ok(lona.piezas.some((p) => p.codigo === 'LONA-PVC' && p.celda?.startsWith('f0e3@')));
  // sin vuelo en el override: el de la plantilla (0,73) → horizontal + diagonal 2,00 × 0,73 por columna
  const mens = build(M.setOverride(d, 'E1', k, { mensula: 'afuera' }));
  assert.equal(cuenta(mens, (p) => p.familia === 'mensula'), 0);
  assert.equal(cuenta(mens, (p) => p.id.includes(':md:') && p.codigo === 'DIAG-200x073'), 2);
  assert.equal(cuenta(mens, (p) => p.id.includes(':mh:') && p.codigo === 'HOR-048-073'), 2);
  const corta = build(M.setOverride(d, 'E1', k, { mensula: 'afuera', brazoMensula: 0.45 }));
  assert.equal(cuenta(corta, (p) => p.familia === 'mensula'), 2);
  const sinAnc = build(M.setOverride(d, 'E1', 'f0e0@N7', { anclaje: false }));
  assert.equal(sinAnc.resumen.anclajes, r0.resumen.anclajes - 1);
  assert.equal(M.setOverride(M.setOverride(d, 'E1', k, { lona: true }), 'E1', k, null).estructuras[0].overrides[k], undefined);
});

test('regla de anclajes por media sombra se puede deshacer', () => {
  const d = M.ejemploParana631();
  const r = build(d);
  const regla = r.reglas.find((x) => /media sombra/.test(x.texto))!;
  const n = +/Agregué (\d+)/.exec(regla.texto)![1];
  const r2 = build(M.aplicarReparacion(d, regla.deshacer));
  assert.equal(r2.resumen.anclajes, r.resumen.anclajes - n);
  assert.ok(!r2.reglas.some((x) => /media sombra/.test(x.texto)));
});

test('setParam del largo descarta el relleno elegido', () => {
  let d = M.aplicarReparacion(M.ejemploParana631(), { tipo: 'param', estructuraId: 'E1', ruta: 'params.frentes.0.vanos', valor: [2, 2, 2, 2, 2, 2, 2] });
  assert.equal(frentes(build(d))[0].texto, '14,00 → 7×2,00');
  d = M.setParam(d, 'E1', 'params.frentes.0.largo', 16);
  assert.equal((d.estructuras[0].params.frentes as { vanos?: number[] }[])[0].vanos, undefined);
  assert.match(frentes(build(d))[0].texto, /^16,00 → /);
});

test('cambiarSistema: multi ↔ bastidor con avisos y kit/despiezado', () => {
  const d = M.ejemploParana631();
  const { estructura, avisos } = M.cambiarSistema(d.estructuras[0], 'bastidor');
  assert.equal(estructura.sistema, 'bastidor');
  assert.ok(avisos.some((a) => /Frente A: 14,00 → 5×2,50 \+ 1,50/.test(a)));
  assert.ok(avisos.some((a) => /Altura real/.test(a)));
  const db = { ...d, estructuras: [estructura] };
  const rk = build(db);
  assert.ok(rk.bom.some((l) => l.esKit));
  const desp = M.calcularBom(rk.piezas, C, 'despiezado');
  assert.ok(!desp.some((l) => l.esKit));
  const suma = (ls: typeof desp, re: RegExp) => ls.filter((l) => re.test(l.codigo || '')).reduce((s, l) => s + l.cantidad, 0);
  assert.equal(suma(desp, /^BAST-(AND|PAS)/), suma(rk.bom, /^MOD-AND/) + suma(rk.bom, /^BAST-(AND|PAS)/));
  const dd = M.aplicarReparacion(db, { tipo: 'modoBom', modo: 'despiezado' });
  assert.equal(build(dd).resumen.modoBom, 'despiezado');
  const b = M.cambiarSistema(M.crearDiseno('estructura', { frentes: [{ largo: 12.9 }] }).estructuras[0], 'bastidor');
  assert.ok(b.avisos.some((a) => /sobran|faltan/.test(a)), b.avisos.join(' | '));
  const back = M.cambiarSistema(estructura, 'multi');
  assert.equal(back.estructura.sistema, 'multi');
  assert.ok(C.medidas.multi.profundidades.includes(back.estructura.params.profundidad as number));
  const veh = M.cambiarSistema(M.crearDiseno('portico_vehicular').estructuras[0], 'bastidor');
  assert.equal(veh.estructura.sistema, 'multi');
});

test('pórtico peatonal: gálibo ≥ 2,50 y paso ≥ 1,20 con reparación de un clic', () => {
  const ok = build(M.crearDiseno('portico_peatonal'));
  assert.ok(!ok.avisos.some((a) => a.nivel === 'error'));
  assert.ok(ok.bom.some((l) => l.codigo === 'MOD-PEA-STD-130x250x250'));
  const multi = M.aplicarReparacion(M.crearDiseno('portico_peatonal'), { tipo: 'sistema', estructuraId: 'E1', sistema: 'multi' });
  const bajo = M.setParam(multi, 'E1', 'params.alturaLibre', 2.2);
  const rb = build(bajo);
  const av = rb.avisos.find((a) => a.nivel === 'error' && /Altura libre/.test(a.texto))!;
  assert.ok(av);
  assert.equal(av.reparaciones[0].etiqueta, 'Subir a 2,50');
  assert.ok(!build(M.aplicarReparacion(bajo, av.reparaciones[0].accion)).avisos.some((a) => a.nivel === 'error'));
  const angosto = build(M.crearDiseno('portico_peatonal', { ancho: 0.9 }));
  assert.ok(angosto.avisos.some((a) => a.nivel === 'error' && /Paso libre/.test(a.texto)));
});

test('pórtico como base de la fachada (apoyo)', () => {
  const d = M.crearDiseno('estructura_pantalla', { frentes: [{ largo: 10 }], altura: 12 });
  const { diseno } = M.agregarEstructura(d, 'portico_peatonal', { unirA: { estructuraId: 'E1', puerto: 'f0:base', s: 0 } });
  const r = build(diseno);
  assert.deepEqual(r.estructuras[0].apoyaEn, ['E2']);
  assert.equal(cuenta(r, (p) => p.estructuraId === 'E1' && esBase(p)), 0, 'la fachada no baja al piso');
  const tope = r.estructuras.find((e) => e.id === 'E2')!.info.yTope as number;
  const vertE1 = r.piezas.filter((p) => p.estructuraId === 'E1' && p.familia === 'vertical');
  assert.ok(Math.min(...vertE1.map((p) => p.a[1])) >= tope - 1e-6);
  assert.match(textos(r.reglas), /se apoya sobre Pórtico peatonal/);
});

test('pórtico vehicular: vigas de celosía, gálibo 4,50, luz máxima', () => {
  const r = build(M.crearDiseno('portico_vehicular'));
  assert.equal(bomDe(r, 'VIGA-CEL-600'), 2);
  assert.ok((r.estructuras[0].info.galibo as number) >= 4.5);
  const largo = build(M.crearDiseno('portico_vehicular', { luz: 8.5 }));
  const e = largo.avisos.find((a) => a.nivel === 'error');
  assert.ok(e && /7,50/.test(e.texto));
  const bajo = build(M.crearDiseno('portico_vehicular', { galibo: 3.8 }));
  assert.ok(bajo.avisos.some((a) => /Gálibo 3,80/.test(a.texto)));
  const d = M.crearDiseno('estructura', { frentes: [{ largo: 20 }], altura: 12 });
  const { diseno } = M.agregarEstructura(d, 'portico_vehicular', { unirA: { estructuraId: 'E1', puerto: 'f0:base', s: 5 } });
  const rv = build(diseno);
  assert.ok(rv.estructuras[0].esqueleto.columnas.some((c) => c.apoyo === 'sobre'), 'columnas sobre el pórtico');
  assert.ok(cuenta(rv, (p) => p.estructuraId === 'E1' && esBase(p)) > 0);
});

test('voladizo con ménsulas: hacia la fachada, choque y reparación', () => {
  const r = build(M.crearDiseno('voladizo'));
  // vuelo 1,09: horizontal + diagonal 2,00 × 1,09 por parante (sin pieza ménsula)
  assert.ok(r.piezas.some((p) => p.id.includes(':md:') && p.codigo === 'DIAG-200x109'));
  assert.equal(bomDe(r, 'MENSULA-109'), 0);
  assert.ok(!r.avisos.some((a) => a.nivel === 'error'));
  assert.match(textos(r.reglas), /Ménsulas hacia la fachada/);
  const d = M.crearDiseno('voladizo', { retiro: 0.6 });
  const e = build(d).avisos.find((a) => a.nivel === 'error' && /choca/.test(a.texto))!;
  assert.ok(e);
  assert.ok(!build(M.aplicarReparacion(d, e.reparaciones[0].accion)).avisos.some((a) => a.nivel === 'error'));
  const afuera = build(M.crearDiseno('estructura', { mensulas: [{ lado: 'afuera', brazo: 0.73, desdeNivel: 3, hastaNivel: 3 }] }));
  assert.ok(afuera.piezas.some((p) => p.id.includes(':md:') && p.codigo === 'DIAG-200x073'));
  assert.ok(afuera.avisos.some((a) => /M09/.test(a.texto)));
  const bast = build(M.crearDiseno('voladizo', { sistema: 'bastidor' }));
  assert.ok(bast.avisos.some((a) => /ménsulas son de multidireccional/.test(a.texto)));
});

test('torres: escalera con zancas, H/B > 3 suelta con reparaciones', () => {
  // el preset viene anclado (como en obra): sin aviso de esbeltez y con anclajes
  const r = build(M.crearDiseno('torre_escalera'));
  assert.equal(bomDe(r, 'ZANCA-ESC-150x250'), frentes(r)[0].niveles.length);
  assert.ok(!r.avisos.some((a) => /H\/B/.test(a.texto)));
  assert.ok(r.piezas.some((p) => p.familia === 'anclaje'));
  const suelta = M.crearDiseno('torre_escalera', { anclada: false });
  const av = build(suelta).avisos.find((a) => /H\/B/.test(a.texto))!;
  assert.ok(av);
  assert.deepEqual(av.reparaciones.map((x) => x.etiqueta).slice(0, 2), ['Anclar', 'Pata de gallo']);
  assert.ok(!build(M.aplicarReparacion(suelta, av.reparaciones[0].accion)).avisos.some((a) => /H\/B/.test(a.texto)));
  const pata = build(M.crearDiseno('torre_escalera', { pataDeGallo: true, altura: 10 }));
  assert.ok(pata.piezas.some((p) => p.codigo === 'DIAG-150x250'));
  const acc = build(M.crearDiseno('torre_acceso'));
  assert.ok(bomDe(acc, 'ESC-INT-MULTI') > 0 && bomDe(acc, 'TAB-ESC-250') > 0);
});

test('pantalla: bandeja de fenólico a ≥ 2,50, esferas y mínimo de anclajes', () => {
  const r = build(M.crearDiseno('pantalla'));
  assert.ok(bomDe(r, 'PLACA-FEN-122x244') > 0 && bomDe(r, 'ESFERA-SEG') > 0);
  assert.ok(frentes(r)[0].niveles[0].cota >= 2.5);
  assert.ok(r.resumen.anclajes >= 5);
});

test('puertos, buscarSnap y unir', () => {
  const d = M.ejemploParana631();
  const movil: Estructura = M.crearDiseno('torre_escalera').estructuras[0];
  movil.id = 'X';
  const s = M.buscarSnap(d, movil, [15.5, -3])!;
  assert.equal(s.a.puerto, 'f1:ext');
  assert.equal(s.modo, 'vertical_compartida');
  assert.equal(M.buscarSnap(d, movil, [60, 60]), null);
  const ext = M.puertosDe(d.estructuras[0]).find((p) => p.id === 'f0:ext')!;
  assert.deepEqual(ext.cols, [0, 2.5, 5, 7.5, 10, 12.5, 14]);
  const { diseno } = M.agregarEstructura(d, 'torre_escalera', { unirA: { estructuraId: 'E1', puerto: 'f0:ext', s: 5, modo: 'vano_giro' } });
  const r = build(diseno);
  const u = r.uniones.find((x) => x.tipo === 'estructura')!;
  assert.equal(u.modo, 'vano_giro');
  assert.ok(r.piezas.some((p) => p.owner === u.id && p.codigo === 'HOR-048-073'));
  assert.equal(M.aplicarReparacion(diseno, { tipo: 'quitarUnion', unionId: u.id }).uniones.length, 0);
  const quitada = M.quitarEstructura(diseno, 'E2');
  assert.equal(quitada.estructuras.length, 1);
  assert.equal(quitada.uniones.length, 0);
});

// El benchmark de velocidad (Paraná 631) vive en scripts/bench-modelador.mts (npm run bench): con umbrales en
// ms era inestable en la suite bajo carga.

// ── esquinas en L: geometría construible ──
const MMx = (v: number) => Math.round(v * 1000);
const esHoriz = (p: Pieza) => ['horizontal', 'baranda', 'rodapie', 'rienda_h'].includes(p.familia) && Math.abs(p.a[1] - p.b[1]) < 1e-6 && Math.hypot(p.b[0] - p.a[0], p.b[2] - p.a[2]) > 0.05;
function columnasDe(r: { piezas: Pieza[] }) {
  const cols = new Map<string, [number, number]>();
  for (const p of r.piezas) {
    if (p.familia !== 'vertical' || Math.abs(p.a[0] - p.b[0]) > 1e-6 || Math.abs(p.a[2] - p.b[2]) > 1e-6) continue;
    const k = `${MMx(p.a[0])}|${MMx(p.a[2])}`;
    const y0 = Math.min(p.a[1], p.b[1]);
    const y1 = Math.max(p.a[1], p.b[1]);
    const c = cols.get(k);
    cols.set(k, c ? [Math.min(c[0], y0), Math.max(c[1], y1)] : [y0, y1]);
  }
  return [...cols].map(([k, yy]) => {
    const [x, z] = k.split('|').map((v) => +v / 1000);
    return { x, z, y0: yy[0], y1: yy[1] };
  });
}
function cruces(r: Resultado): string[] {
  const cols = columnasDe(r);
  const out: string[] = [];
  for (const p of r.piezas.filter(esHoriz)) {
    const dx = p.b[0] - p.a[0];
    const dz = p.b[2] - p.a[2];
    const L2 = dx * dx + dz * dz;
    const L = Math.sqrt(L2);
    for (const c of cols) {
      if (p.a[1] < c.y0 - 1e-6 || p.a[1] > c.y1 + 1e-6) continue;
      const t = ((c.x - p.a[0]) * dx + (c.z - p.a[2]) * dz) / L2;
      if (t * L < 0.01 || (1 - t) * L < 0.01) continue;
      if (Math.hypot(p.a[0] + t * dx - c.x, p.a[2] + t * dz - c.z) < 0.005) out.push(`${p.id} pasa por (${c.x}; ${c.z})`);
    }
  }
  return out;
}
function superpuestos(r: Resultado): string[] {
  const hs = r.piezas.filter(esHoriz);
  const porY = new Map<number, Pieza[]>();
  for (const p of hs) {
    const k = MMx(p.a[1]);
    if (!porY.has(k)) porY.set(k, []);
    porY.get(k)!.push(p);
  }
  const out: string[] = [];
  for (const g of porY.values()) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    const p = g[i];
    const q = g[j];
    if ((p.familia === 'rodapie') !== (q.familia === 'rodapie')) continue;
    const ux = p.b[0] - p.a[0];
    const uz = p.b[2] - p.a[2];
    const L = Math.hypot(ux, uz);
    const cr = (x: number, z: number) => Math.abs(((x - p.a[0]) * uz - (z - p.a[2]) * ux) / L);
    if (cr(q.a[0], q.a[2]) > 0.005 || cr(q.b[0], q.b[2]) > 0.005) continue;
    const pr = (x: number, z: number) => ((x - p.a[0]) * ux + (z - p.a[2]) * uz) / L;
    const t0 = Math.min(pr(q.a[0], q.a[2]), pr(q.b[0], q.b[2]));
    const t1 = Math.max(pr(q.a[0], q.a[2]), pr(q.b[0], q.b[2]));
    if (Math.min(L, t1) - Math.max(0, t0) > 0.01) out.push(`${p.id} ⟂ ${q.id}`);
  }
  return out;
}
const piesDe = (r: Resultado) => r.piezas.filter((p) => esBase(p) && /^TORN/.test(p.codigo || '')).map((p) => [p.a[0], p.a[2]]);
function piesRepetidos(r: Resultado, dMin = 0.15): string[] {
  const pies = piesDe(r);
  const out: string[] = [];
  for (let i = 0; i < pies.length; i++) for (let j = i + 1; j < pies.length; j++) if (Math.hypot(pies[i][0] - pies[j][0], pies[i][1] - pies[j][1]) < dMin) out.push(`${pies[i]} ~ ${pies[j]}`);
  return out;
}

test('esquina L multi (vertical compartida): sin cruces, sin superposiciones, sin verticales duplicadas', () => {
  const r = build(M.ejemploParana631());
  assert.deepEqual(cruces(r), [], 'ningún tubo pasa por una columna');
  assert.deepEqual(superpuestos(r), [], 'ninguna horizontal superpuesta');
  assert.deepEqual(piesRepetidos(r), [], 'un solo pie por punto');
  const cols = columnasDe(r).map((c) => `${c.x}|${c.z}`);
  for (const k of ['14|0', '14|0.73', '14.73|0', '14.73|0.73']) assert.ok(cols.includes(k), `columna ${k}`);
  const F = frentes(r);
  const nPlat = F[1].niveles.filter((l) => l.plataforma).length;
  const enCuadro = (p: Pieza) => esPlataforma(p) && Math.min(p.a[0], p.b[0]) >= 14 - 1e-6 && Math.max(p.a[0], p.b[0]) <= 14.73 + 1e-6 && Math.min(p.a[2], p.b[2]) >= -1e-6 && Math.max(p.a[2], p.b[2]) <= 0.73 + 1e-6;
  assert.equal(cuenta(r, (p) => enCuadro(p) && p.codigo === 'TAB-MET-073'), 2 * nPlat);
  // anclajes de B (sobre z < 0) contra la pared (hacia x < 14)
  const ancB = r.piezas.filter((p) => p.familia === 'anclaje' && p.a[2] < -1e-6);
  assert.ok(ancB.length > 0);
  assert.ok(ancB.every((p) => p.a[2] <= 1e-6 && p.b[0] < p.a[0]), 'anclajes de B contra la pared');
  assert.ok(!r.piezas.some((p) => p.familia === 'diagonal' && Math.abs(p.a[0] - 14) < 1e-6 && Math.abs(p.b[0] - 14) < 1e-6 && p.a[2] >= -1e-6 && p.b[2] >= -1e-6));
  assert.ok(!r.piezas.some((p) => p.familia === 'baranda' && Math.abs(p.a[0] - 14) < 1e-6 && Math.abs(p.b[0] - 14) < 1e-6 && Math.max(p.a[2], p.b[2]) > 0.5));
});

test('esquina L multi (vano de giro): sin cruces ni pies duplicados', () => {
  const d = M.aplicarReparacion(M.ejemploParana631(), { tipo: 'param', estructuraId: 'E1', ruta: 'params.esquinas.0', valor: 'vano_giro' });
  const r = build(d);
  assert.deepEqual(cruces(r), []);
  assert.deepEqual(superpuestos(r), []);
  assert.deepEqual(piesRepetidos(r), []);
  assert.equal(frentes(r)[1].S[0], 0);
});

test('esquina L de bastidor: B con su propio par de pies, cuadro cerrado con caño y grampas', () => {
  const d = M.ejemploParana631();
  d.estructuras[0] = M.cambiarSistema(d.estructuras[0], 'bastidor').estructura;
  const r = build(d);
  const [A, B] = frentes(r);
  const w = r.estructuras[0].info.prof as number;
  assert.ok(B.S[0] >= 0.18 - 1e-9, `B arranca separado (${B.S[0]})`);
  assert.deepEqual(piesRepetidos(r), [], 'ningún pie compartido ni pisado');
  const porPie = new Map<string, number>();
  for (const p of r.piezas.filter((x) => x.familia === 'bastidor' && /^BAST-(AND|PAS|PEA)/.test(x.codigo || ''))) {
    for (const q of [p.a, p.b]) {
      const k = `${MMx(q[0])}|${MMx(q[2])}|${MMx(p.a[1])}`;
      porPie.set(k, (porPie.get(k) || 0) + 1);
    }
  }
  assert.ok([...porPie.values()].every((n) => n === 1), 'un bastidor por pie y nivel');
  assert.equal(piesDe(r).length, 2 * A.S.length + 2 * B.S.length + 1);
  const N = A.niveles.length;
  const esq = r.piezas.filter((p) => p.elemento?.startsWith('esquina1:'));
  const dentro = (p: Pieza) => Math.min(p.a[0], p.b[0]) >= 14 - 1e-6 && Math.max(p.a[0], p.b[0]) <= 14 + w + 1e-6 && Math.min(p.a[2], p.b[2]) >= -B.S[0] - 1e-6 && Math.max(p.a[2], p.b[2]) <= w + 1e-6;
  assert.equal(esq.filter((p) => p.familia === 'tablon' && dentro(p)).length, 3 * N);
  assert.equal(esq.filter((p) => p.familia === 'cano' && /:bar/.test(p.elemento || '')).length, 4 * N);
  assert.equal(esq.filter((p) => p.familia === 'rodapie').length, 2 * N);
  assert.ok(bomDe(r, 'NUDO-FIJO') > 0 && r.bom.some((l) => /^CAÑO-/.test(l.codigo || '')));
  assert.ok(!r.bom.some((l) => l.codigo === 'NUDO-GIR'), 'ya no hay nudos sueltos sin función');
  assert.deepEqual(cruces(r), []);
});

function libreMaxVertical(r: Resultado, estId: string): number {
  let peor = 0;
  for (const c of columnasDe({ piezas: r.piezas.filter((p) => p.estructuraId === estId) })) {
    const ys = new Set<number>();
    for (const p of r.piezas) {
      if (p.familia !== 'horizontal' || Math.abs(p.a[1] - p.b[1]) > 1e-6) continue;
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
    const r = build(d);
    const libre = libreMaxVertical(r, 'E1');
    assert.ok(libre <= 2 + 1e-6, `${d.estructuras[0].preset}: ${libre}`);
  }
  // con vía pública, los travesaños bajos quedan ≥ 2,00 (paso libre)
  const r = build(M.ejemploParana631());
  const tr = r.piezas.filter((p) => p.familia === 'horizontal' && /:h:f\dt\d+@/.test(p.id));
  assert.ok(tr.length > 0 && tr.every((p) => p.a[1] >= 2 - 1e-6));
});

test('paso bajo la bandeja: aviso con reparación a 1,25 y arranque alto avisado', () => {
  const d = M.ejemploParana631();
  const av = build(d).avisos.find((a) => /paso peatonal bajo la bandeja/.test(a.texto))!;
  assert.ok(av && /0,68/.test(av.texto), av?.texto);
  assert.ok(!build(M.aplicarReparacion(d, av.reparaciones[0].accion)).avisos.some((a) => /paso peatonal bajo la bandeja/.test(a.texto)));
  const a2 = build(M.crearDiseno('estructura', { altura: 12.2 })).avisos.find((a) => /arranque a 0,70/.test(a.texto))!;
  assert.ok(a2);
  assert.ok(!build(M.aplicarReparacion(M.crearDiseno('estructura', { altura: 12.2 }), a2.reparaciones[0].accion)).avisos.some((a) => /arranque a/.test(a.texto)));
});

test('torre unida: sin baranda de fachada frente al desembarco; puente de 0,73 con barandas en los extremos', () => {
  for (const modo of ['vertical_compartida', 'vano_giro'] as const) {
    const { diseno } = M.agregarEstructura(M.ejemploParana631(), 'torre_escalera', { unirA: { estructuraId: 'E1', puerto: 'f0:ext', s: 5, modo } });
    const r = build(diseno);
    const des = r.estructuras.find((e) => e.id === 'E2')!.info.desembarcos as number[];
    assert.ok(des.length > 0);
    const tapa = r.piezas.filter((p) => p.estructuraId === 'E1' && (p.familia === 'baranda' || p.familia === 'rodapie') && Math.abs(p.a[2] - 0.73) < 1e-6 && Math.abs(p.b[2] - 0.73) < 1e-6 && Math.min(p.a[0], p.b[0]) >= 5 - 1e-6 && Math.max(p.a[0], p.b[0]) <= 7.5 + 1e-6 && des.some((c) => p.a[1] > c && p.a[1] <= c + 1.01));
    assert.deepEqual(tapa.map((p) => p.id), [], modo);
    assert.match(textos(r.reglas), /saqué \d+ barandas y rodapiés/);
    if (modo === 'vano_giro') {
      const nNiv = frentes(r, 1)[0].niveles.length;
      assert.equal(cuenta(r, (p) => /:cbar/.test(p.id) && p.familia === 'baranda' && p.codigo === 'HOR-048-073'), 4 * nNiv);
      assert.equal(cuenta(r, (p) => /:crod/.test(p.id)), 2 * nNiv);
    }
  }
});

test('pórtico vehicular: baranda por tramos con montantes, tablones, anclajes y defensas', () => {
  const r = build(M.crearDiseno('portico_vehicular'));
  assert.ok(bomDe(r, 'VERT-100-SE') >= 4, 'montantes intermedios');
  const tablero = r.piezas.filter((p) => p.elemento && /^(bv|bl|rv|rl|tabv)/.test(p.elemento));
  assert.ok(tablero.filter((p) => p.familia === 'baranda').every((p) => Math.hypot(p.b[0] - p.a[0], p.b[2] - p.a[2]) <= 2.5 + 1e-6), 'ningún tramo de baranda > 2,50');
  assert.ok(tablero.filter((p) => p.familia === 'rodapie').length >= 6);
  assert.ok(tablero.filter((p) => p.familia === 'tablon').length >= 9);
  assert.ok(r.resumen.anclajes > 0, 'anclado: cuenta anclajes');
  assert.equal(bomDe(r, 'DEFENSA-VEH'), 2);
  assert.ok(r.avisos.some((a) => /defensas contra impacto/.test(a.texto)));
  const suelto = build(M.setParam(M.crearDiseno('portico_vehicular'), 'E1', 'params.anclado', false));
  assert.equal(suelto.resumen.anclajes, 0);
  assert.ok(suelto.avisos.some((a) => /H\/B/.test(a.texto)));
});

test('laterales: bastidor y pórtico peatonal multi con baranda y rodapié en los extremos', () => {
  const b = build(M.crearDiseno('fachada_bastidor'));
  assert.ok(bomDe(b, 'RDPE-130') + bomDe(b, 'RDPE-090') > 0);
  const pm = build(M.crearDiseno('portico_peatonal', { sistema: 'multi' }));
  const m = frentes(pm)[0].vanos.length;
  assert.ok(cuenta(pm, (p) => p.familia === 'rodapie') >= m + 2);
  assert.equal(cuenta(pm, (p) => p.familia === 'baranda' && /:b:pt\d+@/.test(p.id)), 4);
});

test('voladizo: la baranda lateral llega a la punta de la ménsula y el amarre largo lleva caño y grampas', () => {
  const r = build(M.crearDiseno('voladizo'));
  const lat = r.piezas.filter((p) => /:bml:/.test(p.id) && p.familia === 'baranda');
  assert.ok(lat.length > 0);
  assert.ok(lat.every((p) => Math.min(p.a[2], p.b[2]) <= -1.09 + 1e-6));
  assert.equal(bomDe(r, 'CAÑO-150'), bomDe(r, 'ANC-QUIM-M12'), 'un caño de 1,50 por anclaje con retiro 1,20');
});

const F0alto = (r: Resultado) => frentes(r)[0].alturaReal;

test('cómputo: fenólico por despiece y verticales sin escalonar con suplemento arriba', () => {
  const r = build(M.ejemploParana631());
  assert.equal(bomDe(r, 'PLACA-FEN-122x244'), 7);
  assert.equal(bomDe(r, 'VERT-100-CE'), 0);
  assert.ok(bomDe(r, 'VERT-300-CE') > 0);
  const col = r.piezas.filter((p) => p.familia === 'vertical' && p.id.startsWith('E1:c:f0c0i:v')).sort((a, b) => a.a[1] - b.a[1]);
  assert.equal(col[0].codigo, 'VERT-300-CE');
  const largo = col.reduce((t, p) => t + Math.abs(p.b[1] - p.a[1]), 0);
  assert.ok(Math.abs(col[0].a[1] + largo - F0alto(r)) < 0.01, 'la columna llega a la baranda de arriba');
  assert.ok(col.slice(1).every((p) => p.codigo === 'VERT-200-CE' || p.codigo === 'VERT-050-CE' || p.codigo === 'VERT-150-CE'), 'sin escalonar: 2,00 y suplemento arriba');
  const esc = build(M.setParam(M.ejemploParana631(), 'E1', 'params.escalonarEmpalmes', true));
  assert.ok(bomDe(esc, 'VERT-100-CE') > 0, 'el escalonado queda como opción');
});

test('esquina entrante multi: el último vano de A es el cuadro y B apoya en sus dos columnas', () => {
  const r = build(M.crearDiseno('estructura', { frentes: [{ largo: 10 }, { largo: 6, angulo: -90 }] }));
  const [A] = frentes(r);
  assert.equal(A.vanos.at(-1), 0.73);
  assert.equal(r.uniones.find((u) => u.tipo === 'esquina')!.compartidas, 2);
  const sPaso = A.S.at(-2)!;
  assert.ok(!r.piezas.some((p) => p.familia === 'baranda' && Math.min(p.a[0], p.b[0]) >= sPaso - 1e-6 && Math.abs(p.a[2] - 0.73) < 1e-6 && Math.abs(p.b[2] - 0.73) < 1e-6));
});

test('barrido: ningún preset (multi y bastidor) ni L/U/entrante tiene cruces, superposiciones o pies repetidos', () => {
  const casos: [string, Diseno][] = [];
  for (const t of M.TIPOLOGIAS) for (const p of t.presets) for (const sis of ['multi', 'bastidor'] as const) {
    const d = M.crearDiseno(p.id);
    if (d.estructuras[0].sistema !== sis) d.estructuras[0] = M.cambiarSistema(d.estructuras[0], sis).estructura;
    casos.push([`${p.id}/${sis}`, d]);
  }
  for (const [nom, fr] of [['U', [{ largo: 10 }, { largo: 6, angulo: 90 }, { largo: 5, angulo: 90 }]], ['entrante', [{ largo: 10 }, { largo: 6, angulo: -90 }]]] as const) {
    for (const sis of ['multi', 'bastidor'] as const) {
      const d = M.crearDiseno('estructura', { frentes: fr });
      if (sis === 'bastidor') d.estructuras[0] = M.cambiarSistema(d.estructuras[0], sis).estructura;
      casos.push([`${nom}/${sis}`, d]);
    }
  }
  for (const [nom, d] of casos) {
    const r = build(d);
    assert.deepEqual(cruces(r), [], `${nom}: cruces`);
    assert.deepEqual(superpuestos(r), [], `${nom}: superpuestos`);
    assert.deepEqual(piesRepetidos(r), [], `${nom}: pies`);
  }
});

test('torre escalera: cada zanca sube un módulo (2,00) de anillo a anillo y arranca en el primer anillo', () => {
  const casos: Diseno[] = [M.crearDiseno('torre_escalera')];
  casos.push(M.agregarEstructura(M.ejemploParana631(), 'torre_escalera', { unirA: { estructuraId: 'E1', puerto: 'f1:ext', s: 2.5 } }).diseno);
  for (const d of casos) {
    const r = build(d);
    for (const e of r.estructuras.filter((x) => x.tipologia === 'torre')) {
      const anillos = new Set(e.esqueleto.cotas.map((c) => Math.round(c * 1000)));
      const zancas = r.piezas.filter((p) => p.estructuraId === e.id && p.familia === 'zanca');
      assert.ok(zancas.length > 0);
      for (const z of zancas) {
        assert.ok(Math.abs(Math.abs(z.b[1] - z.a[1]) - 2) < 1e-6, `${z.id}: sube ${Math.abs(z.b[1] - z.a[1])}`);
        assert.ok(anillos.has(Math.round(z.a[1] * 1000)) && anillos.has(Math.round(z.b[1] * 1000)), `${z.id}: extremos en anillos`);
      }
      assert.ok(Math.min(...zancas.map((z) => Math.min(z.a[1], z.b[1]))) > 0.2, 'no arranca en el suelo');
    }
  }
});

test('ningún preset de la galería abre con un aviso o error de configuración', () => {
  // estos avisos son de verificación obligatoria (colgar, volar, cargar una losa): quedan siempre
  const VERIFICAR = new Set(['colgado.soporte', 'voladizo.anclaje', 'azotea.losa', 'envolvente.torre_apoyo', 'via.defensas']);
  for (const t of M.TIPOLOGIAS) for (const p of t.presets) {
    const r = build(M.crearDiseno(p.id, { catalogo: C }));
    const malos = r.avisos.filter((a) => a.nivel !== 'info' && !VERIFICAR.has(a.regla));
    assert.deepEqual(malos.map((a) => `${a.regla}: ${a.texto}`), [], p.id);
  }
});
