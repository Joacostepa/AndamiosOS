// "Fernando no aparece, Jonas tampoco, Cristian tampoco" (10/10): estaban, pero el panel
// Gente y "+ Agregar" mostraban y buscaban sólo el apellido. Y un técnico (Capurro) salía en
// "Sin asignar".

import { test } from "node:test";
import assert from "node:assert/strict";
import { coincidePersona, esPersonalDeObra, nombreConPila, sinAsignar } from "./estado.ts";
import { chipsDe, noDisponibles, sugerenciasAgregar } from "./vista-cuadrillas.ts";
import type { DiaHoja, Persona } from "./tipos.ts";
import { martesArmado } from "./escenario.test-fixture.ts";

const p = (id: string, nombre: string, pila: string, completo: string, extra: Partial<Persona> = {}): Persona => ({
  id, externa: false, nombre, nombreCompleto: completo, pila, puesto: "operario", celular: null, puedeEstarACargo: false,
  esChofer: false, telegram: false, odooEmployeeId: null, activo: true, deObra: true, ...extra,
});
const TABOADA = p("taboada", "Taboada", "Fernando", "Fernando Nicolas Taboada");
const MINO_J = p("mino-j", "Miño J.", "Jonas", "Jonas Adriel Miño");
const GELOZ = p("geloz", "Geloz", "Cristian", "Cristian David Geloz");
const CAPURRO = p("capurro", "Capurro", "Iñaki", "Iñaki Capurro", { puesto: "tecnico", deObra: false });

const conGente = (): DiaHoja => {
  const d = martesArmado();
  return { ...d, personas: [...d.personas, TABOADA, MINO_J, GELOZ, CAPURRO] };
};

test("de obra: la tarea de Odoo manda; sin ella, el puesto de Legajos", () => {
  assert.equal(esPersonalDeObra("operario", "andamista"), true);
  assert.equal(esPersonalDeObra("operario", "herrero"), true);
  assert.equal(esPersonalDeObra("chofer", "andamista"), true); // Ortega: chofer en Legajos, andamista en Odoo
  assert.equal(esPersonalDeObra("chofer", "chofer"), true);
  assert.equal(esPersonalDeObra("operario", null), true);
  assert.equal(esPersonalDeObra("capataz", ""), true);
  assert.equal(esPersonalDeObra("tecnico", null), false); // Capurro, técnico de SyH
  assert.equal(esPersonalDeObra("administrativo", null), false);
  assert.equal(esPersonalDeObra(null, null), false);
});

test("buscar por nombre o apellido: todas las palabras, sin tildes ni mayúsculas", () => {
  for (const q of ["fernando", "fer", "taboada", "TABOADA", "fer tab", "nicolas", "Fernando Taboada"]) assert.ok(coincidePersona(TABOADA, q), q);
  for (const q of ["jonas", "jonás", "mino", "miño j", "jonas mino"]) assert.ok(coincidePersona(MINO_J, q), q);
  assert.ok(coincidePersona(GELOZ, "cristian"));
  assert.ok(!coincidePersona(TABOADA, "jonas"));
  assert.ok(!coincidePersona(TABOADA, "fer mino"));
  assert.ok(coincidePersona(TABOADA, "  "));
  assert.equal(nombreConPila(TABOADA), "Taboada · Fernando");
  assert.equal(nombreConPila({ nombre: "Sack", pila: null }), "Sack");
});

test("+ Agregar encuentra por nombre de pila y muestra «Apellido · Nombre»", () => {
  const d = conGente();
  const fer = sugerenciasAgregar(d, 3, "fer");
  assert.equal(fer[0]?.pid, "taboada");
  assert.equal(fer[0]?.nombre, "Taboada · Fernando");
  assert.equal(sugerenciasAgregar(d, 3, "jonas")[0]?.nombre, "Miño J. · Jonas");
  assert.equal(sugerenciasAgregar(d, 3, "cristian")[0]?.pid, "geloz");
  assert.deepEqual(sugerenciasAgregar(d, 3, "iñaki"), [], "un técnico no se agrega a una cuadrilla");
});

test("Sin asignar y No disponibles: sólo personal de obra", () => {
  const d = conGente();
  const sa = sinAsignar(d);
  assert.ok(sa.includes("taboada") && sa.includes("mino-j") && sa.includes("geloz"));
  assert.ok(!sa.includes("capurro"));
  const conAus: DiaHoja = { ...d, ausencias: [...d.ausencias, { id: null, personaId: "capurro", desde: "2026-10-13", hasta: null, tipo: "art", horaDesde: null, horaHasta: null, nota: null, origen: "asistencia" }] };
  assert.ok(!noDisponibles(conAus).some((x) => x.pid === "capurro"));
  // Los de la asistencia con "accidente": ART / accidente, con su motivo.
  const medina = noDisponibles(conAus).find((x) => x.pid === "medina");
  assert.equal(medina?.txt, "ART / accidente · sin fecha de alta (según la asistencia)");
});

test("los chips de la tarjeta siguen cortos, con el nombre entero para el title", () => {
  const d0 = conGente();
  const d: DiaHoja = { ...d0, hojas: d0.hojas.map((h) => (h.cuadrillaOdooId === 3 ? { ...h, integrantes: [...h.integrantes, { id: "i-tab", personaId: "taboada", aCargo: false, nota: null, orden: 99 }] } : h)) };
  const chip = chipsDe(d, 3).find((x) => x.pid === "taboada")!;
  assert.equal(chip.nombre, "Taboada");
  assert.equal(chip.completo, "Fernando Nicolas Taboada");
});
