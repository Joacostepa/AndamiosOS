// Prueba de punta a punta del contacto de SyH de la obra.
// Acompaña a odoo-contacto-syh-orden.mjs: si alguien toca esa automatización o esa vista,
// esto dice si sigue funcionando.
//
// OJO: CREA COTIZACIONES Y ÓRDENES DE TRABAJO REALES Y LAS BORRA. No queda basura, pero
// cada corrida consume números de la secuencia de ventas (S02523, S02524...). No es gratis
// correrlo en loop.
//
// LAS OTS DE PRUEBA VAN SIN OBRA A PROPÓSITO. El webhook "AndamiosOS sync ordenes de
// trabajo" se dispara igual al crearlas, pero la app descarta las OTs sin obra
// (omitida_sin_obra), así que la prueba no ensucia Supabase. Si algún día se le pone
// x_obra_id a estas OTs, cada corrida deja una fila de prueba del otro lado.
//
// Comprueba:
//   · que una Obra nueva SIN el contacto ahora SÍ se confirme — el cambio: el dato dejó de
//     pedirse al cerrar la venta
//   · que a esa misma venta no se le pueda generar una OT sin el contacto
//   · que con los tres campos la OT se cree
//   · que a un contrato Simple se le genere la OT igual sin el contacto — el bloqueo es
//     SÓLO Obra, y ésta es la que más importa: si falla, Comercial no puede ejecutar
//     ventas chicas
//   · que a una venta VIEJA se le siga pudiendo generar OTs sin el dato: a las de antes del
//     2026-09-04 nunca se les pidió y su habilitación ya pasó
//   · que una OT ya creada se pueda seguir escribiendo, porque la regla es on_create y la
//     app le escribe estado y fechas todo el tiempo
//   · que el botón "Traer del cliente" copie lo que hay
//   · que el botón NO borre lo cargado cuando el origen está vacío
//   · que con un contacto cuyo nombre es una dirección traiga la PERSONA y no la calle —
//     el caso mayoritario, y el que se me había escapado en la primera versión
//   · que una orden vieja ya confirmada se siga pudiendo escribir
//
// Correr: node --env-file=.env.local scripts/odoo-probar-contacto-syh.mjs

import { searchRead, create, write, executeKw } from "./odoo-rpc.mjs";

const OT = "x_aba_orden_trabajo";
const ACCION_TRAER = "ABA — Traer contacto de SyH del cliente";
const CAMPOS = ["x_hab_syh_nombre", "x_hab_syh_celular", "x_hab_syh_email"];

let bien = 0;
let total = 0;

function chequear(ok, etiqueta, detalle = "") {
  total++;
  if (ok) bien++;
  console.log(`${ok ? "✓" : "✗"} ${etiqueta}${detalle ? `\n     ${detalle}` : ""}`);
}

// ── Una cotización de prueba, con un cliente que tenga datos para copiar ─────

const [socio] = await searchRead(
  "res.partner",
  [["phone", "!=", false], ["email", "!=", false], ["is_company", "=", false]],
  ["id", "name", "phone", "email", "type"],
  { limit: 1 },
);
if (!socio) throw new Error("No encontré un contacto con teléfono y mail para probar el botón");

async function nuevaOrden(tipoContrato) {
  const id = await create("sale.order", {
    partner_id: socio.id,
    x_studio_tipo_de_contrato: tipoContrato,
  });
  // Los campos que exigen las OTRAS dos reglas al confirmar. Sin esto la orden rebota por
  // el bloqueo de clasificación y de programación, y no estaríamos probando lo nuestro.
  await write("sale.order", [id], {
    x_trabajo_ambito: "obra",
    x_trabajo_obra: "torre",
    x_syh_presencial: "no",
    x_dur_armado: "1",
    x_dur_desarme: "1",
  });
  return id;
}

