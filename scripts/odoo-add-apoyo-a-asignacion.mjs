// Cuadrilla de apoyo — dos cuadrillas en la misma obra con UN solo parte.
//
// Ver docs/tablero-planificacion/apoyo.md. Agrega dos campos:
//
//   x_aba_asignacion.x_apoyo        (boolean, default false)
//   x_aba_mano_obra.x_cuadrilla_id  (many2one → x_aba_cuadrilla)
//
// ── x_apoyo ───────────────────────────────────────────────────────────────────────────
// Una asignación de apoyo es "la Cuadrilla 3 va a Thames el martes a ayudar a la 2". Ocupa
// capacidad de verdad en la fila de la C3 —por eso es una asignación y no un dato colgado
// de la de la C2— pero NO es una jornada más de la obra: no suma días al avance, no genera
// parte propio y no cuenta como pendiente. El parte lo carga la principal y le cierra la
// jornada también al apoyo (cerrarJornada en src/lib/odoo/partes.ts).
//
// Default false y no hay que migrar nada: las 337 asignaciones que existen hoy son todas
// principales, que es exactamente lo que dice un booleano vacío.
//
// ── x_cuadrilla_id en la mano de obra ─────────────────────────────────────────────────
// Con un solo parte por obra y día, el parte de Thames lleva la gente de la C2 Y la de la
// C3. Cada renglón tiene que decir de qué cuadrilla es: sin eso el costo de la obra sigue
// bien (son personas × horas) pero se pierde quién estuvo, y la pregunta "¿cuántos días
// apoyó la C3 este mes?" no tiene respuesta.
//
// SE RELLENA con la cuadrilla de la cabecera del parte, que hasta hoy es la única que hubo
// en cada parte. Es un write por cuadrilla (no por línea): el campo no lo lee ningún
// calculado, así que no arrastra la cascada de costos hacia la OT.
//
// OBLIGATORIO SÓLO SI NO QUEDAN HUECOS. Al relevarlo (17/10/2026) había 19 líneas de 1562
// en partes sin cuadrilla en la cabecera: ésas no se pueden rellenar sin inventar. Si
// quedan, el campo se crea opcional, se listan los partes y hay que corregirlos a mano y
// volver a correr el script, que en la segunda pasada lo vuelve obligatorio. Marcarlo
// obligatorio con huecos haría fallar el NOT NULL en Postgres y, peor, rebotaría cualquier
// edición de esos partes viejos desde Odoo. La app manda siempre la cuadrilla de cada
// renglón (o la de la cabecera), así que lo nuevo no depende de esto.
//
// Idempotente: se puede re-correr sin duplicar ni volver a escribir lo ya relleno.
// Correr: node --env-file=.env.local scripts/odoo-add-apoyo-a-asignacion.mjs
import { version, authenticate, searchRead, create, fieldsGet, executeKw, write } from "./odoo-rpc.mjs";

