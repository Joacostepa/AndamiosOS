// Agrega el valor 'cancelada' al selection x_aba_obra.x_estado en Odoo.
// Idempotente. Correr: node --env-file=.env.local scripts/odoo-add-cancelada-obra.mjs
import { authenticate, searchRead, create, fieldsGet } from "./odoo-rpc.mjs";

await authenticate();

// id del campo x_estado en x_aba_obra
const [field] = await searchRead(
  "ir.model.fields",
  [["model", "=", "x_aba_obra"], ["name", "=", "x_estado"]],
  ["id"],
);
if (!field) throw new Error("No existe x_aba_obra.x_estado");

const existing = await searchRead(
  "ir.model.fields.selection",
  [["field_id", "=", field.id], ["value", "=", "cancelada"]],
  ["id"],
);
if (existing.length) {
  console.log("· 'cancelada' ya existe en x_aba_obra.x_estado");
} else {
  await create("ir.model.fields.selection", {
    field_id: field.id, value: "cancelada", name: "Cancelada", sequence: 50,
  });
  console.log("✓ 'cancelada' agregado a x_aba_obra.x_estado");
}

const f = await fieldsGet("x_aba_obra", ["selection"]);
console.log("x_estado ahora:", JSON.stringify(f.x_estado.selection));
