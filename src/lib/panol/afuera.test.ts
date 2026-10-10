// "¿Qué hay afuera?" (afuera.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { agruparAfuera, contarAfuera, filtrarAfuera, nombreDeLugar, senalItem, type FuentesAfuera } from "./afuera.ts";
import type { Articulo, Unidad } from "./tipos.ts";

const U = "11111111-1111-4111-8111-111111111111";
const P = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const K = "44444444-4444-4444-8444-444444444444"; // el capataz
const HOY = "2026-10-10";

const articulo = (id: string, tipo: Articulo["tipo"], extra: Partial<Articulo> = {}): Articulo => ({
  id, nombre: id, tipo, seguridad_critica: false, tiene_talles: false, unidad: "u.", unidad_compra: null,
  factor_compra: 1, minimo: null, reponer_hasta: null, ubicacion_id: null, proveedor: null, codigo_barras: null,
  foto_path: null, ultimo_costo: null, notas: null, activo: true, ...extra,
});

const unidad = (id: string, articulo_id: string, lugar: string, extra: Partial<Unidad> = {}): Unidad => ({
  id, articulo_id, numero: id.toUpperCase(), serie: null, marca_modelo: null, fecha_compra: null, costo: null,
  ubicacion_id: null, lugar, estado: lugar.startsWith("u:") ? "disponible" : "afuera", desde_at: "2026-10-01T12:00:00Z",
  odoo_ot_id: null, capataz_id: null, vence_el: null, faltante_de: null, proxima_inspeccion: null, notas: null,
  activo: true, ...extra,
});

function fuentes(): FuentesAfuera {
  return {
    articulos: [
      articulo("amoladora", "herramienta"),
      articulo("cabo", "herramienta", { seguridad_critica: true }),
      articulo("martillo", "granel"),
      articulo("precinto", "insumo"),
    ],
    variantes: [],
    unidades: [
      unidad("h-014", "amoladora", `p:${P}`, { vence_el: "2026-10-06", odoo_ot_id: 4812 }),
      unidad("h-015", "amoladora", `u:${U}`),
      unidad("cv-1", "cabo", `c:${C}`, { proxima_inspeccion: "2026-10-05", odoo_ot_id: 4790, vence_el: "2026-10-01" }),
      unidad("h-016", "amoladora", "faltante", { estado: "faltante", faltante_de: `c:${C}`, desde_at: "2026-10-07T10:00:00Z" }),
      unidad("h-017", "amoladora", "faltante", { estado: "faltante", faltante_de: `u:${U}` }),
    ],
    saldos: [
      { articulo_id: "martillo", variante_id: null, lugar: `c:${C}`, cantidad: 2 },
      { articulo_id: "martillo", variante_id: null, lugar: `u:${U}`, cantidad: 5 },
      { articulo_id: "martillo", variante_id: null, lugar: "faltante", cantidad: 1 },
      // Las numeradas también tienen saldo (el trigger lo suma): no se cuentan dos veces.
      { articulo_id: "amoladora", variante_id: null, lugar: `p:${P}`, cantidad: 1 },
      { articulo_id: "martillo", variante_id: null, lugar: "o:4812", cantidad: 0 },
    ],
    personas: [
      { tipo: "persona", id: P, nombre: "Diego", apellido: "Acosta", telefono: "1155550000" },
      { tipo: "persona", id: K, nombre: "Sergio", apellido: "Ruiz", telefono: "1144440000" },
    ],
    cuadrillas: [{ id: C, nombre: "Cuadrilla 3", responsableId: K }],
  };
}

test("agrupa por titular: cuadrilla primero, con su capataz, y separa máquinas de granel", () => {
  const g = agruparAfuera(fuentes(), HOY);
  assert.deepEqual(g.map((x) => x.clase), ["cuadrilla", "persona", "faltante"]);
  const c = g[0];
  assert.equal(c.titulo, "Cuadrilla 3");
  assert.deepEqual(c.capataz, { id: K, nombre: "Sergio Ruiz", telefono: "1144440000" });
  assert.deepEqual(c.maquinas.map((i) => i.numero), ["CV-1", "H-016"]); // no usar antes que faltante
  assert.deepEqual(c.granel.map((i) => [i.articuloId, i.cantidad]), [["martillo", 2]]);
  assert.deepEqual(c.obras, [4790]);
});

