// La bandeja del pañol (bandeja.ts), sus avisos (avisos.ts) y el link de WhatsApp (whatsapp.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { armarBandeja, cuandoFue, faltantesGranelVigentes, resumenMovimientos, type EntradaBandeja, type FaltanteGranel } from "./bandeja.ts";
import { avisosDeBandeja, semanaISO } from "./avisos.ts";
import { linkWhatsapp, telefonoWhatsapp } from "./whatsapp.ts";
import type { Articulo, Unidad } from "./tipos.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ESTANTE = id(1);
const PRECINTOS = id(10);
const AMOLADORA = id(11);
const CABO = id(12);
const MARTILLO = id(13);
const DIEGO = id(20);
const WALTER = id(21);
const HECTOR = id(22);
const YO_USER = id(30);
const YO_LEGAJO = id(31);
const C5 = id(40);

// 10/10/2026 a las 15:00 de Buenos Aires.
const AHORA = "2026-10-10T18:00:00.000Z";

const art = (a: Partial<Articulo> & Pick<Articulo, "id" | "nombre" | "tipo">): Articulo => ({
  seguridad_critica: false, tiene_talles: false, unidad: "u.", unidad_compra: null, factor_compra: 1, minimo: null,
  reponer_hasta: null, ubicacion_id: ESTANTE, proveedor: null, codigo_barras: null, foto_path: null, ultimo_costo: null,
  notas: null, activo: true, ...a,
});

const uni = (u: Partial<Unidad> & Pick<Unidad, "id" | "articulo_id" | "numero">): Unidad => ({
  serie: null, marca_modelo: null, fecha_compra: null, costo: null, ubicacion_id: ESTANTE, lugar: `u:${ESTANTE}`,
  estado: "disponible", desde_at: "2026-10-01T12:00:00Z", odoo_ot_id: null, capataz_id: null, vence_el: null,
  faltante_de: null, proxima_inspeccion: null, notas: null, activo: true, ...u,
});

function entrada(e: Partial<EntradaBandeja> = {}): EntradaBandeja {
  return {
    ahora: AHORA,
    parametros: { aviso_inspeccion_dias: 15, faltante_perdida_dias: 15, conteo_umbral_pct: 10, vencida_aviso_horas: 24 },
    ubicaciones: [{ id: ESTANTE, padre_id: null, nombre: "E3", tipo: "estanteria", orden: 0, activo: true }],
    articulos: [
      art({ id: PRECINTOS, nombre: "Precintos 300mm", tipo: "insumo", minimo: 200, reponer_hasta: 600, unidad_compra: "bolsas", factor_compra: 100 }),
      art({ id: AMOLADORA, nombre: "Amoladora", tipo: "herramienta" }),
      art({ id: CABO, nombre: "Cabo de vida", tipo: "herramienta", seguridad_critica: true }),
      art({ id: MARTILLO, nombre: "Martillo", tipo: "granel" }),
    ],
    variantes: [],
    unidades: [],
    saldos: [],
    conteos: [],
    sinAlta: [],
    valesSinEncargado: [],
    faltantesGranel: [],
    ultimos: {},
    personas: [
      { tipo: "persona", id: DIEGO, nombre: "Diego Ramírez", telefono: "11 5555-1234", activo: true, userId: null },
      { tipo: "persona", id: WALTER, nombre: "Walter Domínguez", telefono: "011 15 4444-9876", activo: true, userId: null },
      { tipo: "persona", id: HECTOR, nombre: "Héctor Paz", telefono: null, activo: false, userId: null },
      { tipo: "persona", id: YO_LEGAJO, nombre: "Paula Giménez", telefono: null, activo: true, userId: YO_USER },
    ],
    cuadrillas: [{ id: C5, nombre: "Cuadrilla 5", activo: true, responsableId: WALTER }],
    ots: { 4812: { id: 4812, nombre: null, cliente: null, direccion: "Av. Corrientes 1847" } },
    yo: { userId: YO_USER, personaId: YO_LEGAJO, esEncargado: true },
    ...e,
  };
}

const seccion = (b: ReturnType<typeof armarBandeja>, s: string) => b.secciones.find((x) => x.id === s)!;

test("las secciones salen en el orden de docs §6.14", () => {
  assert.deepEqual(armarBandeja(entrada()).secciones.map((s) => s.id), [
    "ajustes", "negativo", "reponer", "vencidas", "faltantes", "revision", "taller", "inspecciones", "sin_alta", "sin_encargado",
  ]);
});

test("reponer: bajo el mínimo, con el sugerido redondeado a bolsas", () => {
  const b = armarBandeja(entrada({ saldos: [{ articulo_id: PRECINTOS, variante_id: null, lugar: `u:${ESTANTE}`, cantidad: 140 }] }));
  const [f] = seccion(b, "reponer").filas;
  assert.match(f.detalle, /Quedan 140 u\. · mínimo 200 · reponer hasta 600 → sugerido 500 u\. \(5 bolsas de 100\)/);
  assert.equal(f.acciones[0].tipo, "reponer");
});

