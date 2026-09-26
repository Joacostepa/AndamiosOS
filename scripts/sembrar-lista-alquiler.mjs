// Carga inicial de una lista de precios de alquiler desde la planilla de Excel.
//
// La pantalla Comercial → Parámetros de cotización → Lista de alquiler importa las listas
// que vengan. Este script existe para la PRIMERA (JUN26): sin ella el asistente no puede
// cotizar alquiler sin montaje desde el primer día, y la pantalla necesita a alguien con
// sesión para importar. Usa el mismo lector que la pantalla (src/lib/parametros-cotizacion).
//
// Escribe como sistema (autor vacío) y deja el cambio en el historial con el nombre del
// archivo. Si la lista ya existe no hace nada.
//
// Correr:
//   node --env-file=.env.local scripts/sembrar-lista-alquiler.mjs "<archivo.xlsx>" JUN26 "Lista de alquiler junio 2026"            (sólo muestra)
//   node --env-file=.env.local scripts/sembrar-lista-alquiler.mjs "<archivo.xlsx>" JUN26 "Lista de alquiler junio 2026" --aplicar

import pg from "pg";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { leerPrimeraHoja } from "../src/lib/parametros-cotizacion/xlsx.ts";
import { interpretarListaAlquiler } from "../src/lib/parametros-cotizacion/lista-alquiler.ts";

const [archivo, id, nombre] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const APLICAR = process.argv.includes("--aplicar");
if (!archivo || !id || !nombre) {
  console.error('Uso: node scripts/sembrar-lista-alquiler.mjs "<archivo.xlsx>" <ID> "<nombre>" [--aplicar]');
  process.exit(1);
}

const { hoja, filas } = leerPrimeraHoja(readFileSync(archivo));
const lista = interpretarListaAlquiler(filas);
console.log(`Hoja «${hoja}»: ${lista.piezas.length} piezas, vigencia ${lista.vigencia ?? "sin fecha"}, ${lista.descartadas.length} filas descartadas`);
for (const d of lista.descartadas) console.log(`  descartada fila ${d.fila} (${d.motivo}): ${d.contenido}`);

if (!APLICAR) {
  console.table(lista.piezas.slice(0, 8));
  console.log("Simulación: no se escribió nada. Agregá --aplicar para cargarla.");
  process.exit(0);
}

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("BEGIN");
  const ya = await db.query("select 1 from lista_alquiler where id = $1", [id]);
  if (ya.rowCount) {
    console.log(`La lista ${id} ya existe: no se toca.`);
    await db.query("ROLLBACK");
    process.exit(0);
  }
  const hayVigente = (await db.query("select 1 from lista_alquiler where vigente")).rowCount > 0;
  await db.query(
    "insert into lista_alquiler (id, nombre, vigente_desde, vigente, origen, notas, autor_id) values ($1, $2, $3, $4, $5, $6, null)",
    [id, nombre, lista.vigencia, !hayVigente, `planilla: ${basename(archivo)}`, "Carga inicial"],
  );
  let orden = 0;
  for (const p of lista.piezas) {
    await db.query(
      "insert into lista_alquiler_piezas (lista_id, codigo, descripcion, precio, orden) values ($1, $2, $3, $4, $5)",
      [id, p.codigo, p.descripcion, p.precio, ++orden],
    );
  }
  await db.query(
    "insert into cotizacion_parametros_cambios (clave, antes, despues, motivo, autor_id) values ($1, $2, $3, $4, null)",
    [`lista:${id}`, null, { lista: id, piezas: lista.piezas.length, activada: !hayVigente, origen: basename(archivo) },
     `Carga inicial desde ${basename(archivo)}`],
  );
  await db.query("COMMIT");
  console.log(`✓ Lista ${id} cargada con ${lista.piezas.length} piezas${hayVigente ? " (no se activó: ya había una vigente)" : " y activada"}.`);
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  console.error("✗", e.message);
  process.exit(2);
} finally {
  await db.end();
}
