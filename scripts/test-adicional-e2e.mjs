// Test E2E del flujo de OT adicional (Fase 5): la app crea la OT → "push" a Odoo
// (acá replicado vía RPC con x_andamios_id) → la automation de Odoo dispara el
// webhook a PROD → debe LINKEAR (no duplicar) y luego sincronizar la aprobación.
// Correr: node --env-file=.env.local scripts/test-adicional-e2e.mjs
import pg from "pg";
import * as odoo from "./odoo-rpc.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await odoo.authenticate();

const obra = (await c.query("SELECT id, codigo, odoo_obra_id FROM obras WHERE odoo_obra_id IS NOT NULL LIMIT 1")).rows[0];
if (!obra) { console.error("No hay obra con odoo_obra_id"); process.exit(1); }
console.log(`Obra: ${obra.codigo} (app ${obra.id.slice(0,8)} / odoo ${obra.odoo_obra_id})`);

let appId, odooId;
try {
  // 1) app crea la OT adicional (guarda primero, nunca bloquea)
  appId = (await c.query(
    `INSERT INTO ordenes_trabajo (obra_id, tipo, es_adicional, aprobada_comercial, estado, odoo_sync_estado, motivo_adicional, codigo)
     VALUES ($1,'ampliacion',true,false,'pendiente','pendiente','TEST adicional E2E','') RETURNING id`,
    [obra.id])).rows[0].id;
  console.log(`1) App OT adicional creada: ${appId.slice(0,8)} (pendiente, sync pendiente)`);

  // 2) push a Odoo (replica pushAdicionalToOdoo): x_andamios_id = appId
  odooId = await odoo.create("x_aba_orden_trabajo", {
    x_andamios_id: appId, x_obra_id: obra.odoo_obra_id, x_tipo: "ampliacion", x_estado: "pendiente",
    x_es_adicional: true, x_aprobada_comercial: false, x_name: "Adicional TEST E2E",
    x_jornadas_estimadas: 1, x_personal_por_jornada: 1,
  });
  console.log(`2) Push → Odoo OT creada id=${odooId} (dispara automation → webhook PROD)`);

  // 3) el webhook (echo) debe LINKEAR la OT existente por x_andamios_id, no duplicar
  let linked = null;
  for (let i = 0; i < 20; i++) {
    const r = await c.query("SELECT odoo_ot_id FROM ordenes_trabajo WHERE id=$1", [appId]);
    if (r.rows[0]?.odoo_ot_id) { linked = r.rows[0].odoo_ot_id; break; }
    await sleep(3000);
  }
  const dupes = (await c.query("SELECT count(*)::int n FROM ordenes_trabajo WHERE odoo_ot_id=$1", [odooId])).rows[0].n;
  console.log(`3) Echo webhook: odoo_ot_id en la OT app = ${linked ?? "NO linkeó"} | filas con ese odoo_ot_id = ${dupes} (debe ser 1, sin duplicado)`);

  // 4) Comercial aprueba en Odoo → webhook → app aprobada_comercial=true
  await odoo.write("x_aba_orden_trabajo", [odooId], { x_aprobada_comercial: true });
  console.log("4) Comercial aprobó en Odoo (x_aprobada_comercial=true) → esperando sync...");
  let aprob = null;
  for (let i = 0; i < 20; i++) {
    const r = await c.query("SELECT aprobada_comercial FROM ordenes_trabajo WHERE id=$1", [appId]);
    if (r.rows[0]?.aprobada_comercial === true) { aprob = true; break; }
    await sleep(3000);
  }
  console.log(`   aprobada_comercial en la app = ${aprob ? "true ✓ (desbloqueada)" : "todavía false ✗"}`);

  console.log("\nRESULTADO:", linked && dupes === 1 && aprob ? "✅ E2E OK" : "⚠️ revisar (¿deploy propagado?)");
} finally {
  // cleanup
  if (odooId) await odoo.executeKw("x_aba_orden_trabajo", "unlink", [[odooId]]).catch(() => {});
  if (appId) await c.query("DELETE FROM ordenes_trabajo WHERE id=$1", [appId]).catch(() => {});
  await c.query("DELETE FROM audit_log WHERE tabla='ordenes_trabajo'").catch(() => {});
  console.log("cleanup hecho");
  await c.end();
}
