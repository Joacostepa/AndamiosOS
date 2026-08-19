// Muestra x_fecha_firmeza en las vistas de la OT.
//
// Crear el campo no alcanza: Odoo no lo muestra en ningún lado hasta que se lo agrega a
// las vistas. Este script lo pone donde se usa, con tres criterios:
//
//  1. LA FIRMEZA VA PEGADA A LA FECHA. Es una etiqueta que califica ese dato, no un dato
//     aparte. En los dos formularios va inmediatamente después de x_fecha_programada,
//     dentro del grupo "Programación", y en la lista como columna siguiente.
//
//  2. ES DE SOLO LECTURA EN TODOS LADOS. La escribe el tablero y nadie más. Importa
//     especialmente en la lista, que es editable="bottom" con multi_edit: sin readonly
//     cualquiera la cambiaría inline y el campo pasaría a mentir. Y como la app usa la
//     firmeza para saber si una fecha es suya —si está vacía, la puso una persona y no se
//     toca— una firmeza editada a mano rompería esa garantía.
//
//  3. SE EXPLICA DONDE APARECE EL CONFLICTO. En el form de Comercial la fecha es
//     editable (y obligatoria si la urgencia es alta): Comercial la tipea y después el
//     tablero la pisa. Sin una nota ahí mismo, eso se vive como un bug. La nota lo dice.
//
// Tentativa va en azul (informativa) y no en ámbar: una fecha tentativa no es una alerta,
// es lo normal mientras la obra se planifica.
//
// Se hace con vistas HEREDADAS, sin tocar las originales: para revertir alcanza con
// borrar las cuatro que crea. Idempotente.
// Correr: node --env-file=.env.local scripts/odoo-vistas-firmeza-fecha.mjs
import { authenticate, searchRead, create, executeKw } from "./odoo-rpc.mjs";

const MODEL = "x_aba_orden_trabajo";

await authenticate();

const campos = await executeKw(MODEL, "fields_get", [], { attributes: ["type"] });
if (!("x_fecha_firmeza" in campos)) {
  throw new Error("Falta x_fecha_firmeza. Corré antes scripts/odoo-add-firmeza-fecha-ot.mjs");
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
    name: nombre,
    model: MODEL,
    inherit_id: inheritId,
    mode: "extension",
    priority: 20,
    arch,
  });
  console.log(`✓ ${nombre} creada (id=${id})`);
  return id;
}

// El badge: verde = firme, azul = todavía se mueve. Oculto si está vacío, que es el caso
// de una OT recién creada y de una obra que no está en el tablero.
const BADGE =
  `<field name="x_fecha_firmeza" widget="badge" readonly="1" invisible="not x_fecha_firmeza"` +
  ` decoration-success="x_fecha_firmeza == 'confirmada'"` +
  ` decoration-info="x_fecha_firmeza == 'tentativa'"/>`;

// ── 1) Form de Comercial: es donde se tipea la fecha, así que es donde hay que avisar ──
await asegurarVista(
  "x_aba_orden_trabajo.form.comercial.firmeza",
  await vistaBase("x_aba_orden_trabajo.form.comercial"),
  `<data>
     <xpath expr="//field[@name='x_fecha_programada']" position="after">
       ${BADGE}
       <div colspan="2" class="text-muted">
         <p>Esta es la fecha del <b>tablero</b>, no la que vos comprometiste: la mantiene
         Planificación y muestra el primer día que la obra todavía tiene pendiente. Si dice
         algo distinto a lo que prometiste, ahí tenés el desvío.</p>
       </div>
     </xpath>
   </data>`,
);

// ── 2) Form principal ────────────────────────────────────────────────────────
await asegurarVista(
  "x_aba_orden_trabajo.form.firmeza",
  await vistaBase("x_aba_orden_trabajo.form"),
  `<data>
     <xpath expr="//field[@name='x_fecha_programada']" position="after">
       ${BADGE}
       <div colspan="2" class="text-muted" invisible="not x_fecha_firmeza">
         <p>Fecha tomada del tablero de planificación: es el primer día que la obra todavía
         tiene pendiente. Se actualiza sola al replanificar.</p>
       </div>
     </xpath>
   </data>`,
);

// ── 3) Lista: columna al lado de la fecha ────────────────────────────────────
await asegurarVista(
  "x_aba_orden_trabajo.list.firmeza",
  await vistaBase("x_aba_orden_trabajo.list"),
  `<data>
     <xpath expr="//field[@name='x_fecha_programada']" position="after">
       <field name="x_fecha_firmeza" string="Firmeza" widget="badge" readonly="1" optional="show"
              decoration-success="x_fecha_firmeza == 'confirmada'"
              decoration-info="x_fecha_firmeza == 'tentativa'"/>
     </xpath>
   </data>`,
);

// ── 4) Búsqueda: filtros y agrupación ────────────────────────────────────────
//
// El filtro que más va a servir: OTs activas, con fecha prometida, y sin una sola jornada
// pendiente en el tablero. Es el agujero que este campo permite ver por primera vez.
//
// Se llama por lo que detecta y no "sin planificar", porque agarra DOS casos distintos y
// los dos importan: la obra que nadie puso nunca en el tablero, y la que ya se ejecutó
// entera pero cuya OT sigue abierta. En ambos hay una fecha prometida que no tiene
// respaldo en la planificación.
//
// Intenté acotarlo con x_dias_obra = 0 para dejar sólo el primer caso y estaba mal:
// x_dias_obra cuenta jornadas HISTÓRICAS ejecutadas, así que sacaba de la lista a una
// obra con 6 jornadas hechas entre febrero y julio que igual tiene un armado pendiente
// para agosto — exactamente la que hay que ver.
await asegurarVista(
  "x_aba_orden_trabajo.search.firmeza",
  await vistaBase("x_aba_orden_trabajo.search"),
  `<data>
     <xpath expr="//filter[@name='con_fecha']" position="after">
       <filter name="fecha_confirmada" string="Fecha confirmada"
               domain="[('x_fecha_firmeza','=','confirmada')]"/>
       <filter name="fecha_tentativa" string="Fecha tentativa"
               domain="[('x_fecha_firmeza','=','tentativa')]"/>
       <filter name="sin_planificar" string="Sin jornadas pendientes en el tablero"
               domain="[('x_fecha_programada','!=',False),('x_fecha_firmeza','=',False),('x_estado','in',['pendiente','en_proceso'])]"/>
     </xpath>
     <xpath expr="//filter[@name='g_dia']" position="after">
       <filter name="g_firmeza" string="Firmeza de la fecha" context="{'group_by':'x_fecha_firmeza'}"/>
     </xpath>
   </data>`,
);

// ── Verificación: que el campo aparezca de verdad en las vistas ya combinadas ─
console.log("\nVerificación sobre la vista resultante:");
for (const tipo of ["form", "list", "search"]) {
  const vista = await executeKw(MODEL, "get_view", [false, tipo]);
  const presente = vista.arch.includes("x_fecha_firmeza");
  console.log(`  ${presente ? "✓" : "✗"} ${tipo}: x_fecha_firmeza ${presente ? "presente" : "NO APARECE"}`);
}
const comercialId = await vistaBase("x_aba_orden_trabajo.form.comercial");
const comercial = await executeKw(MODEL, "get_view", [comercialId, "form"]);
console.log(`  ${comercial.arch.includes("x_fecha_firmeza") ? "✓" : "✗"} form.comercial: x_fecha_firmeza ${comercial.arch.includes("x_fecha_firmeza") ? "presente" : "NO APARECE"}`);

console.log("\n✅ Vistas listas.");
