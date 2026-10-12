// aplicarCambios y normalizarBorrador: cómo se mezcla un cambio del modelo con el borrador, y
// cómo se lee un borrador guardado con una versión vieja (handoff, «Campos nuevos del borrador»).

import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarCambios, borradorVacio, normalizarBorrador } from "./borrador.ts";

test("aplicarCambios: los objetos se mezclan campo por campo", () => {
  const d = borradorVacio();
  d.cliente.razonSocial = "ETEC OBRAS S.A";
  const r = aplicarCambios(d, { cliente: { cuit: "30-71234567-8" } });
  assert.equal(r.cliente.razonSocial, "ETEC OBRAS S.A");
  assert.equal(r.cliente.cuit, "30-71234567-8");
  assert.equal(d.cliente.cuit, null, "no toca el original");
});

test("aplicarCambios: las listas se reemplazan enteras y null borra", () => {
  const d = { ...borradorVacio(), seccion2: [{ titulo: "A", contenido: "a" }, { titulo: "B", contenido: "b" }], referencia: "Bandeja 10 m.l." };
  const r = aplicarCambios(d, { seccion2: [{ titulo: "C", contenido: "c" }], referencia: null });
  assert.deepEqual(r.seccion2, [{ titulo: "C", contenido: "c" }]);
  assert.equal(r.referencia, null);
});

test("aplicarCambios: lo desconocido y lo undefined se ignoran", () => {
  const d = borradorVacio();
  const r = aplicarCambios(d, { inventado: 1, modelo: undefined, cliente: { otro: "x" } } as Record<string, unknown>);
  assert.equal("inventado" in r, false);
  assert.equal(r.modelo, null);
  assert.equal("otro" in r.cliente, false);
});

test("aplicarCambios: un objeto sobre un null lo reemplaza", () => {
  const r = aplicarCambios({ planPagos: null as unknown } as Record<string, unknown>, { planPagos: { cuotas: [] } });
  assert.deepEqual(r.planPagos, { cuotas: [] });
});

test("normalizarBorrador: un borrador viejo recibe los campos nuevos con su default", () => {
  const viejo = { cliente: { razonSocial: "Consorcio Riobamba 653" }, modelo: "B" };
  const n = normalizarBorrador(viejo);
  assert.equal(n.cliente.razonSocial, "Consorcio Riobamba 653");
  assert.equal(n.cliente.esNuevo, false);
  assert.equal(n.modelo, "B");
  assert.deepEqual(n.opcionalesDescartados, []);
  assert.deepEqual(n.condiciones, borradorVacio().condiciones);
  assert.deepEqual(n.render, { eleccion: null, renderId: null, path: null });
});

test("normalizarBorrador: calculos, decisiones y perfil comercial se toman tal cual (claves libres)", () => {
  const n = normalizarBorrador({
    calculos: { bandeja: { metros: 12 } },
    decisiones: { esquina: "las dos caras" },
    perfilComercial: { etapa: "licitación" },
  });
  assert.deepEqual(n.calculos, { bandeja: { metros: 12 } });
  assert.deepEqual(n.decisiones, { esquina: "las dos caras" });
  assert.deepEqual(n.perfilComercial, { etapa: "licitación" });
});

test("normalizarBorrador: null o basura da un borrador vacío", () => {
  assert.deepEqual(normalizarBorrador(null), borradorVacio());
  assert.deepEqual(normalizarBorrador(undefined), borradorVacio());
});
