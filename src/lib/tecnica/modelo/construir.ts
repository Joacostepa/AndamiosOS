/**
 * construir(diseño) → Resultado. Determinista y puro: resuelve relaciones entre estructuras, genera el
 * esqueleto de cada una con su tipología, lo arma en piezas, procesa uniones, fusiona nodos y calcula la BOM.
 * Todo es PREDIMENSIONADO.
 */
import type { Aviso, CeldaResuelta, Diseno, Esqueleto, Estructura, EstructuraResuelta, Pieza, Poligono, Puerto, Regla, Resultado, UnionResuelta, V2, V3 } from './tipos.ts';
import type { Catalogo } from './catalogo/catalogo.ts';
import { CRITERIOS, type Criterios } from './criterios.ts';
import { PREDIMENSIONADO } from './constantes.ts';
import { armar, Emisor } from './armar/armar.ts';
import { calcularBom } from './bom.ts';
import { fusionarNodos } from './fusionar.ts';
import { rellenarLargo } from './medida/rellenar.ts';
import { celdaId, cubre, indexar, nodoId, panoCeldaId, partirClave, columnasPano } from './esqueleto/esqueleto.ts';
import { categoriaDe, tipologia } from './tipologias/indice.ts';
import type { Generado, Relaciones, Tipologia } from './tipologias/registro.ts';
import { aLocal, dentroPoligono, enBorde, fmt, fmtKg, marco, type Marco, r3, sum } from './util.ts';

export interface EstGenerada {
  est: Estructura;
  tip: Tipologia;
  gen: Generado;
  /** esqueleto efectivo (overrides genéricos y elementos ya aplicados) */
  esqueleto: Esqueleto;
  marco: Marco;
  relaciones: Relaciones;
  /** puertos en mundo */
  puertos: Puerto[];
  /** huella en mundo */
  huella: Poligono;
}

const relVacias = (): Relaciones => ({ soportes: [], conArriba: false, unidaA: [], accesoPorTorre: false });

function soporteDe(a: Estructura, b: Estructura): [Estructura, Estructura] {
  const cat = (e: Estructura) => categoriaDe(e);
  // el pórtico es el soporte; si no hay pórtico, el soporte es «a»
  if (cat(a) === 'portico') return [a, b];
  if (cat(b) === 'portico') return [b, a];
  return [a, b];
}

/** Puerto local → mundo. */
export function puertoMundo(p: Omit<Puerto, 'estructuraId'>, m: Marco, estructuraId: string): Puerto {
  const W = (q: V3) => m.W(q[0], q[1], q[2]);
  const rot = (v: V3): V3 => {
    const q = m.W(v[0], 0, v[2]);
    return [r3(q[0] - m.O[0]), r3(v[1]), r3(q[2] - m.O[1])];
  };
  return { ...p, estructuraId, p0: W(p.p0), p1: W(p.p1), normal: rot(p.normal), d: rot(p.d) };
}

/** Las fachadas leen ménsula y anclaje de sus overrides por banda: acá no se repiten. */
const NODOS_PROPIOS = new Set(['fachada', 'fachada_bastidor']);
/** Mismo brazo que el pincel de ménsula de la estructura libre. */
const BRAZO_MENSULA_PINCEL = 0.73;

/**
 * Aplica los overrides genéricos sobre celdas del esqueleto con la misma clave: diagonal y caño en
 * la celda; ménsula y anclaje en los dos nodos del vano (así el pincel sirve en torres, bandejas…).
 */
