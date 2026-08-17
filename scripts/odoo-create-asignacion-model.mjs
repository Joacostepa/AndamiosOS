// Tablero de planificación — Crea el modelo custom x_aba_asignacion en Odoo.
//
// Una asignación = una jornada de una OT, un día, una cuadrilla, con una fracción
// de jornada. Es un objeto LIVIANO y descartable: la planificación es un borrador
// que se mueve todo el tiempo. El hecho consumado vive en x_aba_parte_diario.
// Una obra de 4 jornadas son 4 registros; moverla = actualizar las 4 fechas.
//
// REGLA DE NEGOCIO: la app es la ÚNICA que escribe asignaciones. Por eso el ACL
// da solo lectura a Internal User (group_user) y RWCU a Settings (group_system),
// que es el grupo del usuario de integración (uid=2). En Odoo se ven, no se editan.
//
// Idempotente: chequea existencia antes de crear cada modelo/campo/ACL/menú, así se
// puede re-correr sin duplicar.
//
// Correr: node --env-file=.env.local scripts/odoo-create-asignacion-model.mjs
import { version, authenticate, searchRead, create, fieldsGet, executeKw } from "./odoo-rpc.mjs";

const MODEL = "x_aba_asignacion";

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

/** res_id de un grupo de seguridad de `base` (group_user / group_system). */
async function grupoBase(name) {
  const rows = await searchRead("ir.model.data", [["module", "=", "base"], ["name", "=", name]], ["res_id"]);
  if (!rows.length) throw new Error(`No existe el grupo base.${name}`);
  return rows[0].res_id;
}

async function ensureAcl(modelId, nombre, groupId, perms) {
  const existe = await searchRead(
    "ir.model.access",
    [["model_id", "=", modelId], ["group_id", "=", groupId]],
    ["id"],
  );
  if (existe.length) {
    console.log(`  · ACL ${nombre} ya existe`);
    return;
  }
  await create("ir.model.access", { name: nombre, model_id: modelId, group_id: groupId, ...perms });
  console.log(`  ✓ ACL ${nombre} creada`);
}

// ── 1) Modelo x_aba_asignacion ───────────────────────────────────────────────
let modelId;
const existing = await searchRead("ir.model", [["model", "=", MODEL]], ["id"]);
if (existing.length) {
  modelId = existing[0].id;
  console.log(`1) ${MODEL} ya existe (id=${modelId})`);
} else {
  modelId = await create("ir.model", { name: "Asignación de Planificación", model: MODEL, state: "manual" });
  console.log(`1) ✓ Modelo ${MODEL} creado (id=${modelId})`);
}

// ── 2) ACLs (los modelos manuales vía API no traen ACL; sin esto no se usan) ──
console.log("2) Permisos:");
await ensureAcl(modelId, `${MODEL}.user (solo lectura)`, await grupoBase("group_user"), {
  perm_read: true, perm_write: false, perm_create: false, perm_unlink: false,
});
await ensureAcl(modelId, `${MODEL}.system (app)`, await grupoBase("group_system"), {
  perm_read: true, perm_write: true, perm_create: true, perm_unlink: true,
});

// ── 3) Campos ────────────────────────────────────────────────────────────────
console.log("3) Campos:");
// x_name es el display name de los modelos manuales (_rec_name). Lo escribe la app
// con el título de la OT + fecha, para que la lista en Odoo sea legible.
await ensureField(MODEL, modelId, {
  name: "x_name", field_description: "Descripción", ttype: "char",
});
await ensureField(MODEL, modelId, {
  name: "x_ot_id", field_description: "Orden de Trabajo", ttype: "many2one",
  relation: "x_aba_orden_trabajo", required: true, on_delete: "cascade",
});
await ensureField(MODEL, modelId, {
  name: "x_fecha", field_description: "Fecha", ttype: "date", required: true,
});
// Puede quedar vacía: una asignación sin cuadrilla es una obra en la bandeja de
// "sin asignar" que ya tiene fecha tentativa.
await ensureField(MODEL, modelId, {
  name: "x_cuadrilla_id", field_description: "Cuadrilla", ttype: "many2one",
  relation: "x_aba_cuadrilla", on_delete: "set null",
});
// Misma escala que x_aba_orden_trabajo.x_duracion_est. Capacidad diaria = 1,00.
await ensureField(MODEL, modelId, {
  name: "x_fraccion", field_description: "Fracción de jornada", ttype: "selection",
  selection_ids: [
    [0, 0, { value: "0.10", name: "0,10 — mínimo (~1,5 h)", sequence: 10 }],
    [0, 0, { value: "0.25", name: "0,25 — 2 h", sequence: 20 }],
    [0, 0, { value: "0.50", name: "0,50 — 4 h", sequence: 30 }],
    [0, 0, { value: "0.75", name: "0,75 — 6 h", sequence: 40 }],
    [0, 0, { value: "1", name: "1 — jornada completa", sequence: 50 }],
  ],
});
// tentativa es el modo de trabajo normal: borrador que igual ocupa capacidad.
await ensureField(MODEL, modelId, {
  name: "x_estado", field_description: "Estado", ttype: "selection",
  selection_ids: [
    [0, 0, { value: "tentativa", name: "Tentativa", sequence: 10 }],
    [0, 0, { value: "confirmada", name: "Confirmada", sequence: 20 }],
  ],
});
await ensureField(MODEL, modelId, {
  name: "x_orden_dia", field_description: "Orden dentro del día", ttype: "integer",
});
await ensureField(MODEL, modelId, {
  name: "x_notas", field_description: "Nota de coordinación", ttype: "char",
});

