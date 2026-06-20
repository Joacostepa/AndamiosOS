// Borrado de data seed vía service role (PostgREST DELETE).
// Conserva user_profiles y configuracion. Hace backup a /tmp antes de borrar.
// Correr: node --env-file=.env.local scripts/wipe-seed-data.mjs
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const supabase = createClient(url, key, { auth: { persistSession: false } });

const TABLES = [
  "actividades","alertas","audit_log","catalogo_piezas","clientes","computo_items",
  "computos","comunicaciones","cotizacion_imagenes","cotizacion_items","cotizaciones",
  "dispositivos_personal","documentos","fichadas","fletes_zona","gates_obra",
  "imagenes_referencia","incidentes","inspecciones","insumos","lista_precios",
  "mantenimientos","movimientos","obras","oportunidades","ordenes_trabajo","partes_obra",
  "periodos_alquiler","permisos_municipales","personal","planificacion_tareas",
  "proyecto_archivos","proyectos_tecnicos","qr_tokens","relevamientos","remito_items",
  "remitos","solicitud_extra_items","solicitudes_extra","stock","stock_por_obra","vehiculos",
];
const KEEP = ["user_profiles","configuracion"];

async function count(t) {
  const { count } = await supabase.from(t).select("*", { count: "exact", head: true });
  return count ?? 0;
}
async function dump(t) {
  const rows = []; let from = 0; const size = 1000;
  for (;;) {
    const { data, error } = await supabase.from(t).select("*").range(from, from + size - 1);
    if (error) throw new Error(`dump ${t}: ${error.message}`);
    rows.push(...data);
    if (data.length < size) break;
    from += size;
  }
  return rows;
}

console.log("== BACKUP previo ==");
const backup = {};
let totalBackup = 0;
for (const t of TABLES) {
  const rows = await dump(t);
  backup[t] = rows;
  totalBackup += rows.length;
  if (rows.length) console.log(`  ${t}: ${rows.length}`);
}
const path = `/tmp/andamios-pre-wipe-${Date.now()}.json`;
writeFileSync(path, JSON.stringify(backup, null, 2));
console.log(`Backup de ${totalBackup} filas → ${path}`);

console.log("\n== BORRADO (multi-pass, respeta FK) ==");
const remaining = new Set(TABLES.filter((t) => backup[t].length > 0));
let lastErrs = {};
for (let pass = 1; pass <= 15 && remaining.size > 0; pass++) {
  lastErrs = {};
  for (const t of [...remaining]) {
    const { error } = await supabase.from(t).delete().not("id", "is", null);
    if (!error) remaining.delete(t);
    else lastErrs[t] = error.message;
  }
  console.log(`  pass ${pass}: quedan ${remaining.size}${remaining.size ? " → " + [...remaining].join(", ") : ""}`);
}
if (remaining.size > 0) { console.error("\nNO se pudieron vaciar:", lastErrs); process.exit(1); }

console.log("\n== VERIFICACIÓN ==");
let ok = true;
for (const t of TABLES) {
  const c = await count(t);
  if (c !== 0) { console.error(`  ✗ ${t} aún tiene ${c} filas`); ok = false; }
}
console.log(`  tablas borradas: ${ok ? "✓ todas en 0" : "✗ revisar arriba"}`);
for (const t of KEEP) console.log(`  conservada ${t}: ${await count(t)} filas`);
console.log(ok ? "\n✓ Borrado completo." : "\n✗ Quedaron filas, revisar.");
