// Fecha planificada visible desde Comercial — agrega x_fecha_firmeza en la OT.
//
// EL PROBLEMA: Comercial atiende el teléfono y el cliente pregunta "¿cuándo vienen?".
// Ese dato existe —está en el tablero— pero no en Odoo: x_fecha_programada quedaba con
// lo que se hubiera tipeado al crear la OT, o vacío, aunque la planificación dijera otra
// cosa. Había que abrir el tablero para contestar.
//
// Ahora el tablero escribe x_fecha_programada con el primer día PENDIENTE de la obra
// (el primero sin parte cargado: si lleva 3 jornadas hechas de 8, la pregunta del cliente
// es cuándo siguen, no cuándo empezaron). Este campo dice cuánto se puede confiar en esa
// fecha, para que Comercial sepa si promete o si anticipa.
//
// POR QUÉ SE ESCRIBE SIEMPRE Y NO SÓLO AL CONFIRMAR: atar el dato al gesto de confirmar
// lo dejaba vacío en la práctica — al momento de decidir esto había 25 asignaciones en
// Odoo y CERO confirmadas. Una fecha tentativa etiquetada como tal es mucho más útil que
// ningún dato.
//
// Idempotente: se puede re-correr sin duplicar.
// Correr: node --env-file=.env.local scripts/odoo-add-firmeza-fecha-ot.mjs
import { version, authenticate, searchRead, create, fieldsGet, executeKw } from "./odoo-rpc.mjs";

const MODEL = "x_aba_orden_trabajo";
const CAMPO = "x_fecha_firmeza";

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}\n`);

const [modelo] = await searchRead("ir.model", [["model", "=", MODEL]], ["id"]);
if (!modelo) throw new Error(`No existe el modelo ${MODEL}`);

const existentes = await fieldsGet(MODEL, ["type"]);

// x_fecha_programada ya existe y es un date común (escribible, no computado). Si eso
// cambiara, el tablero no podría escribirlo y conviene enterarse acá y no en producción.
const prog = existentes.x_fecha_programada;
if (!prog) throw new Error(`${MODEL}.x_fecha_programada no existe: revisá el modelo`);
console.log(`· x_fecha_programada: ${prog.type} — ok`);

if (CAMPO in existentes) {
  console.log(`· ${MODEL}.${CAMPO} ya existe`);
} else {
  await create("ir.model.fields", {
    model_id: modelo.id,
    model: MODEL,
    state: "manual",
    name: CAMPO,
    field_description: "Firmeza de la fecha",
    ttype: "selection",
    selection_ids: [
      [0, 0, { value: "tentativa", name: "Tentativa — puede moverse", sequence: 10 }],
      [0, 0, { value: "confirmada", name: "Confirmada — fecha firme", sequence: 20 }],
    ],
  });
  console.log(`✓ ${MODEL}.${CAMPO} creado (selection tentativa/confirmada)`);
}

// ── Verificación: escribir y leer sobre una OT real, dejándola como estaba ────
const [ot] = await searchRead(MODEL, [], ["id", "x_fecha_programada", CAMPO], {
  limit: 1,
  order: "id desc",
});

if (!ot) {
  console.log("\n⚠ Sin OTs: se omite el smoke test.");
} else {
  const original = { x_fecha_programada: ot.x_fecha_programada || false, [CAMPO]: ot[CAMPO] || false };
  await executeKw(MODEL, "write", [[ot.id], { x_fecha_programada: "2000-01-01", [CAMPO]: "confirmada" }]);
  const [leida] = await searchRead(MODEL, [["id", "=", ot.id]], ["x_fecha_programada", CAMPO]);
  console.log(`\n✓ escritura OK — OT ${ot.id}: ${leida.x_fecha_programada} · ${leida[CAMPO]}`);
  await executeKw(MODEL, "write", [[ot.id], original]);
  console.log(`✓ restaurado a ${JSON.stringify(original)}`);
}

console.log(`\n✅ ${CAMPO} listo.`);
