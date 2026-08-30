// La duración y la dotación nacen en la ORDEN DE ALQUILER, no en la OT.
//
// EL PROBLEMA: x_duracion_est y x_personal_por_jornada son obligatorios al dar de alta la
// OT, pero el dato existe desde antes — al vender ya se sabe cuánto lleva armar y con
// cuánta gente. Hoy se pregunta tarde, dos veces (armado y desarme), y a quien menos lo
// sabe. Medido: de 1007 OTs, sólo 10 tienen duración estimada cargada.
//
// QUÉ HACE:
//   1. Cuatro campos nuevos en sale.order: duración y dotación de armado y de desarme.
//      El personal viene en 5, que es la cuadrilla estándar y lo que ya dice el texto de
//      ayuda del formulario de la OT.
//   2. Los siembra con lo que haya en las OTs existentes (506 ventas tienen dotación de
//      armado recuperable, 436 de desarme).
//   3. La OT los HEREDA según su tipo: x_duracion_est y x_personal_por_jornada pasan a
//      computados-editables. Siguen siendo obligatorios y siguen siendo editables — el
//      compute propone, Comercial dispone.
//   4. No se puede confirmar una orden tipo "Obra " sin la duración de armado y desarme.
//
// POR QUÉ SÓLO LAS TIPO "Obra ": son las que generan trabajo. Medido sobre las 1007 OTs:
// 1002 cuelgan de una venta "Obra " y 5 del resto de los tipos de contrato. Bloquear la
// confirmación de un alquiler simple, que nunca va a tener cuadrilla, sería puro estorbo.
// (El espacio final de "Obra " es literal y necesario, igual que en informes-obra.ts.)
//
// GOTCHA CONOCIDO (ver odoo-detalle-tecnico-ot.mjs): convertir un campo YA EXISTENTE en
// computado NO recalcula los registros viejos — se quedan con lo que tenían. Eso acá juega
// a favor, pero igual se toma un respaldo antes y se verifica después que ninguna OT haya
// perdido su valor: x_duracion_est alimenta las jornadas del tablero y el informe de obra.
//
// Idempotente. Por defecto NO escribe: mostrá qué haría. Para aplicar, pasar --aplicar.
// Correr: node --env-file=.env.local scripts/odoo-programacion-en-venta.mjs [--aplicar]
import { version, authenticate, searchRead, read, create, write, fieldsGet, executeKw } from "./odoo-rpc.mjs";
import { writeFileSync } from "node:fs";

const APLICAR = process.argv.includes("--aplicar");
const OT = "x_aba_orden_trabajo";
const VENTA = "sale.order";
const CONTRATO_OBRA = "Obra ";
const PERSONAL_ESTANDAR = 5;

