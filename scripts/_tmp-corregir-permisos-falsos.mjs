// Corrección del 09/10: permisos falsos y S02521 sin atar a su expediente.
//
//   node --env-file=.env.local scripts/_tmp-corregir-permisos-falsos.mjs
//
// 1. Odoo: S02128 (Corrientes 2810) y S02563 (Triunvirato 4528) vuelven a "presentado" y sin
//    fecha de permiso. El robot les había escrito "emitido" con nuestra nota de solicitud.
// 2. Supabase: saca el "permiso" falso de esos dos expedientes y del histórico 2026-31668214
//    (una nota de prórroga). Deja un evento en cada uno.
// 3. Supabase: ata el trámite de S02521 (Acuña de Figueroa 1312) a EX-2026-44242731, presentado a
//    mano el 02/10, para que la app no lo vuelva a presentar sola.
//
// Se puede correr más de una vez: cada paso mira el estado antes de escribir.

import { createClient } from "@supabase/supabase-js";
import { read, write } from "./odoo-rpc.mjs";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. Odoo
const VENTAS = [2128, 2563];
const antes = await read("sale.order", VENTAS, ["name", "x_tramite_estado", "x_permiso_fecha"]);
const aCorregir = antes.filter((v) => v.x_tramite_estado === "emitido").map((v) => v.id);
if (aCorregir.length) await write("sale.order", aCorregir, { x_tramite_estado: "presentado", x_permiso_fecha: false });
for (const v of await read("sale.order", VENTAS, ["name", "x_tramite_estado", "x_permiso_fecha"])) {
  console.log(`Odoo ${v.name}: ${v.x_tramite_estado}, fecha de permiso ${v.x_permiso_fecha || "vacía"}`);
}

// 2. Permisos falsos en Supabase
for (const numero of ["2026-41877012", "2026-42727922", "2026-31668214"]) {
  const { data: e, error } = await db.from("pvp_expedientes").select("id, permiso_notificacion, odoo_escrito").eq("numero", numero).single();
  if (error) throw new Error(`${numero}: ${error.message}`);
  if (!e.permiso_notificacion || /^RS-/i.test(e.permiso_notificacion)) {
    console.log(`EX-${numero}: nada que sacar (${e.permiso_notificacion ?? "sin permiso"})`);
    continue;
  }
  const cambios = { permiso_path: null, permiso_notificacion: null, permiso_emitido_el: null, permiso_vence: null };
  // Lo que el robot cree que escribió en Odoo, para que la ficha no siga diciendo "emitido".
  if (e.odoo_escrito?.x_tramite_estado === "emitido") {
    const { x_permiso_fecha, ...resto } = e.odoo_escrito;
    cambios.odoo_escrito = { ...resto, x_tramite_estado: "presentado" };
    cambios.odoo_escrito_at = new Date().toISOString();
  }
  const { error: e1 } = await db.from("pvp_expedientes").update(cambios).eq("id", e.id);
  if (e1) throw new Error(`${numero}: ${e1.message}`);
  await db.from("pvp_eventos").insert({
    expediente_id: e.id, tipo: "permiso_descargado", actor: "persona",
    detalle: `Corrección: ${e.permiso_notificacion} no era el permiso, era una nota nuestra. Se sacó: el expediente pasó a Guarda temporal sin resolución.`,
    datos: { notificacion_descartada: e.permiso_notificacion },
  });
  console.log(`EX-${numero}: se sacó ${e.permiso_notificacion}`);
}

// 3. S02521
const TRAMITE = "41b769b3-8672-4990-95cf-a6a77aa2640c";
const EXPEDIENTE = "b35a7909-d39c-43aa-900a-b992e3fa3ea4";
const { data: t } = await db.from("pvp_tramites").select("expediente_id, estado").eq("id", TRAMITE).single();
if (t.expediente_id) {
  console.log(`S02521: ya estaba atado (${t.expediente_id === EXPEDIENTE ? "a EX-2026-44242731" : `a otro: ${t.expediente_id}`})`);
} else {
  const { error: e2 } = await db.from("pvp_tramites")
    .update({ expediente_id: EXPEDIENTE, estado: "presentado", updated_at: new Date().toISOString() })
    .eq("id", TRAMITE).is("expediente_id", null);
  if (e2) throw new Error(`S02521: ${e2.message}`);
  await db.from("pvp_eventos").insert({
    tramite_id: TRAMITE, expediente_id: EXPEDIENTE, tipo: "presentacion_tad", actor: "persona",
    detalle: "Se ató al expediente EX-2026-44242731, presentado a mano el 02/10: la app no lo vuelve a presentar.",
  });
  console.log("S02521: atado a EX-2026-44242731 y en «presentado»");
}
