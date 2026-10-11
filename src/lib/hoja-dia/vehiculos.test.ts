// Los vehículos de una hoja y el chofer de cada viaje (decisiones del dueño del 11/10), con
// el escenario de la maqueta (martes 13/10):
// 1. Chofer y vehículo son independientes: el habitual es sólo la sugerencia, nunca un
//    problema. Los choques reales: el mismo vehículo o el mismo chofer en dos lugares a la vez.
// 2. Armadores que también manejan (Conte): a cargo y chofer de su cuadrilla, cuenta una vez.
// 3. Varios vehículos por hoja, cada uno con su modo.
// 4. Lleva y trae sobre la marcha: vuelve al depósito (y queda libre), busca con otro camión,
//    a definir o vuelven solos.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcVeh, camionesQueSirven, choferesElegibles, choferesTxt, crucesChofer, dondeAnda, fotoDe, hojaDeCuadrilla, panelGente, problemas,
  sinAsignar, vanDe, viajesChofer, diferencias, destinatarios, avisosVeh,
} from "./estado.ts";
import type { DiaHoja, VehiculoHoja } from "./tipos.ts";
import { enviarATodos, fila, martesArmado, pedido, viaje, OT } from "./escenario.test-fixture.ts";
import { planVehiculos, quienBusca, resumenLegado } from "./vehiculos.ts";
import { opcionesChofer, opcionesVehiculo, resumenVehiculos, chipsDe, quienesVan } from "./vista-cuadrillas.ts";
import { choferesEnPalabras, mensajeHoja } from "./mensajes.ts";

const LUN_1830 = -330;
const o = () => { let n = 0; return { nuevoId: (q: string) => `n-${q}-${++n}`, ahora: -300 }; };
const linea = (r: { k: string; resto: { t: string }[] }) => r.k + r.resto.map((x) => x.t).join("");
const conFilas = (d: DiaHoja, c: number, vehiculos: VehiculoHoja[]): DiaHoja => ({ ...d, hojas: d.hojas.map((h) => (h.cuadrillaOdooId === c ? { ...h, vehiculos } : h)) });
/** Aplica un plan como lo haría el servidor (los ids nuevos quedan como las claves del plan). */
function aplicar(d: DiaHoja, c: number, p: ReturnType<typeof planVehiculos>): DiaHoja {
  const borrar = new Set(p.viajes.borrar);
  const cambios = new Map(p.viajes.cambiar.map((x) => [x.id, x.valores]));
  return {
    ...d,
    hojas: d.hojas.map((h) => (h.cuadrillaOdooId === c ? { ...h, vehiculos: p.filas, encuentro: p.encuentro ?? h.encuentro } : h)),
    viajes: [...d.viajes.filter((v) => !borrar.has(v.id)).map((v) => ({ ...v, ...cambios.get(v.id) })), ...p.viajes.crear],
  };
}

// ─── 1. Chofer y vehículo independientes ────────────────────────────────────

test("el habitual distinto NO avisa: Nuñez con la hidrogrúa de Borda", () => {
  // La captura del dueño: Cuadrilla 1, "Lleva y trae · Nuñez · AB 831 LC". Borda es el
  // habitual del AB 831 LC (y su chofer sugerido del día): antes salía en rojo "El AB 831
  // LC lo maneja Borda el martes".
  let d = martesArmado();
  d = conFilas(d, 1, [fila("f1", "lleva_trae", "nunez", "ab831")]);
  // Nuñez no va todo el día con la 5 en esta prueba (la 5 va sin chofer).
  d = conFilas(d, 5, []);
  const ps = problemas(d, 1, LUN_1830);
  assert.ok(!ps.some((p) => /lo maneja/.test(p.t)), ps.map((p) => p.t).join("\n"));
  assert.ok(!ps.some((p) => p.k.startsWith("veh")), ps.map((p) => p.t).join("\n"));
  // El selector de vehículo no dice "lo maneja Kiska": dice qué hace el camión ese día.
  const ov = opcionesVehiculo(d, 2);
  assert.ok(ov.every((x) => !/lo maneja/.test(x.label)), ov.map((x) => x.label).join("\n"));
  assert.match(ov.find((x) => x.value === "ab497")!.label, /^AB 497 YY · camión · 3 viajes$/);
});

