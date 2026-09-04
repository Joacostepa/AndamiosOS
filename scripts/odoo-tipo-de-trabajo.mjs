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

import { version, authenticate, searchRead, create, write, executeKw, fieldsGet } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");
const MODEL = "sale.order";
const VISTA = "sale.order.form.aba.tipo.trabajo";

// ─── Desde cuándo se exige clasificar ───────────────────────────────────────
//
// OBLIGATORIOS AL CONFIRMAR, PERO SÓLO EN LAS ÓRDENES NUEVAS.
//
// Al confirmar y no en el borrador: armar un presupuesto lleva varios ratos y no se puede
// exigir clasificar el trabajo para poder guardarlo a medias. Pasar de cotización a orden
// de venta sí es el momento en que el trabajo se vuelve real.
//
// Y sólo las nuevas por un dato medido: hay 872 órdenes confirmadas y 748 tienen vacío
// x_dur_armado, que YA es obligatorio en ese estado. O sea que esas 748 hoy no se pueden
// guardar sin completar la duración. Sumarles cinco campos más convertiría cualquier
// edición de una orden vieja —cambiar un método de pago— en un formulario de alta.
const FECHA_CORTE = "2026-09-04";

// EL ANCLA ES date_order, NO create_date. Verificado contra la base: Odoo pisa date_order
// con el momento de la confirmación —S01415 se creó en abril y su date_order es del 3 de
// septiembre, el día que se confirmó—. Eso es exactamente lo que hace falta:
//
//   · las 872 ya confirmadas tienen date_order viejo    → no se les pide nada
//   · las 1533 cotizaciones abiertas, al confirmarse    → date_order salta a hoy y sí
//   · las nuevas                                        → sí
//
// Con create_date, en cambio, esas 1533 cotizaciones que ya están en la calle se
// confirmarían sin clasificar nunca, que es justo el trabajo que viene.
//
// POR QUÉ UN CAMPO CALCULADO Y NO date_order DIRECTO EN LA VISTA: el modificador se evalúa
// en el cliente, y desde Odoo 17 los datetime llegan al navegador como objetos y no como
// texto, así que comparar `date_order >= '2026-09-04'` ahí depende de cómo el web client
// serializa el valor — no es contrato público y cambia entre versiones. Del lado del
// servidor la comparación es inequívoca.
const CAMPO_EXIGE = "x_exige_clasificacion";
const COMPUTE_EXIGE = `for rec in self:
    f = rec['date_order']
    rec['${CAMPO_EXIGE}'] = bool(f) and str(f)[:10] >= '${FECHA_CORTE}'
`;

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
    // ARRANCÓ SIENDO UN CHECK Y NO ALCANZABA. En un check, "sin tildar" y "no lleva" son
    // el mismo pixel, y siendo obligatorio hay que poder distinguirlos: la pregunta se
    // contesta, no se omite. Mismo criterio que SyH.
    name: "x_alambre_concertina",
    field_description: "Lleva alambre de concertina",
    ttype: "selection",
    selection_ids: opciones([["si", "Sí"], ["no", "No"]]),
  },
  {
    name: "x_syh_presencial",
    field_description: "SyH presencial",
    ttype: "selection",
    selection_ids: opciones([["si", "Sí"], ["no", "No"]]),
  },
  {
    name: CAMPO_EXIGE,
    field_description: "Exige clasificar el trabajo",
    ttype: "boolean",
    store: true,
    readonly: true,
    depends: "date_order",
    compute: COMPUTE_EXIGE,
  },
];

