// El layout del Lienzo vivo contra el dataset de la maqueta: cajas sin solaparse, conectores
// que unen padre e hijo, colapsar, ciclos, rutas por los conectores y la cámara.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OPCIONES_LAYOUT,
  calcularLayout,
  centrar,
  desplazamientoAncla,
  desplazar,
  encuadrar,
  limitesDeRama,
  puntosDeArista,
  rutaEntre,
  rutaSvg,
  zoomHacia,
  ZOOM_MAX,
  type Caja,
} from "./layout.ts";
import { NODOS_BORRADOR, NODOS_VIGENTES } from "./datos-maqueta.ts";
import type { Nodo } from "./tipos.ts";

const se = (a: Caja, b: Caja) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test("ubica todos los nodos visibles y ninguna caja se pisa con otra", () => {
  for (const nodos of [NODOS_VIGENTES, NODOS_BORRADOR]) {
    const l = calcularLayout(nodos);
    const cajas = Object.entries(l.cajas);
    assert.equal(cajas.length, nodos.length);
    for (let i = 0; i < cajas.length; i++)
      for (let j = i + 1; j < cajas.length; j++) assert.ok(!se(cajas[i][1], cajas[j][1]), `${cajas[i][0]} pisa a ${cajas[j][0]}`);
  }
});

test("de arriba hacia abajo: la Dirección arriba y centrada, las 5 áreas en una fila debajo", () => {
  const l = calcularLayout(NODOS_VIGENTES);
  const dg = l.cajas.dg;
  assert.equal(dg.y, 0);
  const areas = ["tec_com", "ops", "deposito", "admin", "sistemas"].map((c) => l.cajas[c]);
  assert.ok(areas.every((a) => a.y === areas[0].y && a.y > dg.y));
  // En el orden del seed, de izquierda a derecha.
  for (let i = 1; i < areas.length; i++) assert.ok(areas[i].x > areas[i - 1].x);
  const centroDg = dg.x + dg.w / 2;
  assert.ok(Math.abs(centroDg - (l.limites.minX + l.limites.maxX) / 2) < 1);
});

test("los puestos de un área van en lista: misma sangría y uno debajo del otro", () => {
  const l = calcularLayout(NODOS_VIGENTES);
  const ops = l.cajas.ops;
  const puestos = ["planif", "supervision", "montajes", "taller", "logistica", "seguridad", "vehiculos"].map((c) => l.cajas[c]);
  for (const p of puestos) assert.equal(p.x, ops.x + OPCIONES_LAYOUT.sangria);
  for (let i = 1; i < puestos.length; i++) assert.ok(puestos[i].y >= puestos[i - 1].y + puestos[i - 1].h);
  // El sub-puesto del borrador tiene otra sangría más.
  const b = calcularLayout(NODOS_BORRADOR);
  assert.equal(b.cajas.coord_logistico.x, b.cajas.logistica.x + OPCIONES_LAYOUT.sangria);
});

test("cada conector sale del padre y llega al hijo", () => {
  const l = calcularLayout(NODOS_VIGENTES);
  assert.equal(l.aristas.length, NODOS_VIGENTES.length - 1);
  for (const a of l.aristas) {
    const p = l.cajas[a.de];
    const h = l.cajas[a.a];
    assert.equal(a.geo.desde.y, p.y + p.h);
    if (a.geo.modo === "rama") assert.deepEqual(a.geo.hasta, { x: h.x + h.w / 2, y: h.y });
    else assert.deepEqual(a.geo.hasta, { x: h.x, y: h.y + h.h / 2 });
  }
  const rama = l.aristas.find((a) => a.a === "ops")!;
  assert.equal(rama.geo.modo, "rama");
  assert.equal(l.aristas.find((a) => a.a === "stock")!.geo.modo, "lista");
});

test("colapsar esconde la rama y cuenta cuántos quedan adentro", () => {
  const l = calcularLayout(NODOS_VIGENTES, { colapsados: new Set(["ops"]) });
  assert.equal(l.cajas.planif, undefined);
  assert.equal(l.ocultos.ops, 7);
  assert.equal(Object.keys(l.cajas).length, NODOS_VIGENTES.length - 7);
  const todo = calcularLayout(NODOS_VIGENTES, { colapsados: new Set(["dg"]) });
  assert.deepEqual(Object.keys(todo.cajas), ["dg"]);
  assert.equal(todo.ocultos.dg, NODOS_VIGENTES.length - 1);
});

test("no se cuelga con un ciclo ni con un padre que no existe", () => {
  const raros: Nodo[] = [
    ...NODOS_VIGENTES.filter((n) => n.clave !== "stock"),
    { ...NODOS_VIGENTES.find((n) => n.clave === "stock")!, dependeDe: "no_existe" },
    { clave: "a", dependeDe: "b", tipo: "puesto", titulo: "A", tareas: [], noHace: [], kpis: [], orden: 0 },
    { clave: "b", dependeDe: "a", tipo: "puesto", titulo: "B", tareas: [], noHace: [], kpis: [], orden: 0 },
  ];
  const l = calcularLayout(raros);
  // stock queda como otra raíz; el ciclo a↔b no tiene raíz y no se dibuja.
  assert.ok(l.cajas.stock);
  assert.ok(l.cajas.dg);
});

