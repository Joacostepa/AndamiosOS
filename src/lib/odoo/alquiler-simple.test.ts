// Odoo del alquiler simple (docs/sofia/alquiler-simple-propuesta.md §5 y docs/sofia/alquiler-simple-odoo.md):
// los fletes por barrio, la dirección → barrio de USIG y las líneas de la orden con el ejemplo de
// Palermo de la §5. Nada toca la red: USIG entra con un fetch de mentira.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armarFletes, barrioDeDireccion, buscarFletePorBarrio, checksumOdoo, elegirNormalizada, fleteParaUbicacion, FRANJA_MANANA, FRANJA_TARDE,
  horarioEntregaOdoo, lineaRenovacion, lineasOrdenAlquilerSimple, normalizarLugar, utcOdoo, valoresOrdenAlquilerSimple,
  PRODUCTO_BARANDA_090_JUNIOR, PRODUCTO_BASTIDOR_BARANDA_130, PRODUCTO_FLETE, PRODUCTO_MINIMO_OPERATIVO, PRODUCTO_RIENDA_JR_HORIZONTAL, PRODUCTO_RECARGO_FRANJA, PRODUCTO_RENOVACION, PRODUCTOS_ALQUILER_SIMPLE,
  type CotizacionParaOdoo, type Flete, type NormalizadaUsig, type Ubicacion,
} from "./alquiler-simple.ts";

/** Un pedazo de la lista real (métodos 354-450, precios del 12/11). */
const FLETES: Flete[] = [
  { carrierId: 354, nombre: "AGRONOMIA", precio: 109200 },
  { carrierId: 358, nombre: "BANFIELD", precio: 257400 },
  { carrierId: 360, nombre: "BARRIO NORTE", precio: 163200 },
  { carrierId: 361, nombre: "BELGRANO C", precio: 130800 },
  { carrierId: 362, nombre: "BELGRANO R", precio: 124200 },
  { carrierId: 366, nombre: "BOULOGNE", precio: 344400 },
  { carrierId: 374, nombre: "CONTITUCION", precio: 163200 },
  { carrierId: 377, nombre: "ESCOBAR", precio: 410400 },
  { carrierId: 379, nombre: "FLORES", precio: 140400 },
  { carrierId: 380, nombre: "FLORESTA", precio: 140400 },
  { carrierId: 381, nombre: "FLORIDA", precio: 219000 },
  { carrierId: 386, nombre: "JOSE C. PAZ", precio: 432000 },
  { carrierId: 387, nombre: "JOSE L. SUAREZ", precio: 332400 },
  { carrierId: 388, nombre: "LA BOCA", precio: 163200 },
  { carrierId: 391, nombre: "LANUS", precio: 345600 },
  { carrierId: 392, nombre: "LAS CANITAS", precio: 140400 },
  { carrierId: 394, nombre: "LOMAS DE ZAMORA", precio: 257400 },
  { carrierId: 399, nombre: "MONSERRAT", precio: 163200 },
  { carrierId: 404, nombre: "NUNEZ", precio: 150600 },
  { carrierId: 405, nombre: "OLIVOS", precio: 225600 },
  { carrierId: 406, nombre: "PACHECO", precio: 410400 },
  { carrierId: 407, nombre: "PALERMO", precio: 140400 },
  { carrierId: 412, nombre: "PATERNAL", precio: 105600 },
  { carrierId: 423, nombre: "SAN MARTIN", precio: 247200 },
  { carrierId: 443, nombre: "VILLA MITRE", precio: 109200 },
];
const PALERMO = FLETES.find((f) => f.nombre === "PALERMO")!;

// ── Fletes ──────────────────────────────────────────────────────────────────────────────

