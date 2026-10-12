// El Depósito como sector (rediseño F2, docs/equipos-del-dia/rediseno-plan.md): una hoja más
// con la cuadrilla 0. Recibe gente y encargado; no va al parte, ni a las alertas, ni lleva
// camiones ni contratistas; su encargado recibe la hoja como un capataz.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiaHoja } from "./tipos.ts";
import { DEPOSITO } from "./tipos.ts";
import {
  bandeja, destinatarios, horariosCierre, planCopiarComoHoy, planPrecarga, problemas, sinAsignar,
} from "./estado.ts";
import { filaEnvio, mensajeHoja, mensajeOperario } from "./mensajes.ts";
import { pizarron, sinAsignarPizarron } from "./pizarron.ts";
import { destinoDeTecla, soltar } from "./gestos-pizarron.ts";
import { aplicarOptimista } from "./optimista.ts";
import { fila, hoja, martesArmado, martesVacio, MEDINA_ART } from "./escenario.test-fixture.ts";

const LUNES_1830 = -330;
const DEP = { lugar: "deposito" as const, texto: null, hora: "7:00" };

/** El martes armado con Ramírez en el depósito (a cargo, salvo que se diga). */
function conDeposito(gente = ["ramirez"], aCargo: string | null = "ramirez"): DiaHoja {
  const d = martesArmado();
  // Una persona en un solo lugar: los del depósito salen de su cuadrilla.
  const hojas = d.hojas.map((h) => ({ ...h, integrantes: h.integrantes.filter((i) => !gente.includes(i.personaId)) }));
  return { ...d, hojas: [...hojas, hoja(DEPOSITO, gente, aCargo, { id: "h13-0", encuentro: DEP })] };
}

test("el que está en el depósito no figura «Sin asignar» y aparece una sola vez (en la columna D)", () => {
  const d0 = martesArmado();
  assert.ok(sinAsignar(d0).includes("ramirez"));
  const d = conDeposito();
  assert.ok(!sinAsignar(d).includes("ramirez"));
  assert.ok(!sinAsignarPizarron(d).includes("ramirez"));
  const v = pizarron(d, LUNES_1830);
  const dep = v.columnas.at(-1)!;
  assert.equal(dep.c, DEPOSITO);
  assert.deepEqual(dep.gente.map((x) => [x.pid, x.aCargo]), [["ramirez", true]]);
  assert.deepEqual(dep.camiones, []);
  assert.equal(v.columnas.filter((c) => c.gente.some((x) => x.pid === "ramirez")).length, 1);
});

test("problemas del depósito: sólo su gente; sin encargado es un aviso, no frena", () => {
  assert.deepEqual(problemas(conDeposito(), DEPOSITO, LUNES_1830), []);
  const sin = problemas(conDeposito(["ramirez"], null), DEPOSITO, LUNES_1830);
  assert.deepEqual(sin.map((p) => [p.k, p.nivel]), [["cargo", "aviso"]]);
  assert.match(sin[0].card, /^Sin encargado/);
  // Nada de cupo ("falta N personas"), camiones ni lleva/busca.
  const d = conDeposito(["ramirez", "medina"]);
  const ds: DiaHoja = { ...d, ausencias: [...d.ausencias, MEDINA_ART] };
  const ps = problemas(ds, DEPOSITO, LUNES_1830);
  assert.deepEqual(ps.map((p) => p.k), ["aus-medina"]);
  assert.match(ps[0].t, /está en el depósito y no viene/);
});

test("la bandeja: el depósito no aparece como «sin obras» ni cuenta en «hojas sin enviar»", () => {
  const d = conDeposito();
  const b = bandeja(d, LUNES_1830);
  assert.ok(!b.vos.some((x) => x.k.startsWith("sinobras-")));
  assert.equal(b.total, bandeja(martesArmado(), LUNES_1830).total);
  assert.equal(b.sinEnv, bandeja(martesArmado(), LUNES_1830).sinEnv);
});

test("el encargado del depósito recibe su hoja: está en Mandar, con su mensaje y su fila", () => {
  const d = conDeposito(["ramirez", "paz"]);
  const x = destinatarios(d).find((y) => y.pid === "ramirez");
  assert.deepEqual(x, { pid: "ramirez", rol: "cargo", c: DEPOSITO });
  const m = mensajeHoja(d, "ramirez", DEPOSITO, { canal: "telegram", link: null, ahora: LUNES_1830 });
  assert.match(m, /^Hola Ramírez, tu hoja del martes 13\/10: Depósito, encargado vos\. Encuentro 7:00 en el depósito/);
  assert.match(m, /Están: Paz\./);
  assert.doesNotMatch(m, /Obra/);
  assert.equal(filaEnvio(d, x!), "Ramírez · Depósito · 2 personas");
  assert.match(mensajeOperario(d, "paz", LUNES_1830)!, /estás en el depósito \(encargado Ramírez\)\. Encuentro 7:00 en el depósito/);
  // Sin encargado no hay a quién mandarle: no aparece en la lista.
  assert.ok(!destinatarios(conDeposito(["ramirez"], null)).some((y) => y.c === DEPOSITO));
});

