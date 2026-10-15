// Guardia de CI: Dirección no escribe en Odoo. Ningún archivo de Dirección (lib, API,
// páginas, componentes) importa algo de src/lib/odoo/ salvo odoo-lectura.ts, que sólo toma
// executeKw/OdooError del cliente; y nadie llama métodos de escritura por string.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = join(import.meta.dirname, "..", "..", "..");
const CARPETAS = ["src/lib/direccion", "src/app/api/direccion", "src/app/api/cron/direccion", "src/app/(dashboard)/direccion", "src/components/direccion"];

function archivos(dir: string): string[] {
  let salida: string[] = [];
  let entradas: string[] = [];
  try { entradas = readdirSync(dir); } catch { return []; }
  for (const e of entradas) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) salida = salida.concat(archivos(p));
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\.ts$/.test(e)) salida.push(p);
  }
  return salida;
}

test("sólo odoo-lectura.ts toca src/lib/odoo/", () => {
  const todos = CARPETAS.flatMap((c) => archivos(join(RAIZ, c)));
  assert.ok(todos.length > 10, "encontró los archivos de Dirección");
  for (const f of todos) {
    const rel = relative(RAIZ, f);
    const src = readFileSync(f, "utf8");
    const importaOdoo = /from\s+["'](?:@\/lib\/odoo\/|(?:\.\.\/)+odoo\/)[^"']*["']/.test(src);
    if (rel === "src/lib/direccion/odoo-lectura.ts") {
      assert.match(src, /import \{ executeKw, OdooError, type OpcionesRpc \} from "\.\.\/odoo\/client\.ts";/);
      assert.doesNotMatch(src, /\b(create|write|unlink)\s*\(/);
    } else {
      assert.equal(importaOdoo, false, `${rel} importa src/lib/odoo/: usá src/lib/direccion/odoo-lectura.ts`);
    }
  }
});

test("nadie pide métodos de escritura a Odoo por nombre", () => {
  const todos = CARPETAS.flatMap((c) => archivos(join(RAIZ, c)));
  for (const f of todos) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /llamarLectura\([^)]*["'](write|create|unlink|copy|message_post|action_\w+|button_\w+)["']/, relative(RAIZ, f));
  }
});

test("lo de socios que no es dato tampoco viaja en el JS del navegador", () => {
  // diccionario-socios.ts (la definición completa de Retiros) sólo lo importan módulos de
  // servidor: ningún archivo "use client" ni nada en src/components.
  const todos = CARPETAS.flatMap((c) => archivos(join(RAIZ, c)));
  for (const f of todos) {
    const rel = relative(RAIZ, f);
    const src = readFileSync(f, "utf8");
    if (!/from\s+["'][^"']*diccionario-socios/.test(src)) continue;
    assert.ok(!rel.startsWith("src/components/") && !/^["']use client["']/m.test(src), `${rel} es de cliente e importa diccionario-socios`);
  }
  // Y el diccionario público no trae las cuentas de los retiros.
  const dicc = readFileSync(join(RAIZ, "src/lib/direccion/diccionario.ts"), "utf8");
  assert.doesNotMatch(dicc, /1775|1776|1803|1667|1791|1792|1608/);
});
