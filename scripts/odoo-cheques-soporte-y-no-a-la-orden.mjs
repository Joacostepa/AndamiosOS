// Soporte del cheque (Físico / E-cheq) y marca de "No a la orden" en l10n_latam.check.
//
// EL PROBLEMA: el módulo l10n_latam_check de Odoo 19 guarda número, banco, CUIT del
// emisor, fecha e importe — y nada más. No hay dónde decir si el cheque es de papel o un
// echeq, ni si es no a la orden. Como el dato hace falta igual, administración lo venía
// metiendo dentro del NÚMERO del cheque: al momento de escribir esto había 8 cheques
// llamados "00625701 - CHEQUE FISICO" o "00000452 no a la orden". Eso ensucia el número
// (que es el identificador real del cheque) y no se puede filtrar, agrupar ni bloquear.
//
// POR QUÉ SOPORTE ES SELECTION Y NO UN CHECKBOX: con un booleano "es físico", el falso no
// distingue "es echeq" de "todavía no lo cargaron", y los 477 cheques que ya existen
// quedarían todos del lado del falso. Con selection, vacío significa vacío.
//
// POR QUÉ NO ES required A NIVEL MODELO: hacerlo obligatorio en el modelo obliga a
// completar los 477 históricos antes de poder tocar nada. Va required en la VISTA de
// carga, que es donde importa: el que carga un cheque nuevo tiene que elegir, y el
// histórico queda vacío y se completa cuando se pueda.
//
// EL BLOQUEO DE "NO A LA ORDEN": el punto de la marca no es decorar la ficha, es que no
// se pueda endosar. El bloqueo va del lado del servidor (automation sobre account.payment)
// y sólo sobre out_third_party_checks, que es entregarle el cheque a un proveedor. NO se
// bloquea return_third_party_checks (devolvérselo a quien lo dio, típicamente un rechazo)
// ni la transferencia entre diarios (que es justamente depositarlo, lo que hay que hacer).
//
// Se eligió avisar con un error claro en vez de esconder los cheques del selector: un
// cheque que no aparece en la lista genera "¿por qué no está el cheque?"; un error que
// dice "es no a la orden, sólo se deposita" enseña por qué.
//
// Idempotente: se puede re-correr sin duplicar.
// Correr: node --env-file=.env.local scripts/odoo-cheques-soporte-y-no-a-la-orden.mjs
import { version, authenticate, searchRead, create, fieldsGet, executeKw } from "./odoo-rpc.mjs";

