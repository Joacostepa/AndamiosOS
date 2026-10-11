// La hoja al instante (optimista.ts): lo que se ve antes de que conteste el servidor tiene
// que ser lo mismo que el servidor va a escribir (acciones.ts), con las reglas de estado.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarOptimista, esTemporal } from "./optimista.ts";
import { aCargoDe, hojaDe, hojaDeCuadrilla, planModo, planSoltarChofer, sinAsignar, vanDe } from "./estado.ts";
import type { DiaHoja } from "./tipos.ts";
import { martesArmado, martesPrecargado } from "./escenario.test-fixture.ts";

const F = "2026-10-13";
const ok = (d: DiaHoja | null): DiaHoja => {
  assert.ok(d, "el gesto se tenía que poder adivinar");
  return d;
};
const viajesDe = (d: DiaHoja, c: number) => d.viajes.filter((v) => v.hojaId === hojaDeCuadrilla(d, c)?.id && v.estado !== "anulado");

test("agregar: la persona sin asignar entra al final de la tarjeta, sin tocar el día de antes", () => {
  const d0 = martesPrecargado();
  const foto = JSON.stringify(d0);
  assert.ok(sinAsignar(d0).includes("paz"));
  const d = ok(aplicarOptimista(d0, { accion: "agregar", fecha: F, cuadrilla: 3, personaId: "paz" }));
  assert.equal(hojaDe(d, "paz"), 3);
  assert.ok(!sinAsignar(d).includes("paz"));
  assert.equal(vanDe(d, 3), vanDe(d0, 3) + 1);
  const h = hojaDeCuadrilla(d, 3)!;
  assert.equal(h.integrantes.at(-1)!.personaId, "paz");
  assert.ok(esTemporal(h.integrantes.at(-1)!.id));
  assert.equal(JSON.stringify(d0), foto, "no se modifica el día que se recibe");
});

test("pasar de cuadrilla: sale de la suya y entra a la otra con la misma fila (como el servidor)", () => {
  const d0 = martesPrecargado();
  const de = hojaDe(d0, "avila")!;
  const id = hojaDeCuadrilla(d0, de)!.integrantes.find((i) => i.personaId === "avila")!.id;
  const d = ok(aplicarOptimista(d0, { accion: "agregar", fecha: F, cuadrilla: 2, personaId: "avila" }));
  assert.equal(hojaDe(d, "avila"), 2);
  assert.ok(!hojaDeCuadrilla(d, de)!.integrantes.some((i) => i.personaId === "avila"));
  assert.equal(hojaDeCuadrilla(d, 2)!.integrantes.find((i) => i.personaId === "avila")!.id, id);
  assert.equal(aplicarOptimista(d, { accion: "agregar", fecha: F, cuadrilla: 2, personaId: "avila" }), null, "si ya está, no hay nada que adivinar");
});

test("soltar sobre un nombre lo reemplaza en su lugar; con aCargo, queda a cargo", () => {
  const d0 = martesPrecargado();
  const h0 = hojaDeCuadrilla(d0, 2)!;
  const otro = h0.integrantes.find((i) => !i.aCargo)!;
  const d = ok(aplicarOptimista(d0, { accion: "agregar", fecha: F, cuadrilla: 2, personaId: "paz", reemplaza: otro.personaId }));
  const h = hojaDeCuadrilla(d, 2)!;
  assert.ok(!h.integrantes.some((i) => i.personaId === otro.personaId));
  assert.equal(h.integrantes.find((i) => i.personaId === "paz")!.orden, otro.orden);
  assert.equal(hojaDe(d, otro.personaId), null, "el reemplazado queda sin asignar");
  const d2 = ok(aplicarOptimista(d0, { accion: "agregar", fecha: F, cuadrilla: 2, personaId: "paz", aCargo: true }));
  assert.equal(aCargoDe(hojaDeCuadrilla(d2, 2)), "paz");
  assert.equal(hojaDeCuadrilla(d2, 2)!.integrantes.filter((i) => i.aCargo).length, 1);
});

test("sacar y poner a cargo", () => {
  const d0 = martesArmado();
  const d = ok(aplicarOptimista(d0, { accion: "sacar", fecha: F, personaId: "paz" }));
  assert.equal(hojaDe(d, "paz"), null);
  assert.equal(aplicarOptimista(d, { accion: "sacar", fecha: F, personaId: "paz" }), null);

  const a = ok(aplicarOptimista(d0, { accion: "a_cargo", fecha: F, cuadrilla: 4, personaId: "perez" }));
  assert.equal(aCargoDe(hojaDeCuadrilla(a, 4)), "perez");
  assert.equal(hojaDeCuadrilla(a, 4)!.integrantes.filter((i) => i.aCargo).length, 1);
  // Poner a cargo a alguien de otra cuadrilla lo trae.
  const b = ok(aplicarOptimista(d0, { accion: "a_cargo", fecha: F, cuadrilla: 4, personaId: "sack" }));
  assert.equal(hojaDe(b, "sack"), 4);
  assert.equal(aCargoDe(hojaDeCuadrilla(b, 4)), "sack");
  const c = ok(aplicarOptimista(d0, { accion: "a_cargo", fecha: F, cuadrilla: 4, personaId: null }));
  assert.equal(aCargoDe(hojaDeCuadrilla(c, 4)), null);
  // Un contratista sin gente en esa hoja: lo decide el servidor (error), no se adivina.
  assert.equal(aplicarOptimista(d0, { accion: "a_cargo", fecha: F, cuadrilla: 4, personaId: "quintana" }), null);
});

