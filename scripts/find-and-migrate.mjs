// Detecta el pooler IPv4 correcto (por región) y aplica la migración del espejo de clientes.
// Correr: SUPABASE_DB_PASSWORD="..." node scripts/find-and-migrate.mjs
import pg from "pg";

const REF = "hrlulbeepyvyjbzjfztu";
const PASS = process.env.SUPABASE_DB_PASSWORD;
if (!PASS) { console.error("Falta SUPABASE_DB_PASSWORD"); process.exit(1); }

// Regiones ordenadas por probabilidad (empresa argentina). Prefijos aws-0 y aws-1.
const REGIONS = ["sa-east-1", "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "eu-central-1", "eu-west-1", "eu-west-2", "ap-southeast-1", "ap-southeast-2",
  "ap-south-1", "ap-northeast-1", "ca-central-1", "eu-central-2"];
const PREFIXES = ["aws-0", "aws-1"];

const hosts = [];
for (const r of REGIONS) for (const p of PREFIXES) hosts.push(`${p}-${r}.pooler.supabase.com`);

const SQL = `
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS odoo_partner_id BIGINT,
  ADD COLUMN IF NOT EXISTS odoo_synced_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_odoo_partner_id
  ON clientes(odoo_partner_id) WHERE odoo_partner_id IS NOT NULL;
`;

async function tryHost(host) {
  const client = new pg.Client({
    host, port: 5432, user: `postgres.${REF}`, password: PASS, database: "postgres",
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 7000, query_timeout: 15000,
  });
  try {
    await client.connect();
    await client.query("select 1");
    return client; // conectado
  } catch (e) {
    await client.end().catch(() => {});
    return { error: e.message };
  }
}

let conn = null, host = null;
for (const h of hosts) {
  const res = await tryHost(h);
  if (res && typeof res.query === "function") { conn = res; host = h; console.log(`✓ conecta: ${h}`); break; }
  console.log(`  ✗ ${h}: ${res.error}`);
}

if (!conn) { console.error("\nNo conectó a ningún pooler. Necesito la connection string completa."); process.exit(3); }

try {
  await conn.query(SQL);
  const r = await conn.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name='clientes' AND column_name IN ('odoo_partner_id','odoo_synced_at') ORDER BY 1`);
  console.log("Columnas en clientes:", r.rows.map((x) => x.column_name).join(", "));
  console.log("✓ Migración aplicada");
  console.log(`HOST_OK=${host}`);
} finally {
  await conn.end().catch(() => {});
}
