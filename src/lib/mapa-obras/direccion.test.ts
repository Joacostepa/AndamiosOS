import { test } from "node:test";
import assert from "node:assert/strict";
import { calleDeDireccion, direccionCorta, normalizarCalle, tieneAltura } from "./direccion.ts";

// Casos reales de x_direccion_obra (12/10/2026).

test("dirección corta: la etiqueta del mapa", () => {
  assert.equal(direccionCorta("AV SANTA FE 1476 CABA"), "Av. Santa Fe 1476");
  assert.equal(direccionCorta("Palacio Sarmiento, Pje. Pizzurno 935, CABA"), "Pje. Pizzurno 935");
  assert.equal(direccionCorta("RP58, Km 10,5, Canning, Provincia de Buenos Aires"), "RP58, Km 10,5");
  assert.equal(direccionCorta("INGENIERIO BUDGE PVCIA BS AS (RETIRAN ELLOS)"), "Ing. Budge");
  assert.equal(direccionCorta("Bolívar 1887 esq. Martin García"), "Bolívar 1887 esq. Martin García");
  assert.equal(direccionCorta("Av. Gral. Las Heras 2670 (Capilla Nuestra Señora del Huerto, Hospital Rivadavia)"), "Av. Gral. Las Heras 2670");
  assert.equal(direccionCorta("Aristóbulo del Valle 1496 - Lado Jovellanos"), "Aristóbulo del Valle 1496");
  assert.equal(direccionCorta("Paraná, esquina Corrientes"), "Paraná esq. Corrientes");
  assert.equal(direccionCorta("PASEO DE LA INFANTA 1200"), "Paseo de la Infanta 1200");
  assert.equal(direccionCorta(""), "Sin dirección");
  assert.equal(direccionCorta(null), "Sin dirección");
});

test("la calle de la dirección, para buscarla en OSM", () => {
  assert.equal(calleDeDireccion("AV SANTA FE 1476 CABA"), "santa fe");
  assert.equal(calleDeDireccion("Palacio Sarmiento, Pje. Pizzurno 935, CABA"), "pizzurno");
  assert.equal(calleDeDireccion("Bolívar 1887 esq. Martin García"), "bolivar");
  assert.equal(calleDeDireccion("Av. Gral. Las Heras 2670 (Capilla Nuestra Señora del Huerto)"), "las heras");
  assert.equal(calleDeDireccion("25 de Mayo 1234"), "25 de mayo");
  assert.equal(calleDeDireccion("Av. 9 de Julio 1200"), "9 de julio");
  assert.equal(calleDeDireccion("Paraná esq. Corrientes"), "parana");
  assert.equal(calleDeDireccion("RP58, Km 10,5, Canning, Provincia de Buenos Aires"), "rp58");
  assert.equal(calleDeDireccion("INGENIERIO BUDGE PVCIA BS AS (RETIRAN ELLOS)"), "budge pvcia bs as");
  assert.equal(calleDeDireccion("RETIRA CUCHA CUCHA 2345 - DEPOSITO ANDAMIOS BUENOS AIRES"), "cucha cucha");
  assert.equal(normalizarCalle("Avenida General Las Heras"), "las heras");
});

test("¿tiene altura? Sin número y sin esquina, el punto es el centro de la localidad", () => {
  assert.equal(tieneAltura("INGENIERIO BUDGE PVCIA BS AS (RETIRAN ELLOS)"), false);
  assert.equal(tieneAltura("Barrio Norte (frente al 1200)"), false);
  assert.equal(tieneAltura("AV SANTA FE 1476 CABA"), true);
  assert.equal(tieneAltura("Palacio Sarmiento, Pje. Pizzurno 935, CABA"), true);
  assert.equal(tieneAltura("RP58, Km 10,5, Canning, Provincia de Buenos Aires"), true);
  assert.equal(tieneAltura("Paraná esq. Corrientes"), true);
});
