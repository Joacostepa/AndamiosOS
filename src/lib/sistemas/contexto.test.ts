import { test } from "node:test";
import assert from "node:assert/strict";
import { contextoVacio, sanearContexto, sanearRuta, sanearTexto, sanearUrl } from "./contexto.ts";
import { LIMITES } from "./tipos.ts";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop";

test("sanearTexto: JWT, Bearer y mails afuera; recorta", () => {
  assert.equal(sanearTexto(`token ${JWT} vencido`, 1000), "token [jwt] vencido");
  assert.equal(sanearTexto("Authorization: Bearer abcdefgh12345678", 1000), "Authorization: Bearer [token]");
  assert.equal(sanearTexto("no existe juan.perez@andamios.com.ar en la base", 1000), "no existe [email] en la base");
  assert.equal(sanearTexto("x".repeat(50), 10).length, 10);
  assert.equal(sanearTexto(42, 10), "");
  // Las URLs citadas en un mensaje también pierden los parámetros sensibles.
  assert.equal(
    sanearTexto("falló https://auth.x.com/callback?code=abc123&state=9 y https://maps.x.com/js?key=AIzaSyXXX&v=3 al cargar", 1000),
    "falló https://auth.x.com/callback?state=9 y https://maps.x.com/js?v=3 al cargar",
  );
});

test("sanearUrl: saca token, apikey, access_token, code, signature y key (también del hash)", () => {
  assert.equal(sanearUrl("/api/x?a=1&token=abc&b=2"), "/api/x?a=1&b=2");
  assert.equal(sanearUrl("https://x.supabase.co/rest/v1/t?apikey=k&select=*"), "https://x.supabase.co/rest/v1/t?select=*");
  assert.equal(sanearUrl("/auth/callback?code=xyz"), "/auth/callback");
  assert.equal(sanearUrl("/s?Signature=1&KEY=2&ok=3"), "/s?ok=3");
  assert.equal(sanearUrl("/login#access_token=abc&refresh_token=def&type=recovery"), "/login#type=recovery");
  assert.equal(sanearUrl("/partes#seccion"), "/partes#seccion");
  assert.equal(sanearUrl(`/x/${JWT}`), "/x/[jwt]");
  assert.equal(sanearUrl("/u?mail=ana@b.com"), "/u?mail=[email]");
  assert.ok(sanearUrl(`/${"a".repeat(900)}`).length <= 500);
  assert.equal(sanearRuta("/planificacion?fecha=2026-10-17&token=t"), "/planificacion?fecha=2026-10-17");
});

test("sanearContexto: lo que no tiene forma queda vacío", () => {
  assert.deepEqual(sanearContexto(null), contextoVacio());
  assert.deepEqual(sanearContexto("hola"), contextoVacio());
  assert.deepEqual(sanearContexto([1, 2]), contextoVacio());
  const c = sanearContexto({ errores: "no es lista", pantalla: { ancho: "800", tema: "violeta" }, navegador: 5 });
  assert.deepEqual(c.errores, []);
  assert.equal(c.pantalla.ancho, 0);
  assert.equal(c.pantalla.tema, "claro");
  assert.equal(c.navegador.userAgent, "");
  assert.equal(c.version, 1);
});

test("sanearContexto: limpia cada parte y respeta los límites de las listas", () => {
  const errores = Array.from({ length: 40 }, (_, i) => ({
    tipo: i % 2 ? "console.error" : "inventado",
    mensaje: `falló ${i} para ana@b.com`,
    stack: "s".repeat(3000),
    at: "2026-10-17T10:00:00Z",
  }));
  const c = sanearContexto({
    ruta: "/partes?token=1",
    tituloPantalla: "Partes",
    sha: "abc123<script>",
    navegador: { userAgent: "Mozilla/5.0", idioma: "es-AR", tactil: true, online: false, zonaHoraria: "America/Buenos_Aires" },
    pantalla: { ancho: 390, alto: 844, dpr: 3, tema: "oscuro" },
    dispositivo: "iPhone · Safari 18 · 390×844",
    errores,
    pedidos: [{ metodo: "post", url: "/api/partes?code=9", status: 500, duracionMs: 120.6, vercelId: "gru1::abc", at: "x" }, { url: 5 }],
    rutas: Array.from({ length: 15 }, (_, i) => ({ ruta: `/r${i}`, at: "2026-10-17T10:00:00Z" })),
  });
  assert.equal(c.ruta, "/partes");
  assert.equal(c.sha, "abc123script");
  assert.equal(c.errores.length, LIMITES.errores);
  // Se quedan los últimos (los más nuevos).
  assert.match(c.errores[c.errores.length - 1].mensaje, /falló 39 para \[email\]/);
  assert.equal(c.errores[0].tipo, "error");
  assert.ok((c.errores[1].stack ?? "").length <= 2000);
  assert.deepEqual(c.pedidos, [{ metodo: "POST", url: "/api/partes", status: 500, duracionMs: 121, vercelId: "gru1::abc", at: "" }]);
  assert.equal(c.rutas.length, LIMITES.rutas);
  assert.equal(c.rutas[0].ruta, "/r5");
  assert.equal(c.pantalla.tema, "oscuro");
  assert.equal(c.navegador.online, false);
  assert.ok(JSON.stringify(c).length < LIMITES.contextoBytes);
});

test("sanearContexto: por encima del límite, primero los stacks y después lo más viejo", () => {
  const grande = {
    errores: Array.from({ length: 30 }, (_, i) => ({ tipo: "error", mensaje: `m${i} ${"x".repeat(990)}`, stack: "y".repeat(2000), at: "" })),
    pedidos: Array.from({ length: 30 }, (_, i) => ({ metodo: "GET", url: `/api/${i}/${"z".repeat(480)}`, status: 0, duracionMs: 1, at: "" })),
  };
  const c = sanearContexto(grande, 20_000);
  assert.ok(JSON.stringify(c).length < 20_000);
  assert.ok(c.errores.every((e) => !e.stack));
  // Lo que queda es lo más nuevo.
  if (c.errores.length) assert.match(c.errores[c.errores.length - 1].mensaje, /^m29/);
  const holgado = sanearContexto(grande);
  assert.ok(JSON.stringify(holgado).length < LIMITES.contextoBytes);
});