test("armarFletes: el precio es el de la única regla «cantidad >= 0»", () => {
  const { fletes, descartados } = armarFletes(
    [
      { id: 407, name: "PALERMO", active: true, product_id: [2, "Envío estándar (flete)"] },
      { id: 999, name: "RARO", active: true, product_id: [2, "Envío estándar (flete)"] },
      { id: 998, name: "SIN REGLA", active: true, product_id: [2, "Envío estándar (flete)"] },
      { id: 997, name: "ARCHIVADO", active: false, product_id: [2, "Envío estándar (flete)"] },
    ],
    [
      { carrier_id: [407, "PALERMO"], variable: "quantity", operator: ">=", max_value: 0, list_base_price: 140400, list_price: 0 },
      { carrier_id: [999, "RARO"], variable: "weight", operator: "<=", max_value: 100, list_base_price: 1000, list_price: 5 },
    ],
  );
  assert.deepEqual(fletes, [{ carrierId: 407, nombre: "PALERMO", precio: 140400 }]);
  assert.equal(descartados.length, 3);
});

test("normalizarLugar: sin tildes, sin puntos, en mayúsculas", () => {
  assert.equal(normalizarLugar("Núñez"), "NUNEZ");
  assert.equal(normalizarLugar("José C. Paz"), "JOSE C PAZ");
  assert.equal(normalizarLugar("  Las  Cañitas "), "LAS CANITAS");
  assert.equal(normalizarLugar("Villa Gral. Mitre"), "VILLA GRAL MITRE");
});

test("buscarFletePorBarrio: el barrio tal cual, con tildes o en minúsculas", () => {
  assert.equal(buscarFletePorBarrio(FLETES, "Palermo"), PALERMO);
  assert.equal(buscarFletePorBarrio(FLETES, "palermo, CABA")?.carrierId, 407);
  assert.equal(buscarFletePorBarrio(FLETES, "Núñez")?.carrierId, 404);
  assert.equal(buscarFletePorBarrio(FLETES, "Las Cañitas")?.carrierId, 392);
  assert.equal(buscarFletePorBarrio(FLETES, "Barrio Norte")?.carrierId, 360);
  assert.equal(buscarFletePorBarrio(FLETES, "Belgrano R")?.carrierId, 362);
  assert.equal(buscarFletePorBarrio(FLETES, "Flores")?.carrierId, 379);
  assert.equal(buscarFletePorBarrio(FLETES, "Floresta")?.carrierId, 380);
});

test("buscarFletePorBarrio: los nombres de USIG que en Odoo están distinto", () => {
  assert.equal(buscarFletePorBarrio(FLETES, "Constitucion")?.carrierId, 374); // Odoo: CONTITUCION
  assert.equal(buscarFletePorBarrio(FLETES, "Montserrat")?.carrierId, 399);
  assert.equal(buscarFletePorBarrio(FLETES, "La Paternal")?.carrierId, 412);
  assert.equal(buscarFletePorBarrio(FLETES, "Villa Gral. Mitre")?.carrierId, 443);
  assert.equal(buscarFletePorBarrio(FLETES, "Boca")?.carrierId, 388);
  assert.equal(buscarFletePorBarrio(FLETES, "Palermo Soho")?.carrierId, 407);
  assert.equal(buscarFletePorBarrio(FLETES, "Barrio Palermo")?.carrierId, 407);
});

test("buscarFletePorBarrio: localidades del conurbano con su nombre largo o con «Este/Oeste»", () => {
  assert.equal(buscarFletePorBarrio(FLETES, "Lanús Este")?.carrierId, 391);
  assert.equal(buscarFletePorBarrio(FLETES, "Florida Oeste")?.carrierId, 381);
  assert.equal(buscarFletePorBarrio(FLETES, "Boulogne Sur Mer")?.carrierId, 366);
  assert.equal(buscarFletePorBarrio(FLETES, "Belén de Escobar")?.carrierId, 377);
  assert.equal(buscarFletePorBarrio(FLETES, "General Pacheco")?.carrierId, 406);
  assert.equal(buscarFletePorBarrio(FLETES, "José León Suárez")?.carrierId, 387);
  assert.equal(buscarFletePorBarrio(FLETES, "José C. Paz")?.carrierId, 386);
  assert.equal(buscarFletePorBarrio(FLETES, "General San Martín")?.carrierId, 423);
  assert.equal(buscarFletePorBarrio(FLETES, "Olivos")?.carrierId, 405);
});

