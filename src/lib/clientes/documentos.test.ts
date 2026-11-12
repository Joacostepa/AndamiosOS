// Los documentos del alquiler simple (§6): qué está y qué falta, que el número de DNI no se
// guarde, que Tomás no vea los datos y que se adjunten a la orden de Odoo cuando están todos.
// La visión, Storage y Odoo son dobles: no se llama a nada de verdad.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  documentosNuevos, documentosVacios, estadoDocumentos, leerDocumentos, limpiarLectura, nombresParaOdoo, notaParaOdoo, procesarDocumentos,
  textoDocumentosParaTomas, MAX_POR_TURNO, type DepsDocumentos, type DocumentoRecibido, type DocumentosAlquiler, type ItemDocumento, type LecturaDocumento,
} from "./documentos.ts";
import { alquilerVacio, fichaSofiaVacia, type FichaSofia } from "./herramientas.ts";
import { detectarPlata } from "./filtro-salida.ts";

const AHORA = "2026-10-15T13:30:00.000Z";

function recibido(hiloId: string, tipo: DocumentoRecibido["tipo"], o: Partial<DocumentoRecibido> = {}): DocumentoRecibido {
  return {
    hiloId, path: `clientes/c1/${hiloId}-foto.jpg`, mime: "image/jpeg", nombre: `foto-${hiloId}.jpg`, tipo, legible: true, titular: "Marcela Ríos",
    servicio: tipo === "servicio" ? "luz" : null, direccion: tipo === "servicio" ? "Gorriti 4500, CABA" : null, leidoAt: AHORA, error: null, ...o,
  };
}

function docs(recibidos: DocumentoRecibido[], o: Partial<DocumentosAlquiler> = {}): DocumentosAlquiler {
  return { ...documentosVacios(AHORA), recibidos, ...o };
}

function item(id: string, o: Partial<ItemDocumento> & { mime?: string; path?: string | null } = {}): ItemDocumento {
  const { mime = "image/jpeg", path = `clientes/c1/${id}-foto.jpg`, ...resto } = o;
  return { id, direccion: "entrante", tipo: "image", adjunto: path ? { path, mime, nombre: `foto-${id}.jpg`, bytes: 1000 } : { media_id: "m", pendiente: true }, ...resto };
}

test("limpiarLectura: el número de DNI no queda, la dirección del DNI tampoco; la del servicio sí", () => {
  const dni = limpiarLectura({ tipo: "dni_frente", legible: true, titular: "RIOS MARCELA 30.123.456", servicio: "luz", direccion: "Calle Falsa 123" });
  assert.equal(dni.titular, "RIOS MARCELA");
  assert.equal(dni.direccion, null);
  assert.equal(dni.servicio, null);
  const s = limpiarLectura({ tipo: "servicio", legible: true, titular: "Marcela Ríos 30123456", servicio: "LUZ", direccion: "  Gorriti   4500, CABA " });
  assert.equal(s.titular, "Marcela Ríos");
  assert.equal(s.servicio, "luz");
  assert.equal(s.direccion, "Gorriti 4500, CABA");
  assert.equal(limpiarLectura({ tipo: "pasaporte" as LecturaDocumento["tipo"], legible: true, titular: null, servicio: null, direccion: null }).tipo, "otro");
});

test("estadoDocumentos: DNI de frente y de dorso y dos servicios distintos (o uno si no tiene dos)", () => {
  const vacio = estadoDocumentos(docs([]));
  assert.equal(vacio.completos, false);
  assert.equal(vacio.faltan.length, 3);

  const uno = estadoDocumentos(docs([recibido("a", "dni_frente"), recibido("b", "dni_dorso"), recibido("c", "servicio")]));
  assert.equal(uno.completos, false);
  assert.deepEqual(uno.faltan, ["otro servicio a su nombre (si no tiene otro, que te lo diga y alcanza con uno)"]);
  assert.equal(uno.direccionActual, "Gorriti 4500, CABA");

  // Las dos caras de la factura de luz son un solo servicio.
  const dosFotosLuz = estadoDocumentos(docs([recibido("a", "dni_frente"), recibido("b", "dni_dorso"), recibido("c", "servicio"), recibido("d", "servicio")]));
  assert.equal(dosFotosLuz.servicios, 1);
  assert.equal(dosFotosLuz.completos, false);

  const completos = estadoDocumentos(docs([recibido("a", "dni_frente"), recibido("b", "dni_dorso"), recibido("c", "servicio"), recibido("d", "servicio", { servicio: "gas" })]));
  assert.equal(completos.completos, true);
  assert.deepEqual(completos.faltan, []);

  assert.equal(estadoDocumentos(docs([recibido("a", "dni_frente"), recibido("b", "dni_dorso"), recibido("c", "servicio")], { unSoloServicio: true })).completos, true);
});

