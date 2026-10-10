// Puesta al día de Legajos (`personal`) contra los empleados de Odoo (`hr.employee`): la
// MISMA pasada que el control diario (/api/cron/personal-odoo), con la misma lógica pura
// (src/lib/personal/sync-odoo.ts). Vincula, actualiza (teléfono sólo si falta, activo,
// tarea), CREA el legajo de los operarios que no tienen y desactiva los legajos cuyo
// empleado se borró de Odoo. Los administrativos no se crean; lo dudoso sólo se lista.
//
// Reemplaza a scripts/hoja-dia-vincular-personal.mjs (que sólo vinculaba y pisaba el
// teléfono): ese ya se aplicó el 10/10 y queda como historia.
//
// SIMULACRO POR DEFECTO (sólo lee Odoo y Supabase). Para escribir, --aplicar. Sólo escribe
// en Supabase; en Odoo, nada. No crea avisos en la campanita (eso lo hace el cron).
//
//   node --env-file=.env.local --experimental-strip-types scripts/personal-sincronizar-odoo.mjs
//   node --env-file=.env.local --experimental-strip-types scripts/personal-sincronizar-odoo.mjs --aplicar
//
// (--experimental-strip-types hace falta con Node < 22.18 para importar el .ts.)

import { createClient } from "@supabase/supabase-js";
import { searchRead } from "./odoo-rpc.mjs";
import { CAMPOS_EMPLEADO, CAMPOS_LEGAJO, pasada, describir } from "../src/lib/personal/sync-odoo.ts";

const APLICAR = process.argv.includes("--aplicar");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const [empleados, legajos] = await Promise.all([
  searchRead("hr.employee", [["active", "in", [true, false]]], [...CAMPOS_EMPLEADO], { order: "id" }),
  db.from("personal").select(CAMPOS_LEGAJO).then((r) => {
    if (r.error) throw new Error(r.error.message);
    return r.data.map((l) => ({ ...l, odoo_employee_id: l.odoo_employee_id == null ? null : Number(l.odoo_employee_id) }));
  }),
]);
if (empleados.length === 0) throw new Error("Odoo no devolvió empleados");

const { decisiones, huerfanos } = pasada(empleados, legajos);
const de = (t) => decisiones.filter((d) => d.tipo === t);
const crear = de("crear");
const actualizar = de("actualizar");
const dudosos = de("dudoso");
const ignorados = de("ignorar");

console.log(`Odoo: ${empleados.length} empleados (${empleados.filter((e) => e.active).length} activos) · Legajos: ${legajos.length}`);
console.log(`Al día: ${de("sin_cambios").length} · a actualizar: ${actualizar.length} · a crear: ${crear.length} · dudosos: ${dudosos.length} · sin legajo a propósito: ${ignorados.length} · empleado borrado: ${huerfanos.length}\n`);

const seccion = (titulo, lista) => {
  if (!lista.length) return;
  console.log(titulo);
  for (const l of lista) console.log(`  · ${l}`);
  console.log("");
};
seccion("CREAR (operarios activos sin legajo):", crear.map(describir));
seccion("ACTUALIZAR:", actualizar.map(describir));
seccion("DESACTIVAR (su empleado ya no existe en Odoo):", huerfanos.map((h) => `${h.legajo.apellido}, ${h.legajo.nombre} (#${h.legajo.odoo_employee_id})`));
seccion("DUDOSOS (no se tocan; arreglar a mano en Legajos u Odoo):", dudosos.map(describir));
seccion("SIN LEGAJO A PROPÓSITO:", ignorados.map(describir));
const vinculados = new Set(decisiones.filter((d) => "legajo" in d).map((d) => d.legajo.id));
seccion(
  "LEGAJOS SIN EMPLEADO EN ODOO (quedan como están):",
  legajos.filter((l) => !vinculados.has(l.id) && l.odoo_employee_id == null).map((l) => `${l.apellido}, ${l.nombre}${l.activo ? "" : " (de baja)"}`),
);

if (!APLICAR) {
  console.log("SIMULACRO: no se escribió nada. Para aplicar: --aplicar");
  process.exit(0);
}

let ok = 0;
let fallas = 0;
for (const d of actualizar) {
  const r = await db.from("personal").update(d.cambios).eq("id", d.legajo.id);
  if (r.error) { fallas++; console.error(`  ✗ ${d.empleado.name}: ${r.error.message}`); } else ok++;
}
for (const d of crear) {
  const r = await db.from("personal").insert({ ...d.fila, user_id: null });
  if (r.error) { fallas++; console.error(`  ✗ ${d.empleado.name}: ${r.error.message}`); } else ok++;
}
for (const h of huerfanos) {
  const r = await db.from("personal").update(h.cambios).eq("id", h.legajo.id);
  if (r.error) { fallas++; console.error(`  ✗ ${h.legajo.apellido}: ${r.error.message}`); } else ok++;
}
console.log(`\n✓ ${ok} cambios aplicados${fallas ? ` · ✗ ${fallas} fallaron` : ""}`);
