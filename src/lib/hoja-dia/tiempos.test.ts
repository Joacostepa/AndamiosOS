// Los tiempos de Google en la cuenta de los camiones (tiempos.ts y durDe de estado.ts) y las
// claves del caché, con el escenario de la maqueta: martes 13/10.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PARADA_MIN, claveCache, claveTramo, coordClave, durConTramo, esHoraDeLlegada, franjaDe, huecoMinimo, llegadaCon, minTxt,
  salidaIso, tiempoTxt, tipoDia, tramoGoogle, vueltaCon,
} from "./tiempos.ts";
import { calcVeh } from "./estado.ts";
import { tramoDe } from "./rutas.ts";
import type { DiaHoja, TiempoTramo } from "./tipos.ts";
import { OT, martesArmado } from "./escenario.test-fixture.ts";

const g = (min: number, m: number | null = null): TiempoTramo => ({ min, m, fuente: "google" });
const conTiempos = (d: DiaHoja, t: Record<string, TiempoTramo>): DiaHoja => ({ ...d, tiempos: t });
const de = (d: DiaHoja, veh: string, id: string) => calcVeh(d, veh).find((v) => v.id === id)!;

test("claves: tramo, coordenadas a ~100 m, franja de media hora y tipo de día", () => {
  assert.equal(claveTramo("l:dep", "o:2405"), "l:dep>o:2405");
  assert.equal(coordClave(-34.60351, -58.38157), "-34.604,-58.382");
  assert.equal(coordClave(-34.6034, -58.3814), "-34.603,-58.381");
  assert.equal(franjaDe(465), 450);
  assert.equal(franjaDe(480), 480);
  assert.equal(franjaDe(-30), 1410, "la tarde anterior");
  assert.equal(franjaDe(1500), 60, "pasada la medianoche");
  assert.equal(tipoDia("2026-10-13"), "habil");
  assert.equal(tipoDia("2026-10-17"), "sabado");
  assert.equal(tipoDia("2026-10-18"), "domingo");
  assert.equal(tipoDia("2026-10-19", -60), "domingo", "las 23 del día anterior");
  assert.equal(claveCache("-34.604,-58.382", "-34.590,-58.420", 450, "habil"), "-34.604,-58.382|-34.590,-58.420|450|habil");
});

test("salidaIso: la mitad de la franja en Buenos Aires; null si ya pasó", () => {
  const antes = Date.parse("2026-10-12T20:00:00-03:00");
  assert.equal(salidaIso("2026-10-13", 465, antes), "2026-10-13T10:45:00.000Z", "7:45 → franja 7:30, sale 7:45 BA");
  assert.equal(salidaIso("2026-10-13", 465, Date.parse("2026-10-13T09:00:00-03:00")), null);
  assert.equal(salidaIso("2026-10-13", -60, antes), "2026-10-13T02:15:00.000Z", "la tarde anterior: 23:15 del lunes (BA)");
});

test("durConTramo: sale a la hora (manejo + parada) o tiene que estar a la hora (sólo la parada)", () => {
  const t = { "a>b": g(25), "b>c": { min: 40, m: null, fuente: "tipica" as const } };
  assert.equal(esHoraDeLlegada("lleva", true), false);
  assert.equal(esHoraDeLlegada("busca", true), true);
  assert.equal(esHoraDeLlegada("busca", false), false);
  assert.equal(durConTramo(t, "lleva", true, "a", "b"), 25 + PARADA_MIN.lleva);
  assert.equal(durConTramo(t, "lleva_material", false, "a", "b"), 25 + PARADA_MIN.lleva_material);
  assert.equal(durConTramo(t, "busca", true, "a", "b"), PARADA_MIN.busca);
  assert.equal(durConTramo(t, "lleva", false, "b", "c"), null, "un tramo «típico» no cambia la cuenta");
  assert.equal(durConTramo(undefined, "lleva", false, "a", "b"), null);
  assert.equal(durConTramo(t, "lleva", false, "a", "a"), null, "de un lugar a sí mismo no hay tramo");
  assert.equal(tramoGoogle(t, "a", "b")?.min, 25);
  assert.equal(llegadaCon(t, "busca", true, "a", "b", 600), 625);
  assert.equal(llegadaCon(t, "lleva", true, "a", "b", 600), 600);
  assert.equal(vueltaCon(t, "a", "b"), 25);
  assert.equal(vueltaCon(t, "x", "b"), null);
  assert.equal(huecoMinimo(t, "a", "b", 45), 45);
  assert.equal(huecoMinimo({ "a>b": g(55) }, "a", "b", 45), 55);
});