// ─── El bloqueo de verdad ───────────────────────────────────────────────────
//
// UN `required` DE VISTA NO BLOQUEA EL BOTÓN CONFIRMAR. Es una validación del formulario:
// impide GUARDAR, y confirmar es una llamada al servidor sobre un registro ya guardado. El
// resultado sería un campo en rojo DESPUÉS de confirmar —un recordatorio, no un candado—
// que es exactamente el problema que se quería resolver: si tienden a olvidarse, avisarles
// cuando ya es tarde no alcanza. (Es lo que hoy le pasa a x_dur_armado: 748 confirmadas lo
// tienen vacío.)
//
// Por eso el corte va en una automatización sobre la TRANSICIÓN de estado. Se dispara sólo
// cuando la orden pasa de cotización a confirmada —no en cada write— para no romperle las
// escrituras a la app, que le toca el permiso y la programación a órdenes ya confirmadas.
//
// El detalle de qué falta va en el mensaje, no en el dominio: un dominio con cinco ramas
// alternativas sería ilegible y además no podría decir cuál falta.
const AUTOMATIZACION = "ABA — Exigir clasificación del trabajo al confirmar";

// MIRA date_order DIRECTO Y NO x_exige_clasificacion: el campo calculado depende de
// date_order, y date_order lo pisa Odoo en la MISMA transacción que la confirmación.
// Depender de que el recálculo haya corrido antes que la automatización sería apoyarse en
// un orden que nadie garantiza. Del lado del servidor la fecha es un datetime de verdad,
// así que la comparación no tiene la ambigüedad que sí tendría en la vista.
//
// EN LA PRÁCTICA EL CORTE NO DEJA PASAR NINGUNA CONFIRMACIÓN: comprobado empujando una
// fecha vieja a mano y confirmando igual, Odoo la pisa con el momento de la confirmación,
// así que toda confirmación de acá en más queda alcanzada. Eso es lo que se buscaba. El
// corte queda igual porque describe la intención y protege el caso de que alguien
// reconfirme una orden vieja: ahí también corresponde clasificarla.
const CODIGO_BLOQUEO = `faltan = []
for rec in records:
    if not rec.date_order or str(rec.date_order)[:10] < '${FECHA_CORTE}':
        continue
    f = []
    if not rec.x_trabajo_ambito:
        f.append('Tipo de trabajo (obra o evento)')
    elif rec.x_trabajo_ambito == 'obra':
        if not rec.x_trabajo_obra:
            f.append('Tipo de obra')
        elif rec.x_trabajo_obra in ${JSON.stringify(CON_BANDEJA).replace(/"/g, "'")} and not rec.x_alambre_concertina:
            f.append('Si lleva alambre de concertina')
    elif rec.x_trabajo_ambito == 'evento' and not rec.x_trabajo_evento:
        f.append('Tipo de evento')
    if not rec.x_syh_presencial:
        f.append('SyH presencial')
    if f:
        faltan.append(rec.name + ' → ' + ', '.join(f))
if faltan:
    raise UserError('Falta completar "Qué se arma", en la solapa Trabajo a ejecutar:\\n\\n' + '\\n'.join(faltan))
`;

