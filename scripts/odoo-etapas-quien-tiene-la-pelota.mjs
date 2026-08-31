// Renombra las etiquetas de x_hab_etapa para que digan QUIÉN TIENE LA PELOTA.
//
// Las viejas confundían: la etapa `b` decía "ESPERANDO REQUISITOS DEL CLIENTE" y la `c`
// "DOCUMENTACION ENVIADA", con lo cual la palabra "requisito" significaba dos cosas
// distintas según la etapa —la lista que el cliente pide, y el papel que le mandamos— y
// no se entendía de quién era el próximo movimiento.
//
// Sólo toca el `name` de ir.model.fields.selection: los valores a..f no cambian, así que
// ningún dato se migra y nada que dependa de ellos se rompe.
//
// Correr: node --env-file=.env.local scripts/odoo-etapas-quien-tiene-la-pelota.mjs

import { authenticate, searchRead, write } from "./odoo-rpc.mjs";

const NUEVAS = {
  a: "1. NUESTRA — falta consultarle al cliente qué pide",
  b: "2. DEL CLIENTE — tiene que decir qué papeles pide",
  c: "3. DEL CLIENTE — tiene que validar lo que le mandamos",
  d: "4. HABILITADA",
  e: "VENCIDA — hay que renovar",
  f: "NO APLICA",
};

await authenticate();

const campo = await searchRead(
  "ir.model.fields",
  [["model", "=", "x_aba_orden_trabajo"], ["name", "=", "x_hab_etapa"]],
  ["id"],
);
if (!campo.length) throw new Error("No existe x_aba_orden_trabajo.x_hab_etapa");

const opciones = await searchRead(
  "ir.model.fields.selection",
  [["field_id", "=", campo[0].id]],
  ["value", "name"],
  { order: "sequence" },
);

for (const o of opciones) {
  const nueva = NUEVAS[o.value];
  if (!nueva || nueva === o.name) {
    console.log(`  · ${o.value} sin cambios`);
    continue;
  }
  await write("ir.model.fields.selection", [o.id], { name: nueva });
  console.log(`  ✓ ${o.value}: "${o.name}"\n       → "${nueva}"`);
}

console.log("\nverificación:");
for (const o of await searchRead("ir.model.fields.selection", [["field_id", "=", campo[0].id]], ["value", "name"], { order: "sequence" })) {
  console.log(`  ${o.value} = ${o.name}`);
}
