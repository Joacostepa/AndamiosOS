// "Lo que quedó ejecutado" se puede ver en la orden de trabajo.
//
// EL PROBLEMA: Operaciones contesta, al cerrar la última jornada, si lo que quedó armado
// es lo que decía la OT o hubo diferencias. Ese texto se guarda —83 OTs lo tienen— pero
// NO SE VE DESDE NINGÚN LADO.
//
// La causa, verificada el 26/09: el campo figura en una sola vista,
// `x_aba_orden_trabajo.form.comercial`, que tiene prioridad 99. Las cuatro acciones que
// abren OTs desde los menús no fijan vista, así que Odoo usa la de MENOR prioridad —la
// 16— y ésa no lo muestra. O sea que el dato estaba en un formulario huérfano al que no
// se llega por ningún camino.
//
// ES DE SÓLO LECTURA acá, a propósito. El texto lo sella quien estuvo en la obra, al
// cerrar el parte, y es el registro de lo que se hizo. Dejarlo editable desde el
// escritorio convertiría un hecho verificado en una opinión editable, y además pisaría en
// silencio lo que hereda la OT de desarme.
//
// NO ES `x_detalle_tecnico`. Ese dice lo que HAY QUE hacer y se lee antes de salir; éste
// dice lo que se HIZO y se lee después. Van separados y con títulos distintos porque
// mezclarlos es lo que hace que nadie sepa cuál está mirando.
//
// La vista `.comercial` ya lo mostraba y no se toca.
//
// Idempotente. Por defecto sólo mira.
//
// Correr:
//   node --env-file=.env.local scripts/odoo-ver-lo-ejecutado.mjs            (sólo mira)
//   node --env-file=.env.local scripts/odoo-ver-lo-ejecutado.mjs --aplicar  (escribe)
import { version, authenticate, searchRead, create, write, executeKw } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");
const MODEL = "x_aba_orden_trabajo";
const PADRE = "x_aba_orden_trabajo.form";
const VISTA = "x_aba_orden_trabajo.form.ejecutado.real";

// Se cuelga de x_detalle_manual —"qué hay que ejecutar"— para que lo previsto y lo
// ejecutado queden uno debajo del otro: la comparación es la razón de existir del campo.
// El ancla es un `name`, que es lo único que Odoo 19 acepta como selector en herencia.
const ARCH = `<data>
  <xpath expr="//field[@name='x_detalle_manual']" position="after">
    <separator string="Lo que quedó ejecutado" invisible="not x_ejecutado_real"/>
    <div class="alert alert-info" role="alert" invisible="not x_ejecutado_real">
      <p>Lo confirmó Operaciones en obra, al cerrar la última jornada de esta orden de
         trabajo. Es lo que quedó armado DE VERDAD y no se edita desde acá.</p>
      <p>Si esta OT dejó estructura en pie, este mismo texto es el que hereda la OT de
         desarme: es lo que la cuadrilla va a ir a bajar.</p>
    </div>
    <field name="x_ejecutado_real" nolabel="1" readonly="1" invisible="not x_ejecutado_real"/>
  </xpath>
</data>`;

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}`);
console.log(APLICAR ? "MODO: aplicar\n" : "MODO: corrida en seco (agregá --aplicar para escribir)\n");

// ── Mirar ───────────────────────────────────────────────────────────────────
const [padre] = await searchRead(
  "ir.ui.view", [["model", "=", MODEL], ["name", "=", PADRE], ["mode", "=", "primary"]],
  ["id", "priority"],
);
if (!padre) throw new Error(`No existe la vista ${PADRE}`);
console.log(`1) Vista padre: #${padre.id} ${PADRE} (prioridad ${padre.priority})`);

const antes = await executeKw(MODEL, "get_views", [[[false, "form"]]], {});
console.log(`   ¿el formulario por defecto muestra el campo hoy? ${antes.views.form.arch.includes("x_ejecutado_real") ? "sí" : "NO ✗ — es el problema"}`);

const conDato = await executeKw(MODEL, "search_count", [[["x_ejecutado_real", "!=", false]]]);
console.log(`   OTs que tienen el dato guardado: ${conDato}`);

const [ya] = await searchRead("ir.ui.view", [["name", "=", VISTA]], ["id"]);
console.log(`2) ${ya ? `${VISTA} ya existe (#${ya.id}), se actualiza` : `${VISTA} — se crearía`}`);

if (!APLICAR) {
  console.log("\nNo se escribió nada. Para aplicar: --aplicar");
  process.exit(0);
}

// ── Aplicar ─────────────────────────────────────────────────────────────────
if (ya) {
  await write("ir.ui.view", [ya.id], { arch_db: ARCH, priority: 17, active: true });
  console.log(`   ✓ vista #${ya.id} actualizada`);
} else {
  const id = await create("ir.ui.view", {
    name: VISTA, model: MODEL, type: "form", inherit_id: padre.id, mode: "extension",
    // 17: justo después del formulario base (16), antes que el resto de los agregados.
    priority: 17, arch_db: ARCH, active: true,
  });
  console.log(`   ✓ vista #${id} creada`);
}

// ── Verificar ───────────────────────────────────────────────────────────────
//
// Se pide el form POR DEFECTO —sin fijar vista— que es exactamente lo que hacen las
// acciones de los menús. Mirar la vista propia daría OK sin probar el camino real.
try {
  const d = await executeKw(MODEL, "get_views", [[[false, "form"]]], {});
  const arch = d.views.form.arch;
  console.log(`\n3) El formulario por defecto: ${arch.includes("x_ejecutado_real") ? "SÍ muestra el campo ✓" : "NO lo muestra ✗"} (${arch.length} chars)`);
} catch (e) {
  console.log(`\n3) ✗ el formulario NO abre: ${String(e.message).slice(0, 200)}`);
  console.log("   ⚠ REVERTIR: desactivar la vista recién creada.");
}

// Y que una OT con dato se pueda abrir de verdad.
const [ejemplo] = await searchRead(MODEL, [["x_ejecutado_real", "!=", false]], ["x_name", "x_ejecutado_real"], { limit: 1 });
if (ejemplo) {
  console.log(`\n   Ejemplo para mirar en Odoo — OT #${ejemplo.id}:`);
  console.log(`   ${String(ejemplo.x_name).slice(0, 70)}`);
  console.log(`   → "${String(ejemplo.x_ejecutado_real).slice(0, 100)}"`);
}

console.log("\n✅ Listo. Las OTs muestran lo que quedó ejecutado.");
