// Verifica los calculadores de Socios y de Datos y definiciones (calidad) contra Odoo real
// (SÓLO LECTURA: todo pasa por src/lib/direccion/odoo-lectura.ts) y los compara con el
// snapshot del 15/10 (finanzas.json → retiros).
//
// Correr (desde la raíz del repo):
//   node --env-file=.env.local --no-warnings --experimental-strip-types scripts/direccion/verificar-socios.mts [ruta/finanzas.json]
//
// Sin Supabase: los avisos manuales no se leen (como antes de la migración).

import { readFileSync, existsSync } from "node:fs";
import { calculador as socios, resumenSocios, type DetalleSocios } from "../../src/lib/direccion/calculo/socios.ts";
import { calculador as datos, resumenCalidad, type DetalleDatos } from "../../src/lib/direccion/calculo/datos.ts";
import { leerSerieDolar, tcHoy } from "../../src/lib/direccion/dolar.ts";
import { fraseAPlano, hoyBA } from "../../src/lib/direccion/formato.ts";
import type { CtxCalculo } from "../../src/lib/direccion/calculo/contrato.ts";
import type { PantallaId, ResultadoCalculador } from "../../src/lib/direccion/tipos.ts";

const SNAPSHOT = process.argv[2] ?? "/Users/joaquin/Desktop/Proyectos/Odoo-Claude/direccion/datos/finanzas.json";

const hoy = hoyBA();
const dolar = await leerSerieDolar(hoy);
const memo = new Map<PantallaId, Promise<ResultadoCalculador<unknown>>>();
const ctx: CtxCalculo = {
  hoy,
  ahora: new Date().toISOString(),
  params: {},
  dolar,
  tc: tcHoy(dolar, hoy),
  pantalla: (p) => {
    if (p !== "socios") return Promise.reject(new Error(`no se usa: ${p}`));
    if (!memo.has(p)) memo.set(p, socios.calcular(ctx).then((s) => ({ ...s, pantalla: p, tc: ctx.tc })));
    return memo.get(p)! as never;
  },
  supabase: () => { throw new Error("sin Supabase en el script"); },
};

const t0 = Date.now();
const rs = (await ctx.pantalla("socios")) as ResultadoCalculador<DetalleSocios>;
const t1 = Date.now();
const rd = await datos.calcular(ctx);
const t2 = Date.now();
const d = rs.detalle;

const U = (n: number | null | undefined) => (n == null ? "Sin dato" : `USD ${Math.round(n).toLocaleString("es-AR")}`);
const A = (n: number | null | undefined) => (n == null ? "Sin dato" : `ARS ${(n / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M`);
const snap = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, "utf8")).retiros : null;

console.log(`\nSOCIOS · ${hoy} · dólar ${ctx.tc?.valor} (${ctx.tc?.fecha}) · ${((t1 - t0) / 1000).toFixed(1)} s\n`);
console.log("mes      | Jorge neto USD (snap)      | Gabriel neto USD (snap)    | div J+G USD | total USD (snap)          | total ARS (snap)            | sin dolarizar");
type SnapMes = { mes: string; jorge: { neto_usd: number; dividendos_usd: number }; gabriel: { neto_usd: number }; total_socios_usd: number; total_socios_ars: number };
const sm = new Map<string, SnapMes>((snap?.meses ?? []).map((m: SnapMes) => [m.mes, m]));
for (const m of d.meses) {
  const s = sm.get(m.mes);
  const j = m.socios.jorge, g = m.socios.gabriel;
  const dif = (a: number | null | undefined, b: number | undefined) => (b == null || a == null ? "" : Math.abs(a - b) < 2 ? " =" : ` Δ${Math.round(a - b)}`);
  console.log(
    `${m.mes}  | ${U(j.neto.usd).padEnd(11)} (${s ? s.jorge.neto_usd : "—"})${dif(j.neto.usd, s?.jorge.neto_usd)}`.padEnd(40) +
    ` | ${U(g.neto.usd).padEnd(11)} (${s ? s.gabriel.neto_usd : "—"})${dif(g.neto.usd, s?.gabriel.neto_usd)}`.padEnd(29) +
    ` | ${U((j.dividendos.usd ?? 0) + (g.dividendos.usd ?? 0)).padEnd(11)}` +
    ` | ${U(m.total.usd)} (${s?.total_socios_usd ?? "—"})${dif(m.total.usd, s?.total_socios_usd)}`.padEnd(28) +
    ` | ${A(m.total.ars)} (${s ? A(s.total_socios_ars) : "—"})`.padEnd(30) +
    ` | ${m.sinDolarizar ? "sí" : ""}${m.parcial ? " (en curso)" : ""}`,
  );
}

