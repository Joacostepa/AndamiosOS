import { test } from "node:test";
import assert from "node:assert/strict";
import type { Acceso } from "../auth/acceso.ts";
import { RECORRIDO } from "../sistemas/tipos.ts";
import { decidirRecorrido } from "./reglas.ts";
import { RECORRIDOS, dispositivoRecorrido, recorridoPendiente, type Recorrido } from "./registro.ts";

const acceso = (a: Partial<Acceso> = {}): Acceso => ({
  rol: "campo",
  activo: true,
  permisos: { partes: "editar" },
  debeCambiarClave: false,
  ...a,
});
const KIOSCO = acceso({ rol: "deposito", permisos: { "panol-kiosco": "editar" } });

test("decidirRecorrido: a cualquiera activo se le muestra en una pantalla común", () => {
  assert.equal(decidirRecorrido({ pathname: "/hoja-dia", acceso: acceso() }), "mostrar");
  assert.equal(decidirRecorrido({ pathname: "/", acceso: acceso({ rol: "admin", permisos: {} }) }), "mostrar");
  // Un usuario sin ningún módulo también reporta.
  assert.equal(decidirRecorrido({ pathname: "/alertas", acceso: acceso({ permisos: {} }) }), "mostrar");
});

test("decidirRecorrido: nunca sin acceso, inactivo, con clave por cambiar o cuenta técnica", () => {
  assert.equal(decidirRecorrido({ pathname: "/", acceso: null }), "nunca");
  assert.equal(decidirRecorrido({ pathname: "/", acceso: acceso({ activo: false }) }), "nunca");
  assert.equal(decidirRecorrido({ pathname: "/", acceso: acceso({ debeCambiarClave: true }) }), "nunca");
  assert.equal(decidirRecorrido({ pathname: "/panol", acceso: KIOSCO }), "nunca");
});

test("decidirRecorrido: la cuenta técnica es SÓLO la que tiene únicamente el kiosco y no es admin", () => {
  assert.equal(decidirRecorrido({ pathname: "/", acceso: acceso({ rol: "admin", permisos: { "panol-kiosco": "editar" } }) }), "mostrar");
  assert.equal(decidirRecorrido({ pathname: "/", acceso: acceso({ rol: "deposito", permisos: { "panol-kiosco": "editar", panol: "ver" } }) }), "mostrar");
});

test("decidirRecorrido: posterga en la ficha pública, el lector de fichadas y la impresión", () => {
  for (const p of ["/p/123", "/p", "/fichadas/escanear", "/fichadas/escanear/x", "/organigrama/imprimir"]) {
    assert.equal(decidirRecorrido({ pathname: p, acceso: acceso() }), "postergar", p);
  }
});

test("decidirRecorrido: el prefijo respeta el borde de segmento", () => {
  for (const p of ["/partes", "/panol", "/fichadas", "/organigrama", "/habilitaciones", "/fichadas/escanearX"]) {
    assert.equal(decidirRecorrido({ pathname: p, acceso: acceso() }), "mostrar", p);
  }
});

test("decidirRecorrido: no corre en /cambiar-clave ni en el kiosco", () => {
  assert.equal(decidirRecorrido({ pathname: "/cambiar-clave", acceso: acceso() }), "nunca");
  assert.equal(decidirRecorrido({ pathname: "/kiosco", acceso: acceso() }), "nunca");
  assert.equal(decidirRecorrido({ pathname: "/h/abc", acceso: acceso() }), "nunca");
});

test("registro: el de Sistemas es obligatorio, para nuevos y con 5 pasos", () => {
  const r = RECORRIDOS.find((x) => x.clave === RECORRIDO.clave);
  assert.ok(r);
  assert.equal(r.version, 1);
  assert.equal(r.obligatorio, true);
  assert.equal(r.paraNuevos, true);
  assert.equal(r.pasos, 5);
  // Las claves cumplen el CHECK de la tabla.
  for (const x of RECORRIDOS) assert.match(x.clave, /^[a-z0-9][a-z0-9-]{0,59}$/);
});

test("recorridoPendiente: le falta a quien no lo hizo", () => {
  assert.deepEqual(recorridoPendiente(acceso(), []), { clave: "sistemas-reportar", version: 1, pasos: 5 });
  assert.deepEqual(recorridoPendiente(acceso(), [{ clave: "otro", version: 1 }]), { clave: "sistemas-reportar", version: 1, pasos: 5 });
});

test("recorridoPendiente: nada si ya lo hizo en esta versión", () => {
  assert.equal(recorridoPendiente(acceso(), [{ clave: "sistemas-reportar", version: 1 }]), null);
});

test("recorridoPendiente: una versión vieja no cuenta", () => {
  const v2: Recorrido[] = RECORRIDOS.map((r) => ({ ...r, version: 2 }));
  assert.deepEqual(recorridoPendiente(acceso(), [{ clave: "sistemas-reportar", version: 1 }], null, v2), { clave: "sistemas-reportar", version: 2, pasos: 5 });
});

test("recorridoPendiente: si no se pudo leer la tabla, no se muestra", () => {
  assert.equal(recorridoPendiente(acceso(), null), null);
});

test("recorridoPendiente: respeta las exclusiones y, con ruta, la postergación", () => {
  assert.equal(recorridoPendiente(null, []), null);
  assert.equal(recorridoPendiente(KIOSCO, []), null);
  assert.equal(recorridoPendiente(acceso({ debeCambiarClave: true }), []), null);
  assert.equal(recorridoPendiente(acceso(), [], "/fichadas/escanear"), null);
  assert.ok(recorridoPendiente(acceso(), [], "/hoja-dia"));
});

test("recorridoPendiente: respeta `para` y los que no son obligatorios", () => {
  const reg: Recorrido[] = [
    { clave: "a", version: 1, titulo: "A", obligatorio: false, paraNuevos: true, para: () => true, pasos: 2 },
    { clave: "b", version: 1, titulo: "B", obligatorio: true, paraNuevos: true, para: (a) => a.rol === "admin", pasos: 3 },
    { clave: "c", version: 1, titulo: "C", obligatorio: true, paraNuevos: true, para: () => true, pasos: 4 },
  ];
  assert.deepEqual(recorridoPendiente(acceso(), [], null, reg), { clave: "c", version: 1, pasos: 4 });
  assert.deepEqual(recorridoPendiente(acceso({ rol: "admin" }), [], null, reg), { clave: "b", version: 1, pasos: 3 });
});

test("dispositivoRecorrido: celular o compu y el navegador, hasta 200 letras", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
  assert.equal(dispositivoRecorrido(iphone, 390, 844, true), "celular · iPhone · Safari 17 · 390×844");
  assert.equal(dispositivoRecorrido(mac, 1440, 900, false), "compu · Mac · Chrome 130 · 1440×900");
  assert.ok(dispositivoRecorrido("x".repeat(500), 1, 1, false).length <= 200);
});
