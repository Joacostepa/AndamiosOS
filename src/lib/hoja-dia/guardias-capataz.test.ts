import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { tareaParaCapataz } from "../tablero/guardias.ts";
import type { AsignacionTablero } from "../tablero/tipos.ts";

// EL CAPATAZ NUNCA VE LA PALABRA "GUARDIA" (guardias-contrato.md §1.5): ni en la Hoja del día,
// ni en el pizarrón, ni en el mensaje de Telegram. Es una palabra de la oficina.
//
// Cambio del 18/10 (JS): en esta entrega la Hoja del día NO suma las tareas del tablero —hoy
// muestra sólo obras de Odoo, y si debería mostrar tareas es una decisión pendiente—. Así que
// hoy una guardia no le llega al capataz por ningún camino. Este test cuida las dos puertas
// por las que podría empezar a llegar:
//
//   1. el día que la Hoja sume las tareas, tiene que pasarlas por tareaParaCapataz, que
//      convierte la guardia en "Depósito · mantenimiento de material";
//   2. mientras tanto, ningún archivo de la Hoja (servidor, celular, pizarrón, Telegram) lee
//      las tareas del tablero por su cuenta ni escribe la palabra. Si alguien lo cambia, este
//      test lo frena y lo manda a leer esto.

const RAIZ = join(import.meta.dirname, "..", "..");
const CARPETAS = ["lib/hoja-dia", "components/hoja-dia"];

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return archivos(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test(-fixture)?\.ts$/.test(n) ? [p] : [];
  });
}

test("una guardia llega al capataz como depósito, sin la palabra", () => {
  const guardia: AsignacionTablero = {
    id: 501,
    origen: "tarea",
    otId: 0,
    tarea: { grupoId: 501, titulo: "Guardia", tipo: "guardia", hecha: false },
    fecha: "2026-11-03",
    cuadrillaId: 12,
    fraccion: 1,
    estado: "confirmada",
    ordenDia: 0,
    notas: "jueves le tocaba a la C2 por rotación (guardia)",
    parteId: null,
    motivoFija: null,
  };
  const t = tareaParaCapataz(guardia);
  assert.ok(t);
  assert.equal(t.titulo, "Depósito · mantenimiento de material");
  assert.doesNotMatch(JSON.stringify(t), /guardia/i, "ni el título, ni el tipo, ni las notas");
});

test("la rellenada con depósito también llega como depósito", () => {
  const t = tareaParaCapataz({
    id: 502,
    origen: "tarea",
    tarea: { grupoId: 502, titulo: "Depósito", tipo: "deposito", hecha: true, deGuardia: true },
    cuadrillaId: 12,
    fraccion: 1,
    notas: null,
  });
  assert.doesNotMatch(JSON.stringify(t), /guardia/i);
});

test("ningún archivo de la Hoja del día lee las tareas del tablero ni dice 'guardia'", () => {
  const encontrados: string[] = [];
  for (const carpeta of CARPETAS) {
    for (const archivo of archivos(join(RAIZ, carpeta))) {
      const texto = readFileSync(archivo, "utf8");
      if (/guardia/i.test(texto)) encontrados.push(`${archivo}: dice "guardia"`);
      if (/tablero_tareas|tareasEnRango/.test(texto) && !/tareaParaCapataz/.test(texto)) {
        encontrados.push(`${archivo}: lee las tareas del tablero sin pasar por tareaParaCapataz`);
      }
    }
  }
  assert.deepEqual(encontrados, []);
});
