// Muestra x_fecha_comprometida en las vistas de la OT, y saca a Comercial del campo del
// tablero.
//
// El cambio importante es en el form de Comercial: hasta ahora tipeaba la fecha en
// x_fecha_programada, que es el campo que el tablero sobreescribe. Por eso el compromiso
// se perdía. Ahora Comercial escribe en x_fecha_comprometida —que nadie más toca— y ve la
// del tablero al lado, en solo lectura, para poder comparar.
//
// x_fecha_programada queda oculta mientras esté vacía: en una OT recién creada todavía no
// hay plan, y un campo vacío con etiqueta sólo genera la duda de si hay que llenarlo.
//
// Idempotente, con vistas heredadas. Para revertir, borrar las que crea.
// Correr: node --env-file=.env.local scripts/odoo-vistas-fecha-comprometida.mjs
import { authenticate, searchRead, create, executeKw } from "./odoo-rpc.mjs";

const MODEL = "x_aba_orden_trabajo";

await authenticate();

const campos = await executeKw(MODEL, "fields_get", [], { attributes: ["type"] });
if (!("x_fecha_comprometida" in campos)) {
  throw new Error("Falta x_fecha_comprometida. Corré antes scripts/odoo-add-fecha-comprometida.mjs --aplicar");
}

async function vistaBase(nombre) {
  const [v] = await searchRead("ir.ui.view", [["name", "=", nombre], ["model", "=", MODEL]], ["id"]);
  if (!v) throw new Error(`No existe la vista ${nombre}`);
  return v.id;
}

async function asegurarVista(nombre, inheritId, arch) {
  const [existente] = await searchRead("ir.ui.view", [["name", "=", nombre]], ["id"]);
  if (existente) {
    await executeKw("ir.ui.view", "write", [[existente.id], { arch, active: true }]);
    console.log(`· ${nombre} actualizada (id=${existente.id})`);
    return existente.id;
  }
  const id = await create("ir.ui.view", {
    name: nombre, model: MODEL, inherit_id: inheritId, mode: "extension", priority: 21, arch,
  });
  console.log(`✓ ${nombre} creada (id=${id})`);
  return id;
}

// ── 1) Form de Comercial ─────────────────────────────────────────────────────
//
// La obligatoriedad cuando la urgencia es alta se MUEVE al campo comprometido: lo que hay
// que exigirle a Comercial es que se comprometa a una fecha, no que adivine el plan.
await asegurarVista(
  "x_aba_orden_trabajo.form.comercial.comprometida",
  await vistaBase("x_aba_orden_trabajo.form.comercial"),
  `<data>
     <xpath expr="//field[@name='x_fecha_programada']" position="before">
       <field name="x_fecha_comprometida" required="x_urgencia == 'alta'"/>
       <div colspan="2" class="text-muted">
         <p>La fecha que le prometés al cliente. Planificación no la toca: si el tablero
         termina poniendo otro día, el desvío queda a la vista en vez de desaparecer.</p>
       </div>
     </xpath>
     <xpath expr="//field[@name='x_fecha_programada']" position="attributes">
       <attribute name="readonly">1</attribute>
       <attribute name="required">0</attribute>
       <attribute name="string">Fecha del tablero</attribute>
       <attribute name="invisible">not x_fecha_programada</attribute>
     </xpath>
   </data>`,
);

// ── 2) Form principal ────────────────────────────────────────────────────────
await asegurarVista(
  "x_aba_orden_trabajo.form.comprometida",
  await vistaBase("x_aba_orden_trabajo.form"),
  `<data>
     <xpath expr="//field[@name='x_fecha_programada']" position="before">
       <field name="x_fecha_comprometida"/>
     </xpath>
     <xpath expr="//field[@name='x_fecha_programada']" position="attributes">
       <attribute name="string">Fecha del tablero</attribute>
     </xpath>
   </data>`,
);

// ── 3) Lista ─────────────────────────────────────────────────────────────────
await asegurarVista(
  "x_aba_orden_trabajo.list.comprometida",
  await vistaBase("x_aba_orden_trabajo.list"),
  `<data>
     <xpath expr="//field[@name='x_fecha_programada']" position="before">
       <field name="x_fecha_comprometida" string="Comprometida" optional="show"
              decoration-danger="x_fecha_comprometida &lt; current_date and x_estado in ['pendiente','en_proceso']"/>
     </xpath>
   </data>`,
);

// ── 4) Búsqueda ──────────────────────────────────────────────────────────────
//
// "Compromiso vencido" es el filtro que este campo hace posible por primera vez: obras
// activas cuya fecha prometida al cliente ya pasó.
await asegurarVista(
  "x_aba_orden_trabajo.search.comprometida",
  await vistaBase("x_aba_orden_trabajo.search"),
  `<data>
     <xpath expr="//filter[@name='con_fecha']" position="before">
       <filter name="compromiso_vencido" string="Compromiso con el cliente vencido"
               domain="[('x_fecha_comprometida','&lt;',context_today().strftime('%Y-%m-%d')),('x_estado','in',['pendiente','en_proceso'])]"/>
       <filter name="con_compromiso" string="Con fecha comprometida"
               domain="[('x_fecha_comprometida','!=',False)]"/>
     </xpath>
   </data>`,
);

console.log("\nVerificación sobre la vista resultante:");
for (const tipo of ["form", "list", "search"]) {
  const vista = await executeKw(MODEL, "get_view", [false, tipo]);
  console.log(`  ${vista.arch.includes("x_fecha_comprometida") ? "✓" : "✗"} ${tipo}`);
}
const comercial = await executeKw(MODEL, "get_view", [await vistaBase("x_aba_orden_trabajo.form.comercial"), "form"]);
console.log(`  ${comercial.arch.includes("x_fecha_comprometida") ? "✓" : "✗"} form.comercial`);
console.log(`  ${/name="x_fecha_programada"[^>]*readonly="1"/.test(comercial.arch) ? "✓" : "✗"} form.comercial: la fecha del tablero quedó de solo lectura`);

console.log("\n✅ Vistas listas.");
