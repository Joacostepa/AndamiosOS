// La traducción base ↔ pantalla y la sincronización por diferencias del organigrama.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eliminar, mover } from "./arbol.ts";
import {
  conExternosLibres,
  desdeServidor,
  diffNodos,
  diffOcupantes,
  filaDeNodo,
  filaDeOcupante,
  hoyBA,
  nodoDeFila,
  nombrePropio,
  operacionesPara,
  origenDeId,
  referenciaDe,
  type LecturaOrg,
} from "./datos.ts";
import { ESTRUCTURA_BASE } from "./estructura-base.ts";
import { quitarOcupante, renombrar, ubicarPersona } from "./lienzo.ts";
import type { Ocupante } from "./tipos.ts";

const BASE = ESTRUCTURA_BASE;

test("estructura base: 1 dirección, 5 áreas y 18 puestos, una sola raíz y sin personas", () => {
  assert.equal(BASE.length, 24);
  assert.equal(BASE.filter((n) => n.tipo === "direccion").length, 1);
  assert.equal(BASE.filter((n) => n.tipo === "area").length, 5);
  assert.equal(BASE.filter((n) => n.tipo === "puesto").length, 18);
  assert.equal(BASE.filter((n) => n.dependeDe === null).length, 1);
  assert.ok(BASE.every((n) => !n.notaInterna), "la base no trae notas internas de ejemplo");
  const claves = new Set(BASE.map((n) => n.clave));
  assert.ok(BASE.every((n) => n.dependeDe === null || claves.has(n.dependeDe)));
  assert.equal(BASE.find((n) => n.clave === "montajes")?.fuenteOcupantes, "cuadrillas");
});

test("la migración siembra exactamente la estructura base (el JSON no se desincroniza)", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/20261012000003_organigrama.sql", import.meta.url), "utf8");
  const m = sql.match(/\$base\$(\[[\s\S]*?\])\$base\$/);
  assert.ok(m, "la migración tiene el bloque $base$…$base$");
  assert.deepEqual(JSON.parse(m![1]), BASE.map(filaDeNodo));
});

test("nodo ↔ fila: ida y vuelta sin perder nada", () => {
  for (const n of BASE) assert.deepEqual(nodoDeFila(filaDeNodo(n)), n);
  const conNota = { ...BASE[0], notaInterna: "solo editores" };
  assert.deepEqual(nodoDeFila(filaDeNodo(conNota), "solo editores"), conNota);
  assert.equal("notaInterna" in filaDeNodo(conNota), false, "la nota interna no viaja en la fila versionada");
});

test("ids de persona: prefijo → columna de org_ocupantes", () => {
  assert.deepEqual(referenciaDe("p:abc"), { personal_id: "abc", usuario_id: null, nombre_libre: null });
  assert.deepEqual(referenciaDe("u:abc"), { personal_id: null, usuario_id: "abc", nombre_libre: null });
  assert.deepEqual(referenciaDe("x:Servicios Edilicios Sur"), { personal_id: null, usuario_id: null, nombre_libre: "Servicios Edilicios Sur" });
  assert.throws(() => referenciaDe("e:abc"), /a mano/);
  assert.throws(() => referenciaDe("p-rfb"));
  assert.equal(origenDeId("x:"), null);
});

test("nombrePropio: los legajos en mayúsculas se leen bien; lo demás no se toca", () => {
  assert.equal(nombrePropio("JUAN CARLOS"), "Juan Carlos");
  assert.equal(nombrePropio("PEREZ DE LA FUENTE"), "Perez de la Fuente");
  assert.equal(nombrePropio("O'BRIEN-ÑANDÚ"), "O'Brien-Ñandú");
  assert.equal(nombrePropio("Juan Agustin"), "Juan Agustin");
  assert.equal(nombrePropio("  "), "");
  assert.equal(nombrePropio(null), "");
});

test("hoyBA: la fecha de Buenos Aires, no la de UTC", () => {
  assert.equal(hoyBA(new Date("2026-10-13T02:30:00Z")), "2026-10-12");
  assert.equal(hoyBA(new Date("2026-10-13T03:30:00Z")), "2026-10-13");
});