test("contratistas: sumar crea la fila, ± cambia la cantidad (0 a 60) y quitar saca el a cargo", () => {
  const d0 = martesArmado();
  const d1 = ok(aplicarOptimista(d0, { accion: "contratista_sumar", fecha: F, cuadrilla: 4, contratistaId: "quintana", n: 2 }));
  assert.equal(hojaDeCuadrilla(d1, 4)!.contratistas.find((x) => x.contratistaId === "quintana")!.cantidad, 2);
  assert.equal(vanDe(d1, 4), vanDe(d0, 4) + 2);
  const d2 = ok(aplicarOptimista(d1, { accion: "contratista_sumar", fecha: F, cuadrilla: 4, contratistaId: "quintana", n: -5 }));
  assert.equal(hojaDeCuadrilla(d2, 4)!.contratistas[0].cantidad, 0);
  assert.equal(aplicarOptimista(d2, { accion: "contratista_sumar", fecha: F, cuadrilla: 4, contratistaId: "quintana", n: -1 }), null);
  assert.equal(aplicarOptimista(d0, { accion: "contratista_sumar", fecha: F, cuadrilla: 4, contratistaId: "viejo", n: 1 }), null, "dado de baja: lo dice el servidor");
  const conCargo = ok(aplicarOptimista(d1, { accion: "a_cargo", fecha: F, cuadrilla: 4, personaId: "quintana" }));
  assert.equal(aCargoDe(hojaDeCuadrilla(conCargo, 4)), "quintana");
  const q = ok(aplicarOptimista(conCargo, { accion: "contratista_quitar", fecha: F, cuadrilla: 4, contratistaId: "quintana" }));
  assert.equal(hojaDeCuadrilla(q, 4)!.contratistas.length, 0);
  assert.equal(hojaDeCuadrilla(q, 4)!.aCargoContratistaId, null);
  const nota = ok(aplicarOptimista(d1, { accion: "contratista_nota", fecha: F, cuadrilla: 4, contratistaId: "quintana", nota: "traen su arnés" }));
  assert.equal(hojaDeCuadrilla(nota, 4)!.contratistas[0].nota, "traen su arnés");
});

test("modo: la misma regla que el servidor (planModo) y los viajes de lleva y trae", () => {
  const d0 = martesArmado();
  const h0 = hojaDeCuadrilla(d0, 4)!;
  assert.equal(h0.modo, "sin");
  const plan = planModo(d0, 4, "lleva_trae");
  const d = ok(aplicarOptimista(d0, { accion: "modo", fecha: F, cuadrilla: 4, modo: "lleva_trae" }, { ahora: -300 }));
  const h = hojaDeCuadrilla(d, 4)!;
  assert.equal(h.modo, "lleva_trae");
  assert.equal(h.choferId, plan.choferId);
  assert.equal(h.vehiculoId, plan.vehiculoId);
  assert.equal(h.encuentro.lugar, "deposito");
  assert.equal(h.choferTocadoMin, -300);
  const vs = viajesDe(d, 4);
  assert.deepEqual(vs.map((v) => v.tipo).sort(), ["busca", "lleva"]);
  assert.equal(vs.find((v) => v.tipo === "lleva")!.hora, plan.lleva);
  assert.equal(vs.find((v) => v.tipo === "busca")!.hora, plan.busca);
  // Volver a "Sin chofer" borra los lleva / busca planeados y el encuentro pasa a la obra.
  const sin = ok(aplicarOptimista(d, { accion: "modo", fecha: F, cuadrilla: 4, modo: "sin" }));
  assert.equal(viajesDe(sin, 4).length, 0);
  assert.equal(hojaDeCuadrilla(sin, 4)!.encuentro.lugar, "obra");
  // Los viajes de las otras cuadrillas no se tocan.
  assert.equal(viajesDe(sin, 3).length, viajesDe(d0, 3).length);
});

