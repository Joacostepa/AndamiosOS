import { test } from "node:test";
import assert from "node:assert/strict";
import { tandasDeHerramientas } from "./tandas.ts";

const nombres = (ts: { name: string }[][]) => ts.map((t) => t.map((u) => u.name));
const u = (...ns: string[]) => ns.map((name) => ({ name }));

test("las de sólo lectura seguidas van juntas", () => {
  assert.deepEqual(nombres(tandasDeHerramientas(u("buscar_clientes", "ver_presupuesto", "consultar_odoo"))), [["buscar_clientes", "ver_presupuesto", "consultar_odoo"]]);
});

test("una que toca el borrador corta la tanda y va sola, en su lugar", () => {
  assert.deepEqual(
    nombres(tandasDeHerramientas(u("buscar_clientes", "actualizar_borrador", "ver_borrador", "validar_cuit", "cotizar_bandeja", "quitar_del_presupuesto"))),
    [["buscar_clientes"], ["actualizar_borrador"], ["ver_borrador", "validar_cuit"], ["cotizar_bandeja"], ["quitar_del_presupuesto"]],
  );
});

test("confirmar y proponer nunca corren a la vez con otra", () => {
  assert.deepEqual(nombres(tandasDeHerramientas(u("guardar_presupuesto_odoo", "confirmar_accion"))), [["guardar_presupuesto_odoo"], ["confirmar_accion"]]);
  assert.deepEqual(tandasDeHerramientas([]), []);
});
