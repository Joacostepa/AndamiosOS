// Fase 5 — prepara x_aba_orden_trabajo para OT adicionales con write-back app→Odoo.
// - x_order_id pasa a OPCIONAL (un adicional todavía no tiene venta).
// - agrega x_es_adicional (bool), x_aprobada_comercial (bool, Comercial la marca),
//   x_andamios_id (char, clave de idempotencia = id de la OT en la app).
// Idempotente. Correr: node --env-file=.env.local scripts/odoo-ot-adicionales.mjs
import { authenticate, searchRead, create, write, fieldsGet } from "./odoo-rpc.mjs";

await authenticate();
const MODEL = "x_aba_orden_trabajo";
const [m] = await searchRead("ir.model", [["model", "=", MODEL]], ["id"]);
if (!m) throw new Error(`No existe ${MODEL}`);
const modelId = m.id;

// 1) x_order_id → opcional
const [ordF] = await searchRead("ir.model.fields", [["model", "=", MODEL], ["name", "=", "x_order_id"]], ["id", "required"]);
if (ordF?.required) {
  await write("ir.model.fields", [ordF.id], { required: false });
  console.log("✓ x_order_id ahora es OPCIONAL");
} else {
  console.log("· x_order_id ya era opcional");
}

// 2) campos nuevos
async function ensureField(spec) {
  const ex = await fieldsGet(MODEL, ["type"]);
  if (spec.name in ex) { console.log(`· ${spec.name} ya existe`); return; }
  await create("ir.model.fields", { model_id: modelId, model: MODEL, state: "manual", ...spec });
  console.log(`✓ ${spec.name} creado (${spec.ttype})`);
}
await ensureField({ name: "x_es_adicional", field_description: "Es adicional", ttype: "boolean" });
await ensureField({ name: "x_aprobada_comercial", field_description: "Aprobada por Comercial", ttype: "boolean" });
await ensureField({ name: "x_andamios_id", field_description: "ID AndamiosOS (idempotencia)", ttype: "char" });

const f = await fieldsGet(MODEL, ["type", "required"]);
console.log("\nx_order_id required:", f.x_order_id.required, "| x_es_adicional:", !!f.x_es_adicional, "| x_aprobada_comercial:", !!f.x_aprobada_comercial, "| x_andamios_id:", !!f.x_andamios_id);
console.log("✅ OT lista para adicionales.");