test("soltar un chofer en una tarjeta sin chofer la pasa a Lleva y trae (planSoltarChofer)", () => {
  const d0 = martesArmado();
  const plan = planSoltarChofer(d0, 4, "gomez");
  const d = ok(aplicarOptimista(d0, { accion: "chofer", fecha: F, cuadrilla: 4, choferId: "gomez" }));
  const h = hojaDeCuadrilla(d, 4)!;
  assert.equal(h.modo, plan.modo);
  assert.equal(h.choferId, "gomez");
  assert.equal(h.vehiculoId, plan.vehiculoId);
  assert.ok(viajesDe(d, 4).every((v) => v.choferId === "gomez"));
  // Cambiar el chofer de una que ya iba con lleva y trae arrastra sus viajes planeados.
  const d3 = ok(aplicarOptimista(d0, { accion: "chofer", fecha: F, cuadrilla: 3, choferId: "gomez" }));
  assert.ok(viajesDe(d3, 3).filter((v) => v.tipo === "lleva" || v.tipo === "busca").every((v) => v.choferId === "gomez"));
  const veh = ok(aplicarOptimista(d0, { accion: "vehiculo", fecha: F, cuadrilla: 3, vehiculoId: "ab497" }));
  assert.equal(hojaDeCuadrilla(veh, 3)!.vehiculoId, "ab497");
  assert.ok(viajesDe(veh, 3).filter((v) => v.tipo === "lleva").every((v) => v.vehiculoId === "ab497"));
});

test("horas, encuentro, notas e instrucciones", () => {
  const d0 = martesArmado();
  // La 3 se encuentra en el depósito: cambiar el lleva mueve el encuentro.
  const ll = ok(aplicarOptimista(d0, { accion: "lleva", fecha: F, cuadrilla: 3, hora: "08:15" }));
  assert.equal(viajesDe(ll, 3).find((v) => v.tipo === "lleva")!.hora, "8:15");
  assert.equal(hojaDeCuadrilla(ll, 3)!.encuentro.hora, "8:15");
  const bu = ok(aplicarOptimista(d0, { accion: "busca", fecha: F, cuadrilla: 3, hora: null }));
  assert.equal(viajesDe(bu, 3).filter((v) => v.tipo === "busca").length, 0, "vuelven por su cuenta");
  const enc = ok(aplicarOptimista(d0, { accion: "encuentro", fecha: F, cuadrilla: 3, lugar: "deposito", hora: "07:30" }));
  assert.equal(hojaDeCuadrilla(enc, 3)!.encuentro.hora, "7:30");
  assert.equal(viajesDe(enc, 3).find((v) => v.tipo === "lleva")!.hora, "7:30");
  const nota = ok(aplicarOptimista(d0, { accion: "nota", fecha: F, cuadrilla: 2, nota: "llevar arnés" }));
  assert.equal(hojaDeCuadrilla(nota, 2)!.nota, "llevar arnés");
  const np = ok(aplicarOptimista(d0, { accion: "nota_persona", fecha: F, personaId: "paz", nota: "va directo a la 2.ª obra" }));
  assert.equal(hojaDeCuadrilla(np, 4)!.integrantes.find((i) => i.personaId === "paz")!.nota, "va directo a la 2.ª obra");
  const ins = ok(aplicarOptimista(d0, { accion: "instrucciones", fecha: F, otId: 2405, cuadrilla: 2, hoy: "Desarmar el frente", chips: ["Hidrogrúa en obra"] }));
  assert.deepEqual(ins.instrucciones.find((i) => i.otId === 2405), { otId: 2405, cuadrillaOdooId: 2, horaInicio: null, hoy: "Desarmar el frente", chips: ["Hidrogrúa en obra"] });
  const carga = ok(aplicarOptimista(d0, { accion: "carga_lleva", fecha: F, cuadrilla: 3, carga: "10 tablones" }));
  assert.equal(viajesDe(carga, 3).find((v) => v.tipo === "lleva")!.carga, "10 tablones");
});

test("una cuadrilla sin hoja: la tarjeta aparece al primer gesto", () => {
  const d0 = { ...martesArmado(), hojas: martesArmado().hojas.filter((h) => h.cuadrillaOdooId !== 5) };
  const d = ok(aplicarOptimista(d0, { accion: "agregar", fecha: F, cuadrilla: 5, personaId: "mino" }));
  assert.ok(esTemporal(hojaDeCuadrilla(d, 5)!.id));
  assert.equal(hojaDe(d, "mino"), 5);
});

test("lo que no se adivina espera al servidor; otro día, tampoco", () => {
  const d0 = martesArmado();
  assert.equal(aplicarOptimista(d0, { accion: "copiar_como_hoy", fecha: F, cuadrilla: 2 }), null);
  assert.equal(aplicarOptimista(d0, { accion: "mueve", fecha: F, cuadrilla: 2, otId: 2398, hora: "11:00" }), null);
  assert.equal(aplicarOptimista(d0, { accion: "sacar", fecha: "2026-10-14", personaId: "paz" }), null);
});

test("el día que devuelve es un objeto nuevo: estado.ts no reusa índices del día a medio cambiar", () => {
  const d0 = martesArmado();
  hojaDeCuadrilla(d0, 4); // arma los índices del día original
  const d = ok(aplicarOptimista(d0, { accion: "modo", fecha: F, cuadrilla: 4, modo: "todo_el_dia" }));
  assert.notEqual(d, d0);
  assert.equal(hojaDeCuadrilla(d, 4)!.modo, "todo_el_dia");
  assert.equal(hojaDeCuadrilla(d0, 4)!.modo, "sin");
});