test("buscarFletePorBarrio: lo que no está o es ambiguo va a un vendedor (null)", () => {
  assert.equal(buscarFletePorBarrio(FLETES, "Belgrano"), null); // C o R: no se sabe
  assert.equal(buscarFletePorBarrio(FLETES, "Capital"), null);
  assert.equal(buscarFletePorBarrio(FLETES, "CABA"), null);
  assert.equal(buscarFletePorBarrio(FLETES, "Temperley"), null); // su partido está, ella no
  assert.equal(buscarFletePorBarrio(FLETES, "Mar del Plata"), null);
  assert.equal(buscarFletePorBarrio(FLETES, ""), null);
  assert.equal(buscarFletePorBarrio(FLETES, null), null);
  const repetidos = [...FLETES, { carrierId: 9999, nombre: "Palermo", precio: 1 }];
  assert.equal(buscarFletePorBarrio(repetidos, "Palermo"), null);
});

// ── Dirección → barrio ─────────────────────────────────────────────────────────────────

const DORREGO_CABA: NormalizadaUsig = {
  tipo: "calle_altura", direccion: "DORREGO AV. 3307, CABA", cod_partido: "caba", nombre_partido: "CABA", nombre_localidad: "CABA",
  coordenadas: { x: "-58.423897", y: "-34.570852" },
};
const DORREGO_MG: NormalizadaUsig = {
  tipo: "calle_altura", direccion: "Coronel Manuel Dorrego 3307, Esteban Echeverría", cod_partido: "esteban_echeverria",
  nombre_partido: "Esteban Echeverría", nombre_localidad: "Monte Grande", coordenadas: { x: -58.449, y: -34.845 },
};
const DORREGO_SM: NormalizadaUsig = {
  tipo: "calle_altura", direccion: "Dorrego 3307, San Miguel", cod_partido: "san_miguel", nombre_partido: "San Miguel", nombre_localidad: "San Miguel",
  coordenadas: { x: -58.72, y: -34.52 },
};

test("elegirNormalizada: sin localidad escrita, de varias se queda con la de CABA", () => {
  const r = elegirNormalizada([DORREGO_CABA, DORREGO_MG, DORREGO_SM], "Dorrego 3307");
  assert.ok(r && "elegida" in r);
  assert.equal(r.elegida, DORREGO_CABA);
});

test("elegirNormalizada: con localidad escrita, la que coincide; si no se puede decidir, ambigua", () => {
  const r = elegirNormalizada([DORREGO_CABA, DORREGO_MG, DORREGO_SM], "Dorrego 3307, Monte Grande");
  assert.ok(r && "elegida" in r);
  assert.equal(r.elegida, DORREGO_MG);
  const amb = elegirNormalizada([DORREGO_MG, DORREGO_SM], "Dorrego 3307, Provincia");
  assert.ok(amb && "ambigua" in amb);
  assert.equal(amb.ambigua.length, 2);
  assert.equal(elegirNormalizada([], "Dorrego 3307"), null);
});

