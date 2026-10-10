// Lo que dice la fila de la bandeja: el próximo paso, su botón y cuándo se arma.

import { test } from "node:test";
import assert from "node:assert/strict";
import { esperaDe, type DatosEspera } from "./derivacion.ts";
import { pasoDe, seArma } from "./presentacion.ts";
import type { EstadoRequisito } from "./tipos.ts";

const HOY = "2026-10-09";
const base: DatosEspera = {
  triage: "aplica", habilitada: false, creadaEl: "2026-10-01", triadaEl: "2026-10-01",
  vueltaEl: null, fechaConsulta: null, requisitos: [],
};

function fila(reqs: [string, EstadoRequisito, string | null, string | null][], extra: Record<string, unknown> = {}) {
  const requisitos = reqs.map(([nombre, estado, fecha_envio, fecha_resolucion]) => ({ nombre, estado, fecha_envio, fecha_resolucion }));
  return {
    espera: esperaDe({ ...base, requisitos }, HOY),
    reqs: reqs.map(([nombre, estado], i) => ({ id: `r${i}`, nombre, estado })),
    reclamos: 0,
    tramite: null,
    expedienteNro: null,
    primeraJornada: null,
    fechaProgramada: "2026-10-19",
    vencimiento: null,
    habilitadaEl: null,
    ...extra,
  } as Parameters<typeof pasoDe>[0];
}

test("un papel sin mandar: 'Mandar la Nómina ART' con su botón", () => {
  const p = pasoDe(fila([["Nómina ART", "pendiente", null, null]]), "para_hacer", HOY);
  assert.equal(p.titulo, "Mandar la Nómina ART");
  assert.deepEqual(p.accion, { tipo: "enviar", ids: ["r0"] });
  assert.equal(p.rojo, true);
});

test("varios mandados: 'Falta que apruebe 3 de 4', aprobar y reclamar a la semana", () => {
  const p = pasoDe(
    fila(
      [
        ["Nómina ART", "aprobado", "2026-09-24", "2026-09-25"],
        ["SVO", "enviado", "2026-09-24", null],
        ["E.P.P", "enviado", "2026-09-24", null],
        ["Capacitaciones", "enviado", "2026-09-24", null],
      ],
      { reclamos: 1 },
    ),
    "cliente",
    HOY,
  );
  assert.equal(p.titulo, "Falta que apruebe 3 de 4");
  assert.equal(p.detalle, "mandados hace 15 d · 1 reclamo");
  assert.deepEqual(p.accion, { tipo: "aprobar", ids: ["r1", "r2", "r3"], reclamar: true });
});

test("todo aprobado: 'Lista para habilitar' con el botón de habilitar", () => {
  const p = pasoDe(fila([["Nómina ART", "aprobado", "2026-09-28", "2026-09-28"]]), "para_hacer", HOY);
  assert.equal(p.titulo, "Lista para habilitar");
  assert.equal(p.accion.tipo, "habilitar");
});

test("espera el permiso: dice el trámite y cuándo vuelve, sin botón", () => {
  const p = pasoDe(
    fila([["Nómina ART", "pendiente", null, null]], {
      tramite: "presentado", expedienteNro: "EX-2026-45086999- -GCABA-SSGOU", fechaProgramada: "2026-10-28",
    }),
    "permiso",
    HOY,
  );
  assert.equal(p.titulo, "Permiso presentado");
  assert.equal(p.detalle, "EX-2026-45086999 · vuelve el dom 18 oct");
  assert.equal(p.accion.tipo, "ninguna");
});

test("se arma: la jornada planificada manda, y en rojo a 3 días sin habilitar", () => {
  assert.deepEqual(seArma({ primeraJornada: "2026-10-12", fechaProgramada: "2026-10-30", habilitada: false }, HOY), {
    fecha: "lun 12 oct", detalle: "en 3 d · planificada", rojo: true,
  });
  assert.equal(seArma({ primeraJornada: null, fechaProgramada: "2026-10-30", habilitada: false }, HOY).detalle, "en 21 d · programada");
  assert.equal(seArma({ primeraJornada: "2026-10-12", fechaProgramada: null, habilitada: true }, HOY).rojo, false);
  assert.equal(seArma({ primeraJornada: null, fechaProgramada: null, habilitada: false }, HOY).fecha, "Sin fecha");
});
