// Verifica el calculador de Cobranzas contra Odoo real (SÓLO LECTURA: todo pasa por
// src/lib/direccion/odoo-lectura.ts) y lo compara con el snapshot del 15/10.
//
// Correr (desde la raíz del repo):
//   node --env-file=.env.local --no-warnings --experimental-strip-types scripts/direccion/verificar-cobranzas.mts [ruta/cobranzas.json]
//
// Sin Supabase: la historia ("vs hace una semana") queda sin dato y la clasificación
// Estado/Privados usa la regla por nombre, como antes de la migración.

import { readFileSync, existsSync } from "node:fs";
import { calculador, resumenCobranzas, type DetalleCobranzas } from "../../src/lib/direccion/calculo/cobranzas.ts";
import { leerSerieDolar, tcHoy } from "../../src/lib/direccion/dolar.ts";
import { hoyBA } from "../../src/lib/direccion/formato.ts";
import type { CtxCalculo } from "../../src/lib/direccion/calculo/contrato.ts";
import type { ResultadoCalculador } from "../../src/lib/direccion/tipos.ts";
import { nodos } from "../../src/lib/direccion/desglose/cobranzas.ts";
import { estadoCierre } from "../../src/lib/direccion/formato.ts";

const SNAPSHOT = process.argv[2] ?? "/Users/joaquin/Desktop/Proyectos/Odoo-Claude/direccion/datos/cobranzas.json";

const hoy = hoyBA();
const dolar = await leerSerieDolar(hoy);
const ctx: CtxCalculo = {
  hoy,
  ahora: new Date().toISOString(),
  params: {},
  dolar,
  tc: tcHoy(dolar, hoy),
  pantalla: async () => { throw new Error("no se usa"); },
  supabase: () => { throw new Error("sin Supabase en el script"); },
};

const t0 = Date.now();
const r = await calculador.calcular(ctx);
const d = r.detalle as DetalleCobranzas;
const seg = ((Date.now() - t0) / 1000).toFixed(1);

const M = (n: number | null | undefined) => (n == null ? "Sin dato" : `ARS ${(n / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 2 })} M`);
const P = (n: number | null | undefined, dec = 1) => (n == null ? "Sin dato" : `${n.toLocaleString("es-AR", { maximumFractionDigits: dec })} %`);
const N = (n: number | null | undefined, dec = 1) => (n == null ? "Sin dato" : n.toLocaleString("es-AR", { maximumFractionDigits: dec }));
const snap = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, "utf8")) : null;
const R = snap?.resumen;
const T = (k: string) => d.tramos.find((t) => t.clave === k)!.monto.ars;
const TS = (k: string) => snap?.aging.tramos.find((t: { clave: string }) => t.clave === k)?.monto_ars;
const TO = (k: string) => d.tramosOdoo.find((t) => t.clave === k)!.monto.ars;
const TOS = (k: string) => snap?.aging.comparativos.vencimiento_cargado_en_odoo_solo_facturas.tramos.find((t: { clave: string }) => t.clave === k)?.monto_ars;
const mes = (ym: string) => d.cobrado?.find((m) => m.mes === ym);
const serieS = (ym: string) => snap?.series_mensuales.find((m: { mes: string }) => m.mes === ym);
const ant = d.dso?.cierreAnterior?.mes ?? "";
const mesHoy = hoy.slice(0, 7);
const sumC = (l: { monto: { ars: number } }[] | null | undefined) => (l ? l.reduce((a, m) => a + m.monto.ars, 0) : null);