/** Un fetch de mentira con las respuestas de USIG que se vieron el 12/11. */
function fetchUsig(respuestas: Record<string, unknown>): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = String(url);
    const clave = Object.keys(respuestas).find((k) => u.includes(k));
    return new Response(JSON.stringify(clave ? respuestas[clave] : {}), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

test("barrioDeDireccion: en CABA pide el barrio a datos_utiles con el punto del normalizador", async () => {
  const pedidos: string[] = [];
  const base = fetchUsig({ "normalizar/?direccion=": { direccionesNormalizadas: [DORREGO_CABA, DORREGO_MG] }, datos_utiles: { barrio: "Palermo", comuna: "Comuna 14" } });
  const f = (async (url: string | URL | Request, init?: RequestInit) => { pedidos.push(String(url)); return base(url, init); }) as typeof fetch;
  const r = await barrioDeDireccion("Dorrego 3307 piso 2", { fetchImpl: f, places: false });
  assert.equal(r.estado, "ok");
  if (r.estado !== "ok") return;
  assert.equal(r.ubicacion.enCaba, true);
  assert.equal(r.ubicacion.barrio, "Palermo");
  assert.equal(r.ubicacion.fuente, "usig");
  assert.match(pedidos[0], /direccion=Dorrego%203307&/); // sin el piso
  assert.match(pedidos[1], /datos_utiles\?x=-58\.423897&y=-34\.570852/);
  assert.equal(fleteParaUbicacion(FLETES, r.ubicacion)?.carrierId, 407);
});

test("barrioDeDireccion: en el conurbano usa la localidad del normalizador", async () => {
  const olivos: NormalizadaUsig = {
    tipo: "calle_altura", direccion: "Avenida Maipú 2000, Vicente López", cod_partido: "vicente_lopez", nombre_partido: "Vicente López",
    nombre_localidad: "Olivos", coordenadas: { x: -58.4937, y: -34.505 },
  };
  const r = await barrioDeDireccion("Maipú 2000, Olivos", { fetchImpl: fetchUsig({ normalizar: { direccionesNormalizadas: [olivos] } }), places: false });
  assert.equal(r.estado, "ok");
  if (r.estado !== "ok") return;
  assert.deepEqual([r.ubicacion.enCaba, r.ubicacion.localidad, r.ubicacion.partido, r.ubicacion.barrio], [false, "Olivos", "Vicente López", null]);
  assert.equal(fleteParaUbicacion(FLETES, r.ubicacion)?.carrierId, 405);
});

test("barrioDeDireccion: sin resultado de USIG y sin Places, no encontrada", async () => {
  const r = await barrioDeDireccion("Tortugas Country Club", { fetchImpl: fetchUsig({ normalizar: { errorMessage: "no" } }), places: false });
  assert.equal(r.estado, "no_encontrada");
});

test("fleteParaUbicacion: Belgrano (CABA) va a un vendedor; Temperley también", () => {
  const u = (x: Partial<Ubicacion>): Ubicacion => ({ enCaba: true, barrio: null, localidad: null, partido: null, direccion: "", punto: null, fuente: "usig", ...x });
  assert.equal(fleteParaUbicacion(FLETES, u({ barrio: "Belgrano" })), null);
  assert.equal(fleteParaUbicacion(FLETES, u({ enCaba: false, localidad: "Temperley", partido: "Lomas de Zamora" })), null);
  assert.equal(fleteParaUbicacion(FLETES, u({ enCaba: false, localidad: "Banfield Oeste", partido: "Lomas de Zamora" }))?.carrierId, 358);
});

// ── Las líneas ─────────────────────────────────────────────────────────────────────────

/** El ejemplo de la §5: pared de patio hasta 5 m en Palermo, 2 módulos estándar con ruedas. */
function palermo(cambios: Partial<CotizacionParaOdoo> = {}): CotizacionParaOdoo {
  return {
    piezas: [
      { codigo: "tablon_250", cantidad: 4, precioUnitario: 18000 },
      { codigo: "ruedas_juego", cantidad: 1, precioUnitario: 36000 },
      { codigo: "modulo_130x250", cantidad: 2, precioUnitario: 18000 },
      { codigo: "baranda_130", cantidad: 1, precioUnitario: 18000 },
    ],
    flete: PALERMO,
    minimoOperativo: 197600,
    recargoFranja: 0,
    recargoFranjaPct: 0,
    entrega: "2026-11-16",
    fin: "2026-12-16",
    franja: FRANJA_MANANA,
    ...cambios,
  };
}

test("el ejemplo de Palermo (§5): las líneas como en Odoo y $ 500.000 netos", () => {
  const r = lineasOrdenAlquilerSimple(palermo());
  assert.equal(r.neto, 500000);
  assert.deepEqual(
    r.lineas.map((l) => [l.productId, l.cantidad, l.precioUnitario, l.esFlete]),
    [
      [PRODUCTOS_ALQUILER_SIMPLE.modulo_130x250, 2, 18000, false],
      [PRODUCTOS_ALQUILER_SIMPLE.baranda_130, 1, 18000, false],
      [PRODUCTOS_ALQUILER_SIMPLE.tablon_250, 4, 18000, false],
      [PRODUCTOS_ALQUILER_SIMPLE.ruedas_juego, 1, 36000, false],
      [PRODUCTO_MINIMO_OPERATIVO, 1, 197600, false],
      [PRODUCTO_FLETE, 1, 140400, true],
    ],
  );
  assert.equal(r.lineas[0].descripcion, "MODULO DE ANDAMIO STD 1,30 X 2,50 X 1,80\ndel 16/11/2026 08:00 al 16/12/2026 08:00");
  assert.equal(r.lineas.at(-1)!.descripcion, "PALERMO"); // como S02365: el barrio, sin período
  assert.deepEqual(r.lineas.map((l) => l.secuencia), [10, 11, 12, 13, 14, 15]);
  assert.equal(r.carrierId, 407);
  assert.equal(r.inicioUtc, "2026-11-16 11:00:00"); // 08:00 en Buenos Aires
  assert.equal(r.finUtc, "2026-12-16 11:00:00");
  assert.equal(r.horarioEntrega, "08:00 - 12:00");
  assert.deepEqual(r.avisos, []);
});

test("sin mínimo no va la línea de mínimo operativo", () => {
  const r = lineasOrdenAlquilerSimple(palermo({ minimoOperativo: 0 }));
  assert.ok(!r.lineas.some((l) => l.productId === PRODUCTO_MINIMO_OPERATIVO));
  assert.equal(r.neto, 302400);
});

test("los tornillones van por unidad: 4 por juego, a un cuarto del precio", () => {
  const r = lineasOrdenAlquilerSimple(palermo({
    piezas: [
      { codigo: "modulo_090x250", cantidad: 1, precioUnitario: 18000 },
      { codigo: "baranda_090", cantidad: 1, precioUnitario: 18000 },
      { codigo: "tablon_250", cantidad: 3, precioUnitario: 18000 },
      { codigo: "tornillones_juego", cantidad: 2, precioUnitario: 36000 },
    ],
    minimoOperativo: 0,
  }));
  const t = r.lineas.find((l) => l.productId === PRODUCTOS_ALQUILER_SIMPLE.tornillones_juego)!;
  assert.equal(t.cantidad, 8);
  assert.equal(t.precioUnitario, 9000);
  assert.equal(r.neto, 18000 + 18000 + 54000 + 72000 + 140400);
});

test("baranda angosta: si todas las torres angostas son junior, va la baranda junior", () => {
  const r = lineasOrdenAlquilerSimple(palermo({
    piezas: [
      { codigo: "modulo_090x150", cantidad: 2, precioUnitario: 18000 },
      { codigo: "baranda_090", cantidad: 1, precioUnitario: 18000 },
      { codigo: "tablon_150", cantidad: 3, precioUnitario: 18000 },
      { codigo: "ruedas_juego", cantidad: 1, precioUnitario: 36000 },
    ],
  }));
  assert.ok(r.lineas.some((l) => l.productId === PRODUCTO_BARANDA_090_JUNIOR));
  assert.ok(!r.lineas.some((l) => l.productId === PRODUCTOS_ALQUILER_SIMPLE.baranda_090));
  assert.deepEqual(r.avisos, []);
});

test("baranda estándar junior: no existe en Odoo, va como en S02997 (2 bastidores baranda y 2 riendas JR)", () => {
  const piezas = (baranda: number) => [
    { codigo: "modulo_130x150" as const, cantidad: 2, precioUnitario: 18000 },
    { codigo: "baranda_130" as const, cantidad: 2, precioUnitario: baranda },
    { codigo: "tablon_150" as const, cantidad: 8, precioUnitario: 18000 },
    { codigo: "ruedas_juego" as const, cantidad: 2, precioUnitario: 36000 },
  ];
  const r = lineasOrdenAlquilerSimple(palermo({ piezas: piezas(18000), minimoOperativo: 0 }));
  assert.ok(!r.lineas.some((l) => l.productId === PRODUCTOS_ALQUILER_SIMPLE.baranda_130));
  const bastidor = r.lineas.find((l) => l.productId === PRODUCTO_BASTIDOR_BARANDA_130)!;
  const rienda = r.lineas.find((l) => l.productId === PRODUCTO_RIENDA_JR_HORIZONTAL)!;
  assert.deepEqual([bastidor.cantidad, bastidor.precioUnitario, rienda.cantidad, rienda.precioUnitario], [4, 4500, 4, 4500]);
  assert.match(bastidor.descripcion, /^BASTIDOR BARANDA - 1,30m\. x 1\.00 h\ndel 16\/11\/2026 08:00/);
  assert.equal(r.neto, 36000 + 36000 + 144000 + 72000 + 140400); // el neto no cambia
  assert.deepEqual(r.avisos, []);
  assert.deepEqual(r.lineas.map((l) => l.secuencia), [10, 11, 12, 13, 14, 15]);
  // Un precio que no se divide en 4: no se pierde ni un centavo.
  const raro = lineasOrdenAlquilerSimple(palermo({ piezas: piezas(18001), minimoOperativo: 0 }));
  assert.equal(raro.neto, r.neto + 2);
});

test("baranda estándar con torres de 2,50 y junior: queda la de 2,50 con un aviso", () => {
  const r = lineasOrdenAlquilerSimple(palermo({
    piezas: [
      { codigo: "modulo_130x250", cantidad: 1, precioUnitario: 18000 },
      { codigo: "modulo_130x150", cantidad: 1, precioUnitario: 18000 },
      { codigo: "baranda_130", cantidad: 2, precioUnitario: 18000 },
      { codigo: "tablon_250", cantidad: 4, precioUnitario: 18000 },
      { codigo: "tablon_150", cantidad: 4, precioUnitario: 18000 },
      { codigo: "ruedas_juego", cantidad: 2, precioUnitario: 36000 },
    ],
  }));
  assert.ok(r.lineas.some((l) => l.productId === PRODUCTOS_ALQUILER_SIMPLE.baranda_130));
  assert.ok(!r.lineas.some((l) => l.productId === PRODUCTO_BASTIDOR_BARANDA_130));
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /2,50 y junior/);
});

