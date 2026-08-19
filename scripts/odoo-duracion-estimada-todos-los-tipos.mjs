// La duración estimada deja de ser exclusiva del armado.
//
// EL PROBLEMA: en el formulario que usa Comercial, x_duracion_est estaba
// `invisible="x_tipo != 'armado'"` y sólo era obligatoria en armado. Un desarme se podía
// guardar sin estimación —y sin dotación, que era `required="x_tipo == 'armado'"` con
// default 0—. Comercial no tenía forma de indicar el estimado de un desarme aunque lo
// supiera, y ese estimado es lo que Operaciones usa para planificar.
//
// EL EFECTO COLATERAL, que es el que obliga a arreglarlo: el Informe de Obra sólo muestra
// el desvío cuando TODAS las OTs de la obra tienen x_duracion_est (si falta una, el
// fallback de x_jornadas_num devuelve el `1` por default de la importación y un desvío
// contra un número inventado es peor que ningún desvío). Como el 78% de las ventas tienen
// desarme y el desarme no podía estimarse, esa sección no iba a mostrarse NUNCA, ni
// siquiera para las obras nuevas.
//
// EL SUGERIDO: medido sobre 415 obras con armado y desarme ejecutados, el desarme lleva
// ~60% del armado con piso de una jornada. La regla max(1, round(armado × 0,6)) reproduce
// la mediana de todos los tramos:
//
//   armado 1d → desarme 1d   (346 de 355 casos)   ratio 1,03
//   armado 2d → desarme 1d   (25 de 27)           ratio 0,54
//   armado 3d → desarme 2d   (13 de 15)           ratio 0,62
//   armado 4d → desarme 2d                        ratio 0,54
//   armado 6d → desarme ~4d                       ratio 0,63
//
// OJO CON EL RATIO DE HORAS: el crudo da 0,94, pero el 42% de las obras tiene el desarme
// con exactamente las mismas horas que el armado —mismo personal y mismas horas copiadas
// en los dos partes—. Sacando esos casos artificiales la mediana cae a 0,50–0,75, que ya
// coincide con la de días. Usar el promedio crudo habría dado una sugerencia al doble.
//
// SE SUGIERE, NO SE PRECARGA. Si el valor viene puesto en el campo se acepta sin pensarlo,
// y lo que se busca es que Comercial diga cuánto es. El texto informa al lado; cuando se
// lo ignora, fue una decisión.
//
// Idempotente: se puede re-correr sin duplicar.
// Correr: node --env-file=.env.local scripts/odoo-duracion-estimada-todos-los-tipos.mjs
import { version, authenticate, searchRead, create, write, fieldsGet } from "./odoo-rpc.mjs";

const MODEL = "x_aba_orden_trabajo";
const CAMPO = "x_duracion_sugerida";

