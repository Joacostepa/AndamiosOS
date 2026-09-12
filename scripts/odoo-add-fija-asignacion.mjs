// La obra que no se mueve de ese día — agrega x_motivo_fija en la asignación.
//
// EL PROBLEMA: cuando la jornada arranca lloviendo se suspende el día y se posterga todo
// una jornada. Pero hay obras que sí o sí van esa fecha —la grúa está alquilada, el
// permiso de corte tiene día, el evento es el sábado— y hoy no hay forma de decirlo: se
// corren todas juntas y nadie se entera hasta que la cuadrilla no sale.
//
// POR QUÉ EN LA ASIGNACIÓN Y NO EN LA OT. La asignación es "esta obra, este día, esta
// cuadrilla", con su fracción: una obra de 3 horas es una sola asignación de ¼, y fijarla
// no toca el resto de lo que esa cuadrilla tiene ese día. Si el flag viviera en la OT,
// fijar una obra de 8 jornadas congelaría las ocho — y el día que llueve en la jornada 3
// las jornadas 4 a 8 quedarían clavadas en un plan que tampoco se puede ejecutar, porque
// la lluvia no las deja trabajar. El nivel fino es el único que no miente.
//
// UN SOLO CAMPO Y NO UN PAR booleano+texto: el motivo es obligatorio, así que "fija sin
// motivo" y "motivo colgado en una obra que ya soltaron" son estados que sólo pueden
// existir para estar mal. Con texto está fija; vacío, no.
//
// POR QUÉ TEXTO LIBRE Y NO UNA SELECCIÓN. Es el mismo criterio del candado de
// habilitación (ver src/components/tablero/dialogo-candado.tsx): lo que hace falta no es
// clasificar, es que a las 7 de la mañana bajo la lluvia el que decide lea "grúa
// alquilada, viene 8 hs" y sepa si tiene que llamar para cancelarla. Una lista con "otro"
// se termina comiendo la mitad de los casos y no dice ninguno.
//
// NO SE CARGA DESDE ODOO. Lo escribe el tablero, como todo lo de x_aba_asignacion: en
// Odoo la asignación se ve, no se edita (ver el encabezado de
// src/app/api/planificacion/asignaciones/route.ts). El campo vive acá porque acá vive la
// fila: así el motivo se borra solo cuando la asignación se borra, en vez de quedar
// colgado en una tabla aparte cruzada por un id sin FK.
//
// Idempotente: se puede re-correr sin duplicar.
// Correr: node --env-file=.env.local scripts/odoo-add-fija-asignacion.mjs
import { version, authenticate, searchRead, create, fieldsGet, executeKw } from "./odoo-rpc.mjs";

const MODEL = "x_aba_asignacion";
const CAMPO = "x_motivo_fija";

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}\n`);

const [modelo] = await searchRead("ir.model", [["model", "=", MODEL]], ["id"]);
if (!modelo) throw new Error(`No existe el modelo ${MODEL}`);

const existentes = await fieldsGet(MODEL, ["type"]);

// x_fecha tiene que seguir siendo un date escribible: es lo que mueve el corrimiento, y
// si algún día pasara a computado conviene enterarse acá y no en producción.
const fecha = existentes.x_fecha;
if (!fecha) throw new Error(`${MODEL}.x_fecha no existe: revisá el modelo`);
console.log(`· x_fecha: ${fecha.type} — ok`);

if (CAMPO in existentes) {
  console.log(`· ${MODEL}.${CAMPO} ya existe`);
} else {
  await create("ir.model.fields", {
    model_id: modelo.id,
    model: MODEL,
    state: "manual",
    name: CAMPO,
    field_description: "Motivo de fija",
    ttype: "char",
    // Alcanza de sobra para una línea y corta el pegado de un mail entero, que en una
    // lista de Odoo rompe la fila.
    size: 300,
    help: "Con texto, esta jornada no se desplaza (ni al arrastrar ni al correr el día). Lo escribe el tablero.",
  });
  console.log(`✓ ${MODEL}.${CAMPO} creado (char)`);
}

// ── Verificación: escribir y leer sobre una asignación real, dejándola como estaba ────
const [asig] = await searchRead(MODEL, [], ["id", "x_fecha", CAMPO], {
  limit: 1,
  order: "id desc",
});

if (!asig) {
  console.log("\n⚠ Sin asignaciones: se omite el smoke test.");
} else {
  const original = { [CAMPO]: asig[CAMPO] || false };
  await executeKw(MODEL, "write", [[asig.id], { [CAMPO]: "PRUEBA — se borra en seguida" }]);
  const [leida] = await searchRead(MODEL, [["id", "=", asig.id]], [CAMPO]);
  console.log(`\n✓ escritura OK — asignación ${asig.id} (${asig.x_fecha}): ${leida[CAMPO]}`);
  await executeKw(MODEL, "write", [[asig.id], original]);
  console.log(`✓ restaurado a ${JSON.stringify(original)}`);
}

// Cuántas hay hoy: arranca en cero y sirve de línea de base para saber, dentro de un mes,
// si el campo se usa de verdad o si se fijó todo y el corrimiento quedó inútil.
const fijas = await searchRead(MODEL, [[CAMPO, "!=", false]], ["id"]);
console.log(`\n· Asignaciones fijas hoy: ${fijas.length}`);

console.log(`\n✅ ${CAMPO} listo.`);