const MODEL = "l10n_latam.check";

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}\n`);

const [modelo] = await searchRead("ir.model", [["model", "=", MODEL]], ["id"]);
if (!modelo) throw new Error(`No existe el modelo ${MODEL} — ¿está instalado l10n_latam_check?`);

// ── 1. Campos ────────────────────────────────────────────────────────────────
const existentes = await fieldsGet(MODEL, ["type"]);

if ("x_soporte" in existentes) {
  console.log("· l10n_latam.check.x_soporte ya existe");
} else {
  await create("ir.model.fields", {
    model_id: modelo.id,
    model: MODEL,
    state: "manual",
    name: "x_soporte",
    field_description: "Soporte",
    ttype: "selection",
    help: "Físico: cheque de papel, hay que tenerlo. E-cheq: electrónico, viaja por el banco.",
    selection_ids: [
      [0, 0, { value: "fisico", name: "Físico", sequence: 10 }],
      [0, 0, { value: "echeq", name: "E-cheq", sequence: 20 }],
    ],
  });
  console.log("✓ l10n_latam.check.x_soporte creado (selection fisico/echeq)");
}

if ("x_no_a_la_orden" in existentes) {
  console.log("· l10n_latam.check.x_no_a_la_orden ya existe");
} else {
  await create("ir.model.fields", {
    model_id: modelo.id,
    model: MODEL,
    state: "manual",
    name: "x_no_a_la_orden",
    field_description: "No a la orden",
    ttype: "boolean",
    help: "No se puede endosar: el único destino posible es depositarlo en una cuenta propia.",
  });
  console.log("✓ l10n_latam.check.x_no_a_la_orden creado (boolean)");
}

// ── 2. Backfill: los cheques que traen el dato metido en el número ───────────
// Se limpia el número (que tiene que ser sólo el número) y se pasa el dato al campo.
const sucios = await searchRead(
  MODEL,
  ["|", ["name", "ilike", "fisico"], ["name", "ilike", "no a la orden"]],
  ["name", "x_soporte", "x_no_a_la_orden"],
  { limit: 200 },
);

if (!sucios.length) {
  console.log("\n· Backfill: no hay cheques con el dato escrito en el número");
} else {
  console.log(`\nBackfill — ${sucios.length} cheques con el dato en el número:`);
  for (const c of sucios) {
    const original = c.name || "";
    const esFisico = /f[ií]sico/i.test(original);
    const esNoALaOrden = /no a la orden/i.test(original);
    // Deja sólo el número: corta en el primer separador o palabra suelta.
    const limpio = (original.match(/^\s*([0-9]+)/) || [])[1];
    if (!limpio) {
      console.log(`  ⚠ "${original}" — no arranca con un número, se deja como está`);
      continue;
    }
    const vals = { name: limpio };
    if (esFisico && !c.x_soporte) vals.x_soporte = "fisico";
    if (esNoALaOrden && !c.x_no_a_la_orden) vals.x_no_a_la_orden = true;
    await executeKw(MODEL, "write", [[c.id], vals]);
    const marcas = [vals.x_soporte === "fisico" && "Físico", vals.x_no_a_la_orden && "No a la orden"]
      .filter(Boolean)
      .join(" + ");
    console.log(`  ✓ "${original}" → ${limpio}${marcas ? ` · ${marcas}` : ""}`);
  }
}

// ── 3. Vistas ────────────────────────────────────────────────────────────────
async function asegurarVista({ nombre, model, inheritXmlId, arch, priority = 20 }) {
  const [heredada] = await searchRead(
    "ir.ui.view",
    [["model", "=", model], ["id", "=", await idPorXmlId(inheritXmlId)]],
    ["id"],
  );
  if (!heredada) throw new Error(`No existe la vista base ${inheritXmlId}`);
  const [existente] = await searchRead("ir.ui.view", [["name", "=", nombre]], ["id"]);
  if (existente) {
    await executeKw("ir.ui.view", "write", [[existente.id], { arch, active: true }]);
    console.log(`· ${nombre} actualizada (id=${existente.id})`);
    return existente.id;
  }
  const id = await create("ir.ui.view", {
    name: nombre,
    model,
    inherit_id: heredada.id,
    mode: "extension",
    priority,
    arch,
  });
  console.log(`✓ ${nombre} creada (id=${id})`);
  return id;
}

async function idPorXmlId(xmlId) {
  const [modulo, nombre] = xmlId.split(".");
  const [d] = await searchRead(
    "ir.model.data",
    [["module", "=", modulo], ["name", "=", nombre], ["model", "=", "ir.ui.view"]],
    ["res_id"],
  );
  if (!d) throw new Error(`No existe el xml_id ${xmlId}`);
  return d.res_id;
}

// Badge rojo, sólo cuando está marcado: un cheque endosable no tiene que gritar nada.
const BADGE_NAO =
  `<field name="x_no_a_la_orden" widget="boolean_toggle"/>`;

// 3a. El punto de carga real: la lista editable dentro del pago. Acá el cheque se crea,
// así que acá va el required — es el "que te pida seleccionar" del pedido.
await asegurarVista({
  nombre: "Cheques — soporte y no a la orden en el pago",
  model: "account.payment",
  inheritXmlId: "l10n_latam_check.view_account_payment_form_inherited",
  arch: `<data>
    <xpath expr="//field[@name='l10n_latam_new_check_ids']/list/field[@name='payment_date']" position="before">
      <field name="x_soporte" required="1"/>
      ${BADGE_NAO}
    </xpath>
    <xpath expr="//field[@name='l10n_latam_move_check_ids']/list/field[@name='amount']" position="before">
      <field name="x_soporte" optional="show"/>
      <field name="x_no_a_la_orden" widget="boolean_toggle" readonly="1" optional="show"/>
    </xpath>
  </data>`,
});

// 3b. La ficha del cheque (sólo lectura: el módulo la define con edit="false").
await asegurarVista({
  nombre: "Cheques — soporte y no a la orden en la ficha",
  model: MODEL,
  inheritXmlId: "l10n_latam_check.l10n_latam_check_view_form",
  arch: `<data>
    <field name="payment_date" position="after">
      <field name="x_soporte"/>
    </field>
    <field name="issuer_vat" position="after">
      <field name="x_no_a_la_orden"/>
    </field>
  </data>`,
});

// 3c. El listado de cheques (terceros y propios comparten esta vista).
await asegurarVista({
  nombre: "Cheques — soporte y no a la orden en el listado",
  model: MODEL,
  inheritXmlId: "l10n_latam_check.view_account_own_check_tree",
  priority: 120, // después de la customización de Studio que ya toca esta vista
  arch: `<data>
    <field name="name" position="after">
      <field name="x_soporte" optional="show"/>
      <field name="x_no_a_la_orden" widget="boolean_toggle" readonly="1" optional="show"/>
    </field>
  </data>`,
});

// 3d. Filtros y agrupación.
await asegurarVista({
  nombre: "Cheques — filtros de soporte y no a la orden",
  model: MODEL,
  inheritXmlId: "l10n_latam_check.view_account_payment_search",
  arch: `<data>
    <filter name="payment_date" position="after">
      <separator/>
      <filter string="Físico" name="soporte_fisico" domain="[('x_soporte', '=', 'fisico')]"/>
      <filter string="E-cheq" name="soporte_echeq" domain="[('x_soporte', '=', 'echeq')]"/>
      <filter string="Sin soporte cargado" name="soporte_vacio" domain="[('x_soporte', '=', False)]"/>
      <separator/>
      <filter string="No a la orden" name="no_a_la_orden" domain="[('x_no_a_la_orden', '=', True)]"/>
    </filter>
    <filter name="groupby_partner" position="before">
      <filter string="Soporte" name="groupby_soporte" domain="[]" context="{'group_by': 'x_soporte'}"/>
    </filter>
  </data>`,
});

// ── 4. El bloqueo del endoso ─────────────────────────────────────────────────
// Sobre account.payment y no sobre el cheque: el endoso es un pago a proveedor con
// método out_third_party_checks. Dispara al agregar el cheque al pago (no al confirmarlo)
// para frenar en el momento en que se toma la decisión, no diez campos después.
const CODIGO = `
for pago in records:
    if pago.payment_method_code != 'out_third_party_checks':
        continue
    no_endosables = pago.l10n_latam_move_check_ids.filtered(lambda c: c.x_no_a_la_orden)
    if no_endosables:
        numeros = ', '.join(no_endosables.mapped('name'))
        raise UserError(
            "Estos cheques son NO A LA ORDEN y no se pueden endosar: %s.\\n\\n"
            "El único destino posible es depositarlos en una cuenta propia "
            "(Cheques de Terceros -> Check Transfer al diario del banco)." % numeros
        )
