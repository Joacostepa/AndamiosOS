import { test } from "node:test";
import assert from "node:assert/strict";
import { decidir, pasada, partirNombre, dniProvisorio, esOperario, normNombre, type EmpleadoOdoo, type Legajo } from "./sync-odoo.ts";

// Casos tomados de los datos reales (10/10): Legajos con nombres en mayúsculas y DNI TMP-…,
// Odoo con "APELLIDO, Nombres" y el DNI en identification_id.

const emp = (o: Partial<EmpleadoOdoo> & { id: number; name: string }): EmpleadoOdoo => ({
  active: true,
  identification_id: false,
  mobile_phone: false,
  work_phone: false,
  x_tarea: "andamista",
  x_regimen_liquidacion: "operarios",
  ...o,
});
const leg = (o: Partial<Legajo> & { id: string; apellido: string; nombre: string }): Legajo => ({
  dni: `TMP-${o.nombre}-${o.apellido}`.replace(/\s+/g, "-"),
  telefono: null,
  activo: true,
  odoo_employee_id: null,
  odoo_tarea: null,
  ...o,
});

const conte = leg({ id: "L1", apellido: "CONTE", nombre: "OSMAR FRANCISCO LUJAN", odoo_employee_id: 20, odoo_tarea: "andamista", telefono: "11-6860-6257" });
const lopez = leg({ id: "L2", apellido: "LOPEZ", nombre: "CARLOS LEONEL", activo: false });
const capurro = leg({ id: "L3", apellido: "Capurro", nombre: "Iñaki" });

test("vinculado y al día: no cambia nada", () => {
  const d = decidir(emp({ id: 20, name: "CONTE, Osmar Francisco Lujan", mobile_phone: "11-6860-6257" }), [conte]);
  assert.equal(d.tipo, "sin_cambios");
});

test("el teléfono sólo se completa si el legajo no tiene", () => {
  const otro = decidir(emp({ id: 20, name: "CONTE, Osmar", mobile_phone: "1199999999" }), [conte]);
  assert.equal(otro.tipo, "sin_cambios");
  const borda = leg({ id: "B", apellido: "BORDA", nombre: "CARLOS ERNESTO", odoo_employee_id: 13, odoo_tarea: "chofer" });
  const d = decidir(emp({ id: 13, name: "BORDA, Carlos Ernesto", x_tarea: "chofer", work_phone: "1155550000" }), [borda]);
  assert.equal(d.tipo, "actualizar");
  assert.deepEqual(d.tipo === "actualizar" && d.cambios, { telefono: "1155550000" });
});

test("archivado en Odoo: desactiva el legajo vinculado (nunca borra)", () => {
  const d = decidir(emp({ id: 20, name: "CONTE, Osmar", active: false }), [conte]);
  assert.equal(d.tipo, "actualizar");
  assert.deepEqual(d.tipo === "actualizar" && d.cambios, { activo: false });
});

test("cambio de tarea en Odoo: actualiza odoo_tarea, no el puesto", () => {
  const d = decidir(emp({ id: 20, name: "CONTE, Osmar", x_tarea: "chofer" }), [conte]);
  assert.deepEqual(d.tipo === "actualizar" && d.cambios, { odoo_tarea: "chofer" });
});

test("cruza por DNI con un legajo sin vínculo", () => {
  const l = leg({ id: "D", apellido: "PEREZ", nombre: "ALBERTO", dni: "25.071.477" });
  const d = decidir(emp({ id: 14, name: "PÉREZ, Alberto Oscar", identification_id: "25071477" }), [l]);
  assert.equal(d.tipo, "actualizar");
  assert.equal(d.tipo === "actualizar" && d.como, "dni");
  assert.equal(d.tipo === "actualizar" && d.cambios.odoo_employee_id, 14);
});

