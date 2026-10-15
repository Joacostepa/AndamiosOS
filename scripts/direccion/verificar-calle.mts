// Verifica el calculador de En la calle contra Odoo real (SÓLO LECTURA: todo pasa por
// src/lib/direccion/odoo-lectura.ts) y lo compara con el snapshot del 15/10.
//
// Correr (desde la raíz del repo):
//   node --env-file=.env.local --no-warnings --experimental-strip-types scripts/direccion/verificar-calle.mts [ruta/alquiler.json]
//
// Sin Supabase: la historia ("vs semana anterior") queda sin dato, como antes de la migración.

import { readFileSync, existsSync } from "node:fs";
import { calculador } from "../../src/lib/direccion/calculo/calle.ts";
import { resumenCalle, type DetalleCalle } from "../../src/lib/direccion/calculo/calle-reglas.ts";
import { leerSerieDolar, tcHoy } from "../../src/lib/direccion/dolar.ts";
import { hoyBA } from "../../src/lib/direccion/formato.ts";
import type { CtxCalculo } from "../../src/lib/direccion/calculo/contrato.ts";

const SNAPSHOT = process.argv[2] ?? "/Users/joaquin/Desktop/Proyectos/Odoo-Claude/direccion/datos/alquiler.json";

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
const d = r.detalle as DetalleCalle;
const seg = ((Date.now() - t0) / 1000).toFixed(1);

const M = (n: number | null | undefined) => (n == null ? "Sin dato" : `ARS ${(n / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M`);
const snap = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, "utf8")) : null;
const K = snap?.kpis;

const filas: [string, string, string][] = [
  ["Contratos en la calle", String(d.contratos.length), K ? `${K.contratos_en_la_calle} (sin deduplicar)` : "—"],
  ["  por tipo", d.porTipo.map((t) => `${t.contratos} ${t.tipo}`).join(" · "), K ? K.contratos_en_la_calle_por_tipo.map((t: { contratos: number; tipo: string }) => `${t.contratos} ${t.tipo}`).join(" · ") : "—"],
  ["Órdenes reemplazadas (fuera)", d.reemplazadas.map((x) => `${x.orden}→${x.por}`).join(", ") || "ninguna", "—"],
  ["Abono mensual en la calle", M(d.abono.totalArs), K ? M(K.abono_mensual_en_la_calle_ars_sin_iva) : "—"],
  ["  real (renovación + cuota)", M(d.abono.realArs), K ? M(K.abono_mensual_real_renovaciones_ars) : "—"],
  ["  estimado", `${M(d.abono.estimadoArs)} en ${d.abono.estimados}`, K ? M(K.abono_mensual_estimado_ars) : "—"],
  ["  relación renovación/inicial", Object.entries(d.abono.ratios).map(([k, v]) => `${k} ${v!.toFixed(2)}`).join(" · "), "Obra 0,37 · Simple 0,47 · Sin montaje 0,68"],
  ["m² armados", `${d.m2.m2} m² · ${d.m2.ml} ml · ${d.m2.obraSinMedidas} Obra sin medidas`, K ? `${K.m2_armados} m² · ${K.metros_lineales_pantalla} ml · 11` : "—"],
  ["Devolución vencida", `${d.devolucion.filas.length} · abono ${M(d.devolucion.abonoArs)} · contrato ${M(d.devolucion.contratoArs)}`, K ? `${K.devolucion_vencida.contratos} · abono ${M(K.devolucion_vencida.abono_mensual_ars)} · contrato ${M(K.devolucion_vencida.contrato_acumulado_ars)}` : "—"],
  ["  sin facturar +40 d", `${d.devolucion.sinFacturar} · ${M(d.devolucion.abonoSinFacturarArs)}`, K ? `${K.devolucion_vencida.sin_factura_40d}` : "—"],
  ["  mediana días", String(d.devolucion.medianaDias), K ? String(K.devolucion_vencida.mediana_dias_vencido) : "—"],
  ["Fin de obra vencido", `${d.finObra.obras} (${d.finObra.activasEnAlquiler} en la calle) · ${d.finObra.sinFecha} sin fecha · mediana ${d.finObra.medianaDias}`, K ? `${K.fin_obra_vencido.obras} (${K.fin_obra_vencido.activas_en_alquiler}) · ${K.fin_obra_vencido.sin_fin_estimado} · ${K.fin_obra_vencido.mediana_dias_vencido}` : "—"],
  ["Sin renovación 35 d", `${d.sinRenovacion.filas.length} de ${d.sinRenovacion.debian} · tasa ${d.sinRenovacion.tasa} % · ${M(d.sinRenovacion.abonoArs)}`, K ? `${K.renovacion.sin_renovacion} de ${K.renovacion.contratos_que_debian_renovar} · ${K.renovacion.tasa_renovacion_pct} % · ${M(K.renovacion.abono_sin_renovacion_ars)}` : "—"],
  ["Vencen en 7 / 15 días", `${d.vencen7} / ${d.vencen15}`, K ? `${K.vencen_proximos_7_dias} / ${K.vencen_proximos_15_dias}` : "—"],
  ["Reservas sin armar / inicio vencido", `${d.reservas.sinArmar} / ${d.reservas.inicioVencido}`, K ? `${K.reservados_sin_armar} / ${K.reservados_inicio_vencido}` : "—"],
  ["Armado que figura devuelto", String(d.armadoDevuelto.total), "82"],
  ["Concentración (1er cliente)", d.topClientes[0] ? `${d.topClientes[0].cliente} ${d.topClientes[0].pct} %` : "—", snap ? `${snap.listas.top_clientes[0].cliente} ${snap.listas.top_clientes[0].pct} %` : "—"],
];
if (d.ot) {
  const O = K?.operacion;
  filas.push(
    ["OT esta semana", `${d.ot.esta.length} (${d.ot.semana.desde}…${d.ot.semana.hasta})`, O ? String(O.esta_semana.total) : "—"],
    ["OT próxima semana", String(d.ot.prox.length), O ? String(O.proxima_semana.total) : "—"],
    ["OT vencidas / sin fecha", `${d.ot.vencidas.length} (desde ${d.ot.vencidas[0]?.fecha ?? "—"}) / ${d.ot.sinFecha}`, O ? `${O.ot_vencidas} / ${O.ot_sin_fecha}` : "—"],
    ["Backlog", `${d.ot.backlog.total} · ${d.ot.backlog.armados} armados (${d.ot.backlog.jornadasArmado} j) · ${d.ot.backlog.desarmes} desarmes (${d.ot.backlog.jornadasDesarme} j)`, O ? `${O.backlog_ot.total} · ${O.backlog_ot.armados} (${O.backlog_ot.jornadas_armado}) · ${O.backlog_ot.desarmes} (${O.backlog_ot.jornadas_desarme})` : "—"],
    ["Sin habilitación próx. 2 semanas", String(d.ot.sinHabilitacionProx2), O ? String(O.ot_sin_habilitacion_prox_2_semanas) : "—"],
    ["Completadas esta semana", String(d.ot.completadasSemana), O ? String(O.completadas_esta_semana.total) : "—"],
  );
} else filas.push(["Órdenes de trabajo", "Sin dato (no se pudieron leer)", "—"]);
filas.push(["Flota (piezas en obra / depósito)", d.flota ? `${d.flota.enObra} / ${d.flota.deposito}` : "Sin dato", K ? `${K.flota.piezas_en_obra_segun_stock} / ${K.flota.piezas_en_deposito}` : "—"]);

