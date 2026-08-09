// Actualiza por índice CAC los precios del cotizador hogareño y el mínimo operativo.
//
// Uso:
//   node scripts/actualizar-precios-cac.mjs 15.3           → simulación (dry-run)
//   node scripts/actualizar-precios-cac.mjs 15.3 --aplicar → escribe en la base
//
// Toca sólo:
//   - lista_precios donde unidad_cotizacion = 'hogareno'  (51 filas)
//   - configuracion.minimo_hogareno
// NO toca fletes_zona: el flete es costo de logística propia, no sigue al CAC.
// Si querés ajustarlo también, pasá --fletes.
//
// Redondeo: precios al múltiplo de $500 más cercano, mínimo operativo al de $1.000.
// Motivo: son precios de cara al cliente final; $14.995 es ruido.
import pg from "pg";

const pct = Number(String(process.argv[2] ?? "").replace(",", "."));
const aplicar = process.argv.includes("--aplicar");
const incluirFletes = process.argv.includes("--fletes");

if (!Number.isFinite(pct)) {
  console.error("Falta el porcentaje. Ej: node scripts/actualizar-precios-cac.mjs 15.3");
  process.exit(1);
}
if (pct < 0 || pct > 200) {
  console.error(`Porcentaje fuera de rango razonable: ${pct}%. Abortando por las dudas.`);
  process.exit(1);
}

const factor = 1 + pct / 100;
const redondear = (n, a) => Math.round((n * factor) / a) * a;

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

const fmt = (n) => "$" + Number(n).toLocaleString("es-AR");

await client.connect();
await client.query("BEGIN");

try {
  // ---- Precios del cotizador ----
  const { rows: precios } = await client.query(
    `SELECT id, producto, fraccion_dias, precio FROM lista_precios
      WHERE unidad_cotizacion = 'hogareno' ORDER BY producto, fraccion_dias`
  );

  console.log(`\n=== PRECIOS HOGAREÑO — CAC +${pct}% (${precios.length} filas) ===`);
  const tabla = [];
  for (const p of precios) {
    const viejo = Number(p.precio);
    const nuevo = redondear(viejo, 500);
    tabla.push({
      producto: p.producto.slice(0, 28),
      dias: p.fraccion_dias,
      actual: fmt(viejo),
      nuevo: fmt(nuevo),
      dif: fmt(nuevo - viejo),
    });
    if (aplicar) {
      await client.query(
        "UPDATE lista_precios SET precio = $1, vigente_desde = CURRENT_DATE WHERE id = $2",
        [nuevo, p.id]
      );
    }
  }
  console.table(tabla);

  // ---- Mínimo operativo ----
  const { rows: cfg } = await client.query(
    "SELECT valor FROM configuracion WHERE clave = 'minimo_hogareno'"
  );
  if (cfg.length) {
    const viejo = Number(cfg[0].valor);
    const nuevo = redondear(viejo, 1000);
    console.log(`=== MÍNIMO OPERATIVO ===`);
    console.log(`  ${fmt(viejo)}  →  ${fmt(nuevo)}   (${fmt(nuevo - viejo)})\n`);
    if (aplicar) {
      await client.query(
        "UPDATE configuracion SET valor = $1 WHERE clave = 'minimo_hogareno'",
        [String(nuevo)]
      );
    }
  } else {
    console.log("!! No se encontró configuracion.minimo_hogareno\n");
  }

  // ---- Fletes (opcional) ----
  if (incluirFletes) {
    const { rows: fl } = await client.query("SELECT id, zona, precio FROM fletes_zona");
    console.log(`=== FLETES — CAC +${pct}% (${fl.length} zonas) ===`);
    for (const f of fl) {
      if (aplicar) {
        await client.query("UPDATE fletes_zona SET precio = $1 WHERE id = $2", [
          redondear(Number(f.precio), 500),
          f.id,
        ]);
      }
    }
    console.log(`  ${fl.length} zonas ajustadas\n`);
  }

  if (aplicar) {
    await client.query("COMMIT");
    console.log("✅ APLICADO — cambios commiteados.");
  } else {
    await client.query("ROLLBACK");
    console.log("🔍 SIMULACIÓN — no se escribió nada. Agregá --aplicar para confirmar.");
  }
} catch (e) {
  await client.query("ROLLBACK");
  console.error("ROLLBACK —", e.message);
  process.exitCode = 1;
}

await client.end();