test("durDe sin tiempos: las duraciones típicas de siempre", () => {
  const d = martesArmado();
  assert.deepEqual(calcVeh(d, "af669").map((v) => [v.id, v.t, v.dur, v.fin]), [
    ["c2-lleva", 420, 45, 465], ["c3-lleva", 465, 45, 510], ["v-sanz", 600, 80, 680], ["v-vtv", 840, 90, 930],
    ["c3-busca", 990, 30, 1020], ["c2-busca", 1020, 30, 1050],
  ]);
  // Un día con `tiempos` vacío es igual a uno sin.
  assert.deepEqual(calcVeh(conTiempos(d, {}), "af669").map((v) => v.fin), calcVeh(d, "af669").map((v) => v.fin));
});

test("durDe con tiempos: el manejo real, la vuelta real y la duración cargada a mano manda", () => {
  const d = conTiempos(martesArmado(), {
    [`l:dep>o:${OT.jur}`]: g(25),
    [`o:${OT.riv}>l:sanz`]: g(15),
    [`o:${OT.jur}>l:dep`]: g(40),
  });
  const lleva = de(d, "af669", "c2-lleva");
  assert.equal(lleva.dur, 25 + PARADA_MIN.lleva);
  assert.equal(lleva.fin, 420 + 35);
  assert.equal(de(d, "af669", "v-sanz").dur, 80, "duracionMin cargada gana");
  // El "trae" de Juramento vuelve al depósito: la vuelta es la de Google (40), no la del parámetro (60).
  const jur = de(d, "ab497", "v-jur");
  assert.equal(jur.fin - jur.finParada, 40);
  // tramoDe: Google si lo hay; si no, la típica.
  assert.deepEqual(tramoDe(d, lleva), g(25));
  assert.deepEqual(tramoDe(d, de(d, "af669", "c3-lleva")), { min: 45, m: null, fuente: "tipica" });
});

test("choque: con el tramo real, una hora fija de llegada mira si llega manejando desde lo anterior", () => {
  // La VTV termina ~15:30 (típica de 90); de la VTV a Rivadavia hay 50 min: llega 16:20, a tiempo para las 16:30.
  const ok = conTiempos(martesArmado(), { [`l:vtv>o:${OT.riv}`]: g(50) });
  const b1 = de(ok, "af669", "c3-busca");
  assert.equal(b1.conflicto, null);
  assert.equal(b1.dur, PARADA_MIN.busca, "el manejo fue antes de las 16:30");
  // Con 70 min no llega: el aviso dice ~16:40.
  const tarde = conTiempos(martesArmado(), { [`l:vtv>o:${OT.riv}`]: g(70) });
  assert.deepEqual(de(tarde, "af669", "c3-busca").conflicto, { llega: 1000, prevId: "v-vtv" });
  // Sin el tramo, como siempre: no hay choque (lo anterior termina 15:30).
  assert.equal(de(martesArmado(), "af669", "c3-busca").conflicto, null);
});

test("cómo se dice: minutos y horas, Google o típico", () => {
  assert.equal(minTxt(35), "35 min");
  assert.equal(minTxt(60), "1 h");
  assert.equal(minTxt(70), "1 h 10");
  assert.equal(minTxt(0.2), "1 min");
  assert.equal(tiempoTxt(g(35)), "~35 min en auto");
  assert.equal(tiempoTxt({ min: 45, m: null, fuente: "tipica" }), "~45 min");
});