const filas: [string, string, string][] = [
  ["Por cobrar (residual abierto)", M(d.saldo), M(R?.saldo_por_cobrar.ars)],
  ["  control Σ balance de la cuenta", M(d.saldoContable), M(R?.saldo_por_cobrar.ars)],
  ["  facturas / NC", M(d.composicion.facturas), M(R?.composicion_saldo[0].ars)],
  ["  cheques rechazados", M(d.composicion.rechazados), M(R?.composicion_saldo[1].ars)],
  ["  otros débitos", M(d.composicion.debitos), M(R?.composicion_saldo[2].ars)],
  ["  cobros sin imputar", M(d.composicion.sinImputar), M(R?.composicion_saldo[3].ars)],
  ["Facturas abiertas / clientes con saldo", `${d.cantFacturas} / ${d.clientesConSaldo}`, R ? `${R.facturas_abiertas} / ${R.clientes_con_saldo}` : "—"],
  ["Aging neto: no vencido", M(T("no_vencido")), M(TS("no_vencido"))],
  ["  1–30", M(T("d1_30")), M(TS("d1_30"))],
  ["  31–60", M(T("d31_60")), M(TS("d31_60"))],
  ["  61–90", M(T("d61_90")), M(TS("d61_90"))],
  ["  +90", M(T("d90_mas")), M(TS("d90_mas"))],
  ["  saldo a favor", M(d.saldoAFavor.ars), M(snap?.aging.saldo_a_favor_clientes.ars)],
  ["  control Σ tramos + a favor = saldo", M(d.tramos.reduce((a, t) => a + t.monto.ars, 0) + d.saldoAFavor.ars), M(d.saldo)],
  ["Vencido +30 (31–60 + 61–90 + +90)", M(T("d31_60") + T("d61_90") + T("d90_mas")), M((TS("d31_60") ?? 0) + (TS("d61_90") ?? 0) + (TS("d90_mas") ?? 0))],
  ["Como lo ve Odoo: 1–30 / +90", `${M(TO("d1_30"))} / ${M(TO("d90_mas"))}`, `${M(TOS("d1_30"))} / ${M(TOS("d90_mas"))}`],
  ["% saldo en facturas sin plazo", P(d.pctSinPlazoSaldo), "≈ 90 %"],
  ["Sector público: saldo / +60 / +90", `${M(d.sector.publico.ars)} / ${M(d.sector.publico.venc60)} / ${M(d.sector.publico.venc90)}`, snap ? `${M(snap.concentracion.publico_vs_privado[0].ars)} / ${M(snap.concentracion.publico_vs_privado[0].vencido_mas_60_ars)} / ${M(snap.concentracion.publico_vs_privado[0].vencido_mas_90_ars)}` : "—"],
  ["  públicos", d.clientes.filter((c) => c.publico && c.saldo > 0).map((c) => c.nombre.slice(0, 24)).join(" · "), "Min. Interior · Min. Educación · ANMAT · Garrahan"],
  ["Mayor deudor", d.concentracion.mayor ? `${d.concentracion.mayor.nombre} ${P(d.concentracion.mayor.pct)} · ${M(d.concentracion.mayor.ars)} · ${d.concentracion.mayor.diasMax} d` : "—", snap ? `${R.concentracion_top1.cliente} ${P(R.concentracion_top1.pct_saldo)} · ${M(R.concentracion_top1.ars)} · ${snap.concentracion.top10[0].dias_atraso_max} d` : "—"],
  ["Top 10 / HHI", `${P(d.concentracion.top10Pct)} / ${N(d.concentracion.hhi, 0)}`, snap ? `${P(snap.concentracion.top10_pct)} / ${snap.concentracion.hhi}` : "—"],
  ["Cheques rechazados: total / en riesgo / compensado", `${M(d.rechazados.total)} (${d.rechazados.lista.length}) / ${M(d.rechazados.riesgo)} / ${M(d.rechazados.compensado)}`, R ? `${M(R.cheques_rechazados.ars)} (${R.cheques_rechazados.cantidad}) / OCRE 6,54 + Billinghurst 2,99 / Se Fers + Modular` : "—"],
  ["Cobros sin imputar: total / contra facturas / compensan", `${M(d.sinImputar.total)} (${d.sinImputar.lista.length}) / ${M(d.sinImputar.contraFacturas)} / ${M(d.sinImputar.compensan)}`, R ? `${M(R.cobros_sin_imputar.ars)} (${R.cobros_sin_imputar.cantidad}) / ${M(R.cobros_sin_imputar.de_los_cuales_contra_facturas_abiertas_ars)} / ${M(R.cobros_sin_imputar.de_los_cuales_compensan_rechazos_o_debitos_ars)}` : "—"],
  ["No llamar", d.clientes.filter((c) => c.noLlamar).map((c) => c.nombre.slice(0, 20)).join(" · ") || "ninguno", "Mostaza (pagó 8,0 M sin imputar)"],
  ["Avisos de partidas", d.clientes.flatMap((c) => c.avisos.map((a) => `${c.nombre.slice(0, 18)}: ${a}`)).join(" | ") || "ninguno", "Ministerio FA-B 585/586 · Billinghurst posible doble registro"],
  ["DSO hoy / cierre anterior / promedio 12 m", `${N(d.dso?.hoy)} / ${ant} ${N(d.dso?.cierreAnterior?.dias)} / ${N(d.dso?.promedio12)}`, R ? `${R.dso_dias_hoy} / 2026-09 ${serieS("2026-09")?.dso_dias} / ${R.dso_promedio_12m}` : "—"],
  ["DSO nov-25 (ventana)", `${N(d.dso?.serie.find((m) => m.mes === "2025-11")?.dias)} (${d.dso?.serie.find((m) => m.mes === "2025-11")?.ventana ?? "—"} d)`, snap ? `${serieS("2025-11")?.dso_dias} (${serieS("2025-11")?.dso_ventana_dias} d)` : "—"],
  ["Cobrado sep-26 (dinero + ret.)", `${M(mes("2026-09")?.monto.ars)} = ${M(mes("2026-09")?.dinero)} + ${M(mes("2026-09")?.retenciones)}`, R ? `${M(R.cobrado_mes_anterior.ars)} = ${M(serieS("2026-09")?.cobrado_dinero_ars)} + ${M(serieS("2026-09")?.retenciones_sufridas_ars)}` : "—"],
  ["  USD sep-26", N(mes("2026-09")?.monto.usd ?? null, 0), R ? N(R.cobrado_mes_anterior.usd, 0) : "—"],
  [`Cobrado mes en curso (${mesHoy})`, M(mes(mesHoy)?.monto.ars), R ? `${M(R.cobrado_mes_en_curso.ars)} al 15/10` : "—"],
  ["Cobrado 12 meses", M(sumC(d.cobrado)), R ? M(R.cobrado_ultimos_12m.ars) : "—"],
  ["Días reales de cobro sep-26", N(mes("2026-09")?.diasReales), snap ? N(serieS("2026-09")?.dias_reales_cobro_ponderado) : "—"],
  ["Días de pago Ministerio / Leveltec (12 m)", `${N(d.clientes.find((c) => /MINISTERIO DEL INTERIOR/i.test(c.nombre))?.diasPago, 0)} / ${N(d.clientes.find((c) => /LEVELTEC/i.test(c.nombre))?.diasPago, 0)}`, "122 / 16"],
];

