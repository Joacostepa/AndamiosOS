// Guardar sin CUIT (JS, 12/10): se puede, con aviso. Un CUIT cargado que no valida sigue
// bloqueando. Y sin contacto con nombre, un aviso para preguntar a quién va el mensaje.

import { test } from "node:test";
import assert from "node:assert/strict";
import { TARIFAS_AGO26 as T } from "../cotizador/prueba-tarifas.ts";
import { borradorVacio, recalcular, type DatosBorrador } from "./borrador.ts";

const ctx = { tarifas: T, lista: null, hoy: "2026-10-12" };

function nuevo(cliente: Partial<DatosBorrador["cliente"]>): DatosBorrador {
  const d = borradorVacio();
  return {
    ...d,
    cliente: {
      ...d.cliente, esNuevo: true, razonSocial: "Scarvaci Construcciones SRL", contacto: "Mariana", celular: "1155556666",
      email: "m@x.com", domicilio: "Juncal 1000", cuit: null, ...cliente,
    },
  };
}
const codigos = (xs: { codigo: string }[]) => xs.map((x) => x.codigo);

test("cliente nuevo sin CUIT: no bloquea, avisa", () => {
  const r = recalcular(nuevo({}), ctx);
  assert.ok(!codigos(r.faltantes).includes("cuit"));
  assert.ok(!r.faltantes.some((f) => f.codigo === "cliente_nuevo"));
  assert.ok(r.avisos.some((a) => a.codigo === "sin_cuit" && a.nivel === "advertencia"));
});

test("un CUIT cargado que no valida sigue bloqueando, y el de 10 dígitos trae la propuesta", () => {
  const r = recalcular(nuevo({ cuit: "20-8632598-6" }), ctx);
  const f = r.faltantes.find((x) => x.codigo === "cuit");
  assert.ok(f);
  assert.match(f.texto, /20-08632598-6/);
  assert.ok(!r.avisos.some((a) => a.codigo === "sin_cuit"));
});

test("con CUIT válido no hay aviso de CUIT", () => {
  const r = recalcular(nuevo({ cuit: "30-71111650-4" }), ctx);
  assert.ok(!codigos(r.faltantes).includes("cuit"));
  assert.ok(!r.avisos.some((a) => a.codigo === "sin_cuit"));
});

test("sin contacto con nombre: aviso que no bloquea", () => {
  const r = recalcular(nuevo({ contacto: null, cuit: "30-71111650-4" }), ctx);
  assert.ok(r.avisos.some((a) => a.codigo === "sin_contacto" && a.nivel === "advertencia"));
  // El contacto sigue haciendo falta para dar de alta a un cliente nuevo.
  assert.ok(r.faltantes.some((f) => f.codigo === "cliente_nuevo" && /contacto/.test(f.texto)));
});