test("la franja de una hora: línea de recargo con la franja, sin horario del desplegable", () => {
  const r = lineasOrdenAlquilerSimple(palermo({ recargoFranja: 100000, recargoFranjaPct: 20, franja: { desde: "10:00", hasta: "11:00" } }));
  const rec = r.lineas.find((l) => l.productId === PRODUCTO_RECARGO_FRANJA)!;
  assert.equal(rec.precioUnitario, 100000);
  assert.match(rec.descripcion, /de 10:00 a 11:00 h, 20 % del servicio/);
  // El porcentaje es un parámetro: la orden dice el mismo que el mensaje al cliente.
  const otro = lineasOrdenAlquilerSimple(palermo({ recargoFranja: 125000, recargoFranjaPct: 25, franja: { desde: "10:00", hasta: "11:00" } }));
  assert.match(otro.lineas.find((l) => l.productId === PRODUCTO_RECARGO_FRANJA)!.descripcion, /25 % del servicio/);
  assert.equal(r.horarioEntrega, false);
  assert.equal(r.neto, 600000);
  assert.equal(r.inicioUtc, "2026-11-16 13:00:00");
  assert.equal(r.lineas.at(-1)!.esFlete, true); // el flete sigue al final
  assert.deepEqual(r.avisos, []);
});

