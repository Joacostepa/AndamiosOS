import { test } from "node:test";
import assert from "node:assert/strict";
import { calleYAltura, variantesDireccion } from "./direccion.ts";

test("calle y altura: corta el nombre del edificio, el barrio y la ciudad", () => {
  assert.equal(calleYAltura("Ayacucho 665 - Colegio La Salle"), "Ayacucho 665");
  assert.equal(calleYAltura("Av. Callao 5 (CABA)"), "Av. Callao 5");
  assert.equal(calleYAltura("Riobamba 653, Balvanera, CABA"), "Riobamba 653");
  assert.equal(calleYAltura("Navarro 2369 Villa Devoto CABA"), "Navarro 2369");
  assert.equal(calleYAltura("Esmeralda 570 C.A.B.A."), "Esmeralda 570");
  assert.equal(calleYAltura("Núñez 3500 Núñez"), "Núñez 3500");
  assert.equal(calleYAltura("Chile 865"), "Chile 865");
});

test("variantes: tal cual, después limpia y sin Av./Dr., sin repetir", () => {
  assert.deepEqual(variantesDireccion("Av. Callao 5 - Edificio Mirador"), ["Av. Callao 5 - Edificio Mirador", "Av. Callao 5", "Callao 5"]);
  assert.deepEqual(variantesDireccion("Dr. Tomás Manuel de Anchorena 1180"), ["Dr. Tomás Manuel de Anchorena 1180", "Tomás Manuel de Anchorena 1180"]);
  assert.deepEqual(variantesDireccion("Chile 865"), ["Chile 865"]);
  // Fuera de CABA la cola no se toca hasta probar tal cual: la primera variante es la original.
  assert.equal(variantesDireccion("Riobamba 651, Lomas de Zamora")[0], "Riobamba 651, Lomas de Zamora");
});
