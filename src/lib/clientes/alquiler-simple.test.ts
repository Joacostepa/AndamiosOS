// El alquiler simple (docs/sofia/alquiler-simple-propuesta.md): la tabla de alturas de la §4, el
// ejemplo de Palermo de la §5 (con el mínimo de 197.600), el techo de 3 m con el peldaño de 0,80,
// las torres en fila, lo que pide el cliente, cuándo no es fácil (§8), las fechas (§6) y los
// textos: el de Tomás sin plata y el del presupuesto con el total único.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { FilaParametro } from "../cotizador/tarifas.ts";
import { detectarPlata } from "./filtro-salida.ts";
import {
  CLAVES_PARAMETROS_ALQUILER, condicionesAlquilerSimple, cotizarAlquilerSimple, DEPOSITO, franjaSegunModalidad, mensajePresupuestoAlquiler, metros,
  montoRenovacion, parametrosAlquilerDesdeFilas, pedidoVacio, pesos, resumenParaTomas, textoFranja, validarEntrega,
  type ClienteAlquiler, type ContextoAlquiler, type Franja, type PedidoAlquiler, type ResultadoAlquiler,
} from "./alquiler-simple.ts";

// Los valores de la migración 20261112000001 (los de la §5 y la §11).
const P = { precioPieza: 18000, ruedasJuego: 36000, tornillonesJuego: 36000, minimoOperativo: 500000, maxModulos: 10, recargoFranjaPct: 20 };
// Hoy es jueves 12/11/2026. El lunes 23/11 es feriado (Soberanía Nacional, trasladado).
const HOY = "2026-11-12";
const FERIADOS = [{ fecha: "2026-11-23", nombre: "Día de la Soberanía Nacional (20/11)", tipo: "trasladable" }, "2026-12-07", "2026-12-08"];
const LUNES = "2026-11-16";
const MANANA: Franja = { tipo: "manana" };
const TARDE: Franja = { tipo: "tarde" };
const PALERMO = { tipo: "lista" as const, barrio: "Palermo", monto: 140400, metodoEnvioId: 380 };

const CLIENTE: ClienteAlquiler = { mensajesCliente: ["Hola, quiero pintar la pared del patio"], banderas: [], segmento: null, deudaVencida: false };

function ctx(cambios: Partial<ContextoAlquiler> = {}): ContextoAlquiler {
  return { parametros: P, flete: PALERMO, hoy: HOY, feriados: FERIADOS, cliente: CLIENTE, ...cambios };
}

/** Afuera, piso liso, espacio de sobra, el lunes a la mañana. */
function pedido(cambios: Partial<PedidoAlquiler> = {}): PedidoAlquiler {
  return { ...pedidoVacio(), lugar: "afuera", espacioDeSobra: true, piso: "liso", fecha: LUNES, franja: MANANA, ...cambios };
}

const cotizar = (cambios: Partial<PedidoAlquiler> = {}, c: Partial<ContextoAlquiler> = {}) => cotizarAlquilerSimple(pedido(cambios), ctx(c));
const enContra = (r: ResultadoAlquiler) => r.enContra.map((m) => m.codigo);
const faltan = (r: ResultadoAlquiler) => r.faltan.map((f) => f.codigo);
const piezas = (r: ResultadoAlquiler) => Object.fromEntries((r.armado?.piezas ?? []).map((x) => [x.codigo, x.cantidad]));
const sinPlata = (texto: string) => {
  const d = detectarPlata(texto);
  assert.equal(d.bloquea, false, `bloquea: ${d.hallazgos.map((h) => `${h.codigo} «${h.fragmento}»`).join(", ")}\n${texto}`);
  assert.ok(!/[$%]/.test(texto), texto);
};

// ── Parámetros ─────────────────────────────────────────────────────────────────────────

const FILAS: FilaParametro[] = [
  ["alquiler_simple_precio_pieza", 18000], ["alquiler_simple_ruedas", 36000], ["alquiler_simple_tornillones", 36000],
  ["alquiler_simple_minimo", 500000], ["alquiler_simple_max_modulos", 10], ["alquiler_simple_recargo_franja", 20],
].map(([clave, valor]) => ({ clave: clave as string, tipo: "monto", valor: valor as number, valor_min: null, valor_max: null }));

test("parámetros: salen de las filas de cotizacion_parametros", () => {
  assert.deepEqual(parametrosAlquilerDesdeFilas(FILAS), P);
  assert.deepEqual([...CLAVES_PARAMETROS_ALQUILER].sort(), FILAS.map((f) => f.clave).sort());
  // Los valores llegan como texto desde NUMERIC: se convierten.
  assert.equal(parametrosAlquilerDesdeFilas(FILAS.map((f) => ({ ...f, valor: String(f.valor) as unknown as number }))).minimoOperativo, 500000);
});

test("parámetros: si falta una clave, corta con la lista", () => {
  assert.throws(() => parametrosAlquilerDesdeFilas(FILAS.filter((f) => !f.clave.endsWith("_minimo") && !f.clave.endsWith("_ruedas"))), /alquiler_simple_ruedas, alquiler_simple_minimo/);
  assert.throws(() => parametrosAlquilerDesdeFilas(FILAS.map((f) => (f.clave === "alquiler_simple_precio_pieza" ? { ...f, valor: null } : f))), /alquiler_simple_precio_pieza/);
});

test("parámetros: precios en cero, tope no entero o recargo negativo, cortan", () => {
  const con = (clave: string, valor: number) => FILAS.map((f) => (f.clave === clave ? { ...f, valor } : f));
  assert.throws(() => parametrosAlquilerDesdeFilas(con("alquiler_simple_precio_pieza", 0)), /mayores que cero/);
  assert.throws(() => parametrosAlquilerDesdeFilas(con("alquiler_simple_max_modulos", 2.5)), /entero/);
  assert.throws(() => parametrosAlquilerDesdeFilas(con("alquiler_simple_max_modulos", 0)), /entero/);
  assert.throws(() => parametrosAlquilerDesdeFilas(con("alquiler_simple_recargo_franja", -5)), /negativo/);
  assert.equal(parametrosAlquilerDesdeFilas(con("alquiler_simple_recargo_franja", 0)).recargoFranjaPct, 0);
});

// ── La altura: la tabla de la §4 ───────────────────────────────────────────────────────

test("§4: la tabla de alturas con ruedas (1,95 / 3,75 / 5,55)", () => {
  const filas: [number, number, number, number][] = [
    // módulos, plataforma, llega a trabajar, techo mínimo
    [1, 1.95, 3.95, 3.85],
    [2, 3.75, 5.75, 5.65],
    [3, 5.55, 7.55, 7.45],
  ];
  for (const [n, plataforma, llegaHasta, cabeza] of filas) {
    const r = cotizar({ alturaTrabajo: llegaHasta });
    assert.equal(r.armado?.modulosPorTorre, n);
    assert.equal(r.armado?.alturaPlataforma, plataforma);
    assert.equal(r.armado?.llegaHasta, llegaHasta);
    assert.equal(r.armado?.cabezaHasta, cabeza);
    assert.equal(r.armado?.peldano, null);
  }
});

test("§4: la menor cantidad de módulos que llega", () => {
  const casos: [number, number][] = [[2, 1], [3.9, 1], [3.95, 1], [3.96, 2], [4, 2], [5, 2], [5.75, 2], [5.8, 3], [7, 3], [7.5, 3], [7.55, 3]];
  for (const [altura, n] of casos) assert.equal(cotizar({ alturaTrabajo: altura }).armado?.modulosPorTorre, n, `${altura} m`);
});

test("§4 y §8: más de ~7,5 m hay que anclar y va a un vendedor", () => {
  const r = cotizar({ alturaTrabajo: 7.6 });
  assert.equal(r.facil, false);
  assert.deepEqual(enContra(r), ["anclar"]);
  assert.match(r.enContra[0].texto, /sin anclar llega hasta ~7,55 m con 3 módulos/);
  assert.equal(r.armado, null);
  assert.equal(r.precio, null);
  assert.deepEqual(enContra(cotizar({ alturaTrabajo: 9 })), ["anclar"]);
  // Y si el cliente dice que hay que anclar, aunque la altura no lo pida.
  assert.ok(enContra(cotizar({ alturaTrabajo: 4, anclar: true })).includes("anclar"));
});

