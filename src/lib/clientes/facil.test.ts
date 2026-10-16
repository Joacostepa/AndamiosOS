// La bandeja fácil (crm-propuesta.md §4 y §12) con los escenarios de la propuesta y de la
// maqueta (docs/sofia/crm-maqueta.html): Marcela en Los Aromos 1234, la esquina, el 14 → 11,
// el regateo, la tabla floja y el alquiler simple del viernes a la noche.

import { test } from "node:test";
import assert from "node:assert/strict";
import { FILAS_AGO26, TARIFAS_AGO26 as T } from "../cotizador/prueba-tarifas.ts";
import { tarifasDesdeParametros } from "../cotizador/tarifas.ts";
import type { Lote } from "../catastro/caba.ts";
import { chequeoLote, recalcular } from "../asistente/borrador.ts";
import {
  armarBorradorFacil, escanearPalabras, esFacil, fichaVacia, palabraGamaAlta, parametrosFacilDesdeFilas, PALABRAS_GAMA_ALTA,
  type ContextoFacil, type FichaCliente, type ParametrosFacil,
} from "./facil.ts";

const PARAMS: ParametrosFacil = { maxMl: 25, jornadas: 1, renderId: "render-bandeja-generico", empresasConPersona: false };
const HOY = "2026-10-15";

function lote(direccion: string, cambios: Partial<Lote> = {}): Lote {
  return {
    fuente: "catastro", direccionConsultada: direccion, smp: "045-123-007", direccionOficial: direccion.toUpperCase(),
    frenteCatastro: 12.4, caras: [12.4], tramosCortos: [], esquina: false, calles: [], fondo: 30, superficie: 372, pisos: 2,
    nota: null, consultado: "2026-10-15T12:00:00Z", ...cambios,
  };
}

/** Escenario 1: Marcela Ríos, Los Aromos 1234, 12,40 m, todo el frente, sólo la bandeja. */
function marcela(cambios: Partial<FichaCliente> = {}): FichaCliente {
  const direccion = cambios.direccion ?? "Los Aromos 1234";
  return {
    ...fichaVacia(),
    nombre: "Marcela Ríos",
    telefono: "5491100001234",
    tipoCliente: "particular",
    trabajo: "bandeja",
    alturaBandeja: 3,
    necesitaAndamio: false,
    direccion,
    enCaba: true,
    lote: lote(direccion),
    cubreTodoElFrente: true,
    mensajesCliente: [
      "Hola, necesito una bandeja para la vereda, vamos a arreglar el frente de casa",
      "Los Aromos 1234, Capital",
      "Sí, todo",
      "Sólo la bandeja, el frente lo hacen desde adentro",
      "Marcela Ríos",
    ],
    ...cambios,
  };
}

const NUEVO: ContextoFacil = { parametros: PARAMS, clienteConHistorial: false, deudaVencida: false, direccionCotizada: false };
const enContra = (f: FichaCliente, c: ContextoFacil = NUEVO) => esFacil(f, c).enContra.map((m) => m.codigo);
const linea = (r: { lineas: { id: string }[] }, id: string) => r.lineas.find((l) => l.id === id) as { importe: number; seccion: string; cantidad: number; precioUnitario: number; descripcion: string } | undefined;

// ── esFacil ─────────────────────────────────────────────────────────────────────────────

test("escenario 1: la bandeja de Marcela es fácil, con los tildes de la tarjeta", () => {
  const r = esFacil(marcela(), NUEVO);
  assert.equal(r.facil, true, r.enContra.map((m) => m.texto).join(" · "));
  assert.equal(r.trabajoFacil, true);
  assert.equal(r.metros, 12.4);
  const textos = r.motivos.map((m) => m.texto);
  for (const t of ["Bandeja de 3 m sola", "CABA", "Sin esquina", "Cubre todo el frente", "12,4 m.l. ≤ 25", "Cliente nuevo", "Sin conflicto de canal", "Sin deuda vencida", "Sin palabras de alerta"]) {
    assert.ok(textos.includes(t), `falta «${t}» en ${textos.join(" · ")}`);
  }
  assert.ok(textos.some((t) => /^Frente verificado: 12,4 m/.test(t)));
});