function aplicarOverridesGenericos(esq: Esqueleto, est: Estructura): void {
  const vanos = new Map(esq.vanos.map((v) => [v.id, v]));
  const nodos = !NODOS_PROPIOS.has(est.tipologia);
  for (const [clave, o] of Object.entries(est.overrides || {})) {
    if (!/@\d+$/.test(clave)) continue;
    const { id, k } = partirClave(clave);
    const v = vanos.get(id);
    if (!v || k < 0 || k >= esq.cotas.length) continue;
    if (nodos && (o.mensula || o.anclaje)) {
      for (const col of [v.a, v.b]) {
        const nk = nodoId(col, k);
        const n = { ...(esq.nodos[nk] || {}) };
        // la ménsula sale del lado de la cara del vano (afuera en la exterior, hacia la fachada en la interior)
        if (o.mensula) n.mensula = { dir: v.cara === 'interior' ? 'fachada' : 'afuera', brazo: BRAZO_MENSULA_PINCEL };
        if (o.anclaje) n.anclaje = true;
        esq.nodos[nk] = n;
      }
    }
    const ce = { ...(esq.celdas[clave] || {}) };
    if (o.diagonal === false) delete ce.diagonal;
    else if (o.diagonal) ce.diagonal = o.diagonal;
    if (o.cano !== undefined) ce.cano = !!o.cano;
    if (o.diagonalCano !== undefined) ce.diagonalCano = !!o.diagonalCano;
    esq.celdas[clave] = ce;
  }
}

/**
 * Genera todas las estructuras del diseño resolviendo sus relaciones (apoyos, torres unidas, accesos).
 * Orden: soportes primero, después fachadas, después el resto.
 */
export function generarTodas(diseno: Diseno, cat: Catalogo, criterios: Criterios = CRITERIOS): Map<string, EstGenerada> {
  const ests = diseno.estructuras;
  const porId = new Map(ests.map((e) => [e.id, e]));
  const rel = new Map(ests.map((e) => [e.id, relVacias()]));
  const apoyos: { soporte: string; apoyado: string }[] = [];
  const herencias: { fachada: string; torre: string }[] = [];
  for (const u of diseno.uniones || []) {
    const a = porId.get(u.a.estructuraId);
    const b = porId.get(u.b.estructuraId);
    if (!a || !b) continue;
    if (u.modo === 'apoyo') {
      const [s, ap] = soporteDe(a, b);
      apoyos.push({ soporte: s.id, apoyado: ap.id });
      rel.get(s.id)!.conArriba = true;
      continue;
    }
    rel.get(a.id)!.unidaA.push(b.id);
    rel.get(b.id)!.unidaA.push(a.id);
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const cx = categoriaDe(x);
      const cy = categoriaDe(y);
      if (cx === 'fachada' && cy === 'torre') {
        rel.get(x.id)!.accesoPorTorre = true;
        if (y.sistema === x.sistema && y.params.alturaHeredada !== false) herencias.push({ fachada: x.id, torre: y.id });
      }
    }
  }
  for (const e of ests) if (e.apoyo?.tipo === 'sobre_estructura' && porId.has(e.apoyo.estructuraId)) {
    apoyos.push({ soporte: e.apoyo.estructuraId, apoyado: e.id });
    rel.get(e.apoyo.estructuraId)!.conArriba = true;
  }
  const prioridad = (e: Estructura) => {
    if (rel.get(e.id)!.conArriba) return 0;
    const c = categoriaDe(e);
    return c === 'fachada' ? 1 : c === 'torre' ? 3 : 2;
  };
  const orden = [...ests].sort((x, y) => prioridad(x) - prioridad(y));
  const out = new Map<string, EstGenerada>();
  for (const est0 of orden) {
    const tip = tipologia(est0.tipologia);
    if (!tip) continue;
    const r = rel.get(est0.id)!;
    const m = marco(est0.origen, est0.rumbo);
    for (const ap of apoyos.filter((x) => x.apoyado === est0.id)) {
      const s = out.get(ap.soporte);
      if (!s) continue;
      const yTope = typeof s.gen.info?.yTope === 'number' ? (s.gen.info.yTope as number) : s.gen.metricas.alturaReal;
      r.soportes.push({ estructuraId: s.est.id, nombre: s.est.nombre, yTope, huellas: [s.huella.map((q) => aLocal(m, q))] });
    }
    for (const h of herencias.filter((x) => x.torre === est0.id)) {
      const f = out.get(h.fachada);
      if (!f) continue;
      r.alturaHeredada = f.gen.metricas.alturaReal;
      if (typeof f.gen.info?.ARR === 'number') r.arrHeredado = f.gen.info.ARR as number;
    }
    const { params } = tip.normalizar(est0.params as never, est0.sistema);
    const est: Estructura = { ...est0, params };
    const gen = tip.generar(est as never, { diseno, catalogo: cat, criterios, rellenar: rellenarLargo, relaciones: r });
    const esq = structuredClone(gen.esqueleto);
    if (gen.elementos?.length) esq.elementos.push(...gen.elementos);
    if (est.tipologia !== 'libre') aplicarOverridesGenericos(esq, est);
    const puertos = (gen.puertos || []).map((p) => puertoMundo(p, m, est.id));
    const huella = gen.metricas.huella.map((q) => m.P(q));
    out.set(est.id, { est, tip, gen, esqueleto: esq, marco: m, relaciones: r, puertos, huella });
  }
  return out;
}

