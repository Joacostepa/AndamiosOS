// Verifica el calculador de Caja contra Odoo real (SÓLO LECTURA: todo pasa por
// src/lib/direccion/odoo-lectura.ts) e imprime las cifras principales al lado del snapshot
// del 15/10 (Odoo-Claude/direccion/datos/finanzas.json), si está a mano.
//
//   node --env-file=.env.local --no-warnings --experimental-strip-types scripts/direccion/verificar-caja.mts [ruta/finanzas.json]
//
// No usa Supabase (el colchón es el sugerido y no hay historia): no escribe nada en ningún lado.

import { existsSync, readFileSync } from "node:fs";
import { calculador, resumenCaja, type DetalleCaja } from "../../src/lib/direccion/calculo/caja.ts";
import type { CtxCalculo } from "../../src/lib/direccion/calculo/contrato.ts";
import { leerSerieDolar, tcHoy } from "../../src/lib/direccion/dolar.ts";
import { fraseAPlano, formatearValor, hoyBA } from "../../src/lib/direccion/formato.ts";
import type { ResultadoCalculador } from "../../src/lib/direccion/tipos.ts";
import { conRetiros } from "../../src/lib/direccion/calculo/caja-reglas.ts";
import { filtrarReservado } from "../../src/lib/direccion/reservado.ts";

const RUTA_SNAPSHOT = process.argv[2] ?? "/Users/joaquin/Desktop/Proyectos/Odoo-Claude/direccion/datos/finanzas.json";

const M = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "Sin dato" : `${(n / 1e6).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`);
const fila = (nombre: string, vivo: number | null | undefined, snap: number | null | undefined) => {
  const dif = vivo != null && snap != null ? vivo - snap : null;
  console.log(`${nombre.padEnd(46)} ${M(vivo).padStart(12)} ${M(snap).padStart(12)} ${dif == null ? "" : `${dif >= 0 ? "+" : ""}${M(dif)}`.padStart(12)}`);
};

const hoy = hoyBA();
const t0 = Date.now();
const dolar = await leerSerieDolar(hoy);
const tc = tcHoy(dolar, hoy);
const ctx: CtxCalculo = {
  hoy,
  ahora: new Date().toISOString(),
  params: {},
  dolar,
  tc,
  pantalla: () => Promise.reject(new Error("verificar-caja: no lee otras pantallas")),
  supabase: () => {
    throw new Error("verificar-caja: sin Supabase");
  },
};
const salida = await calculador.calcular(ctx);
const r: ResultadoCalculador<DetalleCaja> = { ...salida, pantalla: "caja", tc };
const d = r.detalle;
const fmt = { moneda: "ARS" as const, tc };