`.trim();

const NOMBRE_AUTO = "Cheques no a la orden — no se pueden endosar";
const [modeloPago] = await searchRead("ir.model", [["model", "=", "account.payment"]], ["id"]);
const [campoCheques] = await searchRead(
  "ir.model.fields",
  [["model", "=", "account.payment"], ["name", "=", "l10n_latam_move_check_ids"]],
  ["id"],
);

const [autoExistente] = await searchRead("base.automation", [["name", "=", NOMBRE_AUTO]], ["id", "action_server_ids"]);
if (autoExistente) {
  await executeKw("ir.actions.server", "write", [autoExistente.action_server_ids, { code: CODIGO }]);
  console.log(`\n· "${NOMBRE_AUTO}" ya existe (id=${autoExistente.id}) — código actualizado`);
} else {
  const autoId = await create("base.automation", {
    name: NOMBRE_AUTO,
    model_id: modeloPago.id,
    trigger: "on_create_or_write",
    trigger_field_ids: [[6, 0, [campoCheques.id]]],
    active: true,
    action_server_ids: [[0, 0, {
      name: NOMBRE_AUTO,
      state: "code",
      model_id: modeloPago.id,
      code: CODIGO,
      usage: "base_automation",
    }]],
  });
  console.log(`\n✓ "${NOMBRE_AUTO}" creada (id=${autoId})`);
}

// ── 5. Verificación ──────────────────────────────────────────────────────────
const campos = await fieldsGet(MODEL, ["string", "type", "selection"]);
console.log("\nCampos:");
console.log(`  x_soporte       ${campos.x_soporte.type} ${JSON.stringify(campos.x_soporte.selection)}`);
console.log(`  x_no_a_la_orden ${campos.x_no_a_la_orden.type}`);

const conSoporte = await executeKw(MODEL, "read_group", [[["x_soporte", "!=", false]], ["id"], ["x_soporte"]], { lazy: true });
const nao = await executeKw(MODEL, "search_count", [[["x_no_a_la_orden", "=", true]]]);
const total = await executeKw(MODEL, "search_count", [[]]);
console.log(`\nDatos: ${total} cheques`);
for (const g of conSoporte) console.log(`  ${g.x_soporte}: ${g.__count}`);
console.log(`  no a la orden: ${nao}`);

const quedanSucios = await executeKw(MODEL, "search_count", [
  ["|", ["name", "ilike", "fisico"], ["name", "ilike", "no a la orden"]],
]);
console.log(`  números todavía sucios: ${quedanSucios}`);

console.log("\n✅ Listo.");