test("estadoDocumentos: lo ilegible, lo que no es documento y lo que no se pudo revisar no cuentan", () => {
  const e = estadoDocumentos(docs([
    recibido("a", "dni_frente", { legible: false }),
    recibido("b", "otro"),
    recibido("c", "sin_leer", { legible: false, error: "La visión no respondió" }),
    recibido("d", "dni_dorso"),
  ]));
  assert.equal(e.dniFrente, false);
  assert.equal(e.dniDorso, true);
  assert.equal(e.ilegibles, 1);
  assert.equal(e.otros, 1);
  assert.equal(e.sinLeer, 1);
  const t = textoDocumentosParaTomas(e);
  assert.match(t, /falta la foto del DNI de frente/);
  assert.match(t, /una foto no se lee bien: pedile que la mande de nuevo/);
  assert.match(t, /una foto no es ni el DNI ni un servicio/);
  assert.match(t, /no se la pidas de nuevo/);
});

test("estadoDocumentos: servicios con direcciones distintas se aceptan, pero se avisa (supuesto de la §9)", () => {
  const e = estadoDocumentos(docs([recibido("c", "servicio"), recibido("d", "servicio", { servicio: "gas", direccion: "Otra 999, Olivos" })]));
  assert.equal(e.direccionesDistintas, true);
  assert.equal(e.direccionActual, "Gorriti 4500, CABA");
  assert.match(notaParaOdoo(e, []), /no tienen la misma dirección/);
});

test("lo que ve Tomás no tiene datos de los documentos ni plata", () => {
  const d = docs([recibido("a", "dni_frente", { titular: "Marcela Ríos" }), recibido("c", "servicio")]);
  const t = textoDocumentosParaTomas(estadoDocumentos(d));
  assert.ok(!t.includes("Marcela") && !t.includes("Gorriti"), t);
  assert.equal(detectarPlata(t).bloquea, false);
  const completo = textoDocumentosParaTomas(estadoDocumentos(docs([recibido("a", "dni_frente"), recibido("b", "dni_dorso"), recibido("c", "servicio")], { unSoloServicio: true })));
  assert.match(completo, /sin repetir ningún dato/);
});

test("documentosNuevos: sólo fotos y PDF ya bajados, del cliente, una vez, y como mucho los del tope", () => {
  const d = docs([recibido("ya", "dni_frente")]);
  const nuevos = documentosNuevos(d, [
    item("ya"),
    item("pdf", { tipo: "document", mime: "application/pdf", path: "clientes/c1/pdf-servicio.pdf" }),
    item("sin-bajar", { path: null }),
    item("audio", { tipo: "audio", mime: "audio/ogg" }),
    item("video", { tipo: "video", mime: "video/mp4" }),
    item("heic", { mime: "image/heic" }),
    item("nuestra", { direccion: "saliente" }),
    item("foto"),
  ]);
  assert.deepEqual(nuevos.map((n) => n.hiloId), ["pdf", "foto"]);
  const muchas = documentosNuevos(docs([]), Array.from({ length: 10 }, (_, i) => item(`f${i}`)));
  assert.equal(muchas.length, MAX_POR_TURNO);
});

test("nombresParaOdoo: DNI frente, DNI dorso, Servicio 1 - luz; lo que no sirve no se adjunta", () => {
  const n = nombresParaOdoo([
    recibido("a", "dni_frente"),
    recibido("b", "dni_dorso", { nombre: "dorso.png", mime: "image/png" }),
    recibido("c", "servicio"),
    recibido("d", "servicio", { servicio: "gas", nombre: "factura", mime: "application/pdf" }),
    recibido("e", "otro"),
    recibido("f", "servicio", { legible: false }),
  ]).map((x) => x.nombre);
  assert.deepEqual(n, ["DNI frente.jpg", "DNI dorso.png", "Servicio 1 - luz.jpg", "Servicio 2 - gas.pdf"]);
});

