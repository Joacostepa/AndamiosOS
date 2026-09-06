// A quién de la obra hay que mandarle la documentación de SyH de nuestra gente.
//
// EL PROBLEMA: la obra exige papeles —ART, curso de altura, psicofísico— antes de dejar
// entrar a la cuadrilla, y alguien del otro lado los recibe y los aprueba. Hoy ese alguien
// no está en ningún lado. El módulo de Habilitaciones está construido entero alrededor de
// ese ida y vuelta —sus etapas son "falta consultarle al cliente qué pide", "el cliente
// tiene que decir qué papeles pide", "el cliente tiene que validar lo que le mandamos", y
// sus gestiones son consulta, reclamo, envío, aprobación— pero no guarda CON QUIÉN. Puede
// demostrar que se reclamó tres veces desde el 4 de agosto y no a quién se le reclamó.
//
// NO CONFUNDIR CON x_syh_presencial, que vive en la misma solapa y significa lo contrario:
// si NOSOTROS tenemos que poner un técnico de Seguridad e Higiene en la obra. Éste es a
// quién le mandamos papeles para que nos habiliten. De ahí el prefijo x_hab_: pertenece al
// circuito de la habilitación, no a la clasificación del trabajo. El nombre importa —al
// leer el código por primera vez entendí uno por el otro— y dos grupos de campos "SyH" a
// diez centímetros que hablan de cosas opuestas se confunden solos.
//
// POR QUÉ TRES CAMPOS DE TEXTO Y NO UN CONTACTO DE VERDAD (un many2one a res.partner):
// por fricción, que en esta base es lo que decide si un campo existe o queda vacío. Los
// campos que obligan a un desvío no se cargan: x_syh_presencial está contestado en 2
// órdenes, x_permiso_modalidad rondaba el 2%, x_contacto_obra el 12%. Crear o buscar un
// contacto son dos o tres clics más en el momento en que Comercial está anotando un dato
// suelto. Se pierde poder reusar la persona entre obras y poder mandarle un mail desde
// Odoo; si algún día pesa, migrar a many2one es mecánico (se cruzan por nombre y mail).
//
// Y hay un motivo más: res.partner NO TIENE `mobile` en esta versión —sólo `phone`— así
// que ni siquiera apuntando a un contacto se conseguía el celular aparte.
//
// EL BOTÓN "Traer del cliente" existe porque en muchos casos es la misma persona que el
// contacto de la orden. De dónde saca cada dato está explicado abajo, en CODIGO_TRAER, y
// no es obvio: el partner de la orden casi nunca es una persona. Medido sobre 400 órdenes
// confirmadas, 157 de los 345 contactos usados no tienen ni teléfono ni mail, así que el
// botón no resuelve solo — ahorra tipeo cuando el dato está.
//
// NUNCA BORRA: si el origen no tiene el dato, el campo se queda como estaba. Apretar el
// botón no puede dejarte peor que antes.
//
// OBLIGATORIOS AL CONFIRMAR, SÓLO EN OBRA Y SÓLO EN LAS NUEVAS.
//   · Al confirmar y no en el borrador: armar un presupuesto lleva varios ratos.
//   · Sólo en contratos "Obra ": un Simple —módulo hogareño— no pasa por habilitación, y
//     un bloqueo que no distinguiera dejaría a Comercial sin poder cerrar ventas chicas.
//   · Sólo en las nuevas: se reutiliza x_exige_clasificacion, el calculado que ya marca
//     las órdenes con date_order >= 2026-09-04. Se comprobó que a esa fecha hay UNA sola
//     orden Obra confirmada, así que reusarlo en vez de estrenar otro campo con otra fecha
//     cuesta exactamente esa orden y evita tener dos definiciones de "nueva" conviviendo.
//     Lo que viene de verdad son las 1458 cotizaciones Obra abiertas: al confirmarse, su
//     date_order salta a hoy y todas van a pedir el dato.
//
// Idempotente: se puede re-correr sin duplicar.
//
// Correr:
//   node --env-file=.env.local scripts/odoo-contacto-syh-orden.mjs            (sólo mira)
//   node --env-file=.env.local scripts/odoo-contacto-syh-orden.mjs --aplicar  (escribe)

