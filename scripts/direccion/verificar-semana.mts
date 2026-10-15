// Verifica La semana contra Odoo real (SÓLO LECTURA: todo pasa por
// src/lib/direccion/odoo-lectura.ts). Calcula las otras pantallas en vivo, arma La semana y
// muestra la narrativa, las tarjetas, Para decidir y Calidad, con y sin direccion-socios.
//
// Correr (desde la raíz del repo):
//   node --env-file=.env.local --no-warnings --experimental-strip-types scripts/direccion/verificar-semana.mts
//
// Sin Supabase: la historia ("vs lunes anterior") queda sin dato y no hay avisos manuales.

// "next/cache" no resuelve como ESM sin extensión: se registra un alias mínimo antes de importar.
import { register } from "node:module";
import type { CtxCalculo } from "../../src/lib/direccion/calculo/contrato.ts";
import type { PantallaId, ResultadoCalculador } from "../../src/lib/direccion/tipos.ts";
import type { DetalleSemana } from "../../src/lib/direccion/calculo/semana.ts";

register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(s, c, n) { if (s === "next/cache") return n("next/cache.js", c); return n(s, c); }`),
  import.meta.url,
);

const { CALCULADORES } = await import("../../src/lib/direccion/calculo/index.ts");
const { leerSerieDolar, tcHoy } = await import("../../src/lib/direccion/dolar.ts");
const { formatearValor, fraseAPlano, hoyBA } = await import("../../src/lib/direccion/formato.ts");
const { filtrarReservado } = await import("../../src/lib/direccion/reservado.ts");

const hoy = hoyBA();
const dolar = await leerSerieDolar(hoy);
const tc = tcHoy(dolar, hoy);
const memo = new Map<PantallaId, Promise<ResultadoCalculador>>();
const tiempos: Record<string, string> = {};
const ctx: CtxCalculo = {
  hoy,
  ahora: new Date().toISOString(),
  params: {},
  dolar,
  tc,
  pantalla: (p) => {
    if (!memo.has(p)) {
      const t0 = Date.now();
      memo.set(p, CALCULADORES[p].calcular(ctx).then((s) => {
        tiempos[p] = `${((Date.now() - t0) / 1000).toFixed(1)} s`;
        return { ...s, pantalla: p, tc };
      }));
    }
    return memo.get(p)! as never;
  },
  supabase: () => { throw new Error("sin Supabase en el script"); },
};

const t0 = Date.now();
const s = await CALCULADORES.semana.calcular(ctx);
const crudo = { ...s, pantalla: "semana" as const, tc } as ResultadoCalculador<DetalleSemana>;
// Lo que ve un socio (el resultado crudo trae las dos versiones de lo que cambia con los retiros).
const r = filtrarReservado(crudo, true);
console.log(`La semana en ${((Date.now() - t0) / 1000).toFixed(1)} s · ${JSON.stringify(tiempos)}`);

for (const moneda of ["USD", "ARS"] as const) {
  const f = { moneda, tc };
  console.log(`\n── ${moneda} ──────────────────────────────────────────`);
  console.log("ESTA SEMANA:");
  for (const o of r.oraciones ?? []) console.log(`  ${o.reservado ? "🔒 " : ""}[${o.id}${o.prioridad != null ? ` ${o.prioridad}` : ""}] ${fraseAPlano(o.frase, f)}`);
  console.log("TARJETAS:");
  for (const c of r.cifras) {
    const t = r.detalle.titulos[c.id ?? ""];
    console.log(`  ${c.reservado ? "🔒 " : ""}${t?.titulo ?? c.id}: ${formatearValor(c.valor, f)}${c.contexto ? ` · ${fraseAPlano(c.contexto, f)}` : ""}`);
  }
}
const f = { moneda: "USD" as const, tc };
console.log(`\nPARA DECIDIR (${r.decisiones?.length ?? 0}):`);
for (const d of r.decisiones ?? []) console.log(`  ${d.sev.padEnd(5)} ${d.vence ?? "          "} ${(d.duenoSugerido ?? "sin dueño").padEnd(9)} ${fraseAPlano(d.corto, f)} — ${d.pregunta}`);
console.log(`\nCALIDAD (${r.avisos.length}): ${r.avisos.slice(0, 8).map((a) => `${a.nivel}:${a.id}`).join(", ")}`);
console.log(`Faltan: ${JSON.stringify(r.detalle.faltan)}`);

const sinR = filtrarReservado(crudo, false);
const sin = JSON.stringify(sinR);
const cobSin = sinR.cifras.find((c) => c.id === "semana_cobertura");
console.log(`Cobertura sin socios (flujo sin retiros): ${cobSin ? formatearValor(cobSin.valor, f) : "—"} · pesos al final ${sinR.detalle.cobertura?.spark.at(-1)?.pesos.toFixed(0)} vs socios ${(r.detalle.reservado?.cobertura ?? r.detalle.cobertura)?.spark.at(-1)?.pesos.toFixed(0)}`);
const fugas = ["semana_retiros", "retiros_anio", "pctResultado", "Retirado en", "retiros_sin_dolarizar"].filter((x) => sin.includes(x));
console.log(`\nSin direccion-socios: ${fugas.length ? `⚠ FUGA: ${fugas.join(", ")}` : "nada de retiros en la respuesta ✓"} (${(sin.length / 1024).toFixed(0)} KB)`);
