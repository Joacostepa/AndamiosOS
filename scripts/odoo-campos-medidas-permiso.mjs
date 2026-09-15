// Medidas para el permiso de andamio en la venta (solapa "Trabajo a ejecutar" → "Qué se arma").
//
// Correr:  node --env-file=.env.local scripts/odoo-campos-medidas-permiso.mjs
//          node --env-file=.env.local scripts/odoo-campos-medidas-permiso.mjs --revertir
//
// POR QUÉ: el informe técnico y la encomienda del CPAU necesitan medidas, y la venta sólo
// tenía m² o metros lineales sueltos en las líneas. Decidido con JS (2026-09-15):
//
//   estructura (con o sin pantalla) → Base y Altura, obligatorias al confirmar si lleva permiso
//   sólo pantalla de protección      → metros lineales, traídos de la línea de pantalla, editables
//   cualquier otro tipo              → el permiso se pide por 200 m²
//
// "m² para el permiso" = base × altura · ml × 4 (pantalla: 3,00 m de alto + 1,30 m de bandeja,
// como se venía cargando en la encomienda) · 200.
//
// LOS METROS LINEALES son un calculado GUARDADO y EDITABLE (readonly=False): se completan
// solos con la cantidad de la línea "PANTALLA / BANDEJA DE PROTECCIÓN POR M/L", alguien los
// puede corregir, y si cambia la línea se vuelven a calcular.
//
// Idempotente. --revertir borra la vista y los cuatro campos (y sus valores).

import { searchRead, create, executeKw } from "./odoo-rpc.mjs";

const MODELO = "sale.order";
const VISTA = "sale.order.form.aba.medidas.permiso";
const REVERTIR = process.argv.includes("--revertir");

const [modelo] = await searchRead("ir.model", [["model", "=", MODELO]], ["id"]);
if (!modelo) throw new Error(`No existe ${MODELO}`);

const CAMPOS = [
  { name: "x_permiso_base", ttype: "float", field_description: "Base (m)", help: "Largo de la estructura, para el permiso de andamio." },
  { name: "x_permiso_altura", ttype: "float", field_description: "Altura (m)", help: "Alto de la estructura, para el permiso de andamio." },
  {
    name: "x_permiso_metros_lineales",
    ttype: "float",
    field_description: "Metros lineales de pantalla",
    help: "Se completa con la línea de pantalla de la orden. Se puede corregir.",
    store: true,
    readonly: false,
    depends: "order_line.product_uom_qty,order_line.product_id",
    compute: [
      "for record in self:",
      "    total = 0.0",
      "    for line in record.order_line:",
      "        if line.product_id and 'PANTALLA / BANDEJA' in (line.product_id.name or ''):",
      "            total += line.product_uom_qty",
      "    record['x_permiso_metros_lineales'] = total",
    ].join("\n"),
  },
  {
    name: "x_permiso_m2",
    ttype: "float",
    field_description: "m² para el permiso",
    help: "Estructura: base × altura. Pantalla: metros lineales × 4. Otro tipo: 200 m².",
    store: true,
    readonly: true,
    depends: "x_trabajo_obra,x_permiso_base,x_permiso_altura,x_permiso_metros_lineales",
    compute: [
      "for record in self:",
      "    tipo = record.x_trabajo_obra",
      "    if tipo in ('estructura_pantalla', 'estructura_sin_pantalla'):",
      "        m2 = (record.x_permiso_base or 0.0) * (record.x_permiso_altura or 0.0)",
      "    elif tipo == 'pantalla_proteccion':",
      "        m2 = (record.x_permiso_metros_lineales or 0.0) * 4",
      "    else:",
      "        m2 = 200.0",
      "    record['x_permiso_m2'] = m2",
    ].join("\n"),
  },
];

const ESTRUCTURA = "['estructura_pantalla','estructura_sin_pantalla']";
const exige = (tipos) => `x_exige_clasificacion and state in ('sale', 'done') and x_lleva_permiso == 'si' and x_trabajo_obra in ${tipos}`;
const ARCH = `<data>
  <xpath expr="//field[@name='x_permiso_modalidad']" position="after">
    <field name="x_permiso_base" invisible="x_lleva_permiso != 'si' or x_trabajo_obra not in ${ESTRUCTURA}" required="${exige(ESTRUCTURA)}"/>
    <field name="x_permiso_altura" invisible="x_lleva_permiso != 'si' or x_trabajo_obra not in ${ESTRUCTURA}" required="${exige(ESTRUCTURA)}"/>
    <field name="x_permiso_metros_lineales" invisible="x_lleva_permiso != 'si' or x_trabajo_obra != 'pantalla_proteccion'" required="${exige("['pantalla_proteccion']")}"/>
    <field name="x_permiso_m2" invisible="x_lleva_permiso != 'si'" readonly="1"/>
  </xpath>
</data>`;

const [vistaPrevia] = await searchRead("ir.ui.view", [["name", "=", VISTA]], ["id"]);

if (REVERTIR) {
  if (vistaPrevia) await executeKw("ir.ui.view", "unlink", [[vistaPrevia.id]]);
  const existentes = await searchRead("ir.model.fields", [["model", "=", MODELO], ["name", "in", CAMPOS.map((c) => c.name)]], ["id"]);
  if (existentes.length) await executeKw("ir.model.fields", "unlink", [existentes.map((c) => c.id)]);
  console.log(`↩️  vista ${vistaPrevia ? "borrada" : "no existía"} · ${existentes.length} campos borrados`);
  process.exit(0);
}

for (const c of CAMPOS) {
  const [previo] = await searchRead("ir.model.fields", [["model", "=", MODELO], ["name", "=", c.name]], ["id"]);
  const valores = { model_id: modelo.id, state: "manual", ...c };
  if (previo) {
    await executeKw("ir.model.fields", "write", [[previo.id], valores]);
    console.log(`· ${c.name} ya existía: actualizado`);
  } else {
    await create("ir.model.fields", valores);
    console.log(`✓ ${c.name} creado`);
  }
}

// Hereda del formulario base con prioridad alta, para aplicarse DESPUÉS de
// sale.order.form.aba.tipo.trabajo, que es la que agrega x_permiso_modalidad.
const [padre] = await searchRead("ir.ui.view", [["name", "=", "sale.order.form.aba.tipo.trabajo"]], ["inherit_id"]);
if (!padre) throw new Error("No existe la vista sale.order.form.aba.tipo.trabajo");
const vista = { name: VISTA, model: MODELO, type: "form", inherit_id: padre.inherit_id[0], priority: 99, arch_db: ARCH, active: true };
if (vistaPrevia) {
  await executeKw("ir.ui.view", "write", [[vistaPrevia.id], vista]);
  console.log(`· vista ${VISTA} actualizada`);
} else {
  await create("ir.ui.view", vista);
  console.log(`✓ vista ${VISTA} creada`);
}