console.log(`\nEn la calle · hoy ${hoy} · dólar ${ctx.tc?.valor ?? "sin dato"} · ${seg} s\n`);
const w0 = Math.max(...filas.map((f) => f[0].length));
const w1 = Math.max(...filas.map((f) => f[1].length));
console.log(`${"".padEnd(w0)}  ${"EN VIVO".padEnd(w1)}  SNAPSHOT 15/10 (antes de deduplicar)`);
for (const [a, b, c] of filas) console.log(`${a.padEnd(w0)}  ${b.padEnd(w1)}  ${c}`);

console.log("\nCifras:", r.cifras.map((c) => `${c.kpi}=${c.valor.tipo === "cantidad" ? c.valor.n : c.valor.tipo === "monto" ? Math.round(c.valor.monto.ars) : c.valor.tipo}`).join(" · "));
console.log("Avisos:", r.avisos.map((a) => a.id).join(", "));
console.log("Decisiones:", (r.decisiones ?? []).map((x) => x.id).join(", "));
const rc = resumenCalle({ cifras: r.cifras, detalle: d, decisiones: r.decisiones, oraciones: r.oraciones });
console.log("Reunión (top sin facturar):", rc?.reunion.map((x) => `${x.orden} ${M(x.abonoArs)} ${x.diasSinFacturar} d`).join(" · "));

// Diferencias por contrato contra el snapshot (devolución vencida).
if (snap) {
  const vivo = new Set(d.devolucion.filas.map((f) => f.orden));
  const antes = new Set<string>(snap.listas.devolucion_vencida.map((f: { orden: string }) => f.orden));
  const salen = [...antes].filter((x) => !vivo.has(x));
  const entran = [...vivo].filter((x) => !antes.has(x));
  console.log(`\nDevolución vencida · salen: ${salen.join(", ") || "—"} · entran: ${entran.join(", ") || "—"}`);
  const cambiaFact = d.devolucion.filas.filter((f) => {
    const s = snap.listas.devolucion_vencida.find((x: { orden: string }) => x.orden === f.orden);
    return s && s.sigue_facturando !== f.sigueFacturando;
  });
  console.log(`  cambian "sigue facturando": ${cambiaFact.map((f) => `${f.orden} (${f.ultimaFactura}${f.facturadoVia ? ` vía ${f.facturadoVia}` : ""})`).join(", ") || "—"}`);
}
