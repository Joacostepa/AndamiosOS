// La tarjeta del alquiler simple (aprobacion-alquiler.ts): leer lo que dejó Tomás, recalcular con
// lo de hoy, lo que bloquea, «Corregir» (total, cantidades, fecha, texto), lo que va a Odoo (que
// sume lo mismo que el mensaje) y la nota interna. Con el ejemplo de Palermo de la §5.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cotizarAlquilerSimple, pedidoVacio, type ContextoAlquiler, type Franja, type PedidoAlquiler, type ResultadoAlquiler } from "./alquiler-simple.ts";
import { lineasOrdenAlquilerSimple, PRODUCTO_MINIMO_OPERATIVO, PRODUCTO_RECARGO_FRANJA, type Flete } from "../odoo/alquiler-simple.ts";
import {
  aplicarCorreccionAlquiler, bloqueosAlquiler, clienteParaRecalculo, CORRECCION_EN_BASE, cotizacionParaOdoo, datosDelPedido, entregaDelPresupuesto, fleteDeHoy,
  franjaParaOdoo, leerPayloadAlquiler, notaInternaAlquiler, precioConTotal, recalcularAlquiler, textoPlataforma, validarCorreccionAlquiler,
  type ContextoRecalculo, type CorreccionAlquiler, type PayloadAlquiler,
} from "./aprobacion-alquiler.ts";
import { verificarRecalculo } from "./aprobacion.ts";

const P = { precioPieza: 18000, ruedasJuego: 36000, tornillonesJuego: 36000, minimoOperativo: 500000, maxModulos: 10, recargoFranjaPct: 20 };
const HOY = "2026-11-12";
const LUNES = "2026-11-16";
const FERIADOS = ["2026-11-23"];
const MANANA: Franja = { tipo: "manana" };
const PALERMO_ODOO: Flete = { carrierId: 380, nombre: "PALERMO", precio: 140400 };
const FLETES: Flete[] = [PALERMO_ODOO, { carrierId: 354, nombre: "AGRONOMIA", precio: 109200 }];
const FICHA = { mensajesCliente: ["Hola, quiero pintar la pared del patio"], banderas: [], segmento: null };

/** Pintar una pared de patio hasta 5 m en Palermo, piso liso, espacio de sobra (§5). */
function pedido(cambios: Partial<PedidoAlquiler> = {}): PedidoAlquiler {
  return { ...pedidoVacio(), lugar: "afuera", alturaTrabajo: 5, espacioDeSobra: true, piso: "liso", fecha: LUNES, franja: MANANA, dias: 7, ...cambios };
}

function cotizar(p: PedidoAlquiler, flete = PALERMO_ODOO, deuda: boolean | null = false): ResultadoAlquiler {
  const c: ContextoAlquiler = {
    parametros: P, hoy: HOY, feriados: FERIADOS,
    flete: { tipo: "lista", barrio: "Palermo", monto: flete.precio, metodoEnvioId: flete.carrierId },
    cliente: { ...FICHA, deudaVencida: deuda },
  };
  return cotizarAlquilerSimple(p, c);
}

/** Lo que guarda la herramienta de Tomás en cli_aprobaciones.payload (contrato de la etapa). */
function payloadDe(p: PedidoAlquiler = pedido(), extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    alquiler: { pedido: p, resultado: cotizar(p), flete: { id: PALERMO_ODOO.carrierId, nombre: PALERMO_ODOO.nombre, precio: PALERMO_ODOO.precio }, entrega: { fecha: p.fecha, franja: p.franja } },
    alertas: [],
    asignacion: null,
    direccion: "Gorriti 4500, Palermo",
    ...extra,
  };
}

const CTX: ContextoRecalculo = { parametros: P, fletes: FLETES, hoy: HOY, feriados: FERIADOS, ficha: FICHA };
const recalc = (p: PayloadAlquiler, c: CorreccionAlquiler | null = null, ctx: Partial<ContextoRecalculo> = {}) => recalcularAlquiler(p, { ...CTX, ...ctx }, c);

// ── Leer lo que dejó Tomás ─────────────────────────────────────────────────────────────

