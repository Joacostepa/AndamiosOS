import { test } from "node:test";
import assert from "node:assert/strict";
import {
  abonoDelLote, accionSugerida, armarOt, calcularCalle, cifrasCalle, clienteDeTituloOt, compararSemana, decisionesCalle,
  esVehiculoDeRenovacion, estaEnLaCalle, fechaAr, mediana, oracionesCalle, resumenCalle, tipoContrato, tramoAntiguedad,
  type EntradaCalle, type LineaFacturaOdoo, type LineaVentaOdoo, type OrdenOdoo, type OtOdoo,
} from "./calle-reglas.ts";

const HOY = "2026-10-15";
const RENOV = 158; // producto "… (RENOVACIÓN ALQUILER)"
const ALQ = 200; // producto de alquiler inicial (rent_ok)

function orden(id: number, name: string, o: Partial<OrdenOdoo> = {}): OrdenOdoo {
  return {
    id, name, partner_id: [id * 10, `Cliente ${name}`], x_obra_id: false, x_studio_tipo_de_contrato: "Obra ",
    x_studio_estado_de_obra: "Armado", rental_status: "return", rental_start_date: "2026-01-01 15:00:00",
    rental_return_date: "2026-12-31 15:00:00", x_fecha_armado: false, x_fecha_fin_obra_estimada: false,
    amount_untaxed: 1_000_000, x_facturado_neto: 500_000, x_permiso_m2: 100, x_permiso_metros_lineales: 10,
    x_direccion_obra: `Obra ${name}`, x_obra_referencia: false, user_id: [1, "Vendedora"], x_studio_tcnico: false, ...o,
  };
}
let lid = 1;
const renov = (orderId: number, monto: number, creado: string): LineaVentaOdoo => ({ id: lid++, order_id: [orderId, ""], product_id: [RENOV, "ESTRUCTURA (RENOVACIÓN ALQUILER)"], price_subtotal: monto, create_date: creado, display_type: false, is_downpayment: false });
const inicial = (orderId: number, monto: number): LineaVentaOdoo => ({ id: lid++, order_id: [orderId, ""], product_id: [ALQ, "ESTRUCTURA (ALQUILER Y MONTAJE)"], price_subtotal: monto, create_date: "2026-01-01 12:00:00", display_type: false, is_downpayment: false });
const anticipo = (orderId: number): LineaVentaOdoo => ({ id: lid++, order_id: [orderId, ""], product_id: false, price_subtotal: 0, create_date: "2026-01-01 12:00:00", display_type: false, is_downpayment: true });
let fid = 1;
const factura = (linea: LineaVentaOdoo, fecha: string, ars: number, tipo = "out_invoice"): LineaFacturaOdoo => ({ id: fid++, date: fecha, balance: -ars, move_type: tipo, sale_line_ids: [linea.id], product_id: linea.product_id, move_id: [fid, `FA ${fid}`] });

function entrada(e: Partial<EntradaCalle>): EntradaCalle {
  return { hoy: HOY, ordenes: [], clientes: {}, lineas: [], productosAlquiler: [ALQ], facturas: [], ots: [], otCompletadasSemana: 3, flota: null, ...e };
}

test("fechaAr: datetime UTC de Odoo → día argentino; un date queda igual", () => {
  assert.equal(fechaAr("2026-01-21 02:30:00"), "2026-01-20");
  assert.equal(fechaAr("2026-01-21 16:00:00"), "2026-01-21");
  assert.equal(fechaAr("2026-03-07"), "2026-03-07");
  assert.equal(fechaAr(false), null);
});

test("en la calle (§1): retirado sin desarmar, o armado sin retiro registrado", () => {
  assert.equal(estaEnLaCalle({ rental_status: "return", x_studio_estado_de_obra: "Armado" }), true);
  assert.equal(estaEnLaCalle({ rental_status: "return", x_studio_estado_de_obra: "Desarmado" }), false);
  assert.equal(estaEnLaCalle({ rental_status: "pickup", x_studio_estado_de_obra: "Pendiente de Desarme" }), true);
  assert.equal(estaEnLaCalle({ rental_status: "pickup", x_studio_estado_de_obra: "Pendiente de Armado" }), false);
  // "Armado" que figura devuelto: no cuenta (es un error de carga, va como aviso).
  assert.equal(estaEnLaCalle({ rental_status: "returned", x_studio_estado_de_obra: "Armado" }), false);
});

