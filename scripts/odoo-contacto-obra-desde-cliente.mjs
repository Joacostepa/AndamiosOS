// El contacto en obra se precarga desde la ficha del cliente.
//
// EL PROBLEMA: contacto y teléfono son obligatorios en el alta de OT y muchas veces son
// los mismos que ya están cargados en el cliente, así que se retipean a mano cada vez.
//
// POR QUÉ NO ES UN BOTÓN: un `<button type="object">` guarda el registro antes de
// ejecutarse, y en el diálogo de "Nueva OT" el registro todavía no existe. Como los dos
// campos son obligatorios, ese guardado fallaría por validación justo en los campos que
// el botón viene a llenar. Se muerde la cola. Un campo computado-editable sí evalúa sobre
// el registro sin guardar: se llena al elegir la venta y se escribe encima si hace falta.
//
// DE DÓNDE SALE EL DATO, y por qué no es obvio. Sobre 714 clientes de ventas confirmadas:
//
//   464 son de tipo `delivery` — la venta va a la dirección de obra, no a una persona
//   70% tiene nombre de calle ("Mansilla 2780, CABA", "Av. Juramento 969")
//   49% tiene teléfono
//   68 tienen el NOMBRE DE LA PERSONA metido dentro del campo teléfono:
//        "11-5527-2517 (Tiara Arancibia)"   "11-6367-5716  (Gustavo Seiler)"
//
// Así que la heurística es, en orden:
//   1. Si el teléfono trae "(Nombre)" al final, se parte en teléfono + nombre. Son los
//      casos donde el dato está completo y bien, sólo que mal guardado.
//   2. Si no, se usa el nombre del cliente SÓLO si no parece una dirección. Copiar una
//      calle a un campo que pide "nombre y apellido de quien recibe" es peor que dejarlo
//      vacío: el campo es obligatorio y alguien la acepta y sigue.
//
// SÓLO SE PRECARGAN LAS OTs VIVAS (pendiente / en_proceso). Una OT completada es
// historia, y llenarle el contacto con una heurística sería fabricar un dato que después
// alguien va a leer como si fuera el contacto real de esa obra. Son ~48 de 1003.
//
// Idempotente. Correr: node --env-file=.env.local scripts/odoo-contacto-obra-desde-cliente.mjs
import { version, authenticate, searchRead, write, executeKw } from "./odoo-rpc.mjs";
import { writeFileSync } from "node:fs";

const MODEL = "x_aba_orden_trabajo";

