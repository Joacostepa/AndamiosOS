// El nombre de la OT deja de deducir la dirección y pasa a LEERLA.
//
// SUPERSEDE el compute que instaló odoo-direccion-en-nombre-ot.mjs. Aquel script tuvo que
// adivinar la dirección a partir de los contactos —contacto de entrega, calle, el único
// hijo `delivery` sin usar— porque no había ningún campo donde estuviera escrita. Ahora sí:
// `sale.order.x_direccion_obra`, que se carga con el autocompletado de Google Places.
//
// EL PROBLEMA QUE RESUELVE: la misma información vivía en dos lugares y ya discrepaban. La
// OT #1143 decía "…Camino de la Ribera Sur, Ingenier" en el nombre —cortado por el límite
// de 72— y "…Ingeniero Budge, Provincia de Buenos Aires." en el campo. El que trabaja
// dentro de Odoo leía la peor de las dos.
//
// QUÉ CAMBIA, exactamente una cosa: si la venta tiene `x_direccion_obra`, ésa gana. Toda la
// cadena de contactos queda intacta como respaldo para las ventas que no la tengan (después
// del backfill son pocas, pero el fallback evita que una venta nueva sin cargar quede sin
// nombre). El formato "Tipo · Número · Cliente — Obra" NO se toca: la app no necesita
// ningún cambio y nadie tiene que reaprender a leer nada.
//
// POR QUÉ EL NOMBRE SIGUE LLEVANDO LA DIRECCIÓN. Lo ortodoxo en Odoo sería un nombre corto
// ("OT00123") y la dirección como columna. Acá no conviene: en esta operación la dirección
// ES el identificador —nadie dice "la OT 1143", dicen "la del puente sobre el Riachuelo"—
// y sacarla del nombre deja los desplegables y el buscador inservibles. Lo que cambia es
// que el nombre pasa a ser una ETIQUETA DERIVADA y no un original: el truncado a 72 sigue
// existiendo, pero ahora recorta una etiqueta y no el dato.
//
// EL `depends` suma `x_order_id.x_direccion_obra`, así que corregir la dirección en la
// orden renombra la OT sola. Sin eso el nombre viejo quedaría pegado (el mismo bug que ya
// tuvieron x_tecnico y el propio x_name).
//
// Correr:
//   node --env-file=.env.local scripts/odoo-nombre-ot-desde-campo-direccion.mjs            (simulacro)
//   node --env-file=.env.local scripts/odoo-nombre-ot-desde-campo-direccion.mjs --aplicar  (escribe)

import { authenticate, create, executeKw, searchRead } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");
const MODELO = "x_aba_orden_trabajo";
const CAMPO = "x_name";

const [campo] = await (await authenticate(), searchRead(
  "ir.model.fields",
  [["model", "=", MODELO], ["name", "=", CAMPO]],
  ["id", "compute", "depends"],
));
if (!campo) throw new Error(`No existe ${MODELO}.${CAMPO}`);

// ── El injerto ───────────────────────────────────────────────────────────────
// Se toca el compute vivo en vez de reescribirlo entero: así lo que ya funciona no se
// puede romper por una transcripción, y el diff es auditable de un vistazo.

const ANCLA = "        obra = obra[:72]";
const INJERTO = `        # LA DIRECCIÓN CARGADA GANA SOBRE TODO LO DEDUCIDO. Va acá abajo y no arriba a
        # propósito: así toda la cadena de contactos sigue corriendo y queda de respaldo
        # para las ventas que todavía no tienen el campo cargado.
        propia = ' '.join((o['x_direccion_obra'] or '').split())
        if propia:
            obra = propia
${ANCLA}`;

if (String(campo.compute).includes("x_direccion_obra")) {
  console.log("El compute YA lee x_direccion_obra. No hay nada que hacer.");
  process.exit(0);
}
if (!String(campo.compute).includes(ANCLA)) {
  throw new Error("No encontré el ancla en el compute vivo. Revisar a mano antes de tocar nada.");
}
const COMPUTE_NUEVO = String(campo.compute).replace(ANCLA, INJERTO);

