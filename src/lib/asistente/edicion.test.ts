// Editar un presupuesto que ya está en Odoo (Joaquín, 06/10): qué cambia contra la orden, qué se
// copia de ella y quién puede editarla.

import { test } from "node:test";
import assert from "node:assert/strict";
import { compararLineas, comparablesDelMotor, lineasDesdeOdoo, puedeEditar, textoCambios, type LineaComparable } from "./edicion.ts";
import type { LineaVenta } from "../odoo/comercial.ts";
import type { ProductoOdoo } from "../parametros-cotizacion/tipos.ts";

const c = (productId: number, descripcion: string, cantidad: number, precioUnitario: number, descuentoPct = 0): LineaComparable =>
  ({ productId, descripcion, cantidad, precioUnitario, descuentoPct });

const PRODUCTOS = [
  { clave: "bandeja", product_id: 10, nombre: "Bandeja", unidad: "m.l.", is_rental: true, unica_vez: false, uso: null, activo: true, verificado_at: null, verificado_ok: true, verificado_nombre: null },
  { clave: "flete", product_id: 20, nombre: "Flete", unidad: null, is_rental: false, unica_vez: true, uso: null, activo: true, verificado_at: null, verificado_ok: true, verificado_nombre: null },
] satisfies ProductoOdoo[];

test("de 12 a 15 m: cambia la bandeja y el resto queda igual", () => {
  const antes = [c(10, "Bandeja de protección — 12 m.l.", 12, 140_000), c(20, "Flete", 1, 90_000)];
  const despues = [c(10, "Bandeja de protección — 15 m.l.", 15, 140_000), c(20, "Flete", 1, 90_000)];
  const r = compararLineas(antes, despues);
  assert.equal(r.iguales, 1);
  assert.equal(r.cambiadas.length, 1);
  assert.deepEqual(textoCambios(r), ["Cambia: Bandeja de protección: 12 × $ 140.000 = $ 1.680.000 → 15 × $ 140.000 = $ 2.100.000"]);
});

test("lo cargado a mano en Odoo que no está en lo nuevo, sale; lo nuevo entra", () => {
  const r = compararLineas([c(10, "Bandeja", 12, 140_000), c(20, "Flete", 1, 90_000)], [c(10, "Bandeja", 12, 140_000), c(30, "Memoria de cálculo", 1, 1_250_000)]);
  assert.deepEqual(textoCambios(r), ["Sale: Flete ($ 90.000)", "Entra: Memoria de cálculo ($ 1.250.000)"]);
});

test("dos líneas del mismo producto se emparejan por descripción", () => {
  const antes = [c(5, "MO armado", 2, 300_000), c(5, "MO desarme", 1, 300_000)];
  const r = compararLineas(antes, [c(5, "MO desarme", 1, 300_000), c(5, "MO armado", 3, 300_000)]);
  assert.equal(r.iguales, 1);
  assert.equal(r.cambiadas[0].antes.descripcion, "MO armado");
});

test("las líneas de una orden se copian tal cual, con su producto aunque no esté en la tabla", () => {
  const lineas: LineaVenta[] = [
    { id: 1, productoId: 10, producto: "Bandeja", descripcion: "Bandeja 12 m.l.", cantidad: 12, precioUnitario: 140_000, descuentoPct: 10, subtotal: 1_512_000, opcional: false, alquiler: true, tipo: "linea" },
    { id: 2, productoId: 99, producto: "Cartel", descripcion: "Cartel de obra", cantidad: 1, precioUnitario: 50_000, descuentoPct: 0, subtotal: 50_000, opcional: false, alquiler: false, tipo: "linea" },
    { id: 3, productoId: 20, producto: "Flete", descripcion: "Flete", cantidad: 1, precioUnitario: 90_000, descuentoPct: 0, subtotal: 90_000, opcional: true, alquiler: false, tipo: "linea" },
    { id: 4, productoId: null, producto: null, descripcion: "OPCIONALES", cantidad: 0, precioUnitario: 0, descuentoPct: 0, subtotal: 0, opcional: false, alquiler: false, tipo: "seccion" },
  ];
  const r = lineasDesdeOdoo(lineas, PRODUCTOS, "S02700");
  assert.deepEqual(r.lineas.map((l) => [l.producto, l.seccion, l.importe]), [["bandeja", "base", 1_512_000], ["odoo:99", "base", 50_000], ["flete", "opcional", 90_000]]);
  assert.deepEqual(r.lineas[1].productoOdoo, { id: 99, alquiler: false });
  assert.deepEqual(r.sinCopiar, ["Sección: «OPCIONALES»"]);
  // Vuelta: lo copiado, comparado con la orden, no cambia nada.
  const vuelta = compararLineas(
    lineas.filter((l) => l.tipo === "linea" && !l.opcional).map((l) => c(l.productoId!, l.descripcion, l.cantidad, l.precioUnitario, l.descuentoPct)),
    comparablesDelMotor(r.lineas, PRODUCTOS),
  );
  assert.deepEqual(textoCambios(vuelta), []);
});

const orden = { numero: "S02700", estadoOdoo: "draft", tecnicoId: 7, vendedorId: 70, tecnico: "Gabriel Stepansky", vendedor: "Sandra" };

test("propia: la edita; ajena: sólo un admin", () => {
  assert.deepEqual(puedeEditar(orden, { tecnicoEmployeeId: 7, vendedorUserId: 70 }, false), { ok: true, ajena: false });
  const jorge = puedeEditar(orden, { tecnicoEmployeeId: 8, vendedorUserId: 80 }, false);
  assert.equal(jorge.ok, false);
  assert.match(!jorge.ok ? jorge.motivo : "", /Gabriel Stepansky \/ Sandra.*sólo Joaquín/);
  assert.deepEqual(puedeEditar(orden, { tecnicoEmployeeId: 1, vendedorUserId: 2 }, true), { ok: true, ajena: true });
});

test("confirmada o cancelada no se edita, ni siquiera un admin", () => {
  assert.equal(puedeEditar({ ...orden, estadoOdoo: "sale" }, { tecnicoEmployeeId: 7, vendedorUserId: 70 }, true).ok, false);
  assert.equal(puedeEditar({ ...orden, estadoOdoo: "cancel" }, { tecnicoEmployeeId: 7, vendedorUserId: 70 }, true).ok, false);
  assert.equal(puedeEditar({ ...orden, estadoOdoo: "sent" }, { tecnicoEmployeeId: 7, vendedorUserId: 70 }, false).ok, true);
});
