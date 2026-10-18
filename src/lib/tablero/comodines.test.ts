import { test } from "node:test";
import assert from "node:assert/strict";
import { comodinDe, comodinPuedeIr, evaluarComodines, textoChipComodin, type EntradaComodines } from "./comodines.ts";
import type { AsignacionTablero, OtTablero, ProgresoOt } from "./tipos.ts";

// Un comodín es un desarme de 1 j o menos, pendiente, sin urgencia alta, con el piso ya
// llegado y que no lleva más de 7 días hábiles esperando (guardias-contrato.md §2.1). Hoy
// es el miércoles 04/11/2026.

const HOY = "2026-11-04";
const SIN_FERIADOS = new Set<string>();

function ot(p: Partial<OtTablero> & Pick<OtTablero, "id">): OtTablero {
  return {
    titulo: `OT ${p.id}`,
    tipo: "desarme",
    estado: "pendiente",
    urgencia: "baja",
    jornadas: 1,
    fechaDesde: "2026-10-30",
    fechaAntesDe: null,
    creadaEl: "2026-10-01 12:00:00",
    ...p,
  } as OtTablero;
}

function entrada(asignaciones: AsignacionTablero[] = [], progreso: ProgresoOt[] = []): Omit<EntradaComodines, "ots"> {
  return { asignaciones, progreso, hoy: HOY, feriados: SIN_FERIADOS };
}

test("desarme de 1 j pendiente con el piso cumplido: es comodín", () => {
  const c = comodinDe(ot({ id: 1 }), entrada());
  assert.ok(c);
  assert.equal(c.piso, "2026-10-30");
  assert.equal(c.pisoDeCreacion, false);
  // Sábado 31, lunes 02, martes 03, miércoles 04.
  assert.equal(c.espera, 4);
  assert.equal(c.quedan, 3);
  assert.equal(c.vencido, false);
  assert.equal(c.ubicacion, null);
  // En proceso también.
  assert.ok(comodinDe(ot({ id: 1, estado: "en_proceso" }), entrada()));
});

test("un armado no es comodín; una urgencia alta tampoco; 1,5 j tampoco", () => {
  assert.equal(comodinDe(ot({ id: 1, tipo: "armado" }), entrada()), null);
  assert.equal(comodinDe(ot({ id: 1, urgencia: "alta" }), entrada()), null);
  assert.ok(comodinDe(ot({ id: 1, urgencia: "media" }), entrada()));
  assert.equal(comodinDe(ot({ id: 1, jornadas: 1.5 }), entrada()), null);
  assert.ok(comodinDe(ot({ id: 1, jornadas: 0.5 }), entrada()));
  // La duración vigente manda sobre la estimada.
  assert.equal(comodinDe(ot({ id: 1 }), { ...entrada(), duracionDe: () => 2 }), null);
});

test("un desarme completado, o con su jornada ya cerrada, no es comodín", () => {
  assert.equal(comodinDe(ot({ id: 1, estado: "completada" }), entrada()), null);
  assert.equal(comodinDe(ot({ id: 1 }), entrada([], [{ otId: 1, asignadas: 1, cerradas: 1 }])), null);
  assert.ok(comodinDe(ot({ id: 1 }), entrada([], [{ otId: 1, asignadas: 1, cerradas: 0 }])));
});

test("piso futuro: espera 0 y no puede ir antes del piso", () => {
  const c = comodinDe(ot({ id: 1, fechaDesde: "2026-11-10" }), entrada());
  assert.ok(c);
  assert.equal(c.espera, 0);
  assert.equal(c.vencido, false);
  assert.equal(comodinPuedeIr(c, "2026-11-09"), false);
  assert.equal(comodinPuedeIr(c, "2026-11-10"), true);
});

test("sin piso cargado cuenta desde que se creó la OT; sin ninguno de los dos, no es", () => {
  // 23:30 UTC del 30 = 20:30 del 30 acá.
  const c = comodinDe(ot({ id: 1, fechaDesde: null, creadaEl: "2026-10-30 23:30:00" }), entrada());
  assert.ok(c);
  assert.equal(c.piso, "2026-10-30");
  assert.equal(c.pisoDeCreacion, true);
  assert.equal(comodinDe(ot({ id: 1, fechaDesde: null, creadaEl: null }), entrada()), null);
});

test("7 días hábiles esperando todavía es comodín; 8 ya está vencido", () => {
  // Del lunes 26/10: martes 27 … miércoles 04 son 8 hábiles.
  const ocho = comodinDe(ot({ id: 1, fechaDesde: "2026-10-26" }), entrada());
  assert.equal(ocho?.espera, 8);
  assert.equal(ocho?.vencido, true);
  assert.equal(ocho?.quedan, -1);
  const siete = comodinDe(ot({ id: 1, fechaDesde: "2026-10-27" }), entrada());
  assert.equal(siete?.espera, 7);
  assert.equal(siete?.vencido, false);
  assert.equal(siete?.quedan, 0);
  // Vencido no puede ir a ningún lado como comodín (va como urgente).
  assert.equal(comodinPuedeIr(ocho!, "2026-11-05"), false);
});

test("orden: el que más espera primero; incluye los vencidos marcados", () => {
  const lista = evaluarComodines({
    ...entrada(),
    ots: [
      ot({ id: 1, fechaDesde: "2026-11-02" }),
      ot({ id: 2, fechaDesde: "2026-10-26" }),
      ot({ id: 3, fechaDesde: "2026-10-30" }),
      ot({ id: 4, tipo: "armado" }),
    ],
  });
  assert.deepEqual(lista.map((c) => c.otId), [2, 3, 1]);
  assert.equal(lista[0].vencido, true);
});

test("dónde está hoy: su primer día en la grilla, sin contar apoyos ni días ya cerrados", () => {
  const base = { estado: "tentativa" as const, ordenDia: 0, notas: null, motivoFija: null, fraccion: 1, origen: "ot" as const };
  const asignaciones: AsignacionTablero[] = [
    { ...base, id: 10, otId: 1, fecha: "2026-11-09", cuadrillaId: 12, parteId: null },
    { ...base, id: 11, otId: 1, fecha: "2026-11-06", cuadrillaId: 13, parteId: null, apoyo: true },
    { ...base, id: 12, otId: 1, fecha: "2026-11-02", cuadrillaId: 14, parteId: 99 },
  ];
  const c = comodinDe(ot({ id: 1 }), entrada(asignaciones));
  assert.deepEqual(c?.ubicacion, { fecha: "2026-11-09", cuadrillaId: 12 });
});

test("el chip: desde el piso; cerca del límite, cuántos días quedan; vencido, cuánto espera", () => {
  const c = comodinDe(ot({ id: 1, fechaDesde: "2026-10-28" }), entrada());
  assert.equal(c?.quedan, 1);
  assert.equal(textoChipComodin(c!), "comodín · quedan 1 d");
  assert.equal(textoChipComodin({ piso: "2026-10-30", espera: 5, quedan: 2, vencido: false }), "comodín · quedan 2 d");
  assert.equal(textoChipComodin({ piso: "2026-10-20", espera: 3, quedan: 4, vencido: false }), "comodín · desde 20/10");
  assert.equal(textoChipComodin({ piso: "2026-10-20", espera: 8, quedan: -1, vencido: true }), "Esperando hace 8 días hábiles");
});
