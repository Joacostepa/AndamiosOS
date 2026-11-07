// El cotizador rápido sobre el borrador del asistente: ida y vuelta, y que no pise lo del chat.
// Los casos son los del uso real (docs/asistente-comercial/cotizador-rapido.md), con datos
// inventados.

import { test } from "node:test";
import assert from "node:assert/strict";
import { TARIFAS_AGO26 as T } from "../cotizador/prueba-tarifas.ts";
import { borradorVacio, recalcular, type DatosBorrador } from "../asistente/borrador.ts";
import { aplicarFormulario, categoriaParaPrecio, formularioDesdeBorrador, idFila, type Formulario } from "./formulario.ts";

const ctx = { tarifas: T };
const calc = (d: DatosBorrador) => recalcular(d, { tarifas: T, lista: null, hoy: "2026-11-07" });
const base = (d: DatosBorrador = borradorVacio()) => formularioDesdeBorrador(d);
const loteCaba = (direccion: string, frente: number) => ({
  fuente: "catastro" as const, direccionConsultada: direccion, smp: "001-014-022", direccionOficial: direccion, frenteCatastro: frente,
  caras: [frente], tramosCortos: [], esquina: false, calles: [], fondo: null, superficie: null, pisos: null, nota: null, consultado: "2026-11-07T12:00:00Z",
});

function bandejaFlorida(): { d: DatosBorrador; f: Formulario } {
  const d0 = borradorVacio();
  d0.obra.lote = loteCaba("Florida 371", 25.62);
  d0.conflictoCanal = { revisado: true, resultado: "Sin antecedentes en el último año." };
  const f = base(d0);
  f.tipo = "bandeja";
  f.cliente = { partnerId: null, razonSocial: "Martín Ferreyra", contacto: "Martín Ferreyra", celular: "11 5555-0123", email: "mferreyra@ejemplo.com", cuit: "20-28456789-8", domicilio: "", domicilioObra: true };
  f.obra = { direccion: "Florida 371", enCaba: true, esquina: null };
  f.bandeja = { ...f.bandeja, metros: 25.62, altura: 3 };
  f.jornadas = { armado: 1, desarme: 1 };
  f.render = { eleccion: "ninguno", renderId: null, path: null };
  return { d: aplicarFormulario(d0, f, ctx), f };
}

test("bandeja del alta pegada: los números del caso real y nada falta", () => {
  const { d } = bandejaFlorida();
  const r = calc(d);
  assert.equal(r.totales.subtotal, 3_586_800);
  assert.equal(r.totales.renovacion?.monto, 1_255_380);
  assert.deepEqual(r.faltantes.map((x) => x.codigo), []);
  // Los 4 opcionales estándar van en el PDF y no en la base.
  const opcionales = r.lineas.filter((l) => l.seccion === "opcional").map((l) => l.id).sort();
  assert.deepEqual(opcionales, ["bandeja:concertina", "gestoria", "ingenieria", "syh"]);
  assert.equal(d.cliente.domicilio, "Florida 371");
  assert.equal(d.cliente.esNuevo, true);
  assert.match(d.seccion1 ?? "", /25,62 m\.l\.\*\* \(todo el frente\)/);
});

test("la pantalla lee lo que guardó y vuelve igual", () => {
  const { d, f } = bandejaFlorida();
  const leido = formularioDesdeBorrador(d);
  assert.equal(leido.tipo, "bandeja");
  assert.equal(leido.bandeja.metros, 25.62);
  assert.equal(leido.cliente.domicilioObra, true);
  assert.equal(leido.syh, "opcional");
  const otraVez = aplicarFormulario(d, leido, ctx);
  assert.deepEqual(calc(otraVez).totales, calc(d).totales);
  assert.equal(f.bandeja.concertina, "opcional");
});

test("sacar el técnico y pasar la gestoría a la base", () => {
  const { d } = bandejaFlorida();
  const f = formularioDesdeBorrador(d);
  f.syh = "no";
  f.bandeja.gestoria = "base";
  const d2 = aplicarFormulario(d, f, ctx);
  const r = calc(d2);
  assert.ok(d2.opcionalesDescartados.includes("syh"));
  assert.ok(!r.lineas.some((l) => l.id === "syh"));
  assert.equal(r.totales.subtotal, 3_586_800 + 350_000);
  assert.equal(d2.trabajo.llevaPermiso, "si");
});