test("escenario 10: la esquina no es fácil, aunque la IA no marque nada", () => {
  const f = marcela({ direccion: "Ficticia 1500", lote: lote("Ficticia 1500", { esquina: true, caras: [8.2, 15.6], calles: ["FICTICIA", "ESQUINA FALSA"] }) });
  const r = esFacil(f, NUEVO);
  assert.equal(r.facil, false);
  assert.equal(r.trabajoFacil, false);
  assert.deepEqual(r.enContra.map((m) => m.codigo), ["esquina"]);
  assert.equal(r.enContra[0].texto, "Esquina (FICTICIA y ESQUINA FALSA)");
  // Y si el cliente lo dice, también (el escaneo no depende del catastro).
  assert.ok(enContra(marcela({ mensajesCliente: ["Necesito bandeja en Ficticia y Esquina Falsa, CABA."] })).includes("palabras"));
});

test("escenario 2: la fachada de 8 pisos en Vicente López no es fácil", () => {
  const f = marcela({
    trabajo: "fachada", necesitaAndamio: true, enCaba: false, lote: null, direccion: "Av. Ficticia 2500",
    mensajesCliente: ["Buenas tardes, necesito cotizar andamio para la fachada de un edificio de 8 pisos en Av. Ficticia 2500, Vicente López."],
  });
  const c: string[] = enContra(f);
  for (const codigo of ["trabajo", "palabras", "caba", "frente"]) assert.ok(c.includes(codigo), `${codigo} en ${c}`);
});

test("escenario 3a: el regateo («está caro, otro me cobra $100.000») no es fácil", () => {
  const f = marcela({ mensajesCliente: [...marcela().mensajesCliente, "Está caro, otro me cobra $100.000 el metro. ¿Me hacés precio?"] });
  const r = esFacil(f, NUEVO);
  assert.equal(r.facil, false);
  assert.ok(r.enContra.some((m) => m.codigo === "palabras" && /descuento/.test(m.texto)));
});

test("escenario 3b: la tabla floja es seguridad y enojo", () => {
  const codigos = escanearPalabras("Hace 3 días que la bandeja tiene una tabla floja y nadie viene, es un peligro").map((a) => a.codigo);
  assert.ok(codigos.includes("seguridad"));
  assert.ok(codigos.includes("enojo"));
});

test("escenario 4: el alquiler simple para el jueves no es bandeja fácil", () => {
  const msg = "Hola, necesito 3 cuerpos de andamio con ruedas y 4 tablones para el jueves, en Villa Crespo";
  const codigos = escanearPalabras(msg).map((a) => a.codigo);
  assert.ok(codigos.includes("otro_trabajo"));
  assert.ok(codigos.includes("fecha"));
  assert.equal(esFacil(marcela({ trabajo: "alquiler_simple", mensajesCliente: [msg] }), NUEVO).trabajoFacil, false);
});

test("F4: hasta 25 m.l. es fácil; 25,5 no. Un solo parámetro manda", () => {
  const conFrente = (frente: number) => marcela({ lote: lote("Los Aromos 1234", { caras: [frente], frenteCatastro: frente }) });
  assert.equal(esFacil(conFrente(25), NUEVO).facil, true);
  assert.deepEqual(enContra(conFrente(25.5)), ["tope_ml"]);
  // Con el tope en 30 (cuando se complete la racha), los 25,5 pasan.
  assert.equal(esFacil(conFrente(25.5), { ...NUEVO, parametros: { ...PARAMS, maxMl: 30 } }).facil, true);
});

test("F4: los metros del cliente no pueden diferir más del 5 % del catastro (14 contra 11)", () => {
  const catorce = (cliente: number) => marcela({ direccion: "Av. Ficticia 800", lote: lote("Av. Ficticia 800", { caras: [14], frenteCatastro: 14 }), metrosCliente: cliente });
  assert.deepEqual(enContra(catorce(11)), ["metros_cliente"]);
  assert.equal(esFacil(catorce(14.5), NUEVO).facil, true, "3,6 % de diferencia pasa");
});

test("F4: «sólo una parte» del frente, o sin contestar, no es fácil", () => {
  assert.deepEqual(enContra(marcela({ cubreTodoElFrente: false })), ["cubre_frente"]);
  assert.deepEqual(enContra(marcela({ cubreTodoElFrente: null })), ["cubre_frente"]);
  assert.ok(enContra(marcela({ mensajesCliente: ["la bandeja va sólo por un tramo"] })).includes("palabras"));
});

