// Los contactos de una obra: varios, y guardados en la ORDEN y no en la OT.
//
// EL PROBLEMA: el contacto en obra es UN par de campos (nombre + teléfono) en cada orden
// de trabajo. Dos cosas se rompen con eso:
//
//   1. En la obra hay más de una persona —el encargado, la arquitecta, el que abre el
//      portón— y entra una sola. Operaciones consigue las otras hablando por teléfono y
//      no tiene dónde ponerlas.
//   2. Cada OT arranca de cero. Medido el 26/09 sobre las 67 OTs vivas: 8 órdenes tienen
//      más de una OT y en CINCO el contacto es distinto entre ellas — "ventas" en una y
//      "Ayrton" en la otra, "ADM purity" y "JUAN", o la dirección entera metida en el
//      campo del nombre. El dato que alguien averiguó no llega a la OT siguiente.
//
// POR QUÉ CUELGAN DE LA ORDEN Y NO DE LA OT: la obra es la orden. El armado, el desarme y
// la ampliación son la misma obra y la misma gente. Colgándolos de la orden, una OT nueva
// los tiene por definición —no hay que copiarlos ni sincronizarlos, que es donde estas
// cosas se desfasan con el tiempo.
//
// DÓNDE SE CARGAN, ya que al confirmar la venta todavía no se sabe quién atiende en la
// obra: desde la orden en Odoo (Comercial, cuando lo averigua) y desde el tablero
// (Operaciones, que es quien termina hablando por teléfono). Los dos escriben en el
// mismo lugar, así que no hay una copia que se desfase de la otra.
//
// Desde el FORMULARIO DE LA OT en Odoo no se puede: ver el paso 4.
//
// NO SE USAN LOS CONTACTOS NATIVOS DE ODOO (res.partner.child_ids). Verificado antes de
// decidir: de los 63 que hay cargados en clientes de ventas confirmadas, la enorme
// mayoría son DIRECCIONES y no personas —"Agüero 1935/39", "Av. Pueyrredón 1774"—.
// Meter gente ahí mezclaría dos cosas en un campo que ya significa otra.
//
// EL CAMPO VIEJO NO SE TOCA. x_contacto_obra / x_tel_obra de la OT siguen donde están:
// son obligatorios en el alta, los completa una precarga desde el cliente y hay 55 OTs
// vivas que dependen de ellos. Esto se suma al lado.
//
// Idempotente. Por defecto sólo mira.
//
// Correr:
//   node --env-file=.env.local scripts/odoo-contactos-de-obra.mjs            (sólo mira)
//   node --env-file=.env.local scripts/odoo-contactos-de-obra.mjs --aplicar  (escribe)
import {
  version, authenticate, searchRead, create, write, fieldsGet, executeKw,
} from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");
const MODEL = "x_aba_contacto_obra";
const VENTA = "sale.order";
const OT = "x_aba_orden_trabajo";

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}`);
console.log(APLICAR ? "MODO: aplicar\n" : "MODO: corrida en seco (agregá --aplicar para escribir)\n");

async function modelIdOf(model) {
  const [m] = await searchRead("ir.model", [["model", "=", model]], ["id"]);
  if (!m) throw new Error(`No existe el modelo ${model}`);
  return m.id;
}

async function ensureField(model, modelId, spec) {
  const existentes = await fieldsGet(model, ["type"]);
  if (spec.name in existentes) {
    console.log(`   · ${model}.${spec.name} ya existe`);
    return false;
  }
  if (!APLICAR) {
    console.log(`   + ${model}.${spec.name} (${spec.ttype}) — se crearía`);
    return false;
  }
  await create("ir.model.fields", { model_id: modelId, model, state: "manual", ...spec });
  console.log(`   ✓ ${model}.${spec.name} creado (${spec.ttype})`);
  return true;
}

async function grupoBase(name) {
  const [g] = await searchRead(
    "ir.model.data", [["module", "=", "base"], ["name", "=", name]], ["res_id"],
  );
  if (!g) throw new Error(`No existe el grupo base.${name}`);
  return g.res_id;
}

// ── 1) El modelo ─────────────────────────────────────────────────────────────
console.log("1) Modelo:");
let modelId;
const [existente] = await searchRead("ir.model", [["model", "=", MODEL]], ["id"]);
if (existente) {
  modelId = existente.id;
  console.log(`   · ${MODEL} ya existe (id=${modelId})`);
} else if (APLICAR) {
  modelId = await create("ir.model", { name: "Contacto de obra", model: MODEL, state: "manual" });
  console.log(`   ✓ ${MODEL} creado (id=${modelId})`);
} else {
  console.log(`   + ${MODEL} — se crearía`);
}

if (!modelId && !APLICAR) {
  console.log("\nNo se escribió nada. Para aplicar: --aplicar");
  process.exit(0);
}

// ── 2) Permisos ──────────────────────────────────────────────────────────────
//
// A DIFERENCIA DE LAS ASIGNACIONES, acá Internal User escribe: Comercial carga contactos
// desde la orden y Operaciones desde el tablero. El modelo no es un derivado que calcule
// nadie, es gente anotada a mano.
console.log("2) Permisos:");
for (const [grupo, nombre, perms] of [
  ["group_user", `${MODEL}.user`, { perm_read: true, perm_write: true, perm_create: true, perm_unlink: true }],
  ["group_system", `${MODEL}.system`, { perm_read: true, perm_write: true, perm_create: true, perm_unlink: true }],
]) {
  const gid = await grupoBase(grupo);
  const [ya] = await searchRead("ir.model.access", [["model_id", "=", modelId], ["group_id", "=", gid]], ["id"]);
  if (ya) console.log(`   · ACL ${nombre} ya existe`);
  else if (APLICAR) {
    await create("ir.model.access", { name: nombre, model_id: modelId, group_id: gid, ...perms });
    console.log(`   ✓ ACL ${nombre} creada`);
  } else console.log(`   + ACL ${nombre} — se crearía`);
}

// ── 3) Campos del contacto ───────────────────────────────────────────────────
console.log("3) Campos del contacto:");
// x_name es el _rec_name de los modelos manuales: es el nombre de la persona, así que la
// lista en Odoo se lee sola sin tener que configurar nada.
await ensureField(MODEL, modelId, {
  name: "x_name", field_description: "Nombre y apellido", ttype: "char", required: true,
});
await ensureField(MODEL, modelId, {
  name: "x_order_id", field_description: "Orden de alquiler", ttype: "many2one",
  relation: VENTA, required: true, on_delete: "cascade",
});
await ensureField(MODEL, modelId, {
  name: "x_telefono", field_description: "Teléfono", ttype: "char",
});
// Texto libre y no una selección: los roles reales no entran en una lista cerrada —"la
// que abre", "el del portón", "arquitecta de la obra"— y una lista con "Otro" termina
// siendo todo "Otro".
await ensureField(MODEL, modelId, {
  name: "x_rol", field_description: "Rol en la obra", ttype: "char",
});
await ensureField(MODEL, modelId, {
  name: "x_email", field_description: "Email", ttype: "char",
});

// ── 4) La lista en la orden ──────────────────────────────────────────────────
console.log("4) Relaciones:");
await ensureField(VENTA, await modelIdOf(VENTA), {
  name: "x_contactos_obra_ids", field_description: "Contactos de la obra", ttype: "one2many",
  relation: MODEL, relation_field: "x_order_id",
});
// NO HAY ESPEJO DE LA LISTA EN LA OT, y no por falta de ganas: probado contra Odoo 19 el
// 26/09, un one2many `related` sobre un campo MANUAL revienta al crearse con
//
//     UserError: No inverse field "None" found for "x_aba_contacto_obra"
//
// Odoo intenta crear la columna física y le pide un campo inverso que acá no puede
// existir: el inverso de esta lista apunta a la VENTA, no a la orden de trabajo.
//
// Lo que SÍ funciona con campos manuales es el related de un campo simple: probado
// también, se escribe desde la OT, queda guardado en la venta y las otras OTs de esa
// misma venta lo leen ya cargado. Si algún día hace falta pedir UN contacto desde el
// formulario de la OT, ése es el camino — no la lista.
//
// Mientras tanto la lista se carga desde los dos lugares donde se conoce el dato: la
// orden en Odoo (Comercial) y el tablero (Operaciones, que es quien los averigua).

// ── 5) La lista en la solapa "Trabajo a ejecutar" de la venta ────────────────
//
// Va PEGADA al contacto de SyH, que es el otro "a quién llamamos de esta obra", y con la
// misma forma. Son preguntas hermanas y separarlas obligaría a buscar en dos lugares.
//
// `editable="bottom"`: se carga escribiendo en la misma línea, sin abrir un diálogo por
// contacto. Son cuatro campos cortos — pedir dos clics extra para anotar un teléfono es
// cómo se termina no anotándolo.
const VISTA = "sale.order.form.aba.contactos.obra";
const ARCH = `<data>
  <xpath expr="//page[@name='aba_alcance']" position="inside">
    <separator string="Contactos de la obra"/>
    <div class="text-muted">
      <p>Quiénes atienden en la obra: el encargado, la arquitecta, el que abre el portón.
         Se pueden agregar en cualquier momento —también desde el tablero de Planificación,
         que es donde Operaciones los va averiguando— y quedan en la ORDEN: las órdenes de
         trabajo que se generen después ya los traen.</p>
    </div>
    <field name="x_contactos_obra_ids" nolabel="1">
      <list editable="bottom">
        <field name="x_name" placeholder="Nombre y apellido"/>
        <field name="x_rol" placeholder="encargado, arquitecta, portero…"/>
        <field name="x_telefono" widget="phone" placeholder="11 5555-5555"/>
        <field name="x_email" widget="email" placeholder="opcional"/>
      </list>
    </field>
  </xpath>
