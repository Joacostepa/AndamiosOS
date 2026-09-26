// Campo x_asistente_ref en sale.order: la marca con la que el asistente comercial reconoce
// una orden que ya creó.
//
// EL PROBLEMA: guardar un presupuesto son varias llamadas a Odoo (crear la orden, la
// oportunidad, el adjunto, la nota). Si la función se corta después de crear la orden y antes
// de anotar su id, el reintento crearía otra orden igual. Con esta marca (el id de la acción
// del asistente) el reintento BUSCA primero y sigue desde donde quedó.
//
// Es un char técnico, no se muestra en ninguna vista. Idempotente.
//
// Correr:
//   node --env-file=.env.local scripts/odoo-asistente-ref.mjs            (sólo mira)
//   node --env-file=.env.local scripts/odoo-asistente-ref.mjs --aplicar  (crea el campo)

import { searchRead, create } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");
const [modelo] = await searchRead("ir.model", [["model", "=", "sale.order"]], ["id"]);
const ya = await searchRead("ir.model.fields", [["model", "=", "sale.order"], ["name", "=", "x_asistente_ref"]], ["id", "ttype"]);

if (ya.length) {
  console.log(`✓ sale.order.x_asistente_ref ya existe (id ${ya[0].id}, ${ya[0].ttype}). Nada que hacer.`);
  process.exit(0);
}
if (!APLICAR) {
  console.log("Falta sale.order.x_asistente_ref (char, «Ref. asistente comercial»). Correr con --aplicar para crearlo.");
  process.exit(0);
}
const id = await create("ir.model.fields", {
  model_id: modelo.id,
  name: "x_asistente_ref",
  field_description: "Ref. asistente comercial",
  ttype: "char",
  copied: false,
  index: true,
  help: "Id de la acción del Asistente Comercial de AndamiosOS que creó esta orden. Lo usa el asistente para no duplicar la orden si reintenta.",
});
console.log(`✓ creado sale.order.x_asistente_ref (id ${id})`);
