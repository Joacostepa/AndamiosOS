import { test } from "node:test";
import assert from "node:assert/strict";
import {
  comodinDe,
  comodinPuedeIr,
  evaluarComodines,
  otMarcable,
  TEXTO_CHIP_COMODIN,
  tituloComodin,
  type EntradaComodines,
} from "./comodines.ts";
import type { AsignacionTablero, OtTablero, ProgresoOt } from "./tipos.ts";

// Desde el 18/10 un comodín es una OT que Planificación MARCÓ (guardias-contrato.md §2,
// decidido por JS): ningún criterio de tipo, duración, urgencia ni fecha decide nada. Lo único
// que se cruza con la marca es que la OT siga pendiente o en proceso y le quede algo por hacer.

const HOY = "2026-11-04";

function ot(p: Partial<OtTablero> & Pick<OtTablero, "id">): OtTablero {
  return {
    titulo: `OT ${p.id}`,
    tipo: "desarme",
    estado: "pendiente",
    urgencia: "baja",
    jornadas: 1,
    fechaDesde: null,
    fechaAntesDe: null,
    creadaEl: "2026-10-01 12:00:00",
    ...p,
  } as OtTablero;
}

function entrada(
  marcados: [number, string][] = [],
  asignaciones: AsignacionTablero[] = [],
  progreso: ProgresoOt[] = [],
): Omit<EntradaComodines, "ots"> {
  return { marcados: new Map(marcados), asignaciones, progreso };
}

const MARCA = "2026-10-20T15:00:00Z";

test("sin marca no es comodín, aunque sea el desarme de un día de siempre", () => {
  assert.equal(comodinDe(ot({ id: 1 }), entrada()), null);
  assert.deepEqual(evaluarComodines({ ...entrada(), ots: [ot({ id: 1 }), ot({ id: 2 })] }), []);
});

test("marcada es comodín: cualquier tipo, urgencia, duración y fecha", () => {
  const marcas: [number, string][] = [[1, MARCA]];
  const c = comodinDe(ot({ id: 1 }), entrada(marcas));
  assert.deepEqual(c, { otId: 1, jornadas: 1, ubicacion: null, marcadoEl: MARCA });
  // Lo que antes la dejaba afuera ya no cuenta.
  assert.ok(comodinDe(ot({ id: 1, tipo: "armado" }), entrada(marcas)));
  assert.ok(comodinDe(ot({ id: 1, urgencia: "alta" }), entrada(marcas)));
  assert.ok(comodinDe(ot({ id: 1, jornadas: 3 }), entrada(marcas)));
  assert.ok(comodinDe(ot({ id: 1, fechaDesde: "2026-12-01" }), entrada(marcas)));
  assert.ok(comodinDe(ot({ id: 1, fechaDesde: null, creadaEl: null }), entrada(marcas)));
  assert.ok(comodinDe(ot({ id: 1, estado: "en_proceso" }), entrada(marcas)));
  // Sin piso ni vencimiento: el objeto no lleva nada de eso.
  assert.deepEqual(Object.keys(c!).sort(), ["jornadas", "marcadoEl", "otId", "ubicacion"]);
});

test("la duración vigente es la que se informa en jornadas", () => {
  const c = comodinDe(ot({ id: 1, jornadas: 1 }), { ...entrada([[1, MARCA]]), duracionDe: () => 2.5 });
  assert.equal(c?.jornadas, 2.5);
});

test("completada o cancelada no se muestra, aunque la marca siga guardada", () => {
  assert.equal(comodinDe(ot({ id: 1, estado: "completada" }), entrada([[1, MARCA]])), null);
  assert.equal(comodinDe(ot({ id: 1, estado: "cancelada" }), entrada([[1, MARCA]])), null);
  assert.equal(otMarcable({ estado: "pendiente" }), true);
  assert.equal(otMarcable({ estado: "en_proceso" }), true);
  assert.equal(otMarcable({ estado: "completada" }), false);
});