async function intentarConfirmar(orden, etiqueta, esperaBloqueo) {
  try {
    await executeKw("sale.order", "action_confirm", [[orden]]);
    const [d] = await searchRead("sale.order", [["id", "=", orden]], ["state"]);
    chequear(!esperaBloqueo, etiqueta, `confirmó (estado ${d.state})${esperaBloqueo ? "  ← TENDRÍA QUE HABER BLOQUEADO" : ""}`);
    if (d.state !== "draft") await write("sale.order", [orden], { state: "draft" });
  } catch (e) {
    chequear(esperaBloqueo, etiqueta, String(e.message).split("\n").slice(0, 3).join(" · "));
  }
}

/** Intenta generar una OT colgada de la venta. Devuelve el id si se creó, null si rebotó. */
async function intentarGenerarOt(orden, etiqueta, esperaBloqueo) {
  let otId = null;
  try {
    otId = await create(OT, { x_order_id: orden, x_tipo: "armado", x_name: "OT de prueba SyH" });
    chequear(!esperaBloqueo, etiqueta, `creó la OT #${otId}${esperaBloqueo ? "  ← TENDRÍA QUE HABER BLOQUEADO" : ""}`);
  } catch (e) {
    chequear(esperaBloqueo, etiqueta, String(e.message).split("\n").slice(0, 3).join(" · "));
  }
  return otId;
}

const borrarOt = (id) => (id ? executeKw(OT, "unlink", [[id]]) : Promise.resolve());

async function borrar(orden) {
  const ots = await searchRead(OT, [["x_order_id", "=", orden]], ["id"]);
  if (ots.length) await executeKw(OT, "unlink", [ots.map((o) => o.id)]);
  await write("sale.order", [orden], { state: "draft" });
  await executeKw("sale.order", "unlink", [[orden]]);
}

// ── 1: confirmar ya NO pide el contacto ─────────────────────────────────────

console.log(`Cliente de prueba: ${socio.name} · ${socio.phone} · ${socio.email}\n`);

const obra = await nuevaOrden("Obra ");
const [oObra] = await searchRead("sale.order", [["id", "=", obra]], ["name"]);
console.log(`Cotización Obra de prueba: ${oObra.name} (id ${obra})\n`);

await intentarConfirmar(obra, "Obra sin contacto de SyH → CONFIRMA igual (el dato ya no se pide al vender)", false);

// La venta tiene que quedar confirmada: las OTs cuelgan de una venta confirmada.
const [tras] = await searchRead("sale.order", [["id", "=", obra]], ["state"]);
if (tras.state === "draft") await executeKw("sale.order", "action_confirm", [[obra]]);

// ── 2 y 3: el bloqueo, ahora al generar la OT ───────────────────────────────

await intentarGenerarOt(obra, "OT sobre una Obra nueva sin contacto de SyH → bloquea", true);

await write("sale.order", [obra], {
  x_hab_syh_nombre: "Prueba Tester",
  x_hab_syh_celular: "11-0000-0000",
  x_hab_syh_email: "prueba@ejemplo.com",
});
const otBuena = await intentarGenerarOt(obra, "OT con los tres campos cargados → se crea", false);

// ── 4: una OT ya creada se sigue pudiendo escribir ──────────────────────────
//
// La regla es on_create. Si alguien la pasara a on_create_or_write, la app quedaría sin
// poder mover el estado de ninguna OT de una venta a la que le falte el dato.
if (otBuena) {
  await write("sale.order", [obra], { x_hab_syh_nombre: false, x_hab_syh_celular: false, x_hab_syh_email: false });
  try {
    await write(OT, [otBuena], { x_estado: "en_proceso" });
    chequear(true, "a una OT ya creada se le puede escribir aunque falte el contacto (la regla es on_create)");
  } catch (e) {
    chequear(false, "a una OT ya creada se le puede escribir aunque falte el contacto", e.message);
  }
  await borrarOt(otBuena);
}

// ── 5: el contrato Simple no se toca ────────────────────────────────────────

