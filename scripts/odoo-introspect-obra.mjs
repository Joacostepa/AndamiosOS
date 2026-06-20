// Fase 1 — pre-check read-only antes de crear x_aba_obra.
// Correr: node --env-file=.env.local scripts/odoo-introspect-obra.mjs
import { version, authenticate, searchRead, searchCount, fieldsGet } from "./odoo-rpc.mjs";

const v = await version();
console.log(`Odoo ${v.server_version} (serie ${v.server_serie})`);
const uid = await authenticate();
console.log(`Autenticado uid=${uid}\n`);

// 1) ¿Ya existe el modelo x_aba_obra? (idempotencia ante un run parcial previo)
const obraModels = await searchRead("ir.model", [["model", "=", "x_aba_obra"]], ["id", "model", "name", "state"]);
console.log("x_aba_obra existente:", obraModels.length ? JSON.stringify(obraModels) : "NO existe (se creará)");

// 2) x_aba_orden_trabajo: confirmar campos relevantes y si ya tiene x_obra_id
const otModel = await searchRead("ir.model", [["model", "=", "x_aba_orden_trabajo"]], ["id", "name", "state"]);
console.log("\nx_aba_orden_trabajo modelo:", JSON.stringify(otModel));
const otCount = await searchCount("x_aba_orden_trabajo", []);
console.log("x_aba_orden_trabajo registros:", otCount);
const otFields = await fieldsGet("x_aba_orden_trabajo");
const otRelevant = Object.entries(otFields)
  .filter(([k]) => k.startsWith("x_") || ["name"].includes(k))
  .map(([k, f]) => `  ${k}: ${f.type}${f.relation ? "→" + f.relation : ""}${f.selection ? " " + JSON.stringify(f.selection) : ""}`);
console.log("x_aba_orden_trabajo campos x_:\n" + otRelevant.join("\n"));
console.log("¿tiene x_obra_id?:", "x_obra_id" in otFields ? "SÍ (ya existe)" : "NO (se agregará)");

// 3) sale.order: x_obra_id y x_studio_estado_de_obra
const soFields = await fieldsGet("sale.order");
console.log("\nsale.order ¿tiene x_obra_id?:", "x_obra_id" in soFields ? "SÍ (ya existe)" : "NO (se agregará)");
const estObra = soFields["x_studio_estado_de_obra"];
console.log("sale.order.x_studio_estado_de_obra:", estObra ? `${estObra.type} ${JSON.stringify(estObra.selection)}` : "NO existe");

console.log("\n✓ Introspección OK");
