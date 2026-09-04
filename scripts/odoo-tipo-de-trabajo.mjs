// Qué se arma, en la solapa "Trabajo a ejecutar" de la orden de alquiler.
//
// EL PROBLEMA: la orden dice cuánto dura el trabajo y con cuánta gente, pero no QUÉ es.
// "Andamio de fachada, 12 m de frente x 9 m de altura" es texto libre en x_alcance_tecnico:
// sirve para leerlo, no para filtrar, agrupar ni mandarle nada a Operaciones.
//
// LA FORMA: primero el ámbito —obra o evento— y recién después el tipo, porque las dos
// listas no se mezclan nunca: una tribuna no es un tipo de obra y una torre no es un tipo
// de evento. Un solo campo con las diez opciones juntas dejaría elegir "Escenario" en una
// obra de fachada, y una selección de Odoo no se puede filtrar por el valor de otro campo.
// Por eso son DOS campos con visibilidad condicional, que es lo que sí sabe hacer la vista.
//
// EL ALAMBRE es la concertina que va sobre la bandeja de protección para que no se trepen.
// Sólo tiene sentido donde hay bandeja, así que aparece únicamente en los tres tipos que la
// llevan. OJO: si alguien lo tilda y después cambia el tipo a Torre, el valor queda en true
// pero escondido. Se documenta acá porque quien lo consuma tiene que mirar TAMBIÉN el tipo,
// no sólo el booleano (ver el pie de este archivo).
//
// SYH PRESENCIAL va en todas, obra o evento.
//
// POR QUÉ SELECCIÓN Sí/No Y NO UN CHECK: en un check, "sin tildar" y "no lleva" son el
// mismo pixel, y acá no son lo mismo — que nadie haya contestado si hace falta un servicio
// de Seguridad e Higiene en obra no es lo mismo que haber decidido que no hace falta. El
// alambre sí es un check, porque ahí no tildar significa que no lleva y ya.
//
// Idempotente: se puede re-correr sin duplicar.
//
// Correr:
//   node --env-file=.env.local scripts/odoo-tipo-de-trabajo.mjs            (sólo mira)
//   node --env-file=.env.local scripts/odoo-tipo-de-trabajo.mjs --aplicar  (escribe)

import { version, authenticate, searchRead, create, write, fieldsGet } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");
const MODEL = "sale.order";
const VISTA = "sale.order.form.aba.tipo.trabajo";

// Los `value` son los que va a leer la app: en minúscula, sin acentos y estables. Las
// etiquetas se pueden retocar sin romper nada; los valores no.
const TIPOS_OBRA = [
  ["pantalla_proteccion", "Pantalla de protección"],
  ["estructura_pantalla", "Estructura + pantalla"],
  ["estructura_sin_pantalla", "Estructura sin pantalla"],
  ["torre", "Torre"],
  ["plataforma", "Plataforma"],
  ["sercha", "Sercha"],
  ["apuntalamiento_vertical", "Apuntalamiento vertical"],
];

const TIPOS_EVENTO = [
  ["tribuna", "Tribuna"],
  ["escenario", "Escenario"],
  ["otros", "Otros"],
];

/** Los únicos tipos que llevan bandeja de protección, o sea los únicos que pueden llevar alambre. */
const CON_BANDEJA = ["pantalla_proteccion", "estructura_pantalla", "estructura_sin_pantalla"];

const opciones = (pares) =>
  pares.map(([value, name], i) => [0, 0, { value, name, sequence: (i + 1) * 10 }]);

const CAMPOS = [
  {
    name: "x_trabajo_ambito",
    field_description: "Tipo de trabajo",
    ttype: "selection",
    // Sin valor por defecto: que una orden vieja aparezca vacía es correcto —nadie la
    // clasificó— y forzar "obra" llenaría el histórico de datos inventados.
    selection_ids: opciones([["obra", "Obra"], ["evento", "Evento"]]),
  },
  {
    name: "x_trabajo_obra",
    field_description: "Tipo de obra",
    ttype: "selection",
    selection_ids: opciones(TIPOS_OBRA),
  },
  {
    name: "x_trabajo_evento",
    field_description: "Tipo de evento",
    ttype: "selection",
    selection_ids: opciones(TIPOS_EVENTO),
  },
  {
    name: "x_alambre_concertina",
    field_description: "Lleva alambre de concertina",
    ttype: "boolean",
  },
  {
    name: "x_syh_presencial",
    field_description: "SyH presencial",
    ttype: "selection",
    selection_ids: opciones([["si", "Sí"], ["no", "No"]]),
  },
];