test("F1: otra altura, o sin la respuesta del andamio, no es fácil", () => {
  assert.deepEqual(enContra(marcela({ alturaBandeja: 6 })), ["trabajo"]);
  assert.deepEqual(enContra(marcela({ necesitaAndamio: null })), ["trabajo"]);
  assert.deepEqual(enContra(marcela({ necesitaAndamio: true })), ["trabajo"]);
});

test("F2 y F3: fuera de CABA, sin catastro, con el frente que dio una persona o con otra dirección, no", () => {
  assert.ok(enContra(marcela({ enCaba: false })).includes("caba"));
  assert.ok(enContra(marcela({ enCaba: null })).includes("caba"));
  assert.deepEqual(enContra(marcela({ lote: null })), ["frente"]);
  assert.deepEqual(enContra(marcela({ lote: lote("Los Aromos 1234", { fuente: "vendedor" }) })), ["frente"]);
  assert.deepEqual(enContra(marcela({ lote: lote("Los Aromos 1300") })), ["frente"], "el lote es de otra dirección");
  assert.deepEqual(enContra(marcela({ lote: lote("Los Aromos 1234", { caras: [], frenteCatastro: null }) })), ["frente"]);
});

test("F5 a F7: ya es cliente, dirección cotizada o deuda: no es fácil, pero el trabajo sí", () => {
  for (const [c, codigo] of [
    [{ clienteConHistorial: true }, "historial"],
    [{ direccionCotizada: true }, "conflicto_canal"],
    [{ deudaVencida: true }, "deuda"],
  ] as const) {
    const r = esFacil(marcela(), { ...NUEVO, ...c });
    assert.equal(r.facil, false);
    assert.equal(r.trabajoFacil, true, "se arma igual para la pareja");
    assert.deepEqual(r.enContra.map((m) => m.codigo), [codigo]);
  }
  const historial = esFacil(marcela(), { ...NUEVO, clienteConHistorial: true });
  assert.match(historial.enContra[0].texto, /revisá el precio pactado/);
});

test("F5 a F7: si Odoo no contestó, cuenta como «no» (ante la duda, una persona)", () => {
  const r = esFacil(marcela(), { ...NUEVO, clienteConHistorial: null, deudaVencida: null, direccionCotizada: null });
  assert.equal(r.facil, false);
  assert.deepEqual(r.enContra.map((m) => m.codigo), ["historial", "conflicto_canal", "deuda"]);
});

test("F9: las banderas de la IA sólo bajan; sin banderas, la regla decide igual", () => {
  const conBandera = esFacil(marcela({ banderas: ["persona"] }), NUEVO);
  assert.equal(conBandera.facil, false);
  assert.equal(conBandera.enContra[0].texto, "La IA marcó: pide hablar con una persona");
  // La IA no tiene cómo subir: sin banderas, la esquina sigue siendo esquina.
  assert.equal(esFacil(marcela({ banderas: [], lote: lote("Los Aromos 1234", { esquina: true }) }), NUEVO).facil, false);
});

test("cuentas de los socios: nunca se les cotiza", () => {
  const r = esFacil(marcela(), { ...NUEVO, cuentaSocio: true });
  assert.equal(r.facil, false);
  assert.deepEqual(r.enContra.map((m) => m.codigo), ["cuenta_socio"]);
});

test("decisión 20 (empresas): apagada, una constructora con CUIT 30 es fácil; prendida, la manda una persona", () => {
  const delta = marcela({ tipoCliente: "empresa", cuit: "30-71234567-1", nombre: "Construcciones Delta SRL" });
  assert.equal(esFacil(delta, NUEVO).facil, true);
  const prendida = { ...NUEVO, parametros: { ...PARAMS, empresasConPersona: true } };
  const r = esFacil(delta, prendida);
  assert.equal(r.facil, false);
  assert.equal(r.trabajoFacil, true);
  assert.deepEqual(r.enContra.map((m) => m.codigo), ["empresa"]);
  // Sólo con el CUIT de sociedad, aunque haya dicho «particular».
  assert.equal(esFacil(marcela({ cuit: "33-12345678-9" }), prendida).facil, false);
  // Una persona física, no.
  assert.equal(esFacil(marcela({ cuit: "27-12345678-0" }), prendida).facil, true);
});

// ── Escaneo de palabras ─────────────────────────────────────────────────────────────────

