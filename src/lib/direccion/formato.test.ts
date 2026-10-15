import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chip, diasEntre, estadoCierre, fcorta, fdia, finMes, fmtMon, formatearValor, fraseAPlano, hoyBA, horaBA,
  lunesDe, marca, mon, montoEn, nombreLindo, pct, sumarDias, textoCierre, textoSemana, unidad,
} from "./formato.ts";

const tc = { valor: 1617.3, fecha: "2026-10-15" };
const usd = { moneda: "USD" as const, tc };
const ars = { moneda: "ARS" as const, tc };

test("fmtMon: abreviaturas de la maqueta", () => {
  assert.equal(fmtMon(422_000, "USD"), "USD 422 k");
  assert.equal(fmtMon(13_300, "USD"), "USD 13,3 k");
  assert.equal(fmtMon(1_560_000, "USD"), "USD 1,56 M");
  assert.equal(fmtMon(682_300_000, "ARS"), "ARS 682,3 M");
  assert.equal(fmtMon(5_039_000_000, "ARS"), "ARS 5.039 M");
  assert.equal(fmtMon(450_000, "ARS"), "ARS 450.000");
  assert.equal(fmtMon(-2_000, "USD"), "USD −2,0 k");
});

test("fmtMon: lo que falta es 'Sin dato', nunca 0", () => {
  assert.equal(fmtMon(null, "USD"), "Sin dato");
  assert.equal(fmtMon(Number.NaN, "ARS"), "Sin dato");
  assert.equal(pct(null), "Sin dato");
  assert.equal(pct(34.4, 1), "34,4 %");
});

test("mon: un período usa el dólar de cada documento; un saldo, el de hoy", () => {
  // Período: 179 k USD aunque ars/tc diera otra cosa.
  assert.equal(mon({ ars: 289_900_000, usd: 179_000 }, usd), "USD 179 k");
  // Saldo: ars ÷ dólar de hoy.
  assert.equal(montoEn({ ars: 1_617_300 }, "USD", tc), 1000);
  assert.equal(mon({ ars: 1_617_300 }, usd), "USD 1,0 k");
  assert.equal(mon({ ars: 289_900_000, usd: 179_000 }, ars), "ARS 289,9 M");
  // Saldo sin dólar de hoy: no se inventa.
  assert.equal(mon({ ars: 1_000 }, { moneda: "USD", tc: null }), "Sin dato");
  assert.equal(mon(null, usd), "Sin dato");
});

test("unidad: la regla debajo de cada cifra", () => {
  assert.equal(unidad("periodo", "USD"), "USD · sin IVA · dólar de cada factura");
  assert.equal(unidad("periodo", "ARS"), "ARS · sin IVA");
  assert.equal(unidad("saldo", "USD"), "USD · con IVA · dólar de hoy");
  assert.equal(unidad("socios", "ARS"), "ARS · pesos de cada mes");
});

test("formatearValor", () => {
  assert.equal(formatearValor({ tipo: "cantidad", n: 26, unidad: "contratos" }, usd), "26 contratos");
  assert.equal(formatearValor({ tipo: "fecha", iso: "2026-11-25", prefijo: "hasta el" }, usd), "hasta el 25/11");
  assert.equal(formatearValor({ tipo: "sin_dato", motivo: "sin sueldos devengados" }, usd), "Sin dato");
  assert.equal(formatearValor({ tipo: "dias", n: 1 }, usd), "1 día");
});

test("fraseAPlano: texto con cifras en la moneda elegida", () => {
  const f = ["Facturamos ", { valor: { tipo: "monto" as const, monto: { ars: 289_900_000, usd: 179_000 } }, kpi: "facturado_neto" }, " en octubre."];
  assert.equal(fraseAPlano(f, usd), "Facturamos USD 179 k en octubre.");
  assert.equal(fraseAPlano(f, ars), "Facturamos ARS 289,9 M en octubre.");
});