// Qué tipo de OT lee qué par de campos de la venta.
const ARMA = ["armado", "ampliacion"];
const DESARMA = ["desarme", "desmonte_parcial"];

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}\n`);

const [modeloVenta] = await searchRead("ir.model", [["model", "=", VENTA]], ["id"]);
if (!modeloVenta) throw new Error(`No existe el modelo ${VENTA}`);

// ── 1) La escala de duración se COPIA de x_duracion_est, no se retipea ──────
//
// Los tres campos tienen que hablar el mismo idioma: la fracción del tablero sale de esta
// misma escala. Si mañana se agrega una opción, se agrega en un solo lugar.
const [campoDur] = await searchRead("ir.model.fields",
  [["model", "=", OT], ["name", "=", "x_duracion_est"]], ["id"]);
if (!campoDur) throw new Error(`No existe ${OT}.x_duracion_est: correr antes los scripts de duración`);

const escala = await searchRead("ir.model.fields.selection", [["field_id", "=", campoDur.id]],
  ["value", "name", "sequence"], { order: "sequence" });
if (!escala.length) throw new Error("x_duracion_est no tiene opciones: algo cambió en Odoo");
console.log(`· escala de duración copiada de x_duracion_est: ${escala.length} opciones (${escala[0].value}…${escala[escala.length - 1].value})`);

const opciones = escala.map((o) => [0, 0, { value: o.value, name: o.name, sequence: o.sequence }]);

const CAMPOS_VENTA = [
  { name: "x_dur_armado", field_description: "Duración estimada del armado", ttype: "selection", selection_ids: opciones },
  { name: "x_dur_desarme", field_description: "Duración estimada del desarme", ttype: "selection", selection_ids: opciones },
  { name: "x_personal_armado", field_description: "Personal por jornada (armado)", ttype: "integer" },
  { name: "x_personal_desarme", field_description: "Personal por jornada (desarme)", ttype: "integer" },
];

// ── 2) Qué se sembraría, leído de las OTs que ya existen ────────────────────
const ots = await searchRead(OT, [["x_order_id", "!=", false]],
  ["x_order_id", "x_tipo", "x_duracion_est", "x_personal_por_jornada"], { limit: 3000 });

const semilla = new Map();
for (const t of ots) {
  const vid = t.x_order_id[0];
  if (!semilla.has(vid)) semilla.set(vid, {});
  const e = semilla.get(vid);
  const arma = ARMA.includes(t.x_tipo), desarma = DESARMA.includes(t.x_tipo);
  if (arma) {
    if (t.x_duracion_est && !e.x_dur_armado) e.x_dur_armado = t.x_duracion_est;
    if (t.x_personal_por_jornada && !e.x_personal_armado) e.x_personal_armado = t.x_personal_por_jornada;
  }
  if (desarma) {
    if (t.x_duracion_est && !e.x_dur_desarme) e.x_dur_desarme = t.x_duracion_est;
    if (t.x_personal_por_jornada && !e.x_personal_desarme) e.x_personal_desarme = t.x_personal_por_jornada;
  }
}
const cuenta = (k) => [...semilla.values()].filter((e) => e[k]).length;
console.log(`· semilla desde ${ots.length} OTs sobre ${semilla.size} ventas:`);
for (const k of ["x_dur_armado", "x_dur_desarme", "x_personal_armado", "x_personal_desarme"]) {
  console.log(`    ${k}: ${cuenta(k)}`);
}

if (!APLICAR) {
  const existentes = await fieldsGet(VENTA, ["type"]);
  console.log("");
  for (const c of CAMPOS_VENTA) {
    console.log(`· ${VENTA}.${c.name} ${c.name in existentes ? "ya existe" : `se crearía (${c.ttype})`}`);
  }
  const bloqueables = await searchRead(VENTA,
    [["state", "in", ["draft", "sent"]], ["x_studio_tipo_de_contrato", "=", CONTRATO_OBRA]], ["name"], { limit: 500 });
  console.log(`\n· presupuestos tipo "Obra " sin confirmar que van a necesitar la duración: ${bloqueables.length}`);
  console.log(`· OTs con x_duracion_est cargada (a respaldar): ${ots.filter((t) => t.x_duracion_est).length}`);
  console.log(`· OTs con x_personal_por_jornada cargada (a respaldar): ${ots.filter((t) => t.x_personal_por_jornada).length}`);
  console.log("\nCorrida en seco. Para aplicar:");
  console.log("  node --env-file=.env.local scripts/odoo-programacion-en-venta.mjs --aplicar");
  process.exit(0);
}

// ── 3) Los campos en la venta ───────────────────────────────────────────────
const existentes = await fieldsGet(VENTA, ["type"]);
for (const c of CAMPOS_VENTA) {
  if (c.name in existentes) { console.log(`· ${VENTA}.${c.name} ya existe`); continue; }
  await create("ir.model.fields", { model_id: modeloVenta.id, model: VENTA, state: "manual", ...c });
  console.log(`✓ ${VENTA}.${c.name} creado (${c.ttype})`);
}

// El default de un campo manual no va en ir.model.fields: va en ir.default.
for (const name of ["x_personal_armado", "x_personal_desarme"]) {
  const [f] = await searchRead("ir.model.fields", [["model", "=", VENTA], ["name", "=", name]], ["id"]);
  const [ya] = await searchRead("ir.default", [["field_id", "=", f.id]], ["id"]);
  if (ya) { console.log(`· default de ${name} ya está puesto`); continue; }
  await executeKw("ir.default", "set", [VENTA, name, PERSONAL_ESTANDAR]);
  console.log(`✓ ${name}: default ${PERSONAL_ESTANDAR}`);
}

// ── 4) Sembrar las ventas con lo que ya sabían las OTs ──────────────────────
//
// Sin esto los campos nacen vacíos y el compute de la OT no tendría de dónde sacar nada:
// las OTs viejas quedarían dependiendo de un dato que nunca se cargó.
const idsVenta = [...semilla.keys()];
const actuales = await read(VENTA, idsVenta,
  ["x_dur_armado", "x_dur_desarme", "x_personal_armado", "x_personal_desarme"]);
const porValores = new Map();
for (const venta of actuales) {
  const quiere = semilla.get(venta.id) || {};
  const cambios = {};
  for (const [k, val] of Object.entries(quiere)) {
    if (!venta[k]) cambios[k] = val; // nunca se pisa lo que ya tiene un valor
  }
  if (!Object.keys(cambios).length) continue;
  const clave = JSON.stringify(cambios);
  if (!porValores.has(clave)) porValores.set(clave, []);
  porValores.get(clave).push(venta.id);
}
let sembradas = 0;
for (const [clave, ids] of porValores) {
  await executeKw(VENTA, "write", [ids, JSON.parse(clave)]);
  sembradas += ids.length;
}
console.log(`✓ ${sembradas} venta(s) sembrada(s) desde sus OTs`);

// ── 5) Respaldo antes de tocar los campos de la OT ──────────────────────────
const conDato = ots
  .filter((t) => t.x_duracion_est || t.x_personal_por_jornada)
  .map((t) => ({ id: t.id, x_duracion_est: t.x_duracion_est, x_personal_por_jornada: t.x_personal_por_jornada }));
const ruta = `/tmp/backup-programacion-ot-${Date.now()}.json`;
writeFileSync(ruta, JSON.stringify(conDato, null, 2));
console.log(`· respaldo de ${conDato.length} OT(s) con duración o dotación → ${ruta}`);

// ── 6) La OT hereda ─────────────────────────────────────────────────────────
//
// El compute deriva de la venta según el tipo. Para el personal cae en 5 si la venta no
// dice nada: es la cuadrilla estándar y es mejor que un 0, que en la OT es obligatorio.
// Para la duración NO hay default razonable — si la venta no la trae, queda vacía y el
// campo obligatorio del formulario se encarga de pedirla.
const COMPUTE_DUR = `
for rec in self:
    val = False
    o = rec['x_order_id']
    if o:
        if rec['x_tipo'] in ['armado', 'ampliacion']:
            val = o['x_dur_armado']
        elif rec['x_tipo'] in ['desarme', 'desmonte_parcial']:
            val = o['x_dur_desarme']
    rec['x_duracion_est'] = val or False
