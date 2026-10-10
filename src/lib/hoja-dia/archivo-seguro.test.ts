import { test } from "node:test";
import assert from "node:assert/strict";
import { cabecerasArchivo, tipoImagen } from "./archivo-seguro.ts";

test("I1: una foto o un PDF se ven en el navegador, aislados", () => {
  const h = cabecerasArchivo("image/jpeg", "plano 1.jpg");
  assert.equal(h["Content-Type"], "image/jpeg");
  assert.match(h["Content-Disposition"], /^inline;/);
  assert.equal(h["X-Content-Type-Options"], "nosniff");
  assert.match(h["Content-Security-Policy"], /^sandbox/);
  const pdf = cabecerasArchivo("application/pdf", "x.pdf");
  assert.equal(pdf["Content-Type"], "application/pdf");
  assert.equal(pdf["X-Content-Type-Options"], "nosniff");
});

test("I1: HTML, SVG o lo que sea se baja como archivo, nunca se ejecuta", () => {
  for (const m of ["text/html", "image/svg+xml", "application/xhtml+xml", "text/javascript", null, ""]) {
    const h = cabecerasArchivo(m, "<script>.html");
    assert.equal(h["Content-Type"], "application/octet-stream");
    assert.match(h["Content-Disposition"], /^attachment; filename="_script_.html"$/);
    assert.match(h["Content-Security-Policy"], /^sandbox/);
  }
});

test("foto del remito: se reconoce por los bytes, no por lo que dice el navegador", () => {
  assert.deepEqual(tipoImagen(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])), { ext: "jpg", mime: "image/jpeg" });
  assert.deepEqual(tipoImagen(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), { ext: "png", mime: "image/png" });
  assert.equal(tipoImagen(new TextEncoder().encode("RIFF1234WEBPVP8 "))?.ext, "webp");
  assert.equal(tipoImagen(new TextEncoder().encode("<svg onload=alert(1)>")), null);
  assert.equal(tipoImagen(new TextEncoder().encode("%PDF-1.7")), null);
});
