// Separa el COMPROMISO de la PLANIFICACIÓN — agrega x_fecha_comprometida en la OT.
//
// EL PROBLEMA QUE CORRIGE: al hacer que el tablero escribiera x_fecha_programada, esa
// fecha pasó a tener dos autores peleando por el mismo casillero. Comercial le promete
// el 22 al cliente, planificación la pone el 25, el tablero pisa el campo, y el
// compromiso desaparece: nadie puede ver que estamos tres días tarde sobre lo prometido.
//
// Son dos hechos distintos y necesitan dos campos:
//
//   x_fecha_comprometida → lo que Comercial le prometió al cliente.
//                          La escribe una persona. El tablero NO la toca nunca.
//   x_fecha_programada   → lo que dice el plan hoy. La escribe el tablero.
//                          Sigue siendo la que manda para las alertas de habilitación,
//                          que es lo correcto: hay que estar habilitado el día que se va.
//
// El desvío entre las dos es justamente el dato que hoy no existe.
//
// BACKFILL: las fechas originales de Comercial de las 20 OTs que el tablero ya pisó se
// recuperan del volcado de reversión que dejó odoo-backfill-fecha-programada.mjs. Sin
// eso estarían perdidas. Se pasan tal cual a x_fecha_comprometida.
//
// Idempotente. Por defecto NO escribe: mostrá qué haría. Para aplicar, pasar --aplicar.
// Correr: node --env-file=.env.local scripts/odoo-add-fecha-comprometida.mjs [--aplicar]
import { version, authenticate, searchRead, create, fieldsGet, executeKw } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");
const MODEL = "x_aba_orden_trabajo";
const CAMPO = "x_fecha_comprometida";

// Fechas que Comercial había cargado y que el tablero sobreescribió el 18/08/2026.
// Volcado por el propio backfill antes de escribir, justamente para no perderlas.
const ORIGINALES = [
  { id: 233, fecha: "2026-08-15" }, { id: 376, fecha: "2026-08-21" },
  { id: 397, fecha: "2026-08-19" }, { id: 401, fecha: "2026-08-15" },
  { id: 603, fecha: "2026-08-20" }, { id: 675, fecha: "2026-08-18" },
  { id: 692, fecha: "2026-08-21" }, { id: 696, fecha: "2026-08-15" },
  { id: 1004, fecha: "2026-08-19" }, { id: 1005, fecha: "2026-08-18" },
  { id: 1007, fecha: "2026-08-24" }, { id: 1011, fecha: "2026-08-19" },
  { id: 1012, fecha: "2026-08-21" }, { id: 1014, fecha: "2026-08-25" },
  { id: 1019, fecha: "2026-08-18" }, { id: 1021, fecha: "2026-08-20" },
  { id: 1022, fecha: "2026-08-24" }, { id: 1024, fecha: "2026-08-21" },
  { id: 1027, fecha: "2026-08-18" }, { id: 1036, fecha: "2026-08-24" },
];

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}\n`);

const [modelo] = await searchRead("ir.model", [["model", "=", MODEL]], ["id"]);
if (!modelo) throw new Error(`No existe el modelo ${MODEL}`);

const campos = await fieldsGet(MODEL, ["type"]);
if (CAMPO in campos) {
  console.log(`· ${MODEL}.${CAMPO} ya existe`);
} else if (APLICAR) {
  await create("ir.model.fields", {
    model_id: modelo.id,
    model: MODEL,
    state: "manual",
    name: CAMPO,
    field_description: "Fecha comprometida al cliente",
    ttype: "date",
  });
  console.log(`✓ ${MODEL}.${CAMPO} creado (date)`);
} else {
  console.log(`· ${MODEL}.${CAMPO} se crearía (date)`);
  console.log("\nCorrida en seco: sin el campo no se puede calcular el backfill.");
  console.log("Para aplicar: node --env-file=.env.local scripts/odoo-add-fecha-comprometida.mjs --aplicar");
  process.exit(0);
}

// ── Backfill ────────────────────────────────────────────────────────────────
//
// Dos orígenes, sin pisarse: las que el tablero sobreescribió (se recuperan del volcado)
// y las que todavía conservan la fecha de una persona, que son las que NO tienen firmeza.
const porOt = new Map(ORIGINALES.map((o) => [o.id, o.fecha]));

const sinFirmeza = await searchRead(
  MODEL,
  [["x_fecha_programada", "!=", false], ["x_fecha_firmeza", "=", false]],
  ["x_fecha_programada"],
);
for (const ot of sinFirmeza) {
  if (!porOt.has(ot.id)) porOt.set(ot.id, ot.x_fecha_programada);
}

const actuales = await searchRead(MODEL, [["id", "in", [...porOt.keys()]]], ["x_name", CAMPO]);
const cambios = actuales.filter((ot) => (ot[CAMPO] || false) !== porOt.get(ot.id));

console.log(`\nOTs con fecha de Comercial recuperable: ${porOt.size} · a escribir: ${cambios.length}`);
for (const ot of cambios) {
  const origen = ORIGINALES.some((o) => o.id === ot.id) ? "recuperada del volcado" : "conserva la original";
  console.log(`  OT ${ot.id}: ${porOt.get(ot.id)}  (${origen})`);
  console.log(`      ${String(ot.x_name).slice(0, 74)}`);
}

if (!APLICAR) {
  console.log("\nCorrida en seco.");
  process.exit(0);
}

for (const ot of cambios) {
  await executeKw(MODEL, "write", [[ot.id], { [CAMPO]: porOt.get(ot.id) }]);
}
console.log(`\n✅ ${cambios.length} OT(s) con su fecha comprometida.`);