`.trim();

const COMPUTE_PERSONAL = `
for rec in self:
    val = 0
    o = rec['x_order_id']
    if o:
        if rec['x_tipo'] in ['armado', 'ampliacion']:
            val = o['x_personal_armado'] or 0
        elif rec['x_tipo'] in ['desarme', 'desmonte_parcial']:
            val = o['x_personal_desarme'] or 0
    if not val:
        val = ${PERSONAL_ESTANDAR}
    rec['x_personal_por_jornada'] = val
`.trim();

const [campoPersonal] = await searchRead("ir.model.fields",
  [["model", "=", OT], ["name", "=", "x_personal_por_jornada"]], ["id"]);

// readonly=False es lo que los deja EDITABLES: se precargan y se escriben encima.
for (const [id, nombre, compute] of [
  [campoDur.id, "x_duracion_est", COMPUTE_DUR],
  [campoPersonal.id, "x_personal_por_jornada", COMPUTE_PERSONAL],
]) {
  await write("ir.model.fields", [id], { compute, depends: "x_order_id,x_tipo", store: true, readonly: false });
  console.log(`✓ ${OT}.${nombre}: computado-editable (depende de x_order_id, x_tipo)`);
}

// ── 7) Verificar que nadie perdió su valor, y restaurar si hizo falta ───────
const despues = await read(OT, conDato.map((t) => t.id), ["x_duracion_est", "x_personal_por_jornada"]);
const ahora = new Map(despues.map((t) => [t.id, t]));
const perdidas = conDato.filter((t) => {
  const d = ahora.get(t.id);
  if (!d) return false;
  return (t.x_duracion_est && !d.x_duracion_est) || (t.x_personal_por_jornada && !d.x_personal_por_jornada);
});
if (perdidas.length) {
  console.log(`\n⚠ ${perdidas.length} OT(s) perdieron su valor al convertir el campo. Restaurando desde el respaldo…`);
  for (const t of perdidas) {
    await executeKw(OT, "write", [[t.id], {
      x_duracion_est: t.x_duracion_est || false,
      x_personal_por_jornada: t.x_personal_por_jornada || 0,
    }]);
  }
  console.log(`✓ ${perdidas.length} OT(s) restaurada(s)`);
} else {
  console.log(`✓ ninguna de las ${conDato.length} OTs respaldadas perdió su valor`);
}

// ── 8) El formulario de la orden de alquiler ────────────────────────────────
//
// Va DENTRO de la pestaña que creó odoo-detalle-tecnico-ot.mjs: qué hay que armar, cuánto
// lleva y con cuánta gente son la misma conversación y tienen que estar juntos. La pestaña
// se renombra acá porque deja de ser sólo el alcance.
const [pagina] = await searchRead("ir.ui.view", [["name", "=", "sale.order.form.aba.alcance.tecnico"]], ["id", "arch_db"]);
if (!pagina) throw new Error("Falta la vista sale.order.form.aba.alcance.tecnico: correr antes odoo-detalle-tecnico-ot.mjs");
if (pagina.arch_db.includes('string="Alcance técnico"')) {
  await write("ir.ui.view", [pagina.id], {
    arch_db: pagina.arch_db.replace('string="Alcance técnico"', 'string="Trabajo a ejecutar"'),
  });
  console.log('✓ la pestaña pasó a llamarse "Trabajo a ejecutar"');
}

const NOMBRE_VISTA = "sale.order.form.aba.programacion";
const [yaEsta] = await searchRead("ir.ui.view", [["name", "=", NOMBRE_VISTA]], ["id"]);
if (yaEsta) {
  console.log(`· la vista ${NOMBRE_VISTA} ya existe`);
} else {
  await create("ir.ui.view", {
    name: NOMBRE_VISTA, model: VENTA, inherit_id: pagina.id, mode: "extension", priority: 31,
    arch_db: `<data>
  <xpath expr="//page[@name='aba_alcance']" position="inside">
    <!-- Un campo usado en un modificador TIENE que estar en la vista o Odoo rompe el
         formulario entero al renderizarlo. x_studio_tipo_de_contrato lo pone la
         personalización de Studio; no dependemos de eso y lo declaramos acá. -->
    <field name="x_studio_tipo_de_contrato" invisible="1"/>
    <separator string="Programación de los trabajos"/>
    <div class="text-muted">
      <p>Cuánto lleva y con cuánta gente. Cada Orden de Trabajo se precarga con estos valores según su tipo, y Comercial los puede corregir ahí. Estimar con una cuadrilla de 5 armadores: una jornada completa son 8 horas (de 8 a 12 y de 13 a 17). Si el trabajo es corto, elegir la fracción que corresponda.</p>
    </div>
    <group>
      <group string="Armado">
        <field name="x_dur_armado" required="state in ('sale', 'done') and x_studio_tipo_de_contrato == 'Obra '"/>
        <field name="x_personal_armado"/>
      </group>
      <group string="Desarme">
        <field name="x_dur_desarme" required="state in ('sale', 'done') and x_studio_tipo_de_contrato == 'Obra '"/>
        <field name="x_personal_desarme"/>
      </group>
    </group>
  </xpath>