test("§4: adentro con techo alto, la cabeza entra y manda la altura", () => {
  const r = cotizar({ lugar: "adentro", alturaTrabajo: 5, alturaTecho: 6 });
  assert.equal(r.armado?.modulosPorTorre, 2);
  assert.equal(r.armado?.peldano, null);
  assert.ok(r.facil);
  // Con 5,65 justo entra la cabeza de 2 módulos.
  assert.equal(cotizar({ lugar: "adentro", alturaTrabajo: 5, alturaTecho: 5.65 }).armado?.modulosPorTorre, 2);
});

test("§4: el trabajo es el techo, manda el techo (la plataforma más alta que deja entrar la cabeza)", () => {
  const r = cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 4 });
  assert.equal(r.armado?.modulosPorTorre, 1);
  assert.equal(r.armado?.cabezaHasta, 3.85);
  assert.equal(r.armado?.peldano, null);
  assert.equal(cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 5.7 }).armado?.modulosPorTorre, 2);
  assert.equal(cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 7.5 }).armado?.modulosPorTorre, 3);
  // Sin la altura de trabajo: alcanza con el techo.
  assert.ok(!faltan(r).includes("altura"));
});

test("§4: llegar hasta el techo (o a menos de 10 cm) es trabajar en el techo", () => {
  const r = cotizar({ lugar: "adentro", alturaTrabajo: 3, alturaTecho: 3 });
  assert.equal(r.armado?.peldano, 0.8);
  assert.equal(cotizar({ lugar: "adentro", alturaTrabajo: 2.95, alturaTecho: 3 }).armado?.peldano, 0.8);
  // Hasta 4 m con techo de 4,05: en el techo, 1 módulo (la cabeza queda a 20 cm).
  assert.equal(cotizar({ lugar: "adentro", alturaTrabajo: 4, alturaTecho: 4.05 }).armado?.modulosPorTorre, 1);
});

test("§4 y §8: un techo de más de ~7,5 m es trabajar a más de ~7,5 m: hay que anclar", () => {
  assert.equal(cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 7.55 }).armado?.modulosPorTorre, 3);
  assert.deepEqual(enContra(cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 7.6 })), ["anclar"]);
  assert.deepEqual(enContra(cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 9 })), ["anclar"]);
});

// ── El peldaño (excepción, JS 12/11) ───────────────────────────────────────────────────

test("§4: techo de 3 m, el peldaño de 0,80 (el ejemplo de la propuesta)", () => {
  const r = cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 3 });
  const a = r.armado;
  assert.ok(a);
  assert.equal(a.modulosPorTorre, 1);
  assert.equal(a.peldano, 0.8);
  assert.equal(a.alturaPlataforma, 0.95);
  assert.equal(a.cabezaHasta, 2.85);
  assert.equal(a.llegaHasta, 2.95);
  // Se cobra igual que con la plataforma arriba (fila 14): módulo, baranda, piso completo y ruedas.
  assert.deepEqual(piezas(r), { modulo_130x250: 1, baranda_130: 1, tablon_250: 4, ruedas_juego: 1 });
  assert.equal(r.precio?.material, 6 * 18000 + 36000);
  assert.equal(r.precio?.material, cotizar({ alturaTrabajo: 3 }).precio?.material);
  // Es una alternativa: Tomás se la aclara (un solo tablón) y el cliente la acepta.
  assert.ok(r.facil);
  assert.equal(r.listo, false);
  assert.deepEqual(r.aConfirmar.map((c) => c.codigo), ["plataforma"]);
  assert.match(r.aConfirmar[0].texto, /peldaño de 0,80 m de la escalera del bastidor, a 0,95 m del piso: es de un solo tablón de 30 cm.*~2,95 m/);
  // Llega al techo (2,95 a 5 cm de 3 m): no dice que no llega.
  assert.equal(r.armado?.llegaAlTecho, true);
  assert.ok(!/no llega/.test(r.aConfirmar[0].texto));
  const acepta = cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 3, aceptaPlataforma: true });
  assert.equal(acepta.listo, true);
  // Si no le sirve, a un vendedor.
  const no = cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 3, aceptaPlataforma: false });
  assert.equal(no.facil, false);
  assert.deepEqual(enContra(no), ["plataforma_rechazada"]);
});

test("§4: el peldaño más alto que deja entrar la cabeza", () => {
  // Los techos de casa: la cabeza entra siempre y queda a 50 cm o menos del techo.
  const casos: [number, number][] = [[2.45, 0.4], [2.6, 0.4], [2.8, 0.4], [2.85, 0.8], [3, 0.8], [3.2, 0.8], [3.25, 1.2], [3.5, 1.2], [3.75, 1.2]];
  for (const [techo, peldano] of casos) {
    const r = cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: techo });
    assert.equal(r.armado?.peldano, peldano, `techo ${techo}`);
    const cabeza = r.armado?.cabezaHasta ?? 99;
    assert.ok(cabeza <= techo && techo - cabeza <= 0.5 + 1e-9, `techo ${techo}: cabeza a ${cabeza}`);
  }
  // Una pared hasta 2,50 con techo de 3 m: arriba no entra la cabeza, va el peldaño de 0,80.
  const pared = cotizar({ lugar: "adentro", alturaTrabajo: 2.5, alturaTecho: 3 });
  assert.equal(pared.armado?.peldano, 0.8);
  // Una pared hasta 2 m con techo de 4 m: arriba entra, no hace falta el peldaño.
  assert.equal(cotizar({ lugar: "adentro", alturaTrabajo: 2, alturaTecho: 4 }).armado?.peldano, null);
});

test("§4 y §8: el techo que no deja pararse en ninguna plataforma va a un vendedor", () => {
  // Más bajo que el peldaño de 0,40 + la cabeza.
  const bajo = cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 2.4 });
  assert.deepEqual(enContra(bajo), ["techo_no_deja"]);
  assert.equal(bajo.armado, null);
  assert.match(bajo.enContra[0].texto, /no deja pararse con la cabeza adentro en ninguna plataforma/);
  // Una pared hasta 2 m con techo de 2,40: tampoco.
  assert.deepEqual(enContra(cotizar({ lugar: "adentro", alturaTrabajo: 2, alturaTecho: 2.4 })), ["techo_no_deja"]);
  // Una pared hasta 5,30 con techo de 5,45: la cabeza entra con el peldaño de 1,20 del segundo, pero no llega.
  const pared = cotizar({ lugar: "adentro", alturaTrabajo: 5.3, alturaTecho: 5.45 });
  assert.deepEqual(enContra(pared), ["techo_no_deja"]);
  assert.match(pared.enContra[0].texto, /la plataforma más alta queda a 3,15 m \(con un tablón en el peldaño de 1,20 m del segundo módulo\) y llega hasta ~5,15 m: no alcanza a 5,30 m/);
});

// ── El peldaño en cualquier módulo y sin el margen de 50 cm (JS, 12/11, fila 19) ───────

