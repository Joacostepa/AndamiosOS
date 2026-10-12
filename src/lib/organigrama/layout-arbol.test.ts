// El layout «Árbol» del Lienzo vivo (árbol compacto): los puestos se abren debajo de su área con
// bus y bajadas, en grilla si son muchos; y el área libre que dejan los paneles flotantes.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OPCIONES_LAYOUT,
  areaLibre,
  calcularLayout,
  claseCaja,
  columnasArbol,
  desplazamientoAncla,
  desplazar,
  encuadrar,
  familiaGeo,
  geometriaNaciente,
  limitesDeRama,
  puntosDeArista,
  rutaEntre,
  rutaSvg,
  verticesCodo,
  type Caja,
  type Geometria,
} from "./layout.ts";
import { NODOS_BORRADOR, NODOS_VIGENTES } from "./datos-maqueta.ts";
import type { Nodo } from "./tipos.ts";

const ARBOL = { forma: "arbol" as const };
const se = (a: Caja, b: Caja) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const centroX = (c: Caja) => c.x + c.w / 2;
const puesto = (clave: string, dependeDe: string, orden = 0): Nodo => ({ clave, dependeDe, tipo: "puesto", titulo: clave, tareas: [], noHace: [], kpis: [], orden });

test("árbol: ubica todos los nodos y ninguna caja se pisa", () => {
  for (const nodos of [NODOS_VIGENTES, NODOS_BORRADOR]) {
    const l = calcularLayout(nodos, ARBOL);
    const cajas = Object.entries(l.cajas);
    assert.equal(cajas.length, nodos.length);
    for (let i = 0; i < cajas.length; i++)
      for (let j = i + 1; j < cajas.length; j++) assert.ok(!se(cajas[i][1], cajas[j][1]), `${cajas[i][0]} pisa a ${cajas[j][0]}`);
  }
});

test("árbol: la Dirección arriba y centrada, las áreas en abanico debajo (igual que en lista)", () => {
  const l = calcularLayout(NODOS_VIGENTES, ARBOL);
  const dg = l.cajas.dg;
  assert.equal(dg.y, 0);
  const areas = ["tec_com", "ops", "deposito", "admin", "sistemas"].map((c) => l.cajas[c]);
  assert.ok(areas.every((a) => a.y === areas[0].y && a.y > dg.y));
  for (let i = 1; i < areas.length; i++) assert.ok(areas[i].x > areas[i - 1].x);
  assert.ok(Math.abs(centroX(dg) - (l.limites.minX + l.limites.maxX) / 2) < 1);
  assert.equal(l.aristas.find((a) => a.a === "ops")!.geo.modo, "rama");
});

test("árbol: pocos hijos van en UNA fila debajo del área, centrados bajo ella", () => {
  const l = calcularLayout(NODOS_VIGENTES, ARBOL);
  const dep = l.cajas.deposito;
  const hijos = ["stock", "despacho", "devoluciones"].map((c) => l.cajas[c]);
  assert.ok(hijos.every((h) => h.y === dep.y + dep.h + OPCIONES_LAYOUT.sepYArbol));
  for (let i = 1; i < hijos.length; i++) assert.equal(hijos[i].x, hijos[i - 1].x + hijos[i - 1].w + OPCIONES_LAYOUT.sepXArbol);
  assert.ok(Math.abs((hijos[0].x + hijos.at(-1)!.x + hijos.at(-1)!.w) / 2 - centroX(dep)) < 0.01);
});

test("árbol: con muchos hijos, grilla de 2 columnas; la última fila incompleta va centrada", () => {
  const l = calcularLayout(NODOS_VIGENTES, ARBOL);
  const ops = l.cajas.ops;
  const claves = ["planif", "supervision", "montajes", "taller", "logistica", "seguridad", "vehiculos"];
  const ps = claves.map((c) => l.cajas[c]);
  const filas = [...new Set(ps.map((p) => p.y))].sort((a, b) => a - b);
  assert.equal(filas.length, 4);
  const xs = [...new Set(ps.slice(0, 6).map((p) => p.x))].sort((a, b) => a - b);
  assert.equal(xs.length, 2);
  // Orden de lectura: izquierda a derecha, arriba abajo.
  assert.ok(ps[0].x < ps[1].x && ps[0].y === ps[1].y && ps[2].y > ps[0].y);
  // vehículos solo en la última fila, centrado bajo Operaciones.
  assert.ok(Math.abs(centroX(l.cajas.vehiculos) - centroX(ops)) < 0.01);
  // Mucho más angosto que una fila de 7.
  const lim = limitesDeRama(l, NODOS_VIGENTES, "ops");
  assert.ok(lim.maxX - lim.minX < 3 * OPCIONES_LAYOUT.tamanos.puesto.w);
});

