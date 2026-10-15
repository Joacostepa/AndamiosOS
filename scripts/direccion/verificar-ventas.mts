// Verifica el calculador de Ventas contra Odoo real (SÓLO LECTURA: todo pasa por
// src/lib/direccion/odoo-lectura.ts) y compara con el snapshot del 15/10/2026
// (Odoo-Claude/direccion/datos/comercial.json, finanzas.json y alquiler.json).
//
// Correr (desde la raíz del repo):
//   node --no-warnings --experimental-strip-types --env-file=.env.local scripts/direccion/verificar-ventas.mts [ruta a datos/]
//
// Fuera de Next no hay Data Cache: las lecturas se hacen directo (cache.ts lo detecta solo).
// "next/cache" no resuelve como ESM sin extensión: se registra un alias mínimo antes de importar.

import { register } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(s, c, n) { if (s === "next/cache") return n("next/cache.js", c); return n(s, c); }`),
  import.meta.url,
);

const DATOS = process.argv[2] ?? "/Users/joaquin/Desktop/Proyectos/Odoo-Claude/direccion/datos";
const snap = (f: string) => (existsSync(join(DATOS, f)) ? JSON.parse(readFileSync(join(DATOS, f), "utf8")) : null);

const { hoyBA, fmtMon, nf } = await import("../../src/lib/direccion/formato.ts");
const { leerSerieDolar, tcHoy, tcPromedioMes } = await import("../../src/lib/direccion/dolar.ts");
const V = await import("../../src/lib/direccion/calculo/ventas.ts");
const R = await import("../../src/lib/direccion/calculo/ventas-reglas.ts");

const hoy = process.env.HOY ?? hoyBA();
const t0 = Date.now();
const dolar = await leerSerieDolar(hoy);
const tc = tcHoy(dolar, hoy);
console.log(`Hoy ${hoy} · dólar ${tc ? nf(tc.valor, 2) : "sin dato"} (${tc?.fecha}) · ${dolar.length} cotizaciones`);

const M = (v: number | null | undefined) => (v == null ? "Sin dato" : fmtMon(v, "ARS"));
const U = (v: number | null | undefined) => (v == null ? "Sin dato" : fmtMon(v, "USD"));
const P = (v: number | null | undefined, d = 1) => (v == null ? "Sin dato" : `${nf(v, d)} %`);
const dif = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null ? "" : Math.abs(a - b) < 1 ? "  = snapshot" : `  Δ ${nf(a - b)} (${b ? nf(((a - b) / Math.abs(b)) * 100, 1) : "—"} %)`);

const ctx = {
  hoy, ahora: new Date().toISOString(), params: {}, dolar, tc,
  pantalla: async () => { throw new Error("En la calle no se calcula en este script"); },
  supabase: () => { throw new Error("sin Supabase en el script"); },
} as never;

// ─── 1. Facturado neto por mes y NC ─────────────────────────────────────────────────────
const fact = await V.baseFacturas(hoy);
const refact = new Map(fact.refact);
const com = snap("comercial.json");
const sm = new Map<string, Record<string, number>>((com?.facturacion_mensual ?? []).map((x: Record<string, number> & { mes: string }) => [x.mes, x]));
console.log(`\n1. FACTURADO NETO (${fact.docs.length} comprobantes desde ${R.INICIO_ODOO})`);
for (const mes of R.ultimos12(hoy)) {
  const fin = mes === hoy.slice(0, 7) ? hoy : R.rango({ g: "mes", ref: mes }, hoy).finNat;
  const f = R.facturado(fact.docs, `${mes}-01`, fin);
  const nc = R.notasCredito(fact.docs, refact, `${mes}-01`, fin);
  const s = sm.get(mes);
  console.log(`  ${mes}  ${M(f.ars).padEnd(14)} ${U(f.usd).padEnd(12)} NC reales ${M(nc.realesArs).padEnd(12)} refact ${M(nc.refactArs).padEnd(12)}${dif(f.ars, s?.facturado_neto_ars)}${s ? ` · usd${dif(f.usd, s.facturado_neto_usd)} · reales${dif(nc.realesArs, s.nc_reales_ars)}` : ""}`);
}

// ─── 2. La pantalla por defecto (mes en curso) ──────────────────────────────────────────
const r = await V.calculador.calcular(ctx);
console.log(`\n2. PANTALLA (mes en curso) · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
for (const c of r.cifras) {
  const v = c.valor.tipo === "monto" ? `${M(c.valor.monto.ars)} / ${U(c.valor.monto.usd)}` : c.valor.tipo === "pct" ? P(c.valor.n) : c.valor.tipo === "sin_dato" ? `Sin dato (${c.valor.motivo})` : JSON.stringify(c.valor);
  const ch = (c.comparaciones ?? []).map((x) => (x.delta == null ? `sin dato · ${x.base}` : `${x.delta > 0 ? "▲" : "▼"} ${nf(Math.abs(x.delta), 1)} ${x.unidad === "pp" ? "puntos" : "%"} ${x.base}`)).join(" | ");
  console.log(`  ${c.kpi.padEnd(15)} ${v}${ch ? `   [${ch}]` : ""}`);
}
const d = r.detalle;
const cm = com?.comparacion_mes;
if (cm) console.log(`  snapshot 1–15/10: ${M(cm.mes_actual_1al15.ars)} / ${U(cm.mes_actual_1al15.usd)} · ▲ ${cm.var_vs_mes_anterior_usd_pct} % USD, ${cm.var_vs_mes_anterior_ars_pct} % ARS vs 1–15/09`);
if (d.banda) console.log(`  Banda de ritmo: lleva ${U(d.banda.actualUsd)} al día ${d.banda.dia}; si termina como un mes normal ${U(d.banda.minUsd)} a ${U(d.banda.maxUsd)} (cocientes ${nf(d.banda.rLo, 2)}–${nf(d.banda.rHi, 2)}, ${d.banda.meses} meses)`);
if (d.composicion.estado === "ok") {
  console.log(`  Qué facturamos (${d.composicion.etqPeriodo}): ` + d.composicion.filas.map((x) => `${x.nombre} ${P(x.pct, 0)} ${M(x.monto.ars)}`).join(" · ") + ` · total ${M(d.composicion.total.ars)} vs facturado ${M(d.composicion.facturado.ars)}${dif(d.composicion.total.ars, d.composicion.facturado.ars)}`);
} else console.log(`  Qué facturamos: ${d.composicion.motivo}`);
if (d.vendido.estado === "ok") console.log(`  Vendido según Odoo (con IVA): ${M(d.vendido.conIva.ars)} en ${d.vendido.ordenes} órdenes · ${d.vendido.reconfPeriodo} reconfirmaciones en el período · 30 días: ${d.vendido.reconf30.cantidad} órdenes por ${M(d.vendido.reconf30.sinIva.ars)} sin IVA (mayor ${d.vendido.reconf30.mayor?.orden} ${M(d.vendido.reconf30.mayor?.sinIva.ars)})`);
console.log(`  Avisos: ${r.avisos.map((a) => a.id).join(", ")} · Decisiones: ${(r.decisiones ?? []).map((x) => x.id).join(", ")}`);

