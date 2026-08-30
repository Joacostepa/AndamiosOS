// LO QUE QUEDÓ EFECTIVAMENTE ARMADO — el as-built que alimenta la OT de desarme.
//
// EL PROBLEMA: el armado real casi nunca es idéntico al vendido. Cambian alturas, metros,
// sectores. Esa diferencia hoy muere en la cabeza del capataz. Meses después, cuando el
// cliente llama para desarmar, Comercial emite la OT describiendo la estructura VENDIDA, y
// la cuadrilla llega a bajar algo que no es lo que dice el papel.
//
// LA PIEZA QUE FALTABA es un estado de la estructura por obra: qué hay armado hoy, según
// Operaciones. El armado y la ampliación lo escriben; el desarme y el desmonte parcial lo
// leen.
//
// POR QUÉ EN LA VENTA Y NO EN x_aba_obra: el único join que existe de verdad es
// x_order_id → sale.order, cargado en las 1007 OTs. x_obra_id está VACÍO en todas. Mismo
// criterio que el permiso municipal (odoo-add-permiso-sale-order.mjs): el armado y el
// desarme de una obra comparten la venta.
//
// POR QUÉ DOS CAMPOS Y NO UNO:
//   OT.x_ejecutado_real       → el snapshot: qué dejó ESTA intervención. Trazabilidad.
//   venta.x_estructura_actual → el estado vigente: qué hay hoy. Es el que hereda el desarme.
// Una obra con un armado y dos ampliaciones tiene tres snapshots y un solo estado actual.
//
// QUIÉN LO CARGA: Operaciones, desde la app, al cerrar la última jornada — en el mismo
// diálogo donde ya se pregunta "¿la OT está finalizada?". Es el único momento en que quien
// carga tiene el dato, porque acaba de leer lo que mandó el capataz. Los campos son
// readonly en Odoo a propósito: el dueño del dato es el que estuvo en la obra.
//
// Idempotente. Por defecto NO escribe: mostrá qué haría. Para aplicar, pasar --aplicar.
// Correr: node --env-file=.env.local scripts/odoo-estructura-armada.mjs [--aplicar]
import { version, authenticate, searchRead, create, write, fieldsGet } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");
const OT = "x_aba_orden_trabajo";
const VENTA = "sale.order";