const simple = await nuevaOrden("Simple");
await intentarConfirmar(simple, "Simple sin contacto de SyH → confirma", false);
const [sSimple] = await searchRead("sale.order", [["id", "=", simple]], ["state"]);
if (sSimple.state === "draft") await executeKw("sale.order", "action_confirm", [[simple]]);
const otSimple = await intentarGenerarOt(simple, "OT sobre un Simple sin contacto → se crea (el bloqueo es sólo Obra)", false);
await borrarOt(otSimple);
await borrar(simple);

// ── 6: a las ventas viejas no se les pide ───────────────────────────────────
//
// x_exige_clasificacion marca las órdenes desde el 2026-09-04. Una obra vendida antes que
// hoy genera el desarme no tiene por qué frenarse por un dato que nunca se le pidió.
const [ventaVieja] = await searchRead(
  "sale.order",
  [
    ["state", "in", ["sale", "done"]],
    ["x_studio_tipo_de_contrato", "=", "Obra "],
    ["x_exige_clasificacion", "=", false],
    ["x_hab_syh_nombre", "=", false],
  ],
  ["id", "name"],
  { limit: 1, order: "date_order asc" },
);
if (ventaVieja) {
  const otVieja = await intentarGenerarOt(
    ventaVieja.id,
    `OT sobre la venta vieja ${ventaVieja.name} (sin contacto) → se crea`,
    false,
  );
  await borrarOt(otVieja);
} else {
  console.log("· no hay ninguna venta Obra vieja sin contacto: se saltea esa prueba");
}

// ── 7, 8 y 9: el botón ──────────────────────────────────────────────────────

const [accion] = await searchRead("ir.actions.server", [["name", "=", ACCION_TRAER]], ["id"]);
if (!accion) {
  chequear(false, "existe la acción del botón", "no se encontró: corré odoo-contacto-syh-orden.mjs --aplicar");
} else {
  const correrBoton = (orden) =>
    executeKw("ir.actions.server", "run", [[accion.id]], {
      context: { active_model: "sale.order", active_id: orden, active_ids: [orden] },
    });

  // Vacío → copia lo del cliente. Lo ESPERADO se calcula igual que en el botón: el
  // teléfono del contacto puede traer la persona entre paréntesis, y en ese caso el nombre
  // es esa persona y el teléfono es el número sin el paréntesis.
  const tieneParentesis = socio.phone.includes("(") && socio.phone.includes(")");
  const personaEsperada = tieneParentesis ? socio.phone.split("(")[1].split(")")[0].trim() : null;
  const telEsperado = tieneParentesis ? socio.phone.split("(")[0].trim() : socio.phone;
  const nombreEsperado = socio.type === "contact" ? socio.name : (personaEsperada ?? socio.name);

  await write("sale.order", [obra], { x_hab_syh_nombre: false, x_hab_syh_celular: false, x_hab_syh_email: false });
  await correrBoton(obra);
  const [copiado] = await searchRead("sale.order", [["id", "=", obra]], CAMPOS);
  chequear(
    copiado.x_hab_syh_nombre === nombreEsperado &&
      copiado.x_hab_syh_celular === telEsperado &&
      copiado.x_hab_syh_email === socio.email,
    "el botón copia nombre, teléfono y mail del cliente",
    `${copiado.x_hab_syh_nombre} · ${copiado.x_hab_syh_celular} · ${copiado.x_hab_syh_email}`,
  );

  // Un origen SIN NADA no puede vaciar lo que ya está cargado. Tiene que estar pelado el
  // contacto Y su padre: el botón cae al padre cuando el contacto no tiene el dato, así
  // que un contacto vacío con padre cargado SÍ escribe — y con razón.
  const candidatos = await searchRead(
    "res.partner",
    [["phone", "=", false], ["email", "=", false]],
    ["id", "name", "parent_id"],
    { limit: 60 },
  );
  const padres = await searchRead(
    "res.partner",
    [["id", "in", candidatos.map((c) => c.parent_id?.[0]).filter(Boolean)]],
    ["id", "phone", "email"],
    {},
  );
  const padreConDatos = new Set(padres.filter((p) => p.phone || p.email).map((p) => p.id));
  const pelado = candidatos.find((c) => !c.parent_id || !padreConDatos.has(c.parent_id[0]));
  if (pelado) {
    const suelta = await nuevaOrden("Obra ");
    await write("sale.order", [suelta], {
      partner_id: pelado.id,
      x_hab_syh_celular: "11-9999-9999",
      x_hab_syh_email: "no.me.borres@ejemplo.com",
    });
    await correrBoton(suelta);
    const [d] = await searchRead("sale.order", [["id", "=", suelta]], CAMPOS);
    chequear(
      d.x_hab_syh_celular === "11-9999-9999" && d.x_hab_syh_email === "no.me.borres@ejemplo.com",
      "con un cliente sin datos, el botón NO borra lo ya cargado",
      `${d.x_hab_syh_celular} · ${d.x_hab_syh_email}`,
    );
    await borrar(suelta);
  } else {
    console.log("· no hay ningún contacto sin teléfono ni mail: se saltea la prueba de 'no borra'");
  }

  // EL CASO QUE MÁS IMPORTA, y el que casi se me pasa: en 313 de 400 órdenes Obra el
  // partner es el contacto de la OBRA y su nombre es una dirección. El botón tiene que
  // traer a la persona —que vive entre paréntesis en el teléfono— y no la calle.
  const [conPersona] = await searchRead(
    "res.partner",
    [["type", "=", "delivery"], ["phone", "like", "("]],
    ["id", "name", "phone"],
    { limit: 1 },
  );
  if (conPersona) {
    const persona = conPersona.phone.split("(")[1].split(")")[0].trim();
    const numero = conPersona.phone.split("(")[0].trim();
    const dir = await nuevaOrden("Obra ");
    await write("sale.order", [dir], { partner_id: conPersona.id });
    await correrBoton(dir);
    const [d] = await searchRead("sale.order", [["id", "=", dir]], CAMPOS);
    chequear(
      d.x_hab_syh_nombre === persona && d.x_hab_syh_celular === numero,
      "con un contacto cuyo nombre es una dirección, trae la PERSONA y el número limpio",
      `nombre "${d.x_hab_syh_nombre}" (esperado "${persona}") · tel "${d.x_hab_syh_celular}" (esperado "${numero}")`,
    );
    await borrar(dir);
  } else {
    console.log("· no hay contacto de obra con la persona entre paréntesis: se saltea esa prueba");
  }
}

