import { test } from "node:test";
import assert from "node:assert/strict";
import {
  comentarSchema, confirmarSchema, crearReporteSchema, filtrosDeQuery, idValido, mensajeZod, partirBusqueda,
  pedidoSubidasSchema, revisarAParametros, revisarSchema,
} from "./validar.ts";

const UID = "0b6f9a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const ARCH = "11111111-2222-4333-8444-555555555555";

test("subidas: de 1 a 6 imágenes, png/jpeg/webp, hasta 5 MB", () => {
  assert.ok(pedidoSubidasSchema.safeParse({ archivos: [{ mime: "image/webp", bytes: 1000 }] }).success);
  const vacio = pedidoSubidasSchema.safeParse({ archivos: [] });
  assert.ok(!vacio.success);
  const siete = pedidoSubidasSchema.safeParse({ archivos: Array(7).fill({ mime: "image/png", bytes: 10 }) });
  assert.ok(!siete.success && /hasta 6/.test(mensajeZod(siete.error)));
  const gif = pedidoSubidasSchema.safeParse({ archivos: [{ mime: "image/gif", bytes: 10 }] });
  assert.ok(!gif.success && /PNG, JPG o WEBP/.test(mensajeZod(gif.error)));
  const pesada = pedidoSubidasSchema.safeParse({ archivos: [{ mime: "image/png", bytes: 5 * 1024 * 1024 + 1 }] });
  assert.ok(!pesada.success && /5 MB/.test(mensajeZod(pesada.error)));
});

test("crear: tipo, descripción de 3 a 5000 después de trim, y lo demás se recorta", () => {
  const ok = crearReporteSchema.safeParse({
    tipo: "error",
    descripcion: "  No guarda el parte  ",
    frena: true,
    ruta: "/partes",
    tituloPantalla: "x".repeat(500),
    shaCliente: "abc",
    contexto: { lo: "que sea" },
    capturas: [{ path: `${UID}/${ARCH}.webp`, mime: "image/webp", bytes: 100, ancho: 800, alto: 600 }],
  });
  assert.ok(ok.success);
  assert.equal(ok.data.descripcion, "No guarda el parte");
  assert.equal(ok.data.tituloPantalla.length, 200);
  const corto = crearReporteSchema.safeParse({ tipo: "mejora", descripcion: "  a ", contexto: null });
  assert.ok(!corto.success && /Contá un poco más/.test(mensajeZod(corto.error)));
  const sinTipo = crearReporteSchema.safeParse({ descripcion: "algo pasa", contexto: null });
  assert.ok(!sinTipo.success && /Elegí si es un error/.test(mensajeZod(sinTipo.error)));
  // Por defecto: no frena, sin capturas, ruta vacía.
  const min = crearReporteSchema.parse({ tipo: "mejora", descripcion: "Estaría bueno" });
  assert.equal(min.frena, false);
  assert.deepEqual(min.capturas, []);
  assert.equal(min.ruta, "");
});

test("crear: los paths de las capturas tienen que ser <uid>/<uuid>.<ext> y no repetirse", () => {
  const raro = crearReporteSchema.safeParse({
    tipo: "error", descripcion: "No anda",
    capturas: [{ path: "../otro/archivo.png", mime: "image/png", bytes: 1, ancho: 1, alto: 1 }],
  });
  assert.ok(!raro.success && /nombre raro/.test(mensajeZod(raro.error)));
  const c = { path: `${UID}/${ARCH}.png`, mime: "image/png", bytes: 1, ancho: 1, alto: 1 };
  const repetida = crearReporteSchema.safeParse({ tipo: "error", descripcion: "No anda", capturas: [c, c] });
  assert.ok(!repetida.success && /repetida/.test(mensajeZod(repetida.error)));
});

test("comentar y confirmar", () => {
  assert.equal(comentarSchema.parse({ texto: "  hola  " }).texto, "hola");
  assert.ok(!comentarSchema.safeParse({ texto: "   " }).success);
  assert.ok(!comentarSchema.safeParse({ texto: "x".repeat(5001) }).success);
  assert.deepEqual(confirmarSchema.parse({ ok: true }), { ok: true });
  assert.equal(confirmarSchema.parse({ ok: false, texto: "  " }).texto, undefined);
  assert.equal(confirmarSchema.parse({ ok: false, texto: " sigue " }).texto, "sigue");
  assert.ok(!confirmarSchema.safeParse({ ok: false, texto: "x".repeat(2001) }).success);
  assert.ok(!confirmarSchema.safeParse({}).success);
});

test("revisar: descartado exige motivo, duplicado exige el original", () => {
  assert.ok(revisarSchema.safeParse({ estado: "en_curso" }).success);
  const sinMotivo = revisarSchema.safeParse({ estado: "descartado" });
  assert.ok(!sinMotivo.success && /por qué se descarta/.test(mensajeZod(sinMotivo.error)));
  const dupSinOriginal = revisarSchema.safeParse({ estado: "descartado", motivoDescarte: "duplicado" });
  assert.ok(!dupSinOriginal.success && /de qué reporte es duplicado/.test(mensajeZod(dupSinOriginal.error)));
  assert.ok(revisarSchema.safeParse({ estado: "descartado", motivoDescarte: "duplicado", duplicadoDe: ARCH }).success);
  assert.ok(!revisarSchema.safeParse({ motivoDescarte: "ya_existe" }).success);
  assert.ok(!revisarSchema.safeParse({}).success);
  assert.ok(revisarSchema.safeParse({ mensaje: "¿Te sigue pasando?" }).success);
  // Mensaje vacío = no vino.
  assert.ok(!revisarSchema.safeParse({ mensaje: "   " }).success);
});

test("revisar → parámetros de la RPC: snake_case y la prioridad null no se pierde", () => {
  const conNull = revisarSchema.parse({ prioridad: null });
  assert.deepEqual(revisarAParametros(conNull), { prioridad: null });
  const sinPrioridad = revisarSchema.parse({ estado: "resuelto", mensaje: "Listo" });
  assert.ok(!("prioridad" in revisarAParametros(sinPrioridad)));
  assert.deepEqual(
    revisarAParametros(revisarSchema.parse({ estado: "descartado", motivoDescarte: "duplicado", duplicadoDe: ARCH, prioridad: "alta" })),
    { estado: "descartado", prioridad: "alta", motivo_descarte: "duplicado", duplicado_de: ARCH },
  );
});

test("filtros de la bandeja y búsqueda", () => {
  assert.deepEqual(filtrosDeQuery(new URLSearchParams("")), { estado: "nuevo", tipo: null, frena: false, q: "" });
  assert.deepEqual(filtrosDeQuery(new URLSearchParams("estado=resuelto&tipo=mejora&frena=1&q=%20hola%20")), {
    estado: "resuelto", tipo: "mejora", frena: true, q: "hola",
  });
  assert.equal(filtrosDeQuery(new URLSearchParams("estado=raro")).estado, "nuevo");
  assert.deepEqual(partirBusqueda("#12"), { numero: 12, texto: null });
  assert.deepEqual(partirBusqueda("12"), { numero: 12, texto: "12" });
  assert.deepEqual(partirBusqueda("no guarda, (parte)"), { numero: null, texto: "no guarda parte" });
  assert.deepEqual(partirBusqueda("  "), { numero: null, texto: null });
});

test("idValido", () => {
  assert.ok(idValido(UID));
  assert.ok(!idValido("12"));
  assert.ok(!idValido(null));
});