import { version, authenticate, searchRead, create, write, executeKw, fieldsGet } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");
const MODEL = "sale.order";
const VISTA = "sale.order.form.aba.syh.contacto";
const AUTOMATIZACION = "ABA — Exigir contacto de SyH al confirmar";
const ACCION_TRAER = "ABA — Traer contacto de SyH del cliente";

// El calculado que ya marca "esta orden es nueva". Se reusa, no se duplica: ver el
// encabezado. Si alguien lo borra, este script avisa antes de escribir nada.
const CAMPO_EXIGE = "x_exige_clasificacion";

const CAMPOS = [
  {
    name: "x_hab_syh_nombre",
    field_description: "SyH de la obra — nombre y apellido",
    ttype: "char",
  },
  {
    name: "x_hab_syh_celular",
    field_description: "SyH de la obra — celular",
    ttype: "char",
  },
  {
    name: "x_hab_syh_email",
    field_description: "SyH de la obra — email",
    ttype: "char",
  },
];

// ── El botón ────────────────────────────────────────────────────────────────
//
// Pisa lo que haya, porque apretarlo es un gesto explícito: si alguien lo aprieta con el
// campo lleno es porque quiere el dato del cliente. Lo que NO hace es vaciar: un origen
// sin teléfono deja el teléfono como estaba en vez de borrarlo.
// DE DÓNDE SALE EL NOMBRE, que no es obvio y casi lo hago mal.
//
// El `partner_id` de una orden Obra NO es una persona: medido sobre 400 confirmadas, en
// 313 es el contacto de la OBRA —type 'delivery'— cuyo nombre ES la dirección ("Alsina
// 2028", "GUIDO 1557 CABA"). Copiar p.name a secas ponía una calle en "Nombre y apellido"
// en dos de cada tres órdenes.
//
// El nombre de la persona está en dos lugares, y en ese orden de calidad:
//   1. Entre paréntesis dentro del teléfono: "11-5527-2517 (Tiara Arancibia)". Es una
//      convención que la oficina ya usa —46 de 345 contactos la tienen— y es el único
//      lugar donde figura una persona de verdad.
//   2. El contacto PADRE, que es el cliente real (281 de 345 tienen padre). Suele ser un
//      consorcio y no una persona, pero es infinitamente mejor que una dirección.
//
// Cuando el contacto es de tipo 'contact' (85 casos) su nombre YA es el del cliente y se
// usa tal cual: ahí no hay dirección de la que defenderse.
//
// Sin regex a propósito: el código de una acción de servidor corre en un sandbox sin
// `import`, así que el paréntesis se parte a mano.
const CODIGO_TRAER = `for rec in records:
    p = rec.partner_id
    padre = p.parent_id if p else False
    crudo = (p.phone if p else '') or ''
    persona = False
    numero = crudo.strip()
    if '(' in crudo and ')' in crudo:
        dentro = crudo.split('(', 1)[1].split(')', 1)[0].strip()
        if len(dentro) >= 3:
            persona = dentro
        numero = crudo.split('(', 1)[0].strip() or crudo.strip()
    es_persona = bool(p) and p.type == 'contact'
    nombre = (p.name if es_persona else False) or persona or (padre.name if padre else False) or (p.name if p else False)
    tel = numero or (padre.phone if padre else False)
    mail = (p.email if p else False) or (padre.email if padre else False)
    vals = {}
    if nombre:
        vals['x_hab_syh_nombre'] = nombre
    if tel:
        vals['x_hab_syh_celular'] = tel
    if mail:
        vals['x_hab_syh_email'] = mail
    if vals:
        rec.write(vals)
`;

