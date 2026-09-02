// Las iniciales del técnico salían invertidas en una de cada diez OTs.
//
// EL SÍNTOMA: la misma persona aparecía en el tablero y en la bandeja a veces como "GS" y
// a veces como "SG". Idem "JR"/"RJ" y "JS"/"SJ".
//
// NO ES DE LA APP. `x_tecnico` se muestra tal cual sale de Odoo (src/lib/odoo/
// asignaciones.ts). Y tampoco lo escribe nadie a mano, que fue la primera hipótesis y era
// falsa: el campo es COMPUTADO, almacenado y readonly desde siempre.
//
// LA CAUSA REAL está en el `depends`. Decía:
//
//     depends = "x_order_id.x_studio_tcnico"
//
// o sea "recalculá si cambia QUÉ EMPLEADO es el técnico" — pero no "si cambia CÓMO SE
// LLAMA". En algún momento los empleados se renombraron al formato "APELLIDO, Nombre", y
// como el many2one siguió apuntando al mismo id, Odoo no recalculó nada. Sólo las OTs que
// se tocaron después tomaron el valor nuevo. De ahí la mezcla:
//
//     JR 369 · GS 387 · JS 198   ← calculadas con los nombres viejos ("Gabriel Stepansky")
//     RJ  41 · SG  38 · SJ  28   ← recalculadas con los nuevos ("STEPANSKY, Gabriel")
//
// Y el compute viejo partía el nombre por espacios y tomaba las dos primeras iniciales,
// así que con el formato nuevo devuelve el apellido primero. Las 107 "invertidas" son en
// realidad las ÚNICAS que estaban al día con la regla vigente. Las otras 955 son viejas.
//
// SE ELIGE NOMBRE + APELLIDO —Gabriel Stepansky = GS— porque es cómo se escriben las
// iniciales de una persona y es lo que ya tenía el 90% del dato. Si se prefiriera al
// revés, se cambia el orden en CODIGO_COMPUTE y se vuelve a correr.
//
// EL ARREGLO SON TRES COSAS, y la segunda es la que importa:
//   1. el compute entiende "APELLIDO, Nombre" además de "Nombre Apellido";
//   2. el depends pasa a mirar el NOMBRE, así un renombrado vuelve a propagarse solo;
//   3. se fuerza el recálculo de las 1062 para que queden parejas hoy.
//
// QUÉ NO SE TOCA. El campo sigue siendo char con la sigla de dos letras, así que todo lo
// que hay en Odoo sigue andando igual. Auditado antes de escribir una línea:
//   · ir.filters, act_window, server actions, cron, base.automation,
//     spreadsheet.dashboard, ir.exports.line → CERO referencias a x_tecnico
//   · ir.ui.view → una sola, x_aba_orden_trabajo.list, que lo muestra readonly
//   · ir.model.fields → x_aba_parte_diario.x_p_tecnico es `related` a este campo. NO se
//     actualiza solo al recalcular el de la OT —comprobado— así que se recalcula acá
//     también. La app no lo lee, pero es lo que se ve en Odoo.
// Ningún filtro ni agrupación depende del literal, así que cambiar los valores no rompe
// nada de lo que hay armado.
//
// La app NO necesita ningún cambio.
//
// Correr:
//   node --env-file=.env.local scripts/odoo-iniciales-tecnico.mjs            (sólo mira)
//   node --env-file=.env.local scripts/odoo-iniciales-tecnico.mjs --aplicar  (escribe)

import { authenticate, create, executeKw, searchRead } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");
const MODELO = "x_aba_orden_trabajo";
const CAMPO = "x_tecnico";
/** El parte diario espeja la sigla con un `related`. Hay que recalcularlo aparte. */
const MODELO_PARTE = "x_aba_parte_diario";
const CAMPO_PARTE = "x_p_tecnico";

// Nombre + apellido, tolerando los dos formatos en que Odoo puede tener el nombre.
// `partition` y no `split(',')` para que un nombre con dos comas no rompa nada.
const CODIGO_COMPUTE = `for rec in self:
    t = ''
    o = rec['x_order_id']
    e = o['x_studio_tcnico'] if o else False
    if e:
        crudo = (e['name'] or '').strip()
        if ',' in crudo:
            apellido, _, pila = crudo.partition(',')
        else:
            partes = crudo.split()
            pila = partes[0] if partes else ''
            apellido = partes[-1] if len(partes) > 1 else ''
        pila = pila.strip()
        apellido = apellido.strip()
        t = ((pila[:1] if pila else '') + (apellido[:1] if apellido else '')).upper()
    rec['${CAMPO}'] = t
`;

