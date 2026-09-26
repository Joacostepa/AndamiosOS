// El pedacito que muestra el buscador de conversaciones (Joaquín, 26/09).

import { test } from "node:test";
import assert from "node:assert/strict";
import { palabrasDeBusqueda, recortarFragmento, type Tramo } from "./busqueda.ts";

const texto = (t: Tramo[] | null) => (t ?? []).map((x) => (x.marca ? `[${x.t}]` : x.t)).join("");

test("marca la palabra sin distinguir acentos ni mayúsculas, y respeta cómo estaba escrita", () => {
  const t = recortarFragmento("La gestoría del permiso bajó a $ 350.000.", "GESTORIA");
  assert.equal(texto(t), "La [gestoría] del permiso bajó a $ 350.000.");
});

test("marca todas las palabras buscadas y saca el markdown", () => {
  const t = recortarFragmento("Traje la S01917: **Fernando Mena – Riobamba 651**, del 18/06/2026.", "riobamba fernando");
  assert.equal(texto(t), "Traje la S01917: [Fernando] Mena – [Riobamba] 651, del 18/06/2026.");
});

test("en un mensaje largo recorta alrededor de la coincidencia, cortando en espacios", () => {
  const largo = `${"palabra ".repeat(40)}acá está la concertina perimetral ${"después ".repeat(40)}`;
  const t = recortarFragmento(largo, "concertina", 60)!;
  const plano = texto(t);
  assert.ok(plano.startsWith("…") && plano.endsWith("…"), plano);
  assert.match(plano, /\[concertina\]/);
  // No corta una palabra al medio: arranca y termina en palabras enteras.
  assert.match(plano.slice(1, -1), /^(palabra|acá) .*(después|perimetral)$/);
  assert.ok(plano.length <= 60 + 2 + 2);
});

test("la ñ y las mayúsculas acentuadas no corren las posiciones", () => {
  const t = recortarFragmento("AÑO 2026: ÁLVAREZ THOMAS 2810", "alvarez");
  assert.equal(texto(t), "AÑO 2026: [ÁLVAREZ] THOMAS 2810");
});

test("sin coincidencia o sin palabras, no hay pedacito", () => {
  assert.equal(recortarFragmento("Nada que ver.", "riobamba"), null);
  assert.equal(recortarFragmento("Nada que ver.", "   "), null);
  assert.deepEqual(palabrasDeBusqueda("  Gestoría   Riobamba "), ["gestoria", "riobamba"]);
});