test("columnasArbol: una fila hasta 3; después 2 columnas; más columnas si quedarían más de 4 filas", () => {
  assert.deepEqual([1, 2, 3].map((n) => columnasArbol(n)), [1, 2, 3]);
  assert.deepEqual([4, 7, 8].map((n) => columnasArbol(n)), [2, 2, 2]);
  assert.equal(columnasArbol(9), 3);
  assert.equal(columnasArbol(13), 4);
  assert.equal(columnasArbol(7, { filaMax: 3, columnas: 3, filasMax: 4 }), 3);
});

test("árbol: conectores tipo organigrama: bajan del padre al bus, corren y bajan al hijo", () => {
  const l = calcularLayout(NODOS_VIGENTES, ARBOL);
  for (const a of l.aristas.filter((x) => x.geo.modo === "arbol")) {
    const g = a.geo as Extract<Geometria, { modo: "arbol" }>;
    const p = l.cajas[a.de];
    const h = l.cajas[a.a];
    assert.deepEqual(g.desde, { x: centroX(p), y: p.y + p.h });
    assert.deepEqual(g.hasta, { x: centroX(h), y: h.y });
    assert.ok(g.bus > g.desde.y && g.bus < h.y);
    assert.ok(g.fila >= g.bus && g.fila < h.y);
    // Todos los tramos son horizontales o verticales.
    const v = verticesCodo(g);
    for (let i = 1; i < v.length; i++) assert.ok(v[i].x === v[i - 1].x || v[i].y === v[i - 1].y);
  }
  // Los hijos de la misma fila comparten bus.
  const buses = new Set(l.aristas.filter((a) => a.de === "deposito").map((a) => (a.geo as { bus: number }).bus));
  assert.equal(buses.size, 1);
});

test("árbol: el tronco de la grilla baja por el hueco entre columnas sin cruzar ninguna caja", () => {
  const l = calcularLayout(NODOS_VIGENTES, ARBOL);
  const deOps = l.aristas.filter((a) => a.de === "ops").map((a) => a.geo as Extract<Geometria, { modo: "arbol" }>);
  const troncos = new Set(deOps.filter((g) => g.fila !== g.bus).map((g) => g.tronco));
  assert.equal(troncos.size, 1);
  const tx = [...troncos][0];
  const yMax = Math.max(...deOps.map((g) => g.fila));
  for (const [clave, c] of Object.entries(l.cajas)) {
    if (c.y + c.h <= deOps[0].bus || c.y >= yMax) continue;
    assert.ok(!(c.x < tx && tx < c.x + c.w), `el tronco cruza ${clave}`);
  }
});

test("árbol: profundidad arbitraria (sub-puestos debajo de un puesto) sin pisarse", () => {
  const base = NODOS_BORRADOR;
  const l = calcularLayout(base, ARBOL);
  const log = l.cajas.logistica;
  const coord = l.cajas.coord_logistico;
  assert.ok(coord.y > log.y + log.h);
  assert.ok(Math.abs(centroX(coord) - centroX(log)) < 0.01);
  // Tres niveles más debajo de Taller, uno con 5 hijos (grilla dentro de grilla).
  const profundos = [
    ...base,
    puesto("t1", "taller"),
    puesto("t2", "t1"),
    ...[0, 1, 2, 3, 4].map((i) => puesto(`t3_${i}`, "t2", i)),
  ];
  const p = calcularLayout(profundos, ARBOL);
  assert.equal(Object.keys(p.cajas).length, profundos.length);
  assert.equal(p.profundidad.t3_0, 5);
  const cajas = Object.entries(p.cajas);
  for (let i = 0; i < cajas.length; i++)
    for (let j = i + 1; j < cajas.length; j++) assert.ok(!se(cajas[i][1], cajas[j][1]), `${cajas[i][0]} pisa a ${cajas[j][0]}`);
});