test("leerPayloadAlquiler: el contrato { id, nombre, precio } y también carrierId", () => {
  const p = leerPayloadAlquiler(payloadDe());
  assert.deepEqual(p.flete, { carrierId: 380, nombre: "PALERMO", precio: 140400 });
  assert.deepEqual(p.entrega, { fecha: LUNES, franja: MANANA });
  assert.equal(p.direccion, "Gorriti 4500, Palermo");
  const conCarrier = payloadDe();
  (conCarrier.alquiler as Record<string, unknown>).flete = { carrierId: 380, nombre: "PALERMO", precio: 140400 };
  assert.equal(leerPayloadAlquiler(conCarrier).flete?.carrierId, 380);
});

test("leerPayloadAlquiler: sin entrega aparte usa la del pedido; sin pedido o resultado, tira", () => {
  const sinEntrega = payloadDe();
  delete (sinEntrega.alquiler as Record<string, unknown>).entrega;
  assert.deepEqual(leerPayloadAlquiler(sinEntrega).entrega, { fecha: LUNES, franja: MANANA });
  assert.throws(() => leerPayloadAlquiler({ alquiler: { piezas: [] } }), /pedido o el resultado/);
  assert.throws(() => leerPayloadAlquiler({}), /pedido o el resultado/);
  // El flete inválido queda en null (va a bloquear: no hay flete de Odoo).
  const malo = payloadDe();
  (malo.alquiler as Record<string, unknown>).flete = { nombre: "PALERMO" };
  assert.equal(leerPayloadAlquiler(malo).flete, null);
});

// ── Recalcular con lo de hoy ───────────────────────────────────────────────────────────

test("recalcular: el ejemplo de Palermo da $ 500.000 y no bloquea", () => {
  const r = recalc(leerPayloadAlquiler(payloadDe()));
  assert.deepEqual(r.bloqueos, []);
  assert.equal(r.total, 500000);
  assert.equal(r.precio?.minimoOperativo, 197600);
  assert.ok(r.mensaje?.includes("$ 500.000 + IVA"), r.mensaje ?? "");
  assert.ok(r.mensaje?.includes("¿Te lo reservo para el lunes 16 de noviembre, de 8 a 12?"));
  assert.ok(verificarRecalculo(500000, r.total!).ok);
});

test("recalcular: lo que va a Odoo suma lo mismo que el mensaje (con el mínimo y el flete del barrio)", () => {
  const r = recalc(leerPayloadAlquiler(payloadDe()));
  assert.ok(r.cotizacion);
  assert.equal(r.cotizacion.flete?.carrierId, 380);
  assert.equal(r.cotizacion.entrega, LUNES);
  // JS, 13/11: la devolución es la entrega + los días que pidió (7), no + 30.
  assert.equal(r.cotizacion.fin, "2026-11-23");
  assert.deepEqual(r.cotizacion.franja, { desde: "08:00", hasta: "12:00" });
  const o = lineasOrdenAlquilerSimple(r.cotizacion);
  assert.equal(o.neto, 500000);
  assert.ok(o.lineas.some((l) => l.productId === PRODUCTO_MINIMO_OPERATIVO && l.precioUnitario === 197600));
});

test("recalcular: si el flete subió hoy, el total cambia y verificarRecalculo frena", () => {
  const p = leerPayloadAlquiler(payloadDe());
  // Con un flete de 400.000 el material + flete pasa el mínimo: 162.000 + 400.000.
  const r = recalc(p, null, { fletes: [{ ...PALERMO_ODOO, precio: 400000 }] });
  assert.equal(r.total, 562000);
  const v = verificarRecalculo(500000, r.total!);
  assert.equal(v.ok, false);
});

test("recalcular: el método de envío archivado bloquea; sin Odoo se usa el guardado con un aviso", () => {
  const p = leerPayloadAlquiler(payloadDe());
  const sinMetodo = recalc(p, null, { fletes: [FLETES[1]] });
  assert.ok(sinMetodo.bloqueos.some((b) => /barrio|flete/i.test(b)), sinMetodo.bloqueos.join(" | "));
  assert.equal(sinMetodo.precio, null);
  const sinOdoo = recalc(p, null, { fletes: null });
  assert.deepEqual(sinOdoo.bloqueos, []);
  assert.equal(sinOdoo.total, 500000);
  assert.ok(sinOdoo.avisos.some((a) => /No se pudo leer la lista de fletes/.test(a)));
});

test("recalcular: la fecha que ya pasó (o es hoy) bloquea con la próxima posible", () => {
  const p = leerPayloadAlquiler(payloadDe());
  const r = recalc(p, null, { hoy: "2026-11-16" });
  assert.ok(r.bloqueos.some((b) => /fecha|hoy/i.test(b)), r.bloqueos.join(" | "));
});