test("fila 19: el peldaño en cualquier módulo, cuando acerca más al techo", () => {
  // Techo de 5 m: arriba de 1 módulo llega a ~3,95; un tablón en el peldaño de 0,80 del segundo, a 2,75 m, llega a ~4,75.
  const r = cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 5 });
  assert.ok(r.facil);
  assert.equal(r.armado?.modulosPorTorre, 2);
  assert.equal(r.armado?.peldano, 0.8);
  assert.equal(r.armado?.alturaPlataforma, 2.75);
  assert.equal(r.armado?.cabezaHasta, 4.65);
  assert.equal(r.armado?.llegaHasta, 4.75);
  assert.equal(r.armado?.llegaAlTecho, false);
  // Se cobra igual que el módulo completo: 2 módulos, baranda, piso completo y ruedas.
  assert.deepEqual(piezas(r), { modulo_130x250: 2, baranda_130: 1, tablon_250: 4, ruedas_juego: 1 });
  // Se le aclara en qué altura queda y hasta dónde llega, para que lo confirme.
  assert.deepEqual(r.aConfirmar.map((c) => c.codigo), ["plataforma"]);
  assert.match(r.aConfirmar[0].texto, /peldaño de 0,80 m del segundo módulo de la escalera del bastidor, a 2,75 m del piso: es de un solo tablón de 30 cm\. La cabeza llega a 4,65 m y trabaja cómodo hasta ~4,75 m\. El techo está a 5 m: no llega a trabajar cómodo en el techo\./);
  assert.equal(cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 5, aceptaPlataforma: true }).listo, true);
  // Techo de 7 m: el peldaño de 1,20 del tercero (4,95 m) llega a ~6,95.
  const siete = cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 7 });
  assert.deepEqual([siete.armado?.modulosPorTorre, siete.armado?.peldano, siete.armado?.alturaPlataforma, siete.armado?.llegaAlTecho], [3, 1.2, 4.95, true]);
  // Una pared hasta 4,30 con techo de 5 m: 2 módulos no dejan entrar la cabeza; el peldaño de 0,80 del segundo, sí.
  const pared = cotizar({ lugar: "adentro", alturaTrabajo: 4.3, alturaTecho: 5 });
  assert.deepEqual([pared.armado?.modulosPorTorre, pared.armado?.peldano, pared.armado?.alturaPlataforma], [2, 0.8, 2.75]);
  assert.equal(pared.armado?.llegaAlTecho, null); // no es en el techo
});

test("fila 19: si la plataforma de arriba sirve igual, va arriba (piso completo y baranda)", () => {
  // Techo de 5,70: arriba de 2 módulos (3,75) la cabeza entra y llega a ~5,75: no hace falta confirmar.
  const r = cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 5.7 });
  assert.deepEqual([r.armado?.modulosPorTorre, r.armado?.peldano, r.armado?.llegaAlTecho], [2, null, true]);
  assert.deepEqual(r.aConfirmar, []);
  assert.equal(r.listo, true);
  // Techo de 4: arriba de 1 módulo llega a ~3,95; ningún peldaño del segundo deja entrar la cabeza.
  assert.deepEqual([cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 4 }).armado?.peldano], [null]);
  // Una pared hasta 3 m afuera: arriba de 1 módulo, nunca un peldaño.
  assert.equal(cotizar({ alturaTrabajo: 3 }).armado?.peldano, null);
});

test("fila 19: ya no va a un vendedor por el margen de 50 cm: se cotiza y se confirma", () => {
  // 3,80: antes «techo_no_deja» (la cabeza a 55 cm). Ahora, el peldaño de 1,20 (1,35 m), llega a ~3,35.
  const r = cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 3.8 });
  assert.ok(r.facil);
  assert.deepEqual([r.armado?.modulosPorTorre, r.armado?.peldano, r.armado?.alturaPlataforma, r.armado?.llegaHasta], [1, 1.2, 1.35, 3.35]);
  assert.match(r.aConfirmar[0].texto, /El techo está a 3,80 m: no llega a trabajar cómodo en el techo/);
  // 6 m: arriba de 2 módulos (3,75 m), llega a ~5,75: no llega cómodo al techo y se confirma (sin peldaño).
  const seis = cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 6 });
  assert.deepEqual([seis.armado?.modulosPorTorre, seis.armado?.peldano, seis.armado?.llegaAlTecho], [2, null, false]);
  assert.deepEqual(seis.aConfirmar.map((c) => c.codigo), ["plataforma"]);
  assert.match(seis.aConfirmar[0].texto, /^La plataforma queda arriba de 2 módulos, a 3,75 m del piso\. La cabeza llega a 5,65 m y trabaja cómodo hasta ~5,75 m\. El techo está a 6 m/);
  // Si no le sirve, a un vendedor (con el código nuevo).
  const no = cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 6, aceptaPlataforma: false });
  assert.deepEqual(enContra(no), ["plataforma_rechazada"]);
  assert.match(no.enContra[0].texto, /a 3,75 m, arriba de 2 módulos/);
  // Si le sirve, sale.
  assert.equal(cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 6, aceptaPlataforma: true }).listo, true);
  // Si llega al techo y va arriba, la respuesta no importa.
  assert.ok(cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 5.7, aceptaPlataforma: false }).facil);
});

// ── El ancho, el largo y las torres ────────────────────────────────────────────────────

test("§4: el ancho y el largo según el espacio libre", () => {
  const casos: [number, number, string][] = [
    [1.3, 2.5, "modulo_130x250"], [2, 4, "modulo_130x250"], [1.29, 2.5, "modulo_090x250"], [0.9, 2.5, "modulo_090x250"],
    [1.3, 2.49, "modulo_130x150"], [1.3, 1.5, "modulo_130x150"], [1, 1.8, "modulo_090x150"],
  ];
  for (const [ancho, largo, modulo] of casos) {
    const r = cotizar({ espacioDeSobra: false, anchoLibre: ancho, largoLibre: largo, alturaTrabajo: 3 });
    assert.equal(r.armado?.piezas[0].codigo, modulo, `${ancho} × ${largo}`);
    assert.ok(r.facil);
  }
});

test("§4: el angosto junior lleva baranda de 0,90 y 3 tablones de 1,50 (fila 2)", () => {
  const r = cotizar({ espacioDeSobra: false, anchoLibre: 1, largoLibre: 2, alturaTrabajo: 3 });
  assert.deepEqual(piezas(r), { modulo_090x150: 1, baranda_090: 1, tablon_150: 3, ruedas_juego: 1 });
  assert.equal(r.armado?.tablonesPorTorre, 3);
});

test("§8: menos de 0,90 de ancho o de 1,50 de largo va a un vendedor", () => {
  const angosto = cotizar({ espacioDeSobra: false, anchoLibre: 0.89, largoLibre: 3, alturaTrabajo: 3 });
  assert.deepEqual(enContra(angosto), ["espacio_ancho"]);
  assert.match(angosto.enContra[0].texto, /0,89 m libres de ancho/);
  assert.equal(angosto.armado, null);
  assert.deepEqual(enContra(cotizar({ espacioDeSobra: false, anchoLibre: 2, largoLibre: 1.49, alturaTrabajo: 3 })), ["espacio_largo"]);
});

test("§4: piso desparejo, tornillones en vez de ruedas", () => {
  const r = cotizar({ alturaTrabajo: 5, piso: "desparejo" });
  assert.deepEqual(piezas(r), { modulo_130x250: 2, baranda_130: 1, tablon_250: 4, tornillones_juego: 1 });
  assert.equal(r.precio?.material, 7 * 18000 + 36000);
});

test("§2: varias torres en fila, cada una se cobra entera", () => {
  const r = cotizar({ alturaTrabajo: 3, largoACubrir: 6 });
  assert.equal(r.armado?.torres, 3);
  assert.deepEqual(piezas(r), { modulo_130x250: 3, baranda_130: 3, tablon_250: 12, ruedas_juego: 3 });
  assert.equal(r.precio?.material, 3 * (6 * 18000 + 36000));
  assert.equal(cotizar({ alturaTrabajo: 3, largoACubrir: 5 }).armado?.torres, 2);
  assert.equal(cotizar({ alturaTrabajo: 3, largoACubrir: 2.5 }).armado?.torres, 1);
  // Con poco largo libre, junior: 3 m a cubrir son 2 torres de 1,50.
  const jr = cotizar({ espacioDeSobra: false, anchoLibre: 1.3, largoLibre: 2, largoACubrir: 3, alturaTrabajo: 3 });
  assert.equal(jr.armado?.largo, "junior");
  assert.equal(jr.armado?.torres, 2);
  // Las torres que pide el cliente.
  assert.equal(cotizar({ alturaTrabajo: 3, torres: 2 }).armado?.torres, 2);
});