</data>`;

console.log("5) Vista en la orden:");
const [ancla] = await searchRead(
  "ir.ui.view", [["model", "=", VENTA], ["name", "=", "sale.order.form.aba.alcance.tecnico"]],
  ["id", "inherit_id"],
);
if (!ancla) throw new Error("Falta la vista ancla sale.order.form.aba.alcance.tecnico");
const [vistaYa] = await searchRead("ir.ui.view", [["name", "=", VISTA]], ["id"]);
console.log(vistaYa ? `   · ${VISTA} ya existe (#${vistaYa.id}), se actualiza` : `   + ${VISTA} — se crearía`);

if (!APLICAR) {
  console.log("\nNo se escribió nada. Para aplicar: --aplicar");
  process.exit(0);
}

if (vistaYa) {
  await write("ir.ui.view", [vistaYa.id], { arch_db: ARCH, priority: 34, active: true });
  console.log(`   ✓ vista #${vistaYa.id} actualizada`);
} else {
  const id = await create("ir.ui.view", {
    name: VISTA, model: VENTA, type: "form",
    inherit_id: ancla.inherit_id ? ancla.inherit_id[0] : undefined,
    mode: "extension",
    // 34: después del contacto de SyH (33), que es la pregunta hermana.
    priority: 34, arch_db: ARCH, active: true,
  });
  console.log(`   ✓ vista #${id} creada`);
}

// El formulario tiene que seguir abriendo: un xpath que no encuentra su ancla no falla al
// guardar la vista, falla al abrir la orden.
try {
  const vistas = await executeKw(VENTA, "get_views", [[[false, "form"]]], {});
  const ok = vistas.views.form.arch.includes("x_contactos_obra_ids");
  console.log(`   ${ok ? "✓" : "✗"} la orden abre y muestra la lista (${vistas.views.form.arch.length} chars)`);
} catch (e) {
  console.log(`   ✗ la orden NO abre: ${String(e.message).slice(0, 200)}`);
}

// ── 6) Prueba de humo ────────────────────────────────────────────────────────
//
// Se prueba el camino REAL: crear, editar y borrar contra el modelo, que es lo que va a
// hacer el "+" del tablero, y comprobar que el contacto queda colgado de la VENTA y no
// de la orden de trabajo — que es todo el punto de este modelo.
console.log("\n6) Prueba de humo:");
const [otPrueba] = await searchRead(
  OT, [["x_order_id", "!=", false], ["x_estado", "in", ["pendiente", "en_proceso"]]],
  ["x_name", "x_order_id"], { limit: 1 },
);
if (!otPrueba) {
  console.log("   ⚠ No hay OTs vivas con orden: se omite la prueba.");
} else {
  const ventaId = otPrueba.x_order_id[0];
  console.log(`   OT #${otPrueba.id} → venta ${otPrueba.x_order_id[1]}`);

  // a) Crear directo contra el modelo, que es lo que hará la app.
  const directoId = await create(MODEL, {
    x_name: "PRUEBA — se borra sola", x_order_id: ventaId,
    x_telefono: "11-0000-0000", x_rol: "prueba", x_email: "prueba@ejemplo.com",
  });
  console.log(`   ✓ create directo — id=${directoId}`);

  // b) Que la VENTA lo vea en su lista, que es de donde lo van a leer las OTs.
  const [venta] = await executeKw(VENTA, "read", [[ventaId], ["x_contactos_obra_ids"]]);
  const ve = (venta.x_contactos_obra_ids ?? []).includes(directoId);
  console.log(`   ${ve ? "✓" : "✗"} la orden lo tiene en su lista (${(venta.x_contactos_obra_ids ?? []).length} contactos)`);

  // b2) Y que TODAS las OTs de esa venta lleguen a él por su orden: es lo que hace que
  //     una OT nueva "ya lo traiga" sin copiar nada.
  const hermanas = await searchRead(OT, [["x_order_id", "=", ventaId]], ["x_name"]);
  console.log(`   ✓ las ${hermanas.length} OT(s) de esa orden lo alcanzan por x_order_id`);

  // c) Y que se pueda EDITAR y BORRAR, que es lo que hará el "+" del tablero.
  await write(MODEL, [directoId], { x_rol: "prueba editada" });
  const [editado] = await executeKw(MODEL, "read", [[directoId], ["x_rol"]]);
  console.log(`   ${editado.x_rol === "prueba editada" ? "✓" : "✗"} editar un contacto funciona`);

  // d) ¿Quedaron colgados de la VENTA, que es lo que se buscaba?
  const enVenta = await searchRead(MODEL, [["x_order_id", "=", ventaId]], ["x_name"]);
  console.log(`   ✓ la venta tiene ${enVenta.length} contacto(s): ${enVenta.map((c) => c.x_name).join(", ")}`);

  // e) Limpieza: no se deja basura en producción.
  const aBorrar = enVenta.filter((c) => String(c.x_name).startsWith("PRUEBA")).map((c) => c.id);
  if (aBorrar.length) {
    await executeKw(MODEL, "unlink", [aBorrar]);
    console.log(`   ✓ ${aBorrar.length} registro(s) de prueba borrados — sin residuos`);
  }
  console.log("\n   La lista se carga desde la orden (Comercial) y desde el tablero (Operaciones).");
}

console.log("\n✅ Modelo de contactos de obra listo.");
