// Agrega x_camion_en_obra (booleano) en x_aba_parte_diario.
//
// QUÉ REGISTRA: el camión no volvió, se quedó en la obra ese día. Sirve para medir cuánto
// tiempo estuvo parado, que hoy no se mide en ningún lado.
//
// POR QUÉ EN EL PARTE Y NO EN LA LÍNEA DE FLETE: la línea de flete sólo se crea cuando hay
// viajes > 0 (ver crearLineasFlete en src/lib/odoo/partes.ts). Si alguien marca "el camión
// se quedó" con cero viajes cargados, el dato se perdería en silencio. El parte existe
// siempre.
//
// POR QUÉ ALCANZA UN BOOLEANO: las horas paradas salen del propio parte, que ya tiene el
// desde/hasta de la jornada. Un campo de horas sería el mismo dato cargado dos veces, y el
// segundo se desactualiza.
//
// Aditivo: no toca ningún campo existente. Idempotente. Por defecto NO escribe: muestra
// qué haría. Para aplicar, pasar --aplicar.
// Correr: node --env-file=.env.local scripts/odoo-add-camion-en-obra.mjs [--aplicar]
import { version, authenticate, searchRead, create, fieldsGet, searchCount } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");
const MODEL = "x_aba_parte_diario";
const CAMPO = "x_camion_en_obra";

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}\n`);

const [modelo] = await searchRead("ir.model", [["model", "=", MODEL]], ["id"]);
if (!modelo) throw new Error(`No existe el modelo ${MODEL}`);
console.log(`${MODEL}: ${await searchCount(MODEL, [])} partes cargados`);

const campos = await fieldsGet(MODEL, ["type"]);
if (CAMPO in campos) {
  console.log(`· ${MODEL}.${CAMPO} ya existe (${campos[CAMPO].type})`);
  process.exit(0);
}

if (!APLICAR) {
  console.log(`· ${MODEL}.${CAMPO} se crearía (boolean, "El camión quedó en obra")`);
  console.log("\nCorrida en seco. Para aplicar:");
  console.log("  node --env-file=.env.local scripts/odoo-add-camion-en-obra.mjs --aplicar");
  process.exit(0);
}

await create("ir.model.fields", {
  model_id: modelo.id,
  model: MODEL,
  state: "manual",
  name: CAMPO,
  field_description: "El camión quedó en obra",
  ttype: "boolean",
});
console.log(`✓ ${MODEL}.${CAMPO} creado (boolean)`);

// Se relee para confirmar que quedó, y no dar por buena una escritura que Odoo aceptó
// pero no materializó.
const despues = await fieldsGet(MODEL, ["type"]);
console.log(CAMPO in despues ? "✓ verificado" : "✗ NO aparece al releer: revisar");