// ── procesarDocumentos, con dobles ─────────────────────────────────────────────────────

/** Lo que «ve» la visión de mentira, por id del hilo. */
type Mundo = { deps: DepsDocumentos; eventos: string[]; clasificados: string[]; adjuntados: { ordenId: number; nombres: string[]; nota: string }[]; orden: { id: number; nombre: string } | null };

function mundoDocumentos(lecturas: Record<string, LecturaDocumento | Error>, o: { orden?: { id: number; nombre: string } | null; adjuntarFalla?: boolean } = {}): Mundo {
  const m: Mundo = { eventos: [], clasificados: [], adjuntados: [], orden: o.orden === undefined ? { id: 777, nombre: "S03100" } : o.orden, deps: null as unknown as DepsDocumentos };
  m.deps = {
    bajar: async (path) => ({ datos: new TextEncoder().encode(path), mime: "image/jpeg" }),
    clasificar: async ({ datos }) => {
      const path = new TextDecoder().decode(datos);
      const id = /clientes\/c1\/([^-]+)-/.exec(path)![1];
      m.clasificados.push(id);
      const l = lecturas[id];
      if (l instanceof Error) throw l;
      return { lectura: l, costoUsd: 0.0004 };
    },
    ordenAlquiler: async () => m.orden,
    adjuntar: async (ordenId, archivos, nota) => {
      if (o.adjuntarFalla) throw new Error("Odoo no responde");
      m.adjuntados.push({ ordenId, nombres: archivos.map((a) => a.nombre), nota });
      return { subidos: archivos.length, yaEstaban: 0 };
    },
    evento: async (t) => { m.eventos.push(t); },
    ahora: () => AHORA,
  };
  return m;
}

function fichaAceptada(d: DocumentosAlquiler = documentosVacios(AHORA)): FichaSofia {
  return { ...fichaSofiaVacia(), nombre: "Marcela Ríos", alquiler: { ...alquilerVacio(), aceptado: { at: AHORA, presupuesto: 1042, fecha: "2026-10-19", franja: { tipo: "manana" } }, documentos: d } };
}

const L = {
  frente: { tipo: "dni_frente", legible: true, titular: "RIOS MARCELA 30.123.456", servicio: null, direccion: "Av. Siempreviva 742" },
  dorso: { tipo: "dni_dorso", legible: true, titular: null, servicio: null, direccion: "Av. Siempreviva 742" },
  luz: { tipo: "servicio", legible: true, titular: "Marcela Ríos", servicio: "luz", direccion: "Gorriti 4500, CABA" },
  gas: { tipo: "servicio", legible: true, titular: "Marcela Ríos", servicio: "gas", direccion: "Gorriti 4500, CABA" },
} satisfies Record<string, LecturaDocumento>;

test("procesarDocumentos: clasifica, guarda sin el número de DNI, y con todo los adjunta a la orden", async () => {
  const f = fichaAceptada();
  const m = mundoDocumentos({ a: L.frente, b: L.dorso, c: L.luz, d: L.gas });
  const r1 = await procesarDocumentos(f, [item("a"), item("b")], m.deps);
  assert.equal(r1.cambio, true);
  assert.ok(Math.abs(r1.costoUsd - 0.0008) < 1e-9);
  assert.equal(m.adjuntados.length, 0, "todavía faltan los servicios");
  const d = f.alquiler!.documentos!;
  assert.equal(d.recibidos.length, 2);
  assert.ok(!JSON.stringify(f).includes("30.123.456") && !JSON.stringify(f).includes("30123456"), "el número de DNI no se guarda");
  assert.ok(!JSON.stringify(f).includes("Siempreviva"), "la dirección del DNI no se guarda");

  await procesarDocumentos(f, [item("a"), item("b"), item("c"), item("d")], m.deps);
  assert.deepEqual(m.clasificados, ["a", "b", "c", "d"], "lo ya clasificado no se vuelve a mandar");
  assert.equal(d.direccionActual, "Gorriti 4500, CABA", "la que vale es la de los servicios");
  assert.equal(d.completosAt, AHORA);
  assert.equal(m.adjuntados.length, 1);
  assert.equal(m.adjuntados[0].ordenId, 777);
  assert.deepEqual(m.adjuntados[0].nombres, ["DNI frente.jpg", "DNI dorso.jpg", "Servicio 1 - luz.jpg", "Servicio 2 - gas.jpg"]);
  assert.match(m.adjuntados[0].nota, /Dirección actual según los servicios: Gorriti 4500, CABA/);
  assert.deepEqual(d.adjuntados, { ordenId: 777, ordenNombre: "S03100", at: AHORA, subidos: 4 });
  assert.ok(m.eventos.some((e) => /Documentos del alquiler completos/.test(e)));
  assert.ok(m.eventos.some((e) => /Se adjuntaron los documentos del cliente a la orden S03100/.test(e)));

  // Ya adjuntados: lo que llegue después lo mira el equipo, no se clasifica.
  const r3 = await procesarDocumentos(f, [item("e")], m.deps);
  assert.equal(r3.cambio, false);
  assert.equal(m.clasificados.length, 4);
});

