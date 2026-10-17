import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aReporteFila, avisosComentario, avisosConfirmar, avisosReporteNuevo, avisosRevision, banderasConversacion, ecoSlackReporteNuevo,
  calcularMetricas, dispositivoDe, esFaltante, eventosPublicos, type FilaEvento, type FilaReporte, type ResultadoRevisar,
} from "./servidor.ts";
import { contextoVacio } from "./contexto.ts";

const ev = (id: number, tipo: FilaEvento["tipo"], lado: FilaEvento["lado"], texto: string | null = null): FilaEvento =>
  ({ id, tipo, lado, de: null, a: null, texto, created_at: "2026-10-17T10:00:00Z" });

test("esFaltante: tabla, función o bucket que no existen", () => {
  assert.ok(esFaltante({ code: "42P01", message: "relation \"sis_reportes\" does not exist" }));
  assert.ok(esFaltante({ code: "PGRST205", message: "Could not find the table 'public.sis_reportes' in the schema cache" }));
  assert.ok(esFaltante({ code: "PGRST202", message: "Could not find the function public.sis_crear_reporte(p) in the schema cache" }));
  assert.ok(esFaltante({ code: "42883", message: "function sis_comentar does not exist" }));
  assert.ok(esFaltante({ message: "Bucket not found", statusCode: "404" }));
  assert.ok(!esFaltante({ code: "P0001", message: "Ese reporte no existe." }));
  assert.ok(!esFaltante(null));
});

test("banderas: esperando respuesta y respuesta sin leer", () => {
  assert.deepEqual(banderasConversacion([ev(1, "creado", "usuario")]), { esperandoRespuesta: false, respuestaSinLeer: false });
  assert.deepEqual(
    banderasConversacion([ev(1, "creado", "usuario"), ev(2, "comentario", "sistemas", "¿Me mandás una foto?")]),
    { esperandoRespuesta: true, respuestaSinLeer: false },
  );
  assert.deepEqual(
    banderasConversacion([ev(1, "creado", "usuario"), ev(3, "comentario", "usuario", "Ahí va"), ev(2, "comentario", "sistemas", "¿Foto?")]),
    { esperandoRespuesta: false, respuestaSinLeer: true },
  );
  // Un cambio de estado de Sistemas posterior «lee» la respuesta.
  assert.equal(
    banderasConversacion([ev(1, "creado", "usuario"), ev(2, "comentario", "usuario", "Más datos"), ev(3, "estado", "sistemas")]).respuestaSinLeer,
    false,
  );
  // Sin nada de Sistemas, un mensaje de quien reportó ya es «sin leer».
  assert.equal(banderasConversacion([ev(1, "creado", "usuario"), ev(2, "comentario", "usuario", "Me olvidé")]).respuestaSinLeer, true);
});

test("eventosPublicos: sin prioridad ni duplicado, en orden", () => {
  const l = eventosPublicos([ev(3, "prioridad", "sistemas"), ev(2, "comentario", "sistemas", "hola"), ev(1, "creado", "usuario"), ev(4, "duplicado", "sistemas")]);
  assert.deepEqual(l.map((e) => e.id), [1, 2]);
  assert.equal(l[1].createdAt, "2026-10-17T10:00:00Z");
});

test("aReporteFila: pantalla de la ruta, descripción recortada y creador por defecto", () => {
  const f = {
    id: "r", numero: 7, tipo: "correccion", descripcion: "x".repeat(400), frena: false, estado: "nuevo", motivo_descarte: null,
    duplicado_de: null, prioridad: null, ruta: "/planificacion/hoja?d=1", modulo: "hoja-dia", titulo_pantalla: null,
    sha_cliente: null, sha_servidor: null, contexto: {}, creado_por: "u", created_at: "a", ultima_actividad_at: "b",
    cerrado_at: null, confirmado_ok: null, capturas: [{ id: "c", path: "p", ancho: 1, alto: 1, orden: 0 }], eventos: [],
  } as FilaReporte;
  const r = aReporteFila(f, undefined, { recortar: 300 });
  assert.equal(r.pantalla, "Hoja del día");
  assert.equal(r.descripcion.length, 300);
  assert.equal(r.cantCapturas, 1);
  assert.equal(r.creador.nombre, "Alguien del equipo");
});

test("dispositivoDe: el que mandó el navegador o el que se arma del userAgent", () => {
  assert.equal(dispositivoDe(null), "Sin datos");
  const c = contextoVacio();
  c.navegador.userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1";
  c.pantalla.ancho = 390;
  c.pantalla.alto = 844;
  assert.equal(dispositivoDe(c), "iPhone · Safari 18 · 390×844");
  c.dispositivo = "Otro";
  assert.equal(dispositivoDe(c), "Otro");
});

