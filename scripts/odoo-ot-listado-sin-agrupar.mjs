// El listado de Órdenes de Trabajo deja de venir agrupado por jornada.
//
// CÓMO ESTABA: la acción del menú (#1177) traía dos filtros puestos de fábrica —
// `search_default_activas` y `search_default_g_dia`—. El segundo activa el agrupamiento
// "Jornada" (group_by x_dia_prog), que es lo que partía la lista en un encabezado por
// fecha con su fila de subtotales. Sirve para mirar un día; estorba para buscar una OT,
// que es a lo que se entra la mayoría de las veces.
//
// QUÉ SE SACA Y QUÉ NO: se saca sólo el DEFAULT. El filtro "Jornada" sigue existiendo en
// el desplegable de agrupar, así que quien quiera la vista por día la enciende en un clic.
// Borrar el filtro además del default sería sacarle una herramienta a quien la usa para
// resolver una molestia de quien no.
//
// EL ORDEN. La vista de lista venía con `default_order="x_fecha_programada asc,
// x_fecha_gantt desc"`, y ese criterio hoy no ordena nada: 1008 de las 1079 OTs NO tienen
// fecha programada, así que mil filas caen en el mismo balde y adentro las desempata un
// campo de gantt que tampoco está cargado. Pasa a `create_date desc`: lo último que se
// cargó, arriba.
//
// POR QUÉ create_date Y NO id: dicen casi lo mismo —1053 OTs son de la importación de
// agosto y 26 de septiembre— pero create_date es el que se entiende leyendo la vista sin
// tener que saber que los ids son crecientes. Si algún día se importa un lote viejo con
// ids nuevos, create_date sigue contando la verdad.
//
// OJO: el `default_order` vive en la VISTA DE LISTA, que es compartida. Además del menú
// de Órdenes de Trabajo la usa como vista secundaria la acción "Programación de Órdenes de
// Trabajo" (#1179), que abre en gantt. Ahí el cambio también aplica, y es lo mismo que se
// quiere: una lista estable.
//
// Idempotente: se puede re-correr sin duplicar.
//
// Correr:
//   node --env-file=.env.local scripts/odoo-ot-listado-sin-agrupar.mjs            (sólo mira)
//   node --env-file=.env.local scripts/odoo-ot-listado-sin-agrupar.mjs --aplicar  (escribe)

import { version, authenticate, searchRead, write } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");
const MODEL = "x_aba_orden_trabajo";
const ACCION = "Órdenes de Trabajo";
const VISTA_LISTA = "x_aba_orden_trabajo.list";

const CONTEXT_NUEVO = "{'search_default_activas': 1}";
const ORDEN_VIEJO = 'default_order="x_fecha_programada asc, x_fecha_gantt desc"';
const ORDEN_NUEVO = 'default_order="create_date desc"';

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}\n`);

// ── Mirar ───────────────────────────────────────────────────────────────────

const [accion] = await searchRead(
  "ir.actions.act_window",
  [["res_model", "=", MODEL], ["name", "=", ACCION]],
  ["id", "name", "context"],
);
if (!accion) throw new Error(`No encontré la acción "${ACCION}" sobre ${MODEL}`);

const [lista] = await searchRead(
  "ir.ui.view",
  [["model", "=", MODEL], ["name", "=", VISTA_LISTA]],
  ["id", "arch_db"],
);
if (!lista) throw new Error(`No encontré la vista ${VISTA_LISTA}`);

const agrupaPorDia = accion.context.includes("search_default_g_dia");
const tieneOrdenViejo = lista.arch_db.includes(ORDEN_VIEJO);
const yaTieneOrdenNuevo = lista.arch_db.includes(ORDEN_NUEVO);

console.log(`Acción #${accion.id} "${accion.name}"`);
console.log(`  context actual: ${accion.context}`);
console.log(`  agrupa por jornada de fábrica: ${agrupaPorDia ? "SÍ — se saca" : "no (ya estaba sacado)"}`);
console.log(`\nVista #${lista.id} ${VISTA_LISTA}`);
console.log(
  `  orden actual: ${
    tieneOrdenViejo ? "x_fecha_programada asc, x_fecha_gantt desc — se cambia" :
    yaTieneOrdenNuevo ? "create_date desc (ya estaba cambiado)" :
    "OTRO — no se toca, ver abajo"
  }`,
);
if (!tieneOrdenViejo && !yaTieneOrdenNuevo) {
  const m = /default_order="([^"]*)"/.exec(lista.arch_db);
  console.log(`  ⚠ el default_order dice "${m?.[1] ?? "(ninguno)"}", que no es el que este script sabe cambiar.`);
  console.log("    Alguien lo editó a mano. Revisalo antes de seguir: no se va a pisar.");
}

// El dato que justifica el cambio de orden, recalculado cada vez: si algún día las OTs
// pasan a tener fecha programada, este número lo va a decir y habrá que repensarlo.
const total = (await searchRead(MODEL, [], ["id"], {})).length;
const sinFecha = (await searchRead(MODEL, [["x_fecha_programada", "=", false]], ["id"], {})).length;
console.log(`\nOTs sin fecha programada: ${sinFecha} de ${total} (${Math.round((sinFecha / total) * 100)}%)`);

if (!APLICAR) {
  console.log("\nNo se escribió nada. Para aplicar: --aplicar");
  process.exit(0);
}

// ── Aplicar ─────────────────────────────────────────────────────────────────

if (agrupaPorDia) {
  await write("ir.actions.act_window", [accion.id], { context: CONTEXT_NUEVO });
  console.log(`✓ acción #${accion.id}: context → ${CONTEXT_NUEVO}`);
} else {
  console.log("· la acción ya no agrupaba de fábrica, no se toca");
}

if (tieneOrdenViejo) {
  await write("ir.ui.view", [lista.id], {
    arch_db: lista.arch_db.replace(ORDEN_VIEJO, ORDEN_NUEVO),
  });
  console.log(`✓ vista #${lista.id}: ${ORDEN_NUEVO}`);
} else {
  console.log("· el default_order no era el esperado, no se pisa");
}

// ── Verificar ───────────────────────────────────────────────────────────────

const [accionDespues] = await searchRead("ir.actions.act_window", [["id", "=", accion.id]], ["context"]);
const [listaDespues] = await searchRead("ir.ui.view", [["id", "=", lista.id]], ["arch_db"]);
console.log("\nDESPUÉS:");
console.log(`  context: ${accionDespues.context}`);
console.log(`  orden:   ${/default_order="([^"]*)"/.exec(listaDespues.arch_db)?.[1] ?? "(ninguno)"}`);

// Las primeras filas tal como las va a devolver el listado ahora.
const muestra = await searchRead(
  MODEL,
  [["x_estado", "in", ["pendiente", "en_proceso"]]],
  ["x_name", "create_date"],
  { order: "create_date desc", limit: 5 },
);
console.log("\nPrimeras filas del listado (filtro Activas, orden nuevo):");
for (const o of muestra) console.log(`  ${o.create_date}  ${(o.x_name ?? "").slice(0, 62)}`);

console.log("\n✅ Listo. Refrescá la pestaña de Odoo (F5) para ver el cambio: el contexto de la acción se cachea en el navegador.");
