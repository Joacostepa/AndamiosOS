// Aplica un archivo SQL de migración vía conexión directa a Postgres (pooler IPv4).
// Correr: node --env-file=.env.local scripts/apply-migration.mjs supabase/migrations/XXXX.sql
import pg from "pg";
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) { console.error("Uso: node scripts/apply-migration.mjs <archivo.sql>"); process.exit(1); }
const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) { console.error("Falta SUPABASE_DB_URL"); process.exit(1); }

const sql = readFileSync(file, "utf8");
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });

try {
  await client.connect();
  console.log(`Conectado ✓ — aplicando ${file}`);
  await client.query(sql);
  console.log("✓ Migración aplicada");
} catch (e) {
  console.error("✗ Error:", e.message);
  process.exit(2);
} finally {
  await client.end().catch(() => {});
}