test("recalcular: la deuda y las palabras no bloquean (decide la persona); la cuenta de los socios sí", () => {
  const conDeuda = payloadDe();
  (conDeuda.alquiler as Record<string, unknown>).resultado = cotizar(pedido(), PALERMO_ODOO, true);
  const r = recalc(leerPayloadAlquiler(conDeuda), null, { ficha: { ...FICHA, mensajesCliente: ["¿me hacés un descuento?"] } });
  assert.deepEqual(r.bloqueos, []);
  assert.equal(r.resultado.facil, false);
  assert.ok(r.resultado.enContra.some((m) => m.codigo === "deuda"));
  assert.ok(r.resultado.enContra.some((m) => m.codigo === "palabras"));
  const socio = { ...cotizar(pedido()), motivos: [...cotizar(pedido()).motivos, { codigo: "cuenta_socio" as const, ok: false, texto: "Cuenta de los socios: no se le cotiza", grupo: "cliente" as const }] };
  const conSocio = payloadDe();
  (conSocio.alquiler as Record<string, unknown>).resultado = socio;
  assert.ok(recalc(leerPayloadAlquiler(conSocio)).bloqueos.some((b) => /socios/.test(b)));
});

test("clienteParaRecalculo: la deuda sale de los motivos guardados", () => {
  assert.equal(clienteParaRecalculo(FICHA, cotizar(pedido(), PALERMO_ODOO, true)).deudaVencida, true);
  assert.equal(clienteParaRecalculo(FICHA, cotizar(pedido(), PALERMO_ODOO, false)).deudaVencida, false);
  assert.equal(clienteParaRecalculo(FICHA, cotizar(pedido(), PALERMO_ODOO, null)).deudaVencida, null);
  assert.equal(clienteParaRecalculo(FICHA, { ...cotizar(pedido()), motivos: [] }).deudaVencida, null);
});

test("bloqueosAlquiler: el peldaño sin confirmar y lo que falta", () => {
  // Adentro, techo de 3 m, pintar hasta 2,9: va en el peldaño y el cliente todavía no dijo.
  const r = cotizar(pedido({ lugar: "adentro", alturaTecho: 3, alturaTrabajo: 2.9, trabajoEnTecho: false }));
  assert.equal(r.armado?.peldano, 0.8);
  assert.ok(bloqueosAlquiler(r, { fecha: LUNES, franja: MANANA }).some((b) => /peldaño/.test(b)));
  const ok = cotizar(pedido({ lugar: "adentro", alturaTecho: 3, alturaTrabajo: 2.9, aceptaPlataforma: true }));
  assert.deepEqual(bloqueosAlquiler(ok, { fecha: LUNES, franja: MANANA }), []);
  assert.ok(bloqueosAlquiler(ok, null).some((b) => /fecha o la franja/.test(b)));
  const sinPiso = cotizar(pedido({ piso: null }));
  assert.ok(bloqueosAlquiler(sinPiso, { fecha: LUNES, franja: MANANA }).some((b) => /Falta un dato/.test(b)));
});

test("textoPlataforma: el peldaño se destaca y aclara que se cobra igual", () => {
  const r = cotizar(pedido({ lugar: "adentro", alturaTecho: 3, alturaTrabajo: 2.9, aceptaPlataforma: true }));
  assert.match(textoPlataforma(r.armado!), /EN EL PELDAÑO de 0,80 m \(a 0,95 m del piso\), un solo tablón/);
  assert.match(textoPlataforma(r.armado!), /Se cobra igual/);
  assert.match(textoPlataforma(cotizar(pedido()).armado!), /Plataforma arriba, a 3,75 m/);
  // En el segundo módulo (fila 19), y sin llegar cómodo al techo.
  const segundo = cotizar(pedido({ lugar: "adentro", alturaTecho: 5, alturaTrabajo: null, trabajoEnTecho: true, aceptaPlataforma: true }));
  assert.match(textoPlataforma(segundo.armado!), /EN EL PELDAÑO de 0,80 m del segundo módulo \(a 2,75 m del piso\).*El techo está a 5 m: no llega a trabajar cómodo en el techo \(se le aclaró al cliente\)/);
  assert.deepEqual(bloqueosAlquiler(segundo, { fecha: LUNES, franja: MANANA }), []);
});