const LECTURA: LecturaOrg = {
  yo: { usuario_id: "u1", personal_id: null },
  puede_editar: true,
  versiones: [
    { id: "v1", numero: 1, estado: "archivada", nota: "Estructura inicial", publicada_at: "2026-10-12T15:00:00Z", created_at: "2026-10-12T15:00:00Z", autor: null, cambios: [] },
    {
      id: "v2",
      numero: 2,
      estado: "publicada",
      nota: "Otra",
      publicada_at: "2026-10-14T02:00:00Z",
      created_at: "2026-10-13T12:00:00Z",
      autor: "Joaquin Stepansky",
      cambios: [{ tipo: "nuevo", nodo: "x", detalle: "X" }],
    },
  ],
  borrador: { id: "b", numero: null, estado: "borrador", nota: null, publicada_at: null, created_at: "2026-10-15T12:00:00Z", autor: null, cambios: null },
  nodos_vigentes: BASE.map(filaDeNodo).reverse(),
  nodos_borrador: BASE.map(filaDeNodo),
  notas: [{ clave: "cobr", texto: "Buscando" }],
  ocupantes: [
    { id: "o1", clave: "dg", personal_id: null, usuario_id: "u1", nombre_libre: null, modalidad: "titular", desde: "2026-10-12", hasta: null },
    { id: "o2", clave: "mant", personal_id: null, usuario_id: null, nombre_libre: "Servicios Edilicios Sur", modalidad: "compartido", desde: "2026-10-12", hasta: null },
    { id: "o3", clave: "stock", personal_id: "l2", usuario_id: null, nombre_libre: null, modalidad: "interino", desde: "2026-10-01", hasta: "2026-10-10" },
  ],
  personal: [
    { id: "l1", nombre: "JUAN", apellido: "PEREZ", telefono: null, email: null, activo: true, odoo_tarea: "andamista", user_id: "u1" },
    { id: "l2", nombre: "ANA", apellido: "GOMEZ", telefono: "11 1234-5678", email: null, activo: false, odoo_tarea: null, user_id: null },
  ],
  usuarios: [
    { id: "u1", nombre: "Juan", apellido: "Pérez", telefono: "11 0000-0000", email: "juan@aba", activo: true },
    { id: "u2", nombre: "Rocio", apellido: "Riveros", telefono: null, email: "rocio@aba", activo: true },
  ],
  externos: [{ id: "e1", nombre: "HUGO", apellido: "BAEZ", empresa: "Montajes del Oeste", telefono: null, activo: true, cuadrilla_id: "c1" }],
  cuadrillas: [{ id: "c1", nombre: "Cuadrilla 1", orden: 1, responsable_id: "l1", es_temporaria: false, plantel: ["l2"] }],
};

test("desdeServidor: personas sin duplicar (el legajo vinculado gana al usuario) y externos libres", () => {
  const e = desdeServidor(LECTURA);
  assert.deepEqual(
    e.personas.map((p) => p.id),
    ["p:l1", "p:l2", "u:u2", "e:e1", "x:Servicios Edilicios Sur"],
  );
  const juan = e.personas[0];
  assert.equal(juan.nombre, "Juan");
  assert.equal(juan.telefono, "11 0000-0000", "sin teléfono en el legajo, usa el del usuario");
  assert.equal(juan.email, "juan@aba");
  assert.equal(juan.tarea, "andamista");
  assert.equal(e.yo, "p:l1", "quien mira es su legajo vinculado");
  // El ocupante cargado con el usuario se ve como el legajo (misma persona).
  assert.equal(e.ocupantes.find((o) => o.id === "o1")?.persona, "p:l1");
  assert.equal(e.ocupantes.find((o) => o.id === "o2")?.modalidad, "titular", "compartido = otro titular");
  assert.equal(e.ocupantes.find((o) => o.id === "o3")?.hasta, "2026-10-10");
  assert.equal(e.personas.find((p) => p.id === "e:e1")?.empresa, "Montajes del Oeste");
});

test("desdeServidor: estructura ordenada, notas internas, versiones y cuadrillas", () => {
  const e = desdeServidor(LECTURA);
  assert.deepEqual(
    e.vigente.map((n) => n.clave),
    BASE.map((n) => n.clave),
    "vuelve en el orden del árbol aunque la base lo mande desordenado",
  );
  assert.equal(e.vigente.find((n) => n.clave === "cobr")?.notaInterna, "Buscando");
  assert.equal(e.borradorId, "b");
  assert.deepEqual(e.borradorMeta, { fecha: "2026-10-15", autor: "Un editor" });
  assert.deepEqual(
    e.versiones.map((v) => [v.numero, v.estado, v.fecha, v.autor]),
    [
      [2, "publicada", "2026-10-13", "Joaquin Stepansky"],
      [1, "archivada", "2026-10-12", "Carga inicial"],
    ],
  );
  assert.deepEqual(e.cuadrillas, [{ id: "c1", nombre: "Cuadrilla 1", capataz: "p:l1", plantel: ["p:l2", "e:e1"] }]);
});