test("árbol: colapsar esconde la rama, cuenta los ocultos y achica el layout", () => {
  const todo = calcularLayout(NODOS_VIGENTES, ARBOL);
  const l = calcularLayout(NODOS_VIGENTES, { ...ARBOL, colapsados: new Set(["ops"]) });
  assert.equal(l.cajas.planif, undefined);
  assert.equal(l.ocultos.ops, 7);
  assert.ok(l.limites.maxX - l.limites.minX < todo.limites.maxX - todo.limites.minX);
});

test("árbol: la vista previa (fantasma) entra como último hijo y anclada no mueve al destino", () => {
  const antes = calcularLayout(NODOS_VIGENTES, ARBOL);
  const con = [...NODOS_VIGENTES, puesto("__fantasma__", "deposito", Number.MAX_SAFE_INTEGER)];
  const despues = calcularLayout(con, ARBOL);
  // 4 hijos: pasa a grilla de 2 × 2, el fantasma abajo a la derecha.
  assert.ok(despues.cajas.__fantasma__.y > despues.cajas.stock.y);
  const d = desplazamientoAncla(antes, despues, "deposito");
  const anclado = desplazar(despues, d.x, d.y);
  assert.deepEqual(anclado.cajas.deposito, antes.cajas.deposito);
  const ar = anclado.aristas.find((a) => a.a === "__fantasma__")!.geo as Extract<Geometria, { modo: "arbol" }>;
  const orig = despues.aristas.find((a) => a.a === "__fantasma__")!.geo as Extract<Geometria, { modo: "arbol" }>;
  assert.equal(ar.bus, orig.bus + d.y);
  assert.equal(ar.tronco, orig.tronco + d.x);
  assert.equal(ar.fila, orig.fila + d.y);
});

