// La dirección de obra dejó de vivir escondida adentro del nombre de la OT y pasó a ser un
// campo propio: `sale.order.x_direccion_obra`, con el widget de Google Places encima.
//
// PERO EL CAMPO NACE VACÍO. Las ~2100 ventas viejas tienen la dirección sólo donde la tenían
// siempre: en los contactos, y reflejada —truncada a 72 y a veces equivocada— en `x_name`.
// Este script la deriva y la escribe en el campo nuevo, para que el día que la app deje de
// partir el título ya haya dato en todas.
//
// DE DÓNDE LA SACA, en orden. Es la MISMA prioridad que usa el compute de `x_name`
// (ver odoo-direccion-en-nombre-ot.mjs), con dos diferencias a favor:
//
//   1. NO TRUNCA A 72. Ese corte es lo que dejó "…Camino de la Ribera Sur, Ingenier"
//      guardado a medias. Acá entra entera.
//   2. SI LO DERIVADO NO TIENE NINGÚN DÍGITO —o sea que no es una dirección sino una razón
//      social ("ABSEILERSARG S.R.L.") o una persona ("Santiago Storni")— y la oportunidad
//      del CRM sí tiene una dirección cargada, gana la del CRM. Son los casos que hoy se
//      ven mal en el tablero.
//
// NO PISA NADA: sólo escribe donde `x_direccion_obra` está vacío. Se puede correr de nuevo
// sin miedo; lo ya cargado a mano queda como está.
//
// Correr:
//   node --env-file=.env.local scripts/odoo-backfill-direccion-obra.mjs            (simulacro)
//   node --env-file=.env.local scripts/odoo-backfill-direccion-obra.mjs --aplicar  (escribe)

import { authenticate, executeKw, searchRead } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");

const sinTilde = (x) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const tieneNum = (x) => /\d/.test(x || "");
const limpio = (x) => String(x || "").replace(/\n/g, " ").split(/\s+/).filter(Boolean).join(" ");

/**
 * ¿Esto que cargó alguien en el CRM parece una dirección?
 *
 * Hace falta porque "tiene un dígito" no alcanza: en el simulacro aparecieron "0" y "2,5",
 * y con la regla ingenua iban a PISAR datos mejores — S02103 cambiaba
 * "Telecom Alvarez Thomas CABA" por "0". Se pide altura Y una palabra de verdad.
 */
const pareceDireccion = (x) => {
  const t = String(x || "").trim();
  return t.length >= 6 && /\d/.test(t) && /[A-Za-zÁÉÍÓÚÑáéíóúñ]{3}/.test(t);
};

/** ¿El cliente se llama como su propia calle? Entonces el cliente ES el edificio y no se adivina. */
function seLlamaComoLaCalle(cli, calle) {
  if (!cli || !calle) return false;
  const nom = sinTilde(cli);
  return sinTilde(calle)
    .replace(/[^a-z]+/g, " ")
    .split(" ")
    .some((tok) => tok.length >= 5 && nom.includes(tok));
}

async function enLotes(modelo, ids, campos) {
  const salida = new Map();
  for (let i = 0; i < ids.length; i += 300) {
    const lote = await searchRead(modelo, [["id", "in", ids.slice(i, i + 300)]], campos);
    for (const r of lote) salida.set(r.id, r);
  }
  return salida;
}

await authenticate();

const ordenes = await searchRead(
  "sale.order",
  [["x_studio_tipo_de_contrato", "=", "Obra "]],
  ["name", "partner_id", "partner_shipping_id", "opportunity_id", "x_direccion_obra"],
  { limit: 5000 },
);
console.log(`Ventas tipo "Obra ": ${ordenes.length}`);

const idsPartner = new Set();
for (const o of ordenes) {
  if (o.partner_id) idsPartner.add(o.partner_id[0]);
  if (o.partner_shipping_id) idsPartner.add(o.partner_shipping_id[0]);
}
const partners = await enLotes("res.partner", [...idsPartner], ["name", "parent_id", "street", "type"]);
const idsPadre = [...partners.values()].map((p) => p.parent_id && p.parent_id[0]).filter(Boolean);
const padres = await enLotes("res.partner", [...new Set(idsPadre)], ["name", "parent_id", "street", "type"]);
for (const [id, p] of padres) if (!partners.has(id)) partners.set(id, p);

// Los contactos de entrega de cada cliente, para cuando la venta no eligió ninguno.
const entregasDe = new Map();
const clientes = [...partners.values()].filter((p) => !p.parent_id).map((p) => p.id);
for (let i = 0; i < clientes.length; i += 200) {
  const lote = await searchRead(
    "res.partner",
    [["parent_id", "in", clientes.slice(i, i + 200)], ["type", "=", "delivery"]],
    ["name", "parent_id", "street"],
  );
  for (const h of lote) {
    const k = h.parent_id[0];
    if (!entregasDe.has(k)) entregasDe.set(k, []);
    entregasDe.get(k).push(h);
  }
}

