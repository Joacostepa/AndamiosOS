// Tests del motor de precios. Los casos salen del criterio v2 y de las propuestas reales.
// Correr: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { TARIFAS_AGO26 as T, FILAS_AGO26 } from "./prueba-tarifas.ts";
import { tarifasDesdeParametros } from "./tarifas.ts";
import { cotizarBandeja } from "./bandeja.ts";
import { cotizarFachada } from "./fachada.ts";
import { cotizarAlquiler } from "./alquiler.ts";
import { cotizarManoObra, valorJornadaPersona } from "./mano-obra.ts";
import { cotizarComplementario } from "./complementarios.ts";
import { cotizarVentaMaterial } from "./venta-material.ts";
import { calcularTotales } from "./totales.ts";
import { chequear } from "./chequeos.ts";
import { enLetras, pesosEnLetras } from "./letras.ts";
import { validarCuit } from "./cuit.ts";
import { nuevaLinea } from "./tipos.ts";

const bloqueos = (r: { avisos: { nivel: string; codigo: string }[] }) => r.avisos.filter((a) => a.nivel === "bloqueo").map((a) => a.codigo);

// ── Tarifas ────────────────────────────────────────────────────────────────────

test("tarifas: sin una clave corta y dice cuál falta", () => {
  assert.throws(() => tarifasDesdeParametros(FILAS_AGO26.filter((f) => f.clave !== "bandeja_3m_ml")), /bandeja_3m_ml/);
});

// ── Bandeja (modelo A) ─────────────────────────────────────────────────────────

test("bandeja 3 m, 10 m.l.: un renglón todo incluido y renovación 35 %", () => {
  const r = cotizarBandeja({ metros: 10, altura: 3, concertina: "opcional", gestoria: "opcional", enCaba: true }, T);
  const base = r.lineas.find((l) => l.id === "bandeja")!;
  assert.equal(base.cantidad, 10);
  assert.equal(base.precioUnitario, 140000);
  assert.equal(base.importe, 1_400_000);
  assert.equal(r.renovacionPct, 35);
  const concertina = r.lineas.find((l) => l.id === "bandeja:concertina")!;
  assert.equal(concertina.precioUnitario, 14000);
  assert.equal(concertina.seccion, "opcional");
  const gestoria = r.lineas.find((l) => l.id === "gestoria")!;
  assert.equal(gestoria.importe, 350_000);
  assert.equal(gestoria.unicaVez, true);
  const tot = calcularTotales(r.lineas, { ivaPct: T.ivaPct, renovacionPct: r.renovacionPct ?? null });
  assert.equal(tot.subtotal, 1_400_000);
  assert.equal(tot.renovacion?.monto, 490_000);
  assert.equal(tot.opcionales, 490_000);
});

test("bandeja de 8 m.l.: se factura el mínimo de 10, la concertina también", () => {
  const r = cotizarBandeja({ metros: 8, altura: 3, concertina: "base", gestoria: "no", enCaba: true }, T);
  assert.equal(r.lineas.find((l) => l.id === "bandeja")!.cantidad, 10);
  assert.equal(r.lineas.find((l) => l.id === "bandeja:concertina")!.cantidad, 10);
  assert.match(r.lineas[0].descripcion, /8 m\.l\. \(se factura el mínimo de 10 m\.l\.\)/);
  assert.ok(r.avisos.some((a) => a.codigo === "minimo_ml"));
});

test("bandeja 6 m: sin precio pregunta el rango; con 175.000 y 43,88 m.l. da $7.679.000", () => {
  const sin = cotizarBandeja({ metros: 43.88, altura: 6, concertina: "no", gestoria: "no", enCaba: true }, T);
  assert.equal(sin.lineas.length, 0);
  assert.equal(sin.pendientes[0].codigo, "precio_bandeja_6m");
  const con = cotizarBandeja({ metros: 43.88, altura: 6, precioMl: 175000, concertina: "no", gestoria: "no", enCaba: true }, T);
  assert.equal(con.lineas[0].importe, 7_679_000);
  assert.deepEqual(bloqueos(con), []);
});

test("bandeja: fuera de tarifa sin motivo bloquea; con motivo queda el desvío", () => {
  const sin = cotizarBandeja({ metros: 12, altura: 3, precioMl: 120000, concertina: "no", gestoria: "no", enCaba: true }, T);
  assert.deepEqual(bloqueos(sin), ["motivo_precio"]);
  const con = cotizarBandeja({ metros: 12, altura: 3, precioMl: 120000, motivoPrecio: "cliente recurrente", concertina: "no", gestoria: "no", enCaba: true }, T);
  assert.deepEqual(bloqueos(con), []);
  assert.equal(con.lineas[0].desvio?.motivo, "cliente recurrente");
  const fuera = cotizarBandeja({ metros: 12, altura: 6, precioMl: 230000, concertina: "no", gestoria: "no", enCaba: true }, T);
  assert.deepEqual(bloqueos(fuera), ["motivo_precio"]);
});