// ── Provincia y el depósito (filas 16 y 17) ────────────────────────────────────────────

/** Lo que guarda la herramienta cuando retira en el depósito: sin flete y con la franja del depósito. */
function payloadDeposito(cambios: Partial<PedidoAlquiler> = {}): Record<string, unknown> {
  const p = pedido({ retiraEnDeposito: true, franja: { tipo: "deposito_manana" }, ...cambios });
  const resultado = cotizarAlquilerSimple(p, { parametros: P, hoy: HOY, feriados: FERIADOS, flete: null, cliente: { ...FICHA, deudaVencida: false } });
  return { alquiler: { pedido: p, resultado, flete: null, entrega: { fecha: p.fecha, franja: p.franja } }, alertas: [], asignacion: null, direccion: "Maipú 2000, Olivos" };
}

test("recalcular: retira en el depósito, sin flete ni método de envío, con el mínimo", () => {
  const p = leerPayloadAlquiler(payloadDeposito());
  assert.equal(p.flete, null);
  // Aunque Odoo no responda: no hay flete que leer.
  for (const fletes of [FLETES, null]) {
    const r = recalc(p, null, { fletes });
    assert.deepEqual(r.bloqueos, []);
    assert.deepEqual(r.avisos, []);
    assert.equal(r.total, 500000);
    assert.equal(r.flete, null);
    assert.equal(r.cotizacion?.flete, null);
    assert.equal(r.cotizacion?.minimoOperativo, 338000);
    assert.deepEqual(r.cotizacion?.franja, { desde: "10:00", hasta: "12:00" });
    const odoo = lineasOrdenAlquilerSimple(r.cotizacion!);
    assert.equal(odoo.neto, 500000);
    assert.equal(odoo.carrierId, null);
    assert.equal(odoo.retiraEnDeposito, true);
    assert.match(r.mensaje!, /retirándolo vos en nuestro depósito de Cucha Cucha 2345, sale \$ 500\.000 \+ IVA/);
    assert.ok(r.mensaje!.endsWith("¿Te lo reservo para retirarlo el lunes 16 de noviembre, de 10 a 12?"));
  }
  // La nota: retira en el depósito, sin flete.
  const r = recalc(p);
  const nota = notaInternaAlquiler({ numero: 7, aprobo: "Tamara", correccion: null, r, direccion: p.direccion, sinCuit: false, avisos: [] });
  assert.match(nota, /<b>Retira en el depósito<\/b> \(Cucha Cucha 2345, CABA\) el lunes 16 de noviembre, de 10 a 12: sin flete/);
  assert.match(nota, /Obra: Maipú 2000, Olivos/);
  // El pedido va como lo dijo (sin pasarlo a minúsculas).
  assert.match(nota, /Cómo llega: Retira en el depósito \(Cucha Cucha 2345, CABA\)/);
  assert.ok(!/\(.*\(CABA\)\)/.test(nota), "sin paréntesis anidados");
  assert.match(nota, /retirando en el depósito \(sin flete\)/);
  assert.equal(Object.fromEntries(datosDelPedido(p.pedido).map((x) => [x.etiqueta, x.valor]))["Cómo llega"], "Retira en el depósito (Cucha Cucha 2345, CABA)");
});

test("recalcular: en el depósito, corregir la fecha a una franja común la pasa a la del depósito; el sábado bloquea", () => {
  const p = leerPayloadAlquiler(payloadDeposito());
  const tarde = recalc(p, { tipo: "fecha", motivo: "prefiere la tarde", franja: { tipo: "tarde" } });
  assert.deepEqual(tarde.entrega, { fecha: LUNES, franja: { tipo: "deposito_tarde" } });
  assert.deepEqual(tarde.bloqueos, []);
  assert.match(tarde.mensaje!, /retirarlo el lunes 16 de noviembre, de 13 a 16\?$/);
  const sabado = recalc(p, { tipo: "fecha", motivo: "el sábado", fecha: "2026-11-14" });
  assert.ok(sabado.bloqueos.some((b) => /el depósito abre de lunes a viernes/.test(b)), sabado.bloqueos.join(" | "));
  // Una franja de una hora no existe en el depósito: no hay entrega y bloquea.
  const hora = recalc(p, { tipo: "fecha", motivo: "a las 10", franja: { tipo: "hora", desde: 10 } });
  assert.equal(hora.entrega, null);
  assert.ok(hora.bloqueos.length > 0);
});