test("no pisa lo que agregó el chat: un flete y un SyH con otras jornadas", () => {
  const { d } = bandejaFlorida();
  d.calculos.complementarios = [{ tipo: "flete", seccion: "base", zona: "caba" }, { tipo: "syh", seccion: "base", jornadas: 4 }];
  const f = formularioDesdeBorrador(d);
  assert.equal(f.syh, "base");
  f.bandeja.metros = 20;
  const d2 = aplicarFormulario(d, f, ctx);
  assert.deepEqual(d2.calculos.complementarios, d.calculos.complementarios);
});

test("fachada en esquina con el $/m² que dictó el vendedor", () => {
  const d0 = borradorVacio();
  const f = base(d0);
  f.tipo = "fachada";
  f.obra = { direccion: "Chiriguanos 4587", enCaba: true, esquina: "las dos caras" };
  f.fachada = { ...f.fachada, frentes: [15.17, 2.81], altura: 9, precioM2: 45_000, categoria: categoriaParaPrecio(45_000, T), escalonado: "sin_preguntar" };
  f.jornadas = { armado: 2, desarme: 2 };
  const d = aplicarFormulario(d0, f, ctx);
  const r = calc(d);
  assert.equal(f.fachada.categoria, "estandar");
  // 17,98 m × 9 m = 161,82 m² × 45.000 + memoria obligatoria (más de 6 m).
  assert.equal(r.totales.subtotal, 7_281_900 + 1_250_000);
  assert.equal(r.lineas.find((l) => l.id === "ingenieria")?.seccion, "base");
  assert.equal(d.decisiones.esquina, "las dos caras");
  assert.match(d.seccion1 ?? "", /2 caras/);
});

test("desglosado con los montos del vendedor y un renglón sin monto", () => {
  const d0 = borradorVacio();
  const f = base(d0);
  f.tipo = "desglosado";
  f.desglose = {
    trabajo: "plataforma multidireccional en hueco de escalera",
    filas: [
      { id: idFila("1"), concepto: "Mano de obra de armado y desarme", cantidad: 1, precio: 3_855_000, porPeriodo: false, seccion: "base", producto: "estructura_tubular" },
      { id: idFila("2"), concepto: "Alquiler x 10 días corridos o fracción menor", cantidad: 1, precio: 2_986_000, porPeriodo: true, seccion: "base", producto: "estructura_tubular" },
      { id: idFila("3"), concepto: "Memoria de cálculo", cantidad: 1, precio: 1_335_000, porPeriodo: false, seccion: "base", producto: "ingenieria" },
      { id: idFila("4"), concepto: "Traslado de envío", cantidad: 1, precio: 450_000, porPeriodo: false, seccion: "base", producto: "traslado" },
      { id: idFila("5"), concepto: "Traslado de retiro", cantidad: 1, precio: 450_000, porPeriodo: false, seccion: "base", producto: "traslado" },
      { id: idFila("6"), concepto: "Técnico de SyH durante armado y desarme", cantidad: 1, precio: 500_000, porPeriodo: false, seccion: "base", producto: "seguridad_higiene" },
      { id: idFila("7"), concepto: "Acarreo", cantidad: 1, precio: null, porPeriodo: false, seccion: "base", producto: "traslado" },
    ],
  };
  const d = aplicarFormulario(d0, f, ctx);
  const r = calc(d);
  assert.equal(d.modelo, "D");
  assert.equal(d.lineasManuales.length, 6);
  assert.equal(r.totales.subtotal, 9_576_000);
  assert.equal(d.cotizador?.filasSinMonto.length, 1);
  const leido = formularioDesdeBorrador(d);
  assert.equal(leido.desglose.filas.length, 7);
  assert.equal(leido.desglose.filas.at(-1)?.precio, null);
  assert.match(d.seccion1 ?? "", /10 días corridos/);
});

test("cambiar de bandeja a fachada saca la bandeja", () => {
  const { d } = bandejaFlorida();
  const f = formularioDesdeBorrador(d);
  f.tipo = "fachada";
  f.fachada.frentes = [25.62];
  f.fachada.altura = 6;
  const d2 = aplicarFormulario(d, f, ctx);
  assert.equal(d2.calculos.bandeja, undefined);
  assert.equal(d2.calculos.fachada?.altura, 6);
});

test("textos a mano no se pisan", () => {
  const { d } = bandejaFlorida();
  const f = formularioDesdeBorrador(d);
  f.textos = { aMano: true, referencia: "Pantalla especial", seccion1: "Texto mío", seccion2: [{ titulo: "Alcance", contenido: "* Lo que dije" }] };
  f.bandeja.metros = 30;
  const d2 = aplicarFormulario(d, f, ctx);
  assert.equal(d2.seccion1, "Texto mío");
  assert.equal(d2.referencia, "Pantalla especial");
});