const COMPUTE = `
for rec in self:
    txt = ''
    t = rec['x_tipo'] or ''
    if t and t != 'armado':
        o = rec['x_order_id']
        if o:
            base = 0.0
            for h in rec.env['x_aba_orden_trabajo'].search([('x_order_id', '=', o.id), ('x_tipo', '=', 'armado')]):
                base += float(h['x_duracion_est'] or 0)
            if base > 0:
                s = max(1.0, round(base * 0.6))
                txt = 'Sugerido: %g jornada(s). El armado de esta obra son %g. Medido sobre 415 obras, el desarme lleva ~60%% del armado, con piso de una jornada. Es una referencia: poner lo que corresponda.' % (s, base)
            else:
                txt = 'El armado de esta obra todavia no tiene duracion estimada, asi que no hay sugerencia. Estimar con una cuadrilla de 5 personas y jornada de 8 horas.'
    rec['${CAMPO}'] = txt
`.trim();

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}\n`);

// ── 1) El campo del sugerido ───────────────────────────────────────────────
const [modelo] = await searchRead("ir.model", [["model", "=", MODEL]], ["id"]);
if (!modelo) throw new Error(`No existe el modelo ${MODEL}`);

const existentes = await fieldsGet(MODEL, ["type"]);
if (CAMPO in existentes) {
  console.log(`· ${MODEL}.${CAMPO} ya existe`);
} else {
  await create("ir.model.fields", {
    model_id: modelo.id,
    model: MODEL,
    state: "manual",
    name: CAMPO,
    field_description: "Duración sugerida",
    ttype: "char",
    // NO se guarda: se recalcula al leer. Hace un search por registro, así que no va en
    // vistas de lista — sólo en el formulario de alta, donde es una fila.
    store: false,
    readonly: true,
    depends: "x_tipo,x_order_id",
    compute: COMPUTE,
  });
  console.log(`✓ ${MODEL}.${CAMPO} creado (char computado, no almacenado)`);
}

// ── 2) Las vistas ──────────────────────────────────────────────────────────
async function parchear(nombre, reemplazos) {
  const [vista] = await searchRead("ir.ui.view", [["name", "=", nombre]], ["id", "arch_db"]);
  if (!vista) throw new Error(`No existe la vista ${nombre}`);

  let arch = vista.arch_db;
  let cambios = 0;
  for (const [de, a] of reemplazos) {
    if (arch.includes(a) && !arch.includes(de)) continue; // ya parcheada
    if (!arch.includes(de)) {
      console.log(`  ⚠ no se encontró el fragmento a reemplazar en ${nombre}:\n    ${de}`);
      continue;
    }
    arch = arch.replace(de, a);
    cambios++;
  }

  if (cambios === 0) {
    console.log(`· ${nombre} ya estaba al día`);
    return;
  }
  // Odoo valida el arch al escribir: un XML roto o un campo inexistente tira acá y no en
  // la cara de Comercial.
  await write("ir.ui.view", [vista.id], { arch_db: arch });
  console.log(`✓ ${nombre}: ${cambios} cambio(s)`);
}

await parchear("x_aba_orden_trabajo.form.comercial", [
  [
    `<field name="x_duracion_est" invisible="x_tipo != 'armado'" required="x_tipo == 'armado'"/>`,
    `<field name="x_duracion_est" required="1"/>\n      <div colspan="2" class="alert alert-info" role="alert" invisible="x_tipo == 'armado' or not x_duracion_sugerida">\n        <field name="${CAMPO}" nolabel="1" readonly="1"/>\n      </div>`,
  ],
]);

await parchear("x_aba_orden_trabajo.form.comercial.dotacion", [
  [
    `<field name="x_personal_por_jornada" required="x_tipo == 'armado'"/>`,
    `<field name="x_personal_por_jornada" required="1"/>`,
  ],
]);

// ── 3) Verificación ────────────────────────────────────────────────────────
console.log("\n── verificación ──");
for (const n of ["x_aba_orden_trabajo.form.comercial", "x_aba_orden_trabajo.form.comercial.dotacion"]) {
  const [vw] = await searchRead("ir.ui.view", [["name", "=", n]], ["arch_db"]);
  const malo = /invisible="x_tipo != 'armado'"|required="x_tipo == 'armado'"/.test(vw.arch_db);
  console.log(`  ${malo ? "✗" : "✓"} ${n}${malo ? " — todavía condiciona por armado" : ""}`);
}

// El sugerido, calculado sobre desarmes reales cuyo armado sí tiene estimación.
const desarmes = await searchRead(
  MODEL,
  [["x_tipo", "=", "desarme"]],
  ["x_name", "x_duracion_est", CAMPO],
  { limit: 400 },
);
const conTexto = desarmes.filter((d) => d[CAMPO]);
console.log(`\n  desarmes con sugerencia calculada: ${conTexto.length} de ${desarmes.length}`);
for (const d of conTexto.filter((d) => String(d[CAMPO]).startsWith("Sugerido")).slice(0, 5)) {
  console.log(`    ${String(d.x_name).slice(0, 48)}`);
  console.log(`      ${d[CAMPO]}`);
}

console.log("\n✅ Listo. Comercial ahora estima duración y dotación en TODOS los tipos de OT.");