test("bloqueosAlquiler: provincia sin decir si retira en el depósito, o sin poder retirarlo", () => {
  const ctx = (retira: boolean | null) => cotizarAlquilerSimple(pedido({ retiraEnDeposito: retira }), {
    parametros: P, hoy: HOY, feriados: FERIADOS, flete: { tipo: "provincia", lugar: "Olivos" }, cliente: { ...FICHA, deudaVencida: false },
  });
  assert.ok(bloqueosAlquiler(ctx(null), { fecha: LUNES, franja: MANANA }).some((b) => /falta que el cliente diga si lo retira en el depósito/.test(b)));
  assert.ok(bloqueosAlquiler(ctx(false), { fecha: LUNES, franja: MANANA }).some((b) => /no entregamos ni retiramos fuera de CABA/.test(b)));
});

test("recalcular: un presupuesto viejo con un flete del conurbano es provincia, no «fuera de lista»", () => {
  const p = pedido();
  const viejo = { ...payloadDe(p), alquiler: { pedido: p, resultado: cotizar(p), flete: { id: 405, nombre: "OLIVOS", precio: 225600 }, entrega: { fecha: LUNES, franja: MANANA } } };
  const r = recalc(leerPayloadAlquiler(viejo));
  assert.equal(r.resultado.flete?.tipo, "provincia");
  assert.deepEqual(r.resultado.aConfirmar.map((c) => c.codigo), ["deposito"]);
  assert.ok(!r.resultado.enContra.some((m) => m.codigo === "sin_flete"));
  assert.ok(r.bloqueos.some((b) => /provincia/.test(b)));
  assert.ok(r.avisos.some((a) => /OLIVOS es del conurbano/.test(a)));
});

test("recalcular: el retiro en el depósito, con `ahora`, bloquea si no llega a las 24 h", () => {
  const p = leerPayloadAlquiler(payloadDeposito());
  // El viernes 13 a las 10 es el lunes 16 para el payload: con «ahora» el domingo 15 a las 12, no llega.
  const r = recalc(p, null, { ahora: new Date("2026-11-15T15:00:00Z") });
  assert.ok(r.bloqueos.some((b) => /24 h de anticipación/.test(b)), r.bloqueos.join(" | "));
  assert.deepEqual(recalc(p, null, { ahora: new Date("2026-11-14T15:00:00Z") }).bloqueos, []);
});

test("leerPayloadAlquiler: un pedido de antes del 12/11 a la tarde (aceptaPeldano, sin la modalidad)", () => {
  const viejo = { ...pedido({ lugar: "adentro", alturaTecho: 3, alturaTrabajo: 2.9 }) } as Record<string, unknown>;
  delete viejo.aceptaPlataforma;
  delete viejo.retiraEnDeposito;
  viejo.aceptaPeldano = true;
  const p = leerPayloadAlquiler(payloadDe(viejo as PedidoAlquiler));
  assert.equal(p.pedido.aceptaPlataforma, true);
  assert.equal(p.pedido.retiraEnDeposito, null);
  assert.deepEqual(recalc(p).bloqueos, []);
});

// ── La franja de una hora ──────────────────────────────────────────────────────────────

test("franja de una hora: el recargo va en el mensaje y en Odoo, y suma lo mismo", () => {
  const p = pedido({ franja: { tipo: "hora", desde: 10 } });
  const r = recalc(leerPayloadAlquiler(payloadDe(p)));
  assert.deepEqual(r.bloqueos, []);
  assert.equal(r.precio?.recargoFranja, 100000);
  assert.equal(r.total, 600000);
  assert.ok(r.mensaje?.includes("20 %"));
  assert.deepEqual(franjaParaOdoo({ tipo: "hora", desde: 9.5 }), { desde: "09:30", hasta: "10:30" });
  const o = lineasOrdenAlquilerSimple(r.cotizacion!);
  assert.equal(o.neto, 600000);
  assert.ok(o.lineas.some((l) => l.productId === PRODUCTO_RECARGO_FRANJA && l.precioUnitario === 100000));
});

// ── Corregir ───────────────────────────────────────────────────────────────────────────

