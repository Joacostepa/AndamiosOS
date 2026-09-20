// "Fin de obra estimado" deja de ser obligatorio en lo que no es una obra.
//
// EL PROBLEMA: confirmar cualquier orden de alquiler exigía la fecha de fin de obra, y son
// tres tipos de contrato. En "Simple" y "Alquiler Sin Montaje" no hay obra nuestra —se
// alquila el material y lo monta el cliente—, así que se le estaba pidiendo a Comercial
// que estimara el fin de una obra que no existe. Frenaba 85 cotizaciones abiertas.
//
// ES EL MISMO CORTE QUE YA TIENEN las otras dos validaciones de la confirmación: la
// programación de los trabajos (duración y personal) y la clasificación del trabajo. Las
// tres pertenecen al mismo criterio —lo que se le pide a una obra no se le pide a un
// alquiler— y tenerlas discrepando obligaría a recordar cuál aplica a qué.
//
// EL DATO SIGUE HACIENDO FALTA EN LAS OBRAS y por eso no se apaga la validación entera:
// x_fecha_fin_obra_estimada es lo que el Mapa de Obras de la app usa para saber hasta
// cuándo sigue armada cada obra (ver src/lib/odoo/mapa-obras.ts). Sin la fecha, una obra
// armada queda en el mapa sin horizonte.
//
// VAN LOS DOS LADOS, y hacen cosas distintas:
//
//   · la automatización BLOQUEA el botón Confirmar. Es la que se nota.
//   · el `required` de la vista no bloquea confirmar —confirmar es una llamada al
//     servidor sobre un registro ya guardado— pero sí impide GUARDAR. Sin tocarlo, una
//     orden Simple ya confirmada no se podría editar sin cargarle la fecha.
//
// OJO CON EL ESPACIO: el valor del campo de Studio es "Obra " y no "Obra". Sin el espacio
// la comparación da falso siempre y la validación se apagaría para TODOS, obras incluidas.
//
// Idempotente: se puede re-correr. Por defecto sólo mira.
//
// Correr:
//   node --env-file=.env.local scripts/odoo-fin-obra-solo-obra.mjs            (sólo mira)
//   node --env-file=.env.local scripts/odoo-fin-obra-solo-obra.mjs --aplicar  (escribe)
import { version, authenticate, searchRead, read, write, executeKw } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");
const MODEL = "sale.order";
const CAMPO = "x_fecha_fin_obra_estimada";
const VISTA = "rental.order.form.aba.fin.obra";
const AUTOMATIZACION = "ABA — Exigir Fin de obra estimado al confirmar";
const CONTRATO_OBRA = "Obra ";

// El campo del contrato tiene que estar EN LA VISTA para que el modificador lo pueda leer:
// un campo usado en un modificador y ausente del arch rompe el formulario entero al
// renderizar. Va acá dentro y no se confía en que otra vista lo declare, porque ésta
// hereda de rental.order.form, que es otro formulario que el de la orden de venta.
const ARCH = `<data>
  <xpath expr="/form//field[@name='x_studio_horario_entrega']" position="before">
    <field name="x_studio_tipo_de_contrato" invisible="1"/>
    <field name="${CAMPO}" required="state in ['sale','done'] and x_studio_tipo_de_contrato == '${CONTRATO_OBRA}'" decoration-danger="${CAMPO} and ${CAMPO} &lt; context_today().strftime('%Y-%m-%d')"/>
  </xpath>
</data>`;

// El filtro va en el `filtered` y TAMBIÉN en el dominio de la automatización. Con el
// dominio alcanzaría, pero el código es lo que produce el mensaje de error: si algún día
// alguien afloja el dominio, el raise seguiría acotado a las obras.
const CODIGO = `
faltan = records.filtered(lambda o: o.x_studio_tipo_de_contrato == '${CONTRATO_OBRA}' and not o.${CAMPO})
if faltan:
    raise UserError(
        'No se puede confirmar sin cargar el "Fin de obra estimado".\\n\\n'
        'Orden(es): %s\\n\\n'
        'Es una fecha tentativa de desarme, sirve para planificar stock y operaciones. '
        'Se puede corregir despues en cada renovacion.' % ', '.join(faltan.mapped('name'))
    )
`;

const DOMINIO = [
  ["state", "=", "sale"],
  ["is_rental_order", "=", true],
  [CAMPO, "=", false],
  ["x_studio_tipo_de_contrato", "=", CONTRATO_OBRA],
];

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}`);
console.log(APLICAR ? "MODO: aplicar\n" : "MODO: corrida en seco (agregá --aplicar para escribir)\n");

// ── Mirar ───────────────────────────────────────────────────────────────────

const [vista] = await searchRead("ir.ui.view", [["name", "=", VISTA]], ["id", "arch_db", "inherit_id"]);
if (!vista) throw new Error(`No existe la vista ${VISTA}`);
const vistaAlDia = vista.arch_db.includes("x_studio_tipo_de_contrato");
console.log(`1) Vista #${vista.id}: ${vistaAlDia ? "ya filtra por contrato" : "NO filtra — se actualiza"}`);