test("gestos: la gente entra al depósito (agregar con el 0); camiones y contratistas no", () => {
  const d = martesArmado();
  const r = soltar(d, { k: "persona", pid: "ramirez" }, { k: "columna", c: DEPOSITO }, LUNES_1830);
  assert.equal(r.k, "gestos");
  assert.deepEqual(r.k === "gestos" ? r.gestos : null, [{ k: "hoja", a: { accion: "agregar", fecha: d.fecha, cuadrilla: DEPOSITO, personaId: "ramirez", reemplaza: null } }]);
  const cam = soltar(d, { k: "camion", veh: "ab497", filaId: null, c: null }, { k: "columna", c: DEPOSITO }, LUNES_1830);
  assert.deepEqual(cam, { k: "rechazo", motivo: "El depósito no lleva camiones: dejalo en «Camiones libres»" });
  const k = soltar(d, { k: "contratista", kid: "quintana" }, { k: "gente", c: DEPOSITO }, LUNES_1830);
  assert.equal(k.k, "rechazo");
  // La tecla D: la gente al depósito; un camión, nada.
  assert.deepEqual(destinoDeTecla(d, "d", [1, 2, 3, 4, 5, 0], { k: "persona", pid: "ramirez" }), { k: "columna", c: DEPOSITO });
  assert.equal(destinoDeTecla(d, "D", [1, 2, 3, 4, 5, 0], { k: "camion", veh: "ab497", filaId: null, c: null }), null);
});

test("al instante (optimista): la primera persona arma la hoja del depósito, que se encuentra en el depósito", () => {
  const d = martesArmado();
  const n = aplicarOptimista(d, { accion: "agregar", fecha: d.fecha, cuadrilla: DEPOSITO, personaId: "ramirez" })!;
  const h = n.hojas.find((x) => x.cuadrillaOdooId === DEPOSITO)!;
  assert.deepEqual(h.integrantes.map((i) => i.personaId), ["ramirez"]);
  assert.equal(h.encuentro.lugar, "deposito");
  assert.equal(h.encuentro.hora, "7:00");
});

test("precarga «como hoy»: copia el depósito del día anterior, después de las cuadrillas y sin camiones", () => {
  const d0 = martesVacio();
  const ant = d0.anterior!;
  const d: DiaHoja = {
    ...d0,
    anterior: { ...ant, hojas: [...ant.hojas, hoja(DEPOSITO, ["ramirez", "paz", "medina"], "ramirez", { encuentro: DEP, vehiculos: [fila("x", "todo_el_dia", "gomez", "ab497")] }, ant.fecha)] },
  };
  const plan = planPrecarga(d, "hoy");
  const dep = plan.hojas.at(-1)!;
  assert.equal(dep.cuadrillaOdooId, DEPOSITO);
  // Medina está de ART (asistencia): no entra, y el aviso no habla de cupo.
  assert.deepEqual(dep.gente, ["ramirez", "paz"]);
  assert.equal(dep.aCargoId, "ramirez");
  assert.deepEqual(dep.vehiculos, []);
  assert.deepEqual(dep.encuentro, { lugar: "deposito", texto: null, hora: "7:00" });
  assert.ok(plan.avisos.some((a) => /^Medina no entra: .*No va al depósito\.$/.test(a)));
  assert.ok(!plan.avisos.some((a) => /Depósito no tiene obras/.test(a)));
  // Con el plantel o vacío, el depósito no se arma solo.
  assert.ok(!planPrecarga(d, "vacio").hojas.some((h) => h.cuadrillaOdooId === DEPOSITO));
  // "Copiar como hoy" de la columna del depósito.
  const c = planCopiarComoHoy(d, DEPOSITO)!;
  assert.deepEqual([c.gente, c.vehiculos], [["ramirez", "paz"], []]);
});

test("el depósito no tiene «Cerrar jornada» (no hay parte de Odoo)", () => {
  assert.deepEqual(horariosCierre(conDeposito(), DEPOSITO, 2391), []);
});

test("del depósito puede llevar y traer a una cuadrilla; todo el día con una, no", () => {
  const conChofer = (modo: "lleva_trae" | "todo_el_dia") => {
    const d = conDeposito(["ramirez", "gomez"]);
    return { ...d, hojas: d.hojas.map((h) => (h.cuadrillaOdooId === 4 ? { ...h, vehiculos: [fila("f-4", modo, "gomez", "ab497")] } : h)) };
  };
  assert.ok(!problemas(conChofer("lleva_trae"), 4, LUNES_1830).some((p) => p.k.startsWith("chint-")));
  const todo = problemas(conChofer("todo_el_dia"), 4, LUNES_1830).find((p) => p.k.startsWith("chint-"));
  assert.ok(todo);
  assert.equal(todo.card, "Gómez está en el depósito");
});