// La dirección que cargó Comercial en el CRM, para el rescate de los casos sin número.
const idsLead = [...new Set(ordenes.map((o) => o.opportunity_id && o.opportunity_id[0]).filter(Boolean))];
const leads = await enLotes("crm.lead", idsLead, ["x_studio_direccion_de_la_obra", "city", "zip", "state_id"]);

/** La misma prioridad del compute de x_name, sin el truncado a 72. */
function derivar(orden) {
  let p = partners.get(orden.partner_id?.[0]) ?? null;
  if (p && p.parent_id) p = partners.get(p.parent_id[0]) ?? p;
  const cli = ((p?.name || "").split(",")[0] ?? "").trim();

  const s = partners.get(orden.partner_shipping_id?.[0]) ?? null;
  const crudo = limpio(s?.name);
  const calle = limpio(s?.street);

  // ¿El contacto de entrega ES el cliente? Su nombre no dice dónde queda la obra.
  let obra = cli && crudo.toUpperCase().startsWith(cli.toUpperCase().slice(0, 12)) ? "" : crudo;
  if (obra && calle && !tieneNum(obra) && tieneNum(calle)) obra = calle;

  if (!obra && s && !s.parent_id && p && !seLlamaComoLaCalle(cli, calle)) {
    const entregas = entregasDe.get(p.id) ?? [];
    if (entregas.length === 1) obra = limpio(entregas[0].name) || limpio(entregas[0].street);
  }
  if (!obra) obra = calle;
  if (!obra && p) obra = limpio(p.street);
  return obra;
}

const cambios = [];
const rescatadas = [];
const sinNada = [];

for (const o of ordenes) {
  if (o.x_direccion_obra) continue; // ya cargada: no se pisa
  let obra = derivar(o);
  const lead = o.opportunity_id ? leads.get(o.opportunity_id[0]) : null;
  const delCrm = limpio(lead?.x_studio_direccion_de_la_obra);

  // Rescate: lo derivado no parece una dirección y el CRM tiene una que SÍ lo parece.
  if (!tieneNum(obra) && pareceDireccion(delCrm)) {
    rescatadas.push({ orden: o.name, antes: obra, ahora: delCrm });
    obra = delCrm;
  }
  if (!obra && pareceDireccion(delCrm)) obra = delCrm;
  if (!obra) { sinNada.push(o.name); continue; }

  cambios.push({
    id: o.id,
    name: o.name,
    obra,
    ciudad: limpio(lead?.city),
    cp: limpio(lead?.zip),
    provincia: lead?.state_id ? lead.state_id[1] : "",
  });
}

console.log(`\n  a completar:                 ${cambios.length}`);
console.log(`  ya tenían dirección cargada: ${ordenes.filter((o) => o.x_direccion_obra).length}`);
console.log(`  sin dato en ningún lado:     ${sinNada.length}`);
console.log(`  rescatadas con la del CRM:   ${rescatadas.length}`);

console.log("\n--- rescatadas (lo derivado no era una dirección) ---");
rescatadas.slice(0, 15).forEach((r) => console.log(`  ${r.orden}  ${JSON.stringify(r.antes)} → ${JSON.stringify(r.ahora)}`));

console.log("\n--- muestra de lo que se va a escribir ---");
cambios.slice(0, 12).forEach((c) => console.log(`  ${c.name}  ${JSON.stringify(c.obra)}`));

const largas = cambios.filter((c) => c.obra.length > 72);
console.log(`\nDirecciones que el viejo x_name truncaba y ahora entran enteras: ${largas.length}`);
largas.slice(0, 8).forEach((c) => console.log(`  ${c.name}  (${c.obra.length}) ${JSON.stringify(c.obra)}`));

if (!APLICAR) {
  console.log("\nNo se escribió nada. Para aplicar: --aplicar");
  process.exit(0);
}

let hechas = 0;
for (const c of cambios) {
  const vals = { x_direccion_obra: c.obra };
  if (c.ciudad) vals.x_obra_ciudad = c.ciudad;
  if (c.cp) vals.x_obra_cp = c.cp;
  if (c.provincia) vals.x_obra_provincia = c.provincia;
  await executeKw("sale.order", "write", [[c.id], vals]);
  hechas++;
  if (hechas % 200 === 0) console.log(`  ...${hechas}/${cambios.length}`);
}
console.log(`\n✓ ${hechas} ventas actualizadas`);

// Verificación: el related de la OT tiene que haberse llenado solo.
const ots = await searchRead(
  "x_aba_orden_trabajo",
  [["x_estado", "in", ["pendiente", "en_proceso"]], ["x_order_id.x_studio_tipo_de_contrato", "=", "Obra "]],
  ["x_name", "x_direccion_obra"],
  { limit: 2000 },
);
const conDir = ots.filter((o) => o.x_direccion_obra);
console.log(`\nOTs activas: ${ots.length} · con dirección propia: ${conDir.length}`);
console.log(`  sin número (sospechosas): ${conDir.filter((o) => !tieneNum(o.x_direccion_obra)).length}`);
