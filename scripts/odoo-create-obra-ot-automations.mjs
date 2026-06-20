// Fase 3 — Automated Actions (webhooks Odoo→app) para x_aba_obra y
// x_aba_orden_trabajo. Replica el patrón ya usado en clientes/materiales:
// base.automation (on_create_or_write) + ir.actions.server anidado (state=webhook).
// Idempotente. Correr: node --env-file=.env.local scripts/odoo-create-obra-ot-automations.mjs
import { authenticate, searchRead, create } from "./odoo-rpc.mjs";

const SECRET = process.env.ODOO_SYNC_SECRET;
if (!SECRET) { console.error("Falta ODOO_SYNC_SECRET"); process.exit(1); }
const BASE = "https://andamios-os.vercel.app/api/odoo/webhooks";

await authenticate();

async function modelIdOf(model) {
  const [m] = await searchRead("ir.model", [["model", "=", model]], ["id"]);
  if (!m) throw new Error(`No existe el modelo ${model}`);
  return m.id;
}
async function idFieldOf(model) {
  const [f] = await searchRead("ir.model.fields", [["model", "=", model], ["name", "=", "id"]], ["id"]);
  if (!f) throw new Error(`No existe el campo id en ${model}`);
  return f.id;
}

async function ensureAutomation({ name, model, webhookPath, serverName }) {
  const existing = await searchRead("base.automation", [["name", "=", name]], ["id"]);
  if (existing.length) {
    console.log(`· "${name}" ya existe (id=${existing[0].id})`);
    return existing[0].id;
  }
  const modelId = await modelIdOf(model);
  const idField = await idFieldOf(model);
  const url = `${BASE}/${webhookPath}?secret=${SECRET}`;
  const autoId = await create("base.automation", {
    name,
    model_id: modelId,
    trigger: "on_create_or_write",
    active: true,
    action_server_ids: [[0, 0, {
      name: serverName,
      state: "webhook",
      model_id: modelId,
      webhook_url: url,
      webhook_field_ids: [[6, 0, [idField]]],
      usage: "base_automation",
    }]],
  });
  console.log(`✓ "${name}" creada (id=${autoId}) → ${webhookPath}`);
  return autoId;
}

await ensureAutomation({
  name: "AndamiosOS sync obras",
  model: "x_aba_obra",
  webhookPath: "obras",
  serverName: "Webhook AndamiosOS obras",
});
await ensureAutomation({
  name: "AndamiosOS sync ordenes de trabajo",
  model: "x_aba_orden_trabajo",
  webhookPath: "ordenes-trabajo",
  serverName: "Webhook AndamiosOS OT",
});

// Verificación
const autos = await searchRead("base.automation", [["name", "ilike", "AndamiosOS"]], ["name", "model_name", "trigger", "active"]);
console.log("\nAutomations AndamiosOS:");
for (const a of autos) console.log(`  ${a.name} · ${a.model_name} · ${a.trigger} · ${a.active ? "activa" : "INACTIVA"}`);
console.log("\n✅ Fase 3 completa.");