// ─── 3. Composición de 12 meses contra el snapshot ──────────────────────────────────────
const comp = await V.baseComposicion(hoy);
console.log(`\n3. QUÉ FACTURAMOS, 12 meses (${comp.renglones} renglones, ${comp.sinClasificar} sin clasificar)`);
const nvr = new Map<string, { facturado_neto_ars: number; serie_mensual_ars: number[] }>((com?.nuevo_vs_renovacion ?? []).map((x: { tipo: string }) => [x.tipo, x]));
const meses12 = R.ultimos12(hoy);
for (const t of R.composicion(comp.filas, `${meses12[0]}-01`, hoy)) {
  const s = nvr.get(t.nombre);
  console.log(`  ${t.nombre.padEnd(28)} ${M(t.ars).padEnd(14)}${dif(t.ars, s?.facturado_neto_ars)}`);
  if (s) {
    const difs = meses12.map((mes, i) => { const v = R.composicion(comp.filas.filter((f) => f[1] === t.tipo), `${mes}-01`, mes === hoy.slice(0, 7) ? hoy : R.rango({ g: "mes", ref: mes }, hoy).finNat)[0]?.ars ?? 0; const dd = v - (s.serie_mensual_ars[i] ?? 0); return Math.abs(dd) >= 1 ? `${mes} ${nf(dd)}` : null; }).filter(Boolean);
    if (difs.length) console.log(`      meses distintos: ${difs.join(" · ")}`);
  }
}

