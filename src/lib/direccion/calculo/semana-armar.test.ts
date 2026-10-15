import { test } from "node:test";
import assert from "node:assert/strict";
import { armarSemana, combinarSemana, topLlamar, type EntradaSemana } from "./semana-armar.ts";
import { filtrarReservado } from "../reservado.ts";
import type { Cifra, Decision, Oracion, ResultadoCalculador } from "../tipos.ts";
import type { DetalleSemana } from "./semana-armar.ts";

const cifra = (kpi: string, ars: number, extra: Partial<Cifra> = {}): Cifra => ({ kpi, valor: { tipo: "monto", monto: { ars } }, confianza: { nivel: "ok" }, ...extra });
const or = (id: string, prioridad: number, extra: Partial<Oracion> = {}): Oracion => ({ id, prioridad, frase: [id], ...extra });
const dec = (id: string, sev: Decision["sev"], extra: Partial<Decision> = {}): Decision => ({ id, sev, vence: null, pantalla: "caja", duenoSugerido: null, corto: [id], que: [id], pregunta: "¿?", ...extra });
const falla = (motivo: string) => ({ ok: false as const, motivo });

function entrada(): EntradaSemana {
  return {
    hoy: "2026-10-15",
    caja: {
      ok: true,
      v: {
        caja: cifra("caja_disponible", 681e6), cobertura: cifra("cobertura", 0, { valor: { tipo: "fecha", iso: "2026-12-09" } }),
        escenario: "proyectado", colchon: { ars: 90e6, editado: false }, sparkPesos: [{ n: 1, desde: "2026-10-12", pesos: 100e6 }],
        oraciones: [or("caja", 100), or("fondeo", 92)], decisiones: [dec("cheques_propios", "rojo", { vence: "2026-10-16" })], avisos: [], tc: null,
        chequesPropios: cifra("cheques_propios", 214e6),
      },
    },
    ventas: {
      ok: true,
      v: {
        mes: "2026-10", dia: 15, facturadoMes: cifra("facturado_neto", 322e6, { id: "facturado_mes" }), comparacionArs: null, sinMayorCliente: null,
        serie: [], nc: { pctReales: 24, pctBrutas: 30, reales: { ars: 1 } }, resultado: cifra("resultado", 112e6), margen: { mes: "2026-09", pct: 34, anterior: null },
        oraciones: [or("fact", 100)], decisiones: [dec("amortizacion", "gris", { pantalla: "ventas" })], avisos: [],
      },
    },
    cobranzas: {
      ok: true,
      v: {
        tarjeta: cifra("vencido_30", 150e6, { valorMeta: 30 }), tramos: [], contexto: null, porCobrar: cifra("por_cobrar", 497e6), dso: null,
        oraciones: [or("cobranzas_concentracion", 90), or("cobranzas_rechazados", 70)], decisiones: [dec("rechazados", "rojo", { pantalla: "cobranzas" })], avisos: [], llamar: [],
      },
    },
    calle: falla("Odoo tardó demasiado"),
    socios: {
      ok: true,
      v: {
        cifra: cifra("retiros", 500e6, { id: "retiros_anio", reservado: true }), oraciones: [or("retiros_anio", 40, { reservado: true })], decisiones: [],
        avisos: [{ id: "ret_sin_dolar", nivel: "inc", aviso: ["x"], afecta: ["retiros"], quien: "Adm", que: "x", origen: "auto", reservado: true }],
        pctResultado: 28.7, mesesSinDolarizar: ["2026-09"], anio: "2026",
      },
    },
    calidad: falla("Odoo tardó"),
  };
}

test("La semana: 7 tarjetas con ids propios; la que falla queda Sin dato con el motivo, nunca 0", () => {
  const r = armarSemana(entrada());
  assert.deepEqual(r.cifras.map((c) => c.id), ["semana_caja", "semana_cobertura", "semana_vencido_30", "semana_facturado", "semana_dev_vencida", "semana_resultado", "semana_retiros"]);
  const dev = r.cifras.find((c) => c.id === "semana_dev_vencida")!;
  assert.deepEqual(dev.valor, { tipo: "sin_dato", motivo: "No pudimos leer En la calle: Odoo tardó demasiado" });
  assert.deepEqual(r.detalle.faltan.map((f) => f.pantalla), ["calle", "datos"]);
  assert.equal(r.detalle.titulos.semana_facturado.titulo, "Facturado neto de octubre");
  assert.equal(r.detalle.titulos.semana_resultado.titulo, "Resultado de gestión de septiembre");
});