test("validarCorreccionAlquiler: motivo obligatorio y lo de cada tipo", () => {
  assert.match(validarCorreccionAlquiler({ tipo: "precio", motivo: "", total: 450000 })!, /motivo/);
  assert.match(validarCorreccionAlquiler({ tipo: "precio", motivo: "cliente frecuente" })!, /total/);
  assert.equal(validarCorreccionAlquiler({ tipo: "precio", motivo: "cliente frecuente", total: 450000 }), null);
  assert.match(validarCorreccionAlquiler({ tipo: "piezas", motivo: "lo pidió" })!, /módulos/);
  assert.match(validarCorreccionAlquiler({ tipo: "piezas", motivo: "lo pidió", modulosPorTorre: 1.5 })!, /módulos de alto/);
  assert.equal(validarCorreccionAlquiler({ tipo: "piezas", motivo: "lo pidió", torres: 2 }), null);
  assert.match(validarCorreccionAlquiler({ tipo: "fecha", motivo: "pidió el martes" })!, /fecha o la franja/);
  assert.match(validarCorreccionAlquiler({ tipo: "fecha", motivo: "pidió el martes", fecha: "17/11" })!, /AAAA-MM-DD/);
  assert.equal(validarCorreccionAlquiler({ tipo: "fecha", motivo: "pidió el martes", fecha: "2026-11-17" }), null);
  assert.match(validarCorreccionAlquiler({ tipo: "texto", motivo: "otro tono", texto: " " })!, /texto/);
  assert.equal(CORRECCION_EN_BASE.fecha, "otro");
});

test("corregir el total para arriba: la diferencia va al mínimo operativo y Odoo suma lo mismo", () => {
  const r = recalc(leerPayloadAlquiler(payloadDe()), { tipo: "precio", motivo: "lejos del depósito", total: 520000 });
  assert.deepEqual(r.bloqueos, []);
  assert.equal(r.total, 520000);
  assert.equal(r.precio?.minimoOperativo, 217600);
  assert.equal(lineasOrdenAlquilerSimple(r.cotizacion!).neto, 520000);
  // Del mínimo no se habla nunca (JS, 13/11), con o sin total a mano.
  assert.ok(!/mínimo del servicio|es el mínimo/i.test(r.mensaje ?? ""), r.mensaje ?? "");
  assert.ok(!/mínimo del servicio|es el mínimo/i.test(recalc(leerPayloadAlquiler(payloadDe())).mensaje ?? ""));
  assert.ok(r.mensaje?.includes("$ 520.000 + IVA"));
  assert.ok(r.mensaje?.includes("$ 17.333 + IVA"), "la renovación por día sale del total nuevo");
});

test("corregir el total para abajo: primero se achica el mínimo, después las piezas en proporción", () => {
  const p = leerPayloadAlquiler(payloadDe());
  const a = recalc(p, { tipo: "precio", motivo: "descuento acordado", total: 450000 });
  assert.equal(a.precio?.minimoOperativo, 147600);
  assert.equal(lineasOrdenAlquilerSimple(a.cotizacion!).neto, 450000);
  // 250.000: no alcanza con sacar el mínimo (302.400): las piezas bajan; el flete queda igual.
  const b = recalc(p, { tipo: "precio", motivo: "descuento grande", total: 250000 });
  assert.deepEqual(b.bloqueos, []);
  assert.equal(b.precio?.minimoOperativo, 0);
  assert.equal(b.precio?.flete, 140400);
  const neto = lineasOrdenAlquilerSimple(b.cotizacion!).neto;
  assert.ok(Math.abs(neto - 250000) <= 1, String(neto));
  // Menos que el flete, no.
  const c = recalc(p, { tipo: "precio", motivo: "error", total: 100000 });
  assert.ok(c.bloqueos.some((x) => /más que el flete/.test(x)));
});

test("corregir el total con franja de una hora: el recargo se recalcula sobre el total nuevo", () => {
  const p = leerPayloadAlquiler(payloadDe(pedido({ franja: { tipo: "hora", desde: 10 } })));
  const r = recalc(p, { tipo: "precio", motivo: "redondeo", total: 450000 });
  assert.equal(r.precio?.recargoFranja, 90000);
  assert.equal(r.total, 540000);
  assert.equal(lineasOrdenAlquilerSimple(r.cotizacion!).neto, 540000);
});

