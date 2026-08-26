// Relevamiento READ-ONLY de qué se carga realmente en la OT y en su orden de venta.
//
// La pregunta que contesta: de todos los campos que existen, ¿cuáles están POBLADOS en
// las OTs de verdad, y de esos, cuáles no llegan hoy al panel del tablero? Un campo que
// existe pero está vacío en el 90% de los registros no sirve para decidir nada.
//
// No mide sobre todo el histórico: mide sobre las OTs que el tablero mira (pendientes y
// en proceso, de contratos de Obra) y, aparte, sobre TODAS, para distinguir "campo nuevo
// que recién se empieza a usar" de "campo muerto".
//
// Correr: node --env-file=.env.local scripts/odoo-relevar-campos-ot.mjs

import { authenticate, searchRead, searchCount, fieldsGet } from "./odoo-rpc.mjs";

await authenticate();

const DOM_CANDIDATAS = [
  ["x_estado", "in", ["pendiente", "en_proceso"]],
  ["x_order_id.x_studio_tipo_de_contrato", "=", "Obra "],
];

// Lo que la app YA trae y lo que el panel YA muestra (src/lib/odoo/asignaciones.ts y
// src/components/tablero/panel-ot.tsx).
const TRAE_LA_APP = new Set([
  "id", "x_name", "x_order_id", "x_tipo", "x_estado", "x_urgencia", "x_motivo_urgencia",
  "x_duracion_est", "x_jornadas_num", "x_personal_por_jornada", "x_cuadrilla_prevista_id",
  "x_hab_semaforo", "x_hab_alerta", "x_hab_vencimiento", "x_tecnico", "x_contacto_obra",
  "x_tel_obra", "x_observaciones", "x_dias_obra", "x_horas_hombre", "x_cant_docs",
  "x_doc_ids", "x_fecha_programada", "x_fecha_comprometida",
]);
const MUESTRA_EL_PANEL = new Set([
  "x_name", "x_tipo", "x_tecnico", "x_urgencia", "x_motivo_urgencia", "x_hab_semaforo",
  "x_hab_alerta", "x_hab_vencimiento", "x_contacto_obra", "x_tel_obra", "x_duracion_est",
  "x_jornadas_num", "x_personal_por_jornada", "x_dias_obra", "x_horas_hombre",
  "x_observaciones", "x_cant_docs", "x_order_id",
]);

const vacio = (v) =>
  v === false || v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

const muestra = (v) => {
  if (Array.isArray(v)) return v.length === 2 && typeof v[1] === "string" ? v[1] : `[${v.length}]`;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s.length > 46 ? s.slice(0, 46) + "…" : s;
};

function tabla(titulo, filas) {
  console.log(`\n${titulo}`);
  console.log("─".repeat(titulo.length));
  const anchoCampo = Math.max(...filas.map((f) => f.campo.length), 6);
  for (const f of filas) {
    console.log(
      `${f.campo.padEnd(anchoCampo)} ${String(f.pct).padStart(4)}%  ${f.marca}  ${f.tipo.padEnd(10)} ${f.ejemplo}`,
    );
  }
}

// ═══ 1. x_aba_orden_trabajo ═══════════════════════════════════════════════════
const totalOts = await searchCount("x_aba_orden_trabajo", []);
const totalCand = await searchCount("x_aba_orden_trabajo", DOM_CANDIDATAS);
console.log(`OTs en Odoo: ${totalOts} · candidatas del tablero (pendiente/en_proceso, contrato Obra): ${totalCand}`);

const camposOt = await fieldsGet("x_aba_orden_trabajo");
const nombresOt = Object.keys(camposOt).filter(
  (k) => k.startsWith("x_") && !camposOt[k].type.endsWith("2many_ids"),
);

const candidatas = await searchRead("x_aba_orden_trabajo", DOM_CANDIDATAS, nombresOt, { limit: 400 });
const todas = await searchRead("x_aba_orden_trabajo", [], nombresOt, { limit: 800, order: "id desc" });