export function construir(diseno: Diseno, cat: Catalogo, criterios: Criterios = CRITERIOS): Resultado {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const gens = generarTodas(diseno, cat, criterios);
  const avisos: Omit<Aviso, 'id'>[] = [];
  const reglas: Omit<Regla, 'id'>[] = [];
  let piezas: Pieza[] = [];
  for (const g of gens.values()) {
    const a = armar(g.esqueleto, { catalogo: cat, estructuraId: g.est.id, marco: g.marco, regenerable: g.est.tipologia !== 'libre', escalonarEmpalmes: !!g.est.params.escalonarEmpalmes });
    piezas.push(...a.piezas);
    avisos.push(...g.gen.avisos, ...a.avisos);
    reglas.push(...g.gen.reglas);
  }
  // uniones entre estructuras
  const unionesExt: UnionResuelta[] = [];
  for (const u of diseno.uniones || []) {
    const ga = gens.get(u.a.estructuraId);
    const gb = gens.get(u.b.estructuraId);
    if (!ga || !gb) continue;
    const pa = ga.puertos.find((x) => x.id === u.a.puerto);
    const pb = gb.puertos.find((x) => x.id === u.b.puerto);
    const nombreA = pa ? `${ga.est.nombre} · ${pa.etiqueta.split(' · ')[0]}` : ga.est.nombre;
    if (u.modo === 'vano_giro' && pb) piezas.push(...piezasVanoGiro(u.id, gb, pb, cat));
    if (categoriaDe(gb.est) === 'torre' && categoriaDe(ga.est) === 'fachada' && pb && u.modo !== 'apoyo') {
      const quitar = barandasFrenteADesembarco(piezas, ga.est.id, gb, pb, u.modo === 'vano_giro' ? 0.73 : 0, u.modo === 'embebida');
      if (quitar.size) {
        piezas = piezas.filter((p) => !quitar.has(p.id));
        reglas.push({ regla: 'union.desembarco', estructuraId: ga.est.id, texto: `${ga.est.nombre}: saqué ${quitar.size} barandas y rodapiés exteriores frente al desembarco de ${gb.est.nombre}.` });
      }
    }
    if (u.modo === 'embebida') {
      const quitar = embebida(piezas, ga.est.id, gb);
      if (quitar.size) {
        piezas = piezas.filter((p) => !quitar.has(p.id));
        reglas.push({ regla: 'union.embebida', estructuraId: ga.est.id, texto: `${gb.est.nombre} embebida en ${ga.est.nombre}: saqué ${quitar.size} plataformas, diagonales y barandas de ${ga.est.nombre} en su huella.` });
      }
    }
    let apoyado: string | undefined;
    let soporte: string | undefined;
    if (u.modo === 'apoyo') {
      const sop = categoriaDe(ga.est) === 'portico' ? ga : categoriaDe(gb.est) === 'portico' ? gb : ga;
      const ap = sop === ga ? gb : ga;
      apoyado = ap === ga ? nombreA : ap.est.nombre;
      soporte = sop === ga ? nombreA : sop.est.nombre;
    }
    unionesExt.push({
      id: u.id, tipo: 'estructura', modo: u.modo, a: u.a, b: u.b, editable: true, compartidas: 0,
      etiqueta: `${gb.est.nombre} ↔ ${nombreA} · ${u.modo === 'vertical_compartida' ? 'vertical compartida' : u.modo === 'vano_giro' ? 'vano de conexión 0,73' : u.modo === 'embebida' ? 'embebida' : 'apoyo'}`,
      alternar: u.modo === 'apoyo' ? null : { tipo: 'modoUnion', unionId: u.id, modo: u.modo === 'vano_giro' ? 'vertical_compartida' : 'vano_giro' },
      nombreA, nombreB: gb.est.nombre, apoyado, soporte,
    });
  }
  const fus = fusionarNodos(piezas);
  piezas = fus.piezas;
  const internas = [...gens.values()].flatMap((g) => g.gen.uniones || []);
  const uniones = [...internas, ...unionesExt].map((u) => {
    if (u.tipo !== 'estructura') return u;
    let comp = 0;
    for (const [k, n] of Object.entries(fus.compartidas)) {
      const [x, y] = k.split('|');
      if ((x === u.a.estructuraId && y === u.b.estructuraId) || (x === u.b.estructuraId && y === u.a.estructuraId)) comp += n;
    }
    return { ...u, compartidas: comp };
  });
  for (const u of uniones) {
    if (u.tipo !== 'estructura') continue;
    if (u.modo === 'vertical_compartida') reglas.push({ regla: 'union.compartida', estructuraId: u.b.estructuraId, texto: `${u.nombreB} comparte ${u.compartidas} vertical${u.compartidas === 1 ? '' : 'es'} con ${u.nombreA}.`, deshacer: { tipo: 'modoUnion', unionId: u.id, modo: 'vano_giro' } });
    if (u.modo === 'apoyo') reglas.push({ regla: 'union.apoyo', estructuraId: u.b.estructuraId, texto: `${u.apoyado} se apoya sobre ${u.soporte}: las verticales de arriba arrancan en el tope.`, deshacer: { tipo: 'quitarUnion', unionId: u.id } });
    if (u.modo === 'vertical_compartida' && u.compartidas === 0) avisos.push({ regla: 'union.sin_vertical', nivel: 'aviso', estructuraId: u.b.estructuraId, texto: `${u.etiqueta}: no coincide ninguna vertical. Revisá la posición.`, reparaciones: [{ etiqueta: 'Unir con vano de conexión', accion: { tipo: 'modoUnion', unionId: u.id, modo: 'vano_giro' } }] });
  }
  if (fus.fusionadas) reglas.push({ regla: 'fusion', estructuraId: null, texto: `Fusioné ${fus.fusionadas} piezas compartidas (verticales, bases y horizontales que coinciden).` });

  const modoBom = diseno.modoBom || 'kit';
  const bom = calcularBom(piezas, cat, modoBom, diseno.ajustesBom || []);
  // estructuras resueltas, celdas y puertos
  const estructuras: EstructuraResuelta[] = diseno.estructuras.filter((e) => gens.has(e.id)).map((e) => {
    const g = gens.get(e.id)!;
    const apoyaEn = g.relaciones.soportes.map((s) => s.estructuraId);
    return { id: e.id, nombre: e.nombre, tipologia: e.tipologia, esqueleto: g.esqueleto, marco: { origen: [...e.origen] as V2, rumbo: e.rumbo }, m2: g.gen.metricas.m2, ml: g.gen.metricas.ml, alturaReal: g.gen.metricas.alturaReal, huella: g.huella, apoyaEn, regenerable: e.tipologia !== 'libre', info: g.gen.info || {} };
  });
  const avisosNum: Aviso[] = [];
  const pushAviso = (a: Omit<Aviso, 'id'>) => avisosNum.push({ ...a, id: `A${avisosNum.length + 1}` });
  avisos.forEach(pushAviso);
  const celdas: CeldaResuelta[] = [];
  for (const g of gens.values()) celdas.push(...celdasDe(g, avisosNum));
  const puertos = [...gens.values()].flatMap((g) => g.puertos);
  const sinPeso = [...new Set(bom.filter((l) => l.peso_unit === null && l.codigo).map((l) => l.codigo as string))];
  const sinCodigo = bom.filter((l) => l.sinCodigo).map((l) => {
    const p = piezas.find((x) => !x.codigo && `SIN:${x.familia}` === l.clave.split(':').slice(0, 2).join(':'));
    return { clave: l.clave, familia: l.familia, medidas: p?.medidas || {}, cantidad: l.cantidad };
  });
  const pesoKg = Math.round(sum(bom.map((l) => l.peso_total || 0)));
  const faltantes = bom.filter((l) => (l.falta || 0) > 0 && l.codigo).map((l) => ({ codigo: l.codigo as string, falta: l.falta as number }));
  const resumen: Resultado['resumen'] = {
    m2: r3(sum(estructuras.map((r) => r.m2 || 0))),
    ml: r3(sum(estructuras.map((r) => r.ml || 0))),
    alturaMax: r3(Math.max(0, ...estructuras.map((r) => r.alturaReal || 0))),
    pesoKg,
    pesoParcial: sinPeso.length > 0 || sinCodigo.length > 0,
    codigosSinPeso: sinPeso,
    sinCodigo,
    piezas: sum(bom.map((l) => (l.unidad === 'u' ? l.cantidad : 0))),
    piezasAjuste: piezas.filter((p) => p.ajuste).length,
    anclajes: piezas.filter((p) => p.familia === 'anclaje').length,
    faltantesStock: faltantes,
    modoBom,
    etiqueta: PREDIMENSIONADO,
    catalogoFuente: cat.fuente,
    texto: '',
  };
  resumen.texto = `${fmt(resumen.m2, 0)} m² · ${fmt(pesoKg / 1000, 1)} t${resumen.pesoParcial ? '*' : ''} · ${resumen.piezas.toLocaleString('es-AR')} pzs · ${resumen.anclajes} anclajes · ${faltantes.length ? `${faltantes.length} faltan en stock` : 'stock ok'} · ${PREDIMENSIONADO}`;
  if (faltantes.length) pushAviso({ regla: 'stock.faltantes', nivel: 'info', estructuraId: null, texto: `Faltan en stock: ${faltantes.map((f) => `${f.codigo} (${f.falta})`).join(', ')}.`, reparaciones: [] });
  if (sinPeso.length) pushAviso({ regla: 'bom.sin_peso', nivel: 'info', estructuraId: null, texto: `Peso parcial: ${sinPeso.length} código${sinPeso.length > 1 ? 's' : ''} sin peso (${sinPeso.join(', ')}). ${fmtKg(pesoKg)} kg es un mínimo.`, reparaciones: [] });
  if (sinCodigo.length) pushAviso({ regla: 'bom.sin_codigo', nivel: 'aviso', estructuraId: null, texto: `${sinCodigo.length} pieza${sinCodigo.length > 1 ? 's' : ''} sin código en el catálogo: no entra${sinCodigo.length > 1 ? 'n' : ''} al cómputo hasta que Oficina Técnica la${sinCodigo.length > 1 ? 's' : ''} mapee.`, reparaciones: [] });
  pushAviso({ regla: 'predimensionado', nivel: 'info', estructuraId: null, texto: `${PREDIMENSIONADO}: reglas provisorias (⚠) sin firma. No reemplaza la memoria de cálculo.`, reparaciones: [] });
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    piezas, bom, avisos: avisosNum, reglas: reglas.map((x, i) => ({ ...x, id: `R${i + 1}` })), estructuras, celdas, puertos, uniones, resumen, ms: r3(t1 - t0),
  };
}