test("rutaSvg: misma estructura de comandos para cada modo (se puede interpolar)", () => {
  const forma = (d: string) => d.replace(/-?[\d.]+/g, "#");
  const l = calcularLayout(NODOS_VIGENTES);
  const ramas = new Set(l.aristas.filter((a) => a.geo.modo === "rama").map((a) => forma(rutaSvg(a.geo))));
  const listas = new Set(l.aristas.filter((a) => a.geo.modo === "lista").map((a) => forma(rutaSvg(a.geo))));
  assert.equal(ramas.size, 1);
  assert.equal(listas.size, 1);
  assert.match([...ramas][0], /^M # # C # # # # # #$/);
});

test("puntosDeArista arranca en el padre y termina en el hijo", () => {
  const l = calcularLayout(NODOS_VIGENTES);
  for (const a of l.aristas) {
    const ps = puntosDeArista(a.geo);
    assert.deepEqual(ps[0], a.geo.desde);
    assert.ok(Math.hypot(ps.at(-1)!.x - a.geo.hasta.x, ps.at(-1)!.y - a.geo.hasta.y) < 0.01);
  }
});

test("rutaEntre sube hasta el ancestro común y baja: de Oficina Técnica a Control de Stock pasa por la Dirección", () => {
  const l = calcularLayout(NODOS_VIGENTES);
  const ruta = rutaEntre(l, NODOS_VIGENTES, "oficina_tec", "stock");
  const c = (k: string) => ({ x: l.cajas[k].x + l.cajas[k].w / 2, y: l.cajas[k].y + l.cajas[k].h / 2 });
  assert.deepEqual(ruta[0], c("oficina_tec"));
  assert.deepEqual(ruta.at(-1), c("stock"));
  // Toca el borde de abajo de la Dirección (la raíz es el ancestro común).
  const dg = l.cajas.dg;
  assert.ok(ruta.some((p) => p.y === dg.y + dg.h && Math.abs(p.x - (dg.x + dg.w / 2)) < 0.01));
  // Entre hermanos no sube a la Dirección.
  const corta = rutaEntre(l, NODOS_VIGENTES, "stock", "despacho");
  assert.ok(corta.every((p) => p.y > dg.y + dg.h));
  assert.deepEqual(rutaEntre(l, NODOS_VIGENTES, "stock", "no_existe"), []);
});

test("encuadrar mete los límites en el área visible y centra", () => {
  const lim = { minX: -500, minY: 0, maxX: 500, maxY: 400 };
  const cam = encuadrar(lim, { x: 0, y: 0, w: 1100, h: 500 }, 50);
  assert.equal(cam.k, 1);
  assert.equal(cam.x, 550);
  assert.equal(cam.y, 50);
  const chica = encuadrar(lim, { x: 0, y: 0, w: 300, h: 300 }, 0);
  assert.equal(chica.k, 0.3);
  assert.equal(chica.x + 0 * chica.k, 150);
});

test("zoomHacia deja quieto el punto de pantalla y respeta los topes", () => {
  const cam = { x: 100, y: 50, k: 1 };
  const foco = { x: 400, y: 300 };
  const z = zoomHacia(cam, 2, foco);
  const mundo = { x: (foco.x - cam.x) / cam.k, y: (foco.y - cam.y) / cam.k };
  assert.ok(Math.abs(mundo.x * z.k + z.x - foco.x) < 1e-9);
  assert.ok(Math.abs(mundo.y * z.k + z.y - foco.y) < 1e-9);
  assert.equal(zoomHacia(cam, 100, foco).k, ZOOM_MAX);
});

test("centrar pone el punto del mundo en el punto de pantalla", () => {
  const c = centrar({ x: 10, y: 20 }, { x: 300, y: 200 }, 2);
  assert.equal(10 * c.k + c.x, 300);
  assert.equal(20 * c.k + c.y, 200);
});

test("anclar: al agregar un área, el layout se corre para que Operaciones (el destino) no se mueva", () => {
  const antes = calcularLayout(NODOS_VIGENTES);
  const con: Nodo[] = [...NODOS_VIGENTES, { clave: "nueva", dependeDe: "dg", tipo: "area", titulo: "N", tareas: [], noHace: [], kpis: [], orden: 9 }];
  const despues = calcularLayout(con);
  assert.notEqual(despues.cajas.ops.x, antes.cajas.ops.x);
  const d = desplazamientoAncla(antes, despues, "ops");
  const anclado = desplazar(despues, d.x, d.y);
  assert.deepEqual(anclado.cajas.ops, antes.cajas.ops);
  assert.equal(anclado.aristas[0].geo.desde.x, despues.aristas[0].geo.desde.x + d.x);
});

test("limitesDeRama cubre el área y todos sus puestos", () => {
  const l = calcularLayout(NODOS_VIGENTES);
  const lim = limitesDeRama(l, NODOS_VIGENTES, "deposito");
  for (const k of ["deposito", "stock", "despacho", "devoluciones"]) {
    const c = l.cajas[k];
    assert.ok(c.x >= lim.minX && c.x + c.w <= lim.maxX && c.y >= lim.minY && c.y + c.h <= lim.maxY);
  }
  assert.ok(l.cajas.ops.x + l.cajas.ops.w <= lim.minX);
});
