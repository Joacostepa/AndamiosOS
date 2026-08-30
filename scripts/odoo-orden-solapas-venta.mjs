// El orden de las solapas de la orden de alquiler, puesto a mano.
//
// EL PROBLEMA: cada solapa la agregó un módulo distinto —Odoo, Studio, y las dos de ABA—
// y el orden terminó siendo el del azar de las prioridades: la firma del cliente antes que
// la propuesta, y "Trabajo a ejecutar" al final del todo, que es justamente la que se
// completa al confirmar.
//
// EL ORDEN QUE SIGUE EL TRABAJO: qué se vende (líneas) → los datos de la orden → qué se
// propuso → qué hay que ejecutar → la firma → los números.
//
// POR QUÉ DOS VISTAS Y NO UNA: la solapa "Propuesta" la creó Studio sobre la vista de
// ALQUILER (rental.order.form), no sobre sale.order.form. Un xpath que la busque en la
// vista base no la encuentra y ROMPE el formulario entero. Así que el reordenamiento común
// va en la raíz —y se hereda a las dos— y el encaje de la propuesta va aparte, sólo en la
// de alquiler. Verificado: 298 de las últimas 300 ventas confirmadas son de alquiler.
//
// Se mueven nodos existentes con position="move", no se redefine nada: si mañana Odoo
// cambia el contenido de una solapa, sigue siendo la suya.
//
// Idempotente. Por defecto NO escribe: mostrá qué haría. Para aplicar, pasar --aplicar.
// Correr: node --env-file=.env.local scripts/odoo-orden-solapas-venta.mjs [--aplicar]
import { version, authenticate, searchRead, create, executeKw } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");
const VENTA = "sale.order";

/** Las solapas en el orden en que las tiene que ver Comercial, de arriba hacia abajo. */
const ORDEN_BASE = ["other_information", "aba_alcance", "customer_signature", "aba_rentabilidad"];

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}\n`);

/** Las solapas de una vista, en el orden en que se renderizan hoy. */
async function solapas(vistaId) {
  const vista = await executeKw(VENTA, "get_view", [vistaId, "form"]);
  const arch = String(vista.arch);
  const out = [];
  let i = 0;
  while ((i = arch.indexOf("<page", i)) >= 0) {
    const fin = arch.indexOf(">", i);
    const tag = arch.slice(i, fin + 1);
    out.push({
      name: (tag.match(/name="([^"]*)"/) || [])[1] ?? null,
      string: (tag.match(/string="([^"]*)"/) || [])[1] ?? "",
    });
    i = fin;
  }
  return out;
}

const [raiz] = await searchRead("ir.ui.view",
  [["model", "=", VENTA], ["name", "=", "sale.order.form"], ["mode", "=", "primary"]], ["id"]);
const [alquiler] = await searchRead("ir.ui.view",
  [["name", "=", "rental.order.form"], ["mode", "=", "primary"]], ["id"]);
if (!raiz || !alquiler) throw new Error("No se encontraron las vistas de venta / alquiler");

const antes = await solapas(alquiler.id);
console.log("solapas de la orden de alquiler, hoy:");
antes.forEach((p, n) => console.log(`  ${n + 1}. ${p.string}  (${p.name})`));

// El nombre de la solapa de Studio es un hash autogenerado y no se puede hardcodear: se
// resuelve por su etiqueta, que es la que sí eligió una persona.
const propuesta = antes.find((p) => p.string === "Propuesta");
if (!propuesta?.name) {
  throw new Error('No se encontró la solapa "Propuesta" en la vista de alquiler: revisar a mano');
}
console.log(`\n· la solapa "Propuesta" es ${propuesta.name} (nombre de Studio, resuelto por su etiqueta)`);

/** Encadena moves: cada solapa se corre detrás de la anterior. */
const mover = (secuencia) =>
  secuencia
    .slice(1)
    .map((name, i) => `  <xpath expr="//page[@name='${secuencia[i]}']" position="after">
    <xpath expr="//page[@name='${name}']" position="move"/>
  </xpath>`)
    .join("\n");

// La base arranca desde order_lines, que ya es la primera y no hace falta mover.
const VISTAS = [
  {
    nombre: "sale.order.form.aba.orden.solapas",
    inherit_id: raiz.id,
    priority: 40,
    arch_db: `<data>\n${mover(["order_lines", ...ORDEN_BASE])}\n</data>`,
    que: "orden común (se hereda a venta y alquiler)",
  },
  {
    // PRIORIDAD 210, Y NO 41: la solapa "Propuesta" la inyecta la personalización de
    // Studio, que hereda de esta misma vista con prioridad 160. Con una prioridad menor
    // esta vista se aplica ANTES de que la propuesta exista y Odoo rechaza el move con
    // "no puede ubicarse en la vista principal". Va detrás de todo lo de Studio, igual
    // que rental.order.form.aba.fin.obra (200).
    nombre: "rental.order.form.aba.orden.solapas",
    inherit_id: alquiler.id,
    priority: 210,
    arch_db: `<data>
  <xpath expr="//page[@name='other_information']" position="after">
    <xpath expr="//page[@name='${propuesta.name}']" position="move"/>
  </xpath>