await borrar(obra);
const quedan = await executeKw("sale.order", "search_count", [[["id", "in", [obra, simple]]]]);
console.log(`\n✓ cotizaciones de prueba borradas (quedan ${quedan} con esos ids)`);

const otsHuerfanas = await executeKw(OT, "search_count", [[["x_name", "=", "OT de prueba SyH"]]]);
console.log(`✓ OTs de prueba borradas (quedan ${otsHuerfanas})`);

// ── 10: las órdenes viejas se siguen pudiendo escribir ──────────────────────
//
// La app le escribe a ventas confirmadas todo el tiempo. Ninguna regla de SyH puede
// trabar eso: la de ahora ni siquiera vive en sale.order.
const [vieja] = await searchRead(
  "sale.order",
  [["state", "in", ["sale", "done"]], ["x_studio_tipo_de_contrato", "=", "Obra "], ["x_hab_syh_nombre", "=", false]],
  ["id", "name", "x_alcance_tecnico"],
  { limit: 1, order: "date_order asc" },
);
if (vieja) {
  try {
    await write("sale.order", [vieja.id], { x_alcance_tecnico: vieja.x_alcance_tecnico || false });
    chequear(true, `orden vieja ${vieja.name} (confirmada, sin contacto de SyH): se pudo escribir`);
  } catch (e) {
    chequear(false, `orden vieja ${vieja.name}: la regla la bloqueó`, e.message);
  }
}

console.log(bien === total ? `\n✓ los ${total} escenarios dieron lo esperado` : `\n✗ ${total - bien} de ${total} escenarios fallaron`);
process.exit(bien === total ? 0 : 1);
