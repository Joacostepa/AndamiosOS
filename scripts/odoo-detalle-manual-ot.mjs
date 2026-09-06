// "Qué hay que ejecutar": que lo escriba Comercial y que la corrección no se pise.
//
// Correr con: node --env-file=.env.local scripts/odoo-detalle-manual-ot.mjs
//             node --env-file=.env.local scripts/odoo-detalle-manual-ot.mjs --revertir
//
// EL PROBLEMA, en dos mitades:
//
//  1. El campo sólo estaba en x_aba_orden_trabajo.form.comercial, que es una vista
//     `primary` suelta (no hereda de nada) y que abre únicamente la acción "Nueva Orden de
//     Trabajo". Al abrir una OT ya creada desde el menú, Odoo usa x_aba_orden_trabajo.form,
//     que no lo tiene. Se veía al crear y nunca más.
//
//  2. Aunque se viera, corregirlo no duraba. x_detalle_tecnico es un calculado ALMACENADO:
//     escribirlo a mano funciona, pero cualquier cambio en sus dependencias lo pisa
//     (medido contra la instancia real). Y una de esas dependencias es
//     x_order_id.x_estructura_actual, que LA APP ESCRIBE SOLA cada vez que un parte sella
//     lo que quedó armado. O sea: Comercial corregía, la cuadrilla terminaba, el parte
//     sellaba el as-built y la corrección desaparecía sin que nadie se enterara.
//
// LA FORMA: un campo de entrada, y el calculado que lo respeta.
//
//   x_detalle_manual   texto libre · lo que escribe Comercial. Es una ENTRADA: nada lo pisa
//   x_detalle_tecnico  calculado   · el manual si está escrito; si no, lo de siempre
//
// x_detalle_tecnico sigue siendo el único campo que leen la app, el tablero y el parte, así
// que del lado del código no hay que tocar una línea.
//
// POR QUÉ NO HAY UN TERCER CAMPO "SUGERIDO". El primer intento fue separar el texto
// automático en su propio calculado, para que el formulario pudiera mostrar la referencia
// arriba y el pedido abajo sin que la referencia cambiara al escribir. No funcionó: un
// calculado manual (Studio) creado por RPC NO ejecuta su compute —queda siempre vacío, aun
// forzando el recálculo con una server action— mientras que el mismo código andaba en el
// campo que ya existía. Probado y descartado. Acá arriba queda la referencia que sí importa:
// mientras el manual esté vacío, x_detalle_tecnico MUESTRA el texto automático, que es
// justo el momento en que hace falta leerlo.
//
// EL COMPUTE GRANDE NO SE TRANSCRIBE: se LEE de Odoo y se envuelve en el `if not val`. Una
// coma de diferencia en 70 líneas de parseo de propuestas no se detecta a ojo.

import { searchRead, executeKw } from "./odoo-rpc.mjs";

const REVERTIR = process.argv.includes("--revertir");
const MODELO = "x_aba_orden_trabajo";
const OBLIGATORIO = "x_tipo in ('armado','desarme','ampliacion','desmonte_parcial')";
const PLACEHOLDER =
  "Andamio de fachada, 12 m de frente x 9 m de altura, con bandeja de proteccion en PB y mediasombra.";

const campo = async (nombre) =>
  (await searchRead("ir.model.fields", [["model", "=", MODELO], ["name", "=", nombre]],
    ["name", "compute", "depends", "model_id"]))[0] ?? null;
const vista = async (nombre) =>
  (await searchRead("ir.ui.view", [["name", "=", nombre]], ["name", "arch_db"]))[0] ?? null;

/** Lo que hay hoy en la vista de alta: el campo calculado, suelto y editable. */
const CAMPO_SUELTO = `<field name="x_detalle_tecnico" nolabel="1" required="${OBLIGATORIO}" placeholder="${PLACEHOLDER}"/>`;