// ── El bloqueo ──────────────────────────────────────────────────────────────
//
// Espeja exactamente la condición de la vista. Tiene que estar en los dos lados: el
// `required` del formulario es comodidad —marca el campo en rojo antes de guardar— y esto
// es la regla, porque una orden se puede confirmar por fuera del formulario (importación,
// otra vista, la API).
const CODIGO_BLOQUEO = `faltan = []
for rec in records:
    if rec.x_studio_tipo_de_contrato != 'Obra ':
        continue
    if not rec.${CAMPO_EXIGE}:
        continue
    f = []
    if not rec.x_hab_syh_nombre:
        f.append('Nombre y apellido')
    if not rec.x_hab_syh_celular:
        f.append('Celular')
    if not rec.x_hab_syh_email:
        f.append('Email')
    if f:
        faltan.append(rec.name + ' → ' + ', '.join(f))
if faltan:
    raise UserError('Falta el contacto de SyH de la obra, en la solapa Trabajo a ejecutar.\\n\\nEs a quien hay que mandarle la documentacion de nuestro personal para que nos habiliten a entrar. Si es la misma persona que el contacto de la orden, usa el boton "Traer del cliente".\\n\\n' + '\\n'.join(faltan))
`;

/**
 * La vista.
 *
 * SE CUELGA DE LA PÁGINA POR SU `name`, no de un campo: la solapa la crea
 * sale.order.form.aba.alcance.tecnico con name="aba_alcance", y `position="inside"` deja
 * este bloque AL FINAL de la solapa sin depender de qué otra vista haya insertado antes.
 * Anclar a un campo obligaría a competir por prioridad con las otras dos que ya cuelgan
 * del mismo lugar.
 *
 * NO SE REDECLARAN x_studio_tipo_de_contrato NI x_exige_clasificacion aunque los use el
 * modificador: los declaran las vistas de prioridad 31 y 32, que se aplican antes que
 * ésta (33), así que para cuando este bloque entra ya están en el formulario. Declararlos
 * de nuevo pondría el mismo campo dos veces en el form, que Odoo rechaza.
 */
const arch = (accionId) => `<data>
  <xpath expr="//page[@name='aba_alcance']" position="inside">
    <separator string="Documentación para habilitar a nuestro personal"/>
    <div class="text-muted">
      <p>A quién de la obra hay que mandarle la documentación de nuestra gente (ART, curso
         de altura, psicofísico) para que nos habiliten a entrar. NO es lo mismo que "SyH
         presencial", que dice si nosotros tenemos que poner un técnico en obra.
         Hace falta para confirmar la orden, no para guardar la cotización.</p>
    </div>
    <group>
      <group>
        <field name="x_hab_syh_nombre"
               required="${CAMPO_EXIGE} and state in ('sale', 'done') and x_studio_tipo_de_contrato == 'Obra '"/>
        <field name="x_hab_syh_celular"
               required="${CAMPO_EXIGE} and state in ('sale', 'done') and x_studio_tipo_de_contrato == 'Obra '"/>
        <field name="x_hab_syh_email" widget="email"
               required="${CAMPO_EXIGE} and state in ('sale', 'done') and x_studio_tipo_de_contrato == 'Obra '"/>
      </group>
      <group>
        <button name="${accionId}" type="action" string="Traer del cliente" icon="fa-user"
                class="btn-link"
                help="Copia nombre, teléfono y mail del cliente de la orden. Si al cliente le falta el teléfono o el mail, los toma del contacto de la obra. Nunca borra lo que ya esté cargado."/>
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
  console.log(`  ${c.name in existentes ? "ya existe" : "FALTA   "}  ${c.name.padEnd(22)} ${c.ttype}`);
}

// Las dos dependencias duras. Si falta cualquiera, la vista rompe el formulario entero al
// renderizarlo, así que se comprueban ANTES de escribir nada.
if (!(CAMPO_EXIGE in existentes)) {
  throw new Error(
    `Falta ${CAMPO_EXIGE}, que lo crea odoo-tipo-de-trabajo.mjs. ` +
      `Sin él el modificador de esta vista no se puede evaluar.`,
  );
}
const [pagina] = await searchRead(
  "ir.ui.view",
  [["model", "=", MODEL], ["name", "=", "sale.order.form.aba.alcance.tecnico"]],
  ["id"],
);
if (!pagina) throw new Error("Falta la vista sale.order.form.aba.alcance.tecnico: el xpath no tendría dónde colgarse");
console.log(`\nAncla: página aba_alcance de la vista #${pagina.id} — ok`);