test("piezas chicas: tipo, mediana, tramos, acción sugerida, cliente desde el título de la OT", () => {
  assert.equal(tipoContrato("Obra "), "Obra");
  assert.equal(tipoContrato("Alquiler Sin Montaje"), "Sin montaje");
  assert.equal(tipoContrato(false), "Sin tipo");
  assert.equal(mediana([5, 1, 3]), 3);
  assert.equal(mediana([1, 2, 3, 4]), 2.5);
  assert.equal(mediana([]), null);
  assert.equal(tramoAntiguedad(30), "0-30");
  assert.equal(tramoAntiguedad(181), "+180");
  assert.equal(accionSugerida({ estadoObra: "Pendiente de Desarme", diasSinFacturar: 3 }), "Retirar");
  assert.equal(accionSugerida({ estadoObra: "Armado", diasSinFacturar: null }), "Facturar");
  assert.equal(accionSugerida({ estadoObra: "Armado", diasSinFacturar: 41 }), "Facturar");
  assert.equal(accionSugerida({ estadoObra: "Armado", diasSinFacturar: 40 }), "Renovar");
  assert.equal(clienteDeTituloOt("Armado · S02711 · Mostaza S.A — Avenida Corrientes 985"), "Mostaza S.A");
  assert.equal(clienteDeTituloOt("OT suelta"), null);
});

test("abono de un lote: suma los renglones (definición §2)", () => {
  assert.equal(abonoDelLote([renov(1, 100, "2026-10-01 10:00:00"), renov(1, 50, "2026-10-01 10:00:00")]), 150);
});

test("abono de un lote: el mismo canon en dos meses ('Mes 2' y 'Mes 3') cuenta sólo el último (S00128)", () => {
  const con = (monto: number, name: string, creado = "2026-10-15 19:14:16"): LineaVentaOdoo => ({ ...renov(1, monto, creado), name });
  // Caso real del 15/10: etapa 1 renovada el 13/10 + etapa 2 "Mes 2" y "Mes 3" cargadas juntas.
  const lote = [
    con(13_695_287, "PLATAFORMA POR M2 (RENOVACIÓN ALQUILER)", "2026-10-13 14:07:53"),
    con(14_010_279.34, "PLATAFORMA POR M2 (RENOVACIÓN ALQUILER) Etapa 2 - Mes 2"),
    con(14_332_515.71, "PLATAFORMA POR M2 (RENOVACIÓN ALQUILER) Etapa 2 - Mes 3"),
  ];
  assert.equal(abonoDelLote(lote), 13_695_287 + 14_332_515.71);
  // Distintas etapas son distintos canones: van los dos.
  assert.equal(abonoDelLote([con(10, "X Etapa 1 - Mes 4"), con(20, "X Etapa 2 - Mes 2")]), 30);
  // Varios frentes del mismo mes: van todos.
  assert.equal(abonoDelLote([con(10, "X - Mes 3"), con(5, "X - Mes 3"), con(7, "X - Mes 2")]), 15);
  // Sin "Mes N" (o sin descripción leída): la suma de siempre.
  assert.equal(abonoDelLote([renov(1, 100, "2026-10-01 10:00:00"), renov(1, 50, "2026-10-01 10:00:00")]), 150);
});

test("vehículo de renovación: sólo renovaciones, sin alquiler inicial", () => {
  const alq = new Set([ALQ]);
  assert.equal(esVehiculoDeRenovacion([renov(9, 10, "2026-10-06 13:00:00")], alq), true);
  assert.equal(esVehiculoDeRenovacion([inicial(9, 10), renov(9, 10, "2026-10-06 13:00:00")], alq), false);
  assert.equal(esVehiculoDeRenovacion([inicial(9, 10)], alq), false);
});

// Caso Ministerio: obra 44 con S00084 y S00086 (reemplazadas en enero), S00735 (factura hasta
// julio) y S02163 (Pendiente de Armado, lleva las renovaciones y facturó el 08/10).
function casoMinisterio() {
  const obra: [number, string] = [44, "25 de Mayo 179, C.A.B.A"];
  const cli = { partner_id: [500, "MINISTERIO DEL INTERIOR, 25 de Mayo 179"] as [number, string], x_obra_id: obra };
  const o84 = orden(84, "S00084", { ...cli, rental_return_date: "2026-01-21 16:00:00", amount_untaxed: 54_375_038 });
  const o86 = orden(86, "S00086", { ...cli, rental_return_date: "2026-01-21 17:00:00", amount_untaxed: 6_335_174 });
  const o735 = orden(735, "S00735", { ...cli, rental_return_date: "2026-07-21 16:00:00", amount_untaxed: 170_277_772 });
  const o2163 = orden(2163, "S02163", { ...cli, rental_status: "pickup", x_studio_estado_de_obra: "Pendiente de Armado" });
  const l84 = renov(84, 47_262_457, "2025-12-23 12:00:00");
  const l86 = anticipo(86);
  const l735 = anticipo(735);
  const l2163a = renov(2163, 28_379_629, "2026-07-22 16:54:38");
  const l2163b = renov(2163, 28_379_629, "2026-10-06 13:04:07");
  const facturas = [
    factura(l84, "2026-01-23", 23_631_229),
    factura(l86, "2026-01-23", 1_845_911),
    factura(l735, "2026-06-23", 28_379_629),
    factura(l735, "2026-07-27", 28_379_629),
    factura(l2163a, "2026-10-08", 28_379_629),
    factura(l2163b, "2026-10-08", 28_379_629),
  ];
  return entrada({ ordenes: [o84, o86, o735, o2163], clientes: { 500: "MINISTERIO DEL INTERIOR" }, lineas: [l84, l86, l735, l2163a, l2163b], facturas });
}