test("La semana: facturado sin contexto propio muestra el % de NC", () => {
  const f = armarSemana(entrada()).cifras.find((c) => c.id === "semana_facturado")!;
  assert.equal(f.contexto?.[0], "NC: ");
});

test("La semana: narrativa con las fijas y las 2 candidatas más prioritarias; retiros al pie", () => {
  const r = armarSemana(entrada());
  assert.deepEqual(r.oraciones!.map((o) => o.id), ["fact", "caja", "fondeo", "cobranzas_concentracion", "retiros_anio"]);
  assert.equal(r.oraciones!.at(-1)!.reservado, true);
});

test("La semana: decisiones de todas las áreas, ordenadas por severidad y fecha", () => {
  const r = armarSemana(entrada());
  assert.deepEqual(r.decisiones!.map((d) => d.id), ["cheques_propios", "rechazados", "amortizacion"]);
});

test("La semana: sin direccion-socios no viaja nada de retiros (tarjeta, pie, avisos ni detalle)", () => {
  const s = armarSemana(entrada());
  const r: ResultadoCalculador<DetalleSemana> = { ...s, pantalla: "semana", tc: null };
  const sin = filtrarReservado(r, false);
  const json = JSON.stringify(sin);
  assert.doesNotMatch(json, /retiros_anio|semana_retiros|ret_sin_dolar|pctResultado|Retirado en/);
  const con = filtrarReservado(r, true);
  assert.match(JSON.stringify(con), /semana_retiros/);
});

test("La semana: sin Datos, el panel de Calidad usa los avisos de las áreas (sin repetir)", () => {
  const e = entrada();
  if (e.caja.ok) e.caja.v.avisos = [{ id: "cheques", nivel: "ver", aviso: ["a"], afecta: [], quien: "x", que: "y", origen: "auto" }];
  if (e.cobranzas.ok) e.cobranzas.v.avisos = [{ id: "cheques", nivel: "ver", aviso: ["a"], afecta: [], quien: "x", que: "y", origen: "auto" }];
  const r = armarSemana(e);
  assert.deepEqual(r.avisos.map((a) => a.id).sort(), ["cheques", "ret_sin_dolar"]);
});

test("A quién llamar: vencidos, sin los que pagaron sin imputar, top 5 por monto", () => {
  const c = (partnerId: number, vencido: number, noLlamar = false) => ({ partnerId, nombre: `c${partnerId}`, publico: false, vencido, diasMax: 10, noLlamar });
  const r = topLlamar([c(1, 10), c(2, 0), c(3, 50, true), c(4, 30), c(5, 20), c(6, 5), c(7, 1), c(8, 2)]);
  assert.deepEqual(r.map((x) => x.partnerId), [4, 5, 1, 6, 8]);
});

test("combinarSemana: la cobertura con retiros sólo para socios; sin socios, la pública", () => {
  const e = entrada();
  if (!e.caja.ok) throw new Error("fixture");
  const pub: EntradaSemana = {
    ...e,
    caja: { ok: true, v: { ...e.caja.v, cobertura: cifra("cobertura", 0, { valor: { tipo: "fecha", iso: "2026-12-30" } }), sparkPesos: [{ n: 1, desde: "2026-10-12", pesos: 110e6 }], oraciones: [or("caja", 100, { frase: ["publica"] }), or("fondeo", 92)] } },
  };
  const r: ResultadoCalculador<DetalleSemana> = { pantalla: "semana", tc: null, ...combinarSemana(armarSemana(e), armarSemana(pub)) };
  const sin = filtrarReservado(r, false);
  const con = filtrarReservado(r, true);
  const cob = (x: typeof r) => x.cifras.filter((c) => c.id === "semana_cobertura").map((c) => (c.valor.tipo === "fecha" ? c.valor.iso : null));
  assert.deepEqual(cob(sin), ["2026-12-30"]);
  assert.deepEqual(cob(con), ["2026-12-09"]);
  assert.equal(sin.detalle.reservado, undefined);
  assert.equal(sin.detalle.cobertura?.spark[0].pesos, 110e6);
  assert.equal(con.detalle.reservado?.cobertura?.spark[0].pesos, 100e6);
  // El resto de las tarjetas, una sola vez y en el mismo orden.
  assert.deepEqual(sin.cifras.map((c) => c.id), armarSemana(pub).cifras.filter((c) => !c.reservado).map((c) => c.id));
  assert.deepEqual(con.cifras.map((c) => c.id), armarSemana(e).cifras.map((c) => c.id));
  assert.ok(!JSON.stringify(sin).includes("2026-12-09"));
});
