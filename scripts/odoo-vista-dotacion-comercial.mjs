// PRECONDICIÓN del módulo de partes — dotación prevista en el form de Comercial.
//
// x_personal_por_jornada es lo que precarga la cantidad de personas del parte. Está en
// 945 de las 1003 OTs históricas, pero sólo en 14 de las 48 activas: las OTs nuevas
// nacen sin el dato porque el campo NO está en la vista que usa el botón "Nueva Orden de
// Trabajo". Medido: las 8 OTs activas más recientes tienen todas pers = 0.
//
// Sin esto, cuando Pepo cargue el parte tiene que tipear el personal casi siempre, que es
// justo la fricción que el módulo intenta evitar. Y la cantidad de personas es lo que
// multiplica las horas-hombre, o sea el costo de mano de obra y el margen de la venta.
//
// Va al lado de la duración estimada, que es donde ya se está estimando el trabajo: el
// texto de ayuda de esa sección incluso habla de "una cuadrilla de 5 armadores".
//
// Idempotente, con vista heredada. Para revertir, borrarla.
// Correr: node --env-file=.env.local scripts/odoo-vista-dotacion-comercial.mjs
import { authenticate, searchRead, create, executeKw } from "./odoo-rpc.mjs";

const MODEL = "x_aba_orden_trabajo";
const NOMBRE = "x_aba_orden_trabajo.form.comercial.dotacion";

await authenticate();

const [base] = await searchRead(
  "ir.ui.view",
  [["name", "=", "x_aba_orden_trabajo.form.comercial"], ["model", "=", MODEL]],
  ["id"],
);
if (!base) throw new Error("No existe x_aba_orden_trabajo.form.comercial");

const arch = `<data>
   <xpath expr="//field[@name='x_duracion_est']" position="after">
     <field name="x_personal_por_jornada" required="x_tipo == 'armado'"/>
     <div colspan="2" class="text-muted">
       <p>Cuántas personas van por jornada. Es lo que después precarga el parte diario, y
       lo que multiplica las horas-hombre que van al costo de la obra.</p>
     </div>
   </xpath>
 </data>`;

const [existente] = await searchRead("ir.ui.view", [["name", "=", NOMBRE]], ["id"]);
if (existente) {
  await executeKw("ir.ui.view", "write", [[existente.id], { arch, active: true }]);
  console.log(`· ${NOMBRE} actualizada (id=${existente.id})`);
} else {
  const id = await create("ir.ui.view", {
    name: NOMBRE, model: MODEL, inherit_id: base.id, mode: "extension", priority: 22, arch,
  });
  console.log(`✓ ${NOMBRE} creada (id=${id})`);
}

const vista = await executeKw(MODEL, "get_view", [base.id, "form"]);
console.log(`\n${vista.arch.includes("x_personal_por_jornada") ? "✓" : "✗"} el campo aparece en el form de Comercial`);

const activas = await searchRead(MODEL, [["x_estado", "in", ["pendiente", "en_proceso"]]], ["x_personal_por_jornada"]);
const con = activas.filter((o) => o.x_personal_por_jornada > 0).length;
console.log(`\nOTs activas con dotación: ${con}/${activas.length}`);
console.log("Las que ya existen siguen en cero: hay que completarlas a mano o se van a");
console.log("cargar con el campo de personas vacío (que es el comportamiento correcto).");