test("bandeja con bonificación: descuento sobre lista, renovación sobre lista, con motivo", () => {
  const sin = cotizarBandeja({ metros: 8, altura: 3, bonificacionPct: 10, concertina: "no", gestoria: "no", enCaba: true }, T);
  assert.deepEqual(bloqueos(sin), ["motivo_precio"]);
  const r = cotizarBandeja({ metros: 8, altura: 3, bonificacionPct: 10, motivoPrecio: "cliente recurrente", concertina: "no", gestoria: "no", enCaba: true }, T);
  const l = r.lineas[0];
  assert.equal(l.importeLista, 1_400_000);
  assert.equal(l.importe, 1_260_000);
  const tot = calcularTotales(r.lineas, { ivaPct: 21, renovacionPct: 35 });
  assert.equal(tot.subtotal, 1_260_000);
  assert.equal(tot.renovacion?.monto, 490_000);
});

test("bandeja fuera de CABA: la gestoría no se agrega y se avisa", () => {
  const r = cotizarBandeja({ metros: 20, altura: 3, concertina: "no", gestoria: "opcional", enCaba: false }, T);
  assert.equal(r.lineas.some((l) => l.producto === "gestoria_permiso"), false);
  assert.ok(r.avisos.some((a) => a.codigo === "gestoria_fuera_caba"));
});

// ── Fachada (modelo B) ─────────────────────────────────────────────────────────

test("fachada Corrientes 2810: 21 m a $40.000 + 21 m a $50.000 → renglón único $45.000/m²", () => {
  const r = cotizarFachada(
    { frentes: [20], altura: 42, encuadre: "A", categoria: "estandar", precioM2: 40000, escalonado: { alturaCorte: 21, salto: "A" }, gestoria: "no", enCaba: true },
    T,
  );
  assert.deepEqual(bloqueos(r), []);
  assert.equal(r.lineas.length, 1);
  const l = r.lineas[0];
  assert.equal(l.precioUnitario, 45000);
  assert.equal(l.cantidad, 840);
  assert.equal(l.importe, 37_800_000);
  assert.equal(r.detalle?.precioAlto, 50000);
  assert.match(l.descripcion, /escalonado: hasta 21 m a \$ 40\.000\/m², de 21 a 42 m a \$ 50\.000\/m²/);
});

test("fachada alta sin preguntar el escalonamiento: queda pendiente", () => {
  const r = cotizarFachada({ frentes: [12], altura: 24, encuadre: "A", categoria: "estandar", precioM2: 42000, gestoria: "no", enCaba: true }, T);
  assert.ok(r.pendientes.some((p) => p.codigo === "escalonado"));
  const no = cotizarFachada({ frentes: [12], altura: 24, encuadre: "A", categoria: "estandar", precioM2: 42000, escalonado: null, gestoria: "no", enCaba: true }, T);
  assert.equal(no.pendientes.length, 0);
});

test("fachada encuadre B: lista con bonificación, renovación sobre lista", () => {
  const r = cotizarFachada({ frentes: [10], altura: 15, encuadre: "B", bonificacionPct: 15, escalonado: null, gestoria: "no", enCaba: true }, T);
  const l = r.lineas[0];
  assert.equal(l.precioUnitario, 45000);
  assert.equal(l.descuentoPct, 15);
  assert.equal(l.importeLista, 6_750_000);
  assert.equal(l.importe, 5_737_500);
  const tot = calcularTotales(r.lineas, { ivaPct: 21, renovacionPct: 35 });
  assert.equal(tot.subtotal, 5_737_500);
  assert.equal(tot.renovacion?.monto, 2_362_500);
});

test("fachada: rango sin valor pregunta; fuera de rango sin motivo bloquea; medida absurda bloquea", () => {
  assert.equal(cotizarFachada({ frentes: [10], altura: 9, encuadre: "A", categoria: "compleja", gestoria: "no", enCaba: true }, T).pendientes[0].codigo, "precio_fachada");
  assert.deepEqual(bloqueos(cotizarFachada({ frentes: [10], altura: 9, encuadre: "A", categoria: "compleja", precioM2: 60000, gestoria: "no", enCaba: true }, T)), ["motivo_precio"]);
  assert.ok(bloqueos(cotizarFachada({ frentes: [20], altura: 360, encuadre: "B", escalonado: null, gestoria: "no", enCaba: true }, T)).includes("medida_absurda"));
});

