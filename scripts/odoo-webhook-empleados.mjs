// Automatismo de Odoo que mantiene Legajos al día: cada vez que se crea un empleado
// (hr.employee) o cambia algo de lo que Legajos usa, Odoo llama a
// /api/odoo/webhooks/empleados y la app crea, actualiza o desactiva el legajo
// (src/lib/personal/sync-odoo.ts). Decisión del dueño, 10/10.
//
// MISMO MECANISMO que clientes, obras y OTs (scripts/odoo-create-obra-ot-automations.mjs) y
// que ventas-permiso (scripts/odoo-webhook-ventas-permiso.mjs): un base.automation
// on_create_or_write con un ir.actions.server anidado state=webhook que manda sólo el `id`,
// y el secreto ODOO_SYNC_SECRET en el query string.
//
// SÓLO DISPARA con los campos que Legajos usa (name, active, mobile_phone, work_phone,
// x_tarea, x_regimen_liquidacion, identification_id): un webhook suma ~1 s dentro del
// guardado y no tiene sentido pagarlo cuando cambian el talle de botines. Los campos filtran
// el write, no el create: un alta siempre avisa. Archivar es un write de `active`: avisa.
//
// SIMULACRO POR DEFECTO: muestra lo que crearía o cambiaría. Correr DESPUÉS del deploy (si
// no, Odoo llama a un 404 y el guardado del empleado espera en vano):
//   node --env-file=.env.local scripts/odoo-webhook-empleados.mjs              (simulacro)
//   node --env-file=.env.local scripts/odoo-webhook-empleados.mjs --aplicar
//   node --env-file=.env.local scripts/odoo-webhook-empleados.mjs --desactivar --aplicar (lo apaga)
//
// Idempotente: si ya existe, sólo se asegura de que esté activo, con esos campos y esa URL.

import { searchRead, create, executeKw } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");
const DESACTIVAR = process.argv.includes("--desactivar");
const NOMBRE = "AndamiosOS sync empleados";
const NOMBRE_ACCION = "Webhook AndamiosOS empleados";
const MODELO = "hr.employee";
const CAMPOS = ["name", "active", "mobile_phone", "work_phone", "x_tarea", "x_regimen_liquidacion", "identification_id"];
const SECRET = process.env.ODOO_SYNC_SECRET;
if (!SECRET) throw new Error("Falta ODOO_SYNC_SECRET");
const URL = `https://andamios-os.vercel.app/api/odoo/webhooks/empleados?secret=${SECRET}`;
const URL_VISIBLE = URL.replace(SECRET, "<ODOO_SYNC_SECRET>");

const [existente] = await searchRead(
  "base.automation",
  [["name", "=", NOMBRE], ["active", "in", [true, false]]],
  ["id", "active", "action_server_ids"],
);

if (DESACTIVAR) {
  if (!existente) console.log("No existía: nada que desactivar");
  else if (!APLICAR) console.log(`SIMULACRO: desactivaría "${NOMBRE}" (id=${existente.id}). Para hacerlo: --desactivar --aplicar`);
  else {
    await executeKw("base.automation", "write", [[existente.id], { active: false }]);
    console.log(`↩️  "${NOMBRE}" desactivado (id=${existente.id}). Legajos sigue al día con el control diario.`);
  }
  process.exit(0);
}

const [modelo] = await searchRead("ir.model", [["model", "=", MODELO]], ["id"]);
if (!modelo) throw new Error(`No existe el modelo ${MODELO}`);
const campos = await searchRead("ir.model.fields", [["model", "=", MODELO], ["name", "in", [...CAMPOS, "id"]]], ["id", "name"]);
const faltan = [...CAMPOS, "id"].filter((c) => !campos.some((f) => f.name === c));
if (faltan.length) throw new Error(`En ${MODELO} no existen: ${faltan.join(", ")}`);
const idDe = (n) => campos.find((f) => f.name === n).id;
const disparadores = CAMPOS.map(idDe);

if (existente) {
  console.log(`· "${NOMBRE}" ya existe (id=${existente.id}, ${existente.active ? "activo" : "INACTIVO"}).`);
  console.log(`  Se deja: activo, dispara con ${CAMPOS.join(", ")}; la acción ${existente.action_server_ids.join(", ")} apunta a ${URL_VISIBLE}`);
  if (APLICAR) {
    await executeKw("base.automation", "write", [[existente.id], { active: true, trigger: "on_create_or_write", trigger_field_ids: [[6, 0, disparadores]] }]);
    if (existente.action_server_ids.length) {
      await executeKw("ir.actions.server", "write", [existente.action_server_ids, { webhook_url: URL, webhook_field_ids: [[6, 0, [idDe("id")]]] }]);
    }
    console.log("✓ actualizado");
  }
} else {
  console.log(`Crearía en Odoo:`);
  console.log(`  base.automation "${NOMBRE}"`);
  console.log(`    modelo ${MODELO} (ir.model id=${modelo.id}) · trigger on_create_or_write · activo`);
  console.log(`    dispara al crear y al cambiar: ${CAMPOS.join(", ")}`);
  console.log(`  + ir.actions.server "${NOMBRE_ACCION}" (state=webhook, usage=base_automation)`);
  console.log(`    POST ${URL_VISIBLE}`);
  console.log(`    cuerpo: sólo el id del empleado`);
  if (APLICAR) {
    const id = await create("base.automation", {
      name: NOMBRE,
      model_id: modelo.id,
      trigger: "on_create_or_write",
      trigger_field_ids: [[6, 0, disparadores]],
      active: true,
      action_server_ids: [[0, 0, {
        name: NOMBRE_ACCION,
        state: "webhook",
        model_id: modelo.id,
        webhook_url: URL,
        webhook_field_ids: [[6, 0, [idDe("id")]]],
        usage: "base_automation",
      }]],
    });
    console.log(`✓ "${NOMBRE}" creado (id=${id})`);
  }
}

if (!APLICAR) console.log("\nSIMULACRO: no se escribió nada en Odoo. Para crearlo: --aplicar");