const T = snap?.totales;
const so = (k: string) => snap?.socios.find((x: { clave: string }) => x.clave === k);
const filas: [string, string, string][] = [
  [`Retirado ${d.anio} (incluye dividendos)`, `${U(d.totalAnio.usd)} · ${A(d.totalAnio.ars)}`, T ? U(T.retiros_2026_usd) : "—"],
  ["  dividendos", U(d.dividendosAnio.usd), "—"],
  ...d.socios.map((s) => [`  ${s.corto} ${d.anio}`, U(s.anio.total.usd), so(s.clave) ? U(so(s.clave).total_2026_usd) : "—"] as [string, string, string]),
  ["Retiros / resultado (meses cerrados del año)", d.retSobreRes ? `${d.retSobreRes.pctUsd} % USD · ${d.retSobreRes.pctArs} % ARS · ${d.retSobreRes.etiqueta} · resultado ${U(d.retSobreRes.resultado.usd)}` : `Sin dato (${d.motivoResultado})`, T ? `${T.retiros_sobre_resultado_2026_pct} % (con octubre parcial; resultado ${U(T.resultado_gestion_2026_usd)})` : "—"],
  ["Retiros / resultado 12 meses cerrados", d.doce ? `${d.doce.pctUsd} % · ${d.doce.etiqueta} · retiros ${U(d.doce.retiros.usd)}` : "Sin dato", T ? `${T.retiros_sobre_resultado_12m_pct} % (nov-25 a oct-26; retiros ${U(T.retiros_12m_usd)})` : "—"],
  ["Meses sin dolarizar", d.mesesSinDolarizar.join(", ") || "ninguno", snap ? snap.meses_sin_dolarizar.join(", ") : "—"],
  ["Última dolarización", d.ultimaDolarizacion ? `${d.ultimaDolarizacion.mes} · cargada ${d.ultimaDolarizacion.cargada} por ${d.ultimaDolarizacion.por}` : "—", "2026-08 · 09/10 por J. P. Mansilla"],
  ...d.socios.map((s) => [`Pendiente de dolarizar ${s.corto}`, A(s.pendienteDolarizar.ars), so(s.clave) ? A(so(s.clave).pendiente_de_dolarizar_ars) : "—"] as [string, string, string]),
  ...d.socios.map((s) => [`Saldo USD cuenta particular ${s.corto}`, `${U(s.saldoUsdOdoo)} (último punto de la serie ${U(s.acumulado.at(-1)?.usd)})`, so(s.clave) ? U(so(s.clave).saldo_cuenta_particular_usd_odoo) : "—"] as [string, string, string]),
  ["Cuenta 1608 sin asignar", A(d.sinAsignar.ars), T ? A(T.cuenta_1608_sin_asignar_ars) : "—"],
  ["Dividendos pendientes", A(d.dividendosPendientes.ars), T ? A(T.dividendos_pendientes_ars) : "—"],
  ["Débitos 4.2.1.04.19 que no son retiro", d.noRetiro.map((l) => `${l.fecha} ${A(l.ars)}`).join("; ") || "ninguno", "06/10 ARS 1,8 M (Acri)"],
  ["Líneas sin clasificar / sin dólar", `${d.sinClasificar} / ${d.sinDolar}`, "—"],
  ["Circuitos (mes en curso)", d.circuitos ? d.circuitos.mes.map((c) => `${c.nombre} ${c.pct} %`).join(" · ") : `Sin dato (${d.motivoCircuitos})`, "—"],
  ["Circuitos (12 meses)", d.circuitos ? d.circuitos.doce.map((c) => `${c.nombre} ${c.pct} %`).join(" · ") : "—", "—"],
];
console.log("");
for (const [k, v, s] of filas) console.log(`${k.padEnd(46)} ${v}\n${"".padEnd(46)} snapshot: ${s}`);

const res = resumenSocios(rs);
const fmt = { moneda: "USD" as const, tc: ctx.tc };
console.log("\nresumenSocios(): cifra", JSON.stringify(res.cifra.valor), "· oraciones:", res.oraciones.map((o) => fraseAPlano(o.frase, fmt)));

const dd = rd.detalle as DetalleDatos;
const cal = resumenCalidad({ avisos: rd.avisos, detalle: dd });
console.log(`\nCALIDAD · ${((t2 - t1) / 1000).toFixed(1)} s · ⚠ ${cal.conteo.ver} · ◐ ${cal.conteo.inc} · ● ${cal.conteo.inf} · sin revisar: ${dd.sinRevisar.join(", ") || "nada"} · manuales: ${dd.manualesDisponibles ? "sí" : "sin tabla"}`);
for (const a of cal.avisos) console.log(`  ${{ ver: "⚠", inc: "◐", inf: "●" }[a.nivel]} ${a.reservado ? "🔒 " : ""}${fraseAPlano(a.aviso, fmt)}  [${a.id}]${a.detalle ? `\n      ${fraseAPlano(a.detalle, { moneda: "ARS", tc: ctx.tc })}` : ""}`);
console.log("\nConfianza por indicador:", Object.entries(dd.confianza).map(([k, v]) => `${k}=${v.nivel}`).join(" · "));