test("precioConTotal: el mismo total no cambia nada", () => {
  const pr = cotizar(pedido()).precio!;
  const igual = precioConTotal(pr, 500000, 20);
  assert.equal(igual.base, 500000);
  assert.equal(igual.minimoOperativo, 197600);
  assert.deepEqual(igual.lineas.map((l) => l.importe), pr.lineas.map((l) => l.importe));
});

test("corregir cantidades: otra torre pasa por el motor (y el mínimo se achica)", () => {
  const r = recalc(leerPayloadAlquiler(payloadDe()), { tipo: "piezas", motivo: "quiere dos torres", torres: 2 });
  assert.deepEqual(r.bloqueos, []);
  assert.equal(r.resultado.armado?.torres, 2);
  assert.equal(r.resultado.armado?.modulosPorTorre, 2);
  // 2 torres: 324.000 de material + 140.400 de flete = 464.400; el mínimo completa 35.600.
  assert.equal(r.precio?.minimoOperativo, 35600);
  assert.equal(r.total, 500000);
});

test("corregir cantidades: con 1 módulo no llega a 5 m y bloquea", () => {
  const r = recalc(leerPayloadAlquiler(payloadDe()), { tipo: "piezas", motivo: "con uno alcanza", modulosPorTorre: 1 });
  assert.ok(r.bloqueos.some((b) => /no le sirve/i.test(b)), r.bloqueos.join(" | "));
});

test("corregir cantidades: más de 10 módulos pasa el tope y bloquea", () => {
  const r = recalc(leerPayloadAlquiler(payloadDe()), { tipo: "piezas", motivo: "muchas torres", torres: 6 });
  assert.ok(r.bloqueos.some((b) => /tope/.test(b)), r.bloqueos.join(" | "));
});

test("corregir la fecha: el mensaje y Odoo usan la nueva; un domingo bloquea", () => {
  const p = leerPayloadAlquiler(payloadDe());
  const r = recalc(p, { tipo: "fecha", motivo: "prefiere el martes", fecha: "2026-11-17", franja: { tipo: "tarde" } });
  assert.deepEqual(r.bloqueos, []);
  assert.ok(r.mensaje?.includes("martes 17 de noviembre, de 13 a 16"));
  assert.equal(r.cotizacion?.entrega, "2026-11-17");
  assert.deepEqual(r.cotizacion?.franja, { desde: "13:00", hasta: "16:00" });
  const domingo = recalc(p, { tipo: "fecha", motivo: "prefiere el domingo", fecha: "2026-11-15" });
  assert.ok(domingo.bloqueos.some((b) => /domingo/.test(b)));
  // Pasar a una franja de una hora suma el recargo.
  const hora = recalc(p, { tipo: "fecha", motivo: "a las 10", franja: { tipo: "hora", desde: 10 } });
  assert.equal(hora.total, 600000);
});

test("corregir el texto: sale el texto de la persona y los números no cambian", () => {
  const r = recalc(leerPayloadAlquiler(payloadDe()), { tipo: "texto", motivo: "más corto", texto: "Te paso el presupuesto: $ 500.000 + IVA." });
  assert.equal(r.mensaje, "Te paso el presupuesto: $ 500.000 + IVA.");
  assert.equal(r.total, 500000);
});

test("aplicarCorreccionAlquiler: no toca el original", () => {
  const p = leerPayloadAlquiler(payloadDe(pedido({ largoACubrir: 6 })));
  const armado = cotizar(p.pedido).armado;
  const { pedido: nuevo } = aplicarCorreccionAlquiler(p, armado, { tipo: "piezas", motivo: "una sola", torres: 1 });
  assert.equal(nuevo.torres, 1);
  assert.equal(nuevo.largoACubrir, null);
  assert.equal(p.pedido.largoACubrir, 6);
  assert.equal(p.pedido.piezas, null);
});

// ── La tarjeta y la nota ───────────────────────────────────────────────────────────────

test("datosDelPedido: lo que dijo el cliente, corto", () => {
  const d = Object.fromEntries(datosDelPedido(pedido()).map((x) => [x.etiqueta, x.valor]));
  assert.equal(d.Lugar, "Afuera");
  assert.equal(d.Trabajo, "Hasta 5 m");
  assert.equal(d.Espacio, "De sobra");
  assert.equal(d.Piso, "Liso");
  const adentro = Object.fromEntries(datosDelPedido(pedido({ lugar: "adentro", alturaTecho: 3, espacioDeSobra: false, anchoLibre: 1, largoLibre: 2 })).map((x) => [x.etiqueta, x.valor]));
  assert.equal(adentro.Techo, "3 m");
  assert.equal(adentro.Espacio, "1 m de ancho × 2 m de largo");
  assert.equal(d["Cómo llega"], "Se lo llevamos (envío)");
});