// ───────────── celdas para alzado y picking ─────────────
function celdasDe(g: EstGenerada, avisos: Aviso[]): CeldaResuelta[] {
  const esq = g.esqueleto;
  const ix = indexar(esq);
  const W = g.marco.W;
  const out: CeldaResuelta[] = [];
  const estadoDe = new Map<string, 'aviso' | 'error'>();
  for (const a of avisos) if (a.estructuraId === g.est.id && a.celda && a.nivel !== 'info') {
    const prev = estadoDe.get(a.celda);
    if (prev !== 'error') estadoDe.set(a.celda, a.nivel === 'error' ? 'error' : 'aviso');
  }
  const ov = g.est.overrides || {};
  for (const v of esq.vanos) {
    const A = ix.col.get(v.a)!;
    const B = ix.col.get(v.b)!;
    for (let k = 1; k < esq.cotas.length; k++) {
      const lo = esq.cotas[k - 1];
      const hi = esq.cotas[k];
      if (!(cubre(A, lo) && cubre(B, lo) && cubre(A, hi) && cubre(B, hi))) continue;
      const clave = celdaId(v.id, k);
      const ce = esq.celdas[clave] || {};
      const panos = ix.panosDeVano.get(v.id) || [];
      out.push({
        id: `${g.est.id}:${clave}`, estructuraId: g.est.id, tipo: 'cara', vanoId: v.id, k, cara: v.cara,
        esquinas: [W(A.p[0], lo, A.p[1]), W(B.p[0], lo, B.p[1]), W(B.p[0], hi, B.p[1]), W(A.p[0], hi, A.p[1])],
        estado: estadoDe.get(clave) || 'ok',
        contenido: {
          plataforma: panos.some((p) => !!esq.celdasPano[panoCeldaId(p.id, k)]?.plataforma),
          diagonal: !!ce.diagonal, baranda: (ce.baranda || 0) > 0, abertura: !!ce.abertura || !!ov[clave]?.abertura,
          cerramiento: ce.cerramiento || null, override: !!ov[clave],
        },
      });
    }
  }
  for (const p of esq.panos) {
    const cols = columnasPano(p, ix).map((id) => ix.col.get(id)!);
    for (let k = 0; k < esq.cotas.length; k++) {
      const c = esq.cotas[k];
      if (!cols.every((x) => cubre(x, c))) continue;
      const clave = panoCeldaId(p.id, k);
      const ce = esq.celdasPano[clave];
      out.push({
        id: `${g.est.id}:${clave}`, estructuraId: g.est.id, tipo: 'pano', panoId: p.id, k,
        esquinas: cols.map((x) => W(x.p[0], c, x.p[1])), estado: estadoDe.get(clave) || 'ok',
        contenido: { plataforma: !!ce?.plataforma, diagonal: !!ce?.diagonalPlanta, baranda: false, abertura: false, cerramiento: null, override: !!ov[clave] },
      });
    }
  }
  return out;
}

