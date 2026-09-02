// Agrega x_fecha_desde ("A partir de") en la OT, y la muestra en las vistas.
//
// EL DATO QUE FALTABA: a veces Comercial no cierra una fecha con el cliente sino un
// PISO — "a partir del 12 puede entrar". Hoy eso queda en la cabeza del que vendió, y
// Planificación lo descubre cuando la cuadrilla llega y no la reciben.
//
// NO ES x_fecha_comprometida, y meterlas en el mismo campo arruinaría las dos:
//
//   x_fecha_comprometida → un TECHO. "Le prometí el jueves". Llegar después es desvío.
//   x_fecha_desde        → un PISO.  "No antes del jueves". Ir antes es imposible.
//
// Pueden convivir en la misma OT —"entre el 10 y el 15"— y recién ahí el tablero conoce
// la ventana real de la obra.
//
// Idempotente. Por defecto NO escribe: muestra qué haría. Para aplicar, pasar --aplicar.
// Correr: node --env-file=.env.local scripts/odoo-add-fecha-desde.mjs [--aplicar]
import { version, authenticate, searchRead, create, fieldsGet, executeKw } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");
const MODEL = "x_aba_orden_trabajo";
const CAMPO = "x_fecha_desde";

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}`);
console.log(APLICAR ? "MODO: aplicar\n" : "MODO: corrida en seco (agregá --aplicar para escribir)\n");

// ── 1) El campo ──────────────────────────────────────────────────────────────

const [modelo] = await searchRead("ir.model", [["model", "=", MODEL]], ["id"]);
if (!modelo) throw new Error(`No existe el modelo ${MODEL}`);

const campos = await fieldsGet(MODEL, ["type"]);
if (CAMPO in campos) {
  console.log(`· ${MODEL}.${CAMPO} ya existe`);
} else if (APLICAR) {
  await create("ir.model.fields", {
    model_id: modelo.id,
    model: MODEL,
    state: "manual",
    name: CAMPO,
    field_description: "A partir de",
    ttype: "date",
  });
  console.log(`✓ ${MODEL}.${CAMPO} creado (date)`);
} else {
  console.log(`· ${MODEL}.${CAMPO} se crearía (date)`);
  console.log("\nSin el campo no se pueden tocar las vistas. Corrida en seco terminada.");
  process.exit(0);
}

// ── 2) Las vistas ────────────────────────────────────────────────────────────

async function vistaBase(nombre) {
  const [v] = await searchRead("ir.ui.view", [["name", "=", nombre], ["model", "=", MODEL]], ["id"]);
  if (!v) throw new Error(`No existe la vista ${nombre}`);
  return v.id;
}

async function asegurarVista(nombre, inheritId, arch) {
  const [existente] = await searchRead("ir.ui.view", [["name", "=", nombre]], ["id"]);
  if (!APLICAR) {
    console.log(`· ${nombre} ${existente ? "se actualizaría" : "se crearía"}`);
    return;
  }
  if (existente) {
    await executeKw("ir.ui.view", "write", [[existente.id], { arch, active: true }]);
    console.log(`· ${nombre} actualizada (id=${existente.id})`);
    return;
  }
  const id = await create("ir.ui.view", {
    // priority 22: DESPUÉS de las vistas de x_fecha_comprometida (21), porque el xpath
    // se cuelga de ese campo y tiene que existir en el arch cuando ésta se aplica.
    name: nombre, model: MODEL, inherit_id: inheritId, mode: "extension", priority: 22, arch,
  });
  console.log(`✓ ${nombre} creada (id=${id})`);
}

// El texto de ayuda explica la diferencia con la comprometida EN EL LUGAR donde se puede
// confundir. Los dos campos quedan uno al lado del otro justamente para que se lean como
// los dos extremos de una ventana, y no como dos maneras de decir lo mismo.
await asegurarVista(
  "x_aba_orden_trabajo.form.comercial.desde",
  await vistaBase("x_aba_orden_trabajo.form.comercial"),
  `<data>
     <xpath expr="//field[@name='x_fecha_comprometida']" position="before">
       <field name="${CAMPO}"/>
       <div colspan="2" class="text-muted">
         <p>Dejalo vacío si la obra puede entrar cuando haya lugar. Completalo sólo si el
         cliente puso un piso: "a partir del 12". Planificación lo ve en la tarjeta y el
         tablero avisa si intenta ponerla antes.</p>
       </div>
     </xpath>
   </data>`,
);

await asegurarVista(
  "x_aba_orden_trabajo.form.desde",
  await vistaBase("x_aba_orden_trabajo.form"),
  `<data>
     <xpath expr="//field[@name='x_fecha_comprometida']" position="before">
       <field name="${CAMPO}"/>
     </xpath>
   </data>`,
);

// En rojo cuando el plan la puso antes del piso: es el error que este campo existe para
// hacer visible, y en la lista se ve sin abrir nada.
await asegurarVista(
  "x_aba_orden_trabajo.list.desde",
  await vistaBase("x_aba_orden_trabajo.list"),
  `<data>
     <xpath expr="//field[@name='x_fecha_comprometida']" position="before">
       <field name="${CAMPO}" string="A partir de" optional="show"
              decoration-danger="${CAMPO} and x_fecha_programada and x_fecha_programada &lt; ${CAMPO}"/>
     </xpath>
   </data>`,
);

// No hay filtro de "planificada antes del piso": un dominio de Odoo no compara dos
// campos entre sí. Ese cruce lo hace el tablero, que es donde se actúa.
await asegurarVista(
  "x_aba_orden_trabajo.search.desde",
  await vistaBase("x_aba_orden_trabajo.search"),
  `<data>
     <xpath expr="//filter[@name='con_fecha']" position="before">
       <filter name="con_fecha_desde" string="Con fecha de inicio acordada"
               domain="[('${CAMPO}','!=',False)]"/>
     </xpath>
   </data>`,
);

if (!APLICAR) {
  console.log("\nCorrida en seco terminada.");
  process.exit(0);
}

console.log("\nVerificación sobre la vista resultante:");
for (const tipo of ["form", "list", "search"]) {
  const vista = await executeKw(MODEL, "get_view", [false, tipo]);
  console.log(`  ${vista.arch.includes(CAMPO) ? "✓" : "✗"} ${tipo}`);
}
const comercial = await executeKw(MODEL, "get_view", [await vistaBase("x_aba_orden_trabajo.form.comercial"), "form"]);
console.log(`  ${comercial.arch.includes(CAMPO) ? "✓" : "✗"} form.comercial`);

console.log("\n✅ Campo y vistas listos.");
