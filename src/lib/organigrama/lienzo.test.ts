// Las operaciones del Lienzo vivo y los circuitos de «Seguí el papel» contra el dataset.

import { test } from "node:test";
import assert from "node:assert/strict";
import { descendientes, estadoPuesto, nodoDe, ocupantesVigentes } from "./arbol.ts";
import { CIRCUITOS } from "./circuitos.ts";
import { CUADRILLAS, HOY, NODOS_VIGENTES, OCUPANTES, PERSONAS } from "./datos-maqueta.ts";
import {
  colorLibre,
  crearDesdeHerramienta,
  deshacer,
  destinoValidoHerramienta,
  destinoValidoNodo,
  destinoValidoPersona,
  eliminarRama,
  estadisticaRama,
  hayQuePreguntar,
  historialVacio,
  quitarOcupante,
  registrar,
  rehacer,
  renombrar,
  resumen,
  ubicarPersona,
} from "./lienzo.ts";
import type { DatosOrg } from "./tipos.ts";

const DATOS: DatosOrg = { nodos: NODOS_VIGENTES, personas: PERSONAS, ocupantes: OCUPANTES, cuadrillas: CUADRILLAS };

test("herramientas: puesto y vacante van en cualquier nodo; un área, solo debajo de la Dirección o de otra área", () => {
  assert.ok(destinoValidoHerramienta(NODOS_VIGENTES, "puesto", "stock"));
  assert.ok(destinoValidoHerramienta(NODOS_VIGENTES, "vacante", "dg"));
  assert.ok(destinoValidoHerramienta(NODOS_VIGENTES, "area", "dg"));
  assert.ok(!destinoValidoHerramienta(NODOS_VIGENTES, "area", "stock"));
  assert.ok(!destinoValidoHerramienta(NODOS_VIGENTES, "puesto", "no_existe"));
});

test("crear desde la caja: queda al final de los hermanos, con clave única; el área toma el color libre", () => {
  const { nodos, clave } = crearDesdeHerramienta(NODOS_VIGENTES, "puesto", "deposito");
  const n = nodoDe(nodos, clave)!;
  assert.equal(n.dependeDe, "deposito");
  assert.equal(n.orden, 3);
  assert.equal(n.titulo, "Puesto nuevo");
  const otra = crearDesdeHerramienta(nodos, "puesto", "deposito");
  assert.notEqual(otra.clave, clave);
  const vac = crearDesdeHerramienta(NODOS_VIGENTES, "vacante", "admin");
  assert.equal(nodoDe(vac.nodos, vac.clave)!.notaInterna, "Búsqueda abierta");
  // El seed usa gris, teal, ámbar, violeta, verde y rosa: queda el azul.
  assert.equal(colorLibre(NODOS_VIGENTES), "azul");
  const area = crearDesdeHerramienta(NODOS_VIGENTES, "area", "dg");
  assert.equal(nodoDe(area.nodos, area.clave)!.color, "azul");
  assert.equal(nodoDe(area.nodos, area.clave)!.tipo, "area");
  assert.throws(() => crearDesdeHerramienta(NODOS_VIGENTES, "area", "stock"));
});

test("renombrar ignora un nombre vacío", () => {
  assert.equal(renombrar(NODOS_VIGENTES, "stock", "  "), NODOS_VIGENTES);
  assert.equal(nodoDe(renombrar(NODOS_VIGENTES, "stock", " Stock "), "stock")!.titulo, "Stock");
});

test("mover un puesto: no sobre sí mismo, sus descendientes ni su padre actual; la raíz no se mueve", () => {
  assert.ok(destinoValidoNodo(NODOS_VIGENTES, "stock", "ops"));
  assert.ok(!destinoValidoNodo(NODOS_VIGENTES, "stock", "stock"));
  assert.ok(!destinoValidoNodo(NODOS_VIGENTES, "stock", "deposito"));
  assert.ok(!destinoValidoNodo(NODOS_VIGENTES, "ops", "taller"));
  assert.ok(!destinoValidoNodo(NODOS_VIGENTES, "dg", "ops"));
});

test("eliminar la rama entera saca al nodo y a todos sus dependientes; la Dirección no", () => {
  const r = eliminarRama(NODOS_VIGENTES, "ops");
  assert.equal(r.length, NODOS_VIGENTES.length - 1 - descendientes(NODOS_VIGENTES, "ops").length);
  assert.ok(!nodoDe(r, "taller"));
  assert.throws(() => eliminarRama(NODOS_VIGENTES, "dg"));
});

test("personas: Montajes no acepta (sale de las cuadrillas) y no se suelta a alguien donde ya está", () => {
  assert.ok(!destinoValidoPersona(DATOS, "p-lfu", "montajes"));
  assert.ok(!destinoValidoPersona(DATOS, "p-sdo", "stock"));
  assert.ok(destinoValidoPersona(DATOS, "p-lfu", "cobr"));
});

test("cubrir una vacante: Leandro a Cobranzas deja el puesto cubierto y sin preguntar", () => {
  assert.ok(!hayQuePreguntar(DATOS, "cobr"));
  const ocupantes = ubicarPersona(OCUPANTES, { nodo: "cobr", persona: "p-lfu", modo: "compartir", id: "o-x", hoy: HOY });
  assert.equal(estadoPuesto({ ...DATOS, ocupantes }, "cobr").vacante, false);
});

