// La cuenta del Pañol (estado.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aUnidadDeRetiro, bajoMinimo, diferenciaSuperaUmbral, existencias, faltantePuedePasarAPerdida, hoyBA,
  inspeccion, leerLugar, leerRechazo, noApta, prestamoVencido, sugeridoReponer,
} from "./estado.ts";
import type { Saldo } from "./tipos.ts";

const U = "11111111-1111-4111-8111-111111111111";
const P = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

test("leerLugar entiende cada clase", () => {
  assert.deepEqual(leerLugar(`u:${U}`), { clase: "ubicacion", id: U });
  assert.deepEqual(leerLugar(`p:${P}`), { clase: "persona", id: P });
  assert.deepEqual(leerLugar(`c:${C}`), { clase: "cuadrilla", id: C });
  assert.deepEqual(leerLugar("o:4812"), { clase: "obra", ot: 4812 });
  assert.deepEqual(leerLugar("faltante"), { clase: "faltante" });
  assert.deepEqual(leerLugar("consumo"), { clase: "fuente", nombre: "consumo" });
  assert.equal(leerLugar("cualquiera"), null);
});

test("existencias: de 10 martillos, 5 en el pañol, 3 Diego, 2 la cuadrilla", () => {
  const saldos: Saldo[] = [
    { articulo_id: "m", variante_id: null, lugar: `u:${U}`, cantidad: 5 },
    { articulo_id: "m", variante_id: null, lugar: `p:${P}`, cantidad: 3 },
    { articulo_id: "m", variante_id: null, lugar: `c:${C}`, cantidad: 2 },
    { articulo_id: "otro", variante_id: null, lugar: `u:${U}`, cantidad: 99 },
  ];
  assert.deepEqual(existencias(saldos, "m"), { enPanol: 5, afuera: 5, faltante: 0, enTaller: 0 });
});

test("existencias por talle", () => {
  const saldos: Saldo[] = [
    { articulo_id: "g", variante_id: "t9", lugar: `u:${U}`, cantidad: 12 },
    { articulo_id: "g", variante_id: "t10", lugar: `u:${U}`, cantidad: 4 },
  ];
  assert.equal(existencias(saldos, "g", "t9").enPanol, 12);
  assert.equal(existencias(saldos, "g").enPanol, 16);
});

test("bajo mínimo y cuánto reponer", () => {
  assert.equal(bajoMinimo(140, 200), true);
  assert.equal(bajoMinimo(200, 200), false);
  assert.equal(bajoMinimo(0, null), false);
  // Precintos: quedan 140, reponer hasta 600, se compran en bolsas de 100 → 500.
  assert.equal(sugeridoReponer(140, 200, 600, 100), 500);
  // Sin "reponer hasta": el doble del mínimo.
  assert.equal(sugeridoReponer(10, 24, null), 38);
  assert.equal(sugeridoReponer(700, 200, 600, 100), 0);
});

test("unidad de compra a unidad de retiro", () => {
  assert.equal(aUnidadDeRetiro(3, 100), 300);
  assert.equal(aUnidadDeRetiro(2.5, 1), 2.5);
});

test("hoy es el de Buenos Aires, no el de UTC", () => {
  // 01:30 UTC del 11/10 son las 22:30 del 10/10 en Buenos Aires.
  assert.equal(hoyBA(new Date("2026-10-11T01:30:00Z")), "2026-10-10");
});

test("un préstamo vence el día después de su fecha", () => {
  assert.equal(prestamoVencido("2026-10-10", "2026-10-10"), false);
  assert.equal(prestamoVencido("2026-10-09", "2026-10-10"), true);
  assert.equal(prestamoVencido(null, "2026-10-10"), false);
});

test("inspección de seguridad", () => {
  assert.equal(inspeccion(null, "2026-10-10", 15), "sin_fecha");
  assert.equal(inspeccion("2026-10-02", "2026-10-10", 15), "vencida");
  assert.equal(inspeccion("2026-10-20", "2026-10-10", 15), "por_vencer");
  assert.equal(inspeccion("2026-12-20", "2026-10-10", 15), "al_dia");
  assert.equal(noApta(true, "2026-10-02", "2026-10-10"), true);
  assert.equal(noApta(false, "2026-10-02", "2026-10-10"), false);
  // Vence hoy: todavía sirve hoy.
  assert.equal(noApta(true, "2026-10-10", "2026-10-10"), false);
});

test("faltante → pérdida a los 15 días", () => {
  assert.equal(faltantePuedePasarAPerdida("2026-09-24T15:00:00Z", "2026-10-10", 15), true);
  assert.equal(faltantePuedePasarAPerdida("2026-10-10T09:00:00Z", "2026-10-10", 15), false);
});

test("umbral del conteo, igual que la base", () => {
  assert.equal(diferenciaSuperaUmbral(180, 240, 10), true);   // −25 %
  assert.equal(diferenciaSuperaUmbral(230, 240, 10), false);  // −4 %
  assert.equal(diferenciaSuperaUmbral(1, 0, 10), true);       // apareció algo que no figuraba
});

test("los rechazos de la base se contestan con lo que sigue", () => {
  const r = leerRechazo(`LA_TIENE:p:${P}`, (l) => (l === `p:${P}` ? "Diego Acosta" : "?"));
  assert.equal(r.codigo, "la_tiene");
  assert.equal(r.texto, "La tiene Diego Acosta.");
  assert.equal(leerRechazo("INSPECCION_VENCIDA:A-031").codigo, "inspeccion_vencida");
  assert.match(leerRechazo("NO_DISPONIBLE:en_revision").texto, /en revisión/);
  assert.equal(leerRechazo("Falta el motivo.").codigo, "otro");
  assert.equal(leerRechazo("Falta el motivo.").texto, "Falta el motivo.");
});
