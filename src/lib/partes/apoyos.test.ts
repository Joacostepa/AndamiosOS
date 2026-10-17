import { test } from "node:test";
import assert from "node:assert/strict";
import { apoyosAlParte, apoyosSinGente, datosDeParteCargado } from "./apoyos.ts";
import type { ApoyoListado } from "@/lib/tablero/tipos-jornada";
import type { ParteCargado } from "@/lib/tablero/tipos-parte";

const C2 = 2;
const C3 = 3;
const C4 = 4;

function parte(cambios: Partial<ParteCargado> = {}): ParteCargado {
  return {
    id: 500,
    otId: 10,
    fecha: "2026-11-10",
    cuadrillaId: C2,
    punteroId: 7,
    camionEnObra: false,
    estado: "ejecutado",
    motivoNoEjec: null,
    sector: null,
    clima: null,
    objetivo: null,
    tareas: null,
    observaciones: "todo bien",
    horasHombre: 40,
    costoTotal: 0,
    manoObra: [{ tarea: "armado", personas: 5, horaDesde: 8, horaHasta: 17, cuadrillaId: C2, horas: 8, horasHombre: 40 }],
    flete: { cantidad: 1, tercerizado: false },
    fletesExtra: [],
    incidencias: [],
    fotos: [{ momento: "final", descripcion: null }],
    ...cambios,
  };
}

function apoyo(cambios: Partial<ApoyoListado> = {}): ApoyoListado {
  return {
    asignacionId: 900,
    cuadrillaId: C3,
    cuadrillaNombre: "Cuadrilla 3",
    fraccion: 0.5,
    estadoAsignacion: "confirmada",
    parteId: 500,
    horarioSugerido: { horaDesde: 13, horaHasta: 17 },
    ...cambios,
  };
}

test("apoyosSinGente: el apoyo sumado después del parte pide su gente", () => {
  assert.deepEqual(apoyosSinGente(parte(), [apoyo()]).map((a) => a.asignacionId), [900]);
  // Sin vincular todavía (el tablero no lo vinculó): también.
  assert.equal(apoyosSinGente(parte(), [apoyo({ parteId: null })]).length, 1);
});

test("apoyosSinGente: con un renglón de su cuadrilla ya no avisa", () => {
  const p = parte({
    manoObra: [
      ...parte().manoObra,
      { tarea: "armado", personas: 4, horaDesde: 13, horaHasta: 17, cuadrillaId: C3, horas: 4, horasHombre: 16 },
    ],
  });
  assert.equal(apoyosSinGente(p, [apoyo()]).length, 0);
});

test("apoyosSinGente: no mira apoyos de otro parte ni partes no ejecutados", () => {
  assert.equal(apoyosSinGente(parte(), [apoyo({ parteId: 499 })]).length, 0);
  assert.equal(apoyosSinGente(parte({ estado: "no_ejecutado" }), [apoyo()]).length, 0);
});

test("apoyosSinGente: un renglón viejo sin cuadrilla cuenta como de la del parte", () => {
  const p = parte({
    manoObra: [{ tarea: "armado", personas: 5, horaDesde: 8, horaHasta: 17, cuadrillaId: null, horas: 8, horasHombre: 40 }],
  });
  // El apoyo es de otra cuadrilla: sigue faltando.
  assert.equal(apoyosSinGente(p, [apoyo()]).length, 1);
  // Si el "apoyo" fuera de la misma cuadrilla que el parte, ya está cubierto.
  assert.equal(apoyosSinGente(p, [apoyo({ cuadrillaId: C2 })]).length, 0);
});

test("datosDeParteCargado: conserva cada renglón con su cuadrilla y suma el del apoyo", () => {
  const d = datosDeParteCargado(
    parte({
      manoObra: [
        { tarea: "armado", personas: 5, horaDesde: 8, horaHasta: 17, cuadrillaId: C2, horas: 8, horasHombre: 40 },
        { tarea: "armado", personas: 3, horaDesde: 8, horaHasta: 17, cuadrillaId: C4, horas: 8, horasHombre: 24 },
      ],
    }),
    {
      lineaExtra: { tarea: "armado", personas: 4, horaDesde: 13, horaHasta: 17, cuadrillaId: C3 },
      apoyos: [{ asignacionId: 900, fue: true }],
    },
  );
  assert.deepEqual(d.manoObra.map((l) => [l.cuadrillaId, l.personas]), [[C2, 5], [C4, 3], [C3, 4]]);
  assert.deepEqual(d.apoyos, [{ asignacionId: 900, fue: true }]);
  // Lo que no se edita viaja igual: el PATCH reemplaza las líneas.
  assert.deepEqual(d.flete, { cantidad: 1, tercerizado: false });
  assert.equal(d.observaciones, "todo bien");
  assert.equal(d.punteroId, 7);
  // Las fotos ya están en Odoo: no se vuelven a subir.
  assert.deepEqual(d.fotos, []);
  // Los calculados de Odoo no viajan.
  assert.equal("horasHombre" in d.manoObra[0], false);
});

test("datosDeParteCargado: un renglón viejo sin cuadrilla se escribe con la del parte", () => {
  const d = datosDeParteCargado(
    parte({ manoObra: [{ tarea: "armado", personas: 5, horaDesde: 8, horaHasta: 17, cuadrillaId: null, horas: 8, horasHombre: 40 }] }),
    { apoyos: [] },
  );
  assert.equal(d.manoObra[0].cuadrillaId, C2);
});

test("apoyosAlParte: un renglón por apoyo que fue, y el no fue viaja para borrarse", () => {
  const r = apoyosAlParte(
    [
      { asignacionId: 900, cuadrillaId: C3, fue: true, personas: 4, horaDesde: 13, horaHasta: 17 },
      { asignacionId: 901, cuadrillaId: C4, fue: false, personas: 3, horaDesde: 8, horaHasta: 17 },
    ],
    true,
    "armado",
  );
  assert.deepEqual(r.lineas, [{ tarea: "armado", personas: 4, horaDesde: 13, horaHasta: 17, cuadrillaId: C3 }]);
  assert.deepEqual(r.apoyos, [
    { asignacionId: 900, fue: true },
    { asignacionId: 901, fue: false },
  ]);
});

test("apoyosAlParte: no ejecutado → sin renglones, los apoyos quedan con el parte", () => {
  const r = apoyosAlParte(
    [{ asignacionId: 900, cuadrillaId: C3, fue: false, personas: 4, horaDesde: 13, horaHasta: 17 }],
    false,
    "armado",
  );
  assert.deepEqual(r.lineas, []);
  assert.deepEqual(r.apoyos, [{ asignacionId: 900, fue: true }]);
});
