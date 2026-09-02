// El tipo de la OT deja de venir con "Armado" puesto.
//
// LA CAUSA, encontrada leyendo el código del cliente web de Odoo: la acción "Nueva Orden
// de Trabajo" (ir.actions.act_window 1178) trae en su contexto
//
//     'default_x_tipo': 'armado'
//
// y eso llena el campo de verdad — no es un efecto visual. Se confirmó de las dos puntas:
// `default_get` sin contexto devuelve {} y con el contexto de la acción devuelve
// {"x_tipo":"armado"}.
//
// POR QUÉ COSTÓ ENCONTRARLO: `ir.default` está vacío y el campo no tiene `default` propio,
// así que a primera vista no había ningún default. El valor viajaba en el contexto de la
// acción, que es un tercer lugar donde Odoo los guarda y el único que no se ve mirando
// el campo.
//
// LO QUE NO ERA: no es el widget. En web.assets_web.js, ni RadioField ni SelectionField
// tienen lógica de "si está vacío y es obligatorio, tomá la primera opción" — RadioField
// devuelve `record.data[name]` tal cual, y SelectionField devuelve "" cuando el valor es
// false. Un intento anterior cambió el desplegable por radio creyendo que el widget
// autoseleccionaba; no servía de nada y hacía el formulario cinco renglones más alto. Por
// eso este script además BORRA esas vistas.
//
// EL CAMPO SIGUE SIENDO OBLIGATORIO y eso no se toca: sin default, el registro nace con
// x_tipo vacío, el desplegable se muestra en blanco y guardar sin elegir lo marca en rojo.
// Que sea obligatorio y que venga precargado son dos cosas independientes.
//
// Idempotente. Por defecto NO escribe. Para aplicar, pasar --aplicar.
// Correr: node --env-file=.env.local scripts/odoo-tipo-sin-preseleccion.mjs [--aplicar]
import { version, authenticate, searchRead, executeKw, fieldsGet } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");
const MODEL = "x_aba_orden_trabajo";
const ACCION = "Nueva Orden de Trabajo";

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}`);
console.log(APLICAR ? "MODO: aplicar\n" : "MODO: corrida en seco (agregá --aplicar para escribir)\n");

// ── Guarda: el obligatorio tiene que seguir en pie ───────────────────────────
const campos = await fieldsGet(MODEL, ["type", "required"]);
if (campos.x_tipo?.type !== "selection") throw new Error("x_tipo dejó de ser un selection");
console.log(`x_tipo · obligatorio: ${campos.x_tipo.required ? "sí ✓" : "NO ✗ — revisar antes de seguir"}`);

// ── 1) Sacar el default del contexto de la acción ────────────────────────────

const acciones = await searchRead(
  "ir.actions.act_window",
  [["res_model", "=", MODEL], ["name", "=", ACCION]],
  ["name", "context"],
);
if (acciones.length === 0) throw new Error(`No encontré la acción "${ACCION}" sobre ${MODEL}`);

for (const a of acciones) {
  console.log(`\n[${a.id}] ${a.name}`);
  console.log(`  antes:   ${a.context}`);

  // Se saca SÓLO la clave del tipo. Las otras tres —la venta, el estado y qué formulario
  // abrir— son las que hacen que el botón funcione, así que se reescribe con cirugía y no
  // pisando el contexto entero.
  const nuevo = a.context
    .replace(/'default_x_tipo'\s*:\s*'[^']*'\s*,\s*/g, "")
    .replace(/,\s*'default_x_tipo'\s*:\s*'[^']*'/g, "");

  if (nuevo === a.context) {
    console.log("  · ya no tiene default_x_tipo, no hay nada que sacar");
    continue;
  }

  // Red de seguridad: si la reescritura se comió alguna de las otras claves, no se aplica.
  const imprescindibles = ["default_x_order_id", "default_x_estado", "form_view_ref"];
  const perdidas = imprescindibles.filter((k) => a.context.includes(k) && !nuevo.includes(k));
  if (perdidas.length > 0) {
    throw new Error(`La reescritura perdería ${perdidas.join(", ")} — abortado sin escribir`);
  }

  console.log(`  después: ${nuevo}`);
  if (APLICAR) {
    await executeKw("ir.actions.act_window", "write", [[a.id], { context: nuevo }]);
    console.log("  ✓ escrito");
  }
}

// ── 2) Borrar las vistas del radio, que se habían agregado por un diagnóstico
//        equivocado y no aportan nada ahora que la causa está resuelta ────────

const radios = await searchRead(
  "ir.ui.view",
  [["name", "like", "tipo-radio"], ["model", "=", MODEL]],
  ["name"],
);
for (const r of radios) {
  console.log(`\n${APLICAR ? "✓ borrando" : "· se borraría"} la vista ${r.name} (id=${r.id})`);
  if (APLICAR) await executeKw("ir.ui.view", "unlink", [[r.id]]);
}
if (radios.length === 0) console.log("\n· no quedan vistas del radio");

if (!APLICAR) {
  console.log("\nCorrida en seco terminada.");
  process.exit(0);
}

// ── 3) Verificación con el contexto REAL de la acción ────────────────────────

console.log("\nVerificación — default_get con el contexto de la acción:");
const [despues] = await searchRead("ir.actions.act_window", [["id", "in", acciones.map((a) => a.id)]], ["context"]);
// El contexto trae `active_id`, que sólo existe en la sesión del cliente: para poder
// evaluarlo acá se reemplaza por un número cualquiera. Lo que se está probando es si
// aparece x_tipo, no cuál venta queda.
const ctx = JSON.parse(
  despues.context.replace(/'/g, '"').replace(/\bactive_id\b/g, "1"),
);
const propuesto = await executeKw(MODEL, "default_get", [["x_tipo", "x_estado", "x_order_id"]], { context: ctx });
console.log(`  ${JSON.stringify(propuesto)}`);
console.log(`  x_tipo: ${"x_tipo" in propuesto ? `✗ SIGUE VINIENDO (${propuesto.x_tipo})` : "✓ vacío, nada preseleccionado"}`);
console.log(`  x_estado: ${propuesto.x_estado === "pendiente" ? "✓ sigue en pendiente" : "✗ se perdió"}`);

console.log("\n✅ Listo. El campo sigue siendo obligatorio: guardar sin elegir lo marca en rojo.");