test("rutaSvg: lista y árbol tienen la MISMA forma de `d` (el conector se transforma al cambiar)", () => {
  const forma = (d: string) => d.replace(/-?[\d.]+/g, "#");
  const lista = calcularLayout(NODOS_VIGENTES);
  const arbol = calcularLayout(NODOS_VIGENTES, ARBOL);
  const formas = new Set(
    [...lista.aristas, ...arbol.aristas].filter((a) => familiaGeo(a.geo) === "codo").map((a) => forma(rutaSvg(a.geo))),
  );
  assert.equal(formas.size, 1);
  assert.match([...formas][0], /^M # #( L # # Q # # # #){4} L # #$/);
  // Las mismas aristas en las dos formas, con la misma familia (las claves de los conectores no cambian).
  const fam = (l: typeof lista) => l.aristas.map((a) => `${a.a}:${familiaGeo(a.geo)}`).sort();
  assert.deepEqual(fam(lista), fam(arbol));
  // La naciente también (nace del padre con la misma forma).
  for (const a of arbol.aristas) assert.equal(forma(rutaSvg(geometriaNaciente(a.geo))), forma(rutaSvg(a.geo)));
});

test("rutaSvg: la lista conserva su codo redondeado de siempre", () => {
  const d = rutaSvg({ modo: "lista", desde: { x: 0, y: 0 }, hasta: { x: 14, y: 60 }, radio: 10 });
  assert.equal(d, "M 0 0 L 0 0 Q 0 0 0 0 L 0 0 Q 0 0 0 0 L 0 50 Q 0 60 10 60 L 14 60 Q 14 60 14 60 L 14 60");
});

test("árbol: puntosDeArista y rutaEntre siguen los conectores", () => {
  const l = calcularLayout(NODOS_VIGENTES, ARBOL);
  for (const a of l.aristas) {
    const ps = puntosDeArista(a.geo);
    assert.deepEqual(ps[0], a.geo.desde);
    assert.ok(Math.hypot(ps.at(-1)!.x - a.geo.hasta.x, ps.at(-1)!.y - a.geo.hasta.y) < 0.01);
  }
  const ruta = rutaEntre(l, NODOS_VIGENTES, "stock", "vehiculos");
  const c = (k: string) => ({ x: centroX(l.cajas[k]), y: l.cajas[k].y + l.cajas[k].h / 2 });
  assert.deepEqual(ruta[0], c("stock"));
  assert.deepEqual(ruta.at(-1), c("vehiculos"));
  // Pasa por el tronco de Operaciones.
  const g = l.aristas.find((a) => a.a === "vehiculos")!.geo as Extract<Geometria, { modo: "arbol" }>;
  assert.ok(ruta.some((p) => Math.abs(p.x - g.tronco) < 0.01 && p.y > g.bus && p.y < g.fila));
});

test("árbol: entra razonablemente en una notebook (no más ancho que la lista por mucho, y más bajo)", () => {
  const lista = calcularLayout(NODOS_VIGENTES).limites;
  const arbol = calcularLayout(NODOS_VIGENTES, ARBOL).limites;
  const area = { x: 0, y: 0, w: 1100, h: 560 };
  assert.ok(arbol.maxY - arbol.minY < lista.maxY - lista.minY);
  assert.ok(encuadrar(arbol, area, 24, 1).k >= 0.35);
});

test("areaLibre: cada panel corre su borde; sin paneles es todo el lienzo", () => {
  assert.deepEqual(areaLibre(1000, 600, []), { x: 0, y: 0, w: 1000, h: 600 });
  const a = areaLibre(
    1000,
    600,
    [
      { lado: "arriba", x: 8, y: 8, w: 984, h: 48 },
      { lado: "abajo", x: 300, y: 470, w: 400, h: 122 },
      { lado: "izquierda", x: 8, y: 64, w: 160, h: 170 },
      { lado: "derecha", x: 800, y: 300, w: 192, h: 292 },
    ],
    12,
  );
  assert.deepEqual(a, { x: 180, y: 68, w: 800 - 12 - 180, h: 470 - 12 - 68 });
  // Paneles vacíos (no montados) no cuentan.
  assert.deepEqual(areaLibre(500, 400, [{ lado: "arriba", x: 0, y: 0, w: 0, h: 0 }]), { x: 0, y: 0, w: 500, h: 400 });
});

test("areaLibre: si los paneles taparían casi todo, los márgenes se achican y queda un mínimo", () => {
  const a = areaLibre(
    360,
    600,
    [
      { lado: "izquierda", x: 0, y: 0, w: 150, h: 100 },
      { lado: "derecha", x: 200, y: 0, w: 160, h: 100 },
    ],
    0,
    160,
  );
  assert.ok(Math.abs(a.w - 160) < 1e-9);
  assert.ok(a.x > 0 && a.x < 150);
});

test("areaLibre con contenido: elige el hueco donde lo que se encuadra se ve más grande, sin tocar paneles", () => {
  // Pantalla completa: la caja arriba a la izquierda, el minimapa abajo a la derecha.
  const paneles = [
    { lado: "arriba" as const, x: 8, y: 8, w: 1424, h: 46 },
    { lado: "izquierda" as const, x: 8, y: 62, w: 160, h: 170 },
    { lado: "derecha" as const, x: 1246, y: 600, w: 186, h: 292 },
    { lado: "abajo" as const, x: 8, y: 760, w: 1424, h: 132 },
  ];
  const ancho = { w: 2744, h: 808 };
  const central = areaLibre(1440, 900, paneles);
  const a = areaLibre(1440, 900, paneles, 12, 160, ancho);
  const k = (r: { w: number; h: number }) => Math.min((r.w - 48) / ancho.w, (r.h - 48) / ancho.h);
  assert.ok(k(a) > k(central) * 1.05, `${k(a)} vs ${k(central)}`);
  // Más ancha que la central: pasa por encima del minimapa, hasta el borde derecho.
  assert.ok(a.w > central.w);
  assert.equal(a.x + a.w, 1440);
  for (const p of paneles) assert.ok(!(a.x < p.x + p.w && p.x < a.x + a.w && a.y < p.y + p.h && p.y < a.y + a.h), `tapa ${p.lado}`);
  // Algo alto y angosto prefiere el centro (entre la caja y el minimapa, de arriba a abajo).
  const alto = areaLibre(1440, 900, paneles, 12, 160, { w: 600, h: 1400 });
  assert.ok(alto.h > a.h);
  for (const p of paneles) assert.ok(!(alto.x < p.x + p.w && p.x < alto.x + alto.w && alto.y < p.y + p.h && p.y < alto.y + alto.h), `tapa ${p.lado}`);
});

test("encuadrar dentro del área libre: la Dirección no queda debajo de la barra ni lo de abajo debajo del banco", () => {
  const l = calcularLayout(NODOS_VIGENTES, ARBOL);
  const area = areaLibre(1200, 640, [
    { lado: "arriba", x: 8, y: 8, w: 1184, h: 52 },
    { lado: "abajo", x: 300, y: 500, w: 600, h: 132 },
    { lado: "izquierda", x: 8, y: 68, w: 160, h: 170 },
    { lado: "derecha", x: 990, y: 260, w: 202, h: 372 },
  ]);
  const cam = encuadrar(l.limites, area, 24, 1);
  const pantalla = (x: number, y: number) => ({ x: x * cam.k + cam.x, y: y * cam.k + cam.y });
  const arriba = pantalla(l.limites.minX, l.limites.minY);
  const abajo = pantalla(l.limites.maxX, l.limites.maxY);
  assert.ok(arriba.y >= area.y && arriba.x >= area.x);
  assert.ok(abajo.y <= area.y + area.h && abajo.x <= area.x + area.w);
});

// ── Jerarquía: tamaños por clase y grupos de área ─────────────────────────────

const area = (clave: string, dependeDe: string, orden = 0): Nodo => ({ clave, dependeDe, tipo: "area", titulo: clave, color: "azul", tareas: [], noHace: [], kpis: [], orden });
const adentro = (a: Caja, b: Caja) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
/** Operaciones con una subárea Compras (y un puesto adentro): el caso del dueño. */
const CON_COMPRAS = [...NODOS_VIGENTES, area("compras", "ops", 99), puesto("comprador", "compras")];

test("claseCaja: Dirección, área (de la Dirección), subárea (de otra área) y puesto", () => {
  const dg = NODOS_VIGENTES.find((n) => n.clave === "dg")!;
  const ops = NODOS_VIGENTES.find((n) => n.clave === "ops")!;
  assert.equal(claseCaja(dg, undefined), "direccion");
  assert.equal(claseCaja(ops, dg), "area");
  assert.equal(claseCaja(area("compras", "ops"), ops), "subarea");
  assert.equal(claseCaja(puesto("p", "ops"), ops), "puesto");
});

test("jerarquía: cada clase tiene su tamaño, de mayor a menor, en las dos formas", () => {
  const t = OPCIONES_LAYOUT.tamanos;
  assert.ok(t.direccion.w > t.area.w && t.area.w > t.subarea.w && t.subarea.w > t.puesto.w);
  assert.ok(t.direccion.h >= t.area.h && t.area.h > t.subarea.h && t.subarea.h > t.puesto.h);
  for (const forma of ["lista", "arbol"] as const) {
    const l = calcularLayout(CON_COMPRAS, { forma });
    assert.deepEqual({ w: l.cajas.dg.w, h: l.cajas.dg.h }, t.direccion);
    assert.deepEqual({ w: l.cajas.ops.w, h: l.cajas.ops.h }, t.area);
    assert.deepEqual({ w: l.cajas.compras.w, h: l.cajas.compras.h }, t.subarea);
    assert.deepEqual({ w: l.cajas.planif.w, h: l.cajas.planif.h }, t.puesto);
    // Ninguna caja se pisa con otra.
    const cajas = Object.entries(l.cajas);
    for (let i = 0; i < cajas.length; i++)
      for (let j = i + 1; j < cajas.length; j++) assert.ok(!se(cajas[i][1], cajas[j][1]), `${forma}: ${cajas[i][0]} pisa a ${cajas[j][0]}`);
  }
});

test("árbol: cada área es un recuadro que encierra su tarjeta y todo lo de abajo; la subárea va anidada", () => {
  const l = calcularLayout(CON_COMPRAS, ARBOL);
  const g = Object.fromEntries(l.grupos.map((x) => [x.clave, x]));
  // Un grupo por área (no la Dirección ni los puestos).
  assert.deepEqual(Object.keys(g).sort(), ["admin", "compras", "deposito", "ops", "sistemas", "tec_com"]);
  for (const x of l.grupos) {
    assert.equal(x.forma, "arbol");
    const debajo = (k: string): boolean => {
      const p = CON_COMPRAS.find((n) => n.clave === k)?.dependeDe;
      return !!p && (p === x.clave || debajo(p));
    };
    for (const n of CON_COMPRAS)
      if (n.clave === x.clave || debajo(n.clave)) assert.ok(adentro(l.cajas[n.clave], x.caja), `${n.clave} se sale del recuadro de ${x.clave}`);
    // Con aire: la tarjeta del área no toca el borde del recuadro.
    assert.ok(l.cajas[x.clave].y - x.caja.y >= OPCIONES_LAYOUT.margenGrupo - 0.01);
  }
  assert.equal(g.compras.nivel, 1);
  assert.equal(g.ops.nivel, 0);
  assert.ok(adentro(g.compras.caja, g.ops.caja));
  // Los anidados después (se pintan encima).
  assert.ok(l.grupos.findIndex((x) => x.clave === "compras") > l.grupos.findIndex((x) => x.clave === "ops"));
  // Los recuadros de las áreas hermanas no se tocan, ni tocan a la Dirección.
  const top = l.grupos.filter((x) => x.nivel === 0);
  for (let i = 0; i < top.length; i++) {
    assert.ok(!se(top[i].caja, l.cajas.dg));
    for (let j = i + 1; j < top.length; j++) assert.ok(!se(top[i].caja, top[j].caja), `${top[i].clave} toca a ${top[j].clave}`);
  }
  // Los límites incluyen los recuadros (el encuadre no los corta).
  const minX = Math.min(...l.grupos.map((x) => x.caja.x));
  assert.ok(l.limites.minX <= minX);
});

test("árbol: la subárea va después de los puestos, en una fila propia y centrada", () => {
  const l = calcularLayout(CON_COMPRAS, ARBOL);
  const puestosOps = ["planif", "supervision", "montajes", "taller", "logistica", "seguridad", "vehiculos"].map((c) => l.cajas[c]);
  const ultimaFila = Math.max(...puestosOps.map((p) => p.y + p.h));
  const g = l.grupos.find((x) => x.clave === "compras")!;
  assert.ok(g.caja.y > ultimaFila);
  assert.ok(Math.abs(g.caja.x + g.caja.w / 2 - centroX(l.cajas.ops)) < 0.01);
  // Las columnas de puestos no se ensanchan por el recuadro: siguen teniendo el ancho de un puesto.
  const xs = [...new Set(puestosOps.slice(0, 6).map((p) => p.x))];
  assert.equal(xs.length, 2);
  assert.equal(Math.abs(xs[1] - xs[0]), OPCIONES_LAYOUT.tamanos.puesto.w + OPCIONES_LAYOUT.sepXArbol);
});

test("conectores dentro de un área llevan el grupo (se pintan de su color); los de la Dirección, no", () => {
  for (const forma of ["lista", "arbol"] as const) {
    const l = calcularLayout(CON_COMPRAS, { forma });
    assert.equal(l.aristas.find((a) => a.a === "ops")!.grupo, undefined);
    assert.equal(l.aristas.find((a) => a.a === "planif")!.grupo, "ops");
    assert.equal(l.aristas.find((a) => a.a === "compras")!.grupo, "ops");
    assert.equal(l.aristas.find((a) => a.a === "comprador")!.grupo, "compras");
  }
});

test("lista: el grupo es una franja fina por la sangría, debajo de la tarjeta hasta el último de abajo", () => {
  const l = calcularLayout(CON_COMPRAS);
  const g = l.grupos.find((x) => x.clave === "ops")!;
  const ops = l.cajas.ops;
  assert.equal(g.forma, "lista");
  assert.ok(g.caja.w <= 4);
  assert.ok(Math.abs(g.caja.x + g.caja.w / 2 - (ops.x + OPCIONES_LAYOUT.sangria / 2)) < 0.01);
  assert.equal(g.caja.y, ops.y + ops.h);
  assert.equal(g.caja.y + g.caja.h, Math.max(...["vehiculos", "comprador", "compras"].map((c) => l.cajas[c].y + l.cajas[c].h)));
  // En la lista no hay margen de grupo: la sangría de siempre.
  assert.equal(l.cajas.planif.x, ops.x + OPCIONES_LAYOUT.sangria);
});

test("desplazar y limitesDeRama acompañan a los recuadros", () => {
  const l = calcularLayout(CON_COMPRAS, ARBOL);
  const d = desplazar(l, 10, -5);
  const a = l.grupos.find((x) => x.clave === "ops")!.caja;
  const b = d.grupos.find((x) => x.clave === "ops")!.caja;
  assert.deepEqual(b, { ...a, x: a.x + 10, y: a.y - 5 });
  const lim = limitesDeRama(l, CON_COMPRAS, "ops");
  assert.deepEqual(lim, { minX: a.x, minY: a.y, maxX: a.x + a.w, maxY: a.y + a.h });
});
