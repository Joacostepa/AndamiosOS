// La cuenta del kiosco (kiosco.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  afueraDeCuadrilla, alternativasAlDia, armarVale, botonCaja, cambiarCantidad, claveDe, cruzarCuadrillas,
  decidirEscaneo, esErrorDeRed, esMaquina, fechaCorta, fechaDeVuelta, motivoTexto, normalizarCodigo,
  obrasDeRetiros, obrasPropuestas, proximoHabil, quedariaNegativo, quitarLinea, resolverLocal, rutaDeUbicacion,
  situacionUnidad, stockEnPanol, subarbol, sumarCaja, sumarLinea, type CatalogoKiosco, type LineaVale,
} from "./kiosco.ts";
import type { Articulo, Ubicacion, Unidad } from "./tipos.ts";

const id = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const PANOL = id(1), E3 = id(2), E3_2 = id(3), C12 = id(4), C07 = id(5), VACIO = id(6);
const P = id(50), DIEGO = id(51), CUAD = id(60);

const ubic = (i: string, padre: string | null, nombre: string, tipo: Ubicacion["tipo"]): Ubicacion => ({ id: i, padre_id: padre, nombre, tipo, orden: 0, activo: true });

const art = (i: string, nombre: string, tipo: Articulo["tipo"], ubicacion_id: string | null, extra: Partial<Articulo> = {}): Articulo => ({
  id: i, nombre, tipo, seguridad_critica: false, tiene_talles: false, unidad: "u.", unidad_compra: null, factor_compra: 1,
  minimo: null, reponer_hasta: null, ubicacion_id, proveedor: null, codigo_barras: null, foto_path: null, ultimo_costo: null,
  notas: null, activo: true, ...extra,
});

const uni = (i: string, articulo_id: string, numero: string, lugar: string, extra: Partial<Unidad> = {}): Unidad => ({
  id: i, articulo_id, numero, serie: null, marca_modelo: null, fecha_compra: null, costo: null, ubicacion_id: null, lugar,
  estado: lugar.startsWith("u:") ? "disponible" : "afuera", desde_at: "2026-10-06T10:00:00Z", odoo_ot_id: null, capataz_id: null,
  vence_el: null, faltante_de: null, proxima_inspeccion: null, notas: null, activo: true, ...extra,
});

const cat: CatalogoKiosco = {
  ubicaciones: [ubic(PANOL, null, "Pañol", "panol"), ubic(E3, PANOL, "Estantería E3", "estanteria"), ubic(E3_2, E3, "Estante 2", "estante"),
    ubic(C12, E3_2, "Cajón C-12", "cajon"), ubic(C07, E3_2, "Cajón C-07", "cajon"), ubic(VACIO, PANOL, "Cajón vacío", "cajon")],
  articulos: [
    art("prec", "Precintos 300mm", "insumo", C12, { unidad_compra: "bolsa", factor_compra: 100, codigo_barras: "7791234567890" }),
    art("torn", "Tornillo 14x1", "insumo", C07),
    art("mart", "Martillo", "granel", E3_2),
    art("amol", "Amoladora", "herramienta", E3_2),
    art("arnes", "Arnés", "herramienta", E3_2, { seguridad_critica: true }),
  ],
  variantes: [],
  unidades: [],
  saldos: [
    { articulo_id: "prec", variante_id: null, lugar: `u:${C12}`, cantidad: 240 },
    { articulo_id: "torn", variante_id: null, lugar: `u:${C07}`, cantidad: 1850 },
    { articulo_id: "mart", variante_id: null, lugar: `c:${CUAD}`, cantidad: 2 },
    { articulo_id: "prec", variante_id: null, lugar: `c:${CUAD}`, cantidad: 50 },
  ],
};

// ─── Carrito ────────────────────────────────────────────────────────────────

const linea = (articuloId: string, cantidad: number, extra: Partial<LineaVale> = {}): Omit<LineaVale, "clave"> => ({
  articuloId, varianteId: null, unidadId: null, cantidad, nombre: articuloId, unidad: "u.", ...extra,
});

test("reescanear el mismo cajón suma en la misma línea", () => {
  let v = sumarLinea([], linea("prec", 100)).lineas;
  v = sumarLinea(v, linea("torn", 20)).lineas;
  v = sumarLinea(v, linea("prec", 5)).lineas;
  assert.equal(v.length, 2);
  assert.equal(v[0].cantidad, 105);
});