console.log(`Cobranzas en vivo (${hoy}, dólar ${ctx.tc?.valor ?? "Sin dato"}) — ${seg} s\n`);
const w = Math.max(...filas.map((f) => f[0].length));
const w2 = Math.max(...filas.map((f) => f[1].length));
console.log(`${"Indicador".padEnd(w)}  ${"Ahora".padEnd(w2)}  Snapshot 15/10`);
for (const [a, b, c] of filas) console.log(`${a.padEnd(w)}  ${b.padEnd(w2)}  ${c}`);
if (Object.keys(d.faltan).length) console.log("\nFaltan:", d.faltan);

console.log("\nCifras:");
for (const c of r.cifras) console.log(`  ${c.kpi.padEnd(14)} ${JSON.stringify(c.valor)} · ${c.confianza.nivel}${c.confianza.motivo ? ` (${c.confianza.motivo})` : ""}`);
const res = resumenCobranzas({ ...r, pantalla: "cobranzas", tc: ctx.tc } as ResultadoCalculador<DetalleCobranzas>);
console.log("\nresumenCobranzas(): tarjeta", res.tarjeta?.kpi, "· oraciones", res.oraciones.map((o) => `${o.id}(${o.prioridad})`).join(", "), "· decisiones", res.decisiones.map((x) => `${x.id}/${x.sev}`).join(", "), "· avisos", res.avisos.map((a) => a.id).join(", "));
const json = JSON.stringify(r);
console.log(`\nJSON del resultado: ${(json.length / 1024).toFixed(0)} KB · serializable: ${JSON.parse(json) ? "sí" : "no"}`);

// Desglose: cada nodo resuelve y su lista cierra con la cifra ("Total = la cifra ✓"), en pesos.
const completo = { ...r, pantalla: "cobranzas", tc: ctx.tc } as ResultadoCalculador<DetalleCobranzas>;
const ctxNodo = { ...ctx, pantalla: async () => completo, pagina: 1 } as unknown as Parameters<(typeof nodos)[number]["resolver"]>[1];
const refs = [
  ...["cliente", "vendedora", "tramo", "sector"].flatMap((g) => [{ tipo: "por_cobrar", g }, { tipo: "vencido_30", g }]),
  { tipo: "concentracion" }, { tipo: "dso" }, { tipo: "rechazados" }, { tipo: "sin_imputar" }, { tipo: "cobrado" },
  ...d.clientes.map((c) => ({ tipo: "cliente", v: String(c.partnerId) })),
];
let malos = 0;
for (const ref of refs) {
  const def = nodos.find((n) => n.tipo === ref.tipo)!;
  const n = await def.resolver(ref, ctxNodo);
  for (const sec of n.secciones) {
    if (!sec.cierre || "nota" in sec.cierre) continue;
    const e = estadoCierre(sec.cierre.suma.ars, sec.cierre.cifra.ars);
    if (!e.ok) { malos++; console.log(`  ✗ ${JSON.stringify(ref)} · ${sec.titulo ?? ""}: diferencia ${e.diferencia}`); }
  }
}
console.log(`\nDesglose: ${refs.length} nodos resueltos, ${malos ? `${malos} cierres con diferencia` : "todos cierran con la cifra ✓"}`);