test("cruza por nombre sin tildes y en cualquier orden", () => {
  const l = leg({ id: "M", apellido: "MIÑO", nombre: "JONAS ADRIEL" });
  const d = decidir(emp({ id: 25, name: "MINO, Jonás Adriel", identification_id: "47643511" }), [l]);
  assert.equal(d.tipo === "actualizar" && d.como, "nombre");
});

test("dos legajos sin vínculo con el mismo nombre: dudoso, no toca ninguno", () => {
  const a = leg({ id: "V1", apellido: "VALENZUELA", nombre: "CESAR JAVIER" });
  const b = leg({ id: "V2", apellido: "Valenzuela", nombre: "César Javier", dni: "TMP-X" });
  const d = decidir(emp({ id: 19, name: "VALENZUELA, Cesar Javier" }), [a, b]);
  assert.equal(d.tipo, "dudoso");
  assert.equal(d.tipo === "dudoso" && d.motivo, "nombre_repetido");
});

test("no reclama el legajo de otro empleado: mismo nombre que uno vinculado → dudoso", () => {
  const d = decidir(emp({ id: 99, name: "CONTE, Osmar Francisco Lujan", identification_id: "30064050" }), [conte]);
  assert.equal(d.tipo, "dudoso");
  assert.equal(d.tipo === "dudoso" && d.motivo, "nombre_de_otro");
});

test("DNI de un legajo vinculado a otro empleado → dudoso", () => {
  const l = leg({ id: "X", apellido: "SENA", nombre: "JOSE LUIS", dni: "23895482", odoo_employee_id: 9 });
  const d = decidir(emp({ id: 77, name: "OTRO, Nombre", identification_id: "23895482" }), [l]);
  assert.equal(d.tipo === "dudoso" && d.motivo, "dni_de_otro");
});

test("operario activo sin legajo: lo crea partiendo el nombre, con DNI de Odoo y puesto operario", () => {
  const d = decidir(emp({ id: 27, name: "DELLA CORTE, Fabian Horacio", identification_id: "40080804", mobile_phone: "1160104981" }), [conte, lopez, capurro]);
  assert.equal(d.tipo, "crear");
  assert.deepEqual(d.tipo === "crear" && d.fila, {
    apellido: "DELLA CORTE",
    nombre: "FABIAN HORACIO",
    dni: "40080804",
    telefono: "1160104981",
    puesto: "operario",
    activo: true,
    odoo_employee_id: 27,
    odoo_tarea: "andamista",
  });
});

test("chofer: puesto chofer; sin DNI: TMP-NOMBRES-APELLIDO", () => {
  const d = decidir(emp({ id: 60, name: "NÚÑEZ, Diego", x_tarea: "chofer" }), []);
  assert.equal(d.tipo === "crear" && d.fila.puesto, "chofer");
  assert.equal(d.tipo === "crear" && d.fila.dni, "TMP-DIEGO-NUNEZ");
});

test("el DNI provisorio no choca con uno existente", () => {
  const d = decidir(emp({ id: 61, name: "GOMEZ, Juan" }), [leg({ id: "G", apellido: "GOMEZ", nombre: "JUANCITO", dni: "TMP-JUAN-GOMEZ", odoo_employee_id: 5 })]);
  assert.equal(d.tipo === "crear" && d.fila.dni, "TMP-JUAN-GOMEZ-ODOO61");
});

test("administrativos no se crean; sin régimen ni tarea es dudoso", () => {
  const adm = decidir(emp({ id: 32, name: "MANSILLA, Juan Agustin", x_tarea: false, x_regimen_liquidacion: "administrativos" }), []);
  assert.equal(adm.tipo === "ignorar" && adm.motivo, "administrativo");
  const nada = decidir(emp({ id: 70, name: "NUEVO, Alguien", x_tarea: false, x_regimen_liquidacion: false }), []);
  assert.equal(nada.tipo === "dudoso" && nada.motivo, "sin_regimen");
  // Régimen vacío pero con tarea: es de obra.
  assert.equal(esOperario(emp({ id: 71, name: "X, Y", x_regimen_liquidacion: false, x_tarea: "herrero" })), true);
});