test("un talle distinto es otra línea", () => {
  let v = sumarLinea([], linea("guantes", 2, { varianteId: "t9" })).lineas;
  v = sumarLinea(v, linea("guantes", 1, { varianteId: "t10" })).lineas;
  assert.equal(v.length, 2);
});

test("la misma herramienta escaneada dos veces se ignora y lo avisa", () => {
  const a = sumarLinea([], linea("amol", 1, { unidadId: "u1" }));
  const b = sumarLinea(a.lineas, linea("amol", 1, { unidadId: "u1" }));
  assert.equal(b.repetida, true);
  assert.equal(b.lineas.length, 1);
  assert.equal(b.lineas[0].cantidad, 1);
});

test("cambiar cantidad no baja de 1 y quitar saca la línea", () => {
  const v = sumarLinea([], linea("prec", 3)).lineas;
  const clave = claveDe(v[0]);
  assert.equal(cambiarCantidad(v, clave, 0)[0].cantidad, 1);
  assert.equal(cambiarCantidad(v, clave, 7)[0].cantidad, 7);
  assert.deepEqual(quitarLinea(v, clave), []);
});

test("armarVale: el payload de pan_registrar_vale sin campos vacíos", () => {
  let v = sumarLinea([], linea("prec", 100, { ubicacionId: C12 })).lineas;
  v = sumarLinea(v, linea("amol", 1, { unidadId: "u1", vuelveHoy: true, estadoVuelta: "incompleta", motivo: "  Falta la llave " })).lineas;
  v = sumarLinea(v, { varianteId: null, unidadId: null, cantidad: 2, nombre: "Cinta doble faz", unidad: "u.", sinAlta: { descripcion: " Cinta doble faz ", fotoPath: "sin-alta/x/f.jpg" } }).lineas;
  const vale = armarVale({ tipo: "retiro", clientUuid: "cu", token: "tk", dispositivo: "d", lineas: v, odooOtId: 4812, cuadrillaId: CUAD });
  assert.deepEqual(vale, {
    clientUuid: "cu", tipo: "retiro", token: "tk", dispositivo: "d", odooOtId: 4812, cuadrillaId: CUAD,
    items: [
      { articuloId: "prec", cantidad: 100, ubicacionId: C12 },
      { articuloId: "amol", unidadId: "u1", vuelveHoy: true, estadoVuelta: "incompleta", motivo: "Falta la llave" },
      { sinAlta: { descripcion: "Cinta doble faz", cantidad: 2, fotoPath: "sin-alta/x/f.jpg" } },
    ],
  });
});

test("sin obra viaja como null (Taller/Depósito)", () => {
  const vale = armarVale({ tipo: "retiro", clientUuid: "cu", token: "tk", dispositivo: "d", lineas: [] });
  assert.equal(vale.odooOtId, null);
  assert.equal("cuadrillaId" in vale, false);
});

// ─── Escaneo ────────────────────────────────────────────────────────────────

test("normalizarCodigo saca la URL de la etiqueta", () => {
  assert.equal(normalizarCodigo("https://andamios.app/p/e7k2qx"), "E7K2QX");
  assert.equal(normalizarCodigo("  p4m8rx "), "P4M8RX");
  assert.equal(normalizarCodigo("https://x.com/p/ABC234?utm=1"), "ABC234");
});

test("resolverLocal: código activo, anulado, código de barras y desconocido", () => {
  const codigos = [
    { codigo: "AAAAAA", tipo: "ubicacion" as const, entidad_id: C12, activo: true },
    { codigo: "BBBBBB", tipo: "unidad" as const, entidad_id: "u1", activo: false },
  ];
  assert.deepEqual(resolverLocal("https://x/p/aaaaaa", codigos, cat.articulos), { tipo: "ubicacion", id: C12, codigo: "AAAAAA" });
  assert.deepEqual(resolverLocal("BBBBBB", codigos, cat.articulos), { tipo: "anulado", codigo: "BBBBBB" });
  assert.deepEqual(resolverLocal("7791234567890", codigos, cat.articulos), { tipo: "articulo", id: "prec" });
  assert.equal(resolverLocal("ZZZZZZ", codigos, cat.articulos), null);
});

test("subarbol y ruta de una ubicación", () => {
  assert.deepEqual([...subarbol(cat.ubicaciones, E3)].sort(), [E3, E3_2, C12, C07].sort());
  assert.equal(rutaDeUbicacion(cat.ubicaciones, C12), "Cajón C-12 · Estante 2 · Estantería E3");
});

test("un cajón con un solo artículo va directo a la cantidad", () => {
  assert.deepEqual(decidirEscaneo({ tipo: "ubicacion", id: C12, codigo: "X" }, cat, "retiro"), { ir: "cantidad", articuloId: "prec", ubicacionId: C12 });
});

