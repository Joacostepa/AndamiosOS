// Permiso municipal y expediente — agrega los campos x_permiso_* / x_expediente_* en
// sale.order.
//
// EL PROBLEMA: no existe en ningún lado. Verificado en x_aba_orden_trabajo, x_aba_obra y
// sale.order: cero campos de permiso, expediente o gestoría. 115 obras se armaron
// amparadas en un expediente cuyo número no quedó guardado — ni en Odoo ni en el tracker.
// Cada obra nueva que se arma así es un dato que se pierde para siempre, así que estos
// campos se crean ANTES que el resto del módulo Habilitaciones.
//
// POR QUÉ EN LA VENTA Y NO EN LA OT: el permiso es municipal, por dirección. El armado y
// el desarme de la misma obra comparten el permiso. Y es el único join que existe:
// x_obra_id está vacío en las 1003 OTs, x_order_id está al 100%. Verificado que una venta
// no cubre más de una dirección: de 567 ventas con OTs, 436 tienen 2 (armado + desarme) y
// 131 una sola; el único caso con direcciones aparentemente distintas (S00249) es la
// misma dirección escrita de dos formas.
//
// x_permiso_modalidad es DECISIÓN DEL CLIENTE, la transmite el técnico de la obra
// (sale.order.x_studio_tcnico). x_tramite_estado es gestión de ABA y avanza sola.
//
// Idempotente: se puede re-correr sin duplicar.
// Correr: node --env-file=.env.local scripts/odoo-add-permiso-sale-order.mjs
import { version, authenticate, searchRead, create, fieldsGet, executeKw } from "./odoo-rpc.mjs";

const MODEL = "sale.order";

const CAMPOS = [
  {
    name: "x_permiso_modalidad",
    field_description: "Modalidad de permiso",
    ttype: "selection",
    // Sin valor = sin definir. Es un estado real y frecuente (297 obras en el histórico,
    // con mediana de 399 días), no un dato faltante: por eso no hay opción "sin definir".
    selection_ids: [
      [0, 0, { value: "sin_permiso", name: "Sin permiso — el cliente asume", sequence: 10 }],
      [0, 0, { value: "con_expediente", name: "Con expediente en trámite", sequence: 20 }],
      [0, 0, { value: "esperar_permiso", name: "Esperar el permiso emitido", sequence: 30 }],
    ],
  },
  { name: "x_permiso_definida", field_description: "Modalidad definida el", ttype: "date" },
  {
    name: "x_tramite_estado",
    field_description: "Trámite del permiso",
    ttype: "selection",
    selection_ids: [
      [0, 0, { value: "no_presentado", name: "No presentado", sequence: 10 }],
      [0, 0, { value: "presentado", name: "Presentado", sequence: 20 }],
      [0, 0, { value: "emitido", name: "Emitido", sequence: 30 }],
    ],
  },
  { name: "x_expediente_nro", field_description: "Expediente N°", ttype: "char" },
  { name: "x_expediente_fecha", field_description: "Expediente presentado el", ttype: "date" },
  { name: "x_permiso_fecha", field_description: "Permiso emitido el", ttype: "date" },
  {
    name: "x_permiso_doc_ids",
    field_description: "Documentos del permiso",
    ttype: "many2many",
    relation: "ir.attachment",
    // Explícito: el nombre autogenerado depende de la versión y no queremos sorpresas.
    relation_table: "sale_order_permiso_attachment_rel",
    column1: "order_id",
    column2: "attachment_id",
  },
];

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}\n`);

const [modelo] = await searchRead("ir.model", [["model", "=", MODEL]], ["id"]);
if (!modelo) throw new Error(`No existe el modelo ${MODEL}`);

const existentes = await fieldsGet(MODEL, ["type"]);

// El técnico es a quien se le pide la modalidad. x_tecnico (char "JR"/"GS"/"JS") vive en
// la OT y no rutea a nadie; el que sirve es este many2one a hr.employee. Si desapareciera,
// el diálogo del candado se queda sin destinatario y conviene enterarse acá.
const tec = existentes.x_studio_tcnico;
if (!tec) {
  console.log("⚠ sale.order.x_studio_tcnico no existe: el pedido de modalidad se queda sin destinatario.");
} else {
  console.log(`· x_studio_tcnico: ${tec.type} — ok`);
}

for (const campo of CAMPOS) {
  if (campo.name in existentes) {
    console.log(`· ${MODEL}.${campo.name} ya existe`);
    continue;
  }
  await create("ir.model.fields", {
    model_id: modelo.id,
    model: MODEL,
    state: "manual",
    ...campo,
  });
  console.log(`✓ ${MODEL}.${campo.name} creado (${campo.ttype})`);
}

// ── Verificación: escribir y leer sobre una venta real, dejándola como estaba ────
const escalares = CAMPOS.filter((c) => c.ttype !== "many2many").map((c) => c.name);
const [venta] = await searchRead(MODEL, [], ["id", "name", ...escalares], {
  limit: 1,
  order: "id desc",
});

if (!venta) {
  console.log("\n⚠ Sin ventas: se omite el smoke test.");
} else {
  const original = Object.fromEntries(escalares.map((c) => [c, venta[c] || false]));
  const prueba = {
    x_permiso_modalidad: "con_expediente",
    x_permiso_definida: "2000-01-01",
    x_tramite_estado: "presentado",
    x_expediente_nro: "SMOKE-TEST",
    x_expediente_fecha: "2000-01-01",
    x_permiso_fecha: false,
  };
  await executeKw(MODEL, "write", [[venta.id], prueba]);
  const [leida] = await searchRead(MODEL, [["id", "=", venta.id]], escalares);
  console.log(`\n✓ escritura OK — venta ${venta.name}: ${JSON.stringify(leida)}`);
  await executeKw(MODEL, "write", [[venta.id], original]);
  console.log(`✓ restaurado a ${JSON.stringify(original)}`);
}

console.log("\n✅ Campos de permiso listos en sale.order.");
