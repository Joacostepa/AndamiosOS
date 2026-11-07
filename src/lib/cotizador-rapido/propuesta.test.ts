import { test } from "node:test";
import assert from "node:assert/strict";
import { borradorVacio } from "../asistente/borrador.ts";
import { formularioDesdeBorrador } from "./formulario.ts";
import { aplicarPropuesta } from "./propuesta.ts";
import type { PropuestaIA } from "./interpretar.ts";

const vacia = (): PropuestaIA => ({ tipo: null, s0: null, campos: [], filas: [], nota: null });

test("el alta pegada llena los vacíos y marca lo deducido", () => {
  const f = formularioDesdeBorrador(borradorVacio());
  const p: PropuestaIA = {
    ...vacia(), tipo: "bandeja",
    campos: [
      { campo: "razonSocial", valor: "Martín Ferreyra", cita: "Razón social: Martín Ferreyra", deducido: false },
      { campo: "direccion", valor: "Florida 375", cita: "Dirección de la obra: Florida 375, CABA", deducido: false },
      { campo: "alturaBandeja", valor: "3", cita: "bandeja estándar", deducido: true },
    ],
  };
  const r = aplicarPropuesta(f, p, "a");
  assert.equal(r.formulario.cliente.razonSocial, "Martín Ferreyra");
  assert.equal(r.formulario.obra.direccion, "Florida 375");
  assert.equal(r.formulario.ia.alturaBandeja.deducido, true);
  assert.equal(r.completados, 3);
  assert.equal(r.cambios.length, 0);
});

test("una corrección no pisa: vuelve como cambio para aplicar", () => {
  const f = formularioDesdeBorrador(borradorVacio());
  f.bandeja.metros = 25.62;
  const p: PropuestaIA = {
    ...vacia(),
    campos: [
      { campo: "metros", valor: "20", cita: "sólo 20 m", deducido: false },
      { campo: "syh", valor: "no", cita: "sin técnico", deducido: false },
    ],
  };
  const r = aplicarPropuesta(f, p, "b");
  assert.equal(r.formulario.bandeja.metros, 25.62);
  assert.equal(r.cambios.length, 2);
  const aplicado = r.cambios.reduce((x, c) => c.aplicar(x), r.formulario);
  assert.equal(aplicado.bandeja.metros, 20);
  assert.equal(aplicado.syh, "no");
});

test("la lista de precios suma renglones; un ajuste a uno existente se propone", () => {
  const f = formularioDesdeBorrador(borradorVacio());
  f.tipo = "desglosado";
  f.desglose.filas = [{ id: "manual:cr-x", concepto: "Mano de obra de armado y desarme", cantidad: 1, precio: 3_855_000, porPeriodo: false, seccion: "base", producto: "estructura_tubular" }];
  const p: PropuestaIA = {
    ...vacia(),
    filas: [
      { concepto: "Mano de obra de armado y desarme", monto: 5_204_250, porPeriodo: false, reemplaza: "Mano de obra de armado y desarme" },
      { concepto: "Traslado de envío", monto: 450_000, porPeriodo: false, reemplaza: null },
    ],
  };
  const r = aplicarPropuesta(f, p, "c");
  assert.equal(r.formulario.desglose.filas.length, 2);
  assert.equal(r.formulario.desglose.filas[1].producto, "traslado");
  assert.equal(r.cambios.length, 1);
  assert.equal(r.cambios[0].aplicar(r.formulario).desglose.filas[0].precio, 5_204_250);
});
