import { test } from "node:test";
import assert from "node:assert/strict";
import { duenoVigente, notasDe, ordenarDecisiones, propiosDeDecisiones, resumenReunion, textoVence, tituloCierre, visibles } from "./decisiones.ts";
import type { Decision, Severidad } from "../tipos.ts";

const d = (id: string, sev: Severidad, vence: string | null = null, extra: Partial<Decision> = {}): Decision => ({
  id, sev, vence, pantalla: "caja", duenoSugerido: null, corto: [id], que: [id], pregunta: "¿?", ...extra,
});

test("decisiones: rojo, ámbar, gris; a igual severidad, la de fecha más próxima primero y sin fecha al final", () => {
  const r = ordenarDecisiones([[d("gris", "gris"), d("rojoSinFecha", "rojo"), d("ambar", "ambar", "2026-10-20")], [d("rojoTarde", "rojo", "2026-11-01"), d("rojoPronto", "rojo", "2026-10-16")]]);
  assert.deepEqual(r.map((x) => x.id), ["rojoPronto", "rojoTarde", "rojoSinFecha", "ambar", "gris"]);
});

test("decisiones: sin repetidas (gana la primera área) y estable", () => {
  const r = ordenarDecisiones([[d("x", "rojo", null, { pantalla: "caja" }), d("a", "rojo")], [d("x", "gris", null, { pantalla: "calle" })]]);
  assert.deepEqual(r.map((x) => `${x.id}:${x.pantalla}`), ["x:caja", "a:caja"]);
});

test("decisiones: máximo 5 visibles salvo 'Ver todas'", () => {
  const ds = Array.from({ length: 7 }, (_, i) => d(`d${i}`, "ambar"));
  assert.equal(visibles(ds, false).length, 5);
  assert.equal(visibles(ds, true).length, 7);
});

test("vence: hoy, mañana, en n días y vencida", () => {
  assert.equal(textoVence(null, "2026-10-15"), null);
  assert.equal(textoVence("2026-10-15", "2026-10-15"), "vence jue 15/10 · hoy");
  assert.equal(textoVence("2026-10-16", "2026-10-15"), "vence vie 16/10 · mañana");
  assert.equal(textoVence("2026-10-20", "2026-10-15"), "vence mar 20/10 · en 5 días");
  assert.equal(textoVence("2026-10-13", "2026-10-15"), "venció mar 13/10 · hace 2 días");
});

test("dueño: lo guardado gana (también 'sin dueño'); si no hay fila, el sugerido", () => {
  const x = d("ministerio", "rojo", null, { duenoSugerido: "Jorge" });
  assert.equal(duenoVigente(x, {}), "Jorge");
  assert.equal(duenoVigente(x, { ministerio: "Gabriel" }), "Gabriel");
  assert.equal(duenoVigente(x, { ministerio: null }), null);
});

test("notas: las de la decisión, de la más vieja a la más nueva", () => {
  const n = (id: string, alertaId: string, fecha: string) => ({ id, alertaId, texto: id, dueno: null, reunion: false, autor: null, fecha });
  const r = notasDe("a", [n("2", "a", "2026-10-14"), n("x", "b", "2026-10-01"), n("1", "a", "2026-10-01")]);
  assert.deepEqual(r.map((x) => x.id), ["1", "2"]);
});

test("propios: sólo viajan dueños y notas de las decisiones visibles (lo reservado no se cuela)", () => {
  const r = propiosDeDecisiones(["a"], { a: "Jorge", politica: "Gabriel" }, [{ alertaId: "a", t: 1 }, { alertaId: "politica", t: 2 }]);
  assert.deepEqual(r.duenos, { a: "Jorge" });
  assert.deepEqual(r.notas, [{ alertaId: "a", t: 1 }]);
});

test("cierre de la reunión: acuerdos y dueños distintos; el resumen no lleva lo reservado", () => {
  assert.equal(tituloCierre([{ dueno: "Jorge" }, { dueno: "Jorge" }, { dueno: null }]), "3 acuerdos, 1 dueño");
  assert.equal(tituloCierre([]), "0 acuerdos, 0 dueños");
  const t = resumenReunion("15/10/2026", [
    { pregunta: "¿Carta documento?", texto: "Llamo el martes.", dueno: "Jorge" },
    { pregunta: "¿Retiros?", texto: "Secreto", dueno: "Gabriel", reservado: true },
  ]);
  assert.equal(t, "Reunión de socios 15/10/2026\n• ¿Carta documento? Llamo el martes. (Jorge)");
  assert.equal(resumenReunion("15/10/2026", []), "Reunión de socios 15/10/2026\nSin acuerdos anotados.");
});

test("reservaDeNota: el servidor decide si la nota es reservada (no el navegador)", async () => {
  const { marcaDe, reservaDeNota, reservaDeDueno } = await import("./decisiones.ts");
  const ds = [
    { id: "politica", reservado: true },
    { id: "cobertura", soloConSocios: true },
    { id: "cobertura" },
    { id: "ministerio" },
  ];
  // Decisión de socios: reservada; quien no es socio no puede anotar.
  assert.deepEqual(reservaDeNota(marcaDe("politica", ds), true), { ok: true, reservado: true });
  assert.equal(reservaDeNota(marcaDe("politica", ds), false).ok, false);
  // Con versión de socios: la nota del socio queda reservada; la del resto, no.
  assert.deepEqual(reservaDeNota(marcaDe("cobertura", ds), true), { ok: true, reservado: true });
  assert.deepEqual(reservaDeNota(marcaDe("cobertura", ds), false), { ok: true, reservado: false });
  // Pública: no reservada para nadie.
  assert.deepEqual(reservaDeNota(marcaDe("ministerio", ds), true), { ok: true, reservado: false });
  // No existe: 409. Sin La semana (Odoo caído): socio → reservada; resto → reintentar.
  assert.equal((reservaDeNota(marcaDe("inventada", ds), true) as { status: number }).status, 409);
  assert.deepEqual(reservaDeNota(null, true), { ok: true, reservado: true });
  assert.equal((reservaDeNota(null, false) as { status: number }).status, 503);
  // Dueños: reservado sólo si la decisión es de socios.
  assert.deepEqual(reservaDeDueno(marcaDe("cobertura", ds), true), { ok: true, reservado: false });
  assert.deepEqual(reservaDeDueno(marcaDe("politica", ds), true), { ok: true, reservado: true });
  assert.equal(reservaDeDueno(marcaDe("politica", ds), false).ok, false);
});

test("metasVisibles: sin socios, fuera las metas de indicadores reservados", async () => {
  const { metasVisibles } = await import("../diccionario.ts");
  assert.deepEqual(metasVisibles({ retiros: 1, caja_disponible: 2 }, false), { caja_disponible: 2 });
  assert.deepEqual(metasVisibles({ retiros: 1, caja_disponible: 2 }, true), { retiros: 1, caja_disponible: 2 });
});
