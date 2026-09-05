// Acota los automatismos de sync (OT y Obra) a los campos que el espejo realmente lee.
//
// Correr con: node --env-file=.env.local scripts/odoo-webhooks-solo-campos-espejados.mjs
//             node --env-file=.env.local scripts/odoo-webhooks-solo-campos-espejados.mjs --revertir
//
// EL PROBLEMA: los dos automatismos estaban en "disparar con cualquier campo"
// (trigger_field_ids vacío). El parte diario cuelga de una cadena de calculados que llega
// hasta la venta —parte → OT (12 calculados) → venta (4) → obra (5)— así que guardar UN
// parte reescribía la OT varias veces, y cada reescritura llamaba por HTTPS a la app. Odoo
// espera esa respuesta dentro de la transacción: ~1 segundo por vez. Medido contra la
// instancia real, un write a la OT pasa de 250 ms a 1330 ms sólo por el webhook.
//
// Y no aportaba nada: el handler no usa el payload, re-lee la OT fresca de Odoo y
// reescribe en Supabase los mismos campos de siempre. Ninguno de los calculados
// (x_costo_*, x_horas_hombre, x_dias_obra…) se espeja.
//
// Los campos de acá abajo son exactamente OT_FIELDS y OBRA_FIELDS de src/lib/odoo/. SI SE
// AGREGA UN CAMPO AL ESPEJO, HAY QUE AGREGARLO ACÁ: si no, ese campo se sincroniza sólo
// cuando cambia alguno de los otros.
//
// El alta sigue disparando siempre: en Odoo los campos disparadores filtran el write, no
// el create (verificado contra esta instancia). Las OTs y obras nuevas se siguen espejando.

import { searchRead, executeKw } from "./odoo-rpc.mjs";

const REVERTIR = process.argv.includes("--revertir");

const OBJETIVO = [
  {
    automatismo: "AndamiosOS sync ordenes de trabajo",
    modelo: "x_aba_orden_trabajo",
    // == OT_FIELDS en src/lib/odoo/ordenes-trabajo.ts (sin `id`, que no es un campo que cambie).
    campos: [
      "x_name", "x_obra_id", "x_tipo", "x_estado", "x_fecha_programada",
      "x_observaciones", "x_es_adicional", "x_aprobada_comercial", "x_andamios_id",
    ],
  },
  {
    automatismo: "AndamiosOS sync obras",
    modelo: "x_aba_obra",
    // == OBRA_FIELDS en src/lib/odoo/obras.ts.
    campos: [
      "x_name", "x_cliente_id", "x_fecha_inicio", "x_fecha_fin_estimada",
      "x_estado", "x_andamios_id", "x_observaciones",
    ],
  },
];

for (const { automatismo, modelo, campos } of OBJETIVO) {
  const [aut] = await searchRead(
    "base.automation", [["name", "=", automatismo]], ["name", "trigger", "trigger_field_ids"],
  );
  if (!aut) {
    console.log(`⚠️  no existe el automatismo "${automatismo}" — se omite`);
    continue;
  }

  if (REVERTIR) {
    await executeKw("base.automation", "write", [[aut.id], { trigger_field_ids: [[5, 0, 0]] }]);
    console.log(`↩️  "${automatismo}": vuelve a dispararse con cualquier campo`);
    continue;
  }

  // Los ids de los campos, por nombre. Si alguno no existe se corta: dejar un disparador a
  // medias es peor que no tocar nada, porque el espejo se desincroniza en silencio.
  const filas = await searchRead(
    "ir.model.fields", [["model", "=", modelo], ["name", "in", campos]], ["name"],
  );
  const faltan = campos.filter((c) => !filas.some((f) => f.name === c));
  if (faltan.length > 0) {
    throw new Error(`En ${modelo} no existen estos campos: ${faltan.join(", ")}`);
  }

  await executeKw("base.automation", "write", [
    [aut.id], { trigger_field_ids: [[6, 0, filas.map((f) => f.id)]] },
  ]);
  console.log(`✅ "${automatismo}": ahora dispara sólo con ${campos.length} campos`);
  console.log(`   ${campos.join(", ")}`);
}

// Relectura de control: lo que quedó guardado, no lo que creemos que mandamos.
console.log("\n── como quedaron ──");
for (const { automatismo } of OBJETIVO) {
  const [aut] = await searchRead(
    "base.automation", [["name", "=", automatismo]], ["name", "trigger", "trigger_field_ids"],
  );
  if (!aut) continue;
  const ids = aut.trigger_field_ids ?? [];
  const nombres = ids.length
    ? (await searchRead("ir.model.fields", [["id", "in", ids]], ["name"])).map((f) => f.name)
    : ["(cualquier campo)"];
  console.log(`${aut.name} [${aut.trigger}] → ${nombres.join(", ")}`);
}