// SE CUELGA DEL CAMPO, NO DEL SEPARADOR. El ancla natural era el separador de
// "Programación de los trabajos", pero Odoo 19 rechaza la vista entera con "View
// inheritance may not use attribute 'string' as a selector": en herencia sólo se puede
// seleccionar por `name`, y un separator no tiene. Anclar a x_alcance_tecnico deja el
// bloque en el mismo lugar —la programación se agrega después, al final de la página— y
// además es un ancla más estable, porque el texto del separador se puede reescribir.
//
// Prioridad 32 para cargar después de la vista de programación (31).
// Queda: alcance técnico → qué se arma → cuánto lleva.
const ARCH = `<data>
  <xpath expr="//field[@name='x_alcance_tecnico']" position="after">
    <separator string="Qué se arma"/>
    <div class="text-muted">
      <p>Primero si es obra o evento; según eso cambian los tipos. Es lo que después
         permite filtrar y mandarle el trabajo a Operaciones sin leer el párrafo técnico.</p>
    </div>
    <group>
      <group>
        <field name="x_trabajo_ambito"/>
        <field name="x_trabajo_obra" invisible="x_trabajo_ambito != 'obra'"/>
        <field name="x_trabajo_evento" invisible="x_trabajo_ambito != 'evento'"/>
        <!-- El alambre va sobre la bandeja de protección: sólo existe donde hay bandeja. -->
        <field name="x_alambre_concertina"
               invisible="x_trabajo_ambito != 'obra' or x_trabajo_obra not in ${JSON.stringify(CON_BANDEJA).replace(/"/g, "'")}"/>
      </group>
      <group>
        <field name="x_syh_presencial" widget="radio" options="{'horizontal': true}"/>
      </group>
    </group>
  </xpath>
</data>`;

// ── Mirar ───────────────────────────────────────────────────────────────────

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}\n`);

const [modelo] = await searchRead("ir.model", [["model", "=", MODEL]], ["id"]);
if (!modelo) throw new Error(`No existe el modelo ${MODEL}`);

const existentes = await fieldsGet(MODEL, ["type"]);
console.log("Campos:");
for (const c of CAMPOS) {
  console.log(`  ${c.name in existentes ? "ya existe" : "FALTA   "}  ${c.name.padEnd(24)} ${c.ttype}`);
}

// El ancla de la vista tiene que existir, si no el xpath revienta al renderizar el form.
const [programacion] = await searchRead(
  "ir.ui.view",
  [["model", "=", MODEL], ["name", "=", "sale.order.form.aba.programacion"]],
  ["id", "priority"],
);
console.log(
  programacion
    ? `\nAncla: vista #${programacion.id} (prioridad ${programacion.priority}) — ok, ésta va con 32`
    : "\n⚠ NO existe sale.order.form.aba.programacion: el xpath no tendría dónde colgarse",
);
if (!programacion) throw new Error("Falta la vista ancla");

const [yaEsta] = await searchRead("ir.ui.view", [["name", "=", VISTA]], ["id"]);
console.log(yaEsta ? `Vista ${VISTA}: ya existe (#${yaEsta.id}), se actualiza el arch` : `Vista ${VISTA}: se crea`);

if (!APLICAR) {
  console.log("\nNo se escribió nada. Para aplicar: --aplicar");
  process.exit(0);
}

// ── Aplicar ─────────────────────────────────────────────────────────────────

for (const campo of CAMPOS) {
  if (campo.name in existentes) {
    console.log(`· ${campo.name} ya existe, no se toca`);
    continue;
  }
  await create("ir.model.fields", {
    model_id: modelo.id,
    model: MODEL,
    state: "manual",
    ...campo,
  });
  console.log(`✓ ${campo.name} creado`);
}

const [padre] = await searchRead(
  "ir.ui.view",
  [["model", "=", MODEL], ["name", "=", "sale.order.form.aba.alcance.tecnico"]],
  ["id", "inherit_id"],
);

if (yaEsta) {
  await write("ir.ui.view", [yaEsta.id], { arch_db: ARCH, priority: 32 });
  console.log(`✓ vista #${yaEsta.id} actualizada`);
} else {
  const id = await create("ir.ui.view", {
    name: VISTA,
    model: MODEL,
    type: "form",
    inherit_id: padre?.inherit_id ? padre.inherit_id[0] : undefined,
    mode: "extension",
    priority: 32,
    arch_db: ARCH,
    active: true,
  });
  console.log(`✓ vista #${id} creada`);
}

// ── Verificar ───────────────────────────────────────────────────────────────

const despues = await fieldsGet(MODEL, ["type", "selection"]);
console.log("\nDESPUÉS:");
for (const c of CAMPOS) {
  const f = despues[c.name];
  console.log(`  ${c.name.padEnd(24)} ${f ? f.type : "NO EXISTE"}  ${f?.selection ? JSON.stringify(f.selection) : ""}`);
}

console.log(`
OJO para quien consuma esto:
  · el alambre puede quedar en true y escondido si alguien lo tilda y después cambia el
    tipo. Al leerlo hay que exigir además que x_trabajo_obra esté en
    ${JSON.stringify(CON_BANDEJA)}.
  · x_trabajo_obra y x_trabajo_evento son excluyentes por vista, no por constraint: el
    que corresponde según x_trabajo_ambito es el único que hay que mirar.`);
