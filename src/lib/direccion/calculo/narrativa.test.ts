import { test } from "node:test";
import assert from "node:assert/strict";
import { armarNarrativa, cuerpoNarrativa, narrativaPlana, oracionNc, ordenarCandidatas, pieNarrativa, textoCompartir } from "./narrativa.ts";
import type { Oracion } from "../tipos.ts";

const o = (id: string, prioridad: number, texto = id, extra: Partial<Oracion> = {}): Oracion => ({ id, prioridad, frase: [texto], ...extra });
const fact = o("fact", 100, "Facturamos X.");
const caja = o("caja", 100, "Hay Y disponibles.");
const ctx = { moneda: "USD" as const, tc: { valor: 1000, fecha: "2026-10-15" } };

test("narrativa: siempre facturación y caja primero, después hasta 2 candidatas por prioridad", () => {
  const n = armarNarrativa({ fact, caja, candidatas: [o("ot", 50), o("conc", 90), o("fondeo", 92), o("dev", 80)], pie: [] });
  assert.deepEqual(n.map((x) => x.id), ["fact", "caja", "fondeo", "conc"]);
});

test("narrativa: las fijas no se repiten aunque vengan entre las candidatas", () => {
  const n = armarNarrativa({ fact, caja, candidatas: [o("caja", 100), o("fact", 100), o("dev", 80)], pie: [] });
  assert.deepEqual(n.map((x) => x.id), ["fact", "caja", "dev"]);
});

test("narrativa: sin candidatas dice 'Sin alertas nuevas esta semana.'", () => {
  const n = armarNarrativa({ fact, caja, candidatas: [], pie: [] });
  assert.equal(n.length, 3);
  assert.deepEqual(n[2].frase, ["Sin alertas nuevas esta semana."]);
});

test("narrativa: si un área no respondió, la oración fija lo dice con el motivo (nunca 0)", () => {
  const n = armarNarrativa({ fact: { motivo: "Odoo no respondió" }, caja, candidatas: [], pie: [] });
  const p = n[0].frase.find((x) => typeof x !== "string");
  assert.ok(p && typeof p !== "string");
  assert.deepEqual(p.valor, { tipo: "sin_dato", motivo: "Odoo no respondió" });
  assert.match(narrativaPlana(n, ctx), /No pudimos calcular la facturación del mes: Sin dato\./);
});

test("narrativa: lo reservado nunca entra al cuerpo; va al pie marcado reservado", () => {
  const n = armarNarrativa({
    fact,
    caja,
    candidatas: [o("retiros_colado", 99, "retiros", { reservado: true }), o("dev", 80)],
    pie: [o("retiros_sin_dolarizar", 20), o("retiros_anio", 40)],
  });
  assert.deepEqual(cuerpoNarrativa(n).map((x) => x.id), ["fact", "caja", "dev"]);
  assert.deepEqual(pieNarrativa(n).map((x) => x.id), ["retiros_anio", "retiros_sin_dolarizar"]);
  assert.ok(pieNarrativa(n).every((x) => x.reservado));
});

test("narrativa: a igual prioridad el orden es estable (por id)", () => {
  assert.deepEqual(ordenarCandidatas([o("b", 50), o("a", 50), o("c", 60)]).map((x) => x.id), ["c", "a", "b"]);
});

test("narrativa: NC sólo con más de 15 % y con dato", () => {
  assert.equal(oracionNc(null), null);
  assert.equal(oracionNc(15), null);
  const nc = oracionNc(24);
  assert.equal(nc?.prioridad, 60);
  assert.match(narrativaPlana([nc!], ctx), /Las notas de crédito son el 24 % de lo facturado este mes\./);
});

test("Compartir: sin nada reservado, con la semana y el link", () => {
  const n = armarNarrativa({ fact, caja, candidatas: [], pie: [o("retiros_anio", 40, "En 2026 los socios retiraron mucho.")] });
  const t = textoCompartir(n, ctx, "2026-10-15", "https://x/direccion");
  assert.equal(t, "Dirección · semana del 12/10\nFacturamos X. Hay Y disponibles. Sin alertas nuevas esta semana.\nhttps://x/direccion");
  assert.doesNotMatch(t, /retiraron/);
});