const ASIG = "x_aba_asignacion";
const MANO = "x_aba_mano_obra";

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}\n`);

async function modeloId(model) {
  const [m] = await searchRead("ir.model", [["model", "=", model]], ["id"]);
  if (!m) throw new Error(`No existe el modelo ${model}`);
  return m.id;
}

// ── 1) x_aba_asignacion.x_apoyo ────────────────────────────────────────────────────────
const camposAsig = await fieldsGet(ASIG, ["type"]);
if ("x_apoyo" in camposAsig) {
  console.log(`· ${ASIG}.x_apoyo ya existe (${camposAsig.x_apoyo.type})`);
} else {
  await create("ir.model.fields", {
    model_id: await modeloId(ASIG),
    model: ASIG,
    state: "manual",
    name: "x_apoyo",
    field_description: "Apoyo",
    ttype: "boolean",
    help:
      "Esta cuadrilla va a ayudar a la principal de la obra ese día. No suma jornadas a la obra ni tiene parte propio: el parte lo carga la principal. Lo escribe el tablero.",
  });
  console.log(`✓ ${ASIG}.x_apoyo creado (boolean)`);
}

// Un boolean manual de Odoo nace sin default explícito y se lee como false, que es lo que
// hace falta. Se verifica igual sobre las existentes: si alguna leyera true, el avance de
// esa obra se rompería en silencio.
const conApoyo = await searchRead(ASIG, [["x_apoyo", "=", true]], ["id"]);
console.log(`· Asignaciones marcadas como apoyo hoy: ${conApoyo.length}`);

// ── 2) x_aba_mano_obra.x_cuadrilla_id ──────────────────────────────────────────────────
const camposMano = await fieldsGet(MANO, ["type", "relation", "required"]);
if (!camposMano.x_parte_diario_id) throw new Error(`${MANO}.x_parte_diario_id no existe: revisá el modelo`);

if ("x_cuadrilla_id" in camposMano) {
  console.log(`· ${MANO}.x_cuadrilla_id ya existe (→${camposMano.x_cuadrilla_id.relation})`);
} else {
  await create("ir.model.fields", {
    model_id: await modeloId(MANO),
    model: MANO,
    state: "manual",
    name: "x_cuadrilla_id",
    field_description: "Cuadrilla",
    ttype: "many2one",
    relation: "x_aba_cuadrilla",
    // Una cuadrilla no se borra, se desactiva (x_activa). Si igual la borraran, el renglón
    // no puede desaparecer con ella: es costo de una obra.
    on_delete: "restrict",
    help: "De qué cuadrilla es esta gente. En un parte con apoyo hay un renglón por cuadrilla.",
  });
  console.log(`✓ ${MANO}.x_cuadrilla_id creado (many2one→x_aba_cuadrilla)`);
}

// Relleno: la cuadrilla de la cabecera del parte, agrupado para escribir de a una por
// cuadrilla.
const sinCuadrilla = await searchRead(MANO, [["x_cuadrilla_id", "=", false]], ["id", "x_parte_diario_id"]);
const parteIds = [...new Set(sinCuadrilla.map((l) => (Array.isArray(l.x_parte_diario_id) ? l.x_parte_diario_id[0] : null)).filter(Boolean))];
const partes = parteIds.length
  ? await executeKw("x_aba_parte_diario", "read", [parteIds, ["x_cuadrilla_id", "x_fecha", "x_orden_trabajo_id"]])
  : [];
const partePorId = new Map(partes.map((p) => [p.id, p]));

const porCuadrilla = new Map();
const huerfanas = [];
for (const l of sinCuadrilla) {
  const parte = Array.isArray(l.x_parte_diario_id) ? partePorId.get(l.x_parte_diario_id[0]) : null;
  const cuadrilla = parte && Array.isArray(parte.x_cuadrilla_id) ? parte.x_cuadrilla_id[0] : null;
  if (!cuadrilla) {
    huerfanas.push({ linea: l.id, parte });
    continue;
  }
  const ids = porCuadrilla.get(cuadrilla) ?? [];
  ids.push(l.id);
  porCuadrilla.set(cuadrilla, ids);
}

// En serie: Odoo Online limita la concurrencia y son pocas escrituras.
for (const [cuadrilla, ids] of porCuadrilla) {
  await write(MANO, ids, { x_cuadrilla_id: cuadrilla });
  console.log(`✓ ${ids.length} línea(s) de mano de obra → cuadrilla ${cuadrilla}`);
}
if (!porCuadrilla.size) console.log("· No había líneas para rellenar");

const camposDespues = await fieldsGet(MANO, ["required"]);
if (huerfanas.length) {
  console.log(`\n⚠ ${huerfanas.length} línea(s) en partes SIN cuadrilla en la cabecera. No se inventa:`);
  const vistos = new Set();
  for (const h of huerfanas) {
    const p = h.parte;
    if (!p || vistos.has(p.id)) continue;
    vistos.add(p.id);
    const ot = Array.isArray(p.x_orden_trabajo_id) ? p.x_orden_trabajo_id[1] : "sin OT";
    console.log(`   · parte #${p.id} · ${p.x_fecha || "sin fecha"} · ${ot}`);
  }
  console.log("  Cargales la cuadrilla al parte en Odoo y volvé a correr el script para dejarlo obligatorio.");
  if (camposDespues.x_cuadrilla_id?.required) console.log("  (El campo ya estaba obligatorio: no se toca.)");
} else if (camposDespues.x_cuadrilla_id?.required) {
  console.log(`· ${MANO}.x_cuadrilla_id ya es obligatorio`);
} else {
  const [campo] = await searchRead("ir.model.fields", [["model", "=", MANO], ["name", "=", "x_cuadrilla_id"]], ["id"]);
  await write("ir.model.fields", [campo.id], { required: true });
  console.log(`✓ ${MANO}.x_cuadrilla_id ahora es obligatorio`);
}

// ── Verificación: escribir y leer x_apoyo sobre una asignación real, dejándola como estaba ──
const [asig] = await searchRead(ASIG, [], ["id", "x_apoyo"], { limit: 1, order: "id desc" });
if (!asig) {
  console.log("\n⚠ Sin asignaciones: se omite el smoke test.");
} else {
  const original = { x_apoyo: asig.x_apoyo === true };
  await executeKw(ASIG, "write", [[asig.id], { x_apoyo: !original.x_apoyo }]);
  const [leida] = await searchRead(ASIG, [["id", "=", asig.id]], ["x_apoyo"]);
  console.log(`\n✓ escritura OK — asignación ${asig.id}: x_apoyo=${leida.x_apoyo}`);
  await executeKw(ASIG, "write", [[asig.id], original]);
  console.log(`✓ restaurado a ${JSON.stringify(original)}`);
}

console.log("\n✅ x_apoyo y x_cuadrilla_id listos.");