test("un administrativo que SÍ tiene legajo se vincula y actualiza igual", () => {
  const l = leg({ id: "A", apellido: "STEPANSKY", nombre: "JOAQUIN" });
  const d = decidir(emp({ id: 1, name: "STEPANSKY, Joaquin", x_tarea: false, x_regimen_liquidacion: "administrativos" }), [l]);
  assert.equal(d.tipo, "actualizar");
});

test("archivado sin legajo: no se crea ni se avisa", () => {
  const d = decidir(emp({ id: 29, name: "BELIZAN, Luciano Emanuel", active: false }), []);
  assert.equal(d.tipo === "ignorar" && d.motivo, "archivado_sin_legajo");
});

test("los legajos sin vínculo que no cruzan quedan como están (dados de baja a mano, Capurro)", () => {
  const { decisiones, huerfanos } = pasada([emp({ id: 20, name: "CONTE, Osmar Francisco Lujan" })], [conte, lopez, capurro]);
  assert.equal(huerfanos.length, 0);
  for (const d of decisiones) assert.ok(!("legajo" in d) || d.legajo.id === "L1");
});

test("pasada: legajo vinculado a un empleado borrado de Odoo se desactiva; sólo si la lista es completa", () => {
  const sena = leg({ id: "S", apellido: "SENA", nombre: "JOSE LUIS", odoo_employee_id: 9 });
  assert.deepEqual(pasada([], [sena]).huerfanos.map((h) => h.legajo.id), ["S"]);
  assert.equal(pasada([], [sena], { completa: false }).huerfanos.length, 0);
  assert.equal(pasada([], [{ ...sena, activo: false }]).huerfanos.length, 0);
});

test("pasada: dos empleados no reclaman el mismo legajo ni crean DNI repetido", () => {
  const l = leg({ id: "P", apellido: "PEREZ", nombre: "ALBERTO OSCAR" });
  const { decisiones } = pasada(
    [emp({ id: 14, name: "PEREZ, Alberto Oscar" }), emp({ id: 90, name: "PEREZ, Alberto Oscar" })],
    [l],
  );
  assert.equal(decisiones[0].tipo, "actualizar");
  assert.equal(decisiones[1].tipo === "dudoso" && decisiones[1].motivo, "nombre_de_otro");
  const dos = pasada([emp({ id: 91, name: "ROJAS, Ana" }), emp({ id: 92, name: "ROJAS, Ana Maria" })], []);
  const dnis = dos.decisiones.map((d) => (d.tipo === "crear" ? d.fila.dni : null));
  assert.equal(new Set(dnis).size, 2);
});

test("pasada: el ya vinculado gana su legajo aunque venga después en la lista", () => {
  const l = leg({ id: "C", apellido: "CONTE", nombre: "OSMAR", odoo_employee_id: 20 });
  const { decisiones } = pasada([emp({ id: 5, name: "CONTE, Osmar" }), emp({ id: 20, name: "CONTE, Osmar" })], [l]);
  const del20 = decisiones.find((d) => d.empleado.id === 20)!;
  const del5 = decisiones.find((d) => d.empleado.id === 5)!;
  assert.ok(del20.tipo === "actualizar" && del20.legajo.id === "C" && del20.como === "vinculo");
  assert.equal(del5.tipo, "dudoso");
});

test("partirNombre y normNombre", () => {
  assert.deepEqual(partirNombre("GONGORA MENDEZ, Cesar Mercedes"), { apellido: "GONGORA MENDEZ", nombre: "CESAR MERCEDES" });
  assert.deepEqual(partirNombre("Muñoz Leonardo"), { apellido: "MUÑOZ", nombre: "LEONARDO" });
  assert.equal(normNombre("MUÑOZ, Leonardo Emanuel"), normNombre("leonardo emanuel munoz"));
  assert.equal(dniProvisorio("MUÑOZ", "LEONARDO EMANUEL"), "TMP-LEONARDO-EMANUEL-MUNOZ");
});
