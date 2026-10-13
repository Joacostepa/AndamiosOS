import { test } from "node:test";
import assert from "node:assert/strict";
import { medidasDe } from "./medidas.ts";

// Textos reales de x_estructura_actual y de las OTs (12/10/2026).

test("A x B x C H: largo y ancho en cualquier orden, C es el alto", () => {
  assert.deepEqual(medidasDe("Pantalla 9m x 1,25m x 2,50m H a 90°"), {
    medidas: { largo: 9, ancho: 1.25, alto: 2.5, estimadas: false },
    tipo: "pantalla_proteccion",
  });
  assert.deepEqual(medidasDe("Pantalla 1.25m x 10m x 3m alt").medidas, { largo: 10, ancho: 1.25, alto: 3, estimadas: false });
});

test("A x B de alto", () => {
  assert.deepEqual(medidasDe("Estructura de 45m. x 19 de alto", { tipo: "estructura_pantalla" }), {
    medidas: { largo: 45, ancho: 1.1, alto: 19, estimadas: false },
    tipo: "estructura_pantalla",
  });
});

test("alto suelto y largo del permiso", () => {
  assert.deepEqual(medidasDe("Torre de 12 mts de altura", { tipo: "torre", metrosLineales: 3 }).medidas, { largo: 3, ancho: 1.1, alto: 12, estimadas: false });
});

test("sin medidas: se estima por tipo y se avisa", () => {
  assert.deepEqual(medidasDe("Pantalla sobre vereda", {}), { medidas: { largo: 10, ancho: 1.25, alto: 3, estimadas: true }, tipo: "pantalla_proteccion" });
  assert.deepEqual(medidasDe(null, { tipo: "torre" }).medidas, { largo: 10, ancho: 1.1, alto: 10, estimadas: true });
  assert.deepEqual(medidasDe("", { tipo: "cualquiera" }), { medidas: { largo: 10, ancho: 1.1, alto: 8, estimadas: true }, tipo: null });
});

test("un texto mal leído no dibuja un rascacielos", () => {
  assert.equal(medidasDe("Pantalla 1.25m x 300m x 90m H").medidas.largo, 60);
  assert.equal(medidasDe("Pantalla 1.25m x 300m x 90m H").medidas.alto, 60);
});
