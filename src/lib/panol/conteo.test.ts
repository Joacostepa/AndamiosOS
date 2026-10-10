// Conteo cíclico (conteo.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { claveItem, listaEsperada, paraContar, resumenConteo, rutaUbicacion, subarbol, textoDif, type Conteo, type ConteoItem } from "./conteo.ts";
import type { Articulo, Ubicacion, Unidad } from "./tipos.ts";

const ubic = (id: string, padre_id: string | null, tipo: Ubicacion["tipo"], nombre = id): Ubicacion =>
  ({ id, padre_id, nombre, tipo, orden: 0, activo: true });

const UBICACIONES = [
  ubic("panol", null, "panol", "Pañol"),
  ubic("e3", "panol", "estanteria", "Estantería E3"),
  ubic("e3-2", "e3", "estante", "Estante 2"),
  ubic("c12", "e3-2", "cajon", "Cajón C-12"),
  ubic("e5", "panol", "estanteria", "Estantería E5"),
];

const articulo = (id: string, tipo: Articulo["tipo"], extra: Partial<Articulo> = {}): Articulo => ({
  id, nombre: id, tipo, seguridad_critica: false, tiene_talles: false, unidad: "u.", unidad_compra: null,
  factor_compra: 1, minimo: null, reponer_hasta: null, ubicacion_id: null, proveedor: null, codigo_barras: null,
  foto_path: null, ultimo_costo: null, notas: null, activo: true, ...extra,
});

const unidad = (id: string, lugar: string): Unidad => ({
  id, articulo_id: "amoladora", numero: id, serie: null, marca_modelo: null, fecha_compra: null, costo: null,
  ubicacion_id: null, lugar, estado: "disponible", desde_at: "2026-10-01T00:00:00Z", odoo_ot_id: null,
  capataz_id: null, vence_el: null, faltante_de: null, proxima_inspeccion: null, notas: null, activo: true,
});

test("subarbol y ruta", () => {
  assert.deepEqual([...subarbol(UBICACIONES, "e3")].sort(), ["c12", "e3", "e3-2"]);
  assert.equal(rutaUbicacion(UBICACIONES, "c12"), "Pañol › Estantería E3 › Estante 2 › Cajón C-12");
});

test("listaEsperada: lo que figura en el subárbol, sin cantidades", () => {
  const r = listaEsperada({
    ubicaciones: UBICACIONES,
    articulos: [
      articulo("precintos", "insumo", { ubicacion_id: "c12" }),
      articulo("guantes", "insumo", { ubicacion_id: "e3-2", tiene_talles: true }),
      articulo("disco", "insumo", { ubicacion_id: "e5" }),
      articulo("llave", "granel"),
      articulo("amoladora", "herramienta", { ubicacion_id: "e3-2" }),
    ],
    variantes: [
      { id: "t9", articulo_id: "guantes", nombre: "9", orden: 1, activo: true },
      { id: "t8", articulo_id: "guantes", nombre: "8", orden: 0, activo: true },
    ],
    unidades: [unidad("H-1", "u:e3-2"), unidad("H-2", "p:22222222-2222-4222-8222-222222222222")],
    saldos: [
      { articulo_id: "llave", variante_id: null, lugar: "u:c12", cantidad: -2 },
      { articulo_id: "disco", variante_id: null, lugar: "u:e5", cantidad: 40 },
      { articulo_id: "amoladora", variante_id: null, lugar: "u:e3-2", cantidad: 1 },
      { articulo_id: "precintos", variante_id: null, lugar: "u:c12", cantidad: 240 },
    ],
  }, "e3");
  assert.deepEqual(r.articulos.map((f) => f.nombre).sort(), ["guantes · talle 8", "guantes · talle 9", "llave", "precintos"]);
  for (const f of r.articulos) assert.equal("cantidad" in f, false);
  assert.equal(r.articulos.find((f) => f.articuloId === "llave")!.donde, "Cajón C-12");
  assert.deepEqual(r.unidades.map((u) => u.numero), ["H-1"]);
  assert.equal(r.unidades[0].clave, claveItem("amoladora", null, "H-1"));
});

const item = (x: Partial<ConteoItem>): ConteoItem => ({
  id: "i", conteo_id: "c", articulo_id: "a", variante_id: null, unidad_id: null, contado: null, contado_at: null,
  esperado: null, encontrado_extra: false, nota: null, ...x,
});

test("resumenConteo: diferencias, faltantes y aparecidas", () => {
  const r = resumenConteo([
    item({ articulo_id: "precintos", contado: 180, esperado: 240 }),
    item({ articulo_id: "disco", contado: 47, esperado: 50 }),
    item({ articulo_id: "alambre", contado: 38, esperado: 38 }),
    item({ articulo_id: "tarugo", contado: 40, esperado: 0, encontrado_extra: true }),
    item({ articulo_id: "amoladora", unidad_id: "H-1", contado: 0, esperado: 1 }),
    item({ articulo_id: "amoladora", unidad_id: "H-2", contado: 1, esperado: 0 }),
    item({ articulo_id: "amoladora", unidad_id: "H-3", contado: 1, esperado: 1 }),
    item({ articulo_id: "nada", contado: null }),
  ], 10);
  assert.equal(r.coinciden, 1);
  assert.deepEqual(r.diferencias.map((d) => [d.item.articulo_id, d.dif, d.supera]), [
    ["tarugo", 40, true], ["precintos", -60, true], ["disco", -3, false],
  ]);
  assert.deepEqual(r.noAparecieron.map((i) => i.unidad_id), ["H-1"]);
  assert.deepEqual(r.aparecieron.map((i) => i.unidad_id), ["H-2"]);
  assert.equal(r.unidadesOk, 1);
  assert.equal(r.pideAprobacion, true);
  assert.equal(resumenConteo([item({ contado: 47, esperado: 50 })], 10).pideAprobacion, false);
});

test("textoDif con el menos de verdad", () => {
  assert.equal(textoDif(-60), "−60");
  assert.equal(textoDif(1850), "+1.850");
  assert.equal(textoDif(0), "0");
});

test("paraContar: nunca contadas primero, las que esperan aprobación al final", () => {
  const conteo = (ubicacion_id: string, estado: Conteo["estado"], iniciado_at: string): Conteo =>
    ({ id: ubicacion_id + iniciado_at, ubicacion_id, estado, umbral_pct: 10, iniciado_at, cerrado_at: null, contado_por_id: null });
  const r = paraContar(
    [...UBICACIONES, ubic("e7", "panol", "estanteria", "Estantería E7")],
    [conteo("e3", "aplicado", "2026-09-12"), conteo("e5", "aplicado", "2026-08-18"), conteo("e7", "por_aprobar", "2026-10-10")],
  );
  assert.deepEqual(r.map((p) => p.ubicacion.id), ["e5", "e3", "e7"]);
  assert.equal(r[2].pendiente?.estado, "por_aprobar");
});