// El compute del detalle técnico, ahora con el as-built por delante de todo.
// Reemplaza al de odoo-detalle-tecnico-ot.mjs; los dos tienen que decir lo mismo salvo por
// esta rama, así que si se toca uno hay que tocar el otro.
//
// EL depends LLEVA x_order_id.x_estructura_actual a propósito: si la OT de desarme ya
// existía cuando Operaciones cerró el armado, tiene que actualizarse sola. Es exactamente
// para lo que sirve la función — que el desarme nunca describa lo que se vendió si ya
// sabemos lo que se armó.
const COMPUTE_DETALLE = `
for rec in self:
    val = ''
    o = rec['x_order_id']
    if o:
        if rec['x_tipo'] in ['desarme', 'desmonte_parcial', 'mantenimiento']:
            val = (o['x_estructura_actual'] or '').strip()
        if not val:
            val = (o['x_alcance_tecnico'] or '').strip()
        if not val:
            t = ''
            primero = True
            for frag in str(o['x_studio_propuesta'] or '').split('<'):
                if primero:
                    t = t + frag
                    primero = False
                else:
                    j = frag.find('>')
                    if j >= 0:
                        t = t + ' ' + frag[j + 1:]
            t = t.replace('&amp;', '&').replace('&nbsp;', ' ').replace('&quot;', '"').replace('&#39;', "'")
            t = ' '.join(t.split())
            lo = t.lower()
            i = -1
            for a in ['descripción del servicio', 'descripcion del servicio', 'provisión en alquiler', 'provision en alquiler']:
                j = lo.find(a)
                if j >= 0:
                    if a[:4] == 'desc':
                        j = j + len(a)
                    if i < 0 or j < i:
                        i = j
            if i >= 0:
                cuerpo = t[i:].lstrip(': )0123456789.-').strip()
                cl = cuerpo.lower()
                fin = len(cuerpo)
                for f in ['costo del servicio', 'costo de renovación', 'costo de renovacion', 'costo total', 'opcionales', 'validez de la oferta', 'forma de pago', 'aclaraciones', 'no incluye']:
                    j = cl.find(f)
                    if j > 20 and j < fin:
                        fin = j
                cuerpo = cuerpo[:fin].strip()
                if len(cuerpo) > 40:
                    val = cuerpo[:700]
        if not val:
            partes = []
            for l in o['order_line']:
                dt = l['display_type'] or ''
                if dt != 'line_section':
                    p = l['product_id']
                    sirve = True
                    if dt != 'line_note':
                        if not p:
                            sirve = False
                        else:
                            up = (p['name'] or '').upper()
                            for e in ['RENOVACI', 'SERVICIO', 'COSTO FINANCIERO', 'ADICIONAL VARIOS', 'MANO DE OBRA', 'VENTA DE MATERIAL']:
                                if up.find(e) >= 0:
                                    sirve = False
                    if sirve:
                        frags = []
                        for f in (l['name'] or '').split('\\n'):
                            f = f.strip()
                            if f and f[:4].lower() != 'del ' and f[:5].upper() != 'OBRA;':
                                frags.append(f)
                        if frags:
                            linea = ' — '.join(frags)
                            q = l['product_uom_qty'] or 0
                            if dt != 'line_note' and q and q != 1:
                                n = int(q)
                                if n == q:
                                    linea = str(n) + ' x ' + linea
                                else:
                                    linea = str(q) + ' x ' + linea
                            partes.append(linea)
            val = '\\n'.join(partes)
    rec['x_detalle_tecnico'] = val
`.trim();

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}\n`);

async function idModelo(model) {
  const [m] = await searchRead("ir.model", [["model", "=", model]], ["id"]);
  if (!m) throw new Error(`No existe el modelo ${model}`);
  return m.id;
}

const CAMPOS = [
  [OT, { name: "x_ejecutado_real", field_description: "Lo que quedó ejecutado", ttype: "text" }],
  [VENTA, { name: "x_estructura_actual", field_description: "Lo que hay armado hoy", ttype: "text" }],
  [VENTA, { name: "x_estructura_fecha", field_description: "Confirmado en obra el", ttype: "date" }],
  [VENTA, { name: "x_estructura_ot_id", field_description: "OT que lo confirmó", ttype: "many2one", relation: OT, on_delete: "set null" }],
];

if (!APLICAR) {
  for (const [model, c] of CAMPOS) {
    const existentes = await fieldsGet(model, ["type"]);
    console.log(`· ${model}.${c.name} ${c.name in existentes ? "ya existe" : `se crearía (${c.ttype})`}`);
  }
  const [f] = await searchRead("ir.model.fields", [["model", "=", OT], ["name", "=", "x_detalle_tecnico"]], ["id", "depends"]);
  if (!f) throw new Error("Falta x_detalle_tecnico: correr antes odoo-detalle-tecnico-ot.mjs");
  console.log(`\n· el compute de x_detalle_tecnico se reescribe para leer el as-built primero`);
  console.log(`    depends actual: ${f.depends} → x_order_id,x_tipo,x_order_id.x_estructura_actual`);
  const armadosAbiertos = await searchRead(OT,
    [["x_tipo", "in", ["armado", "ampliacion", "desmonte_parcial"]], ["x_estado", "in", ["pendiente", "en_proceso"]]], ["id"]);
  console.log(`\n· OTs que van a pedir el as-built al cerrarse: ${armadosAbiertos.length}`);
  console.log("\nCorrida en seco. Para aplicar:");
  console.log("  node --env-file=.env.local scripts/odoo-estructura-armada.mjs --aplicar");
  process.exit(0);
}

// ── 1) Los campos ───────────────────────────────────────────────────────────
for (const [model, c] of CAMPOS) {
  const existentes = await fieldsGet(model, ["type"]);
  if (c.name in existentes) { console.log(`· ${model}.${c.name} ya existe`); continue; }
  await create("ir.model.fields", { model_id: await idModelo(model), model, state: "manual", ...c });
  console.log(`✓ ${model}.${c.name} creado (${c.ttype})`);
}

// ── 2) El detalle técnico del desarme pasa a salir del as-built ─────────────
const [campo] = await searchRead("ir.model.fields", [["model", "=", OT], ["name", "=", "x_detalle_tecnico"]], ["id", "compute"]);
if (!campo) throw new Error("Falta x_detalle_tecnico: correr antes odoo-detalle-tecnico-ot.mjs");
const computeAnterior = campo.compute;

await write("ir.model.fields", [campo.id], {
  compute: COMPUTE_DETALLE,
  depends: "x_order_id,x_tipo,x_order_id.x_estructura_actual",
  store: true,
  readonly: false,
});
console.log(`✓ ${OT}.x_detalle_tecnico: el desarme ahora lee el as-built primero`);

try {
  await searchRead(OT, [], ["x_tipo", "x_detalle_tecnico"], { limit: 10 });
  console.log("✓ el campo se lee sin errores");
} catch (e) {
  console.error(`\n✗ el compute nuevo falla: ${e.message}`);
  await write("ir.model.fields", [campo.id], { compute: computeAnterior, depends: "x_order_id,x_tipo", store: true, readonly: false });
  console.error("↩ restaurado el compute anterior. El detalle técnico sigue funcionando como antes.");
  process.exit(1);
}

// ── 3) La estructura vigente, en la orden de alquiler ───────────────────────
//
// READONLY: el dueño del dato es Operaciones, que lo carga desde la app al cerrar la OT.
// Si Comercial pudiera editarlo acá, volveríamos al problema original — una descripción
// escrita por alguien que no estuvo en la obra.
const [pagina] = await searchRead("ir.ui.view", [["name", "=", "sale.order.form.aba.alcance.tecnico"]], ["id"]);
if (!pagina) throw new Error("Falta la vista sale.order.form.aba.alcance.tecnico: correr antes odoo-detalle-tecnico-ot.mjs");

const VISTA_VENTA = "sale.order.form.aba.estructura.armada";
const [yaVenta] = await searchRead("ir.ui.view", [["name", "=", VISTA_VENTA]], ["id"]);
if (yaVenta) {
  console.log(`· la vista ${VISTA_VENTA} ya existe`);
} else {
  await create("ir.ui.view", {
    name: VISTA_VENTA, model: VENTA, inherit_id: pagina.id, mode: "extension", priority: 32,
    arch_db: `<data>
  <xpath expr="//page[@name='aba_alcance']" position="inside">
    <separator string="Lo que hay armado hoy" invisible="not x_estructura_actual"/>
    <div class="alert alert-info" role="alert" invisible="not x_estructura_actual">
      <p>Esto lo confirmó Operaciones al cerrar el armado, en obra. <b>Es lo que hay que desarmar</b>, y la OT de desarme se precarga con este texto y no con lo vendido. No se edita desde acá.</p>
    </div>
    <group invisible="not x_estructura_actual">
      <field name="x_estructura_fecha" readonly="1"/>
      <field name="x_estructura_ot_id" readonly="1"/>
    </group>
    <field name="x_estructura_actual" nolabel="1" readonly="1" invisible="not x_estructura_actual"/>
  </xpath>
