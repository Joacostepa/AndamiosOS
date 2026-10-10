// Vincula Legajos (`personal`) con los empleados de Odoo (`hr.employee`) y trae de Odoo lo
// que Odoo tiene mejor: el celular, si está activo y la tarea (andamista / chofer).
// Hoja del día, docs/equipos-del-dia/modulo.md §14 "Vínculos que faltan" (1).
//
// POR QUÉ: el parte de Odoo pide el puntero como hr.employee (x_puntero_id), la asistencia
// de Juan Pablo (x_parte_diario) habla de hr.employee, y los celulares están cargados en
// Odoo (24 de 30) y no en Legajos (0). Sin este vínculo, "Cerrar jornada" no puede proponer
// el puntero, las ART de la asistencia no aparecen solas y nadie tiene celular.
//
// CÓMO CRUZA: por DNI (identification_id, sólo dígitos) y, si no, por nombre normalizado
// (apellido + nombres, sin tildes ni mayúsculas, en cualquier orden). Lista los que no
// cruzan para arreglarlos a mano en Legajos. Un solo sentido: de Odoo a Supabase; en Odoo
// NO escribe nada.
//
// SIMULACRO POR DEFECTO: muestra lo que haría. Para escribir, --aplicar.
//
//   node --env-file=.env.local scripts/hoja-dia-vincular-personal.mjs
//   node --env-file=.env.local scripts/hoja-dia-vincular-personal.mjs --aplicar
//
// Requiere la migración 20261011000001_hoja_del_dia.sql aplicada (odoo_employee_id, odoo_tarea).

import { createClient } from "@supabase/supabase-js";
import { searchRead } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
const dni = (s) => String(s ?? "").replace(/\D/g, "") || null;

const [empleados, personal] = await Promise.all([
  searchRead("hr.employee", ["|", ["active", "=", true], ["active", "=", false]], ["name", "identification_id", "mobile_phone", "work_phone", "active", "x_tarea"]),
  db.from("personal").select("id, nombre, apellido, dni, telefono, activo, odoo_employee_id, odoo_tarea").then((r) => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  }),
]);

const porDni = new Map(empleados.filter((e) => dni(e.identification_id)).map((e) => [dni(e.identification_id), e]));
const porNombre = new Map();
for (const e of empleados) porNombre.set(norm(e.name.replace(",", " ")), e);

const usados = new Set();
const cambios = [];
const sinCruce = [];
for (const p of personal) {
  let e = p.odoo_employee_id ? empleados.find((x) => x.id === Number(p.odoo_employee_id)) : null;
  let como = e ? "ya vinculado" : null;
  if (!e && dni(p.dni)) { e = porDni.get(dni(p.dni)); como = e ? "DNI" : null; }
  if (!e) { e = porNombre.get(norm(`${p.apellido} ${p.nombre}`)); como = e ? "nombre" : null; }
  if (!e || usados.has(e.id)) { sinCruce.push(p); continue; }
  usados.add(e.id);
  const celular = e.mobile_phone || e.work_phone || null;
  const v = {};
  if (Number(p.odoo_employee_id) !== e.id) v.odoo_employee_id = e.id;
  if (celular && celular !== p.telefono) v.telefono = celular;
  if (e.active !== p.activo) v.activo = e.active;
  if ((e.x_tarea || null) !== p.odoo_tarea) v.odoo_tarea = e.x_tarea || null;
  if (Object.keys(v).length) cambios.push({ p, e, como, v });
}

console.log(`Legajos: ${personal.length} · Odoo: ${empleados.length} · con cambios: ${cambios.length} · sin cruzar: ${sinCruce.length}\n`);
for (const { p, e, como, v } of cambios) {
  console.log(`  ${p.apellido}, ${p.nombre}  ←  ${e.name} (#${e.id}, por ${como})`);
  for (const [k, val] of Object.entries(v)) console.log(`      ${k}: ${p[k] ?? "—"} → ${val ?? "—"}`);
}
if (sinCruce.length) {
  console.log("\nNo cruzan (arreglar a mano en Legajos: DNI o nombre como en Odoo):");
  for (const p of sinCruce) console.log(`  · ${p.apellido}, ${p.nombre} (DNI ${p.dni ?? "—"})`);
}
const sobran = empleados.filter((e) => e.active && !usados.has(e.id));
if (sobran.length) {
  console.log("\nEn Odoo y no en Legajos:");
  for (const e of sobran) console.log(`  · ${e.name} (#${e.id}${e.x_tarea ? `, ${e.x_tarea}` : ""})`);
}

if (!APLICAR) {
  console.log("\nSIMULACRO: no se escribió nada. Para aplicar: --aplicar");
  process.exit(0);
}
let ok = 0;
for (const { p, v } of cambios) {
  const r = await db.from("personal").update(v).eq("id", p.id);
  if (r.error) console.error(`  ✗ ${p.apellido}: ${r.error.message}`);
  else ok++;
}
console.log(`\n✓ ${ok} de ${cambios.length} legajos actualizados`);