</data>`,
  });
  console.log(`✓ vista ${NOMBRE_VISTA} creada (grupo "Programación de los trabajos")`);
}

// ── 9) No se confirma sin la programación ───────────────────────────────────
//
// El `required` de la vista NO alcanza: cuando se aprieta Confirmar el registro todavía
// está en 'draft', así que el modificador evalúa en falso y deja pasar. Lo único que
// bloquea de verdad es levantar la excepción DESPUÉS del write de state, que revierte la
// transacción entera y con ella la confirmación.
//
// Mismo patrón de creación por RPC con la acción anidada que
// odoo-create-obra-ot-automations.mjs, cambiando state 'webhook' por 'code'.
const [campoState] = await searchRead("ir.model.fields",
  [["model", "=", VENTA], ["name", "=", "state"]], ["id"]);

const CODIGO = `
faltan = []
for record in records:
    if record.state == 'sale' and record.x_studio_tipo_de_contrato == 'Obra ':
        falta = []
        if not record.x_dur_armado:
            falta.append('la duración estimada del ARMADO')
        if not record.x_dur_desarme:
            falta.append('la duración estimada del DESARME')
        if falta:
            faltan.append(record.name + ': falta ' + ' y '.join(falta))
if faltan:
    raise UserError(
        'No se puede confirmar sin la programación de los trabajos.\\n\\n'
        + '\\n'.join(faltan)
        + '\\n\\nCargala en la pestaña "Trabajo a ejecutar". Es lo que Operaciones usa para '
        + 'planificar la cuadrilla: sin eso la obra entra al tablero sin duración y no se '
        + 'puede saber cuántas jornadas ocupa.'
    )
