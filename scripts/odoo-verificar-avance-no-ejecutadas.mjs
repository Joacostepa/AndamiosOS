// Verificación READ-ONLY del conteo de avance de una obra (consultasDeAvance en
// src/lib/odoo/asignaciones.ts).
//
// Lo que hay que comprobar contra el Odoo real es que el dominio con path punteado
// —x_parte_id.x_estado— haga lo que se espera:
//   · TOMADAS: asignaciones sin parte + asignaciones con parte ejecutado.
//     Las que tienen parte NO EJECUTADO no cuentan: ese día no produjo trabajo y la
//     jornada tiene que volver a la bandeja.
//   · HECHAS: sólo las de parte ejecutado.
//
// El riesgo concreto es el OR: en Odoo una condición sobre un path punteado se resuelve
// como subconsulta y deja afuera las asignaciones con x_parte_id vacío, que son
// justamente las que más cuentan como tomadas. Acá se contrasta cada dominio contra el
// conteo crudo, que no puede mentir.
//
// Correr: node --env-file=.env.local scripts/odoo-verificar-avance-no-ejecutadas.mjs

import { authenticate, searchCount, searchRead, executeKw } from "./odoo-rpc.mjs";

await authenticate();

const DOM_TOMADAS = ["|", ["x_parte_id", "=", false], ["x_parte_id.x_estado", "!=", "no_ejecutado"]];
const DOM_HECHAS = [["x_parte_id", "!=", false], ["x_parte_id.x_estado", "!=", "no_ejecutado"]];

// ── 1. Totales, contados de las dos formas ───────────────────────────────────
const total = await searchCount("x_aba_asignacion", []);
const sinParte = await searchCount("x_aba_asignacion", [["x_parte_id", "=", false]]);
const conParte = await searchCount("x_aba_asignacion", [["x_parte_id", "!=", false]]);

const tomadas = await searchCount("x_aba_asignacion", DOM_TOMADAS);
const hechas = await searchCount("x_aba_asignacion", DOM_HECHAS);

// Los partes no ejecutados, contados desde el otro lado de la relación.
const partesNoEjec = await searchRead(
  "x_aba_parte_diario",
  [["x_estado", "=", "no_ejecutado"]],
  ["id", "x_orden_trabajo_id", "x_fecha", "x_motivo_no_ejec"],
);
const idsNoEjec = partesNoEjec.map((p) => p.id);
const asigNoEjec = idsNoEjec.length
  ? await searchCount("x_aba_asignacion", [["x_parte_id", "in", idsNoEjec]])
  : 0;

console.log("── Asignaciones ──");
console.log(`total                       ${total}`);
console.log(`  sin parte                 ${sinParte}`);
console.log(`  con parte                 ${conParte}`);
console.log(`    de ellas, no ejecutadas ${asigNoEjec}   (${partesNoEjec.length} partes no_ejecutado)`);
console.log("\n── Lo que devuelven los dominios nuevos ──");
console.log(`TOMADAS  ${tomadas}   esperado ${total - asigNoEjec}`);
console.log(`HECHAS   ${hechas}   esperado ${conParte - asigNoEjec}`);

const okTomadas = tomadas === total - asigNoEjec;
const okHechas = hechas === conParte - asigNoEjec;
console.log(`\n${okTomadas ? "✓" : "✗"} TOMADAS incluye las que no tienen parte (el OR funciona)`);
console.log(`${okHechas ? "✓" : "✗"} HECHAS excluye las no ejecutadas`);

// ── 1bis. El path punteado, probado con los datos que HAY ────────────────────
//
// Si todavía no hay ningún parte no_ejecutado cargado, el conteo de arriba prueba el OR
// pero no prueba que la condición punteada EXCLUYA. Se ejercita igual, invirtiéndola
// contra el estado que sí existe en la base: filtrar por "!= <estado real>" tiene que
// dar cero, y por "= <estado real>", todas.
const conParteFilas = await searchRead("x_aba_asignacion", [["x_parte_id", "!=", false]], ["x_parte_id"]);
const estadosDePartes = conParteFilas.length
  ? await executeKw("x_aba_parte_diario", "read", [conParteFilas.map((a) => a.x_parte_id[0]), ["x_estado"]])
  : [];
const porEstado = estadosDePartes.reduce((m, p) => m.set(p.x_estado, (m.get(p.x_estado) ?? 0) + 1), new Map());

console.log("\n── El path punteado, ejercitado con los partes que existen ──");
console.log(`partes vinculados por estado: ${[...porEstado].map(([e, n]) => `${e}=${n}`).join(", ") || "ninguno"}`);
let pathOk = true;
for (const [estado, n] of porEstado) {
  const igual = await searchCount("x_aba_asignacion", [["x_parte_id", "!=", false], ["x_parte_id.x_estado", "=", estado]]);
  const distinto = await searchCount("x_aba_asignacion", [["x_parte_id", "!=", false], ["x_parte_id.x_estado", "!=", estado]]);
  const ok = igual === n && distinto === conParte - n;
  if (!ok) pathOk = false;
  console.log(`${ok ? "✓" : "✗"} x_estado = "${estado}" → ${igual} (esperado ${n}) · != → ${distinto} (esperado ${conParte - n})`);
}
if (porEstado.size === 0) console.log("· sin partes vinculados: no hay con qué ejercitarlo");

// ── 2. Las OTs afectadas, una por una ────────────────────────────────────────
// Son las obras que hoy figuran con una jornada de menos por planificar.
if (asigNoEjec > 0) {
  const otIds = [...new Set(partesNoEjec.map((p) => p.x_orden_trabajo_id?.[0]).filter(Boolean))];
  const ots = await executeKw("x_aba_orden_trabajo", "read", [otIds, ["x_name", "x_estado", "x_duracion_est", "x_jornadas_num"]]);
  const porOt = new Map(ots.map((o) => [o.id, o]));

  const grupo = async (dominio) =>
    new Map(
      (await executeKw("x_aba_asignacion", "read_group", [dominio, ["x_ot_id"], ["x_ot_id"]], { lazy: false }))
        .map((g) => [g.x_ot_id?.[0], g.__count]),
    );
  const antes = await grupo([]);
  const despues = await grupo(DOM_TOMADAS);

  console.log("\n── Obras con jornadas no ejecutadas: qué cambia en la bandeja ──");
  for (const otId of otIds) {
    const ot = porOt.get(otId);
    const dur = Number(ot?.x_duracion_est);
    const jornadas = Number.isFinite(dur) && dur > 0 ? dur : Number(ot?.x_jornadas_num) || 1;
    const totales = Math.max(1, Math.ceil(jornadas));
    const a = antes.get(otId) ?? 0;
    const d = despues.get(otId) ?? 0;
    const motivos = partesNoEjec
      .filter((p) => p.x_orden_trabajo_id?.[0] === otId)
      .map((p) => `${p.x_fecha} ${p.x_motivo_no_ejec || "sin motivo"}`)
      .join(", ");
    console.log(
      `${ot?.x_name ?? otId} [${ot?.x_estado}] · ${totales} jornadas · ` +
        `pendientes ${totales - a} → ${totales - d}   (${motivos})`,
    );
  }
} else {
  console.log("\nNo hay ningún parte no_ejecutado cargado: el cambio no mueve ningún número hoy.");
}

const todoOk = okTomadas && okHechas && pathOk;
console.log(`\n${todoOk ? "✓ Dominios OK" : "✗ REVISAR: algún dominio no cuenta lo que debería"}`);
process.exit(todoOk ? 0 : 1);
