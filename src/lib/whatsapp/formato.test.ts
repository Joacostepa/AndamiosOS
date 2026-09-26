import { test } from "node:test";
import assert from "node:assert/strict";
import { aWhatsapp, partir } from "./formato.ts";

test("negrita y tachado al formato de WhatsApp; la negrita de WhatsApp queda como está", () => {
  assert.equal(aWhatsapp("El **total** es ~~viejo~~"), "El *total* es ~viejo~");
  assert.equal(aWhatsapp("__importante__"), "*importante*");
  assert.equal(aWhatsapp("*Bandeja 3 m:* $ 1.680.000"), "*Bandeja 3 m:* $ 1.680.000");
});

test("títulos en negrita y viñetas con punto", () => {
  assert.equal(aWhatsapp("## Resumen\n- bandeja\n* concertina"), "*Resumen*\n• bandeja\n• concertina");
  assert.equal(aWhatsapp("### **Ya en negrita**"), "*Ya en negrita*");
});

test("una tabla queda en filas legibles", () => {
  const md = "| Ítem | Importe |\n|---|---:|\n| Bandeja | $ 1.400.000 |\n| Flete | $ 150.000 |";
  assert.equal(aWhatsapp(md), "Ítem · Importe\nBandeja · $ 1.400.000\nFlete · $ 150.000");
});

test("links con texto y sin texto", () => {
  assert.equal(aWhatsapp("Mirá [la orden](https://x.odoo.com/o/1)"), "Mirá la orden (https://x.odoo.com/o/1)");
  assert.equal(aWhatsapp("[https://a.b](https://a.b)"), "https://a.b");
});

test("no toca lo que está dentro de un bloque de código ni los productos (3 * 4)", () => {
  assert.equal(aWhatsapp("```\n**no** tocar\n```"), "```\n**no** tocar\n```");
  assert.equal(aWhatsapp("12 ml * 140.000 = 1.680.000"), "12 ml * 140.000 = 1.680.000");
});

test("parte los textos largos por párrafo", () => {
  const p = `${"a".repeat(3000)}\n\n${"b".repeat(3000)}`;
  const partes = partir(p, 4000);
  assert.equal(partes.length, 2);
  assert.equal(partes[0], "a".repeat(3000));
  assert.equal(partes[1], "b".repeat(3000));
  assert.ok(partir("x ".repeat(5000), 4000).every((x) => x.length <= 4000));
  assert.deepEqual(partir("corto"), ["corto"]);
});