// El arreglo de fondo: depende del NOMBRE, no de qué empleado es. Sin esto, el próximo
// renombrado deja otra vez la mitad del padrón con la sigla vieja y nadie se entera.
const DEPENDS = "x_order_id.x_studio_tcnico.name";

async function censo(etiqueta) {
  const ots = await searchRead(MODELO, [], [CAMPO], { limit: 5000 });
  const cuenta = new Map();
  for (const o of ots) {
    const v = o[CAMPO] === false || o[CAMPO] == null || o[CAMPO] === "" ? "(vacío)" : String(o[CAMPO]);
    cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  }
  console.log(`\n${etiqueta} — ${ots.length} OTs, ${cuenta.size} valores distintos:`);
  for (const [v, n] of [...cuenta].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(5)}  ${JSON.stringify(v)}`);
  }
  return cuenta;
}

await authenticate();

const [campo] = await searchRead(
  "ir.model.fields",
  [["model", "=", MODELO], ["name", "=", CAMPO]],
  ["id", "ttype", "store", "compute", "depends"],
);
if (!campo) throw new Error(`No existe ${MODELO}.${CAMPO}`);

console.log(`${MODELO}.${CAMPO} · ${campo.ttype} · store=${campo.store}`);
console.log(`depends actual: ${JSON.stringify(campo.depends)}`);
console.log(`depends nuevo:  ${JSON.stringify(DEPENDS)}`);

await censo("ANTES");

if (!APLICAR) {
  console.log("\nNo se escribió nada. Para aplicar: --aplicar");
  process.exit(0);
}

// ── 1 y 2: compute y depends ────────────────────────────────────────────────
await executeKw("ir.model.fields", "write", [
  [campo.id],
  { compute: CODIGO_COMPUTE, depends: DEPENDS },
]);
console.log("\n✓ compute y depends actualizados");

// ── 3: recálculo forzado ────────────────────────────────────────────────────
//
// Cambiar el compute no recalcula lo que ya está guardado: Odoo sólo recalcula lo que
// tiene marcado como sucio. Hay que marcarlo a mano, y eso es código del lado del
// servidor — de ahí la acción temporal, que se borra al terminar. Es el mismo mecanismo
// (ir.actions.server con state "code") que ya usan otros scripts del repo.
//
// El espejo del parte diario va en la MISMA acción y no se recalcula solo: comprobado a
// mano, marcar el campo de la OT no arrastra al `related` del otro modelo. Sin esto
// quedaban 80 partes con la sigla vieja, que es el mismo bug movido de lugar.
const [modelo] = await searchRead("ir.model", [["model", "=", MODELO]], ["id"]);
const accion = await create("ir.actions.server", {
  name: "AndamiosOS — recálculo temporal de x_tecnico",
  model_id: modelo.id,
  state: "code",
  code: `recs = env['${MODELO}'].search([])
env.add_to_compute(recs._fields['${CAMPO}'], recs)
env.flush_all()
partes = env['${MODELO_PARTE}'].search([])
env.add_to_compute(partes._fields['${CAMPO_PARTE}'], partes)
env.flush_all()`,
});

try {
  await executeKw("ir.actions.server", "run", [[accion]], {
    context: { active_model: MODELO, active_id: 0, active_ids: [] },
  });
  console.log("✓ recálculo disparado");
} finally {
  // Se borra pase lo que pase: una acción de servidor suelta en la lista es basura que
  // alguien va a encontrar dentro de seis meses sin saber qué hace.
  await executeKw("ir.actions.server", "unlink", [[accion]]);
  console.log("✓ acción temporal borrada");
}

const despues = await censo("DESPUÉS");

// El espejo del parte diario se verifica aparte, porque es donde falló el primer intento.
const partes = await searchRead(MODELO_PARTE, [], [CAMPO_PARTE], { limit: 5000 });
const enPartes = new Set(
  partes.map((p) => (p[CAMPO_PARTE] ? String(p[CAMPO_PARTE]) : "")).filter(Boolean),
);
console.log(`\nEspejo en ${MODELO_PARTE} (${partes.length} partes): ${[...enPartes].sort().join(", ")}`);

const invertidas = ["SG", "RJ", "SJ"].filter((s) => despues.has(s) || enPartes.has(s));
console.log(
  invertidas.length === 0
    ? "\nListo: no quedan siglas invertidas, ni en las OTs ni en los partes."
    : `\nOJO: todavía hay ${invertidas.join(", ")}. El recálculo no llegó a todo.`,
);