test("un camión con dos choferes en el día: cada viaje dice el suyo y la fila muestra los tramos", () => {
  const d = martesArmado();
  // La VTV y los busca de la tarde de Kiska los hace Nuñez (Kiska se va a las 13).
  d.viajes = d.viajes.map((v) => (["v-vtv", "c3-busca", "c2-busca"].includes(v.id) ? { ...v, choferId: "gomez" } : v));
  assert.equal(choferesTxt(d, "af669"), "Kiska → Gómez 14:00");
  assert.ok(viajesChofer(d, "gomez").some((v) => v.id === "c3-busca"));
  assert.ok(!viajesChofer(d, "kiska").some((v) => v.id === "c3-busca"));
  // Ni la tarjeta ni el camión lo marcan como problema.
  assert.ok(!problemas(d, 3, LUN_1830).some((p) => /maneja/.test(p.t)));
});

test("choque real de vehículo: la hidrogrúa todo el día con la 1 y lleva y trae con la 4", () => {
  let d = martesArmado();
  d = conFilas(d, 4, [fila("f4", "lleva_trae", "gomez", "ab831")]);
  const t = problemas(d, 4, LUN_1830).map((p) => p.t);
  assert.ok(t.includes("El AB 831 LC está todo el día con la Cuadrilla 1"), t.join("\n"));
});

test("choque real de chofer: Kiska en dos camiones a la vez", () => {
  let d = martesArmado();
  // La 4 la lleva Kiska en el AB 497 YY a las 7:15, mientras con el AF 669 ZL lleva a la 2 a las 7:00.
  d = conFilas(d, 4, [fila("f4", "lleva_trae", "kiska", "ab497")]);
  d.viajes = [...d.viajes, viaje("c4-lleva", { tipo: "lleva", hojaId: "h13-4", hojaVehiculoId: "f4", cuadrillaOdooId: 4, vehiculoId: "ab497", choferId: "kiska", hora: "7:15", orden: 435 })];
  const cr = crucesChofer(d);
  assert.ok(cr.some((x) => x.ch === "kiska" && x.b.id === "c4-lleva"), JSON.stringify(cr.map((x) => [x.a.id, x.b.id])));
  const t = problemas(d, 4, LUN_1830).map((p) => p.t);
  assert.ok(t.some((x) => x.startsWith("Kiska no llega: lleva C2 Juramento (AF 669 ZL) termina ~7:45 y lleva C4 Gurruchaga (AB 497 YY) es a las 7:15")), t.join("\n"));
  // Con otro chofer en el AB 497 YY, no hay choque.
  const d2 = { ...d, viajes: d.viajes.map((v) => (v.id === "c4-lleva" ? { ...v, choferId: "gomez" } : v)) };
  assert.ok(!crucesChofer(d2).some((x) => x.b.id === "c4-lleva"));
});

test("el chofer de todo el día que además maneja un viaje de otra cosa en otro camión", () => {
  const d = martesArmado();
  d.viajes.push(viaje("v-borda", { tipo: "lleva_material", vehiculoId: "ab497", choferId: "borda", hacia: { otId: OT.cab, lugarId: null, texto: null }, carga: "6 tablones", hora: "11:00", orden: 660 }));
  assert.ok(avisosVeh(d, "ab497", LUN_1830).some((a) => a.k === "todoch-v-borda" && a.t.startsWith("Borda está todo el día con la Cuadrilla 1")));
});

// ─── 2. Armadores que también manejan ───────────────────────────────────────

test("Conte puede manejar: es elegible de chofer y sigue en Sin asignar si no maneja", () => {
  const d = martesArmado();
  assert.ok(choferesElegibles(d).includes("conte"));
  assert.ok(choferesElegibles(d).includes("ortega"));
  assert.ok(!choferesElegibles(d).includes("paz"));
  // No es chofer de Odoo: no aparece en el panel de Choferes mientras no maneje.
  assert.ok(!panelGente(d).choferes.some((x) => x.pid === "conte"));
  assert.match(opcionesChofer(d, 4).find((x) => x.value === "conte")!.label, /^Conte · está en la 2/);
  const libre = { ...d, hojas: d.hojas.map((h) => ({ ...h, integrantes: h.integrantes.filter((i) => i.personaId !== "conte") })) };
  assert.ok(sinAsignar(libre).includes("conte"));
});