`.trim();

const NOMBRE_AUTO = "AndamiosOS exige programación al confirmar";
const [auto] = await searchRead("base.automation", [["name", "=", NOMBRE_AUTO]], ["id", "action_server_ids"]);
if (auto) {
  await executeKw("ir.actions.server", "write", [auto.action_server_ids, { code: CODIGO }]);
  console.log(`· la automatización "${NOMBRE_AUTO}" ya existe (código actualizado)`);
} else {
  await create("base.automation", {
    name: NOMBRE_AUTO,
    model_id: modeloVenta.id,
    trigger: "on_create_or_write",
    trigger_field_ids: [[6, 0, [campoState.id]]],
    active: true,
    action_server_ids: [[0, 0, {
      name: NOMBRE_AUTO,
      model_id: modeloVenta.id,
      state: "code",
      code: CODIGO,
      usage: "base_automation",
    }]],
  });
  console.log(`✓ automatización "${NOMBRE_AUTO}" creada (bloquea la confirmación)`);
}

// ── 10) Verificación ────────────────────────────────────────────────────────
console.log("\n── verificación ──");
const sembradasOk = await searchRead(VENTA, [["x_personal_armado", ">", 0]], ["id"], { limit: 2000 });
console.log(`  ventas con dotación de armado cargada: ${sembradasOk.length}`);
const vivas = await searchRead(OT, [["x_estado", "in", ["pendiente", "en_proceso"]]],
  ["x_tipo", "x_duracion_est", "x_personal_por_jornada"], { limit: 300 });
console.log(`  OTs vivas: ${vivas.length} · con duración: ${vivas.filter((t) => t.x_duracion_est).length} · con dotación: ${vivas.filter((t) => t.x_personal_por_jornada).length}`);

console.log(`\n✅ Programación en la venta lista. Respaldo en ${ruta}`);
console.log("   Probar A MANO: confirmar un presupuesto tipo \"Obra \" sin duración → tiene que rechazarlo.");
