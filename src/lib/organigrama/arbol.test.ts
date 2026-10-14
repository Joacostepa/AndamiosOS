// La lógica pura del organigrama contra el dataset de la maqueta (docs/organigrama/propuesta.md
// § 6.2 y § 6.5): ciclos, subir dependientes, a quién preguntarle, carga, búsqueda y diff.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  areaDe,
  buscar,
  cargaPorPersona,
  creaCiclo,
  descendientes,
  diffVersiones,
  eliminar,
  estadoPuesto,
  hijos,
  mover,
  normalizar,
  pendientes,
  puestosDeArea,
  quienResponde,
  subirHijos,
  tramosCoincidencia,
  correr,
} from "./arbol.ts";
import {
  CAMBIOS_BORRADOR,
  CUADRILLAS,
  DOCUMENTOS,
  HOY,
  NODOS_BORRADOR,
  NODOS_VIGENTES,
  OCUPANTES,
  PERSONAS,
} from "./datos-maqueta.ts";
import type { DatosOrg } from "./tipos.ts";

const DATOS: DatosOrg = { nodos: NODOS_VIGENTES, personas: PERSONAS, ocupantes: OCUPANTES, cuadrillas: CUADRILLAS };
const claves = (xs: { clave: string }[]) => xs.map((x) => x.clave);

test("la estructura vigente: 1 dirección, 5 áreas y 18 puestos", () => {
  assert.equal(NODOS_VIGENTES.filter((x) => x.tipo === "direccion").length, 1);
  assert.deepEqual(claves(hijos(NODOS_VIGENTES, "dg")), ["tec_com", "ops", "deposito", "admin", "sistemas"]);
  assert.equal(NODOS_VIGENTES.filter((x) => x.tipo === "puesto").length, 18);
  assert.equal(areaDe(NODOS_VIGENTES, "stock")?.clave, "deposito");
  assert.equal(areaDe(NODOS_VIGENTES, "ops")?.clave, "ops");
});

test("creaCiclo: él mismo y sus descendientes no; un hermano sí se puede", () => {
  assert.equal(creaCiclo(NODOS_VIGENTES, "ops", "ops"), true);
  assert.equal(creaCiclo(NODOS_VIGENTES, "ops", "montajes"), true);
  assert.equal(creaCiclo(NODOS_BORRADOR, "ops", "coord_logistico"), true, "nieto");
  assert.equal(creaCiclo(NODOS_VIGENTES, "stock", "admin"), false);
  assert.equal(creaCiclo(NODOS_VIGENTES, "stock", "dg"), false);
  assert.throws(() => mover(NODOS_VIGENTES, "ops", "taller"));
});

test("mover deja el puesto al final de sus nuevos hermanos", () => {
  const r = mover(NODOS_VIGENTES, "stock", "admin");
  assert.deepEqual(claves(hijos(r, "admin")), ["fact", "cobr", "teso", "control", "stock"]);
  assert.deepEqual(claves(hijos(r, "deposito")), ["despacho", "devoluciones"]);
});

test("subirHijos y eliminar: Operaciones sube sus 7 puestos a Dirección; sin subir, no borra nada", () => {
  const subidos = subirHijos(NODOS_VIGENTES, "ops");
  assert.equal(hijos(subidos, "ops").length, 0);
  assert.equal(hijos(subidos, "dg").length, 5 + 7);
  assert.throws(() => eliminar(NODOS_VIGENTES, "ops", false));
  const sinOps = eliminar(NODOS_BORRADOR, "ops", true);
  assert.equal(sinOps.length, NODOS_BORRADOR.length - 1);
  assert.equal(sinOps.find((x) => x.clave === "coord_logistico")?.dependeDe, "logistica", "el nieto sigue con su padre");
  assert.equal(eliminar(NODOS_VIGENTES, "montajes", false).length, NODOS_VIGENTES.length - 1);
  assert.throws(() => eliminar(NODOS_VIGENTES, "dg", true));
});

test("correr cambia el orden con el hermano y no sale de los bordes", () => {
  const r = correr(NODOS_VIGENTES, "supervision", -1);
  assert.deepEqual(claves(hijos(r, "ops")).slice(0, 2), ["supervision", "planif"]);
  assert.deepEqual(correr(NODOS_VIGENTES, "planif", -1), NODOS_VIGENTES);
});

test("puestosDeArea trae los sub-puestos indentados", () => {
  const ops = puestosDeArea(NODOS_BORRADOR, "ops");
  assert.equal(ops.length, 8);
  assert.deepEqual(ops.find((x) => x.nodo.clave === "coord_logistico")?.nivel, 1);
  assert.equal(descendientes(NODOS_BORRADOR, "ops").length, 8);
});

test("estado: 3 vacantes (una cubierta por interino), 1 baja, Montajes cubierto por cuadrillas", () => {
  const puestos = NODOS_VIGENTES.filter((x) => x.tipo !== "direccion");
  const vacantes = puestos.filter((x) => estadoPuesto(DATOS, x.clave).vacante).map((x) => x.clave);
  assert.deepEqual(vacantes.sort(), ["cobr", "seguridad", "vehiculos"]);
  assert.equal(estadoPuesto(DATOS, "seguridad").interino, true);
  assert.deepEqual(puestos.filter((x) => estadoPuesto(DATOS, x.clave).baja).map((x) => x.clave), ["devoluciones"]);
  assert.equal(estadoPuesto(DATOS, "montajes").vacante, false);
  assert.equal(estadoPuesto(DATOS, "mant").externo, true);
});