const filasOt = nombresOt
  .map((campo) => {
    const llenosCand = candidatas.filter((r) => !vacio(r[campo])).length;
    const llenosTodas = todas.filter((r) => !vacio(r[campo])).length;
    const pct = candidatas.length ? Math.round((llenosCand / candidatas.length) * 100) : 0;
    const pctTodas = todas.length ? Math.round((llenosTodas / todas.length) * 100) : 0;
    const conValor = candidatas.find((r) => !vacio(r[campo])) ?? todas.find((r) => !vacio(r[campo]));
    const f = camposOt[campo];
    return {
      campo,
      pct,
      pctTodas,
      tipo: f.type,
      etiqueta: f.string,
      seleccion: f.selection,
      marca: MUESTRA_EL_PANEL.has(campo) ? "panel" : TRAE_LA_APP.has(campo) ? "trae " : "  —  ",
      ejemplo: conValor ? muestra(conValor[campo]) : "(siempre vacío)",
    };
  })
  .sort((a, b) => b.pct - a.pct || a.campo.localeCompare(b.campo));

tabla(`x_aba_orden_trabajo — % de las ${candidatas.length} OTs candidatas que lo tienen cargado`, filasOt);

console.log("\n▸ POBLADOS Y NO MOSTRADOS EN EL PANEL (candidatos a agregar)");
for (const f of filasOt.filter((x) => x.pct >= 20 && x.marca !== "panel")) {
  console.log(
    `  ${f.campo} · ${f.pct}% · ${f.etiqueta} · ${f.tipo}${f.seleccion ? " " + JSON.stringify(f.seleccion) : ""}`,
  );
  console.log(`      ej: ${f.ejemplo}${f.marca === "trae " ? "   [la app YA lo trae, sólo falta mostrarlo]" : ""}`);
}

console.log("\n▸ CAMPOS QUE NADIE CARGA (0% en candidatas, <5% en todas)");
console.log(
  "  " +
    filasOt
      .filter((x) => x.pct === 0 && x.pctTodas < 5)
      .map((x) => x.campo)
      .join(", "),
);

// ═══ 2. sale.order — la orden de venta de esas OTs ════════════════════════════
const orderIds = [...new Set(candidatas.map((r) => r.x_order_id?.[0]).filter(Boolean))];
console.log(`\n\nÓrdenes de venta detrás de las OTs candidatas: ${orderIds.length}`);

const camposSo = await fieldsGet("sale.order");
const ESTANDAR = [
  "name", "partner_id", "partner_shipping_id", "partner_invoice_id", "date_order",
  "commitment_date", "validity_date", "user_id", "team_id", "state", "amount_untaxed",
  "amount_total", "client_order_ref", "note", "payment_term_id", "invoice_status",
  "delivery_status", "company_id", "currency_id", "origin", "tag_ids",
];
const nombresSo = [
  ...Object.keys(camposSo).filter((k) => k.startsWith("x_") && !k.endsWith("_ids")),
  ...ESTANDAR.filter((k) => k in camposSo),
];

const ordenes = orderIds.length ? await searchRead("sale.order", [["id", "in", orderIds]], nombresSo) : [];

const filasSo = nombresSo
  .map((campo) => {
    const llenos = ordenes.filter((r) => !vacio(r[campo])).length;
    const pct = ordenes.length ? Math.round((llenos / ordenes.length) * 100) : 0;
    const conValor = ordenes.find((r) => !vacio(r[campo]));
    const f = camposSo[campo];
    return {
      campo,
      pct,
      tipo: f.type,
      etiqueta: f.string,
      seleccion: f.selection,
      marca: "  —  ",
      ejemplo: conValor ? muestra(conValor[campo]) : "(siempre vacío)",
    };
  })
  .filter((f) => f.pct > 0)
  .sort((a, b) => b.pct - a.pct || a.campo.localeCompare(b.campo));

tabla(`sale.order — % de las ${ordenes.length} órdenes que lo tienen cargado (sólo los poblados)`, filasSo);

console.log("\n▸ DE LA ORDEN, LO QUE EL TABLERO NO VE HOY (la app sólo usa el nombre de la orden)");
for (const f of filasSo.filter((x) => x.pct >= 30)) {
  console.log(`  ${f.campo} · ${f.pct}% · ${f.etiqueta} · ${f.tipo}`);
  console.log(`      ej: ${f.ejemplo}`);
}