test("la tarde es 13 a 16, que también está en Odoo", () => {
  assert.equal(horarioEntregaOdoo(FRANJA_TARDE), "13:00 - 16:00");
  assert.equal(lineasOrdenAlquilerSimple(palermo({ franja: FRANJA_TARDE })).inicioUtc, "2026-11-16 16:00:00");
});

test("una franja rara sin recargo, o un recargo con franja de siempre, avisan", () => {
  assert.equal(lineasOrdenAlquilerSimple(palermo({ franja: { desde: "10:00", hasta: "11:00" } })).avisos.length, 1);
  assert.equal(lineasOrdenAlquilerSimple(palermo({ recargoFranja: 100000 })).avisos.length, 1);
});

test("una cotización sin sentido tira (es un error del motor)", () => {
  assert.throws(() => lineasOrdenAlquilerSimple(palermo({ piezas: [] })), /no tiene piezas/);
  assert.throws(() => lineasOrdenAlquilerSimple(palermo({ fin: "2026-11-16" })), /después de la entrega/);
  assert.throws(() => lineasOrdenAlquilerSimple(palermo({ entrega: "16/11/2026" })), /AAAA-MM-DD/);
  assert.throws(() => lineasOrdenAlquilerSimple(palermo({ franja: { desde: "12:00", hasta: "08:00" } })), /franja/);
  assert.throws(() => lineasOrdenAlquilerSimple(palermo({ piezas: [{ codigo: "modulo_130x250", cantidad: 1.5, precioUnitario: 18000 }] })), /Cantidad/);
  assert.throws(() => lineasOrdenAlquilerSimple(palermo({ piezas: [{ codigo: "puntal" as never, cantidad: 1, precioUnitario: 1 }] })), /desconocida/);
  assert.throws(() => lineasOrdenAlquilerSimple(palermo({ flete: { carrierId: 407, nombre: "PALERMO", precio: 0 } })), /flete/);
});