test("Conte a cargo de la 2 y su chofer todo el día: cuenta UNA vez y no está en dos lugares", () => {
  let d = martesArmado();
  const van0 = vanDe(d, 2);
  d = conFilas(d, 2, [fila("f2", "todo_el_dia", "conte", "ab497")]);
  d.viajes = d.viajes.filter((v) => v.hojaId !== "h13-2");
  assert.equal(vanDe(d, 2), van0, "la gente de siempre: Conte ya estaba");
  assert.deepEqual(quienesVan(d, 2).con, null);
  assert.equal(chipsDe(d, 2)[0].tag, "a cargo · chofer");
  const ps = problemas(d, 2, LUN_1830);
  assert.ok(!ps.some((p) => p.k.startsWith("chint") || p.k.startsWith("chdup")), ps.map((p) => p.t).join("\n"));
  // El mensaje: "manejás vos todo el día".
  assert.match(mensajeHoja(d, "conte", 2, { canal: "telegram", link: null, ahora: LUN_1830 }), /a cargo vos\. Encuentro 7:00 en el depósito, manejás vos todo el día\./);
  // A cargo de su hoja: le llega la hoja (no la de chofer aparte).
  assert.equal(destinatarios(d).filter((x) => x.pid === "conte").length, 1);
});

test("Conte chofer de la 4 estando en la 2: eso sí es estar en dos lugares", () => {
  let d = martesArmado();
  d = conFilas(d, 4, [fila("f4", "todo_el_dia", "conte", "ab497")]);
  const t = problemas(d, 4, LUN_1830).map((p) => p.t);
  assert.ok(t.includes("Conte está en la Cuadrilla 2 y maneja todo el día con la 4"), t.join("\n"));
});

// ─── 3. Varios vehículos ────────────────────────────────────────────────────

test("dos vehículos con modos distintos: renglones, quiénes van, mensaje y foto", () => {
  let d = martesArmado();
  const p = planVehiculos(d, 1, { k: "sumar", modo: "lleva_trae", choferId: "gomez", vehiculoId: "ab497" }, o());
  d = aplicar(d, 1, p);
  const r = resumenVehiculos(d, 1);
  assert.deepEqual(r.filas.map(linea), ["Todo el día · Borda · hidrogrúa AB 831 LC", "Lleva y trae · Gómez · AB 497 YY · 7:00"]);
  assert.equal(r.busca?.map((x) => x.t).join(""), "Los busca 17:00 (Gómez · AB 497 YY)");
  assert.equal(vanDe(d, 1), 5, "Borda cuenta; Gómez los lleva y se va");
  assert.equal(choferesEnPalabras(d, 1, "sack"), ", va Borda todo el día con la hidrogrúa y te lleva Gómez");
  // La foto guarda los dos; sacar uno después de enviar se dice en palabras.
  const env = enviarATodos(d, -318, ["sack"]);
  const sinGomez = aplicar(env, 1, planVehiculos(env, 1, { k: "quitar", filaId: p.sumar[0].id }, o()));
  const e = sinGomez.envios.find((x) => x.personaId === "sack")!;
  const ds = diferencias(sinGomez, e.snap, fotoDe(sinGomez, "sack")).map((x) => x.t);
  assert.ok(ds.includes("ya no va el AB 497 YY (Gómez)"), ds.join(" | "));
  assert.ok(ds.includes("vuelven por su cuenta") === false, "sin lleva y trae no hay busca que decir");
});

test("el resumen legado de hd_hojas es el primer vehículo (rollback y migración sin duplicar)", () => {
  assert.deepEqual(resumenLegado([]), { chofer_modo: "sin", chofer_id: null, vehiculo_id: null });
  assert.deepEqual(resumenLegado([fila("b", "lleva_trae", "gomez", "ab497", 1), fila("a", "todo_el_dia", "borda", "ab831", 0)]), { chofer_modo: "todo_el_dia", chofer_id: "borda", vehiculo_id: "ab831" });
});

test("elegir un vehículo propone su chofer sólo si falta; elegir un chofer propone su vehículo sólo si falta", () => {
  const d = martesArmado();
  const a = planVehiculos(d, 4, { k: "sumar", modo: "lleva_trae", vehiculoId: "ab799" }, o());
  assert.equal(a.sumar[0].choferId, "nunez", "Nuñez es el habitual del AB 799 CA");
  const b = planVehiculos(d, 3, { k: "cambiar", filaId: hojaDeCuadrilla(d, 3)!.vehiculos[0].id, vehiculoId: "ab799" }, o());
  assert.equal(b.filas[0].choferId, "kiska", "ya tenía chofer: no se pisa");
});

// ─── 4. Lleva y trae sobre la marcha ────────────────────────────────────────