test("métricas: semana, primera respuesta, resolver, preguntamos", () => {
  const ahora = Date.parse("2026-10-17T12:00:00Z");
  const dia = 24 * 60 * 60 * 1000;
  const iso = (d: number) => new Date(ahora - d * dia).toISOString();
  const m = calcularMetricas({
    ahora,
    reportes: [
      { id: "a", creado_por: "u1", created_at: iso(2), estado: "resuelto", cerrado_at: iso(1) },
      { id: "b", creado_por: "u1", created_at: iso(3), estado: "visto", cerrado_at: null },
      { id: "c", creado_por: "u2", created_at: iso(10), estado: "en_curso", cerrado_at: null },
      { id: "d", creado_por: "u3", created_at: iso(40), estado: "resuelto", cerrado_at: iso(5) },
    ],
    eventosSistemas: [
      { reporte_id: "a", tipo: "estado", texto: null, created_at: iso(1.5) },
      { reporte_id: "a", tipo: "comentario", texto: "¿Me mandás una foto?", created_at: iso(1.8) },
      { reporte_id: "c", tipo: "comentario", texto: "Lo miro", created_at: iso(9) },
    ],
    recorrido: { hicieron: 3, total: 10 },
  });
  assert.deepEqual(m.semana, { reportes: 2, personas: 1 });
  // a: 0,2 días (iso(2) → iso(1.8)); c: 1 día. Promedio 0,6.
  assert.equal(m.primeraRespuestaDias, 0.6);
  // a: 1 día; d: 35 días (cerrado hace 5, creado hace 40). Promedio 18.
  assert.equal(m.resolverDias, 18);
  // De los 3 de 30 días, preguntamos en 1.
  assert.equal(m.preguntamosPct, 33);
  assert.deepEqual(m.recorrido, { hicieron: 3, total: 10 });
  const vacio = calcularMetricas({ ahora, reportes: [], eventosSistemas: [], recorrido: null });
  assert.deepEqual(vacio, { semana: { reportes: 0, personas: 0 }, primeraRespuestaDias: null, resolverDias: null, preguntamosPct: null, recorrido: null });
});