// ───────────── piezas de uniones ─────────────
function piezasVanoGiro(unionId: string, gb: EstGenerada, pb: Puerto, cat: Catalogo): Pieza[] {
  const em = new Emisor(cat, gb.est.id, gb.esqueleto.sistema, marco([0, 0], 0));
  const cotas = gb.esqueleto.cotas;
  const n: V2 = [pb.normal[0], pb.normal[2]];
  // niveles de la estructura b (torre: todos sus niveles, aunque la escalera no tenga paño con plataforma)
  const frentesB = gb.gen.info?.frentes as { niveles?: { cota: number }[] }[] | undefined;
  const plats = frentesB?.[0]?.niveles?.map((x) => x.cota) ?? cotas.filter((_, k) => gb.esqueleto.panos.some((p) => gb.esqueleto.celdasPano[panoCeldaId(p.id, k)]?.plataforma));
  const P = (x: number, y: number, z: number): V3 => [r3(x), r3(y), r3(z)];
  pb.cols.forEach((c, k) => {
    const x = pb.p0[0] + pb.d[0] * c;
    const z = pb.p0[2] + pb.d[2] * c;
    cotas.forEach((y, r) => em.add(`${unionId}:con${k}_${r}`, 'horizontal', { largo: 0.73 }, P(x, y, z), P(x + n[0] * 0.73, y, z + n[1] * 0.73)));
  });
  plats.forEach((y, i) => {
    const nt = Math.max(1, Math.round(pb.largo / CRITERIOS.anchoTablon));
    for (let j = 0; j < nt; j++) {
      const c = ((j + 0.5) * pb.largo) / nt;
      const x = pb.p0[0] + pb.d[0] * c;
      const z = pb.p0[2] + pb.d[2] * c;
      em.add(`${unionId}:ctab${i}_${j}`, 'tablon', { largo: 0.73 }, P(x, y, z), P(x + n[0] * 0.73, y, z + n[1] * 0.73));
    }
    for (const [c, k] of [[0, 'a'], [pb.largo, 'b']] as const) {
      const x = pb.p0[0] + pb.d[0] * c;
      const z = pb.p0[2] + pb.d[2] * c;
      for (const dy of [0.5, 1.0]) em.add(`${unionId}:cbar${i}${k}${dy * 10}`, 'baranda', { largo: 0.73 }, P(x, y + dy, z), P(x + n[0] * 0.73, y + dy, z + n[1] * 0.73));
      em.add(`${unionId}:crod${i}${k}`, 'rodapie', { largo: 0.73 }, P(x, y + 0.08, z), P(x + n[0] * 0.73, y + 0.08, z + n[1] * 0.73));
    }
  });
  return em.piezas.map((p) => ({ ...p, owner: unionId, id: p.id.replace(`${gb.est.id}:`, `${gb.est.id}:`) }));
}

