// Imprime la estructura base del organigrama (src/lib/organigrama/estructura-base.ts) como el
// JSON que siembra la migración (bloque $base$…$base$ de 20261012000003_organigrama.sql).
//
// Correr: node --experimental-strip-types scripts/organigrama-estructura-sql.mts
// y pegar la salida entre los $base$. src/lib/organigrama/datos.test.ts falla si no coinciden.

import { filaDeNodo } from "../src/lib/organigrama/datos.ts";
import { ESTRUCTURA_BASE } from "../src/lib/organigrama/estructura-base.ts";

const filas = ESTRUCTURA_BASE.map(filaDeNodo);
console.log(`[\n${filas.map((f) => JSON.stringify(f)).join(",\n")}\n]`);