test("escaneo: lo que tiene que marcar, con evasiones simples", () => {
  const casos: [string, string][] = [
    ["¿Me hacen un DESCUENTOOO?", "descuento"],
    ["me hacen un d e s c u e n t o?", "descuento"],
    ["me hacen un d3scu3nt0?", "descuento"],
    ["¿hay rebajááá?", "descuento"],
    ["si pago de contado me hacen un 10 x ciento menos?", "descuento"],
    ["me lo dejás en 120 lucas?", "descuento"],
    ["¿Me hacés precio?", "descuento"],
    ["está muy caro", "descuento"],
    ["¿Puedo pagar en cuotas?", "descuento"],
    ["Es en la ESQUINA de Corrientes", "esquina"],
    ["Corrientes esq. Callao", "esquina"],
    ["la necesito para el lunes", "fecha"],
    ["la necesito para MAÑANA", "fecha"],
    ["es urgenteee", "fecha"],
    ["para el 15", "fecha"],
    ["arrancamos el 20/11", "fecha"],
    ["lo necesitamos para principios de diciembre", "fecha"],
    ["se puede armar a la noche?", "nocturno"],
    ["también necesito andamio para pintar", "otro_trabajo"],
    ["son 4 pisos", "otro_trabajo"],
    ["quiero hablar con una persona", "persona"],
    ["pasame con Sandra", "persona"],
    ["llamame por favor", "persona"],
    ["esto es una vergüenza", "enojo"],
    ["nadie me contesta!!!", "enojo"],
    ["la bandeja se mueve con el viento", "seguridad"],
    ["se cayó una tabla y golpeó a un vecino", "seguridad"],
    ["sólo una parte del frente", "tramo"],
  ];
  for (const [texto, codigo] of casos) {
    const codigos = escanearPalabras(texto).map((a) => a.codigo);
    assert.ok(codigos.includes(codigo as never), `«${texto}» debería marcar ${codigo} (marcó: ${codigos.join(", ") || "nada"})`);
  }
});

test("escaneo: lo normal de un pedido de bandeja pasa", () => {
  const limpios = [
    ...marcela().mensajesCliente,
    "Hola, ¿me pasan presupuesto para una bandeja de 12 metros en Av. de Mayo 1234?",
    "Es en Av. 9 de Julio 1500",
    "¿Cuánto sale?",
    "Es para el consorcio, soy la administradora",
    "Me llamo Hugo",
    "Gracias!",
    "CUIT 20-12345678-6",
    "Riobamba 653, CABA",
  ];
  for (const texto of limpios) {
    const a = escanearPalabras(texto);
    assert.deepEqual(a, [], `«${texto}» no debería marcar nada: ${a.map((x) => `${x.codigo} («${x.palabra}»)`).join(", ")}`);
  }
});

// ── armarBorradorFacil ──────────────────────────────────────────────────────────────────

test("escenario 1: el borrador de Marcela da los números de la propuesta, + IVA, con los 4 opcionales", () => {
  const b = armarBorradorFacil(marcela(), T, { parametros: PARAMS, hoy: HOY, conflictoCanal: "Sin cotizaciones de esta dirección en 12 meses" });
  assert.deepEqual(b.problemas, []);
  assert.equal(b.metros, 12.4);
  const r = b.resultado;
  assert.equal(r.totales.subtotal, 1_736_000, "12,40 m.l. × $140.000");
  assert.equal(r.totales.iva, 364_560);
  assert.equal(r.totales.total, 2_100_560);
  assert.equal(r.totales.renovacion?.monto, 607_600, "35 % de renovación mensual");
  assert.equal(b.datos.condiciones.mostrarTotalConIva, true);
  // Los 4 opcionales estándar (decisión 7), con los montos del motor.
  assert.deepEqual(r.lineas.filter((l) => l.seccion === "opcional").map((l) => l.id).sort(), ["bandeja:concertina", "gestoria", "ingenieria", "syh"]);
  assert.equal(linea(r, "bandeja:concertina")?.importe, 173_600);
  assert.equal(linea(r, "gestoria")?.importe, 350_000);
  assert.equal(linea(r, "syh")?.importe, 500_000, "1 jornada de armado + 1 de desarme");
  assert.equal(linea(r, "ingenieria")?.importe, 1_250_000);
  // Compatible con el asistente: modelo A, contrato Obra, el lote, las jornadas, el render.
  assert.equal(b.datos.modelo, "A");
  assert.equal(b.datos.contrato, "Obra ");
  assert.deepEqual(b.datos.jornadas, { armado: 1, desarme: 1, personas: null });
  assert.deepEqual(b.datos.render, { eleccion: "biblioteca", renderId: "render-bandeja-generico", path: null });
  assert.equal(b.datos.cliente.esNuevo, true);
  assert.equal(b.datos.referencia, "Bandeja de protección 12,4 m.l.");
  assert.match(b.datos.seccion1 ?? "", /\*\*Los Aromos 1234\*\*/);
  // Los datos del alta (mail, domicilio) faltan, pero no frenan la cotización (§4).
  assert.ok(r.faltantes.some((f) => f.codigo === "cliente_nuevo"));
});

