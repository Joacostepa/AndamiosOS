// Geocodifica a mano las obras que el cron de /api/operaciones/geocodificar todavía no
// resolvió: las de "Armado" (el Mapa de Obras) y las planificadas en el tablero desde hace 7
// días hasta dentro de 45 (la Hoja del día, sus tiempos de manejo y sus links de Maps).
//
// ES LA MISMA LÓGICA QUE EL CRON: importa src/lib/odoo/geocodificar-reglas.ts (por eso va
// con --experimental-strip-types) y le pasa Odoo por scripts/odoo-rpc.mjs. Qué ventas, qué
// consultas prueba y en qué orden, cómo valida el punto: todo sale de ahí.
//
// SIMULACRO POR DEFECTO. Consulta a Google (es lectura y se paga, ~0,03 USD cada una) y
// muestra qué escribiría, pero no escribe en Odoo. Con --aplicar escribe x_obra_lat,
// x_obra_lng y x_obra_geo_dir de las que se resolvieron.
//
// Correr:
//   node --env-file=.env.local --no-warnings --experimental-strip-types scripts/geocodificar-obras.mjs            (simulacro)
//   node --env-file=.env.local --no-warnings --experimental-strip-types scripts/geocodificar-obras.mjs --aplicar  (escribe)
// Opcional: --max=N (tope de consultas a Google; por defecto el del cron).

import { searchRead, read, write } from "./odoo-rpc.mjs";
import {
  MAX_CONSULTAS_POR_CORRIDA,
  buscadorPlaces,
  candidatas,
  consultasDe,
  geocodificarFilas,
  hoyAr,
} from "../src/lib/odoo/geocodificar-reglas.ts";

const APLICAR = process.argv.includes("--aplicar");
const maxArg = process.argv.find((a) => a.startsWith("--max="));
const MAX = maxArg ? Number(maxArg.slice(6)) : MAX_CONSULTAS_POR_CORRIDA;

const [param] = await searchRead("ir.config_parameter", [["key", "=", "google_address_autocomplete.google_places_api_key"]], ["value"]);
const key = typeof param?.value === "string" ? param.value : "";
if (!key) throw new Error("No hay API key de Google Places cargada en Odoo");

const hoy = hoyAr();
const escrituras = [];
const odoo = {
  searchRead: (m, d, f, o) => searchRead(m, d, f, o),
  read: (m, ids, f) => read(m, ids, f),
  write: async (m, ids, v) => {
    escrituras.push({ m, ids, v });
    if (APLICAR) await write(m, ids, v);
  },
};

console.log(`${APLICAR ? "APLICANDO" : "SIMULACRO (no escribe en Odoo)"} — hoy ${hoy}, tope ${MAX} consultas\n`);
const c = await candidatas(odoo, hoy);
console.log(`Ventas en Armado: ${c.armado} · planificadas en el tablero (con dirección): ${c.planificadas} · a geocodificar: ${c.lista.length}\n`);
for (const f of c.lista) {
  const fe = c.fechaDe.get(f.id);
  console.log(`  ${f.name}${fe ? ` (tablero ${fe})` : " (Armado)"}: ${f.x_direccion_obra} · ciudad: ${f.x_obra_ciudad || "—"}`);
  console.log(`      consultas: ${consultasDe(f.x_direccion_obra, f.x_obra_ciudad).join(" | ")}`);
}

const buscarGoogle = buscadorPlaces(key);
const buscar = async (texto) => {
  const p = await buscarGoogle(texto);
  console.log(`    Google «${texto}» → ${p ? `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}` : "sin resultado"}`);
  return p;
};
console.log("\nConsultando a Google…");
const r = await geocodificarFilas(c.lista, buscar, odoo, MAX);

console.log(`\nResueltas: ${r.geocodificadas} de ${r.candidatas} · consultas a Google: ${r.consultas}${r.truncado ? " · TRUNCADO por el tope" : ""}`);
for (const x of r.resueltas) console.log(`  OK ${x.venta}: ${x.lat.toFixed(6)}, ${x.lng.toFixed(6)}  ← «${x.consulta}»  https://www.google.com/maps?q=${x.lat},${x.lng}`);
if (r.sinResultado.length) {
  console.log(`\nSin resultado (${r.sinResultado.length}): corregir x_direccion_obra o cargar lat/lng a mano`);
  for (const x of r.sinResultado) console.log(`  ${x.venta}: ${x.probadas.join(" | ")}`);
}
if (r.fueraDeArgentina.length) {
  console.log(`\nPunto inválido (${r.fueraDeArgentina.length}):`);
  for (const x of r.fueraDeArgentina) console.log(`  ${x.venta} (${x.motivo}): ${x.lat.toFixed(4)}, ${x.lng.toFixed(4)} ← «${x.consulta}»`);
}
console.log(APLICAR ? `\nEscritas ${escrituras.length} ventas en Odoo.` : `\nSimulacro: se escribirían ${escrituras.length} ventas. Para escribir: --aplicar`);