/** Barandas y rodapiés de la fachada que tapan el desembarco de una torre unida por su frente. */
function barandasFrenteADesembarco(piezas: Pieza[], fachadaId: string, gb: EstGenerada, pb: Puerto, gap: number, embebida: boolean): Set<string> {
  const quitar = new Set<string>();
  if (embebida) return quitar;
  if (pb.id !== 'frente') return quitar;
  const cotas = (gb.gen.info?.desembarcos as number[] | undefined) || [];
  const loc = (q: V3): V2 => {
    const dx = q[0] - pb.p0[0];
    const dz = q[2] - pb.p0[2];
    return [dx * pb.d[0] + dz * pb.d[2], dx * pb.normal[0] + dz * pb.normal[2]];
  };
  for (const pz of piezas) {
    if (pz.estructuraId !== fachadaId || (pz.familia !== 'baranda' && pz.familia !== 'rodapie')) continue;
    const [sa, ta] = loc(pz.a);
    const [sb, tb] = loc(pz.b);
    if (Math.abs(ta - gap) > 0.02 || Math.abs(tb - gap) > 0.02) continue;
    if (Math.min(sa, sb) < -0.02 || Math.max(sa, sb) > pb.largo + 0.02) continue;
    if (!cotas.some((c) => pz.a[1] > c + 1e-6 && pz.a[1] <= c + 1 + 1e-6)) continue;
    quitar.add(pz.id);
  }
  return quitar;
}