test("el precio sale de las tarifas, no del código: con otra tarifa, otro precio", () => {
  const otra = tarifasDesdeParametros(FILAS_AGO26.map((f) => (f.clave === "bandeja_3m_ml" ? { ...f, valor: 150_000 } : f)));
  const b = armarBorradorFacil(marcela(), otra, { parametros: PARAMS, hoy: HOY, conflictoCanal: null });
  assert.equal(b.resultado.totales.subtotal, 12.4 * 150_000);
  assert.deepEqual(b.problemas, []);
});

test("menos de 10 m.l. (Riobamba 653, 7,84 m) es fácil: se factura el mínimo y el texto dice la medida real", () => {
  const f = marcela({ direccion: "Riobamba 653", lote: lote("Riobamba 653", { caras: [7.84], frenteCatastro: 7.84 }) });
  assert.equal(esFacil(f, NUEVO).facil, true);
  const b = armarBorradorFacil(f, T, { parametros: PARAMS, hoy: HOY, conflictoCanal: null });
  assert.equal(b.resultado.totales.subtotal, 10 * 140_000);
  assert.match(linea(b.resultado, "bandeja")!.descripcion, /7,84 m\.l\. \(se factura el mínimo de 10 m\.l\.\)/);
  assert.match(b.datos.seccion1 ?? "", /se factura el mínimo de 10 m\.l\./);
});

test("escenario 9: Sandra corrige 14 → 11 m.l. y el motor recalcula", () => {
  const f = marcela({ direccion: "Av. Ficticia 800", nombre: "Consorcio Av. Ficticia 800", tipoCliente: "consorcio", lote: lote("Av. Ficticia 800", { caras: [14], frenteCatastro: 14 }) });
  const b = armarBorradorFacil(f, T, { parametros: PARAMS, hoy: HOY, conflictoCanal: null });
  assert.equal(b.resultado.totales.subtotal, 1_960_000);
  const corregido = { ...b.datos, calculos: { ...b.datos.calculos, bandeja: { ...b.datos.calculos.bandeja!, metros: 11 } } };
  const r = recalcular(corregido, { tarifas: T, lista: null, hoy: HOY });
  assert.equal(r.totales.subtotal, 1_540_000);
  assert.ok(chequeoLote(corregido).avisos.some((a) => a.codigo === "frente_menor"), "queda el aviso de que cubre sólo un tramo");
});

test("armar: sin frente verificado, sin render, sin conflicto revisado o pasado del tope, lo dice en problemas", () => {
  const sinLote = armarBorradorFacil(marcela({ lote: null }), T, { parametros: PARAMS, hoy: HOY, conflictoCanal: null });
  assert.ok(sinLote.problemas.some((p) => /frente verificado/.test(p)));
  assert.equal(sinLote.resultado.lineas.length, 0);

  const sinRender = armarBorradorFacil(marcela(), T, { parametros: { ...PARAMS, renderId: null }, hoy: HOY, conflictoCanal: null });
  assert.deepEqual(sinRender.problemas, ["Falta el render genérico de bandeja (agente_facil_render en Parámetros)."]);

  const sinConflicto = armarBorradorFacil(marcela(), T, { parametros: PARAMS, hoy: HOY });
  assert.ok(sinConflicto.problemas.some((p) => /otro vendedor ya cotizó/.test(p)));

  const largo = marcela({ lote: lote("Los Aromos 1234", { caras: [30], frenteCatastro: 30 }) });
  assert.ok(armarBorradorFacil(largo, T, { parametros: PARAMS, hoy: HOY, conflictoCanal: null }).problemas.some((p) => /pasa el tope/.test(p)));
});