test("Ministerio: una obra con órdenes reemplazadas cuenta una vez y factura vía S02163", () => {
  const d = calcularCalle(casoMinisterio());
  assert.deepEqual(d.contratos.map((f) => f.orden), ["S00735"]);
  assert.deepEqual(d.reemplazadas.map((r) => [r.orden, r.por]), [["S00084", "S00735"], ["S00086", "S00735"]]);
  const c = d.contratos[0];
  assert.equal(c.cliente, "MINISTERIO DEL INTERIOR");
  assert.equal(c.abonoArs, 28_379_629);
  assert.equal(c.abonoFuente, "ultima_renovacion");
  assert.equal(c.ultimaRenovacion, "2026-10-06");
  assert.equal(c.ultimaFactura, "2026-10-08");
  assert.equal(c.facturadoVia, "S02163");
  assert.equal(c.sigueFacturando, true);
  // Devolución vencida: una sola, que se sigue facturando; no hay "sin facturar".
  assert.equal(d.devolucion.filas.length, 1);
  assert.equal(d.devolucion.sinFacturar, 0);
  assert.equal(d.devolucion.abonoArs, 28_379_629);
  // Renovó en los últimos 35 días (por la renovación de S02163).
  assert.equal(d.sinRenovacion.filas.length, 0);
  assert.equal(d.topClientes[0].pct, 100);
});

test("una ampliación pendiente de la misma obra no tapa a un contrato que dejó de facturar", () => {
  const obra: [number, string] = [80, "Zanni"];
  const a = orden(1991, "S01991", { x_obra_id: obra, rental_return_date: "2026-09-26 16:00:00" });
  const b = orden(2768, "S02768", { x_obra_id: obra, rental_status: "pickup", x_studio_estado_de_obra: "Pendiente de Armado" });
  const la = inicial(1991, 40_000_000);
  const lb = inicial(2768, 5_800_000);
  const d = calcularCalle(entrada({ ordenes: [a, b], lineas: [la, lb], facturas: [factura(la, "2026-08-31", 19_000_000), factura(lb, "2026-10-02", 5_800_000)] }));
  const c = d.contratos[0];
  assert.equal(c.ultimaFactura, "2026-08-31");
  assert.equal(c.facturadoVia, null);
  assert.equal(c.sigueFacturando, false);
  assert.equal(d.devolucion.sinFacturar, 1);
});

test("dos contratos de la misma obra que facturan: cuentan los dos", () => {
  const obra: [number, string] = [10, "Lacroze 2542"];
  const a = orden(1, "S1", { x_obra_id: obra });
  const b = orden(2, "S2", { x_obra_id: obra });
  const la = renov(1, 400_000, "2026-10-01 12:00:00");
  const lb = renov(2, 550_000, "2026-10-01 12:00:00");
  const d = calcularCalle(entrada({ ordenes: [a, b], lineas: [la, lb], facturas: [factura(la, "2026-10-09", 400_000), factura(lb, "2026-10-09", 550_000)] }));
  assert.equal(d.contratos.length, 2);
  assert.equal(d.reemplazadas.length, 0);
});