test("§8: más de 10 módulos (sin contar barandas) va a un vendedor", () => {
  const diez = cotizar({ alturaTrabajo: 3, torres: 10 });
  assert.ok(diez.facil);
  assert.equal(diez.motivos.find((m) => m.codigo === "tope_modulos")?.texto, "10 módulos en total (tope 10)");
  const r = cotizar({ alturaTrabajo: 7, torres: 4 });
  assert.deepEqual(enContra(r), ["tope_modulos"]);
  assert.equal(r.enContra[0].texto, "12 módulos en total: pasa el tope de 10");
  // El tope es de Parámetros.
  assert.ok(cotizar({ alturaTrabajo: 7, torres: 4 }, { parametros: { ...P, maxModulos: 12 } }).facil);
});

// ── El precio: el ejemplo de Palermo (§5) ──────────────────────────────────────────────

test("§5: el ejemplo de Palermo da $ 500.000 con el mínimo de 197.600", () => {
  const r = cotizar({ alturaTrabajo: 5 });
  assert.equal(r.listo, true, JSON.stringify({ enContra: r.enContra, faltan: r.faltan, aConfirmar: r.aConfirmar }));
  assert.equal(r.facil, true);
  const pr = r.precio;
  assert.ok(pr);
  assert.deepEqual(
    pr.lineas.map((l) => [l.codigo, l.descripcion, l.cantidad, l.precioUnitario, l.importe]),
    [
      ["modulo_130x250", "Módulo STD 1,30 × 2,50 × 1,80", 2, 18000, 36000],
      ["baranda_130", "Módulo baranda STD 1,30", 1, 18000, 18000],
      ["tablon_250", "Tablón metálico 2,50", 4, 18000, 72000],
      ["ruedas_juego", "Juego de ruedas (4 u.)", 1, 36000, 36000],
      ["flete", "Flete Palermo (entrega y retiro)", 1, 140400, 140400],
      ["minimo_operativo", "Mínimo operativo", 1, 197600, 197600],
    ],
  );
  assert.equal(pr.material, 162000);
  assert.equal(pr.flete, 140400);
  assert.equal(pr.minimoOperativo, 197600);
  assert.equal(pr.base, 500000);
  assert.equal(pr.recargoFranja, 0);
  assert.equal(pr.total, 500000);
  // 10 días más: 500.000 ÷ 30 × 10 = 166.667.
  assert.equal(montoRenovacion(pr.base, 10), 166667);
  assert.equal(pr.porDia, 16667);
  assert.equal(montoRenovacion(pr.base, 30), 500000);
});

test("§6 y fila 15: la franja de una hora, 20 % sobre el total del servicio ($ 100.000 en Palermo)", () => {
  const r = cotizar({ alturaTrabajo: 5, franja: { tipo: "hora", desde: 10 } });
  const pr = r.precio;
  assert.ok(pr);
  assert.equal(pr.base, 500000);
  assert.equal(pr.recargoFranja, 100000);
  assert.equal(pr.total, 600000);
  assert.equal(pr.recargoFranjaPct, 20);
  assert.deepEqual(pr.lineas.at(-1), { codigo: "recargo_franja", descripcion: "Recargo por franja de una hora (de 10 a 11, 20 %)", cantidad: 1, precioUnitario: 100000, importe: 100000 });
  // La renovación no lleva el recargo (fila 21): es por la entrega a una hora fija, no por el alquiler.
  assert.equal(pr.porDia, 16667);
  assert.equal(montoRenovacion(pr.base, 10), 166667);
  // Las franjas de 4 y de 3 horas no tienen recargo.
  assert.equal(cotizar({ alturaTrabajo: 5, franja: TARDE }).precio?.recargoFranja, 0);
});

test("§5: si el material y el flete pasan el mínimo, no hay línea de mínimo", () => {
  const r = cotizar({ alturaTrabajo: 7, torres: 3 });
  const pr = r.precio;
  assert.ok(pr);
  assert.equal(pr.material, 3 * (3 + 1 + 4) * 18000 + 3 * 36000);
  assert.equal(pr.minimoOperativo, 0);
  assert.ok(!pr.lineas.some((l) => l.codigo === "minimo_operativo"));
  assert.equal(pr.base, pr.material + 140400);
  assert.deepEqual(r.entraSinPagarMas, []);
});

test("§7: si no llega al mínimo, lo que le entra sin pagar más", () => {
  // Palermo: le entra otra torre igual o un módulo más de alto.
  assert.deepEqual(cotizar({ alturaTrabajo: 5 }).entraSinPagarMas, [{ tipo: "otra_torre", cantidad: 1 }, { tipo: "modulo_mas", llegaHasta: 7.55 }]);
  // Con un flete barato, le entran 2 torres más.
  const barato = cotizar({ alturaTrabajo: 3 }, { flete: { tipo: "lista", barrio: "Núñez", monto: 50000 } });
  assert.deepEqual(barato.entraSinPagarMas, [{ tipo: "otra_torre", cantidad: 2 }, { tipo: "modulo_mas", llegaHasta: 5.75 }]);
  // Con 3 módulos no hay módulo más (habría que anclar).
  assert.deepEqual(cotizar({ alturaTrabajo: 7 }).entraSinPagarMas, []);
  // Adentro, si con un módulo más no entra la cabeza, tampoco.
  assert.deepEqual(cotizar({ lugar: "adentro", alturaTrabajo: 3, alturaTecho: 4 }).entraSinPagarMas, [{ tipo: "otra_torre", cantidad: 1 }]);
  // Nunca por encima del tope de módulos.
  assert.deepEqual(cotizar({ alturaTrabajo: 3 }, { parametros: { ...P, maxModulos: 1 } }).entraSinPagarMas, []);
});

test("§5: sin flete en la lista no hay precio y va a un vendedor; sin dirección, falta", () => {
  const fuera = cotizar({ alturaTrabajo: 5 }, { flete: { tipo: "fuera_de_lista", barrio: "Pilar" } });
  assert.deepEqual(enContra(fuera), ["sin_flete"]);
  assert.equal(fuera.enContra[0].texto, "El barrio «Pilar» no está en la lista de fletes");
  assert.equal(fuera.precio, null);
  assert.ok(fuera.armado);
  const sinDir = cotizar({ alturaTrabajo: 5 }, { flete: null });
  assert.ok(faltan(sinDir).includes("direccion"));
  assert.equal(sinDir.precio, null);
  assert.equal(sinDir.listo, false);
});

// ── Lo que pide el cliente ─────────────────────────────────────────────────────────────

test("§3: «2 módulos con ruedas» que le sirven: se cotiza eso", () => {
  const r = cotizar({ alturaTrabajo: 5, espacioDeSobra: false, piso: null, piezas: { modulosPorTorre: 2, apoyo: "ruedas", ancho: "estandar", largo: "largo" } });
  assert.equal(r.armado?.origen, "cliente");
  assert.deepEqual(piezas(r), { modulo_130x250: 2, baranda_130: 1, tablon_250: 4, ruedas_juego: 1 });
  assert.deepEqual(r.faltan, []);
  assert.equal(r.listo, true);
  // Si pide más de lo necesario, se respeta.
  assert.equal(cotizar({ alturaTrabajo: 4, piezas: { modulosPorTorre: 3 } }).armado?.modulosPorTorre, 3);
});

test("§4 y §7: siempre la baranda y el piso completo, explicándolo", () => {
  const r = cotizar({ alturaTrabajo: 5, piezas: { modulosPorTorre: 2, tablonesPorTorre: 2, conBaranda: false } });
  const a = r.armado;
  assert.ok(a);
  assert.equal(a.tablonesPorTorre, 4);
  assert.equal(a.barandaSeLleva, false);
  // La baranda se cobra igual (fila 8).
  assert.deepEqual(piezas(r), { modulo_130x250: 2, baranda_130: 1, tablon_250: 4, ruedas_juego: 1 });
  assert.equal(a.ajustes.length, 2);
  assert.match(a.ajustes[0], /Pidió 2 tablones: va el piso completo, 4 en el de 1,30/);
  assert.match(a.ajustes[1], /no se lleva pero se cobra igual/);
  assert.equal(r.listo, true);
});

