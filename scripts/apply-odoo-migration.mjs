// Aplica la migración del espejo de clientes (DDL) vía conexión directa a Postgres.
// Correr: SUPABASE_DB_URL="postgresql://..." node scripts/apply-odoo-migration.mjs
import pg from "pg";

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) { console.error("Falta SUPABASE_DB_URL"); process.exit(1); }

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

const SQL = `
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS odoo_partner_id BIGINT,
  ADD COLUMN IF NOT EXISTS odoo_synced_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_odoo_partner_id
  ON clientes(odoo_partner_id) WHERE odoo_partner_id IS NOT NULL;
`;

try {
  await client.connect();
  console.log("Conectado ✓");
  await client.query(SQL);
  const r = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'clientes' AND column_name IN ('odoo_partner_id','odoo_synced_at')
     ORDER BY column_name`,
  );
  console.log("Columnas en clientes:", r.rows.map((x) => x.column_name).join(", ") || "NINGUNA");
  console.log("✓ Migración aplicada");
} catch (e) {
  console.error("✗ Error:", e.message);
  process.exit(2);
} finally {
  await client.end().catch(() => {});
}
