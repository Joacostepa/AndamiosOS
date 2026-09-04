// Prueba de punta a punta del bloqueo al confirmar sin clasificar el trabajo.
// Acompaña a odoo-tipo-de-trabajo.mjs: si alguien toca esa automatización, esto dice si
// sigue funcionando.
//
// OJO: CREA UNA COTIZACIÓN REAL Y LA BORRA. No queda basura, pero cada corrida consume un
// número de la secuencia de ventas (S02523, S02524...). No es gratis correrlo en loop.
//
// Comprueba cinco cosas: que bloquee sin nada, sin tipo de obra y sin contestar el
// alambre; que deje confirmar cuando está todo; y —la que importa para no romper nada—
// que una orden vieja ya confirmada se siga pudiendo escribir, porque la regla se dispara
// sólo en el cambio de estado y la app le escribe el permiso a órdenes confirmadas.
//
// Correr: node --env-file=.env.local scripts/odoo-probar-bloqueo-clasificacion.mjs

import { searchRead, create, write, executeKw } from "./odoo-rpc.mjs";

const [socio] = await searchRead("res.partner", [["is_company", "=", true]], ["id", "name"], { limit: 1 });
const orden = await create("sale.order", { partner_id: socio.id });
const [o] = await searchRead("sale.order", [["id", "=", orden]], ["name", "state", "date_order"]);
console.log(`cotización de prueba ${o.name} (id ${orden}) · ${socio.name} · date_order ${o.date_order}\n`);

async function intentar(etiqueta, esperaBloqueo) {
  try {
    await executeKw("sale.order", "action_confirm", [[orden]]);
    const [d] = await searchRead("sale.order", [["id", "=", orden]], ["state"]);
    const ok = !esperaBloqueo;
    console.log(`${ok ? "✓" : "✗"} ${etiqueta}\n     confirmó (estado ${d.state})${ok ? "" : "  ← TENDRÍA QUE HABER BLOQUEADO"}`);
    if (d.state !== "draft") await write("sale.order", [orden], { state: "draft" });
    return ok;
  } catch (e) {
    const msg = String(e.message).replace(/\n/g, "\n     ");
    console.log(`${esperaBloqueo ? "✓" : "✗"} ${etiqueta}\n     ${msg}`);
    return esperaBloqueo;
  }
}

let bien = 0;
bien += (await intentar("sin nada cargado → bloquea", true)) ? 1 : 0;

await write("sale.order", [orden], { x_trabajo_ambito: "obra", x_syh_presencial: "si" });
bien += (await intentar("con ámbito y SyH, sin tipo de obra → bloquea", true)) ? 1 : 0;

await write("sale.order", [orden], { x_trabajo_obra: "estructura_pantalla" });
bien += (await intentar("tipo con bandeja y sin contestar el alambre → bloquea", true)) ? 1 : 0;

await write("sale.order", [orden], { x_alambre_concertina: "no" });
bien += (await intentar("sin contestar el permiso de implantación → bloquea", true)) ? 1 : 0;

await write("sale.order", [orden], { x_lleva_permiso: "si" });
bien += (await intentar("lleva permiso pero sin decir con qué se arma → bloquea", true)) ? 1 : 0;

await write("sale.order", [orden], { x_permiso_modalidad: "con_expediente" });
bien += (await intentar("todo completo → confirma", false)) ? 1 : 0;

await write("sale.order", [orden], { state: "draft" });
await executeKw("sale.order", "unlink", [[orden]]);
const quedo = await executeKw("sale.order", "search_count", [[["id", "=", orden]]]);
console.log(`\n✓ cotización de prueba borrada (quedan ${quedo} con ese id)`);

// EL CONTROL QUE IMPORTA sobre las 872 viejas: la regla se dispara SÓLO cuando cambia el
// estado, así que editar una confirmada vieja —que es lo que hace la app cuando le escribe
// el permiso— no puede quedar bloqueado por campos que esa orden nunca va a tener.
const [vieja] = await searchRead(
  "sale.order",
  [["state", "in", ["sale", "done"]], ["x_trabajo_ambito", "=", false]],
  ["id", "name", "x_syh_presencial"],
  { limit: 1, order: "date_order asc" },
);
try {
  // Se escribe el MISMO valor que ya tiene: prueba el camino sin cambiar ningún dato.
  await write("sale.order", [vieja.id], { x_syh_presencial: vieja.x_syh_presencial || false });
  console.log(`✓ orden vieja ${vieja.name} (confirmada, sin clasificar): se pudo escribir sin bloqueo`);
  bien++;
} catch (e) {
  console.log(`✗ orden vieja ${vieja.name}: la regla la bloqueó — ${e.message}`);
}

console.log(bien === 7 ? "\n✓ los 7 escenarios dieron lo esperado" : `\n✗ ${7 - bien} escenarios fallaron`);