test("abono: renovación (lote de 10 días) → cuota facturada → estimado por tipo → sin dato", () => {
  // A: dos renovaciones; la última es un lote de dos renglones en 3 días. Alquiler inicial 1.000 → relación 0,5.
  const a = orden(1, "SA");
  const la = [inicial(1, 1000), renov(1, 300, "2026-08-01 12:00:00"), renov(1, 400, "2026-10-01 12:00:00"), renov(1, 100, "2026-10-04 12:00:00")];
  // B: sin renovaciones, factura cuotas (anticipos sin producto): jun, jul, ago, sep.
  const b = orden(2, "SB");
  const lb = anticipo(2);
  const fb = [factura(lb, "2026-06-10", 999), factura(lb, "2026-07-10", 200), factura(lb, "2026-08-10", 300), factura(lb, "2026-09-10", 250)];
  // C: nuevo, sin renovación ni cuotas: alquiler inicial 2.000 × 0,5.
  const c = orden(3, "SC");
  const lc = [inicial(3, 2000)];
  // D: sin nada de qué agarrarse → sin dato (nunca 0).
  const dd = orden(4, "SD", { x_studio_tipo_de_contrato: "Simple" });
  const d = calcularCalle(entrada({ ordenes: [a, b, c, dd], lineas: [...la, lb, ...lc], facturas: fb }));
  const por = Object.fromEntries(d.contratos.map((f) => [f.orden, f]));
  assert.equal(por.SA.abonoArs, 500);
  assert.equal(por.SA.abonoFuente, "ultima_renovacion");
  assert.equal(por.SA.renovaciones, 2);
  assert.equal(por.SA.ultimaRenovacion, "2026-10-04");
  assert.equal(por.SB.abonoFuente, "cuota_facturada");
  assert.equal(por.SB.abonoArs, 250); // mediana de jul–sep (junio es el primer mes y no cuenta)
  assert.equal(por.SC.abonoFuente, "estimado_sin_renovacion");
  assert.equal(por.SC.abonoArs, 1000);
  assert.equal(por.SD.abonoArs, null);
  assert.equal(por.SD.abonoFuente, "sin_dato");
  assert.equal(d.abono.totalArs, 1750);
  assert.equal(d.abono.estimados, 1);
  assert.equal(d.abono.sinDato, 1);
});

test("devolución vencida: días, 'sin facturar +40 d', tramos; sin renovación en 35 días", () => {
  const a = orden(1, "SA", { rental_return_date: "2026-10-01 15:00:00", x_fecha_armado: "2026-05-01 12:00:00" });
  const b = orden(2, "SB", { rental_return_date: "2026-03-01 15:00:00", x_fecha_armado: "2026-02-01 12:00:00", x_studio_estado_de_obra: "Pendiente de Desarme", rental_status: "pickup" });
  const c = orden(3, "SC", { rental_return_date: "2026-11-01 15:00:00", x_fecha_armado: "2026-10-01 12:00:00" });
  const la = renov(1, 1000, "2026-10-02 12:00:00");
  const lb = renov(2, 2000, "2026-03-02 12:00:00");
  const lc = renov(3, 3000, "2026-10-02 12:00:00");
  const d = calcularCalle(entrada({ ordenes: [a, b, c], lineas: [la, lb, lc], facturas: [factura(la, "2026-10-05", 1000), factura(lb, "2026-03-05", 2000)] }));
  assert.deepEqual(d.devolucion.filas.map((f) => [f.orden, f.diasVencido, f.sigueFacturando, f.accion]), [["SB", 228, false, "Retirar"], ["SA", 14, true, "Renovar"]]);
  assert.equal(d.devolucion.sinFacturar, 1);
  assert.equal(d.devolucion.abonoSinFacturarArs, 2000);
  assert.deepEqual(d.devolucion.porAntiguedad.map((t) => t.contratos), [1, 0, 0, 1]);
  // SC se armó hace 14 días: todavía no debía renovar.
  assert.equal(d.sinRenovacion.debian, 2);
  assert.deepEqual(d.sinRenovacion.filas.map((f) => f.orden), ["SB"]);
  assert.equal(d.sinRenovacion.tasa, 50);
  assert.equal(d.vencen15, 0);
  assert.equal(d.vencen7, 0);
});

test("fin de obra vencido incluye 'Armado' que Alquiler da por devuelto; sin fecha y calidad", () => {
  const a = orden(1, "SA", { x_fecha_fin_obra_estimada: "2026-10-01" });
  const b = orden(2, "SB", { x_fecha_fin_obra_estimada: "2026-09-01", rental_status: "returned" });
  const c = orden(3, "SC", { x_permiso_m2: 0, x_permiso_metros_lineales: 0 });
  const d = calcularCalle(entrada({ ordenes: [a, b, c] }));
  assert.deepEqual(d.finObra.filas.map((f) => [f.orden, f.diasVencido, f.enLaCalle]), [["SB", 44, false], ["SA", 14, true]]);
  assert.equal(d.finObra.activasEnAlquiler, 1);
  assert.equal(d.finObra.sinFecha, 1);
  assert.equal(d.armadoDevuelto.total, 1);
  assert.equal(d.m2.obraSinMedidas, 1);
  assert.equal(d.m2.m2, 100); // SB no está en la calle (devuelta)
});