test("la amoladora de Diego aparece una sola vez (no se suma su saldo)", () => {
  const g = agruparAfuera(fuentes(), HOY);
  const diego = g.find((x) => x.lugar === `p:${P}`)!;
  assert.equal(diego.titulo, "Diego Acosta");
  assert.equal(diego.maquinas.length, 1);
  assert.equal(diego.granel.length, 0);
});

test("vencida: préstamo a persona pasado, o cuadrilla con «vuelve hoy» que no volvió", () => {
  const base = fuentes();
  const f = { ...base, unidades: [...base.unidades, unidad("al-7", "amoladora", `c:${C}`)] }; // de la cuadrilla, sin fecha
  const g = agruparAfuera(f, HOY);
  const diego = g.find((x) => x.lugar === `p:${P}`)!.maquinas[0];
  assert.equal(diego.vencida, true);
  assert.equal(diego.diasVencida, 4);
  assert.equal(diego.vueltaDelDia, false);
  const cabo = g[0].maquinas.find((i) => i.numero === "CV-1")!; // salió con "vuelve hoy" el 01/10
  assert.equal(cabo.vencida, true);
  assert.equal(cabo.vueltaDelDia, true);
  assert.equal(cabo.noUsar, true);
  const al = g[0].maquinas.find((i) => i.numero === "AL-7")!;
  assert.equal(al.vencida, false);
  assert.equal(al.venceEl, null);
  assert.equal(senalItem({ ...cabo, noUsar: false, diasVencida: 1 }, HOY, 15).texto, "No volvió hoy");
  assert.equal(senalItem({ ...cabo, noUsar: false, vencida: false }, HOY, 15).texto, "Vuelve hoy");
});

test("un faltante queda con quien lo tenía; el del pañol y el granel, sin titular", () => {
  const g = agruparAfuera(fuentes(), HOY);
  const h016 = g[0].maquinas.find((i) => i.numero === "H-016")!;
  assert.equal(h016.faltante, true);
  assert.equal(h016.diasFaltante, 3);
  assert.equal(h016.lugar, "faltante");
  const sin = g.find((x) => x.clase === "faltante")!;
  assert.deepEqual(sin.maquinas.map((i) => i.numero), ["H-017"]);
  assert.deepEqual(sin.granel.map((i) => i.articuloId), ["martillo"]);
});

test("filtros y cuentas", () => {
  const g = agruparAfuera(fuentes(), HOY);
  assert.deepEqual(filtrarAfuera(g, "personas").map((x) => x.lugar), [`p:${P}`]);
  assert.deepEqual(filtrarAfuera(g, "cuadrillas").map((x) => x.lugar), [`c:${C}`]);
  const venc = filtrarAfuera(g, "vencidas");
  assert.deepEqual(venc.map((x) => x.maquinas.map((i) => i.numero)), [["CV-1"], ["H-014"]]);
  const falt = filtrarAfuera(g, "faltantes");
  assert.deepEqual(falt.map((x) => x.maquinas.length + x.granel.length), [1, 2]);
  assert.deepEqual(filtrarAfuera(g, "todo", `c:${C}`).map((x) => x.lugar), [`c:${C}`]);
  assert.deepEqual(contarAfuera(g), { items: 6, vencidas: 2, faltantes: 3, noUsar: 1 });
});

test("nombreDeLugar y la señal de cada fila", () => {
  const f = fuentes();
  assert.equal(nombreDeLugar(`c:${C}`, f.personas, f.cuadrillas), "Cuadrilla 3");
  assert.equal(nombreDeLugar("o:4812", f.personas, f.cuadrillas), "OT 4812");
  const g = agruparAfuera(f, HOY);
  const [cabo, h016] = g[0].maquinas;
  assert.equal(senalItem(cabo, HOY, 15).tono, "bloqueo");
  assert.equal(senalItem(h016, HOY, 15).texto, "Faltante · 3 días");
  assert.equal(senalItem(h016, HOY, 3).texto, "Faltante · 3 días, pasa a pérdida");
  assert.equal(senalItem(g[1].maquinas[0], HOY, 15).texto, "Venció hace 4 días");
  assert.equal(senalItem({ ...g[1].maquinas[0], vencida: false, venceEl: "2026-10-11" }, HOY, 15).texto, "Vence mañana");
});