test("lo que pide el cliente: ruedas en piso desparejo pasan a tornillones; el estándar en 1 m, al angosto", () => {
  const r = cotizar({ alturaTrabajo: 3, piso: "desparejo", espacioDeSobra: false, anchoLibre: 1, largoLibre: 3, piezas: { modulosPorTorre: 1, apoyo: "ruedas", ancho: "estandar" } });
  assert.deepEqual(piezas(r), { modulo_090x250: 1, baranda_090: 1, tablon_250: 3, tornillones_juego: 1 });
  assert.equal(r.armado?.ajustes.length, 2);
  // El angosto en un espacio grande se respeta.
  assert.equal(cotizar({ alturaTrabajo: 3, piezas: { modulosPorTorre: 1, ancho: "angosto" } }).armado?.ancho, "angosto");
});

test("lo que pide el cliente: si no llega, se cotiza lo que sirve y Tomás lo confirma", () => {
  const r = cotizar({ alturaTrabajo: 5, piezas: { modulosPorTorre: 1 } });
  assert.equal(r.armado?.origen, "recomendado");
  assert.equal(r.armado?.modulosPorTorre, 2);
  assert.ok(r.facil);
  assert.equal(r.listo, false);
  assert.deepEqual(r.aConfirmar.map((c) => c.codigo), ["piezas_no_sirven"]);
  assert.match(r.aConfirmar[0].texto, /con 1 módulo llega hasta ~3,95 m y tiene que llegar a 5 m.*2 módulos/);
  // Adentro: 2 módulos con techo de 4 m no dejan entrar la cabeza; sirve 1.
  const techo = cotizar({ lugar: "adentro", alturaTrabajo: 3.5, alturaTecho: 4, piezas: { modulosPorTorre: 2 } });
  assert.equal(techo.armado?.modulosPorTorre, 1);
  assert.match(techo.aConfirmar[0].texto, /no entra la cabeza \(techo de 4 m\)/);
  // 1 módulo con techo de 3 m: el peldaño.
  const peldano = cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 3, piezas: { modulosPorTorre: 1 } });
  assert.equal(peldano.armado?.origen, "cliente");
  assert.equal(peldano.armado?.peldano, 0.8);
  // 2 módulos con techo de 4,50: arriba no entra la cabeza, el peldaño de 0,40 del segundo sí. Es lo que pidió.
  const dos = cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 4.5, piezas: { modulosPorTorre: 2 } });
  assert.deepEqual([dos.armado?.origen, dos.armado?.modulosPorTorre, dos.armado?.peldano], ["cliente", 2, 0.4]);
  assert.deepEqual(dos.aConfirmar.map((c) => c.codigo), ["plataforma"]);
  // 1 módulo para un techo de 5 m: queda más lejos del techo que con lo recomendado (el peldaño del segundo).
  const uno = cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 5, piezas: { modulosPorTorre: 1 } });
  assert.equal(uno.armado?.origen, "recomendado");
  assert.deepEqual([uno.armado?.modulosPorTorre, uno.armado?.peldano], [2, 0.8]);
  assert.match(uno.aConfirmar[0].texto, /con 1 módulo llega hasta ~3,95 m y tiene que llegar al techo de 5 m.*2 módulos con la plataforma en el peldaño de 0,80 m del segundo módulo/);
  // Si tampoco sirve lo recomendado, manda el motivo de las reglas.
  assert.deepEqual(enContra(cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 2.4, piezas: { modulosPorTorre: 1 } })), ["techo_no_deja"]);
});

test("lo que pide el cliente: más de 3 módulos de alto hay que anclar", () => {
  const r = cotizar({ alturaTrabajo: 5, piezas: { modulosPorTorre: 4 } });
  assert.deepEqual(enContra(r), ["anclar"]);
  assert.equal(r.enContra[0].texto, "Pide 4 módulos de alto: más de 3 hay que anclar");
});

// ── Lo que falta ───────────────────────────────────────────────────────────────────────

test("§3: lo que falta preguntar, en orden", () => {
  const r = cotizarAlquilerSimple(pedidoVacio(), ctx({ flete: null }));
  assert.deepEqual(faltan(r), ["lugar", "altura", "ancho", "largo", "piso", "direccion", "fecha", "franja"]);
  assert.equal(r.armado, null);
  assert.equal(r.listo, false);
  for (const f of r.faltan) sinPlata(f.pregunta);
  // Adentro hace falta el techo.
  assert.deepEqual(faltan(cotizar({ lugar: "adentro", alturaTrabajo: 3 })), ["techo"]);
  // Con las medidas de la pieza, no se pregunta el espacio.
  assert.deepEqual(faltan(cotizar({ alturaTrabajo: 3, espacioDeSobra: false, piezas: { modulosPorTorre: 1, ancho: "estandar", largo: "largo" } })), []);
  // Sin piso, pero pidió tornillones.
  assert.deepEqual(faltan(cotizar({ alturaTrabajo: 3, piso: null, piezas: { modulosPorTorre: 1, apoyo: "tornillones" } })), []);
  // El largo a cubrir sirve de largo libre.
  assert.deepEqual(faltan(cotizar({ alturaTrabajo: 3, espacioDeSobra: false, anchoLibre: 1.5, largoACubrir: 5 })), []);
});

// ── Cuándo no es fácil (§8) ────────────────────────────────────────────────────────────

test("§8: para hoy va a un vendedor (por la marca o por la fecha)", () => {
  const marca = cotizar({ alturaTrabajo: 3, paraHoy: true, fecha: null, franja: null });
  assert.deepEqual(enContra(marca), ["para_hoy"]);
  assert.ok(!faltan(marca).includes("fecha"));
  const fecha = cotizar({ alturaTrabajo: 3, fecha: HOY });
  assert.deepEqual(enContra(fecha), ["para_hoy"]);
  assert.equal(fecha.aConfirmar.length, 0);
});

test("§8: montaje y piezas fuera de la §2", () => {
  const r = cotizar({ alturaTrabajo: 3, montaje: true, piezasFueraDeCatalogo: ["puntales", " ", "ménsulas"] });
  assert.deepEqual(enContra(r), ["piezas_fuera", "montaje"]);
  assert.equal(r.enContra[0].texto, "Pide piezas que no son del alquiler simple: puntales, ménsulas");
});

test("§8: las alertas de facil.ts, filtradas a lo que aplica al alquiler", () => {
  const con = (mensajesCliente: string[], cambios: Partial<ClienteAlquiler> = {}) => cotizar({ alturaTrabajo: 3 }, { cliente: { ...CLIENTE, mensajesCliente, ...cambios } });
  // Lo que es el pedido no es alerta: la fecha, el andamio, el techo, la vereda rota, la cabeza.
  const normal = con(["Necesito un andamio con ruedas para mañana, 2 módulos", "es para el techo, la vereda está rota", "no quiero golpearme la cabeza", "trabajamos de noche"]);
  assert.ok(normal.facil, JSON.stringify(normal.enContra));
  assert.equal(normal.motivos.find((m) => m.codigo === "palabras")?.texto, "Sin palabras de alerta");
  // Lo que sí: regateo, enojo, pedir una persona, la gama alta.
  assert.deepEqual(enContra(con(["¿me hacés un descuento?"])), ["palabras"]);
  assert.deepEqual(enContra(con(["quiero hablar con un vendedor"])), ["palabras"]);
  assert.deepEqual(enContra(con(["necesito andamio multidireccional"])), ["gama_alta"]);
  assert.deepEqual(enContra(con([], { segmento: "gama_alta" })), ["gama_alta"]);
  // Las banderas de la IA: las de fecha u otro trabajo no; persona y seguridad sí.
  assert.ok(con([], { banderas: ["fecha", "otro_trabajo", "nocturno", "tramo"] }).facil);
  assert.deepEqual(enContra(con([], { banderas: ["persona", "seguridad"] })), ["bandera", "bandera"]);
});