</data>`,
    que: 'encaje de "Propuesta" (sólo existe en la vista de alquiler)',
  },
];

if (!APLICAR) {
  console.log("\nse crearían:");
  for (const v of VISTAS) {
    const [ya] = await searchRead("ir.ui.view", [["name", "=", v.nombre]], ["id"]);
    console.log(`  · ${v.nombre} — ${v.que}${ya ? " (YA EXISTE)" : ""}`);
  }
  console.log("\nquedaría: Líneas de la orden · Otra información · Propuesta · Trabajo a ejecutar · Firma del cliente · Rentabilidad / Costos");
  console.log("\nCorrida en seco. Para aplicar:");
  console.log("  node --env-file=.env.local scripts/odoo-orden-solapas-venta.mjs --aplicar");
  process.exit(0);
}

const creadas = [];
for (const v of VISTAS) {
  const [ya] = await searchRead("ir.ui.view", [["name", "=", v.nombre]], ["id"]);
  if (ya) { console.log(`· ${v.nombre} ya existe`); continue; }
  creadas.push(await create("ir.ui.view", {
    name: v.nombre, model: VENTA, inherit_id: v.inherit_id, mode: "extension",
    priority: v.priority, arch_db: v.arch_db,
  }));
  console.log(`✓ ${v.nombre} creada — ${v.que}`);
}

// ── Verificación: el formulario tiene que seguir renderizando ────────────────
//
// Un xpath que no encuentra su nodo no falla al guardar la vista: falla al ABRIR el
// formulario, y a esa altura la orden de alquiler no se puede usar. Si pasa, se borran las
// vistas que acabo de crear y todo vuelve a estar como estaba.
try {
  const despues = await solapas(alquiler.id);
  await executeKw(VENTA, "get_view", [false, "form"]);
  console.log("\nsolapas de la orden de alquiler, ahora:");
  despues.forEach((p, n) => console.log(`  ${n + 1}. ${p.string}`));

  const visibles = despues.map((p) => p.string).filter((s) => s !== "Quote Builder");
  const esperado = ["Order Lines", "Other Info", "Propuesta", "Trabajo a ejecutar", "Customer Signature", "Rentabilidad / Costos"];
  const bien = visibles.length === esperado.length && visibles.every((s, i) => s === esperado[i]);
  console.log(bien ? "\n✅ El orden quedó como se pidió." : "\n⚠ El orden no es el esperado: revisar arriba.");
} catch (e) {
  console.error(`\n✗ el formulario dejó de renderizar: ${e.message.slice(0, 300)}`);
  if (creadas.length) await executeKw("ir.ui.view", "unlink", [creadas]);
  console.error("↩ vistas revertidas. El formulario vuelve a estar como estaba.");
  process.exit(1);
}