/** El bloque nuevo: arriba lo que se muestra, abajo lo que hay que escribir. */
const bloque = (conSeparador) => `${conSeparador ? '<separator string="Qué hay que ejecutar"/>\n  ' : ""}<div class="text-muted">
    <p>Lo primero que ve Operaciones al abrir la tarjeta en el tablero: la estructura concreta que la cuadrilla tiene que montar o bajar —sistema, medidas, altura, sectores—.</p>
    <p>En gris está lo que se muestra hoy. Mientras el campo de abajo esté vacío, sale de la propuesta y de las líneas del pedido, y muchas veces trae ruido de facturación —renovaciones, CAC— que a la cuadrilla no le sirve. Escribí abajo el detalle correcto: reemplaza a lo de arriba y ya nada lo pisa.</p>
  </div>
  <field name="x_detalle_tecnico" nolabel="1" readonly="1" class="text-muted"/>
  <field name="x_detalle_manual" nolabel="1" required="${OBLIGATORIO}" placeholder="${PLACEHOLDER}"/>`;

/** El bloque, tal como quedó escrito en cada vista (para poder sacarlo al revertir). */
const RE_BLOQUE = /<div class="text-muted">\s*<p>Lo primero que ve Operaciones[\s\S]*?<field name="x_detalle_manual"[^>]*\/>/;

/**
 * Envuelve el cómputo actual en `if not val:`, dejando el manual como primera opción.
 * Se apoya en la forma del original —`for rec in self:` / `val = ''` / … / la asignación
 * final— y aborta si no la encuentra, en vez de generar código a ciegas.
 */
function conManualPrimero(original) {
  const lineas = String(original).split("\n");
  if (lineas[0].trim() !== "for rec in self:") throw new Error(`El cómputo no arranca como esperaba: ${lineas[0]}`);
  if (lineas[1].trim() !== "val = ''") throw new Error(`La segunda línea no es val = '': ${lineas[1]}`);
  const fin = lineas.findLastIndex((l) => l.trim().startsWith("rec['x_detalle_tecnico']"));
  if (fin < 0) throw new Error("No encontré la asignación final del cómputo");
  return [
    "for rec in self:",
    "    val = (rec['x_detalle_manual'] or '').strip()",
    "    if not val:",
    ...lineas.slice(2, fin).map((l) => (l.trim() ? "    " + l : l)),
    "    rec['x_detalle_tecnico'] = val",
    "",
  ].join("\n");
}

/** Deshace lo de arriba: saca el `if not val` y desanida el cuerpo. */
function sinManual(actual) {
  const lineas = String(actual).split("\n");
  const i = lineas.findIndex((l) => l.trim() === "if not val:");
  const fin = lineas.findLastIndex((l) => l.trim().startsWith("rec['x_detalle_tecnico']"));
  if (i < 0 || fin < 0) throw new Error("El cómputo no tiene la forma que dejó este script");
  return [
    "for rec in self:",
    "    val = ''",
    ...lineas.slice(i + 1, fin).map((l) => (l.startsWith("    ") ? l.slice(4) : l)),
    "    rec['x_detalle_tecnico'] = val",
    "",
  ].join("\n");
}

const tecnico = await campo("x_detalle_tecnico");
if (!tecnico) throw new Error(`No existe ${MODELO}.x_detalle_tecnico`);
const manual = await campo("x_detalle_manual");
const aplicado = String(tecnico.compute ?? "").includes("x_detalle_manual");

