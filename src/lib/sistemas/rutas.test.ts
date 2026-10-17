import { test } from "node:test";
import assert from "node:assert/strict";
import { archivoDePagina, docsDeModulo, moduloDeRuta, pantallaDeRuta, pathnameDe } from "./rutas.ts";

test("pathnameDe: sin query, sin hash, sin barra final", () => {
  assert.equal(pathnameDe("/planificacion?fecha=2026-10-17#x"), "/planificacion");
  assert.equal(pathnameDe("/obras/123/"), "/obras/123");
  assert.equal(pathnameDe("https://os.andamios.com/partes?id=1"), "/partes");
  assert.equal(pathnameDe(""), "/");
  assert.equal(pathnameDe(null), "/");
  assert.equal(pathnameDe("partes"), "/partes");
});

test("moduloDeRuta: el de acceso.ts, ganando la ruta más larga", () => {
  assert.equal(moduloDeRuta("/planificacion")?.id, "planificacion");
  assert.equal(moduloDeRuta("/planificacion/hoja?dia=1")?.id, "hoja-dia");
  assert.equal(moduloDeRuta("/sistemas/revision")?.id, "sistemas");
  assert.equal(moduloDeRuta("/sistemas/mis-reportes"), null);
  assert.equal(moduloDeRuta("/alertas"), null);
});

test("pantallaDeRuta: nombre propio, módulo o la ruta legible", () => {
  assert.equal(pantallaDeRuta("/planificacion"), "Planificación");
  assert.equal(pantallaDeRuta("/planificacion/hoja/camiones"), "Hoja del día · Camiones");
  assert.equal(pantallaDeRuta("/planificacion/hoja"), "Hoja del día");
  assert.equal(pantallaDeRuta("/partes/123"), "Partes de obra");
  assert.equal(pantallaDeRuta("/oficina-tecnica/modelador/abc"), "Modelador");
  assert.equal(pantallaDeRuta("/alertas"), "Alertas");
  assert.equal(pantallaDeRuta("/sistemas/mis-reportes?id=x"), "Mis reportes");
  assert.equal(pantallaDeRuta("/configuracion/usuarios"), "Usuarios");
  assert.equal(pantallaDeRuta("/p/ABC123"), "Pañol (QR)");
  assert.equal(pantallaDeRuta("/"), "Inicio");
  assert.equal(pantallaDeRuta("/cotizador-rapido"), "Cotizador rapido");
});

test("docsDeModulo: carpeta de docs/ del módulo, o de la ruta", () => {
  assert.equal(docsDeModulo("partes"), "docs/partes/");
  assert.equal(docsDeModulo("planificacion"), "docs/tablero-planificacion/");
  assert.equal(docsDeModulo("hoja-dia"), "docs/equipos-del-dia/");
  assert.equal(docsDeModulo("computos"), "docs/computo-materiales/");
  assert.equal(docsDeModulo("clientes-whatsapp"), "docs/sofia/");
  assert.equal(docsDeModulo("modelador"), "docs/oficina-tecnica/");
  assert.equal(docsDeModulo("informes-obra"), "docs/informe-de-obra/");
  assert.equal(docsDeModulo("permisos-via-publica"), "docs/permisos/");
  assert.equal(docsDeModulo("configuracion", "/configuracion/cuadrillas"), "docs/cuadrillas/");
  assert.equal(docsDeModulo("configuracion", "/configuracion/usuarios"), null);
  assert.equal(docsDeModulo(null), null);
  assert.equal(docsDeModulo("vehiculos"), null);
});

test("archivoDePagina: el page.tsx probable, con los ids como parámetros", () => {
  assert.equal(archivoDePagina("/planificacion"), "src/app/(dashboard)/planificacion/page.tsx");
  assert.equal(archivoDePagina("/planificacion/hoja?dia=2026-10-17"), "src/app/(dashboard)/planificacion/hoja/page.tsx");
  assert.equal(archivoDePagina("/obras/1234"), "src/app/(dashboard)/obras/[id]/page.tsx");
  assert.equal(
    archivoDePagina("/oficina-tecnica/modelador/0b6f9a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b"),
    "src/app/(dashboard)/oficina-tecnica/modelador/[id]/page.tsx",
  );
  assert.equal(archivoDePagina("/habilitaciones/8412"), "src/app/(dashboard)/habilitaciones/[otId]/page.tsx");
  assert.equal(archivoDePagina("/informes-obra/S01933"), "src/app/(dashboard)/informes-obra/[saleOrderId]/page.tsx");
  assert.equal(archivoDePagina("/p/caja"), "src/app/(dashboard)/p/[codigo]/page.tsx");
  assert.equal(archivoDePagina("/organigrama/lienzo"), "src/app/(dashboard)/organigrama/lienzo/page.tsx");
  assert.equal(archivoDePagina("/h/abc123token"), "src/app/h/[token]/page.tsx");
});