test("utcOdoo: la hora argentina más 3, también cruzando el día", () => {
  assert.equal(utcOdoo("2026-11-12", "08:00"), "2026-11-12 11:00:00");
  assert.equal(utcOdoo("2026-12-31", "22:30"), "2027-01-01 01:30:00");
});

test("la renovación: una línea más, por el monto y con el período hasta la nueva devolución", () => {
  const l = lineaRenovacion({ monto: 166666.666, inicio: "2026-11-16", finNuevo: "2026-12-26", hora: "08:00" });
  assert.equal(l.productId, PRODUCTO_RENOVACION);
  assert.equal(l.precioUnitario, 166666.67);
  assert.equal(l.descripcion, "RENOVACIÓN ALQUILER SIMPLE (SIN MONTAJE)\ndel 16/11/2026 08:00 al 26/12/2026 08:00");
  assert.throws(() => lineaRenovacion({ monto: 0, inicio: "2026-11-16", finNuevo: "2026-12-26", hora: "08:00" }));
});

// ── La orden ───────────────────────────────────────────────────────────────────────────

test("valoresOrdenAlquilerSimple: orden de alquiler «Simple», con el flete, las fechas y la marca", () => {
  const armado = lineasOrdenAlquilerSimple(palermo());
  const v = valoresOrdenAlquilerSimple(
    { marca: "tomas-as:abc", partnerId: 9084, vendedorUserId: 73, cotizacion: palermo(), direccionEntrega: "Dorrego 3307", enCaba: true, origen: "ANDRÉS - SIMPLE", hoy: "2026-11-12" },
    armado, "<p>condiciones</p>", false,
  );
  assert.equal(v.is_rental_order, true);
  assert.equal(v.x_studio_tipo_de_contrato, "Simple");
  assert.equal(v.x_asistente_ref, "tomas-as:abc");
  assert.equal(v.carrier_id, 407);
  assert.equal(v.rental_start_date, "2026-11-16 11:00:00");
  assert.equal(v.validity_date, "2026-11-27");
  assert.equal(v.note, "<p>condiciones</p>");
  assert.equal(v.user_id, 73);
  assert.equal(v.x_obra_provincia, "Ciudad Autónoma de Buenos Aires");
  assert.ok(!("sale_order_template_id" in v)); // la plantilla no se asigna (agregaría sus líneas)
  assert.ok(!("state" in v)); // nunca se confirma
  const lineas = v.order_line as [number, number, Record<string, unknown>][];
  assert.equal(lineas.length, 6);
  assert.deepEqual(lineas.at(-1)![2].is_delivery, true);
  assert.ok(lineas.every((l) => l[2].is_rental === true));
  const reemplazo = valoresOrdenAlquilerSimple(
    { marca: "tomas-as:abc", partnerId: 9084, vendedorUserId: null, cotizacion: palermo(), direccionEntrega: "Dorrego 3307", enCaba: false, origen: "X", hoy: "2026-11-12" },
    armado, null, true,
  );
  assert.deepEqual((reemplazo.order_line as unknown[])[0], [5, 0, 0]);
  assert.ok(!("user_id" in reemplazo) && !("note" in reemplazo));
  assert.equal(reemplazo.x_obra_provincia, "Buenos Aires");
});

test("checksumOdoo: el sha1 en hexa, como el `checksum` de ir.attachment", () => {
  assert.equal(checksumOdoo(Buffer.from("hola")), "99800b85d3383e3a2fb45eb7d0066a4879a9dad0");
});