test("un estante con varios abre la lista (sin las herramientas con número)", () => {
  const d = decidirEscaneo({ tipo: "ubicacion", id: E3_2, codigo: "X" }, cat, "retiro");
  assert.equal(d.ir, "lista");
  assert.deepEqual(d.ir === "lista" && d.articuloIds, ["mart", "prec", "torn"]);
});

test("devolver sobrante sólo acepta insumos", () => {
  const d = decidirEscaneo({ tipo: "ubicacion", id: E3_2, codigo: "X" }, cat, "sobrante");
  assert.deepEqual(d.ir === "lista" && d.articuloIds, ["prec", "torn"]);
  assert.equal(decidirEscaneo({ tipo: "articulo", id: "mart" }, cat, "sobrante").ir, "aviso");
});

test("lo demás: herramienta, credencial, anulado, vacío", () => {
  assert.deepEqual(decidirEscaneo({ tipo: "unidad", id: "u1", codigo: "X" }, cat, "retiro"), { ir: "unidad", unidadId: "u1" });
  assert.deepEqual(decidirEscaneo({ tipo: "persona", id: P, codigo: "P4M8RX" }, cat, "retiro"), { ir: "persona", codigo: "P4M8RX" });
  assert.equal(decidirEscaneo({ tipo: "anulado", codigo: "X" }, cat, "retiro").ir, "aviso");
  assert.equal(decidirEscaneo({ tipo: "ubicacion", id: VACIO, codigo: "X" }, cat, "retiro").ir, "aviso");
  assert.equal(decidirEscaneo({ tipo: "articulo", id: "amol" }, cat, "retiro").ir, "aviso");
});

// ─── Stock ──────────────────────────────────────────────────────────────────

test("stock en el pañol, aviso de negativo y botón de caja", () => {
  assert.equal(stockEnPanol(cat.saldos, "prec"), 240);
  assert.equal(quedariaNegativo(240, 300), true);
  assert.equal(quedariaNegativo(240, 240), false);
  assert.deepEqual(botonCaja(cat.articulos[0]), { texto: "Bolsa (100)", factor: 100 });
  assert.equal(botonCaja(cat.articulos[1]), null);
  assert.equal(sumarCaja(1, 100), 100);
  assert.equal(sumarCaja(100, 100), 200);
});

// ─── Herramientas ───────────────────────────────────────────────────────────

const HOY = "2026-10-10";
const yo = `p:${P}`;

test("situacionUnidad: prestar, devolver, la tiene otro, bloqueada, no disponible", () => {
  const amol = cat.articulos[3], arnes = cat.articulos[4];
  assert.deepEqual(situacionUnidad(uni("u1", "amol", "H-1", `u:${E3_2}`), amol, yo, HOY), { caso: "prestar" });
  assert.deepEqual(situacionUnidad(uni("u1", "amol", "H-1", yo), amol, yo, HOY), { caso: "devolver" });
  assert.deepEqual(situacionUnidad(uni("u1", "amol", "H-1", `p:${DIEGO}`), amol, yo, HOY), { caso: "la_tiene", lugar: `p:${DIEGO}` });
  assert.deepEqual(situacionUnidad(uni("u1", "amol", "H-1", `c:${CUAD}`), amol, yo, HOY), { caso: "la_tiene", lugar: `c:${CUAD}` });
  assert.deepEqual(situacionUnidad(uni("a1", "arnes", "A-31", `u:${E3_2}`, { proxima_inspeccion: "2026-10-02" }), arnes, yo, HOY), { caso: "bloqueada" });
  assert.deepEqual(situacionUnidad(uni("u1", "amol", "H-1", `u:${E3_2}`, { estado: "en_revision" }), amol, yo, HOY), { caso: "no_disponible", estado: "en_revision" });
  assert.deepEqual(situacionUnidad(uni("u1", "amol", "H-1", "taller", { estado: "en_mantenimiento" }), amol, yo, HOY), { caso: "no_disponible", estado: "en_mantenimiento" });
});

test("alternativas al día del mismo artículo", () => {
  const arnes = cat.articulos[4];
  const unidades = [
    uni("a31", "arnes", "A-31", `u:${E3_2}`, { proxima_inspeccion: "2026-10-02" }),
    uni("a35", "arnes", "A-35", `u:${E3_2}`, { proxima_inspeccion: "2027-02-14" }),
    uni("a36", "arnes", "A-36", `u:${E3_2}`, { proxima_inspeccion: "2026-09-01" }),
    uni("a37", "arnes", "A-37", `p:${DIEGO}`, { proxima_inspeccion: "2027-02-14" }),
  ];
  assert.deepEqual(alternativasAlDia(unidades, arnes, "a31", HOY).map((u) => u.numero), ["A-35"]);
});