test("el lleva que después vuelve al depósito libera el camión", () => {
  let d = martesArmado();
  const f2 = hojaDeCuadrilla(d, 2)!.vehiculos[0];
  // Kiska deja a la 2 en Juramento a las 7:00 y vuelve al depósito (llega 8:15).
  d = aplicar(d, 2, planVehiculos(d, 2, { k: "vuelta", filaId: f2.id, vuelve: true, llega: "8:15" }, o()));
  const ll = calcVeh(d, "af669").find((v) => v.id === "c2-lleva")!;
  assert.equal(ll.fin, 8 * 60 + 15);
  assert.equal(linea(resumenVehiculos(d, 2).filas[0]), "Lleva y trae · Kiska · AF 669 ZL · 7:00 (vuelve al depósito 8:15) → 17:00");
  // Sin la hora cargada, la estimada (la parada más la vuelta típica).
  const est = aplicar(d, 2, planVehiculos(d, 2, { k: "vuelta", filaId: f2.id, vuelve: true, llega: null }, o()));
  assert.equal(calcVeh(est, "af669").find((v) => v.id === "c2-lleva")!.fin, 7 * 60 + 45 + 60);
  // Libre desde que vuelve: a las 8:30 un pedido lo ve en el depósito (sin el lleva de la 3 en el medio).
  const solo2 = { ...d, viajes: d.viajes.filter((v) => v.id !== "c3-lleva") };
  const q = camionesQueSirven(solo2, pedido("p", { hacia: { otId: OT.cab, lugarId: null, texto: null } }), 8 * 60 + 30);
  const k = q.si.find((x) => x.veh === "af669")!;
  assert.equal(k.loc, "l:dep");
  assert.equal(dondeAnda({ ...solo2, viajes: solo2.viajes.map((v) => (v.id === "c2-lleva" ? { ...v, estado: "hecho" as const, hechoMin: 440 } : v)) }, "af669", 8 * 60 + 30).t, "Libre desde las 7:20 · en el depósito · después compra Sanz ~10:00");
  // Mover el lleva corre también la llegada al depósito.
  const corrido = aplicar(d, 2, planVehiculos(d, 2, { k: "lleva", filaId: f2.id, hora: "7:30" }, o()));
  assert.equal(corrido.viajes.find((v) => v.id === "c2-lleva")!.vueltaLlega, "8:45");
});

test("busca con otro camión: lo dice la tarjeta, el capataz y el chofer que los busca", () => {
  let d = martesArmado();
  d = aplicar(d, 3, planVehiculos(d, 3, { k: "buscaCon", vehiculoId: "ab497", choferId: "gomez" }, o()));
  assert.equal(quienBusca(d, hojaDeCuadrilla(d, 3)!).k, "otro");
  assert.equal(linea(resumenVehiculos(d, 3).filas[0]), "Lleva y trae · Kiska · AF 669 ZL · 7:45 → 16:30 (Gómez · AB 497 YY)");
  assert.ok(viajesChofer(d, "gomez").some((v) => v.id === "c3-busca"));
  assert.ok(!viajesChofer(d, "kiska").some((v) => v.id === "c3-busca"));
});

test("busca a definir: sin camión todavía, «Nadie los busca» hasta que se elija", () => {
  let d = martesArmado();
  d = aplicar(d, 3, planVehiculos(d, 3, { k: "buscaCon", vehiculoId: null }, o()));
  assert.equal(quienBusca(d, hojaDeCuadrilla(d, 3)!).k, "definir");
  assert.match(linea(resumenVehiculos(d, 3).filas[0]), /→ 16:30 · a definir$/);
  const t = problemas(d, 3, LUN_1830).map((p) => p.t);
  assert.ok(t.includes("Nadie busca a la Cuadrilla 3 en Av. Rivadavia 6150"), t.join("\n"));
});

test("un busca sin nadie que los lleve no se puede", () => {
  const d = martesArmado();
  assert.throws(() => planVehiculos(d, 4, { k: "busca", hora: "17:00" }, o()), /no tiene quién la lleve/);
  assert.throws(() => planVehiculos(d, 1, { k: "lleva", hora: "7:00" }, o()), /no tiene quién la lleve/);
});

test("pasar de todo el día a lleva y trae arma el lleva y el busca; al revés los borra", () => {
  let d = martesArmado();
  const f1 = hojaDeCuadrilla(d, 1)!.vehiculos[0];
  const p = planVehiculos(d, 1, { k: "cambiar", filaId: f1.id, modo: "lleva_trae" }, o());
  assert.deepEqual(p.viajes.crear.map((v) => [v.tipo, v.vehiculoId, v.choferId]).sort(), [["busca", "ab831", "borda"], ["lleva", "ab831", "borda"]]);
  d = aplicar(d, 1, p);
  const back = planVehiculos(d, 1, { k: "cambiar", filaId: f1.id, modo: "todo_el_dia" }, o());
  assert.equal(back.viajes.borrar.length, 2);
});
