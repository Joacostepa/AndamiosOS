import { test } from "node:test";
import assert from "node:assert/strict";
import { cabecerasArchivo } from "./archivo-seguro.ts";

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