</data>`,
  });
  console.log(`✓ vista ${VISTA_VENTA} creada (bloque "Lo que hay armado hoy")`);
}

// ── 4) El snapshot, en la OT ────────────────────────────────────────────────
const [vistaOt] = await searchRead("ir.ui.view", [["name", "=", `${OT}.form.comercial`]], ["id", "arch_db"]);
if (!vistaOt) throw new Error(`No existe la vista ${OT}.form.comercial`);

if (vistaOt.arch_db.includes(`name="x_ejecutado_real"`)) {
  console.log("· el ejecutado real ya estaba en el formulario de Comercial");
} else {
  const ANCLA = `<separator string="Observaciones para Operaciones"/>`;
  if (!vistaOt.arch_db.includes(ANCLA)) {
    throw new Error(`No se encontró el ancla en ${OT}.form.comercial: revisar el arch a mano`);
  }
  const BLOQUE = `<separator string="Lo que quedó ejecutado" invisible="not x_ejecutado_real"/>
  <div class="text-muted" invisible="not x_ejecutado_real">
    <p>Lo cargó Operaciones al cerrar esta OT, en obra. Es el estado en que quedó la estructura después de este trabajo.</p>
  </div>
  <field name="x_ejecutado_real" nolabel="1" readonly="1" invisible="not x_ejecutado_real"/>
  ${ANCLA}`;
  await write("ir.ui.view", [vistaOt.id], { arch_db: vistaOt.arch_db.replace(ANCLA, BLOQUE) });
  console.log("✓ bloque 'Lo que quedó ejecutado' agregado al formulario de Comercial");
}

// ── 5) Verificación ─────────────────────────────────────────────────────────
console.log("\n── verificación ──");
for (const [model, c] of CAMPOS) {
  const existentes = await fieldsGet(model, ["type"]);
  console.log(`  ${model}.${c.name}: ${existentes[c.name] ? existentes[c.name].type : "✗ FALTA"}`);
}
try {
  await (await import("./odoo-rpc.mjs")).executeKw(VENTA, "get_view", [false, "form"]);
  console.log("  sale.order form renderiza OK");
} catch (e) {
  console.log(`  ✗ sale.order form ROTA: ${e.message.slice(0, 200)}`);
}

console.log("\n✅ As-built listo en Odoo. Siguiente: pedirlo en el cierre de jornada de la app.");