test("armar: con 2 jornadas en el parámetro, el técnico de SyH sale por 4", () => {
  const b = armarBorradorFacil(marcela(), T, { parametros: { ...PARAMS, jornadas: 2 }, hoy: HOY, conflictoCanal: null });
  assert.equal(linea(b.resultado, "syh")?.cantidad, 4);
  assert.equal(b.resultado.totales.subtotal, 1_736_000, "las jornadas no mueven la base");
});

// ── Parámetros ──────────────────────────────────────────────────────────────────────────

test("parámetros: se leen de las filas y cortan si falta una clave", () => {
  const fila = (clave: string, valor: number | null, texto: string | null = null) => ({ clave, tipo: valor === null ? "texto" : "numero", valor, valor_min: null, valor_max: null, texto });
  const filas = [fila("agente_facil_max_ml", 25), fila("agente_facil_jornadas", 1), fila("agente_facil_render", null, ""), fila("agente_facil_empresas_con_persona", 0)];
  assert.deepEqual(parametrosFacilDesdeFilas(filas), { maxMl: 25, jornadas: 1, renderId: null, empresasConPersona: false });
  assert.throws(() => parametrosFacilDesdeFilas(filas.slice(1)), /agente_facil_max_ml/);
  assert.throws(() => parametrosFacilDesdeFilas(filas.filter((f) => f.clave !== "agente_facil_render")), /agente_facil_render/);
});

// ── Gama alta: pidió multidireccional (JS, 16/10) ───────────────────────────────────────

test("gama alta: el escaneo encuentra «multidireccional» con sus variantes", () => {
  for (const texto of [
    "Necesito andamios multidireccionales para una obra",
    "Cotizame un MULTIDIRECCIONAL",
    "busco multidirecional para 8 pisos",
    "¿Trabajan con multi direccional?",
    "un andamio multi-direccional",
    "Necesitamos sistema multidireccional",
    "multidireccionaaal",
  ]) {
    const a = escanearPalabras(texto).find((x) => x.codigo === "gama_alta");
    assert.ok(a, `«${texto}» debería marcar gama alta`);
    assert.equal(a.texto, "Pidió multidireccional: cliente de gama alta");
  }
  for (const texto of ["Necesito una bandeja para la vereda", "andamio para pintar la fachada", "es en la calle Dirección 123"]) {
    assert.ok(!escanearPalabras(texto).some((x) => x.codigo === "gama_alta"), `«${texto}» no es gama alta`);
  }
});

test("gama alta: la lista se amplía en PALABRAS_GAMA_ALTA y palabraGamaAlta la usa", () => {
  assert.ok(PALABRAS_GAMA_ALTA.includes("multidireccional"));
  assert.ok(palabraGamaAlta("Quiero multidireccional"));
  assert.equal(palabraGamaAlta("Quiero una bandeja"), null);
});

test("gama alta: esFacil da no fácil con el motivo, aunque el resto sea la bandeja de Marcela", () => {
  const r = esFacil(marcela({ mensajesCliente: [...marcela().mensajesCliente, "¿Tienen andamio multidireccional?"] }), NUEVO);
  assert.equal(r.facil, false);
  assert.equal(r.trabajoFacil, false);
  assert.ok(r.enContra.some((m) => m.codigo === "gama_alta" && m.texto === "Pidió multidireccional: cliente de gama alta"));
  // Marcada en la ficha (por el webhook) aunque no esté en los mensajes: tampoco es fácil.
  const marcada = esFacil(marcela({ segmento: "gama_alta" }), NUEVO);
  assert.equal(marcada.facil, false);
  assert.deepEqual(marcada.enContra.map((m) => m.codigo), ["gama_alta"]);
  assert.ok(!marcada.motivos.some((m) => m.codigo === "palabras" && m.ok), "no dice «Sin palabras de alerta»");
});

test("un nombre del equipo cuenta sólo si el cliente lo pide, no si es su propio nombre (JS, 16/10)", () => {
  const pide = (x: string) => escanearPalabras(x).some((a) => a.codigo === "persona");
  for (const x of ["Hacelo a nombre de Joaquín Fernández", "Soy Jorge, tengo una obra en Palermo", "Me llamo Sandra Gómez", "Gabriel Pérez, DNI 30.123.456", "a nombre de Rocío Martínez"]) {
    assert.equal(pide(x), false, x);
  }
  for (const x of ["Quiero hablar con Jorge", "pasame con Sandra por favor", "¿Está Gabriel?", "necesito a Rocío", "Joaquín me puede llamar?", "me comunico con Joaquín"]) {
    assert.equal(pide(x), true, x);
  }
});