test("órdenes de trabajo: semanas, vencidas, backlog y habilitación recalculada hoy", () => {
  const ot = (id: number, tipo: string, fecha: string | false, o: Partial<OtOdoo> = {}): OtOdoo => ({
    id, x_name: `${tipo} · S0${id} · CLIENTE ${id} — Calle ${id}`, x_tipo: tipo, x_estado: "pendiente", x_fecha_programada: fecha, x_order_id: [id, `S0${id}`],
    x_jornadas_num: 1.5, x_cuadrilla_prevista_id: false, x_direccion_obra: `Calle ${id}`, x_obra_referencia: false, x_hab_semaforo: "verde", x_hab_vencimiento: false, x_es_adicional: false, ...o,
  });
  const r = armarOt([
    ot(1, "armado", "2026-10-12"),
    ot(2, "desarme", "2026-10-16", { x_hab_semaforo: "rojo" }),
    ot(3, "armado", "2026-10-20", { x_hab_semaforo: "verde", x_hab_vencimiento: "2026-10-01" }), // venció: rojo de hoy
    ot(4, "armado", "2026-08-15"),
    ot(5, "mantenimiento", false),
    ot(6, "armado", "2026-10-16", { x_estado: "completada" }),
  ], HOY, () => null, 7);
  assert.deepEqual(r.semana, { desde: "2026-10-12", hasta: "2026-10-18" });
  assert.deepEqual(r.esta.map((x) => x.id), [1, 2]);
  assert.deepEqual(r.prox.map((x) => x.id), [3]);
  assert.equal(r.prox[0].habilitacion, "vencida");
  assert.deepEqual(r.vencidas.map((x) => [x.id, x.diasVencida]), [[4, 61], [1, 3]]);
  assert.equal(r.sinFecha, 1);
  assert.equal(r.backlog.total, 5);
  assert.equal(r.backlog.armados, 3);
  assert.equal(r.backlog.jornadasArmado, 4.5);
  assert.equal(r.sinHabilitacionProx2, 2);
  assert.equal(r.esta[0].cliente, "CLIENTE 1");
  assert.equal(r.completadasSemana, 7);
});

test("cifras: sin órdenes es 'Sin dato' (nunca 0); comparación sin historia va punteada", () => {
  const vacio = calcularCalle(entrada({ ordenes: [], ots: null }));
  const cifras = cifrasCalle(vacio);
  for (const c of cifras) assert.equal(c.valor.tipo, "sin_dato", c.kpi);
  assert.deepEqual(compararSemana(10, null, "↓"), { delta: null, base: "vs semana anterior", polaridad: "↓", motivo: "Todavía no hay historia guardada" });
  assert.deepEqual(compararSemana(12, { valor: 10, fecha: "2026-10-08" }, "↓"), { delta: 20, base: "vs 08/10", polaridad: "↓" });
});

test("decisiones, narrativa y resumen para La semana", () => {
  const a = orden(1, "SA", { rental_return_date: "2026-03-01 15:00:00", x_fecha_armado: "2026-02-01 12:00:00" });
  const la = renov(1, 2000, "2026-03-02 12:00:00");
  const e = entrada({ ordenes: [a], lineas: [la], facturas: [factura(la, "2026-03-05", 2000)] });
  const d = calcularCalle(e);
  const dec = decisionesCalle(d);
  assert.deepEqual(dec.map((x) => [x.id, x.sev, x.duenoSugerido]), [["devolucion", "rojo", "Joaquín"], ["sin_renov", "ambar", null]]);
  const or = oracionesCalle(d);
  assert.equal(or[0].id, "dev");
  assert.equal(or[0].frase.at(-1), "1 no se facturan hace más de 40 días.");
  const cifras = cifrasCalle(d);
  const rc = resumenCalle({ cifras, detalle: d, decisiones: dec, oraciones: or })!;
  assert.equal(rc.tarjeta.kpi, "dev_vencida");
  assert.deepEqual(rc.tarjeta.valor, { tipo: "cantidad", n: 1, unidad: "contratos" });
  assert.equal(rc.cifras.devolucion.sinFacturar, 1);
  assert.equal(rc.reunion[0].orden, "SA");
  assert.equal(resumenCalle({ cifras: [], detalle: null }), null);
  // Nada de La calle es reservado.
  assert.ok([...cifras, ...dec, ...or].every((x) => !("reservado" in x) || !x.reservado));
});