test("avisos de reporte nuevo: uno por revisor, nunca al que reportó, Slack una sola vez", () => {
  const base = { id: "r1", numero: 5, tipo: "error" as const, pantalla: "Partes de obra" };
  const comun = avisosReporteNuevo({ ...base, frena: false, autorId: "u", revisores: ["js", "jp", "js"] });
  assert.equal(comun.length, 2);
  assert.deepEqual(comun.map((a) => a.clave), ["sistemas:5:nuevo:js", "sistemas:5:nuevo:jp"]);
  assert.ok(comun.every((a) => a.tipo === "sistemas_reporte" && a.espejoSlack === false && a.enlace === "/sistemas/revision?id=r1"));
  assert.equal(comun[0].titulo, "Nuevo reporte #5 en Partes de obra (Error)");
  assert.ok(!comun.some((a) => (a.titulo + (a.descripcion ?? "")).includes("cartel")));

  const frena = avisosReporteNuevo({ ...base, frena: true, autorId: "js", revisores: ["js", "jp", "otro"] });
  assert.deepEqual(frena.map((a) => a.destinatarioId), ["jp", "otro"]);
  assert.deepEqual(frena.map((a) => a.espejoSlack), [true, false]);
  assert.ok(frena.every((a) => a.tipo === "sistemas_bloqueante" && a.prioridad === "alta"));
  assert.match(frena[0].titulo, /^Frena el trabajo: reporte #5/);

  // Sin revisores aparte de quien reportó: ninguna campanita (tampoco a los admins, que no pueden
  // abrir la bandeja); lo que frena sale sólo a Slack.
  const solo = { ...base, frena: true, autorId: "js", revisores: ["js"] };
  const sinRevisores = avisosReporteNuevo(solo);
  assert.deepEqual(sinRevisores, []);
  const eco = ecoSlackReporteNuevo(solo, sinRevisores);
  assert.ok(eco && eco.tipo === "sistemas_bloqueante" && !eco.destinatarioId && !eco.destinatarioRol);
  assert.match(eco.titulo, /^Frena el trabajo: reporte #5/);
  assert.equal(ecoSlackReporteNuevo(solo, frena), null);
  const comunSolo = { ...base, frena: false, autorId: "u", revisores: [] };
  assert.deepEqual(avisosReporteNuevo(comunSolo), []);
  assert.equal(ecoSlackReporteNuevo(comunSolo, []), null);
});

const revisado = (extra: Partial<ResultadoRevisar>): ResultadoRevisar => ({
  id: "r1", numero: 9, creado_por: "autor", estado_anterior: "visto", estado: "visto", cambio_estado: false, cambio_prioridad: false,
  motivo_descarte: null, estado_evento_id: null, comentario_id: null, duplicados: [], ...extra,
});

test("avisos de revisión: estado (salvo visto) o mensaje, uno solo; duplicados al resolver", () => {
  assert.deepEqual(avisosRevision(revisado({ cambio_estado: true, estado: "visto", estado_evento_id: 3 }), "js"), []);
  assert.deepEqual(avisosRevision(revisado({ cambio_prioridad: true }), "js"), []);

  const curso = avisosRevision(revisado({ cambio_estado: true, estado: "en_curso", estado_evento_id: 4, comentario_id: 5 }), "js");
  assert.equal(curso.length, 1);
  assert.equal(curso[0].clave, "sistemas:ev4:autor");
  assert.equal(curso[0].titulo, "Tu reporte #9: Lo están arreglando");
  assert.equal(curso[0].enlace, "/sistemas/mis-reportes?id=r1");
  assert.equal(curso[0].tipo, "sistemas_novedad");

  const mensaje = avisosRevision(revisado({ comentario_id: 6 }), "js");
  assert.deepEqual(mensaje.map((a) => [a.clave, a.titulo]), [["sistemas:ev6:autor", "Sistemas te respondió sobre el #9"]]);

  const dup = avisosRevision(revisado({ cambio_estado: true, estado: "descartado", motivo_descarte: "duplicado", estado_evento_id: 7 }), "js");
  assert.equal(dup[0].titulo, "Tu reporte #9: otra persona ya lo había avisado");
  const existe = avisosRevision(revisado({ cambio_estado: true, estado: "descartado", motivo_descarte: "ya_existe", estado_evento_id: 8 }), "js");
  assert.equal(existe[0].titulo, "Tu reporte #9: eso ya se puede hacer");

  const resuelto = avisosRevision(
    revisado({
      cambio_estado: true, estado: "resuelto", estado_evento_id: 8,
      duplicados: [{ id: "d1", numero: 11, creado_por: "otra" }, { id: "d2", numero: 12, creado_por: "js" }],
    }),
    "js",
  );
  assert.deepEqual(resuelto.map((a) => [a.clave, a.titulo, a.enlace]), [
    ["sistemas:ev8:autor", "Tu reporte #9: ¡Listo!", "/sistemas/mis-reportes?id=r1"],
    ["sistemas:ev8:dupd1:otra", "Tu reporte #11: ¡Listo!", "/sistemas/mis-reportes?id=d1"],
  ]);

  // El revisor que revisa su propio reporte no se avisa a sí mismo.
  assert.deepEqual(avisosRevision(revisado({ creado_por: "js", comentario_id: 6 }), "js"), []);
});

test("avisos de comentarios y confirmaciones", () => {
  const deSistemas = avisosComentario({ id: 20, reporte_id: "r1", numero: 9, creado_por: "autor", lado: "sistemas", estado_anterior: "nuevo", estado: "visto" }, "js", []);
  assert.deepEqual(deSistemas.map((a) => [a.tipo, a.clave, a.destinatarioId]), [["sistemas_novedad", "sistemas:ev20:autor", "autor"]]);

  const delUsuario = avisosComentario({ id: 21, reporte_id: "r1", numero: 9, creado_por: "autor", lado: "usuario", estado_anterior: "visto", estado: "visto" }, "autor", ["js", "jp", "autor"]);
  assert.deepEqual(delUsuario.map((a) => a.clave), ["sistemas:ev21:js", "sistemas:ev21:jp"]);
  assert.ok(delUsuario.every((a) => a.tipo === "sistemas_respuesta" && a.titulo === "Respuesta en el reporte #9" && a.enlace === "/sistemas/revision?id=r1"));

  const sigue = avisosConfirmar({ numero: 9, creado_por: "autor", estado: "visto", reabierto: true, evento_id: 30 }, "r1", "autor", ["js"]);
  assert.deepEqual(sigue.map((a) => [a.clave, a.titulo]), [["sistemas:ev30:js", "El reporte #9 sigue pasando: se reabrió"]]);
  assert.deepEqual(avisosConfirmar({ numero: 9, creado_por: "autor", estado: "resuelto", reabierto: false, evento_id: 31 }, "r1", "autor", ["js"]), []);
});
