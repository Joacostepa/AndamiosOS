// Backfill de x_fecha_programada / x_fecha_firmeza en las OTs que YA están planificadas.
//
// El tablero mantiene estos campos solos, pero sólo al editar. Sin este backfill, una
// obra planificada hace dos semanas y que nadie vuelve a tocar no aparece con su fecha en
// Odoo. Esto la pone al día una vez.
//
// Aplica exactamente el mismo criterio que src/lib/odoo/asignaciones.ts:
//   - fecha = primer día SIN parte cargado (lo que el cliente pregunta es cuándo siguen)
//   - firmeza = confirmada sólo si ese primer día lo está
//   - si no quedan días pendientes, se limpia SÓLO si la fecha la había escrito el
//     tablero (o sea, si tiene firmeza). Una fecha cargada a mano en Odoo no se toca.
//
// Por defecto NO escribe: muestra qué haría. Para aplicar, pasar --aplicar.
// Correr: node --env-file=.env.local scripts/odoo-backfill-fecha-programada.mjs [--aplicar]
import { authenticate, searchRead, executeKw } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");

await authenticate();

const asignaciones = await searchRead(
  "x_aba_asignacion",
  [],
  ["x_ot_id", "x_fecha", "x_estado", "x_parte_id"],
  { order: "x_fecha" },
);

const otIds = [...new Set(asignaciones.map((a) => (Array.isArray(a.x_ot_id) ? a.x_ot_id[0] : 0)))].filter(Boolean);
if (otIds.length === 0) {
  console.log("No hay asignaciones: nada para backfillear.");
  process.exit(0);
}

const ots = await searchRead(
  "x_aba_orden_trabajo",
  [["id", "in", otIds]],
  ["x_name", "x_fecha_programada", "x_fecha_firmeza"],
);

const primera = new Map();
for (const a of asignaciones) {
  const otId = Array.isArray(a.x_ot_id) ? a.x_ot_id[0] : 0;
  const fecha = typeof a.x_fecha === "string" ? a.x_fecha : null;
  if (!otId || !fecha || a.x_parte_id) continue; // los días ya cerrados no cuentan
  const actual = primera.get(otId);
  if (!actual || fecha < actual.fecha) {
    primera.set(otId, { fecha, confirmada: a.x_estado === "confirmada" });
  } else if (fecha === actual.fecha && a.x_estado !== "confirmada") {
    primera.set(otId, { ...actual, confirmada: false });
  }
}

const cambios = [];
for (const ot of ots) {
  const plan = primera.get(ot.id);
  const fechaActual = ot.x_fecha_programada || false;
  const firmezaActual = ot.x_fecha_firmeza || false;

  let fecha, firmeza;
  if (plan) {
    fecha = plan.fecha;
    firmeza = plan.confirmada ? "confirmada" : "tentativa";
  } else {
    if (!firmezaActual) continue; // fecha puesta a mano y sin plan → no se toca
    fecha = false;
    firmeza = false;
  }
  if (fechaActual === fecha && firmezaActual === firmeza) continue;
  // Sólo es "pisar" si la fecha REALMENTE cambia. Agregarle la etiqueta de firmeza a una
  // fecha que ya coincide con el plan no le saca información a nadie, y contar esos casos
  // como pisadas hacía ver 20 sobreescrituras donde en realidad hay un puñado.
  const mueveFecha = !!fechaActual && fechaActual !== fecha;
  cambios.push({ ot, fecha, firmeza, fechaActual, mueveFecha });
}

const mueven = cambios.filter((c) => c.mueveFecha);
const soloEtiqueta = cambios.filter((c) => !c.mueveFecha);

console.log(`OTs planificadas: ${ots.length} · con algo para cambiar: ${cambios.length}`);
console.log(`  · cambian de fecha: ${mueven.length}`);
console.log(`  · sólo suman la etiqueta de firmeza (misma fecha o vacía): ${soloEtiqueta.length}\n`);

if (mueven.length) {
  console.log("CAMBIAN LA FECHA — son las que conviene mirar:");
  for (const c of mueven) {
    console.log(`  OT ${c.ot.id}: ${c.fechaActual} → ${c.fecha} · ${c.firmeza}`);
    console.log(`      ${String(c.ot.x_name).slice(0, 78)}`);
  }
  console.log();
}

if (soloEtiqueta.length) {
  console.log("SÓLO ETIQUETA:");
  for (const c of soloEtiqueta) {
    console.log(`  OT ${c.ot.id}: ${c.fechaActual || "(vacía)"} → ${c.fecha || "(vacía)"} · ${c.firmeza || "-"}`);
  }
  console.log();
}

if (!APLICAR) {
  console.log("\nCorrida en seco. Para aplicar: node --env-file=.env.local scripts/odoo-backfill-fecha-programada.mjs --aplicar");
  process.exit(0);
}

// Se imprime el estado previo en formato revertible ANTES de tocar nada: si algo sale
// mal, con esto se vuelve exactamente al punto de partida.
console.log("REVERTIR (pegar en un script si hiciera falta):");
console.log(
  JSON.stringify(
    cambios.map((c) => ({ id: c.ot.id, x_fecha_programada: c.fechaActual, x_fecha_firmeza: false })),
  ),
);

for (const c of cambios) {
  await executeKw("x_aba_orden_trabajo", "write", [
    [c.ot.id],
    { x_fecha_programada: c.fecha, x_fecha_firmeza: c.firmeza },
  ]);
}
console.log(`\n✅ ${cambios.length} OT(s) actualizadas.`);