test("chip: polaridad, ≈ y sin dato", () => {
  assert.deepEqual(chip({ delta: 12, base: "a igual día sep", polaridad: "↑" }), { tono: "bien", texto: "▲ 12 % a igual día sep" });
  assert.equal(chip({ delta: 12, base: "x", polaridad: "↓" }).tono, "mal");
  assert.equal(chip({ delta: -12, base: "x", polaridad: "↓" }).tono, "bien");
  assert.equal(chip({ delta: 2, base: "vs sep", polaridad: "↑" }).texto, "≈ vs sep");
  assert.equal(chip({ delta: 4, base: "vs mes anterior", polaridad: "↓", unidad: "pp" }).texto, "▲ 4,0 puntos vs mes anterior");
  // En puntos no hay "≈": 2 puntos más de deuda vencida es empeorar.
  assert.equal(chip({ delta: 2, base: "vs sep", polaridad: "↓", unidad: "pp" }).tono, "mal");
  const sd = chip({ delta: null, base: "año anterior", polaridad: "↑", motivo: "la operación empieza en nov-2025" });
  assert.equal(sd.tono, "sd");
  assert.equal(sd.titulo, "la operación empieza en nov-2025");
  assert.equal(chip({ delta: 20, base: "x", polaridad: null }).tono, "neutro");
});

test("marca de confianza", () => {
  assert.deepEqual(marca("ok"), { nivel: "ok", icono: "✓", etiqueta: "Confiable", motivo: undefined });
  assert.equal(marca("ver", "registro ≠ contabilidad").icono, "⚠");
  assert.equal(marca("inc", " ").motivo, undefined);
});

test("estadoCierre y textoCierre: Total = la cifra ✓", () => {
  assert.equal(estadoCierre(1000, 1001).ok, true);
  assert.equal(estadoCierre(1_000_000, 1_000_400).ok, true);
  assert.equal(estadoCierre(1_000_000, 1_010_000).ok, false);
  const ok = textoCierre({ suma: { ars: 100_000_000, usd: 62_000 }, cifra: { ars: 100_000_000, usd: 62_000 }, texto: "la cifra de la tarjeta" }, usd);
  assert.deepEqual(ok, { ok: true, texto: "Total USD 62,0 k = la cifra de la tarjeta ✓" });
  const no = textoCierre({ suma: { ars: 90_000_000 }, cifra: { ars: 100_000_000 }, explica: "2 facturas sin cotización" }, ars);
  assert.equal(no.ok, false);
  assert.match(no.texto, /diferencia ARS 10,0 M: 2 facturas sin cotización/);
});

test("fechas en día argentino", () => {
  // 02:00 UTC del 16/10 es todavía 15/10 en Buenos Aires.
  assert.equal(hoyBA(new Date("2026-10-16T02:00:00Z")), "2026-10-15");
  assert.equal(horaBA("2026-10-15T07:30:00Z"), "04:30");
  assert.equal(fcorta("2026-10-15"), "15/10");
  assert.equal(fdia("2026-10-15"), "jue 15/10");
  assert.equal(lunesDe("2026-10-15"), "2026-10-12");
  assert.equal(lunesDe("2026-10-18"), "2026-10-12");
  assert.equal(textoSemana("2026-10-15"), "Semana del 12/10 al 18/10");
  assert.equal(finMes("2026-02"), "2026-02-28");
  assert.equal(sumarDias("2026-10-31", 1), "2026-11-01");
  assert.equal(diasEntre("2026-04-22", "2026-10-13"), 174);
});

test("nombreLindo", () => {
  assert.equal(nombreLindo("MINISTERIO DEL INTERIOR"), "Ministerio del Interior");
  assert.equal(nombreLindo("Leveltec S.A."), "Leveltec S.A.");
  assert.equal(nombreLindo("METALURGICA ZECH SRL, Juan"), "Metalurgica Zech SRL");
});