// ── Vistas ───────────────────────────────────────────────────────────────────
// Se tocan SIEMPRE antes que los campos: Odoo se niega a borrar un campo que todavía
// aparece en una vista, y el mensaje sale en medio de una migración a medio aplicar.
async function ponerVistas() {
  const alta = await vista("x_aba_orden_trabajo.form.comercial");
  if (!alta) throw new Error("No existe la vista de alta");
  if (!String(alta.arch_db).includes("x_detalle_manual")) {
    if (!String(alta.arch_db).includes(CAMPO_SUELTO)) throw new Error("La vista de alta no está como esperaba");
    await executeKw("ir.ui.view", "write", [[alta.id], { arch_db: String(alta.arch_db).replace(CAMPO_SUELTO, bloque(false)) }]);
    console.log("✅ vista de alta: se muestra lo que se va a ver y se pide el detalle correcto");
  }
  const edicion = await vista("x_aba_orden_trabajo.form");
  if (!edicion) throw new Error("No existe la vista de edición");
  if (!String(edicion.arch_db).includes("x_detalle_manual")) {
    if (!String(edicion.arch_db).includes("  <notebook>")) throw new Error("No encontré dónde insertar en la vista de edición");
    await executeKw("ir.ui.view", "write", [[edicion.id], {
      arch_db: String(edicion.arch_db).replace("  <notebook>", `  ${bloque(true)}\n  <notebook>`),
    }]);
    console.log("✅ vista de edición: ahora se puede corregir una OT ya creada");
  }
}

async function sacarVistas() {
  const alta = await vista("x_aba_orden_trabajo.form.comercial");
  if (alta && RE_BLOQUE.test(String(alta.arch_db))) {
    await executeKw("ir.ui.view", "write", [[alta.id], { arch_db: String(alta.arch_db).replace(RE_BLOQUE, CAMPO_SUELTO) }]);
    console.log("↩️  vista de alta restaurada");
  }
  const edicion = await vista("x_aba_orden_trabajo.form");
  if (edicion && RE_BLOQUE.test(String(edicion.arch_db))) {
    const re = new RegExp(`\\s*<separator string="Qué hay que ejecutar"\\/>\\s*${RE_BLOQUE.source}`);
    await executeKw("ir.ui.view", "write", [[edicion.id], { arch_db: String(edicion.arch_db).replace(re, "") }]);
    console.log("↩️  vista de edición restaurada");
  }
}

if (REVERTIR) {
  if (!aplicado && !manual) { console.log("No está aplicado. No se toca nada."); process.exit(0); }
  await sacarVistas();
  if (aplicado) {
    await executeKw("ir.model.fields", "write", [[tecnico.id], {
      compute: sinManual(tecnico.compute),
      depends: String(tecnico.depends).split(",").filter((d) => d !== "x_detalle_manual").join(","),
    }]);
    console.log("↩️  x_detalle_tecnico volvió a su cómputo original");
  }
  if (manual) { await executeKw("ir.model.fields", "unlink", [[manual.id]]); console.log("↩️  x_detalle_manual borrado"); }
  process.exit(0);
}

if (aplicado) {
  console.log("El cómputo ya contempla x_detalle_manual. Sólo se revisan las vistas.");
  await ponerVistas();
  process.exit(0);
}

// Guarda: el cómputo que se va a envolver tiene que ser el original.
if (!String(tecnico.compute ?? "").includes("x_studio_propuesta")) {
  throw new Error("El cómputo de x_detalle_tecnico no menciona x_studio_propuesta: alguien lo editó. Revisalo a mano.");
}

if (!manual) {
  await executeKw("ir.model.fields", "create", [{
    model_id: tecnico.model_id[0],
    name: "x_detalle_manual",
    field_description: "Qué hay que ejecutar (lo escribe Comercial)",
    ttype: "text",
    store: true,
    copied: false,
  }]);
  console.log("✅ x_detalle_manual creado, vacío");
} else {
  console.log("· x_detalle_manual ya existía");
}

await executeKw("ir.model.fields", "write", [[tecnico.id], {
  compute: conManualPrimero(tecnico.compute),
  depends: `x_detalle_manual,${tecnico.depends}`,
}]);
console.log("✅ x_detalle_tecnico: el manual manda; vacío, sigue el cómputo de siempre");

await ponerVistas();
console.log("\nListo. x_detalle_tecnico sigue siendo el campo que lee la app: cero cambios de código.");