test("quienResponde: vacante sube al responsable del área; baja también", () => {
  const veh = quienResponde(DATOS, "vehiculos")!;
  assert.equal(veh.subio, true);
  assert.equal(veh.motivo, "vacante");
  assert.equal(veh.nodo.clave, "ops");
  assert.deepEqual(veh.personas.map((p) => p.id), ["p-gro"]);
  const dev = quienResponde(DATOS, "devoluciones")!;
  assert.equal(dev.motivo, "baja");
  assert.equal(dev.nodo.clave, "deposito");
  assert.deepEqual(dev.personas.map((p) => p.id), ["p-sdo"]);
  const seg = quienResponde(DATOS, "seguridad")!;
  assert.equal(seg.subio, false, "el interino responde");
  assert.deepEqual(seg.personas.map((p) => p.id), ["p-wac"]);
});

test("cargaPorPersona: Natalia tiene 3 puestos; el capataz y su plantel, Montajes", () => {
  const carga = cargaPorPersona(DATOS);
  assert.equal(carga.get("p-nqu"), 3);
  assert.equal(carga.get("p-wac"), 2);
  assert.equal(carga.get("p-rgi"), 1);
  assert.equal(carga.get("p-alu"), 1);
  assert.equal(carga.has("p-lfu"), false);
});

test("pendientes: 1 baja, 3 vacantes, 1 sobrecarga, 1 interino de 72 días, 1 activo sin puesto", () => {
  const p = pendientes(DATOS, HOY);
  assert.deepEqual(p.bajas.map((b) => b.persona.id), ["p-nhe"]);
  assert.equal(p.vacantes.length, 3);
  assert.equal(p.vacantes.find((v) => v.nodo.clave === "cobr")?.desde, "2026-07-15");
  assert.equal(p.vacantes.find((v) => v.nodo.clave === "seguridad")?.interino?.id, "p-wac");
  assert.deepEqual(p.sobrecarga.map((s) => s.persona.id), ["p-nqu"]);
  assert.equal(p.interinos[0].dias, 72);
  assert.deepEqual(p.sinPuesto.map((x) => x.id), ["p-lfu"]);
  assert.equal(p.incompletas.sinMision.length, 18);
  assert.equal(p.accionables, 1 + 2 + 1);
});

test("buscar «remito»: los documentos RS, RDP y RDF y las tareas", () => {
  const r = buscar(DATOS, DOCUMENTOS, "remito");
  assert.deepEqual(r.documentos.map((d) => d.doc.codigo).sort(), ["RDF", "RDP", "RS"]);
  const rs = r.documentos.find((d) => d.doc.codigo === "RS")!;
  assert.equal(rs.usos[0].rol, "emite");
  assert.equal(rs.usos[0].nodo.clave, "stock");
  const tareas = r.tareas.map((t) => t.nodo.clave);
  assert.ok(tareas.includes("logistica") && tareas.includes("montajes") && tareas.includes("stock"), tareas.join());
});

test("buscar «SOL»: la usa Control de Stock y la emite Oficina Técnica", () => {
  const r = buscar(DATOS, DOCUMENTOS, "SOL");
  const sol = r.documentos.find((d) => d.doc.codigo === "SOL")!;
  assert.deepEqual(
    sol.usos.map((u) => `${u.rol}:${u.nodo.clave}`),
    ["emite:oficina_tec", "usa:stock"],
  );
});

test("buscar «factura» encuentra Facturación; «quiroga», a Natalia; «xyz», nada", () => {
  assert.ok(buscar(DATOS, DOCUMENTOS, "factura").puestos.some((x) => x.clave === "fact"));
  assert.deepEqual(buscar(DATOS, DOCUMENTOS, "quiroga").personas.map((p) => p.id), ["p-nqu"]);
  assert.equal(buscar(DATOS, DOCUMENTOS, "xyz").total, 0);
  assert.equal(buscar(DATOS, DOCUMENTOS, "   ").total, 0);
});

test("buscar sin tildes: «logistica» encuentra Repartos y Logística", () => {
  assert.ok(buscar(DATOS, DOCUMENTOS, "logistica").puestos.some((x) => x.clave === "logistica"));
  assert.ok(buscar(DATOS, DOCUMENTOS, "LOGÍSTICA").puestos.some((x) => x.clave === "logistica"));
});

test("normalizar conserva el largo y tramosCoincidencia marca sobre el texto original", () => {
  const t = "Repartos y Logística";
  assert.equal(normalizar(t).length, t.length);
  const [[i, f]] = tramosCoincidencia(t, "logistica");
  assert.equal(t.slice(i, f), "Logística");
  assert.deepEqual(tramosCoincidencia("Firma de Remitos", "remito firma"), [[0, 5], [9, 15]]);
});

test("diffVersiones: el borrador de la maqueta trae un puesto nuevo y una tarea más", () => {
  assert.deepEqual(diffVersiones(NODOS_VIGENTES, NODOS_BORRADOR), CAMBIOS_BORRADOR);
});

test("diffVersiones: movido y eliminado", () => {
  const movido = mover(NODOS_VIGENTES, "stock", "admin");
  assert.deepEqual(diffVersiones(NODOS_VIGENTES, movido), [
    { tipo: "movido", nodo: "stock", detalle: "De Depósito y Control de Materiales a Administración y Finanzas" },
  ]);
  const sinTaller = eliminar(NODOS_VIGENTES, "taller", false);
  assert.deepEqual(diffVersiones(NODOS_VIGENTES, sinTaller), [{ tipo: "eliminado", nodo: "taller", detalle: "Taller" }]);
  assert.deepEqual(diffVersiones(NODOS_VIGENTES, NODOS_VIGENTES), []);
});