test("stock negativo aparece con el lugar", () => {
  const b = armarBandeja(entrada({ saldos: [{ articulo_id: PRECINTOS, variante_id: null, lugar: `u:${ESTANTE}`, cantidad: -4 }] }));
  assert.match(seccion(b, "negativo").filas[0].detalle, /Figura −4 u\. en E3/);
});

test("préstamo vencido: a la persona, con la OT y el WhatsApp", () => {
  const b = armarBandeja(entrada({
    unidades: [uni({ id: id(50), articulo_id: AMOLADORA, numero: "H-019", lugar: `p:${DIEGO}`, estado: "afuera", vence_el: "2026-10-07", odoo_ot_id: 4812 })],
  }));
  const [f] = seccion(b, "vencidas").filas;
  assert.equal(f.detalle, "Diego Ramírez · OT 4812 · Av. Corrientes 1847 · tenía que volver el 07/10");
  assert.equal(f.dias, 3);
  const wa = f.acciones[0];
  assert.ok(wa.tipo === "whatsapp" && wa.url?.startsWith("https://wa.me/5491155551234?text="));
});

test("lo que tiene una cuadrilla sin fecha no vence", () => {
  const b = armarBandeja(entrada({
    unidades: [uni({ id: id(51), articulo_id: AMOLADORA, numero: "H-020", lugar: `c:${C5}`, estado: "afuera" })],
  }));
  assert.equal(seccion(b, "vencidas").filas.length, 0);
});

test("faltante: se habilita la pérdida cumplidos los días, y avisa recién ahí", () => {
  const viejo = uni({ id: id(52), articulo_id: AMOLADORA, numero: "H-053", lugar: "faltante", estado: "faltante", faltante_de: `c:${C5}`, capataz_id: WALTER, desde_at: "2026-09-24T15:00:00Z" });
  const nuevo = uni({ id: id(53), articulo_id: AMOLADORA, numero: "H-054", lugar: "faltante", estado: "faltante", faltante_de: `c:${C5}`, capataz_id: WALTER, desde_at: AHORA });
  const b = armarBandeja(entrada({ unidades: [nuevo, viejo] }));
  const [primero, segundo] = seccion(b, "faltantes").filas;
  assert.equal(primero.codigo, "#H-053");
  assert.match(primero.detalle, /Cuadrilla 5 · capataz Walter Domínguez · faltante desde el 24\/09/);
  const p1 = primero.acciones.find((a) => a.tipo === "perdida");
  const p2 = segundo.acciones.find((a) => a.tipo === "perdida");
  assert.ok(p1?.tipo === "perdida" && p1.bloqueo === null);
  assert.ok(p2?.tipo === "perdida" && p2.bloqueo?.startsWith("Se habilita a los 15 días"));
  const avisos = avisosDeBandeja(b).filter((a) => a.tipo === "panol_faltante");
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].destinatarioRol, "deposito");
});

test("faltantes a granel: el saldo vigente es de los más recientes", () => {
  const movs: FaltanteGranel[] = [
    { id: "a", articulo_id: MARTILLO, variante_id: null, cantidad: 2, desde: `c:${C5}`, capataz_id: WALTER, created_at: "2026-09-01T10:00:00Z" },
    { id: "b", articulo_id: MARTILLO, variante_id: null, cantidad: 3, desde: `c:${C5}`, capataz_id: WALTER, created_at: "2026-10-01T10:00:00Z" },
  ];
  const vig = faltantesGranelVigentes([{ articulo_id: MARTILLO, variante_id: null, lugar: "faltante", cantidad: 4 }], movs);
  assert.deepEqual(vig.map((m) => [m.id, m.cantidad]), [["b", 3], ["a", 1]]);
  assert.deepEqual(faltantesGranelVigentes([], movs), []);
});

test("inspecciones: vencida afuera es 'No usar' y le escribe al capataz", () => {
  const b = armarBandeja(entrada({
    unidades: [
      uni({ id: id(60), articulo_id: CABO, numero: "CV-022", lugar: `c:${C5}`, estado: "afuera", proxima_inspeccion: "2026-10-05" }),
      uni({ id: id(61), articulo_id: CABO, numero: "CV-019", proxima_inspeccion: "2026-10-20" }),
      uni({ id: id(62), articulo_id: CABO, numero: "CV-001", proxima_inspeccion: "2027-01-01" }),
    ],
  }));
  const filas = seccion(b, "inspecciones").filas;
  assert.equal(filas.length, 2);
  assert.deepEqual(filas[0].chip, { texto: "No usar", tono: "bloqueo" });
  const wa = filas[0].acciones[0];
  assert.ok(wa.tipo === "whatsapp" && wa.a === "Walter Domínguez" && wa.url?.includes("5491144449876"));
  assert.deepEqual(filas[1].chip, { texto: "Vence pronto", tono: "aviso" });
  assert.equal(filas[1].cuando, "en 10 días");
});