// ─── 4. ¿Ganamos? ───────────────────────────────────────────────────────────────────────
const res = await V.baseResultado(hoy);
const fin = snap("finanzas.json")?.resultado;
const meses = [...new Set(res.filas.map((f) => f.mes))].sort();
const mr = R.armarResultado(res.filas, meses, hoy, (ym) => tcPromedioMes(dolar, ym));
const sf = new Map<string, Record<string, number>>((fin?.meses ?? []).map((x: Record<string, number> & { mes: string }) => [x.mes, x]));
console.log(`\n4. RESULTADO DE GESTIÓN por mes (andamios ${M(res.andamiosArs)}, amortización acumulada ${M(res.amortizacionAcumArs)}; referencia ${M(res.andamiosArs != null ? res.andamiosArs / 120 : null)}/mes)`);
for (const x of mr) {
  const s = sf.get(x.mes);
  console.log(`  ${x.mes}${x.parcial ? "*" : " "} ingresos ${M(x.ingresos).padEnd(12)} costo ${M(x.costoDirecto).padEnd(12)} estructura ${M(x.estructura).padEnd(12)} gestión ${M(x.gestion).padEnd(12)} margen ${P(x.margenPct).padEnd(8)} IIBB ${M(x.iibb).padEnd(10)}${s ? ` · gestión${dif(x.gestion, s.resultado_gestion_ars)}` : ""}`);
}
console.log(`  Meses cerrados sin IIBB: ${R.mesesSinIibb(mr).map((x) => `${x.mes} (~${M(x.estimado)})`).join(", ") || "ninguno"}`);

// ─── 5. Comercial ───────────────────────────────────────────────────────────────────────
const k = await V.baseComercial(hoy);
const kp = com?.kpis_principales;
const tcz = com?.cotizaciones?.tiempo_cierre_12m;
const obra = tcz?.por_tipo_contrato?.find((x: { tipo: string }) => x.tipo === "Obra");
const alq = snap("alquiler.json")?.kpis;
console.log(`\n5. COMERCIAL`);
console.log(`  Aprobación Obra: mediana ${nf(k.tiempo.medianaObra ?? NaN, 1)} días (snapshot ${obra?.mediana_dias}), promedio ${nf(k.tiempo.promedioObra ?? NaN, 1)} (${obra?.promedio_dias}), n ${k.tiempo.nObra} (${obra?.n}); ≤ 7 días ${P(k.tiempo.pct7Dias)} (${tcz?.pct_en_7_dias_o_menos} %)`);
console.log(`  Cotizado vivo: ${M(k.vivo.ars)} en ${k.vivo.cantidad} (snapshot ${M(kp?.cotizado_vivo_ars)} en ${kp?.cotizaciones_vivas}) · esperado ${M(k.conversion.pct != null ? (k.vivo.ars * k.conversion.pct) / 100 : null)} (${M(kp?.cotizado_vivo_esperado_ars)})`);
console.log(`  Conversión histórica en monto: ${P(k.conversion.pct)} (${k.conversion.desde} a ${k.conversion.hasta}; snapshot ${kp?.conversion_historica_en_monto_pct} %) · un solo usuario: ${k.concentracion ? `${P(k.concentracion.pct, 0)} del vivo, conversión ${P(k.concentracion.conversionPct)}` : "no"}`);
console.log(`  Excluidas: ${k.vivo.excluidas.map((x) => `${x.motivo} ${x.cantidad}`).join(" · ")}`);
console.log(`  CRM: ${k.crm?.sinActividad} sin tarea de ${k.crm?.abiertas} abiertas (snapshot ${com?.crm?.sin_actividad_total} de ${com?.crm?.abiertas_sin_frizado})`);
console.log(`  Vencen: ${k.vencen?.d7} en 7 días, ${k.vencen?.d15} en 15 (snapshot ${alq?.vencen_proximos_7_dias} y ${alq?.vencen_proximos_15_dias})`);
console.log(`  Reconfirmaciones: ${k.reconfirmaciones.length} en total (snapshot ${com?.cotizaciones?.reconfirmaciones?.total_historico})`);