// SE CUELGA DEL CAMPO, NO DEL SEPARADOR. El ancla natural era el separador de
// "Programación de los trabajos", pero Odoo 19 rechaza la vista entera con "View
// inheritance may not use attribute 'string' as a selector": en herencia sólo se puede
// seleccionar por `name`, y un separator no tiene. Anclar a x_alcance_tecnico deja el
// bloque en el mismo lugar —la programación se agrega después, al final de la página— y
// además es un ancla más estable, porque el texto del separador se puede reescribir.
//
// Prioridad 32 para cargar después de la vista de programación (31).
// Queda: alcance técnico → qué se arma → cuánto lleva.
const LISTA_BANDEJA = JSON.stringify(CON_BANDEJA).replace(/"/g, "'");

/** Obligatorio al confirmar, y sólo en las órdenes nuevas. Ver FECHA_CORTE. */
const EXIGE = `${CAMPO_EXIGE} and state in ('sale', 'done')`;

const ARCH = `<data>
  <xpath expr="//field[@name='x_alcance_tecnico']" position="after">
    <!-- Un campo usado en un modificador tiene que estar en la vista o Odoo rompe el
         formulario entero al renderizarlo. -->
    <field name="${CAMPO_EXIGE}" invisible="1"/>
    <separator string="Qué se arma"/>
    <div class="text-muted">
      <p>Primero si es obra o evento; según eso cambian los tipos. Es lo que después
         permite filtrar y mandarle el trabajo a Operaciones sin leer el párrafo técnico.
         Hace falta para confirmar la orden, no para guardar la cotización.</p>
    </div>
    <group>
      <group>
        <field name="x_trabajo_ambito" required="${EXIGE}"/>
        <field name="x_trabajo_obra"
               invisible="x_trabajo_ambito != 'obra'"
               required="${EXIGE} and x_trabajo_ambito == 'obra'"/>
        <field name="x_trabajo_evento"
               invisible="x_trabajo_ambito != 'evento'"
               required="${EXIGE} and x_trabajo_ambito == 'evento'"/>
        <!-- El alambre va sobre la bandeja de protección: sólo existe donde hay bandeja,
             y donde existe hay que contestarlo. -->
        <field name="x_alambre_concertina" widget="radio" options="{'horizontal': true}"
               invisible="x_trabajo_ambito != 'obra' or x_trabajo_obra not in ${LISTA_BANDEJA}"
               required="${EXIGE} and x_trabajo_ambito == 'obra' and x_trabajo_obra in ${LISTA_BANDEJA}"/>
      </group>
      <group>
        <field name="x_syh_presencial" widget="radio" options="{'horizontal': true}"
               required="${EXIGE}"/>
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

// EL CAMBIO DE TIPO DEL ALAMBRE. Empezó siendo booleano y pasa a ser selección Sí/No.
// Odoo no deja borrar un campo mientras una vista lo referencia, así que hay que
// desactivar la vista primero. Se comprueba antes que nadie lo haya cargado: si alguien
// lo hubiera tildado, borrar el campo tiraría ese dato a la basura en silencio.
if (yaEsta && existentes.x_alambre_concertina?.type === "boolean") {
  const usados = await executeKw(MODEL, "search_count", [[["x_alambre_concertina", "=", true]]]);
  if (usados > 0) {
    throw new Error(
      `x_alambre_concertina es booleano y ya tiene ${usados} órdenes en true. ` +
        `Migrar esos valores a la selección antes de cambiar el tipo.`,
    );
  }
  await write("ir.ui.view", [yaEsta.id], { active: false });
  const [f] = await searchRead(
    "ir.model.fields",
    [["model", "=", MODEL], ["name", "=", "x_alambre_concertina"]],
    ["id"],
  );
  await executeKw("ir.model.fields", "unlink", [[f.id]]);
  delete existentes.x_alambre_concertina;
  console.log("✓ x_alambre_concertina booleano borrado (0 órdenes lo usaban) — se recrea como Sí/No");
}

for (const campo of CAMPOS) {
  if (campo.name in existentes) {
    // El único que se re-escribe es el calculado: su fórmula y su `depends` son
    // justamente lo que puede cambiar entre corridas (pasó de create_date a date_order).
    // Los demás son datos que carga la gente y pisarlos no aportaría nada.
    if (campo.compute) {
      const [f] = await searchRead(
        "ir.model.fields",
        [["model", "=", MODEL], ["name", "=", campo.name]],
        ["id", "compute", "depends"],
      );
      if (f.compute !== campo.compute || f.depends !== campo.depends) {
        await write("ir.model.fields", [f.id], { compute: campo.compute, depends: campo.depends });
        console.log(`✓ ${campo.name}: compute y depends actualizados`);
        // Cambiar la fórmula NO recalcula lo guardado: Odoo sólo recalcula lo que tiene
        // marcado como sucio. Hay que marcarlo a mano, y eso es código del lado del
        // servidor — de ahí la acción temporal, que se borra al terminar.
        const accion = await create("ir.actions.server", {
          name: "AndamiosOS — recálculo temporal de x_exige_clasificacion",
          model_id: modelo.id,
          state: "code",
          code: `recs = env['${MODEL}'].search([])
env.add_to_compute(recs._fields['${campo.name}'], recs)
env.flush_all()`,
        });
        try {
          await executeKw("ir.actions.server", "run", [[accion]], {
            context: { active_model: MODEL, active_id: 0, active_ids: [] },
          });
          console.log(`✓ ${campo.name} recalculado en todas las órdenes`);
        } finally {
          await executeKw("ir.actions.server", "unlink", [[accion]]);
        }
      } else {
        console.log(`· ${campo.name} ya existe y su fórmula está al día`);
      }
      continue;
    }
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
  await write("ir.ui.view", [yaEsta.id], { arch_db: ARCH, priority: 32, active: true });
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

// ── El bloqueo al confirmar ─────────────────────────────────────────────────

const [campoEstado] = await searchRead(
  "ir.model.fields",
  [["model", "=", MODEL], ["name", "=", "state"]],
  ["id"],
);

const [autoExiste] = await searchRead("base.automation", [["name", "=", AUTOMATIZACION]], ["id"]);

const valoresAuto = {
  name: AUTOMATIZACION,
  model_id: modelo.id,
  // Sólo cuando se TOCA el estado, y sólo en el salto de cotización a confirmada. Sin
  // esto la regla correría en cada write y le rompería las escrituras a la app, que le
  // toca el permiso y la programación a órdenes ya confirmadas.
  trigger: "on_create_or_write",
  trigger_field_ids: [[6, 0, [campoEstado.id]]],
  filter_pre_domain: JSON.stringify([["state", "in", ["draft", "sent"]]]),
  filter_domain: JSON.stringify([["state", "in", ["sale", "done"]]]),
  active: true,
};

if (autoExiste) {
  await write("base.automation", [autoExiste.id], valoresAuto);
  const acciones = await searchRead(
    "ir.actions.server",
    [["base_automation_id", "=", autoExiste.id]],
    ["id"],
  );
  if (acciones.length) {
    await write("ir.actions.server", [acciones[0].id], { state: "code", code: CODIGO_BLOQUEO });
    console.log(`✓ automatización #${autoExiste.id} actualizada`);
  }
} else {
  const autoId = await create("base.automation", valoresAuto);
  await create("ir.actions.server", {
    name: AUTOMATIZACION,
    model_id: modelo.id,
    state: "code",
    code: CODIGO_BLOQUEO,
    base_automation_id: autoId,
    usage: "base_automation",
  });
  console.log(`✓ automatización #${autoId} creada`);
}

