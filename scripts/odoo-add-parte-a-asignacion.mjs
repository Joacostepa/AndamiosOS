// Cierre de jornada — vincula la asignación (la intención) con el parte diario (el hecho).
//
// Agrega x_parte_id en x_aba_asignacion. No hace falta un booleano de "cerrada": si hay
// parte vinculado, está cerrada.
//
// on_delete = "set null": si en Odoo borran un parte, la asignación vuelve a estar
// abierta en vez de desaparecer del tablero.
//
// Idempotente: se puede re-correr sin duplicar.
// Correr: node --env-file=.env.local scripts/odoo-add-parte-a-asignacion.mjs
import { version, authenticate, searchRead, create, fieldsGet, executeKw } from "./odoo-rpc.mjs";

const MODEL = "x_aba_asignacion";

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}\n`);

const modelo = await searchRead("ir.model", [["model", "=", MODEL]], ["id"]);
if (!modelo.length) throw new Error(`No existe ${MODEL}. Corré antes odoo-create-asignacion-model.mjs`);
const modelId = modelo[0].id;

const existentes = await fieldsGet(MODEL, ["type"]);
if ("x_parte_id" in existentes) {
  console.log(`· ${MODEL}.x_parte_id ya existe`);
} else {
  await create("ir.model.fields", {
    model_id: modelId,
    model: MODEL,
    state: "manual",
    name: "x_parte_id",
    field_description: "Parte diario (cierre)",
    ttype: "many2one",
    relation: "x_aba_parte_diario",
    on_delete: "set null",
  });
  console.log(`✓ ${MODEL}.x_parte_id creado (many2one→x_aba_parte_diario)`);
}

// ── Verificación: escribir y leer el vínculo sobre un registro de prueba ──────
const ot = await searchRead("x_aba_orden_trabajo", [], ["id"], { limit: 1, order: "id desc" });
const parte = await searchRead("x_aba_parte_diario", [], ["id"], { limit: 1, order: "id desc" });

if (!ot.length || !parte.length) {
  console.log("\n⚠ Sin OTs o sin partes: se omite el smoke test.");
} else {
  const asigId = await create(MODEL, {
    x_name: "SMOKE TEST — vinculo parte",
    x_ot_id: ot[0].id,
    x_fecha: "2000-01-01",
    x_fraccion: "1",
    x_estado: "tentativa",
  });
  await executeKw(MODEL, "write", [[asigId], { x_parte_id: parte[0].id }]);
  const [leida] = await searchRead(MODEL, [["id", "=", asigId]], ["x_parte_id"]);
  console.log(`\n✓ vínculo OK — asignación ${asigId} → parte ${JSON.stringify(leida.x_parte_id)}`);
  await executeKw(MODEL, "unlink", [[asigId]]);
  console.log("✓ limpieza OK");
}

console.log("\n✅ x_parte_id listo.");
