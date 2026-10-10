// Vincula las cuadrillas de Supabase (`cuadrillas`, uuid: el plantel base de Configuración
// de cuadrillas) con las de Odoo (`x_aba_cuadrilla`, int: las del tablero), y crea la
// Cuadrilla 5, que está en el tablero y falta en Supabase.
// Hoja del día, docs/equipos-del-dia/modulo.md §14 "Vínculos que faltan" (2).
//
// POR QUÉ: hoy el cruce se hace por nombre en cada consulta (cruzarCuadrillas). Con el
// campo `cuadrillas.odoo_cuadrilla_id` queda hecho una vez, y "Empezar con el plantel base"
// y la sugerencia de a cargo (el responsable) lo usan.
//
// CRUZA POR NOMBRE normalizado ("CUADRILLA 3" = "Cuadrilla 3"), sólo las activas de Odoo.
// En Odoo NO escribe nada.
//
// SIMULACRO POR DEFECTO. Para escribir, --aplicar.
//
//   node --env-file=.env.local scripts/hoja-dia-vincular-cuadrillas.mjs [--aplicar]
//
// Requiere la migración 20261011000001_hoja_del_dia.sql aplicada (odoo_cuadrilla_id).

import { createClient } from "@supabase/supabase-js";
import { searchRead } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const titulo = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase());

const odoo = await searchRead("x_aba_cuadrilla", [["x_activa", "=", true]], ["x_name", "x_tercerizada"], { order: "x_name" });
const r = await db.from("cuadrillas").select("id, nombre, orden, activo, odoo_cuadrilla_id");
if (r.error) throw new Error(r.error.message);
const supa = r.data;

const vincular = [];
const crear = [];
for (const o of odoo) {
  const s = supa.find((x) => Number(x.odoo_cuadrilla_id) === o.id) ?? supa.find((x) => norm(x.nombre) === norm(o.x_name));
  if (s && Number(s.odoo_cuadrilla_id) === o.id) { console.log(`  = ${s.nombre} ↔ ${o.x_name} (#${o.id}) ya vinculada`); continue; }
  if (s) { vincular.push({ s, o }); console.log(`  ~ ${s.nombre} ↔ ${o.x_name} (#${o.id})`); continue; }
  if (o.x_tercerizada) { console.log(`  · ${o.x_name} (#${o.id}) es tercerizada: no se crea en Supabase`); continue; }
  const numero = Number(/(\d+)/.exec(o.x_name)?.[1] ?? 99);
  crear.push({ o, nombre: titulo(o.x_name), orden: numero });
  console.log(`  + ${titulo(o.x_name)} ↔ ${o.x_name} (#${o.id}) se crea`);
}
const sueltas = supa.filter((s) => !odoo.some((o) => Number(s.odoo_cuadrilla_id) === o.id || norm(s.nombre) === norm(o.x_name)));
for (const s of sueltas) console.log(`  ? ${s.nombre}: no está en Odoo (activa)`);

if (!APLICAR) {
  console.log(`\nSIMULACRO: ${vincular.length} a vincular, ${crear.length} a crear. Para aplicar: --aplicar`);
  process.exit(0);
}
for (const { s, o } of vincular) {
  const u = await db.from("cuadrillas").update({ odoo_cuadrilla_id: o.id }).eq("id", s.id);
  console.log(u.error ? `  ✗ ${s.nombre}: ${u.error.message}` : `  ✓ ${s.nombre} vinculada`);
}
for (const c of crear) {
  const i = await db.from("cuadrillas").insert({ nombre: c.nombre, orden: c.orden, activo: true, odoo_cuadrilla_id: c.o.id });
  console.log(i.error ? `  ✗ ${c.nombre}: ${i.error.message}` : `  ✓ ${c.nombre} creada (sin plantel ni responsable: cargarlos en Configuración)`);
}