// ─── 6. Septiembre (mes cerrado) y resumen para La semana ───────────────────────────────
const sep = await V.calculador.calcular({ ...(ctx as object), params: { g: "mes", p: "2026-09" } } as never);
console.log(`\n6. SEPTIEMBRE 2026: ` + sep.cifras.map((c) => `${c.kpi} ${c.valor.tipo === "monto" ? M(c.valor.monto.ars) : c.valor.tipo === "pct" ? P(c.valor.n) : c.valor.tipo}`).join(" · "));
const rs = await V.resumenVentas(ctx);
console.log(`   Resumen: ${rs.oraciones.map((o) => o.frase.map((p) => (typeof p === "string" ? p : p.valor.tipo === "monto" ? U(p.valor.monto.usd) : "?")).join("")).join(" ")}`);
console.log(`   Resultado último cerrado: ${rs.resultado?.valor.tipo === "monto" ? `${M(rs.resultado.valor.monto.ars)} / ${U(rs.resultado.valor.monto.usd)}` : "Sin dato"} · margen ${P(rs.margen?.pct)} (${rs.margen?.anterior?.mes} ${P(rs.margen?.anterior?.pct)})`);
// ─── 7. Desgloses: cada uno cierra con su cifra ─────────────────────────────────────────
const { nodos } = await import("../../src/lib/direccion/desglose/ventas.ts");
const { textoCierre } = await import("../../src/lib/direccion/formato.ts");
console.log("\n7. DESGLOSES (Total = la cifra, en USD y en ARS)");
const refs = [
  { tipo: "facturado_neto" }, { tipo: "facturado_neto", desde: "2026-01-01", hasta: "2026-09-30" }, { tipo: "pct_nc", desde: "2026-09-01", hasta: "2026-09-30" },
  { tipo: "nueva_vs_renov", desde: "2025-11-01", hasta: hoy }, { tipo: "resultado" }, { tipo: "resultado", desde: "2026-01", hasta: "2026-09" },
  { tipo: "resultadoRubro", rubro: "personal_operativo", mes: "2026-09" }, { tipo: "vendido_ordenes" }, { tipo: "cotizado_vivo" },
];
const primerCliente = (await V.baseFacturas(hoy)).docs.find((x) => x.fecha >= `${hoy.slice(0, 7)}-01`);
if (primerCliente) refs.push({ tipo: "factCliente", v: String(primerCliente.cli), desde: `${hoy.slice(0, 7)}-01`, hasta: hoy } as never);
for (const ref of refs) {
  const n = nodos.find((x) => x.tipo === ref.tipo)!;
  const nd = await n.resolver(ref as never, { ...(ctx as object), pagina: 1 } as never);
  const cierres = nd.secciones.filter((x) => x.cierre).map((x) => {
    const c = x.cierre!;
    if ("nota" in c) return `nota: ${c.nota.slice(0, 40)}…`;
    const u = textoCierre(c, { moneda: "USD", tc }), a = textoCierre(c, { moneda: "ARS", tc });
    return `${u.ok && a.ok ? "✓" : "✗"} ${a.texto}`;
  });
  const cifra = nd.cifra.tipo === "monto" ? M(nd.cifra.monto.ars) : nd.cifra.tipo === "pct" ? P(nd.cifra.n) : nd.cifra.tipo;
  console.log(`  ${JSON.stringify(ref)} → ${nd.titulo} · ${cifra} · ${nd.secciones.reduce((a, x) => a + x.filas.length, 0)} filas · ${cierres.join(" | ")}`);
}

console.log(`\nListo en ${((Date.now() - t0) / 1000).toFixed(1)} s. Sólo lectura: ${"search_read / read / read_group / search_count"}.`);
