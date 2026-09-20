// Tablero de planificación — Agrega 3 h, 5 h y 7 h a la escala de fracción de jornada.
//
// EL PROBLEMA: x_aba_asignacion.x_fraccion es un campo de SELECCIÓN con cinco valores
// (0,10 · 0,25 · 0,50 · 0,75 · 1). Operaciones planifica contra esa escala y le faltaban
// los tamaños intermedios: una cuadrilla con tres horas de trabajo había que cargarla
// como media jornada o como un cuarto, y la disponibilidad del día quedaba mal contada.
// Sin estos valores acá, la app manda "0.375" y Odoo rechaza el guardado.
//
// LOS OCTAVOS VAN EXACTOS. 3 h de una jornada de 8 son 0,375 y no 0,38: con el redondeo
// a dos decimales, 3 h + 5 h da 1,01 y el día se lee como sobreasignado cuando es una
// jornada perfecta. El valor del selection es el string que guarda la app, así que tiene
// que coincidir carácter por carácter con FRACCIONES en src/lib/tablero/fracciones.ts.
//
// ESTO NO TOCA A COMERCIAL. La duración que estima Comercial es otro campo, en otro
// modelo: x_aba_orden_trabajo.x_duracion_est, y queda exactamente como está. Este campo
// lo escribe solamente la app —en Odoo el modelo está en solo lectura para todos menos el
// usuario de integración— así que ampliarlo no agrega ni una opción a ningún formulario
// que Comercial use.
//
// Es ADITIVO: no modifica ninguna asignación cargada ni saca valores de la lista. Las
// jornadas que hoy dicen "media" siguen diciendo media.
//
// Idempotente: se puede re-correr, chequea cada valor antes de crearlo.
//
// Correr: node --env-file=.env.local scripts/odoo-fracciones-por-hora.mjs
import { version, authenticate, searchRead, create, fieldsGet } from "./odoo-rpc.mjs";

const MODEL = "x_aba_asignacion";
const CAMPO = "x_fraccion";

// La secuencia los intercala en la escala existente (0,10=10 · 0,25=20 · 0,50=30 ·
// 0,75=40 · 1=50), para que la lista de Odoo se lea de menor a mayor como la del tablero.
const NUEVOS = [
  { value: "0.375", name: "0,375 — 3 h", sequence: 25 },
  { value: "0.625", name: "0,625 — 5 h", sequence: 35 },
  { value: "0.875", name: "0,875 — 7 h", sequence: 45 },
];

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}\n`);

// ── 1) El campo tiene que existir y ser de selección ─────────────────────────
const info = await fieldsGet(MODEL, ["type", "selection"]);
if (!(CAMPO in info)) {
  throw new Error(`No existe ${MODEL}.${CAMPO}: correr antes odoo-create-asignacion-model.mjs`);
}
if (info[CAMPO].type !== "selection") {
  throw new Error(`${MODEL}.${CAMPO} es ${info[CAMPO].type}, no selection: algo cambió en Odoo`);
}

const [campo] = await searchRead(
  "ir.model.fields",
  [["model", "=", MODEL], ["name", "=", CAMPO]],
  ["id"],
);
if (!campo) throw new Error(`No se encontró ir.model.fields de ${MODEL}.${CAMPO}`);

console.log("1) Escala actual:");
for (const [value, name] of info[CAMPO].selection) console.log(`   · ${value} → ${name}`);

// ── 2) Los valores nuevos ────────────────────────────────────────────────────
console.log("\n2) Valores nuevos:");
for (const opcion of NUEVOS) {
  const existe = await searchRead(
    "ir.model.fields.selection",
    [["field_id", "=", campo.id], ["value", "=", opcion.value]],
    ["id"],
  );
  if (existe.length) {
    console.log(`   · ${opcion.value} ya existe`);
    continue;
  }
  await create("ir.model.fields.selection", { field_id: campo.id, ...opcion });
  console.log(`   ✓ ${opcion.value} agregado (${opcion.name})`);
}

// ── 3) Cómo quedó ────────────────────────────────────────────────────────────
const despues = await fieldsGet(MODEL, ["selection"]);
console.log("\n3) Escala final:");
for (const [value, name] of despues[CAMPO].selection) console.log(`   · ${value} → ${name}`);

// Nada de esto cambia registros: se cuentan para dejar constancia de que siguen iguales.
const total = await searchRead(MODEL, [], ["x_fraccion"], { limit: 5000 });
const cuenta = total.reduce((m, a) => ({ ...m, [a.x_fraccion]: (m[a.x_fraccion] ?? 0) + 1 }), {});
console.log(`\nAsignaciones cargadas: ${total.length} — ${JSON.stringify(cuenta)}`);
console.log("\n✅ Escala ampliada. Ninguna asignación fue modificada.");
