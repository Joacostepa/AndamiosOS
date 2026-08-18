// Reordena el modelo de cuadrillas y agrega el puntero al parte diario.
//
// POR QUÉ: las filas del tablero deben ser CAPACIDAD (5 cuadrillas fijas), no personas.
// Las 12 cuadrillas nominales —MIÑO, HEPPER, CEBOLLA…— son en realidad nombres de
// puntero, y tenerlas como filas llenaba la grilla de líneas vacías. El puntero es un
// hecho del día (cambia con ausencias y rotaciones), así que va en el parte.
//
// NO se borra nada: las nominales se marcan x_activa = false, que es la marca que
// filtra la app, no el archivado de Odoo. Sus 1.239 partes históricos quedan intactos y
// el cambio se revierte poniendo el flag de vuelta en true.
//
// Idempotente. Correr: node --env-file=.env.local scripts/odoo-cuadrillas-y-puntero.mjs
import { version, authenticate, searchRead, create, write, fieldsGet } from "./odoo-rpc.mjs";

const NUEVAS = ["CUADRILLA 4", "CUADRILLA 5"];
const A_MANTENER = /^CUADRILLA \d+$/;

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}\n`);

// ── 1) Las cuadrillas numeradas que falten ───────────────────────────────────
const existentes = await searchRead("x_aba_cuadrilla", [], ["x_name", "x_activa"], { order: "id" });
console.log("1) Cuadrillas numeradas:");
for (const nombre of NUEVAS) {
  const ya = existentes.find((c) => c.x_name === nombre);
  if (ya) {
    if (!ya.x_activa) {
      await write("x_aba_cuadrilla", [ya.id], { x_activa: true });
      console.log(`  ✓ ${nombre} ya existía inactiva → reactivada`);
    } else {
      console.log(`  · ${nombre} ya existe y está activa`);
    }
  } else {
    const id = await create("x_aba_cuadrilla", { x_name: nombre, x_activa: true, x_tercerizada: false });
    console.log(`  ✓ ${nombre} creada (id=${id})`);
  }
}

// ── 2) Las nominales salen de la grilla (no se borran) ───────────────────────
console.log("\n2) Cuadrillas nominales (pasan a inactivas):");
const aDesactivar = existentes.filter((c) => c.x_activa && !A_MANTENER.test(c.x_name ?? ""));
if (aDesactivar.length === 0) {
  console.log("  · no quedaba ninguna activa");
} else {
  await write("x_aba_cuadrilla", aDesactivar.map((c) => c.id), { x_activa: false });
  console.log(`  ✓ ${aDesactivar.length} desactivadas: ${aDesactivar.map((c) => c.x_name).join(", ")}`);
}

// ── 3) El puntero, en el parte ───────────────────────────────────────────────
console.log("\n3) Puntero en el parte diario:");
const [modelo] = await searchRead("ir.model", [["model", "=", "x_aba_parte_diario"]], ["id"]);
const campos = await fieldsGet("x_aba_parte_diario", ["type"]);
if ("x_puntero_id" in campos) {
  console.log("  · x_aba_parte_diario.x_puntero_id ya existe");
} else {
  await create("ir.model.fields", {
    model_id: modelo.id,
    model: "x_aba_parte_diario",
    state: "manual",
    name: "x_puntero_id",
    field_description: "Puntero (responsable de cuadrilla)",
    ttype: "many2one",
    relation: "hr.employee",
    on_delete: "set null",
  });
  console.log("  ✓ x_aba_parte_diario.x_puntero_id creado (many2one→hr.employee)");
}

// ── 4) Verificación ──────────────────────────────────────────────────────────
console.log("\n4) Verificación:");
const activas = await searchRead("x_aba_cuadrilla", [["x_activa", "=", true]], ["x_name"], { order: "x_name" });
console.log(`  filas del tablero (${activas.length}): ${activas.map((c) => c.x_name).join(", ")}`);

const historicos = await searchRead(
  "x_aba_parte_diario",
  [["x_cuadrilla_id", "!=", false]],
  ["x_cuadrilla_id"],
  { limit: 1, order: "id desc" },
);
console.log(
  historicos.length
    ? `  los partes históricos siguen leyendo su cuadrilla: ${historicos[0].x_cuadrilla_id[1]}`
    : "  sin partes históricos para verificar",
);

const punteros = await searchRead(
  "hr.employee",
  [["job_title", "in", ["Escala 5", "Escala 6", "Escala 7"]]],
  ["name", "job_title"],
  { order: "name" },
);
console.log(`  candidatos a puntero (escala 5+): ${punteros.map((p) => p.name.split(",")[0]).join(", ")}`);

console.log("\n✅ Listo. Para revertir: poner x_activa = true en las nominales.");