test("fachada en esquina: dos caras suman y se avisa la jornada extra", () => {
  const r = cotizarFachada({ frentes: [4.2, 4.26], altura: 10, encuadre: "A", categoria: "licitacion", gestoria: "no", enCaba: true }, T);
  assert.equal(r.lineas[0].cantidad, 84.6);
  assert.equal(r.lineas[0].importe, 2_961_000);
  assert.ok(r.avisos.some((a) => a.codigo === "esquina"));
});

// ── Alquiler sin montaje (modelo C) ────────────────────────────────────────────

const LISTA = {
  id: "JUN26",
  piezas: [
    { codigo: "00101009", descripcion: "BASTIDOR DE ANDAMIO 0.90 m", precio: 8598.95 },
    { codigo: "000010052", descripcion: "HORIZONTAL ø48.3x1.09 m", precio: 2586.41 },
  ],
};

test("alquiler: lista × 1,8; fuera de lista 7,5 % del valor de compra; renovación 100 %", () => {
  const r = cotizarAlquiler(
    { piezas: [{ codigo: "00101009", cantidad: 10 }, { codigo: "000010052", cantidad: 20 }], fueraDeLista: [{ descripcion: "Puntal telescópico", cantidad: 4, valorCompraUnitario: 100000 }] },
    LISTA,
    T,
  );
  assert.deepEqual(bloqueos(r), []);
  // 10 × 8.598,95 + 20 × 2.586,41 = 137.717,70 → × 1,8 = 247.891,86 → $247.892
  assert.equal(r.detalle?.totalLista, 137717.7);
  assert.equal(r.lineas.find((l) => l.id === "alquiler")!.importe, 247_892);
  assert.equal(r.lineas.find((l) => l.id === "alquiler:fuera")!.importe, 30_000);
  assert.equal(r.renovacionPct, 100);
  assert.ok(r.avisos.some((a) => a.codigo === "estimado_fuera_lista"));
});

test("alquiler: un código que no está en la lista bloquea; lo que está en lista no va por valor de compra", () => {
  assert.deepEqual(bloqueos(cotizarAlquiler({ piezas: [{ codigo: "XXX", cantidad: 1 }] }, LISTA, T)), ["pieza_inexistente"]);
  const doble = cotizarAlquiler({ piezas: [], fueraDeLista: [{ descripcion: "BASTIDOR DE ANDAMIO 0.90 m", cantidad: 1, valorCompraUnitario: 50000 }] }, LISTA, T);
  assert.ok(bloqueos(doble).includes("doble_criterio"));
});

// ── Mano de obra ───────────────────────────────────────────────────────────────

test("mano de obra: reproduce la tabla del criterio (cuadrillas de 5 y 3, +70 % y +100 %)", () => {
  assert.equal(valorJornadaPersona("uocra_estandar", T) * 5, 1_010_000);
  assert.equal(valorJornadaPersona("uocra_estandar", T) * 3, 606_000);
  assert.equal(valorJornadaPersona("uocra_alto", T) * 5, 1_190_000);
  assert.equal(valorJornadaPersona("uocra_alto", T) * 3, 714_000);
  assert.equal(valorJornadaPersona("industria", T) * 5, 1_150_000);
});

test("mano de obra: sábado +50 %, única vez y fuera de la renovación", () => {
  const r = cotizarManoObra({ jornadasArmado: 2, jornadasDesarme: 2, mecanismo: "uocra_estandar", jornadasSabado: 1 }, T);
  const l = r.lineas[0];
  assert.equal(l.importe, 3 * 1_010_000 + 1_515_000);
  assert.equal(l.unicaVez, true);
  assert.equal(l.esManoDeObra, true);
});

test("fuera de radio: viaje al 60 %, alojamiento, comida y mínimo 2 días", () => {
  const r = cotizarManoObra(
    { jornadasArmado: 3, jornadasDesarme: 2, mecanismo: "uocra_estandar", fueraDeRadio: { jornadasViaje: 2, noches: 3, dias: 1 } },
    T,
  );
  const v = r.lineas.find((l) => l.id === "viaticos")!;
  assert.equal(v.importe, 1_212_000 + 1_425_000 + 500_000);
  assert.equal(v.producto, "traslado");
  assert.ok(r.avisos.some((a) => a.codigo === "minimo_movilizacion"));
});

test("mano de obra: sin jornadas pregunta (nunca se asumen); la altura sólo avisa", () => {
  const r = cotizarManoObra({ jornadasArmado: 0, jornadasDesarme: 0, mecanismo: "uocra_estandar", alturaMaxima: 35 }, T);
  assert.ok(r.pendientes.some((p) => p.codigo === "jornadas"));
  assert.ok(r.avisos.some((a) => a.codigo === "productividad_altura" && /1,5/.test(a.texto)));
});

// ── Complementarios y venta ────────────────────────────────────────────────────