const [auto] = await searchRead("base.automation", [["name", "=", AUTOMATIZACION]],
  ["id", "filter_domain", "action_server_ids"]);
if (!auto) throw new Error(`No existe la automatización "${AUTOMATIZACION}"`);
const [accion] = await read("ir.actions.server", auto.action_server_ids, ["id", "code"]);
const autoAlDia = accion.code.includes("x_studio_tipo_de_contrato") &&
  (auto.filter_domain ?? "").includes("x_studio_tipo_de_contrato");
console.log(`2) Automatización #${auto.id}: ${autoAlDia ? "ya filtra por contrato" : "NO filtra — se actualiza"}`);
console.log(`   dominio actual: ${auto.filter_domain}`);

// A quién le cambia algo, antes de tocar nada.
const abiertas = await searchRead(MODEL, [["state", "in", ["draft", "sent"]], ["is_rental_order", "=", true]],
  ["x_studio_tipo_de_contrato", CAMPO], { limit: 4000 });
const cuenta = {};
for (const o of abiertas) {
  const t = o.x_studio_tipo_de_contrato === false ? "(sin tipo)" : o.x_studio_tipo_de_contrato;
  cuenta[t] ??= { total: 0, sinFecha: 0 };
  cuenta[t].total++;
  if (!o[CAMPO]) cuenta[t].sinFecha++;
}
console.log("\n3) Cotizaciones de alquiler abiertas, y cuántas frenan hoy por esta fecha:");
let destrabadas = 0;
for (const [t, d] of Object.entries(cuenta).sort((a, b) => b[1].total - a[1].total)) {
  const esObra = t === CONTRATO_OBRA;
  if (!esObra) destrabadas += d.sinFecha;
  console.log(`   ${t.padEnd(22)} ${String(d.total).padStart(5)} abiertas · ${String(d.sinFecha).padStart(5)} sin la fecha  ${esObra ? "→ siguen frenando" : "→ dejan de frenar"}`);
}
console.log(`\n   Destraba ${destrabadas} cotizaciones. Las obras siguen exigiéndola.`);

if (!APLICAR) {
  console.log("\nNo se escribió nada. Para aplicar: --aplicar");
  process.exit(0);
}

// ── Aplicar ─────────────────────────────────────────────────────────────────

await write("ir.ui.view", [vista.id], { arch_db: ARCH });
console.log(`\n✓ vista #${vista.id} actualizada`);

await write("ir.actions.server", [accion.id], { code: CODIGO });
await write("base.automation", [auto.id], { filter_domain: JSON.stringify(DOMINIO) });
console.log(`✓ automatización #${auto.id} actualizada (dominio y código)`);

// ── Verificar ───────────────────────────────────────────────────────────────

const [vDespues] = await read("ir.ui.view", [vista.id], ["arch_db"]);
const [aDespues] = await read("base.automation", [auto.id], ["filter_domain"]);
const [acDespues] = await read("ir.actions.server", [accion.id], ["code"]);
console.log("\nDESPUÉS:");
console.log(`  vista filtra por contrato:          ${vDespues.arch_db.includes("x_studio_tipo_de_contrato") ? "sí ✓" : "NO ✗"}`);
console.log(`  dominio filtra por contrato:        ${aDespues.filter_domain.includes("x_studio_tipo_de_contrato") ? "sí ✓" : "NO ✗"}`);
console.log(`  código filtra por contrato:         ${acDespues.code.includes(CONTRATO_OBRA) ? "sí ✓" : "NO ✗"}`);

// El formulario tiene que seguir renderizando: un modificador que menciona un campo
// ausente del arch no falla al guardar la vista, falla al abrir la orden.
//
// SE RENDERIZA EL PADRE DE ESTA VISTA Y NO EL FORM POR DEFECTO DE sale.order. Hay DOS
// vistas llamadas "rental.order.form" y la que importa es la `primary`
// (sale_renting.rental_order_primary_form_view), que es de la que cuelga ésta. Pedir el
// form genérico devuelve un arch donde este campo ni aparece: da OK sin haber mirado nada.
try {
  const vistas = await executeKw(MODEL, "get_views", [[[vista.inherit_id[0], "form"]]], {});
  const arch = vistas.views.form.arch;
  const ok = arch.includes(CAMPO) && arch.includes("x_studio_tipo_de_contrato");
  console.log(`  el formulario de alquiler renderiza: sí ✓ (${arch.length} chars)`);
  console.log(`  el campo y el contrato están en él:  ${ok ? "sí ✓" : "NO ✗ — el modificador no puede evaluarse"}`);
} catch (e) {
  console.log(`  el formulario de alquiler renderiza: NO ✗ — ${e.message}`);
  console.log("  ⚠ REVERTIR: la vista quedó rota, hay que volver al arch anterior.");
}

console.log("\n✅ Listo. Sólo las órdenes de obra necesitan el fin de obra estimado para confirmarse.");