test("notaInternaAlquiler: quién aprobó, la corrección, el total y el aviso sin CUIT, escapado", () => {
  const r = recalc(leerPayloadAlquiler(payloadDe()), { tipo: "precio", motivo: "cliente <frecuente>", total: 450000 });
  const nota = notaInternaAlquiler({ numero: 12, aprobo: "Joaquín", correccion: { tipo: "precio", motivo: "cliente <frecuente>" }, r, direccion: "Gorriti 4500", sinCuit: true, avisos: [] });
  assert.match(nota, /cotización #12/);
  assert.match(nota, /aprobado por Joaquín con una corrección \(total\): cliente &lt;frecuente&gt;/);
  assert.match(nota, /\$ 450\.000 \+ IVA/);
  assert.match(nota, /sin CUIT/);
  assert.match(nota, /lunes 16 de noviembre, de 8 a 12, en Gorriti 4500/);
  assert.match(nota, /documentos/);
});

test("una cotización armada antes del 13/11 (sin los días): vale como 30 días y no se bloquea", () => {
  const viejo = payloadDe();
  const alq = (viejo as { alquiler: { pedido: Record<string, unknown> } }).alquiler;
  delete alq.pedido.dias;
  const r = recalc(leerPayloadAlquiler(viejo));
  assert.deepEqual(r.bloqueos, []);
  assert.equal(r.cotizacion?.fin, "2026-12-16");
  assert.match(r.mensaje ?? "", /El servicio por los 30 días que lo necesitás/);
});

test("cotizacionParaOdoo: las piezas del motor con su precio y el fin a los días que pidió (30 si no los dijo)", () => {
  const pr = cotizar(pedido()).precio!;
  assert.equal(cotizacionParaOdoo(pr, { carrierId: 380, nombre: "PALERMO", precio: 140400 }, { fecha: LUNES, franja: MANANA }, 7).fin, "2026-11-23");
  const c = cotizacionParaOdoo(pr, { carrierId: 380, nombre: "PALERMO", precio: 140400 }, { fecha: LUNES, franja: MANANA });
  assert.deepEqual(c.piezas.map((x) => x.codigo), ["modulo_130x250", "baranda_130", "tablon_250", "ruedas_juego"]);
  assert.equal(c.minimoOperativo, 197600);
  assert.equal(c.recargoFranja, 0);
  assert.equal(c.fin, "2026-12-16");
});

test("fleteDeHoy: el barrio sale de lo que guardó Tomás y el precio de hoy", () => {
  const guardado = cotizar(pedido());
  const f = fleteDeHoy([{ ...PALERMO_ODOO, precio: 150000 }], { carrierId: 380, nombre: "PALERMO", precio: 140400 }, guardado);
  assert.deepEqual(f.alquiler, { tipo: "lista", barrio: "Palermo", monto: 150000, metodoEnvioId: 380 });
  assert.equal(f.odoo?.precio, 150000);
  assert.equal(fleteDeHoy(FLETES, null, guardado).alquiler.tipo, "fuera_de_lista");
});

test("entregaDelPresupuesto: manda la que le llegó al cliente (con la corrección de fecha), si no la de Tomás", () => {
  const deTomas = { fecha: LUNES, franja: MANANA };
  const corregida = { fecha: "2026-11-17", franja: { tipo: "hora", desde: 10 } };
  assert.deepEqual(entregaDelPresupuesto({ alquiler: { entrega: deTomas } }), deTomas);
  assert.deepEqual(entregaDelPresupuesto({ alquiler: { entrega: deTomas }, envioAlquiler: { entrega: corregida } }), corregida);
  // Un envío viejo, sin la entrega guardada: queda la de Tomás.
  assert.deepEqual(entregaDelPresupuesto({ alquiler: { entrega: deTomas }, envioAlquiler: { texto: "…" } }), deTomas);
  assert.equal(entregaDelPresupuesto({ alquiler: { entrega: { fecha: LUNES, franja: { tipo: "rara" } } } }), null);
  assert.equal(entregaDelPresupuesto(null), null);
});