// Lo que de verdad importa comprobar: a quién le va a pedir los campos y a quién no.
const cuenta = (dom) => executeKw(MODEL, "search_count", [dom]);
const confirmadas = await cuenta([["state", "in", ["sale", "done"]]]);
const exigidas = await cuenta([["state", "in", ["sale", "done"]], [CAMPO_EXIGE, "=", true]]);
const viejas = await cuenta([["state", "in", ["sale", "done"]], [CAMPO_EXIGE, "=", false]]);
const borradores = await cuenta([["state", "in", ["draft", "sent"]], [CAMPO_EXIGE, "=", true]]);

console.log(`\n=== A quién se le exige clasificar (corte: ${FECHA_CORTE}) ===`);
console.log(`  confirmadas en total:                    ${confirmadas}`);
console.log(`  · nuevas, SÍ se les exige:               ${exigidas}`);
console.log(`  · viejas, NO se tocan:                   ${viejas}`);
console.log(`  cotizaciones nuevas (se exigirá al confirmar): ${borradores}`);
if (exigidas + viejas !== confirmadas) {
  console.log("  ⚠ los números no cierran: el compute no llegó a todas las órdenes");
}

console.log(`
OJO para quien consuma esto:
  · el alambre puede quedar en true y escondido si alguien lo tilda y después cambia el
    tipo. Al leerlo hay que exigir además que x_trabajo_obra esté en
    ${JSON.stringify(CON_BANDEJA)}.
  · x_trabajo_obra y x_trabajo_evento son excluyentes por vista, no por constraint: el
    que corresponde según x_trabajo_ambito es el único que hay que mirar.`);