test("¿cuándo vuelve?", () => {
  assert.equal(fechaDeVuelta("hoy", HOY), HOY);
  assert.equal(fechaDeVuelta("manana", HOY), "2026-10-11");
  assert.equal(fechaDeVuelta("fin", HOY), null);
  assert.equal(fechaDeVuelta("fecha", HOY, "2026-10-17"), "2026-10-17");
  assert.equal(fechaDeVuelta("fecha", HOY, "2026-10-01"), null);
  assert.equal(proximoHabil("2026-10-09"), "2026-10-12"); // viernes → lunes
  assert.equal(fechaCorta("2026-10-06"), "06/10");
  assert.equal(fechaCorta("2026-10-06", true), "mar 06/10");
});

test("máquina es herramienta con número que no es de seguridad crítica", () => {
  assert.equal(esMaquina(cat.articulos[3]), true);
  assert.equal(esMaquina(cat.articulos[4]), false);
  assert.equal(esMaquina(cat.articulos[2]), false);
  assert.equal(motivoTexto(["No arranca", "Chispea"], "  se cayó "), "No arranca · Chispea · se cayó");
  assert.equal(motivoTexto([], ""), "");
});

// ─── Obras y cuadrillas ─────────────────────────────────────────────────────

test("obra propuesta: la de hoy primero, después la última, sin repetir", () => {
  assert.deepEqual(obrasPropuestas(4812, 4790), [{ otId: 4812, motivo: "hoy" }, { otId: 4790, motivo: "ultima" }]);
  assert.deepEqual(obrasPropuestas(4812, 4812), [{ otId: 4812, motivo: "hoy" }]);
  assert.deepEqual(obrasPropuestas(null, null), []);
});

test("sobrante: las obras de los últimos retiros, la más reciente primero", () => {
  const movs = [
    { odoo_ot_id: 4812, created_at: "2026-10-01T10:00:00Z" },
    { odoo_ot_id: 4790, created_at: "2026-10-06T10:00:00Z" },
    { odoo_ot_id: null, created_at: "2026-10-07T10:00:00Z" },
    { odoo_ot_id: 4812, created_at: "2026-10-05T10:00:00Z" },
  ];
  assert.deepEqual(obrasDeRetiros(movs), [4790, 4812]);
});

test("lo que tiene la cuadrilla: herramientas y granel, no insumos", () => {
  const c = { ...cat, unidades: [uni("u1", "amol", "H-2", `c:${CUAD}`), uni("u2", "amol", "H-1", `c:${CUAD}`), uni("u3", "amol", "H-3", yo)] };
  const a = afueraDeCuadrilla(c, CUAD);
  assert.deepEqual(a.unidades.map((u) => u.numero), ["H-1", "H-2"]);
  assert.deepEqual(a.granel, [{ articuloId: "mart", varianteId: null, cantidad: 2 }]);
});

test("cuadrillas de Odoo ↔ AndamiosOS por nombre", () => {
  const r = cruzarCuadrillas([{ nombre: "CUADRILLA  3", otId: 1 }, { nombre: "Cuadrilla 9", otId: 2 }], [{ id: CUAD, nombre: "Cuadrilla 3" }]);
  assert.deepEqual(r.map((x) => x.cuadrillaId), [CUAD, null]);
});

test("error de red vs. rechazo de la base", () => {
  assert.equal(esErrorDeRed(new TypeError("Failed to fetch")), true);
  assert.equal(esErrorDeRed(new TypeError("Load failed")), true);
  assert.equal(esErrorDeRed(new Error("LA_TIENE:p:abc")), false);
});

// ─── El escáner ─────────────────────────────────────────────────────────────

test("el .wasm del escáner está en /public con la versión instalada", () => {
  // Si se actualiza zxing-wasm sin copiar el binario, el escáner de iPhone deja de leer.
  // El paso está documentado arriba de src/components/panol/escaner.tsx.
  const version = JSON.parse(readFileSync("node_modules/zxing-wasm/package.json", "utf8")).version as string;
  assert.ok(existsSync(`public/kiosco/zxing/${version}/zxing_reader.wasm`), `falta public/kiosco/zxing/${version}/zxing_reader.wasm`);
});