test("procesarDocumentos: sin la orden de Odoo quedan esperando (un aviso) y se adjuntan cuando aparece", async () => {
  const f = fichaAceptada();
  const m = mundoDocumentos({ a: L.frente, b: L.dorso, c: L.luz, d: L.gas }, { orden: null });
  await procesarDocumentos(f, [item("a"), item("b"), item("c"), item("d")], m.deps);
  await procesarDocumentos(f, [], m.deps);
  assert.equal(m.eventos.filter((e) => /esperan la orden/.test(e)).length, 1);
  assert.equal(f.alquiler!.documentos!.esperanOrden, true);
  m.orden = { id: 9, nombre: "S03200" };
  const r = await procesarDocumentos(f, [], m.deps);
  assert.equal(r.cambio, true);
  assert.equal(f.alquiler!.documentos!.adjuntados?.ordenNombre, "S03200");
  assert.equal(f.alquiler!.documentos!.esperanOrden, false);
});

test("procesarDocumentos: si Odoo falla queda un evento y se reintenta; si la visión falla, el documento queda «sin_leer»", async () => {
  const f = fichaAceptada();
  const m = mundoDocumentos({ a: L.frente, b: L.dorso, c: L.luz, d: L.gas }, { adjuntarFalla: true });
  await procesarDocumentos(f, [item("a"), item("b"), item("c"), item("d")], m.deps);
  assert.equal(f.alquiler!.documentos!.adjuntados, null);
  assert.ok(m.eventos.some((e) => /No se pudieron adjuntar.*Odoo no responde/.test(e)));

  const g = fichaAceptada();
  const m2 = mundoDocumentos({ a: new Error("429 de la API") });
  const r = await procesarDocumentos(g, [item("a")], m2.deps);
  assert.equal(r.cambio, true);
  assert.equal(g.alquiler!.documentos!.recibidos[0].tipo, "sin_leer");
  assert.ok(m2.eventos.some((e) => /No se pudo revisar un documento/.test(e)));
  assert.match(textoDocumentosParaTomas(estadoDocumentos(g.alquiler!.documentos!)), /no se la pidas de nuevo/);
});

test("procesarDocumentos: sin aceptación (o sin documentos pedidos) no hace nada", async () => {
  const m = mundoDocumentos({ a: L.frente });
  const sin = { ...fichaSofiaVacia(), alquiler: { ...alquilerVacio(), documentos: documentosVacios(AHORA) } };
  assert.deepEqual(await procesarDocumentos(sin, [item("a")], m.deps), { cambio: false, costoUsd: 0 });
  assert.deepEqual(await procesarDocumentos(fichaSofiaVacia(), [item("a")], m.deps), { cambio: false, costoUsd: 0 });
  assert.equal(m.clasificados.length, 0);
});

test("leerDocumentos: lo guardado a medias se completa; lo que no es un objeto es null", () => {
  assert.equal(leerDocumentos(null), null);
  assert.equal(leerDocumentos("x"), null);
  const d = leerDocumentos({ pedidosAt: AHORA, recibidos: "x" })!;
  assert.deepEqual(d.recibidos, []);
  assert.equal(d.unSoloServicio, false);
  assert.equal(d.adjuntados, null);
});
