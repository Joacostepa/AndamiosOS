// Fase 1 — Crea el modelo custom x_aba_obra en Odoo (entidad madre del flujo
// operativo) + relaciones con sale.order y x_aba_orden_trabajo + UI básica.
//
// Idempotente: chequea existencia antes de crear cada modelo/campo/menú, así se
// puede re-correr sin duplicar. Read/write a Odoo vía JSON-RPC (uid=2, API key).
//
// Correr: node --env-file=.env.local scripts/odoo-create-obra-model.mjs
import { version, authenticate, searchRead, create, fieldsGet, executeKw } from "./odoo-rpc.mjs";

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}\n`);

// ── Helpers ────────────────────────────────────────────────────────────────
async function modelIdOf(model) {
  const rows = await searchRead("ir.model", [["model", "=", model]], ["id"]);
  if (!rows.length) throw new Error(`No existe el modelo ${model}`);
  return rows[0].id;
}

/** Crea un campo manual si no existe ya en el modelo. Devuelve "creado"|"existe". */
async function ensureField(model, modelId, spec) {
  const existing = await fieldsGet(model, ["type"]);
  if (spec.name in existing) {
    console.log(`  · ${model}.${spec.name} ya existe`);
    return "existe";
  }
  await create("ir.model.fields", { model_id: modelId, model, state: "manual", ...spec });
  console.log(`  ✓ ${model}.${spec.name} creado (${spec.ttype}${spec.relation ? "→" + spec.relation : ""})`);
  return "creado";
}

// ── 1) Modelo x_aba_obra ─────────────────────────────────────────────────────
let obraModelId;
const existingObra = await searchRead("ir.model", [["model", "=", "x_aba_obra"]], ["id"]);
if (existingObra.length) {
  obraModelId = existingObra[0].id;
  console.log(`1) x_aba_obra ya existe (id=${obraModelId})`);
} else {
  obraModelId = await create("ir.model", { name: "Obra", model: "x_aba_obra", state: "manual" });
  console.log(`1) ✓ Modelo x_aba_obra creado (id=${obraModelId})`);
}

// ── 2) Access rule (modelos manuales vía API no traen ACL; sin esto no se usa) ─
const accExists = await searchRead(
  "ir.model.access",
  [["model_id", "=", obraModelId]],
  ["id"],
);
if (accExists.length) {
  console.log(`2) ACL de x_aba_obra ya existe`);
} else {
  const grp = await searchRead("ir.model.data", [["module", "=", "base"], ["name", "=", "group_user"]], ["res_id"]);
  await create("ir.model.access", {
    name: "x_aba_obra.user",
    model_id: obraModelId,
    group_id: grp[0].res_id,
    perm_read: true, perm_write: true, perm_create: true, perm_unlink: true,
  });
  console.log(`2) ✓ ACL x_aba_obra (group_user, RWCU) creada`);
}

// ── 3) Campos escalares de x_aba_obra ────────────────────────────────────────
console.log("3) Campos de x_aba_obra:");
await ensureField("x_aba_obra", obraModelId, {
  name: "x_name", field_description: "Código / Nombre", ttype: "char", required: true,
});
await ensureField("x_aba_obra", obraModelId, {
  name: "x_cliente_id", field_description: "Cliente", ttype: "many2one", relation: "res.partner",
});
await ensureField("x_aba_obra", obraModelId, {
  name: "x_fecha_inicio", field_description: "Fecha de inicio", ttype: "date",
});
await ensureField("x_aba_obra", obraModelId, {
  name: "x_fecha_fin_estimada", field_description: "Fecha fin estimada", ttype: "date",
});
await ensureField("x_aba_obra", obraModelId, {
  name: "x_estado", field_description: "Estado", ttype: "selection",
  selection_ids: [
    [0, 0, { value: "pendiente_armado", name: "Pendiente de Armado", sequence: 10 }],
    [0, 0, { value: "armado", name: "Armado", sequence: 20 }],
    [0, 0, { value: "pendiente_desarme", name: "Pendiente de Desarme", sequence: 30 }],
    [0, 0, { value: "desarmado", name: "Desarmado", sequence: 40 }],
  ],
});
await ensureField("x_aba_obra", obraModelId, {
  name: "x_andamios_id", field_description: "ID AndamiosOS (mapeo/idempotencia)", ttype: "char",
});
await ensureField("x_aba_obra", obraModelId, {
  name: "x_observaciones", field_description: "Observaciones", ttype: "text",
});

// ── 4) x_obra_id (m2o → x_aba_obra) en sale.order y en x_aba_orden_trabajo ────
console.log("4) Relaciones inversas (m2o → x_aba_obra):");
const saleModelId = await modelIdOf("sale.order");
const otModelId = await modelIdOf("x_aba_orden_trabajo");
await ensureField("sale.order", saleModelId, {
  name: "x_obra_id", field_description: "Obra", ttype: "many2one", relation: "x_aba_obra", on_delete: "set null",
});
await ensureField("x_aba_orden_trabajo", otModelId, {
  name: "x_obra_id", field_description: "Obra", ttype: "many2one", relation: "x_aba_obra", on_delete: "set null",
});

// ── 5) one2many en x_aba_obra (después de que existen los m2o inversos) ────────
console.log("5) one2many en x_aba_obra:");
await ensureField("x_aba_obra", obraModelId, {
  name: "x_venta_ids", field_description: "Ventas", ttype: "one2many",
  relation: "sale.order", relation_field: "x_obra_id",
});
await ensureField("x_aba_obra", obraModelId, {
  name: "x_orden_trabajo_ids", field_description: "Órdenes de Trabajo", ttype: "one2many",
  relation: "x_aba_orden_trabajo", relation_field: "x_obra_id",
});

// ── 6) UI básica: action + menú "Obras" (auto-views de Odoo) ─────────────────
console.log("6) UI (action + menú):");
let actionId;
const existingAct = await searchRead("ir.actions.act_window", [["res_model", "=", "x_aba_obra"]], ["id"]);
if (existingAct.length) {
  actionId = existingAct[0].id;
  console.log(`  · action ya existe (id=${actionId})`);
} else {
  actionId = await create("ir.actions.act_window", {
    name: "Obras", res_model: "x_aba_obra", view_mode: "list,form",
  });
  console.log(`  ✓ action creada (id=${actionId})`);
}
const existingMenu = await searchRead("ir.ui.menu", [["name", "=", "Obras"], ["parent_id", "=", false]], ["id"]);
if (existingMenu.length) {
  console.log(`  · menú "Obras" ya existe (id=${existingMenu[0].id})`);
} else {
  const menuId = await create("ir.ui.menu", {
    name: "Obras",
    action: `ir.actions.act_window,${actionId}`,
    sequence: 50,
  });
  console.log(`  ✓ menú "Obras" creado (id=${menuId})`);
}

// ── 7) Verificación: fields_get + smoke test (crear Obra de prueba) ──────────
console.log("\n7) Verificación:");
const obraFields = await fieldsGet("x_aba_obra");
const fieldList = Object.entries(obraFields)
  .filter(([k]) => k.startsWith("x_"))
  .map(([k, f]) => `  ${k}: ${f.type}${f.relation ? "→" + f.relation : ""}${f.selection ? " " + JSON.stringify(f.selection) : ""}`);
console.log("x_aba_obra campos x_:\n" + fieldList.join("\n"));

// Smoke test: crear una Obra de prueba (sirve también de fixture para Fase 2/3).
const existingTest = await searchRead("x_aba_obra", [["x_andamios_id", "=", "TEST-FASE1"]], ["id", "x_name"]);
if (existingTest.length) {
  console.log(`\nObra de prueba ya existe: id=${existingTest[0].id} "${existingTest[0].x_name}"`);
} else {
  const testId = await create("x_aba_obra", {
    x_name: "OBRA-TEST-001",
    x_estado: "pendiente_armado",
    x_andamios_id: "TEST-FASE1",
    x_observaciones: "Obra de prueba creada por Fase 1 (Claude). Borrable.",
  });
  console.log(`\n✓ Smoke test OK — Obra de prueba creada id=${testId} (x_andamios_id=TEST-FASE1, borrable)`);
}

console.log("\n✅ Fase 1 completa.");