test("§8: la deuda y la cuenta de los socios son del cliente: el trabajo sigue siendo fácil", () => {
  const deuda = cotizar({ alturaTrabajo: 5 }, { cliente: { ...CLIENTE, deudaVencida: true } });
  assert.equal(deuda.facil, false);
  assert.equal(deuda.trabajoFacil, true);
  assert.equal(deuda.listo, false);
  assert.deepEqual(deuda.enContra.map((m) => [m.codigo, m.grupo]), [["deuda", "cliente"]]);
  // No se pudo revisar: cuenta como «no».
  assert.deepEqual(enContra(cotizar({ alturaTrabajo: 5 }, { cliente: { ...CLIENTE, deudaVencida: null } })), ["deuda"]);
  assert.deepEqual(enContra(cotizar({ alturaTrabajo: 5 }, { cliente: { ...CLIENTE, cuentaSocio: true } })), ["cuenta_socio"]);
  // Tomás recibe exactamente lo mismo que si no tuviera deuda.
  const limpio = cotizar({ alturaTrabajo: 5 });
  const sinListo = (t: string) => t.split("\n").filter((x) => !x.startsWith("Está todo")).join("\n");
  assert.equal(sinListo(resumenParaTomas(deuda)), sinListo(resumenParaTomas(limpio)));
  assert.ok(!/deuda|socios/i.test(resumenParaTomas(deuda)));
});

// ── Fechas y franjas (§6) ──────────────────────────────────────────────────────────────

test("§6: de lunes a viernes de 8 a 12 o de 13 a 16, o una hora adentro", () => {
  for (const f of [MANANA, TARDE, { tipo: "hora", desde: 8 }, { tipo: "hora", desde: 11 }, { tipo: "hora", desde: 13 }, { tipo: "hora", desde: 15 }, { tipo: "hora", desde: 9.5 }] as Franja[]) {
    const r = validarEntrega("2026-11-13", f, HOY, FERIADOS);
    assert.equal(r.ok, true, textoFranja(f));
    assert.deepEqual(r.proxima, { fecha: "2026-11-13", franja: f });
  }
  assert.equal(validarEntrega("2026-11-13", null, HOY, FERIADOS).ok, true);
  assert.equal(validarEntrega("2026-11-13", MANANA, HOY, FERIADOS).texto, "Entrega el viernes 13 de noviembre, de 8 a 12");
});

test("§6: nunca hoy; la próxima es mañana", () => {
  const r = validarEntrega(HOY, MANANA, HOY, FERIADOS);
  assert.equal(r.motivo, "hoy");
  assert.deepEqual(r.proxima, { fecha: "2026-11-13", franja: MANANA });
  assert.equal(validarEntrega("2026-11-10", MANANA, HOY, FERIADOS).motivo, "pasada");
  assert.equal(validarEntrega("2026-02-30", MANANA, HOY, FERIADOS).motivo, "fecha_invalida");
  assert.equal(validarEntrega("mañana", MANANA, HOY, FERIADOS).motivo, "fecha_invalida");
});

test("§6: ni domingos ni feriados", () => {
  const dom = validarEntrega("2026-11-15", MANANA, HOY, FERIADOS);
  assert.equal(dom.motivo, "domingo");
  assert.deepEqual(dom.proxima, { fecha: LUNES, franja: MANANA });
  const fer = validarEntrega("2026-11-23", TARDE, HOY, FERIADOS);
  assert.equal(fer.motivo, "feriado");
  assert.match(fer.texto, /lunes 23 de noviembre es feriado/);
  assert.deepEqual(fer.proxima, { fecha: "2026-11-24", franja: TARDE });
  // El puente del 7/12 y el 8/12, seguidos.
  assert.deepEqual(validarEntrega("2026-12-07", MANANA, HOY, FERIADOS).proxima, { fecha: "2026-12-09", franja: MANANA });
});

test("§6: los sábados sólo de 8 a 12", () => {
  assert.equal(validarEntrega("2026-11-14", MANANA, HOY, FERIADOS).ok, true);
  assert.equal(validarEntrega("2026-11-14", { tipo: "hora", desde: 11 }, HOY, FERIADOS).ok, true);
  const tarde = validarEntrega("2026-11-14", TARDE, HOY, FERIADOS);
  assert.equal(tarde.motivo, "sabado_tarde");
  assert.deepEqual(tarde.proxima, { fecha: LUNES, franja: TARDE });
  assert.equal(validarEntrega("2026-11-14", { tipo: "hora", desde: 11.5 }, HOY, FERIADOS).motivo, "sabado_tarde");
  // Sábado 21 a la tarde: el domingo no, el lunes 23 es feriado, va el martes 24.
  assert.deepEqual(validarEntrega("2026-11-21", TARDE, "2026-11-20", FERIADOS).proxima, { fecha: "2026-11-24", franja: TARDE });
});

test("§6: una hora fuera de las franjas ofrece la más cercana", () => {
  const almuerzo = validarEntrega(LUNES, { tipo: "hora", desde: 12 }, HOY, FERIADOS);
  assert.equal(almuerzo.motivo, "fuera_de_franja");
  assert.deepEqual(almuerzo.proxima, { fecha: LUNES, franja: { tipo: "hora", desde: 11 } });
  assert.deepEqual(validarEntrega(LUNES, { tipo: "hora", desde: 16 }, HOY, FERIADOS).proxima?.franja, { tipo: "hora", desde: 15 });
  assert.deepEqual(validarEntrega(LUNES, { tipo: "hora", desde: 7 }, HOY, FERIADOS).proxima?.franja, { tipo: "hora", desde: 8 });
  assert.equal(textoFranja({ tipo: "hora", desde: 9.5 }), "de 9:30 a 10:30");
});

test("§6: la fecha que no se puede queda para confirmar, con la próxima", () => {
  const r = cotizar({ alturaTrabajo: 5, fecha: "2026-11-15" });
  assert.ok(r.facil);
  assert.equal(r.listo, false);
  assert.deepEqual(r.aConfirmar.map((c) => c.codigo), ["fecha"]);
  assert.match(r.aConfirmar[0].texto, /domingo.*La próxima posible: el lunes 16 de noviembre, de 8 a 12\./);
  assert.ok(faltan(cotizar({ alturaTrabajo: 5, franja: null })).includes("franja"));
});

// ── Lo que ve Tomás ────────────────────────────────────────────────────────────────────

test("resumenParaTomas: el armado sin ningún monto ni porcentaje", () => {
  const r = cotizar({ alturaTrabajo: 5, franja: { tipo: "hora", desde: 10 } });
  const t = resumenParaTomas(r);
  sinPlata(t);
  assert.match(t, /1 torre de 2 módulos estándar \(1,30\) de 2,50, con la baranda arriba, piso completo de 4 tablones y ruedas con freno/);
  assert.match(t, /trabaja cómodo hasta ~5,75 m/);
  assert.match(t, /baranda va siempre incluida/);
  assert.match(t, /otra torre igual o un módulo más de alto/);
  assert.match(t, /recargo por los costos operativos/);
  assert.ok(!/20|100|500|140|18/.test(t.replace(/\d+,\d+/g, "")), t);
});

test("resumenParaTomas: limpio en todos los casos, aunque el cliente escriba plata", () => {
  const casos: ResultadoAlquiler[] = [
    cotizar({ alturaTrabajo: 5 }),
    cotizar({ alturaTrabajo: 3, largoACubrir: 6, piso: "desparejo" }),
    cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 3 }),
    cotizar({ alturaTrabajo: 5, piezas: { modulosPorTorre: 1, tablonesPorTorre: 1, conBaranda: false } }),
    cotizar({ alturaTrabajo: 9, montaje: true, piezasFueraDeCatalogo: ["puntales"] }),
    cotizar({ alturaTrabajo: 3, fecha: "2026-11-14", franja: TARDE }),
    cotizar({ alturaTrabajo: 3 }, { cliente: { ...CLIENTE, mensajesCliente: ["otro me cobra $ 100.000, ¿me lo dejás en 80 lucas?"] } }),
    cotizar({ alturaTrabajo: 3 }, { flete: { tipo: "fuera_de_lista", barrio: "Pilar" } }),
    cotizarAlquilerSimple(pedidoVacio(), ctx({ flete: null })),
  ];
  for (const r of casos) sinPlata(resumenParaTomas(r));
  // Lo que escribió el cliente («$ 100.000») va en la tarjeta, no en el resumen.
  assert.equal(casos[6].enContra[0].codigo, "palabras");
  assert.match(resumenParaTomas(casos[6]), /escribió algo que tiene que ver una persona/);
});