test("complementarios: flete CABA pide monto; ingeniería fuera de rango sin motivo bloquea", () => {
  assert.equal(cotizarComplementario({ tipo: "flete", seccion: "base", zona: "caba" }, T).pendientes[0].codigo, "monto_flete");
  const f = cotizarComplementario({ tipo: "flete", seccion: "base", zona: "gba_cercano" }, T);
  assert.equal(f.lineas[0].importe, 850_000);
  assert.equal(f.lineas[0].unicaVez, true);
  assert.deepEqual(bloqueos(cotizarComplementario({ tipo: "ingenieria", seccion: "base", monto: 9_000_000 }, T)), ["motivo_precio"]);
  assert.deepEqual(bloqueos(cotizarComplementario({ tipo: "gestoria", seccion: "opcional", enCaba: false }, T)), ["gestoria_fuera_caba"]);
});

test("venta de material: calcula la referencia pero no inventa la línea de Odoo", () => {
  const r = cotizarVentaMaterial({ piezas: [{ codigo: "00101009", cantidad: 10 }], amortizacion: "A" }, LISTA, T);
  assert.equal(r.lineas.length, 0);
  assert.equal(r.detalle?.precioVenta, Math.round(85989.5 * 36));
});

// ── Totales, renovación y chequeos ─────────────────────────────────────────────

test("renovación sólo sobre el canon: el flete y la ingeniería quedan afuera (Bricklane)", () => {
  // La propuesta de ejemplo de la skill: fachada 216 m² a $40.000 + traslado $725.000.
  const lineas = [
    ...cotizarFachada({ frentes: [18], altura: 12, encuadre: "A", categoria: "estandar", precioM2: 40000, escalonado: null, gestoria: "no", enCaba: true }, T).lineas,
    nuevaLinea({ id: "flete", grupo: "complementario", seccion: "base", producto: "traslado", descripcion: "Servicio de traslado (envío y retiro)", cantidad: 1, precioUnitario: 725000, unicaVez: true, calculo: "" }),
  ];
  const tot = calcularTotales(lineas, { ivaPct: 21, renovacionPct: 35 });
  assert.equal(tot.subtotal, 9_365_000);
  assert.equal(tot.canonLocativo, 8_640_000);
  // La skill detectaba "única vez" por palabras y no reconocía "Servicio de traslado":
  // cobraba 35 % sobre $9.365.000. Con la marca por producto sale sobre el canon.
  assert.equal(tot.renovacion?.monto, 3_024_000);
  assert.equal(tot.iva, 1_966_650);
  assert.equal(tot.total, 11_331_650);
});

test("chequeos: la mano de obra por encima del corte avisa (regla de corte)", () => {
  const lineas = [
    ...cotizarAlquiler({ piezas: [{ codigo: "00101009", cantidad: 50 }] }, LISTA, T).lineas,
    ...cotizarManoObra({ jornadasArmado: 2, jornadasDesarme: 1, mecanismo: "uocra_estandar" }, T).lineas,
  ];
  const tot = calcularTotales(lineas, { ivaPct: 21, renovacionPct: null });
  assert.ok(tot.pesoManoDeObraPct! > 50);
  assert.ok(chequear(lineas, tot, T).some((a) => a.codigo === "mo_pesada"));
});

// ── Letras y CUIT ──────────────────────────────────────────────────────────────

test("montos en letras: como num2words, pero con el apócope correcto (veintiún mil)", () => {
  const casos: [number, string][] = [
    [0, "cero"], [1, "uno"], [16, "dieciséis"], [21, "veintiuno"], [100, "cien"], [101, "ciento uno"],
    [1000, "mil"], [1001, "mil uno"], [21000, "veintiún mil"], [31000, "treinta y un mil"], [101000, "ciento un mil"],
    [504000, "quinientos cuatro mil"], [1_000_000, "un millón"], [1_440_000, "un millón cuatrocientos cuarenta mil"],
    [8_640_000, "ocho millones seiscientos cuarenta mil"], [21_000_000, "veintiún millones"],
    [2_500_001, "dos millones quinientos mil uno"], [1_000_000_000, "mil millones"],
    [999_999, "novecientos noventa y nueve mil novecientos noventa y nueve"],
  ];
  for (const [n, letras] of casos) assert.equal(enLetras(n), letras, `${n}`);
  assert.equal(pesosEnLetras(1_440_000), "Son pesos un millón cuatrocientos cuarenta mil");
});

test("CUIT: el de ABA valida; un dígito mal no", () => {
  const ok = validarCuit("30-71111650-4");
  assert.equal(ok.valido, true);
  if (ok.valido) assert.equal(ok.tipo, "persona_juridica");
  assert.equal(validarCuit("30711116505").valido, false);
  assert.equal(validarCuit("20-1234").valido, false);
  assert.equal(validarCuit("99-71111650-4").valido, false);
});
