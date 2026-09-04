// Agrega x_fecha_antes_de ("Antes de") en la OT, y la muestra en las vistas.
//
// EL DATO QUE FALTABA: el cliente a veces no pone un piso sino un TECHO — "necesito la
// protección armada antes del 15 de agosto". Hoy eso vive en la cabeza del que vendió.
//
// LAS TRES FECHAS Y PARA QUÉ SIRVE CADA UNA. Con ésta ya son tres y conviene decirlo de
// una vez, porque la confusión entre ellas es el modo de falla obvio:
//
//   x_fecha_desde        → PISO.  "No antes del 12."     ─┐ la VENTANA del cliente:
//   x_fecha_antes_de     → TECHO. "Terminado antes del 15."┤ son restricciones, y el
//                                                          ┘ tablero las valida
//   x_fecha_comprometida → NUESTRA promesa dentro de esa ventana. Ordena la cola de
//                          Planificación y mide el desvío; no restringe nada.
//
// El caso que las separa: el cliente dice "antes del 15" y Comercial promete el 12.
// Perder el 12 es un desvío que se avisa. Perder el 15 es incumplir.
//
// EL TECHO NO SE MIDE COMO EL PISO, y es la diferencia que importa. El piso restringe el
// PRIMER día ("no entres antes del 12"); el techo restringe el ÚLTIMO, porque lo que el
// cliente pide es que el trabajo esté TERMINADO. Una obra de tres jornadas que arranca el
// 14 cumple el piso y rompe el techo igual.
//
// LO QUE ESTA VISTA NO PUEDE HACER: la lista de Odoo sólo conoce x_fecha_programada, que
// es el día de INICIO. Alcanza para pintar en rojo lo que ya arranca tarde, que es el caso
// obvio, pero no ve la obra que arranca a tiempo y termina tarde. Ese cruce lo hace el
// tablero, que es el único que conoce el plan completo — y es también donde se actúa.
//
// Idempotente. Por defecto NO escribe: muestra qué haría. Para aplicar, pasar --aplicar.
// Correr: node --env-file=.env.local scripts/odoo-add-fecha-antes-de.mjs [--aplicar]
import { version, authenticate, searchRead, create, fieldsGet, executeKw } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");
const MODEL = "x_aba_orden_trabajo";
const CAMPO = "x_fecha_antes_de";
const PISO = "x_fecha_desde";

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}`);
console.log(APLICAR ? "MODO: aplicar\n" : "MODO: corrida en seco (agregá --aplicar para escribir)\n");

// ── 1) El campo ──────────────────────────────────────────────────────────────

const [modelo] = await searchRead("ir.model", [["model", "=", MODEL]], ["id"]);
if (!modelo) throw new Error(`No existe el modelo ${MODEL}`);

const campos = await fieldsGet(MODEL, ["type"]);
if (!(PISO in campos)) {
  throw new Error(`Falta ${PISO}: este campo se cuelga de él en las vistas. Corré antes odoo-add-fecha-desde.mjs`);
}

if (CAMPO in campos) {
  console.log(`· ${MODEL}.${CAMPO} ya existe`);
} else if (APLICAR) {
  await create("ir.model.fields", {
    model_id: modelo.id,
    model: MODEL,
    state: "manual",
    name: CAMPO,
    field_description: "Antes de",
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
    // priority 23: DESPUÉS de las vistas de x_fecha_desde (22), porque el xpath se cuelga
    // de ese campo y tiene que existir en el arch cuando ésta se aplica.
    name: nombre, model: MODEL, inherit_id: inheritId, mode: "extension", priority: 23, arch,
  });
  console.log(`✓ ${nombre} creada (id=${id})`);
}

// Queda pegado a "A partir de" para que los dos se lean como lo que son: los dos extremos
// de la misma ventana. El texto dice explícitamente que es la fecha de TERMINADO, porque
// es lo único que lo distingue del piso y de la comprometida.
await asegurarVista(
  "x_aba_orden_trabajo.form.comercial.antes",
  await vistaBase("x_aba_orden_trabajo.form.comercial"),
  `<data>
     <xpath expr="//field[@name='${PISO}']" position="after">
       <field name="${CAMPO}"/>
       <div colspan="2" class="text-muted">
         <p>Dejalo vacío si no hay fecha límite. Completalo sólo si el cliente puso un
         techo: "lo necesito armado antes del 15". Es la fecha en que el trabajo tiene que
         estar TERMINADO, no en la que arranca — el tablero mide contra el último día
         planificado y avisa si la obra se pasa.</p>
       </div>
     </xpath>
   </data>`,
);

await asegurarVista(
  "x_aba_orden_trabajo.form.antes",
  await vistaBase("x_aba_orden_trabajo.form"),
  `<data>
     <xpath expr="//field[@name='${PISO}']" position="after">
       <field name="${CAMPO}"/>
     </xpath>
   </data>`,
);

// En rojo cuando la obra ya ARRANCA después del techo: si el primer día se pasó, no hay
// plan que la salve. La que arranca a tiempo y termina tarde no se ve acá — la lista no
// conoce la duración— y por eso el aviso de verdad vive en el tablero.
await asegurarVista(
  "x_aba_orden_trabajo.list.antes",
  await vistaBase("x_aba_orden_trabajo.list"),
  `<data>
     <xpath expr="//field[@name='${PISO}']" position="after">
       <field name="${CAMPO}" string="Antes de" optional="show"
              decoration-danger="${CAMPO} and x_fecha_programada and x_fecha_programada &gt; ${CAMPO}"/>
     </xpath>
   </data>`,
);

// Mismo criterio que el piso: el filtro sólo dice "tiene fecha límite". Un dominio de Odoo
// no compara dos campos entre sí, así que "planificada después del techo" no se puede
// filtrar acá.
await asegurarVista(
  "x_aba_orden_trabajo.search.antes",
  await vistaBase("x_aba_orden_trabajo.search"),
  `<data>
     <xpath expr="//filter[@name='con_fecha_desde']" position="after">
       <filter name="con_fecha_antes_de" string="Con fecha límite del cliente"
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

// Ventanas imposibles: si alguien puso el techo antes del piso, el dato no describe nada.
// No se bloquea —es un dato de Comercial y bloquear su carga sería peor— pero conviene
// saber si ya existen.
const invertidas = await searchRead(
  MODEL,
  [[CAMPO, "!=", false], [PISO, "!=", false]],
  ["x_name", PISO, CAMPO],
  { limit: 200 },
);
const malas = invertidas.filter((o) => o[CAMPO] < o[PISO]);
console.log(`\nOTs con las dos fechas: ${invertidas.length} · con la ventana invertida: ${malas.length}`);
for (const o of malas.slice(0, 10)) console.log(`  ⚠ ${o.x_name}: desde ${o[PISO]} → antes de ${o[CAMPO]}`);

console.log("\n✅ Campo y vistas listos.");