/** Unión embebida: la estructura A pierde plataformas, diagonales y barandas dentro de la huella de B. */
function embebida(piezas: Pieza[], aId: string, gb: EstGenerada): Set<string> {
  const quitar = new Set<string>();
  const h = gb.huella;
  const yMax = gb.gen.metricas.alturaReal;
  const fams = new Set(['tablon', 'tablon_escotilla', 'fenolico', 'diagonal', 'baranda', 'rodapie', 'diagonal_planta']);
  for (const p of piezas) {
    if (p.estructuraId !== aId || !fams.has(p.familia)) continue;
    const m: V2 = [(p.a[0] + p.b[0]) / 2, (p.a[2] + p.b[2]) / 2];
    if (p.a[1] > yMax + 1e-6) continue;
    if (dentroPoligono(m[0], m[1], h) && !enBorde(m[0], m[1], h, 0.01)) quitar.add(p.id);
  }
  // la torre no pone baranda contra las plataformas de A
  for (const p of piezas) {
    if (p.estructuraId !== gb.est.id || (p.familia !== 'baranda' && p.familia !== 'rodapie')) continue;
    const m: V2 = [(p.a[0] + p.b[0]) / 2, (p.a[2] + p.b[2]) / 2];
    const huellaA = piezas.some((q) => q.estructuraId === aId && (q.familia === 'tablon' || q.familia === 'tablon_escotilla') && Math.abs(q.a[1] - p.a[1]) < 1.1 && Math.hypot((q.a[0] + q.b[0]) / 2 - m[0], (q.a[2] + q.b[2]) / 2 - m[1]) < 0.8);
    if (huellaA) quitar.add(p.id);
  }
  return quitar;
}