test("diffNodos: solo lo que cambió, lo borrado y las notas internas aparte", () => {
  assert.deepEqual(diffNodos(BASE, BASE), { upsert: [], borrar: [], notas: [] });
  const movido = mover(BASE, "taller", "deposito");
  const r = diffNodos(BASE, movido);
  assert.deepEqual(r.upsert.map((f) => [f.clave, f.depende_de]), [["taller", "deposito"]]);
  const sinStock = eliminar(BASE, "stock", true);
  assert.deepEqual(diffNodos(BASE, sinStock).borrar, ["stock"]);
  const conNota = BASE.map((n) => (n.clave === "it" ? { ...n, notaInterna: "  Ojo  " } : n));
  assert.deepEqual(diffNodos(BASE, conNota), { upsert: [], borrar: [], notas: [{ clave: "it", texto: "Ojo" }] });
  assert.deepEqual(diffNodos(conNota, BASE).notas, [{ clave: "it", texto: null }], "borrar la nota");
});

const OCUP: Ocupante[] = [{ id: "o1", nodo: "dg", persona: "u:u1", modalidad: "titular", desde: "2026-10-01" }];

test("diffOcupantes: asignar inserta, quitar pone `hasta`, deshacer la asignación la borra", () => {
  const asignado = ubicarPersona(OCUP, { nodo: "stock", persona: "p:l1", modo: "compartir", id: "o2", hoy: "2026-10-12" });
  assert.deepEqual(diffOcupantes(OCUP, asignado), {
    upsert: [{ id: "o2", clave: "stock", personal_id: "l1", usuario_id: null, nombre_libre: null, modalidad: "titular", desde: "2026-10-12", hasta: null }],
    borrar: [],
  });
  const quitado = quitarOcupante(asignado, "o1", "2026-10-12");
  assert.deepEqual(diffOcupantes(asignado, quitado).upsert.map((f) => [f.id, f.hasta]), [["o1", "2026-10-12"]]);
  assert.deepEqual(diffOcupantes(asignado, OCUP), { upsert: [], borrar: ["o2"] });
  assert.equal(filaDeOcupante({ ...OCUP[0], persona: "x:Limpieza SA" }).nombre_libre, "Limpieza SA");
});

test("operacionesPara: el primer cambio crea el borrador y le aplica la diferencia contra la vigente", () => {
  const nuevo = renombrar(BASE, "it", "Soporte");
  const ops = operacionesPara({ borrador: null, ocupantes: OCUP }, { borrador: nuevo, ocupantes: OCUP }, BASE);
  assert.deepEqual(
    ops.map((o) => o.tipo),
    ["crearBorrador", "guardarBorrador"],
  );
  // Entrar a editar sin tocar nada: solo se crea.
  assert.deepEqual(operacionesPara({ borrador: null, ocupantes: OCUP }, { borrador: BASE, ocupantes: OCUP }, BASE), [{ tipo: "crearBorrador" }]);
});

test("operacionesPara: deshacer hasta antes del borrador lo descarta; la estructura va antes que la ocupación", () => {
  assert.deepEqual(operacionesPara({ borrador: BASE, ocupantes: OCUP }, { borrador: null, ocupantes: OCUP }, BASE), [{ tipo: "descartar" }]);
  const conPuesto = [...BASE, { ...BASE[2], clave: "nuevo", titulo: "Nuevo" }];
  const ocup = ubicarPersona(OCUP, { nodo: "nuevo", persona: "p:l1", modo: "compartir", id: "o9", hoy: "2026-10-12" });
  const ops = operacionesPara({ borrador: BASE, ocupantes: OCUP }, { borrador: conPuesto, ocupantes: ocup }, BASE);
  assert.deepEqual(
    ops.map((o) => o.tipo),
    ["guardarBorrador", "ocupantes"],
  );
  assert.deepEqual(operacionesPara({ borrador: BASE, ocupantes: OCUP }, { borrador: BASE, ocupantes: OCUP }, BASE), []);
});

test("conExternosLibres: el de afuera recién ubicado aparece como persona", () => {
  const ocup: Ocupante[] = [{ id: "o1", nodo: "mant", persona: "x:Limpieza SA", modalidad: "titular", desde: "2026-10-12" }];
  const r = conExternosLibres([], ocup);
  assert.deepEqual(r, [{ id: "x:Limpieza SA", nombre: "Limpieza SA", apellido: "", origen: "externo", activo: true }]);
  assert.equal(conExternosLibres(r, ocup), r, "si ya está, devuelve la misma lista");
});
