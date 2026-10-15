import { test } from "node:test";
import assert from "node:assert/strict";
import { paginar, POR_PAGINA, queryARef, refAQuery } from "./contrato.ts";
import { armarRegistro, NODOS } from "./index.ts";

test("registro: cada tipo una sola vez; lo de Socios queda reservado", () => {
  assert.ok(NODOS.dolar, "el nodo de ejemplo está registrado");
  const resolver = async () => ({ titulo: "", cifra: { tipo: "texto" as const, texto: "" }, secciones: [] });
  assert.throws(() => armarRegistro([[{ tipo: "a", pantalla: "caja", resolver }], [{ tipo: "a", pantalla: "ventas", resolver }]]), /dos veces/);
  const reg = armarRegistro([[{ tipo: "retirosMes", pantalla: "socios", resolver }]]);
  assert.equal(reg.retirosMes.reservado, true);
});

test("paginar de a 50", () => {
  const filas = Array.from({ length: 120 }, (_, i) => i);
  assert.equal(POR_PAGINA, 50);
  assert.deepEqual(paginar(filas, 1).pagina, { actual: 1, total: 3, filas: 120 });
  assert.deepEqual(paginar(filas, 3).filas, filas.slice(100));
  assert.equal(paginar(filas, 99).pagina.actual, 3);
  assert.deepEqual(paginar([], 1).pagina, { actual: 1, total: 1, filas: 0 });
});

test("NodoRef ↔ query", () => {
  const q = refAQuery({ tipo: "cliente", v: "MINISTERIO DEL INTERIOR", g: "cliente" }, 2);
  assert.equal(q, "nodo=cliente&v=MINISTERIO+DEL+INTERIOR&g=cliente&pagina=2");
  assert.deepEqual(queryARef(new URLSearchParams(q)), { ref: { tipo: "cliente", v: "MINISTERIO DEL INTERIOR", g: "cliente" }, pagina: 2 });
  assert.equal(queryARef(new URLSearchParams("v=1")), null);
  assert.equal(queryARef(new URLSearchParams("nodo=../x")), null);
});

test("queryARef: descarta claves desconocidas y valores con otro formato (no multiplica lecturas a Odoo)", async () => {
  const { queryARef: q2 } = await import("./contrato.ts");
  const r = q2(new URLSearchParams("nodo=resultado&mes=2026-09&basura=1&desde=ayer&hasta=2026-10-15&g=cliente&pagina=2"));
  assert.deepEqual(r, { ref: { tipo: "resultado", mes: "2026-09", hasta: "2026-10-15", g: "cliente" }, pagina: 2 });
  assert.deepEqual(q2(new URLSearchParams("nodo=contratosCalle&c=Hv Obras %26 Servicios S.r.l.&g=a b"))?.ref, { tipo: "contratosCalle", c: "Hv Obras & Servicios S.r.l." });
  assert.equal(q2(new URLSearchParams("nodo=x&mes=2026-13"))?.ref.mes, undefined);
});

test("PARAMS_NODO: toda clave que usan los nodos de la app tiene formato declarado", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const { PARAMS_NODO } = await import("./contrato.ts");
  const dirs = ["src/lib/direccion/desglose", "src/lib/direccion/calculo"];
  const claves = new Set<string>();
  for (const d of dirs) {
    for (const f of readdirSync(d)) {
      if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
      const src = readFileSync(`${d}/${f}`, "utf8");
      for (const m of src.matchAll(/(?:nodo|hijo|ver): \(?\{ ?tipo: "[A-Za-z_]+",? ?([^}]*)\}/g)) {
        for (const k of m[1].matchAll(/(?:^|,\s*)([a-z][A-Za-z]*)(?=[:,]|\s*$)/g)) claves.add(k[1]);
      }
    }
  }
  const faltan = [...claves].filter((k) => !(k in PARAMS_NODO));
  assert.deepEqual(faltan, []);
});
