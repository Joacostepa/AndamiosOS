// Agrega la columna Puntero a la lista de partes diarios dentro del formulario de la OT.
//
// Va JUNTO a Cuadrilla, no en su lugar: son dos datos distintos y los dos importan.
// La cuadrilla dice qué equipo fue; el puntero, quién lo dirigió ese día.
//
// Idempotente: si la columna ya está, no toca nada.
// Correr: node --env-file=.env.local scripts/odoo-columna-puntero.mjs
import { version, authenticate, searchRead, write } from "./odoo-rpc.mjs";

const VISTA_OT = 4148; // x_aba_orden_trabajo.form
const ANCLA = '<field name="x_cuadrilla_id"/>';
const NUEVO = '<field name="x_cuadrilla_id"/><field name="x_puntero_id" optional="show"/>';

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}\n`);

const [vista] = await searchRead("ir.ui.view", [["id", "=", VISTA_OT]], ["name", "arch_db"]);
if (!vista) throw new Error(`No existe la vista ${VISTA_OT}`);
console.log(`vista: ${vista.name}`);

if (vista.arch_db.includes("x_puntero_id")) {
  console.log("· la columna Puntero ya está en la vista");
} else {
  const partes = vista.arch_db.split(ANCLA);
  if (partes.length !== 2) {
    throw new Error(
      `Se esperaba una sola aparición de ${ANCLA} y hay ${partes.length - 1}. ` +
        `Revisar la vista a mano para no romperla.`,
    );
  }
  await write("ir.ui.view", [VISTA_OT], { arch_db: partes.join(NUEVO) });
  console.log("✓ columna Puntero agregada al lado de Cuadrilla");
}

// Verificación: la vista tiene que seguir siendo válida y devolver el campo.
const campos = await searchRead("x_aba_parte_diario", [], ["x_cuadrilla_id", "x_puntero_id"], { limit: 1 });
console.log(`\n✓ la vista responde — muestra: ${JSON.stringify(campos[0] ?? {})}`);

const [releida] = await searchRead("ir.ui.view", [["id", "=", VISTA_OT]], ["arch_db"]);
const linea = releida.arch_db
  .split("\n")
  .find((l) => l.includes("x_puntero_id"));
console.log(`✓ en la vista: ${linea?.trim().slice(0, 120)}`);