test("resumenParaTomas: el peldaño, como alternativa, y sin ofrecer escaleras", () => {
  const t = resumenParaTomas(cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 3 }));
  assert.match(t, /como alternativa en el peldaño de 0,80 m de la escalera del bastidor, a 0,95 m del piso/);
  assert.match(t, /un solo tablón de 30 cm/);
  assert.match(t, /Preguntale si le sirve esa plataforma y anotá lo que conteste \(acepta_plataforma\)/);
  sinPlata(t);
  const segundo = resumenParaTomas(cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 5 }));
  assert.match(segundo, /peldaño de 0,80 m del segundo módulo de la escalera del bastidor, a 2,75 m del piso/);
  assert.match(segundo, /El techo está a 5 m: no llega cómodo a trabajar en el techo, aclaráselo/);
  sinPlata(segundo);
  const no = resumenParaTomas(cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 2.4 }));
  assert.match(no, /No ofrezcas escaleras/);
});

// ── Los textos para el cliente ─────────────────────────────────────────────────────────

test("condicionesAlquilerSimple: las de la §6, sin plata ni markdown", () => {
  const c = condicionesAlquilerSimple();
  sinPlata(c);
  for (const frase of [
    /nunca en el mismo día/, /de lunes a viernes de 8 a 12 o de 13 a 16/, /sábados de 8 a 12/, /Domingos y feriados no/,
    /recorrido de las camionetas/, /franja de una hora, con un recargo por los costos operativos/,
    /los choferes no pueden entrar a los domicilios/, /seguro que cubra roturas o daños/, /gente para bajar/, /desarmado/, /gente para subirlo/,
    /este mismo WhatsApp con 24 horas de anticipación/, /el alquiler sigue corriendo y se cobra por día/,
  ]) assert.match(c, frase);
  assert.ok(!/[*_#`]|^- /m.test(c));
});

test("mensajePresupuestoAlquiler: Palermo, un solo total por 30 días y el cierre", () => {
  const r = cotizar({ alturaTrabajo: 5 });
  const m = mensajePresupuestoAlquiler(r, LUNES, MANANA);
  assert.match(m, /El servicio completo por 30 días, con la entrega y el retiro, sale \$ 500\.000 \+ IVA\./);
  assert.match(m, /Es el mínimo del servicio: con ese mismo precio te entra otra torre igual o un módulo más de alto/);
  assert.match(m, /cada día de más es \$ 16\.667 \+ IVA/);
  assert.ok(m.includes(condicionesAlquilerSimple()));
  assert.ok(m.endsWith("¿Te lo reservo para el lunes 16 de noviembre, de 8 a 12?"));
  // Sin desglose de piezas ni precios por pieza.
  assert.ok(!/18\.000|36\.000|140\.400|197\.600|Tablón|Flete|MÍNIMO OPERATIVO/i.test(m.replace("Es el mínimo del servicio", "")));
  // Cada monto, «+ IVA».
  for (const monto of m.match(/\$ [\d.]+/g) ?? []) assert.ok(m.includes(`${monto} + IVA`), monto);
  assert.ok(!/[*_#`]/.test(m));
});

test("mensajePresupuestoAlquiler: con la franja de una hora, el recargo del 20 % y el total", () => {
  const franja: Franja = { tipo: "hora", desde: 10 };
  const m = mensajePresupuestoAlquiler(cotizar({ alturaTrabajo: 5, franja }), LUNES, franja);
  assert.match(m, /sale \$ 500\.000 \+ IVA\./);
  assert.match(m, /se suma un recargo del 20 % por los costos operativos de la franja de una hora \(\$ 100\.000 \+ IVA\)\. En total, \$ 600\.000 \+ IVA\./);
  assert.ok(m.endsWith("¿Te lo reservo para el lunes 16 de noviembre, de 10 a 11?"));
});

test("mensajePresupuestoAlquiler: sin mínimo, el peldaño y sin baranda", () => {
  const grande = mensajePresupuestoAlquiler(cotizar({ alturaTrabajo: 7, torres: 3 }), LUNES, TARDE);
  assert.ok(!/mínimo del servicio/.test(grande));
  assert.match(grande, /3 torres de 3 módulos/);
  const peldano = mensajePresupuestoAlquiler(cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 3, aceptaPlataforma: true }), LUNES, MANANA);
  assert.match(peldano, /La plataforma va en un peldaño de la escalera, a 0,95 m: es de un solo tablón, de 30 cm/);
  // En el techo y sin llegar cómodo, se lo dice.
  const lejos = mensajePresupuestoAlquiler(cotizar({ lugar: "adentro", trabajoEnTecho: true, alturaTecho: 6, aceptaPlataforma: true }), LUNES, MANANA);
  assert.match(lejos, /La plataforma queda a 3,75 m y llegás a trabajar cómodo hasta unos 5,75 m\. El techo está a 6 m, así que al techo no llegás cómodo\./);
  const sinBaranda = mensajePresupuestoAlquiler(cotizar({ alturaTrabajo: 3, piezas: { modulosPorTorre: 1, conBaranda: false } }), LUNES, MANANA);
  assert.match(sinBaranda, /La baranda va siempre incluida en el precio; como no la querés, no la llevamos\./);
});

test("mensajePresupuestoAlquiler: sin precio, o con otra franja que la cotizada, tira", () => {
  assert.throws(() => mensajePresupuestoAlquiler(cotizar({ alturaTrabajo: 5 }, { flete: null }), LUNES, MANANA), /no tiene precio/);
  assert.throws(() => mensajePresupuestoAlquiler(cotizar({ alturaTrabajo: 5 }), LUNES, { tipo: "hora", desde: 10 }), /no coincide/);
  assert.throws(() => mensajePresupuestoAlquiler(cotizar({ alturaTrabajo: 5, franja: { tipo: "hora", desde: 10 } }), LUNES, MANANA), /no coincide/);
});

// ── Provincia y el retiro en el depósito (JS, 12/11, filas 16 y 17) ─────────────────────

const PROVINCIA = { tipo: "provincia" as const, lugar: "Olivos" };
const DEP_MANANA: Franja = { tipo: "deposito_manana" };

test("fila 16: en provincia no hay flete: se le ofrece el depósito", () => {
  const r = cotizar({ alturaTrabajo: 5 }, { flete: PROVINCIA });
  assert.ok(r.facil);
  assert.equal(r.listo, false);
  assert.equal(r.precio, null);
  assert.equal(r.modalidad, "envio");
  assert.deepEqual(r.aConfirmar.map((c) => c.codigo), ["deposito"]);
  assert.match(r.aConfirmar[0].texto, /La obra está en Olivos \(provincia\): no entregamos ni retiramos fuera de CABA\. Ofrecele retirarlo en nuestro depósito, en Maturín 2570 \(CABA\)/);
  sinPlata(resumenParaTomas(r));
  // Si no puede retirarlo: no es un alquiler simple.
  const no = cotizar({ alturaTrabajo: 5, retiraEnDeposito: false }, { flete: PROVINCIA });
  assert.deepEqual(enContra(no), ["fuera_de_caba"]);
  assert.match(resumenParaTomas(no), /la obra está en provincia \(no entregamos ni retiramos fuera de CABA\) y no puede retirarlo en el depósito/);
  // Si lo retira: sale, sin flete.
  const si = cotizar({ alturaTrabajo: 5, retiraEnDeposito: true }, { flete: PROVINCIA });
  assert.equal(si.listo, true);
  assert.equal(si.modalidad, "deposito");
});

test("fila 17: el retiro en el depósito, sin flete pero con el mínimo (todo material + mínimo)", () => {
  // El ejemplo de Palermo, retirando en el depósito: 162.000 de material + 338.000 de mínimo.
  const r = cotizar({ alturaTrabajo: 5, retiraEnDeposito: true });
  const pr = r.precio;
  assert.ok(pr);
  assert.equal(r.modalidad, "deposito");
  assert.equal(pr.material, 162000);
  assert.equal(pr.flete, 0);
  assert.equal(pr.minimoOperativo, 338000);
  assert.equal(pr.base, 500000);
  assert.equal(pr.total, 500000);
  assert.ok(!pr.lineas.some((l) => l.codigo === "flete"));
  assert.deepEqual(pr.lineas.at(-1), { codigo: "minimo_operativo", descripcion: "Mínimo operativo", cantidad: 1, precioUnitario: 338000, importe: 338000 });
  assert.ok(r.motivos.some((m) => m.codigo === "deposito" && m.ok));
  // Un cliente de CABA también lo puede elegir: el flete del barrio no cuenta.
  assert.deepEqual(cotizar({ alturaTrabajo: 5, retiraEnDeposito: true }, { flete: PALERMO }).precio?.lineas, pr.lineas);
  // Sin dirección: no hace falta.
  const sinDir = cotizar({ alturaTrabajo: 5, retiraEnDeposito: true }, { flete: null });
  assert.ok(!faltan(sinDir).includes("direccion"));
  assert.equal(sinDir.listo, true);
  // Con más material, sin mínimo: 3 torres de 3 módulos.
  const grande = cotizar({ alturaTrabajo: 7, torres: 3, retiraEnDeposito: true });
  assert.equal(grande.precio?.minimoOperativo, 0);
  assert.equal(grande.precio?.base, grande.precio?.material);
});

test("fila 17: las franjas del depósito (de 10 a 12 y de 13 a 16, de lunes a viernes) y sin recargo", () => {
  assert.deepEqual(franjaSegunModalidad(MANANA, true), DEP_MANANA);
  assert.deepEqual(franjaSegunModalidad(TARDE, true), { tipo: "deposito_tarde" });
  assert.equal(franjaSegunModalidad({ tipo: "hora", desde: 10 }, true), null);
  assert.deepEqual(franjaSegunModalidad(DEP_MANANA, false), MANANA);
  assert.equal(textoFranja(DEP_MANANA), "de 10 a 12");
  assert.equal(textoFranja({ tipo: "deposito_tarde" }), "de 13 a 16");
  // El motor pasa la franja a la del depósito.
  const r = cotizar({ alturaTrabajo: 5, retiraEnDeposito: true, franja: MANANA });
  assert.deepEqual(r.franja, DEP_MANANA);
  assert.equal(r.entrega?.texto, "Retira en el depósito el lunes 16 de noviembre, de 10 a 12");
  // Una franja de una hora no existe en el depósito: se pregunta de nuevo, con las del depósito, y no hay recargo.
  const hora = cotizar({ alturaTrabajo: 5, retiraEnDeposito: true, franja: { tipo: "hora", desde: 10 } });
  assert.equal(hora.franja, null);
  assert.deepEqual(hora.faltan.map((f) => f.pregunta), ["¿Pasás de 10 a 12 o de 13 a 16?"]);
  assert.equal(hora.precio?.recargoFranja, 0);
  // Las mismas validaciones de fecha: nunca hoy, ni domingos ni feriados, y en el depósito tampoco los sábados.
  assert.equal(validarEntrega(HOY, DEP_MANANA, HOY, FERIADOS).motivo, "hoy");
  const sab = validarEntrega("2026-11-14", DEP_MANANA, HOY, FERIADOS);
  assert.equal(sab.motivo, "sabado_deposito");
  assert.deepEqual(sab.proxima, { fecha: LUNES, franja: DEP_MANANA });
  assert.equal(validarEntrega("2026-11-23", DEP_MANANA, HOY, FERIADOS).motivo, "feriado");
  assert.equal(validarEntrega("2026-11-14", null, HOY, FERIADOS, { deposito: true }).motivo, "sabado_deposito");
  assert.ok(validarEntrega("2026-11-13", { tipo: "deposito_tarde" }, HOY, FERIADOS).ok);
  // Para hoy, en el depósito: a un vendedor, con su texto.
  const hoy = cotizar({ alturaTrabajo: 5, retiraEnDeposito: true, fecha: HOY });
  assert.deepEqual(enContra(hoy), ["para_hoy"]);
  assert.match(hoy.enContra[0].texto, /el retiro en el depósito es desde el día siguiente/);
  // Lo que falta, con las preguntas del depósito.
  const falta = cotizar({ alturaTrabajo: 5, retiraEnDeposito: true, fecha: null, franja: null }, { flete: null });
  assert.deepEqual(falta.faltan.map((f) => f.pregunta), ["¿Qué día querés pasar a retirarlo por el depósito?", "¿Pasás de 10 a 12 o de 13 a 16?"]);
});

test("fila 17: las condiciones del depósito, sin chofer ni camión, sin plata ni markdown", () => {
  const c = condicionesAlquilerSimple("deposito");
  sinPlata(c);
  for (const frase of [
    /depósito, en Maturín 2570 \(CABA\)/, /de lunes a viernes de 10 a 12 o de 13 a 16 \(de 12 a 13 el depósito está cerrado\)/,
    /Sábados, domingos y feriados no/, /24 horas de anticipación, nunca en el mismo día/,
    /No hay chofer ni camión: tenés que venir con tu vehículo y con gente para cargarlo/,
    /traelo desarmado al depósito/, /este mismo WhatsApp con 24 horas de anticipación/, /el alquiler sigue corriendo y se cobra por día/,
  ]) assert.match(c, frase);
  assert.ok(!/franja de una hora|recargo|camionetas|choferes no pueden/.test(c));
  assert.ok(!/[*_#`]|^- /m.test(c));
  assert.equal(DEPOSITO.direccion, "Maturín 2570");
  // Y las del envío dicen que es sólo en Capital.
  assert.match(condicionesAlquilerSimple(), /Entregamos y retiramos sólo en Capital/);
});

test("fila 17: el presupuesto del depósito: el total sin flete, sus condiciones y el cierre", () => {
  const r = cotizar({ alturaTrabajo: 5, retiraEnDeposito: true });
  const m = mensajePresupuestoAlquiler(r, LUNES, DEP_MANANA);
  assert.match(m, /El servicio completo por 30 días, retirándolo vos en nuestro depósito de Maturín 2570, sale \$ 500\.000 \+ IVA\./);
  assert.match(m, /Es el mínimo del servicio/);
  assert.ok(m.includes(condicionesAlquilerSimple("deposito")));
  assert.ok(!m.includes(condicionesAlquilerSimple("envio")));
  assert.ok(!/entrega y el retiro|camión/.test(m.replace("No hay chofer ni camión", "")));
  assert.ok(m.endsWith("¿Te lo reservo para retirarlo el lunes 16 de noviembre, de 10 a 12?"));
  // La franja tiene que ser de la misma modalidad.
  assert.throws(() => mensajePresupuestoAlquiler(r, LUNES, MANANA), /modalidad/);
  assert.throws(() => mensajePresupuestoAlquiler(cotizar({ alturaTrabajo: 5 }), LUNES, DEP_MANANA), /modalidad/);
  // Lo que ve Tomás: el depósito, sin plata.
  const t = resumenParaTomas(r);
  assert.match(t, /Lo retira y lo devuelve él en el depósito \(Maturín 2570 \(CABA\)\): sin flete, con su vehículo y gente para cargar/);
  sinPlata(t);
});

test("fila 20: el pagaré no aparece en nada que lee el cliente", () => {
  const textos = [
    condicionesAlquilerSimple(), condicionesAlquilerSimple("deposito"),
    mensajePresupuestoAlquiler(cotizar({ alturaTrabajo: 5 }), LUNES, MANANA),
    mensajePresupuestoAlquiler(cotizar({ alturaTrabajo: 5, retiraEnDeposito: true }), LUNES, DEP_MANANA),
    resumenParaTomas(cotizar({ alturaTrabajo: 5 })),
  ];
  for (const t of textos) assert.ok(!/pagar[eé]/i.test(t), t);
});

test("formatos: metros y pesos", () => {
  assert.equal(metros(3.95), "3,95");
  assert.equal(metros(0.8), "0,80");
  assert.equal(metros(3), "3");
  assert.equal(metros(0.15 + 1.8 * 2), "3,75");
  assert.equal(pesos(500000), "$ 500.000");
  assert.equal(pesos(1736000), "$ 1.736.000");
  assert.equal(pesos(16666.67), "$ 16.667");
});
