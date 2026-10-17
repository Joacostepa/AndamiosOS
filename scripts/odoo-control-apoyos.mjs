// Control periódico de los roles de la obra — SÓLO LEE (apoyo.md, sección 4).
//
// El tablero y el servidor no dejan escribir una obra con dos cuadrillas principales el
// mismo día, un apoyo sin principal, un apoyo en la misma cuadrilla que la principal o la
// misma cuadrilla dos veces de apoyo. Pero en Odoo las asignaciones se pueden editar a mano,
// y ahí nada lo frena. Esto lista esos casos para corregirlos: no toca nada.
//
// Las reglas son las MISMAS que valida la ruta de asignaciones (conflictosDeApoyo en
// src/lib/tablero/apoyo.ts, con tests), importadas tal cual: si el control contara distinto
// que el servidor, diría que está todo bien justo cuando no.
//
// Correr (desde hoy, o desde la fecha que se pase):
//   node --no-warnings --experimental-strip-types --env-file=.env.local scripts/odoo-control-apoyos.mjs [YYYY-MM-DD]
//
// Sale con código 1 si encuentra algo, para poder colgarlo de un cron que avise.
import { authenticate, searchRead } from "./odoo-rpc.mjs";
import { claveDia, conflictosDeApoyo, textoConflicto } from "../src/lib/tablero/apoyo.ts";

const desde = process.argv[2] ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) throw new Error(`Fecha inválida: ${desde} (YYYY-MM-DD)`);

await authenticate();
const filas = await searchRead(
  "x_aba_asignacion",
  [["x_fecha", ">=", desde], ["x_ot_id", "!=", false]],
  ["x_ot_id", "x_fecha", "x_cuadrilla_id", "x_apoyo"],
);
const m2o = (v) => (Array.isArray(v) ? v : null);
const roles = filas.map((f) => ({
  id: f.id,
  otId: m2o(f.x_ot_id)?.[0] ?? null,
  fecha: f.x_fecha || null,
  cuadrillaId: m2o(f.x_cuadrilla_id)?.[0] ?? null,
  apoyo: f.x_apoyo === true,
}));
const nombreCuadrilla = new Map(filas.map((f) => m2o(f.x_cuadrilla_id)).filter(Boolean));
const tituloOt = new Map(filas.map((f) => m2o(f.x_ot_id)).filter(Boolean));

// Todos los días, contra un "antes" vacío: así sale todo lo que está roto, no sólo lo nuevo.
const claves = new Set(roles.filter((r) => r.otId && r.fecha).map((r) => claveDia(r.otId, r.fecha)));
const conflictos = conflictosDeApoyo([], roles, claves).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.otId - b.otId);

console.log(`Asignaciones desde ${desde}: ${roles.length} (${roles.filter((r) => r.apoyo).length} de apoyo)\n`);
if (conflictos.length === 0) {
  console.log("✅ Ninguna obra con los roles rotos.");
  process.exit(0);
}
console.log(`⚠ ${conflictos.length} caso(s) para corregir en el tablero:`);
for (const c of conflictos) {
  const ids = roles.filter((r) => r.otId === c.otId && r.fecha === c.fecha).map((r) => `#${r.id}${r.apoyo ? " (apoyo)" : ""}`);
  console.log(`   · ${c.fecha} · ${tituloOt.get(c.otId) ?? `OT ${c.otId}`} · ${textoConflicto(c, (id) => nombreCuadrilla.get(id) ?? null)} [${ids.join(", ")}]`);
}
process.exit(1);
