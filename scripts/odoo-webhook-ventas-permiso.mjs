// Automatismo de Odoo que abre el trámite de permiso cuando se confirma una venta con
// "Lleva permiso de implantación = Sí" (webhook → /api/odoo/webhooks/ventas-permiso).
//
// Correr (DESPUÉS de publicar la ruta, o Odoo apunta a un 404):
//   node --env-file=.env.local scripts/odoo-webhook-ventas-permiso.mjs
//   node --env-file=.env.local scripts/odoo-webhook-ventas-permiso.mjs --desactivar
//
// SÓLO DISPARA CON `state` Y `x_lleva_permiso`. La venta está al final de la cascada de
// calculados (parte → OT → venta → obra) y cada webhook suma ~1 s dentro del guardado:
// disparar con cualquier campo lo pagaría cada parte diario (ver
// scripts/odoo-webhooks-solo-campos-espejados.mjs). Los campos disparadores filtran el
// write, no el create: una venta creada ya confirmada también avisa.
//
// Idempotente: si ya existe, sólo se asegura de que esté activo y con esos dos campos.

import { searchRead, create, executeKw } from "./odoo-rpc.mjs";

const NOMBRE = "AndamiosOS permisos de venta";
const MODELO = "sale.order";
const CAMPOS = ["state", "x_lleva_permiso"];
const SECRET = process.env.ODOO_SYNC_SECRET;
if (!SECRET) throw new Error("Falta ODOO_SYNC_SECRET");
const URL = `https://andamios-os.vercel.app/api/odoo/webhooks/ventas-permiso?secret=${SECRET}`;

const [existente] = await searchRead("base.automation", [["name", "=", NOMBRE], ["active", "in", [true, false]]], ["id", "active"]);

if (process.argv.includes("--desactivar")) {
  if (existente) await executeKw("base.automation", "write", [[existente.id], { active: false }]);
  console.log(existente ? `↩️  "${NOMBRE}" desactivado` : "No existía");
  process.exit(0);
}

const [modelo] = await searchRead("ir.model", [["model", "=", MODELO]], ["id"]);
const campos = await searchRead("ir.model.fields", [["model", "=", MODELO], ["name", "in", [...CAMPOS, "id"]]], ["id", "name"]);
const faltan = [...CAMPOS, "id"].filter((c) => !campos.some((f) => f.name === c));
if (faltan.length) throw new Error(`En ${MODELO} no existen: ${faltan.join(", ")}`);
const idDe = (n) => campos.find((f) => f.name === n).id;
const disparadores = CAMPOS.map(idDe);

if (existente) {
  await executeKw("base.automation", "write", [[existente.id], { active: true, trigger_field_ids: [[6, 0, disparadores]] }]);
  console.log(`· "${NOMBRE}" ya existía (id=${existente.id}): activo, dispara con ${CAMPOS.join(", ")}`);
} else {
  const id = await create("base.automation", {
    name: NOMBRE,
    model_id: modelo.id,
    trigger: "on_create_or_write",
    trigger_field_ids: [[6, 0, disparadores]],
    active: true,
    action_server_ids: [[0, 0, {
      name: "Webhook AndamiosOS permisos de venta",
      state: "webhook",
      model_id: modelo.id,
      webhook_url: URL,
      webhook_field_ids: [[6, 0, [idDe("id")]]],
      usage: "base_automation",
    }]],
  });
  console.log(`✓ "${NOMBRE}" creado (id=${id}), dispara con ${CAMPOS.join(", ")}`);
}