// El parseo del "(Nombre)" y el descarte de nombres que parecen dirección, compartidos
// por los dos campos. `campo` decide si devuelve el nombre o el teléfono.
const compute = (campo) => `
for rec in self:
    val = ''
    if rec['x_estado'] in ('pendiente', 'en_proceso'):
        o = rec['x_order_id']
        if o:
            p = o['partner_id']
            if p:
                tel = (p['phone'] or '').strip()
                nombre = ''
                if '(' in tel and ')' in tel:
                    i = tel.index('(')
                    j = tel.index(')')
                    if j > i:
                        nombre = tel[i + 1:j].strip()
                        tel = tel[:i].strip()
                if not nombre:
                    n = (p['name'] or '').strip()
                    hay_numero = False
                    for ch in n:
                        if ch.isdigit():
                            hay_numero = True
                    if n and not hay_numero:
                        nombre = n
                val = ${campo === "nombre" ? "nombre" : "tel"}
    rec['${campo === "nombre" ? "x_contacto_obra" : "x_tel_obra"}'] = val
`.trim();

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}\n`);

// ── 1) Respaldo. Convertir un campo a computado dispara el recálculo de TODOS los
//       registros: lo que ya estaba cargado a mano se restaura después. ─────────
const antes = await searchRead(MODEL, [], ["id", "x_name", "x_contacto_obra", "x_tel_obra"], {
  limit: 3000,
});
const conDato = antes.filter((o) => o.x_contacto_obra || o.x_tel_obra);
const ruta = `/tmp/backup-contacto-obra-${Date.now()}.json`;
writeFileSync(ruta, JSON.stringify(conDato, null, 2));
console.log(`· respaldo de ${conDato.length} OT(s) con contacto cargado → ${ruta}`);

// ── 2) Los campos pasan a computados-editables ─────────────────────────────
for (const [campo, nombreCampo] of [["nombre", "x_contacto_obra"], ["tel", "x_tel_obra"]]) {
  const [f] = await searchRead(
    "ir.model.fields",
    [["model", "=", MODEL], ["name", "=", nombreCampo]],
    ["id", "compute"],
  );
  if (!f) throw new Error(`No existe ${MODEL}.${nombreCampo}`);
  await write("ir.model.fields", [f.id], {
    compute: compute(campo),
    depends: "x_order_id,x_estado",
    store: true,
    // readonly=False es lo que lo hace EDITABLE: se precarga, y se escribe encima.
    readonly: false,
  });
  console.log(`✓ ${nombreCampo}: computado-editable (depende de x_order_id, x_estado)`);
}

// ── 3) Restaurar lo que había ──────────────────────────────────────────────
let restaurados = 0;
for (const o of conDato) {
  await executeKw(MODEL, "write", [[o.id], {
    x_contacto_obra: o.x_contacto_obra || false,
    x_tel_obra: o.x_tel_obra || false,
  }]);
  restaurados++;
}
console.log(`✓ ${restaurados} OT(s) restaurada(s) con su contacto original`);

// ── 4) El cartel en el formulario ──────────────────────────────────────────
const AVISO =
  `<div colspan="2" class="alert alert-danger" role="alert" invisible="not x_contacto_obra and not x_tel_obra">\n` +
  `        <b>Verificá el contacto en obra.</b> Estos datos se trajeron de la ficha del cliente. ` +
  `Si quien recibe a la cuadrilla es otra persona, corregilo acá: es el numero al que llama la cuadrilla cuando llega.\n` +
  `      </div>`;

const [vista] = await searchRead(
  "ir.ui.view", [["name", "=", "x_aba_orden_trabajo.form.comercial"]], ["id", "arch_db"],
);
if (vista.arch_db.includes("Verificá el contacto en obra")) {
  console.log("· el aviso ya estaba en la vista");
} else {
  const ancla = `<field name="x_tel_obra" required="1" widget="phone" placeholder="11 5555-5555"/>`;
  if (!vista.arch_db.includes(ancla)) {
    throw new Error("No se encontró el campo x_tel_obra en la vista: revisar el arch");
  }
  await write("ir.ui.view", [vista.id], {
    arch_db: vista.arch_db.replace(ancla, `${ancla}\n      ${AVISO}`),
  });
  console.log("✓ aviso agregado al formulario de Comercial");
}

// ── 5) Verificación ────────────────────────────────────────────────────────
console.log("\n── verificación sobre OTs vivas ──");
const vivas = await searchRead(
  MODEL, [["x_estado", "in", ["pendiente", "en_proceso"]]],
  ["x_name", "x_contacto_obra", "x_tel_obra"], { limit: 60 },
);
const conNombre = vivas.filter((o) => o.x_contacto_obra).length;
const conTel = vivas.filter((o) => o.x_tel_obra).length;
console.log(`  ${vivas.length} OTs vivas · con contacto: ${conNombre} · con teléfono: ${conTel}`);
for (const o of vivas.filter((o) => o.x_contacto_obra).slice(0, 6)) {
  console.log(`    ${String(o.x_name).slice(0, 42).padEnd(44)} "${o.x_contacto_obra}"  ${o.x_tel_obra || ""}`);
}

const completadas = await searchRead(
  MODEL, [["x_estado", "not in", ["pendiente", "en_proceso"]], ["x_contacto_obra", "!=", false]],
  ["id"], { limit: 20 },
);
console.log(`\n  OTs NO vivas con contacto escrito: ${completadas.length} (deberían ser sólo las restauradas)`);

console.log("\n✅ Listo.");