test("reemplazar termina a los vigentes del puesto; compartir los deja; interino se suma como interino", () => {
  assert.ok(hayQuePreguntar(DATOS, "stock"));
  const r = ubicarPersona(OCUPANTES, { nodo: "stock", persona: "p-lfu", modo: "reemplazar", id: "o-x", hoy: HOY });
  assert.deepEqual(ocupantesVigentes({ ...DATOS, ocupantes: r }, "stock").map((o) => o.persona), ["p-lfu"]);
  const c = ubicarPersona(OCUPANTES, { nodo: "stock", persona: "p-lfu", modo: "compartir", id: "o-x", hoy: HOY });
  assert.deepEqual(ocupantesVigentes({ ...DATOS, ocupantes: c }, "stock").map((o) => o.persona).sort(), ["p-lfu", "p-sdo"]);
  const i = ubicarPersona(OCUPANTES, { nodo: "vehiculos", persona: "p-lfu", modo: "interino", id: "o-x", hoy: HOY });
  const e = estadoPuesto({ ...DATOS, ocupantes: i }, "vehiculos");
  assert.ok(e.vacante && e.interino);
});

test("arrastrar desde otro puesto mueve a la persona (el ocupante de origen termina)", () => {
  const r = ubicarPersona(OCUPANTES, { nodo: "cobr", persona: "p-smo", modo: "compartir", desdeOcupante: "o-tes", id: "o-x", hoy: HOY });
  const d = { ...DATOS, ocupantes: r };
  assert.ok(estadoPuesto(d, "teso").vacante);
  assert.ok(!estadoPuesto(d, "cobr").vacante);
  // Al soltar sobre su propio puesto no se pregunta por ella misma.
  assert.ok(!hayQuePreguntar(DATOS, "teso", "o-tes"));
});

test("devolver al banco: el ocupante termina hoy y el puesto queda vacante", () => {
  const r = quitarOcupante(OCUPANTES, "o-tes", HOY);
  assert.equal(r.find((o) => o.id === "o-tes")!.hasta, HOY);
  assert.ok(estadoPuesto({ ...DATOS, ocupantes: r }, "teso").vacante);
});

test("contadores del dataset: 18 puestos, 3 vacantes (1 con interino), 1 activo sin puesto", () => {
  const r = resumen(DATOS, HOY);
  assert.equal(r.puestos, 18);
  assert.equal(r.areas, 5);
  assert.equal(r.vacantes, 3);
  assert.equal(r.conInterino, 1);
  assert.equal(r.sinPuesto, 1);
  assert.equal(r.activos, 35);
  assert.equal(r.conPuesto, 34);
});

test("historial: deshacer y rehacer van y vuelven; un cambio nuevo borra lo rehacible", () => {
  let h = historialVacio<number>();
  h = registrar(h, 1);
  h = registrar(h, 2);
  const d = deshacer(h, 3)!;
  assert.equal(d.foto, 2);
  const r = rehacer(d.historial, 2)!;
  assert.equal(r.foto, 3);
  assert.deepEqual(r.historial, { pasado: [1, 2], futuro: [] });
  const nuevo = registrar(d.historial, 2);
  assert.deepEqual(nuevo.futuro, []);
  assert.equal(deshacer(historialVacio<number>(), 0), null);
  assert.equal(rehacer(historialVacio<number>(), 0), null);
  let largo = historialVacio<number>();
  for (let i = 0; i < 100; i++) largo = registrar(largo, i, 10);
  assert.equal(largo.pasado.length, 10);
  assert.equal(largo.pasado[0], 90);
});

test("circuitos: cada parada existe en la estructura y, si dice qué hace con el papel, el puesto tiene esa tarea", () => {
  assert.ok(CIRCUITOS.length >= 3);
  for (const c of CIRCUITOS) {
    assert.ok(c.paradas.length >= 4, c.id);
    for (const p of c.paradas) {
      const n = nodoDe(NODOS_VIGENTES, p.nodo);
      assert.ok(n, `${c.id}: no existe ${p.nodo}`);
      if (p.rol && p.papel !== "FAC") {
        const tiene = n.tareas.some((t) => t.docs?.some((d) => d.codigo === p.papel && d.rol === p.rol));
        assert.ok(tiene, `${c.id}: ${p.nodo} no ${p.rol} ${p.papel}`);
      }
    }
  }
});

test("estadisticaRama: Operaciones cuenta sus 7 puestos y a las cuadrillas enteras; Administración, a Natalia una vez", () => {
  const ops = estadisticaRama(DATOS, "ops");
  assert.equal(ops.puestos, 7);
  // Gustavo, Carolina, Walter, Osvaldo, 2 choferes y 3 cuadrillas de 1 capataz + plantel (5+4+4).
  assert.equal(ops.personas, 6 + 3 + 13);
  assert.equal(ops.vacantes, 2);
  const admin = estadisticaRama(DATOS, "admin");
  assert.deepEqual(admin, { puestos: 4, personas: 2, vacantes: 1 });
});