console.log(`\nCaja en vivo · hoy ${hoy} · dólar ${tc?.valor} (${tc?.fecha}) · ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const snap: any = existsSync(RUTA_SNAPSHOT) ? JSON.parse(readFileSync(RUTA_SNAPSHOT, "utf8")) : null;
if (!snap) console.log(`(sin snapshot en ${RUTA_SNAPSHOT})\n`);
console.log(`${"".padEnd(46)} ${"vivo".padStart(12)} ${"snapshot".padStart(12)} ${"dif.".padStart(12)}`);

fila("Caja disponible", d.totales.disponibleArs, snap?.caja?.disponible_total_ars);
fila("  en pesos (sin dólar billete)", d.totales.pesosArs, snap?.caja?.disponible_pesos_ars);
fila("  dólar billete (en ARS al dólar de hoy)", d.totales.dolaresArs, snap?.caja?.disponible_dolares_ars);
console.log(`  dólares en moneda: USD ${Math.round(d.totales.dolaresUsd).toLocaleString("es-AR")} (snapshot USD ${snap?.caja?.disponible_dolares_usd})`);
fila("Cuentas a verificar (fuera del total)", d.totales.aVerificarArs, snap?.caja?.saldo_borelli_no_confirmado_ars);
console.log("\nCuentas:");
for (const c of d.cuentas) {
  const s = snap?.caja?.cuentas?.find((x: { codigo: string }) => x.codigo === c.codigo);
  fila(`  ${c.codigo} ${c.nombre.slice(0, 28)} [${c.estado}]`, c.saldoArs, s?.saldo_ars_a_tc_hoy);
}

console.log("\nCheques:");
fila("  Registro (terceros en cartera)", d.cheques.registro.ars, snap?.cheques?.cartera_registro?.total_ars);
fila("  Contabilidad (Valores a depositar)", d.cheques.contableArs, snap?.cheques?.cartera_contable_ars);
fila("  A fecha", d.cheques.aFecha.ars, snap?.cheques?.cartera_registro?.a_fecha_ars);
fila("  Vencidos hace ≤ 7 días", d.cheques.recientes.ars, snap?.cheques?.cartera_registro?.vencidos_ult_7d_ars);
fila("  Vencidos a verificar", d.cheques.aVerificar.ars, snap?.cheques?.cartera_registro?.vencidos_a_verificar_ars);
fila("  Propios a debitar", d.propios.ars, snap?.cheques?.propios_emitidos_pendientes?.total_ars);
fila("    dentro del flujo", d.propios.enFlujoArs, null);
fila("    después del flujo", d.propios.despuesArs, null);

console.log("\nPor pagar:");
fila("  Proveedores", d.porPagar.ars, snap?.por_pagar?.proveedores_total_ars);
console.log(`  facturas: ${d.porPagar.facturas} (snapshot ${snap?.por_pagar?.facturas})`);
for (const a of d.porPagar.aging) {
  const k = { no_vencido: "no_vencido", d1_30: "1_30", d31_60: "31_60", d61_90: "61_90", d90_mas: "mas_90" }[a.clave];
  fila(`    ${a.etiqueta}`, a.ars, snap?.por_pagar?.aging_ars?.[k]);
}
console.log(`  top 3: ${d.porPagar.top.slice(0, 3).map((p) => `${p.proveedor} ${M(p.saldoArs)}`).join(" · ")}`);

console.log("\nSupuestos del proyectado (por mes salvo cobranza):");
const sp = snap?.flujo_caja_8_semanas?.supuestos ?? {};
fila("  Cobranza semanal", d.flujo.supuestos.cobranzaSemanalArs, sp.cobranza_promedio_semanal_ars);
fila("  Sueldos registrados", d.flujo.supuestos.sueldosMes, sp.sueldos_registrados_mes_ars);
fila("  Cargas sociales", d.flujo.supuestos.cargasMes, sp.cargas_sociales_mes_ars);
fila("  No registrados y contratistas", d.flujo.supuestos.noRegistradosMes, sp.sueldos_no_registrados_y_contratistas_mes_ars);
fila("  IIBB", d.flujo.supuestos.iibbMes, sp.iibb_mes_ars);
fila("  Gastos corrientes", d.flujo.supuestos.gastosCorrientesMes, sp.gastos_corrientes_mes_ars);
fila("  Subalquiler", d.flujo.supuestos.subalquilerMes, sp.subalquiler_mes_ars);
fila("  Retiros de socios (semanal, reservado)", d.reservado?.retirosSemanalesArs, sp.retiros_socios_mes_ars != null ? (sp.retiros_socios_mes_ars * 12) / 52 : null);
fila("  Colchón sugerido (1 mes de sueldos)", d.flujo.colchon.sugeridoArs, sp.sueldos_registrados_mes_ars != null ? sp.sueldos_registrados_mes_ars + sp.cargas_sociales_mes_ars + sp.sueldos_no_registrados_y_contratistas_mes_ars : null);

// El snapshot del 15/10 incluye los retiros en el flujo: se compara el de los socios.
const dSocios = conRetiros(d);
for (const esc of ["proyectado", "comprometido"] as const) {
  console.log(`\nFlujo · ${esc} (socios, con retiros)`);
  dSocios.flujo.escenarios[esc].forEach((s, i) => {
    const ss = snap?.flujo_caja_8_semanas?.semanas?.[i]?.[esc];
    console.log(
      `  S${s.n} ${s.etiqueta}  entra ${M(s.entra).padStart(9)} (${M(ss?.ingresos_ars).padStart(9)})  sale ${M(s.sale).padStart(9)} (${M(ss?.egresos_ars).padStart(9)})  pesos ${M(s.pesos).padStart(9)} (${M(ss?.saldo_final_solo_pesos_ars).padStart(9)})  total ${M(s.saldo).padStart(9)} (${M(ss?.saldo_final_ars).padStart(9)})`,
    );
  });
  for (const [quien, dd] of [["socios", dSocios], ["sin socios", d]] as const) {
    const c = dd.flujo.cobertura[esc];
    const ult = dd.flujo.escenarios[esc].at(-1);
    console.log(`  Cobertura (${quien}): ${c.prefijo} ${c.fecha}${c.mas ? "" : ` · cae en S${(c.cae ?? 0) + 1} (pesos ${M(c.pesosCae)}, faltan ${M(c.faltaArs)})`} · pesos al final ${M(ult?.pesos)}`);
  }
}

console.log("\nConceptos (total 8 semanas):");
for (const c of [...d.flujo.conceptos, ...(d.reservado?.conceptos ?? [])]) {
  console.log(`  ${c.tipo === "ingreso" ? "+" : "−"} ${c.concepto.slice(0, 70).padEnd(70)} ${M(c.porSemana.reduce((a, b) => a + b, 0)).padStart(10)} [${c.escenarios.join("/")}]${c.reservado ? " (reservado)" : ""}`);
}
console.log("\nQueda fuera del flujo:");
for (const f of [...d.flujo.fuera, ...(d.reservado?.fuera ?? [])]) console.log(`  ${f.concepto.padEnd(60)} ${M(f.ars).padStart(10)} · ${fraseAPlano(f.nota, fmt)}`);

console.log("\nCifras:");
for (const c of r.cifras) console.log(`  ${c.kpi.padEnd(16)} ${formatearValor(c.valor, fmt).padEnd(22)} ${c.contexto ? fraseAPlano(c.contexto, fmt) : ""}`);
console.log("\nAvisos:");
for (const a of r.avisos) console.log(`  [${a.nivel}] ${fraseAPlano(a.aviso, fmt)}`);
const res = resumenCaja(filtrarReservado(r, true));
const resSin = resumenCaja(filtrarReservado(r, false));
console.log(`\nSin socios: ${JSON.stringify(filtrarReservado(r, false)).includes("Retiros de socios") ? "⚠ VIAJAN LOS RETIROS" : "no viajan los retiros"} · cobertura ${resSin.cobertura ? formatearValor(resSin.cobertura.valor, fmt) : "—"}`);
console.log("\nresumenCaja() (socios) · narrativa:");
for (const o of res.oraciones) console.log(`  (${o.prioridad}) ${fraseAPlano(o.frase, fmt)}`);
console.log("resumenCaja() · para decidir:");
for (const x of res.decisiones) console.log(`  [${x.sev}] ${fraseAPlano(x.corto, fmt)} · ${x.pregunta}\n      ${fraseAPlano(x.que, fmt)}`);
if (d.flujo.faltantes.length) console.log(`\n⚠ Faltó leer: ${d.flujo.faltantes.join(", ")}`);