const [yaEsta] = await searchRead("ir.ui.view", [["name", "=", VISTA]], ["id"]);
console.log(yaEsta ? `Vista ${VISTA}: ya existe (#${yaEsta.id}), se actualiza` : `Vista ${VISTA}: se crea`);
const [autoExiste] = await searchRead("base.automation", [["name", "=", AUTOMATIZACION]], ["id"]);
console.log(autoExiste ? `Automatización: ya existe (#${autoExiste.id}), se actualiza` : "Automatización: se crea");

const cuenta = (dom) => executeKw(MODEL, "search_count", [dom]);
const DOM_OBRA = ["x_studio_tipo_de_contrato", "=", "Obra "];
console.log("\nA quién le va a pedir el dato:");
console.log(`  órdenes Obra ya confirmadas y nuevas (lo piden ya): ${await cuenta([["state", "in", ["sale", "done"]], DOM_OBRA, [CAMPO_EXIGE, "=", true]])}`);
console.log(`  órdenes Obra confirmadas viejas (no se les pide):   ${await cuenta([["state", "in", ["sale", "done"]], DOM_OBRA, [CAMPO_EXIGE, "=", false]])}`);
console.log(`  cotizaciones Obra abiertas (lo van a pedir al confirmar): ${await cuenta([["state", "in", ["draft", "sent"]], DOM_OBRA])}`);
console.log(`  cotizaciones que NO son Obra (nunca se les pide):   ${await cuenta([["state", "in", ["draft", "sent"]], ["x_studio_tipo_de_contrato", "!=", "Obra "]])}`);

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

// La acción del botón va PRIMERO: su id entra en el arch de la vista.
const [accionExiste] = await searchRead(
  "ir.actions.server",
  [["name", "=", ACCION_TRAER], ["model_id", "=", modelo.id]],
  ["id"],
);
let accionId;
if (accionExiste) {
  await write("ir.actions.server", [accionExiste.id], { state: "code", code: CODIGO_TRAER });
  accionId = accionExiste.id;
  console.log(`✓ acción del botón #${accionId} actualizada`);
} else {
  accionId = await create("ir.actions.server", {
    name: ACCION_TRAER,
    model_id: modelo.id,
    state: "code",
    code: CODIGO_TRAER,
  });
  console.log(`✓ acción del botón #${accionId} creada`);
}

const ARCH = arch(accionId);
if (yaEsta) {
  await write("ir.ui.view", [yaEsta.id], { arch_db: ARCH, priority: 33, active: true });
  console.log(`✓ vista #${yaEsta.id} actualizada`);
} else {
  const id = await create("ir.ui.view", {
    name: VISTA,
    model: MODEL,
    type: "form",
    inherit_id: pagina.id,
    mode: "extension",
    priority: 33,
    arch_db: ARCH,
    active: true,
  });
  console.log(`✓ vista #${id} creada`);
}

const [campoEstado] = await searchRead(
  "ir.model.fields",
  [["model", "=", MODEL], ["name", "=", "state"]],
  ["id"],
);

const valoresAuto = {
  name: AUTOMATIZACION,
  model_id: modelo.id,
  // Sólo cuando se TOCA el estado, y sólo en el salto de cotización a confirmada. Sin
  // esto la regla correría en cada write y le rompería las escrituras a la app, que le
  // escribe campos a órdenes ya confirmadas.
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

// ── Verificar ───────────────────────────────────────────────────────────────

const despues = await fieldsGet(MODEL, ["type", "string"]);
console.log("\nDESPUÉS:");
for (const c of CAMPOS) {
  const f = despues[c.name];
  console.log(`  ${c.name.padEnd(22)} ${f ? `${f.type} · "${f.string}"` : "NO EXISTE"}`);
}
console.log("\n✅ Listo. Probar el bloqueo con: node --env-file=.env.local scripts/odoo-probar-contacto-syh.mjs");
