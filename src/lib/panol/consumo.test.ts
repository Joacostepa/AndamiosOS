// La cuenta del consumo (consumo.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  consumo, consumoPorSemana, lunesDe, promedioSemanal, semanasQueAlcanza, signoConsumo, type MovConsumo,
} from "./consumo.ts";

const U = "u:11111111-1111-4111-8111-111111111111";
const P1 = "22222222-2222-4222-8222-222222222222";
const P2 = "44444444-4444-4444-8444-444444444444";
const C3 = "33333333-3333-4333-8333-333333333333";
const PREC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DISCO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SIN_COSTO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const articulos = [
  { id: PREC, nombre: "Precintos 300 mm", unidad: "u.", ultimo_costo: 32 },
  { id: DISCO, nombre: "Disco de corte 115 mm", unidad: "u.", ultimo_costo: 1800 },
  { id: SIN_COSTO, nombre: "Cinta de peligro", unidad: "rollo", ultimo_costo: null },
];

let n = 0;
function mov(p: Partial<MovConsumo>): MovConsumo {
  n += 1;
  return {
    id: `m${n}`, vale_id: `v${n}`, tipo: "retiro", articulo_id: PREC, cantidad: 10, desde: U, hacia: "consumo",
    odoo_ot_id: 4812, cuadrilla_id: null, quien_tipo: "persona", quien_id: P1, anula_a: null,
    created_at: "2026-10-06T12:00:00Z", ...p,
  };
}

test("signoConsumo: al consumo suma, del consumo resta, lo demás no toca", () => {
  assert.equal(signoConsumo({ desde: U, hacia: "consumo" }), 1);
  assert.equal(signoConsumo({ desde: "consumo", hacia: U }), -1);
  assert.equal(signoConsumo({ desde: U, hacia: `p:${P1}` }), 0);
  assert.equal(signoConsumo({ desde: "proveedor", hacia: U }), 0);
});

test("consumo por obra: retiros menos sobrantes, valorizado", () => {
  const movs = [
    mov({ cantidad: 100 }),
    mov({ cantidad: 40, quien_id: P2 }),
    mov({ tipo: "sobrante", desde: "consumo", hacia: U, cantidad: 15 }),
    mov({ articulo_id: DISCO, cantidad: 2, odoo_ot_id: 4790 }),
    mov({ cantidad: 5, odoo_ot_id: null }),
  ];
  const r = consumo(movs, articulos, "obra");
  assert.deepEqual(r.grupos.map((g) => g.clave), ["o:4812", "o:4790", "sin_obra"]);
  const ot = r.grupos[0];
  assert.equal(ot.lineas[0].cantidad, 125);
  assert.equal(ot.valor, 125 * 32);
  assert.equal(ot.retiros, 2, "el sobrante no cuenta como retiro");
  assert.deepEqual(ot.quienes, [{ clave: `p:${P1}`, retiros: 1 }, { clave: `p:${P2}`, retiros: 1 }]);
  assert.equal(r.grupos[1].valor, 3600);
  assert.equal(r.valor, 125 * 32 + 3600 + 5 * 32);
});

test("una anulación cancela a su original, aunque sea de otro período", () => {
  const original = mov({ cantidad: 1000 });
  const anulacion = mov({ tipo: "anulacion", desde: "consumo", hacia: U, cantidad: 1000, anula_a: original.id });
  const bien = mov({ cantidad: 100 });
  const r = consumo([original, anulacion, bien], articulos, "obra");
  assert.equal(r.grupos[0].lineas[0].cantidad, 100);
  assert.equal(r.grupos[0].retiros, 1);

  // La anulación quedó en el período siguiente: se pasa como "extra".
  const r2 = consumo([original, bien], articulos, "obra", [original.id]);
  assert.equal(r2.grupos[0].lineas[0].cantidad, 100);
});

test("consumo por cuadrilla y por persona; sin costo no valoriza", () => {
  const movs = [
    mov({ cuadrilla_id: C3, cantidad: 50 }),
    mov({ cuadrilla_id: C3, articulo_id: SIN_COSTO, cantidad: 3, odoo_ot_id: 4790 }),
    mov({ cantidad: 20, quien_tipo: "externa", quien_id: P2 }),
  ];
  const c = consumo(movs, articulos, "cuadrilla");
  assert.deepEqual(c.grupos.map((g) => g.clave), [`c:${C3}`, "sin_cuadrilla"]);
  assert.equal(c.grupos[0].sinCosto, 1);
  assert.equal(c.grupos[0].valor, 50 * 32);
  assert.deepEqual(c.grupos[0].obras, [4790, 4812]);
  assert.equal(c.sinCosto, 1);

  const p = consumo(movs, articulos, "persona");
  assert.deepEqual(p.grupos.map((g) => g.clave).sort(), [`p:${P1}`, `x:${P2}`].sort());
});

test("lo prestado no es consumo", () => {
  const r = consumo([mov({ tipo: "prestamo", hacia: `p:${P1}` })], articulos, "obra");
  assert.equal(r.grupos.length, 0);
});

test("lunesDe: semana de lunes a domingo", () => {
  assert.equal(lunesDe("2026-10-10"), "2026-10-05"); // sábado
  assert.equal(lunesDe("2026-10-05"), "2026-10-05"); // lunes
  assert.equal(lunesDe("2026-10-11"), "2026-10-05"); // domingo
});

test("consumoPorSemana: 8 semanas, por fecha de Buenos Aires, sin lo anulado", () => {
  const a = mov({ cantidad: 30, created_at: "2026-10-06T12:00:00Z" });
  // Lunes 05/10 a las 01:00 UTC es domingo 04/10 a la noche en Buenos Aires: semana anterior.
  const b = mov({ cantidad: 7, created_at: "2026-10-05T01:00:00Z" });
  const c = mov({ cantidad: 999, created_at: "2026-10-07T12:00:00Z" });
  const anul = mov({ tipo: "anulacion", desde: "consumo", hacia: U, cantidad: 999, anula_a: c.id });
  const sob = mov({ tipo: "sobrante", desde: "consumo", hacia: U, cantidad: 5, created_at: "2026-10-08T12:00:00Z" });
  const s = consumoPorSemana([a, b, c, anul, sob], PREC, "2026-10-10", 8);
  assert.equal(s.length, 8);
  assert.equal(s[7].lunes, "2026-10-05");
  assert.equal(s[7].cantidad, 25);
  assert.equal(s[6].lunes, "2026-09-28");
  assert.equal(s[6].cantidad, 7);
  assert.equal(s[0].lunes, "2026-08-17");
});

test("promedioSemanal deja afuera la semana en curso; semanasQueAlcanza", () => {
  const s = [10, 20, 30, 0].map((cantidad, i) => ({ lunes: `x${i}`, cantidad }));
  assert.equal(promedioSemanal(s), 20);
  assert.equal(semanasQueAlcanza(50, 20), 2.5);
  assert.equal(semanasQueAlcanza(50, 0), null);
});