// ── 4) one2many inverso en la OT (para verla desde la orden de trabajo) ───────
console.log("4) one2many en x_aba_orden_trabajo:");
await ensureField("x_aba_orden_trabajo", await modelIdOf("x_aba_orden_trabajo"), {
  name: "x_asignacion_ids", field_description: "Asignaciones (tablero)", ttype: "one2many",
  relation: MODEL, relation_field: "x_ot_id",
});

// ── 5) UI: action + menú bajo Operaciones (auto-views de Odoo) ────────────────
console.log("5) UI (action + menú):");
let actionId;
const existingAct = await searchRead("ir.actions.act_window", [["res_model", "=", MODEL]], ["id"]);
if (existingAct.length) {
  actionId = existingAct[0].id;
  console.log(`  · action ya existe (id=${actionId})`);
} else {
  actionId = await create("ir.actions.act_window", {
    name: "Asignaciones (tablero)", res_model: MODEL, view_mode: "list,form",
  });
  console.log(`  ✓ action creada (id=${actionId})`);
}
const padre = await searchRead("ir.ui.menu", [["name", "=", "Operaciones"], ["parent_id", "=", false]], ["id"]);
const existingMenu = await searchRead("ir.ui.menu", [["name", "=", "Asignaciones (tablero)"]], ["id"]);
if (existingMenu.length) {
  console.log(`  · menú ya existe (id=${existingMenu[0].id})`);
} else {
  const menuId = await create("ir.ui.menu", {
    name: "Asignaciones (tablero)",
    action: `ir.actions.act_window,${actionId}`,
    parent_id: padre.length ? padre[0].id : false,
    sequence: 5,
  });
  console.log(`  ✓ menú creado (id=${menuId})${padre.length ? " bajo Operaciones" : " en la raíz"}`);
}

// ── 6) Verificación + smoke test (crea y borra un registro real) ─────────────
console.log("\n6) Verificación:");
const campos = await fieldsGet(MODEL);
console.log(
  Object.entries(campos)
    .filter(([k]) => k.startsWith("x_"))
    .map(([k, f]) => `  ${k}: ${f.type}${f.relation ? "→" + f.relation : ""}${f.required ? " REQ" : ""}`)
    .join("\n"),
);

const otRef = await searchRead("x_aba_orden_trabajo", [], ["id", "x_name"], { limit: 1, order: "id desc" });
if (!otRef.length) {
  console.log("\n⚠ No hay OTs en Odoo: se omite el smoke test.");
} else {
  const testId = await create(MODEL, {
    x_name: `SMOKE TEST — ${otRef[0].x_name}`,
    x_ot_id: otRef[0].id,
    x_fecha: "2000-01-01",
    x_fraccion: "0.25",
    x_estado: "tentativa",
    x_orden_dia: 0,
    x_notas: "Registro de prueba del script de creación. Se borra solo.",
  });
  const [leido] = await searchRead(MODEL, [["id", "=", testId]], ["x_name", "x_fecha", "x_fraccion", "x_estado"]);
  console.log(`\n  ✓ create/read OK — id=${testId} ${JSON.stringify(leido)}`);
  await executeKw(MODEL, "unlink", [[testId]]);
  console.log(`  ✓ unlink OK — sin residuos`);
}

console.log("\n✅ x_aba_asignacion listo.");
