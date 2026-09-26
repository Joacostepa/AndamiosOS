// Chequeo de sólo lectura de lo que el Asistente Comercial da por sentado en Odoo.
//
// El asistente arma órdenes con ids fijos (impuesto, término de pago, plantilla de mail) y
// con una tabla de productos copiada de la skill andamios-propuesta. Si alguno cambió en
// Odoo —un producto archivado, una plantilla borrada— la orden sale mal o no sale, y el
// error aparece recién frente al vendedor. Esto lo muestra antes.
//
// NO ESCRIBE NADA.
//
// Correr: node --env-file=.env.local scripts/odoo-probar-comercial.mjs

import { searchRead, read, fieldsGet } from "./odoo-rpc.mjs";

const PRODUCTOS = [143, 165, 156, 157, 161, 144, 145, 168, 169, 172, 146, 147, 218, 170, 158, 159, 162, 163, 166, 193];

const prods = await searchRead("product.product", [["id", "in", PRODUCTOS], ["active", "in", [true, false]]],
  ["id", "display_name", "active", "type", "list_price", "uom_id", "sale_ok"]);
const porId = new Map(prods.map((p) => [p.id, p]));
console.log("── Productos de la tabla");
for (const id of PRODUCTOS) {
  const p = porId.get(id);
  console.log(p ? `  ${id}\t${p.active ? "activo " : "ARCHIVADO"}\t${p.type}\t${p.uom_id?.[1] ?? "-"}\t${p.display_name}` : `  ${id}\tNO EXISTE`);
}

console.log("\n── Candidatos a ingeniería / memoria de cálculo / viáticos / izaje");
const cands = await searchRead("product.product",
  ["|", "|", "|", "|", ["name", "ilike", "ingenier"], ["name", "ilike", "memoria"], ["name", "ilike", "viátic"], ["name", "ilike", "viatic"], ["name", "ilike", "izaje"]],
  ["id", "display_name", "type", "list_price", "active"]);
for (const p of cands) console.log(`  ${p.id}\t${p.type}\t$${p.list_price}\t${p.display_name}`);

console.log("\n── Servicios activos (type=service)");
const servicios = await searchRead("product.product", [["type", "=", "service"], ["sale_ok", "=", true]], ["id", "display_name", "list_price"], { limit: 60 });
for (const p of servicios) console.log(`  ${p.id}\t$${p.list_price}\t${p.display_name}`);

console.log("\n── Campos de sale.order que usa el asistente");
const campos = await fieldsGet("sale.order");
for (const f of ["x_studio_tcnico", "x_studio_tipo_de_contrato", "x_dur_armado", "x_dur_desarme", "x_personal_armado",
  "x_personal_desarme", "x_trabajo_ambito", "x_trabajo_obra", "x_trabajo_evento", "x_alambre_concertina", "x_syh_presencial",
  "x_lleva_permiso", "x_permiso_modalidad", "x_alcance_tecnico", "x_fecha_fin_obra_estimada", "x_direccion_obra",
  "x_studio_propuesta", "opportunity_id", "is_rental_order", "payment_term_id", "user_id"]) {
  const c = campos[f];
  if (!c) { console.log(`  ${f}: NO EXISTE`); continue; }
  const sel = c.selection ? ` [${c.selection.map((s) => `${s[0]}=${s[1]}`).join(", ")}]` : "";
  console.log(`  ${f}: ${c.type}${c.relation ? ` → ${c.relation}` : ""} «${c.string}»${c.required ? " (obligatorio)" : ""}${sel}`);
}

console.log("\n── Técnicos (valores posibles de x_studio_tcnico)");
const rel = campos.x_studio_tcnico?.relation;
if (rel) {
  const tecnicos = await searchRead(rel, [], ["id", "display_name"], { limit: 30 });
  for (const t of tecnicos) console.log(`  ${t.id}\t${t.display_name}`);
}

console.log("\n── Ids fijos");
const [iva] = await read("account.tax", [88], ["name", "amount", "type_tax_use", "active"]);
console.log(`  impuesto 88: ${iva ? `${iva.name} (${iva.amount} %, ${iva.type_tax_use}, ${iva.active ? "activo" : "INACTIVO"})` : "NO EXISTE"}`);
const [pt] = await read("account.payment.term", [11], ["name", "active"]);
console.log(`  término de pago 11: ${pt ? `${pt.name}${pt.active ? "" : " (INACTIVO)"}` : "NO EXISTE"}`);
const [pl] = await read("product.pricelist", [1], ["name", "currency_id"]);
console.log(`  lista de precios 1: ${pl ? `${pl.name} (${pl.currency_id?.[1]})` : "NO EXISTE"}`);
const plantillas = await searchRead("mail.template", [["id", "=", 65]], ["name", "model", "subject"]);
console.log(`  plantilla 65: ${plantillas[0] ? `${plantillas[0].name} · ${plantillas[0].model}` : "NO EXISTE"}`);

console.log("\n── Vendedores (res.users internos)");
const usuarios = await searchRead("res.users", [["share", "=", false]], ["id", "name", "login"], { limit: 40 });
for (const u of usuarios) console.log(`  ${u.id}\t${u.login}\t${u.name}`);