test("cerrada con parte (todas sus jornadas hechas) deja de ser comodín", () => {
  const marcas: [number, string][] = [[1, MARCA]];
  assert.equal(comodinDe(ot({ id: 1 }), entrada(marcas, [], [{ otId: 1, asignadas: 1, cerradas: 1 }])), null);
  assert.ok(comodinDe(ot({ id: 1 }), entrada(marcas, [], [{ otId: 1, asignadas: 1, cerradas: 0 }])));
  // Una de tres con dos hechas sigue siendo comodín: le queda un día.
  assert.ok(comodinDe(ot({ id: 1, jornadas: 3 }), entrada(marcas, [], [{ otId: 1, asignadas: 3, cerradas: 2 }])));
  assert.equal(comodinDe(ot({ id: 1, jornadas: 3 }), entrada(marcas, [], [{ otId: 1, asignadas: 3, cerradas: 3 }])), null);
  // Sin estimar (0 j): con un día cerrado ya está hecha.
  assert.equal(comodinDe(ot({ id: 1, jornadas: 0 }), entrada(marcas, [], [{ otId: 1, asignadas: 1, cerradas: 1 }])), null);
});

test("puede ir a cualquier día que no haya pasado; sin comodín, a ninguno", () => {
  const c = comodinDe(ot({ id: 1, fechaDesde: "2026-12-01" }), entrada([[1, MARCA]]));
  assert.equal(comodinPuedeIr(c, HOY, HOY), true);
  assert.equal(comodinPuedeIr(c, "2026-11-05", HOY), true, "antes de su 'a partir de' también: ya no hay piso");
  assert.equal(comodinPuedeIr(c, "2026-11-03", HOY), false, "un día pasado no, como cualquier cosa");
  assert.equal(comodinPuedeIr(null, "2026-11-05", HOY), false);
});

test("orden: por cuándo se marcó, el más viejo primero; a igual momento, el número de OT", () => {
  const lista = evaluarComodines({
    ...entrada([
      [1, "2026-10-28T12:00:00Z"],
      [2, "2026-10-15T12:00:00Z"],
      [3, "2026-10-20T12:00:00Z"],
      [5, "2026-10-20T12:00:00Z"],
      [9, "2026-10-01T12:00:00Z"], // marcada pero no está en el tablero: no aparece
    ]),
    ots: [ot({ id: 5 }), ot({ id: 1 }), ot({ id: 2 }), ot({ id: 3 }), ot({ id: 4 })],
  });
  assert.deepEqual(lista.map((c) => c.otId), [2, 3, 5, 1]);
});

test("dónde está hoy: su primer día en la grilla, sin contar apoyos ni días ya cerrados", () => {
  const base = { estado: "tentativa" as const, ordenDia: 0, notas: null, motivoFija: null, fraccion: 1, origen: "ot" as const };
  const asignaciones: AsignacionTablero[] = [
    { ...base, id: 10, otId: 1, fecha: "2026-11-09", cuadrillaId: 12, parteId: null },
    { ...base, id: 11, otId: 1, fecha: "2026-11-06", cuadrillaId: 13, parteId: null, apoyo: true },
    { ...base, id: 12, otId: 1, fecha: "2026-11-02", cuadrillaId: 14, parteId: 99 },
  ];
  const c = comodinDe(ot({ id: 1, jornadas: 2 }), entrada([[1, MARCA]], asignaciones));
  assert.deepEqual(c?.ubicacion, { fecha: "2026-11-09", cuadrillaId: 12 });
});

test("el chip dice sólo «comodín»; el tooltip, desde cuándo está marcada (día de Buenos Aires)", () => {
  assert.equal(TEXTO_CHIP_COMODIN, "comodín");
  // 01:30 UTC del 21 = 22:30 del 20 acá.
  assert.match(tituloComodin({ marcadoEl: "2026-10-21T01:30:00Z" }), /^Marcada como comodín el 20\/10: puede ir cualquier día/);
  assert.doesNotMatch(tituloComodin({ marcadoEl: MARCA }), /quedan|vencid|esperando/i);
});
