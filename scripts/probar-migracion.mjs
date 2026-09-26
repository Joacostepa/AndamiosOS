// Corre una migración dentro de BEGIN … ROLLBACK: muestra si falla sin dejar nada escrito.
//
// La base de producción es la única que hay (no hay staging) y apply-migration.mjs escribe
// de verdad. Esto permite ver el error de sintaxis o el choque con lo que ya existe antes de
// aplicarla. También la corre DOS veces seguidas: una migración que no es idempotente falla
// en la segunda vuelta, y es mejor enterarse acá que al re-aplicarla un día.
//
// Correr: node --env-file=.env.local scripts/probar-migracion.mjs supabase/migrations/XXXX.sql ["select …"]
// El segundo argumento (opcional) es una consulta para mirar el resultado antes del ROLLBACK.

import pg from "pg";
import { readFileSync } from "node:fs";

const [archivo, consulta] = process.argv.slice(2);
if (!archivo) { console.error("Uso: node scripts/probar-migracion.mjs <archivo.sql> [\"select …\"]"); process.exit(1); }
if (!process.env.SUPABASE_DB_URL) { console.error("Falta SUPABASE_DB_URL"); process.exit(1); }

const sql = readFileSync(archivo, "utf8");
const cliente = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });

await cliente.connect();
let ok = false;
try {
  await cliente.query("BEGIN");
  await cliente.query(sql);
  console.log("✓ primera vuelta");
  await cliente.query(sql);
  console.log("✓ segunda vuelta (idempotente)");
  if (consulta) console.table((await cliente.query(consulta)).rows);
  ok = true;
} catch (e) {
  console.error("✗", e.message);
} finally {
  await cliente.query("ROLLBACK").catch(() => {});
  await cliente.end().catch(() => {});
  console.log("ROLLBACK: no quedó nada escrito");
}
process.exit(ok ? 0 : 2);