const DEPENDS_NUEVO = [...new Set([
  ...String(campo.depends || "").split(",").map((d) => d.trim()).filter(Boolean),
  "x_order_id.x_direccion_obra",
])].join(",");

console.log("--- injerto ---");
console.log(INJERTO);
console.log(`\ndepends: +x_order_id.x_direccion_obra  (${DEPENDS_NUEVO.split(",").length} en total)`);

// ── Simulacro: a cuántas OTs les cambia el nombre ────────────────────────────

const principal = (t) => {
  const c = String(t || "").split(" · ");
  if (c.length < 3) return String(t || "").trim();
  const cola = c.slice(2).join(" · ");
  const i = cola.indexOf(" — ");
  return i === -1 ? cola : cola.slice(i + 3).trim();
};

const ots = await searchRead(MODELO, [], ["x_name", "x_direccion_obra"], { limit: 5000 });
const conCampo = ots.filter((o) => o.x_direccion_obra);
const cambian = conCampo.filter((o) => principal(o.x_name) !== String(o.x_direccion_obra).slice(0, 72));

console.log(`\nOTs: ${ots.length}`);
console.log(`  con x_direccion_obra cargada: ${conCampo.length}`);
console.log(`  a las que les cambia el nombre: ${cambian.length}`);
console.log("\n--- muestra ---");
cambian.slice(0, 12).forEach((o) => {
  console.log(`  #${o.id}`);
  console.log(`     antes: ${JSON.stringify(principal(o.x_name))}`);
  console.log(`     ahora: ${JSON.stringify(String(o.x_direccion_obra).slice(0, 72))}`);
});

if (!APLICAR) {
  console.log("\nNo se escribió nada. Para aplicar: --aplicar");
  process.exit(0);
}

// ── Aplicar ──────────────────────────────────────────────────────────────────

await executeKw("ir.model.fields", "write", [[campo.id], { compute: COMPUTE_NUEVO, depends: DEPENDS_NUEVO }]);
console.log("\n✓ compute y depends actualizados");

// Cambiar el compute NO recalcula lo guardado: Odoo sólo recalcula lo que tiene marcado
// como sucio. Marcarlo es código de servidor, de ahí la acción temporal.
const [modelo] = await searchRead("ir.model", [["model", "=", MODELO]], ["id"]);
const accion = await create("ir.actions.server", {
  name: "AndamiosOS — recálculo temporal de x_name",
  model_id: modelo.id,
  state: "code",
  code: `recs = env['${MODELO}'].search([])
env.add_to_compute(recs._fields['${CAMPO}'], recs)
env.flush_all()`,
});
try {
  await executeKw("ir.actions.server", "run", [[accion]], {
    context: { active_model: MODELO, active_id: 0, active_ids: [] },
  });
  console.log("✓ recálculo disparado");
} finally {
  await executeKw("ir.actions.server", "unlink", [[accion]]);
  console.log("✓ acción temporal borrada");
}

// ── Verificación ─────────────────────────────────────────────────────────────
const despues = await searchRead(MODELO, [], ["x_name", "x_direccion_obra"], { limit: 5000 });
const mal = despues.filter(
  (o) => o.x_direccion_obra && principal(o.x_name) !== String(o.x_direccion_obra).slice(0, 72),
);
console.log(`\nDESPUÉS — ${despues.length} OTs`);
console.log(`  nombre y campo coinciden: ${despues.filter((o) => o.x_direccion_obra).length - mal.length}`);
console.log(`  discrepan:                ${mal.length}`);
mal.slice(0, 8).forEach((o) =>
  console.log(`  ≠ #${o.id}\n      nombre: ${JSON.stringify(principal(o.x_name))}\n      campo:  ${JSON.stringify(o.x_direccion_obra)}`),
);
console.log(mal.length === 0 ? "\nListo: el recálculo llegó a todas." : "\nOJO: revisar las de arriba.");