test("ajuste por aprobar: quien contó no puede aprobar, y dice por qué", () => {
  const conteo = {
    id: id(70), ubicacion_id: ESTANTE, contado_por_tipo: "persona" as const, contado_por_id: YO_LEGAJO, registrado_por: YO_USER,
    umbral_pct: 10, cerrado_at: AHORA,
    items: [{ articulo_id: PRECINTOS, variante_id: null, unidad_id: null, contado: 180, esperado: 240, encontrado_extra: false }],
  };
  const b = armarBandeja(entrada({ conteos: [conteo] }));
  const [f] = seccion(b, "ajustes").filas;
  assert.equal(f.items?.[0], "Precintos 300mm: contaron 180, figuraban 240 → −60 u. (−25 %)");
  const ap = f.acciones[0];
  assert.ok(ap.tipo === "aprobar_conteo" && ap.bloqueo === "Lo contaste vos: lo tiene que aprobar otro encargado.");
  const otro = armarBandeja(entrada({ conteos: [conteo], yo: { userId: id(99), personaId: id(98), esEncargado: true } }));
  const ap2 = seccion(otro, "ajustes").filas[0].acciones[0];
  assert.ok(ap2.tipo === "aprobar_conteo" && ap2.bloqueo === null);
});

test("legajo dado de baja con cosas a cargo", () => {
  const b = armarBandeja(entrada({
    unidades: [uni({ id: id(80), articulo_id: AMOLADORA, numero: "H-026", lugar: `p:${HECTOR}`, estado: "afuera" })],
    saldos: [
      { articulo_id: AMOLADORA, variante_id: null, lugar: `p:${HECTOR}`, cantidad: 1 },
      { articulo_id: MARTILLO, variante_id: null, lugar: `p:${HECTOR}`, cantidad: 2 },
    ],
  }));
  assert.equal(b.bajas.length, 1);
  assert.equal(b.bajas[0].nombre, "Héctor Paz");
  assert.deepEqual(b.bajas[0].cosas, ["Amoladora #H-026", "2 u. de Martillo"]);
  assert.ok(avisosDeBandeja(b).some((a) => a.clave === `panol_baja:p:${HECTOR}`));
});

test("movido sin nadie a cargo: resumen de ayer y hoy; avisa sólo el de ayer", () => {
  const b = armarBandeja(entrada({
    valesSinEncargado: [
      { id: "v1", created_at: "2026-10-09T20:30:00Z", movimientos: ["retiro", "retiro", "devolucion"] },
      { id: "v2", created_at: "2026-10-09T23:10:00Z", movimientos: ["prestamo"] },
      { id: "v3", created_at: "2026-10-10T12:00:00Z", movimientos: ["retiro"] },
    ],
  }));
  const filas = seccion(b, "sin_encargado").filas;
  assert.equal(filas[0].titulo, "Ayer, de 17:30 a 20:10");
  assert.equal(filas[0].detalle, "4 movimientos en 2 vales: 2 retiros, 1 devolución y 1 préstamo.");
  assert.equal(filas[1].titulo, "Hoy, a las 09:00");
  assert.equal(avisosDeBandeja(b).filter((a) => a.tipo === "panol_resumen").length, 1);
});

test("los avisos de stock llevan la semana en la clave", () => {
  const b = armarBandeja(entrada({ saldos: [{ articulo_id: PRECINTOS, variante_id: null, lugar: `u:${ESTANTE}`, cantidad: 140 }] }));
  const [a] = avisosDeBandeja(b).filter((x) => x.tipo === "panol_stock");
  assert.equal(a.clave, `panol_stock:${PRECINTOS}:-:reponer:2026-W41`);
  assert.equal(semanaISO("2026-01-01"), "2026-W01");
  assert.equal(semanaISO("2027-01-01"), "2026-W53");
});

test("cuandoFue y resumenMovimientos", () => {
  assert.equal(cuandoFue("2026-10-10T17:35:00Z", "2026-10-10"), "hoy 14:35");
  assert.equal(cuandoFue("2026-10-09T19:10:00Z", "2026-10-10"), "ayer 16:10");
  assert.equal(cuandoFue("2026-10-06T12:00:00Z", "2026-10-10"), "hace 4 días");
  assert.equal(cuandoFue("2026-09-20T12:00:00Z", "2026-10-10"), "20/09");
  assert.equal(resumenMovimientos([], 1), "0 movimientos en 1 vale.");
});

test("telefonoWhatsapp normaliza a 549 + 10 dígitos", () => {
  assert.equal(telefonoWhatsapp("11 5555-1234"), "5491155551234");
  assert.equal(telefonoWhatsapp("011 15 5555-1234"), "5491155551234");
  assert.equal(telefonoWhatsapp("+54 9 11 5555-1234"), "5491155551234");
  assert.equal(telefonoWhatsapp("+54 11 5555 1234"), "5491155551234");
  assert.equal(telefonoWhatsapp("0221 15 456-7890"), "5492214567890");
  assert.equal(telefonoWhatsapp("4444-5555"), null);
  assert.equal(telefonoWhatsapp(null), null);
  assert.equal(linkWhatsapp(null, "hola"), null);
  assert.equal(linkWhatsapp("1155551234", "hola che"), "https://wa.me/5491155551234?text=hola%20che");
});
