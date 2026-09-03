// En la vista de partes, una de cada siete OTs mostraba el nombre del cliente donde
// tendría que estar la dirección de la obra.
//
// EL SÍNTOMA: en la columna que identifica la obra convivían "San Martín 1225" y
// "Granz SRL". Saber que la cuadrilla va a lo de Granz SRL no dice a dónde ir.
//
// NO ES DE LA APP. La app parte el nombre de la OT por " — " y muestra la cola
// (src/lib/tablero/titulo.ts). Si no hay " — ", muestra el título entero. Nunca elige
// entre cliente y dirección: no tiene con qué.
//
// LA CAUSA está en cómo Odoo arma `x_name`, que es computado y almacenado. Lo construye
// SÓLO con nombres de contactos:
//
//   · La venta apunta a un contacto de obra (hijo `delivery`, llamado con la dirección)
//     → cliente — dirección. 916 OTs. Es el caso bueno.
//   · La venta apunta derecho al cliente, sin contacto de obra debajo
//     → el nombre del cliente y nada más. 149 OTs. Es el caso roto.
//
// Y el dato NO FALTA: 144 de esas 149 tienen la calle cargada en `street` del partner. El
// compute nunca la miraba. Por eso el arreglo va acá y no en la app: el título es uno solo
// y lo leen cuatro pantallas (tablero, partes, habilitaciones, órdenes de trabajo). Si la
// app lo resolviera por su cuenta habría dos reglas para el mismo texto y algún día
// discreparían.
//
// SON TRES COSAS:
//   1. sin contacto de obra, el compute cae a `street` en vez de repetir al cliente;
//   2. el recorte a 72 caracteres se lo come el CLIENTE, no la dirección — antes cortaba
//      al final y en los consorcios largos habría partido la calle al medio, que es
//      justo lo único que Operaciones necesita leer;
//   3. el `depends` pasa a mirar nombres y calles, no sólo a qué contacto apunta la
//      venta. Como estaba, renombrar un partner o corregirle la calle no recalculaba
//      nada y el nombre viejo quedaba pegado para siempre (el mismo bug que tenía
//      x_tecnico, ver odoo-iniciales-tecnico.mjs).
//
// QUÉ NO CAMBIA: el formato "Tipo · Número · Cliente — Obra" es el mismo, así que la app
// no necesita ninguna modificación. Auditado antes de tocar: ningún campo `related` de
// ningún modelo espeja x_name, y ninguna vista referencia el modelo. No hay nada que
// recalcular aparte.
//
// Correr:
//   node --env-file=.env.local scripts/odoo-direccion-en-nombre-ot.mjs            (simulacro)
//   node --env-file=.env.local scripts/odoo-direccion-en-nombre-ot.mjs --aplicar  (escribe)

import { authenticate, create, executeKw, searchRead } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");
const MODELO = "x_aba_orden_trabajo";
const CAMPO = "x_name";
const LARGO = 72;

const CODIGO_COMPUTE = `for rec in self:
    labels = {'armado':'Armado','desarme':'Desarme','ampliacion':'Ampliacion','desmonte_parcial':'Desmonte parcial','otro':'Otro'}
    t = labels.get(rec['x_tipo'], 'OT')
    o = rec['x_order_id']
    if not o:
        rec['x_name'] = t
    else:
        p = o['partner_id']
        if p and p['parent_id']:
            p = p['parent_id']
        cli = ((p['name'] or '') if p else '').split(',')[0].strip()
        s = o['partner_shipping_id']
        if s and s['parent_id']:
            base = (s['parent_id']['name'] or '').split(',')[0].strip()
            if base and not cli:
                cli = base
        crudo = ((s['name'] or '') if s else '').replace('\\n', ' ').strip()
        calle = ' '.join((s['street'] or '').split()) if s else ''
        # ¿El contacto de entrega ES el cliente? Entonces su nombre no dice dónde queda la
        # obra por más que a veces lo parezca.
        obra = '' if (cli and crudo.upper().startswith(cli.upper()[:12])) else crudo
        # UN NOMBRE DE OBRA SIN NINGÚN NÚMERO NO ES UNA DIRECCIÓN: es el administrador
        # ("Alejandra Kulczyk"), un mail o el nombre del edificio. Ahí la calle identifica
        # mejor. Al revés no: hay contactos llamados "24 de noviembre 1536" cuyo street
        # apunta a la oficina de la administración, así que un nombre CON altura se
        # respeta siempre.
        if obra and calle:
            conNum = False
            for ch in obra:
                if ch.isdigit():
                    conNum = True
                    break
            calleConNum = False
            for ch in calle:
                if ch.isdigit():
                    calleConNum = True
                    break
            if not conNum and calleConNum:
                obra = calle
        if not obra:
            # LA VENTA APUNTA AL CLIENTE Y NO A UN CONTACTO DE OBRA. Si el cliente tiene un
            # solo contacto de entrega, ése es la obra: alguien lo cargó y después no lo
            # eligió en el presupuesto. Vale más que el street del cliente, que muy seguido
            # es la oficina de la administración y mandaría la cuadrilla a otro lado.
            # Con dos o más no se adivina: no hay en la venta nada que diga cuál es.
            #
            # SALVO QUE EL CLIENTE SE LLAME COMO SU PROPIA CALLE. "Consorcio de Propietarios
            # Combatientes de Malvinas 3131/33" ES ese edificio: su street es la obra, y el
            # contacto de entrega que tiene cargado es OTRA obra suya. Ahí adivinar sería
            # pisar un dato bueno con uno inventado.
            propio = False
            if cli and calle:
                acentos = [('á','a'),('à','a'),('ä','a'),('â','a'),('é','e'),('è','e'),('ë','e'),('ê','e'),('í','i'),('ì','i'),('ï','i'),('î','i'),('ó','o'),('ò','o'),('ö','o'),('ô','o'),('ú','u'),('ù','u'),('ü','u'),('û','u'),('ñ','n')]
                nomNorm = cli.lower()
                calleNorm = calle.lower()
                for par in acentos:
                    nomNorm = nomNorm.replace(par[0], par[1])
                    calleNorm = calleNorm.replace(par[0], par[1])
                limpio = ''
                for ch in calleNorm:
                    limpio = limpio + (ch if ch.isalpha() else ' ')
                for tok in limpio.split():
                    # 5 letras para no engancharse con "san", "av" o "de".
                    if len(tok) >= 5 and tok in nomNorm:
                        propio = True
                        break
            if (not propio) and s and not s['parent_id'] and p:
                entregas = []
                for c in p['child_ids']:
                    if c['type'] == 'delivery':
                        entregas.append(c)
                if len(entregas) == 1:
                    obra = ' '.join((entregas[0]['name'] or '').split())
                    if not obra:
                        obra = ' '.join((entregas[0]['street'] or '').split())
        if not obra:
            obra = calle
        if not obra and p:
            obra = ' '.join((p['street'] or '').split())
        obra = obra[:${LARGO}]
        if cli and obra:
            # Si hay que recortar se recorta el CLIENTE. La dirección es lo que identifica
            # la obra en pantalla: llega entera o no sirve de nada.
            sobra = len(cli) + 3 + len(obra) - ${LARGO}
            if sobra > 0:
                cli = cli[:max(12, len(cli) - sobra)].strip()
            ref = cli + ' — ' + obra
        else:
            # Sin calle en ningún lado se vuelve al nombre entero, como estaba antes: es
            # poco, pero es lo único que hay.
            ref = (obra or crudo or cli)[:${LARGO}]
        rec['x_name'] = t + ' · ' + o['name'] + (' · ' + ref if ref else '')
`;

// Mirar el NOMBRE y la CALLE, no sólo a qué contacto apunta la venta. Sin esto, corregirle
// la dirección a un partner no se propaga y el nombre viejo queda pegado.
const DEPENDS = [
  "x_tipo",
  "x_order_id",
  "x_order_id.name",
  "x_order_id.partner_id",
  "x_order_id.partner_id.name",
  "x_order_id.partner_id.street",
  "x_order_id.partner_id.parent_id",
  "x_order_id.partner_id.parent_id.name",
  // El contacto de obra que la venta no eligió: si aparece uno, el nombre tiene que
  // dejar de mostrar la calle del cliente y pasar a mostrar la obra.
  "x_order_id.partner_id.child_ids",
  "x_order_id.partner_id.child_ids.name",
  "x_order_id.partner_id.child_ids.type",
  "x_order_id.partner_id.child_ids.street",
  "x_order_id.partner_shipping_id",
  "x_order_id.partner_shipping_id.name",
  "x_order_id.partner_shipping_id.street",
  "x_order_id.partner_shipping_id.parent_id",
  "x_order_id.partner_shipping_id.parent_id.name",
].join(",");

// ── El mismo compute en JS, para poder simular sin escribir nada ────────────
const ETIQUETAS = {
  armado: "Armado", desarme: "Desarme", ampliacion: "Ampliacion",
  desmonte_parcial: "Desmonte parcial", otro: "Otro",
};

const sinTilde = (x) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** ¿El cliente se llama como su propia calle? Entonces el cliente ES el edificio. */
function seLlamaComoLaCalle(cli, calle) {
  if (!cli || !calle) return false;
  const nom = sinTilde(cli);
  return sinTilde(calle)
    .replace(/[^a-z]+/g, " ")
    .split(" ")
    .some((tok) => tok.length >= 5 && nom.includes(tok));
}

function nombreNuevo(ot, orden, porId, entregasDe) {
  const t = ETIQUETAS[ot.x_tipo] ?? "OT";
  if (!orden) return t;

  let p = porId.get(orden.partner_id?.[0]) ?? null;
  if (p && p.parent_id) p = porId.get(p.parent_id[0]) ?? p;
  let cli = ((p?.name || "").split(",")[0] ?? "").trim();

  const s = porId.get(orden.partner_shipping_id?.[0]) ?? null;
  if (s && s.parent_id) {
    const base = ((porId.get(s.parent_id[0])?.name || "").split(",")[0] ?? "").trim();
    if (base && !cli) cli = base;
  }
  const crudo = (s?.name || "").replace(/\n/g, " ").trim();
  const calle = s ? (s.street || "").split(/\s+/).filter(Boolean).join(" ") : "";

  let obra = cli && crudo.toUpperCase().startsWith(cli.toUpperCase().slice(0, 12)) ? "" : crudo;
  const tieneNum = (x) => /\d/.test(x);
  if (obra && calle && !tieneNum(obra) && tieneNum(calle)) obra = calle;
  if (!obra && s && !s.parent_id && p && !seLlamaComoLaCalle(cli, calle)) {
    const entregas = entregasDe.get(p.id) ?? [];
    if (entregas.length === 1) {
      obra =
        (entregas[0].name || "").split(/\s+/).filter(Boolean).join(" ") ||
        (entregas[0].street || "").split(/\s+/).filter(Boolean).join(" ");
    }
  }
  if (!obra) obra = calle;
  if (!obra && p) obra = (p.street || "").split(/\s+/).filter(Boolean).join(" ");
  obra = obra.slice(0, LARGO);

  let ref;
  if (cli && obra) {
    const sobra = cli.length + 3 + obra.length - LARGO;
    if (sobra > 0) cli = cli.slice(0, Math.max(12, cli.length - sobra)).trim();
    ref = `${cli} — ${obra}`;
  } else {
    ref = (obra || crudo || cli).slice(0, LARGO);
  }
  return `${t} · ${orden.name}${ref ? ` · ${ref}` : ""}`;
}

/** Lo que la app va a mostrar en la segunda columna: la cola después de " — ". */
function principal(titulo) {
  const campos = String(titulo || "").split(" · ");
  if (campos.length < 3) return String(titulo || "").trim();
  const cola = campos.slice(2).join(" · ");
  const corte = cola.indexOf(" — ");
  return corte === -1 ? cola : cola.slice(corte + 3).trim();
}

async function enLotes(modelo, ids, campos) {
  const salida = new Map();
  for (let i = 0; i < ids.length; i += 300) {
    const lote = await searchRead(modelo, [["id", "in", ids.slice(i, i + 300)]], campos);
    for (const r of lote) salida.set(r.id, r);
  }
  return salida;
}

// ── Simulacro ───────────────────────────────────────────────────────────────

await authenticate();

const [campo] = await searchRead(
  "ir.model.fields",
  [["model", "=", MODELO], ["name", "=", CAMPO]],
  ["id", "ttype", "store", "compute", "depends"],
);
if (!campo) throw new Error(`No existe ${MODELO}.${CAMPO}`);
console.log(`${MODELO}.${CAMPO} · ${campo.ttype} · store=${campo.store}`);
console.log(`depends actual: ${JSON.stringify(campo.depends)}`);

const ots = await searchRead(MODELO, [], ["id", "x_name", "x_tipo", "x_order_id"], { limit: 5000 });
const ordenes = await enLotes(
  "sale.order",
  [...new Set(ots.map((o) => o.x_order_id && o.x_order_id[0]).filter(Boolean))],
  ["name", "partner_id", "partner_shipping_id"],
);
const idsPartner = new Set();
for (const o of ordenes.values()) {
  if (o.partner_id) idsPartner.add(o.partner_id[0]);
  if (o.partner_shipping_id) idsPartner.add(o.partner_shipping_id[0]);
}
let partners = await enLotes("res.partner", [...idsPartner], ["name", "parent_id", "street"]);
// Los padres hacen falta para el nombre del cliente y como respaldo de calle.
const idsPadre = [...partners.values()].map((p) => p.parent_id && p.parent_id[0]).filter(Boolean);
const padres = await enLotes("res.partner", [...new Set(idsPadre)], ["name", "parent_id", "street"]);
for (const [id, p] of padres) if (!partners.has(id)) partners.set(id, p);

// Los contactos de entrega de cada cliente, para el caso en que la venta no eligió ninguno.
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

const cambios = [];
for (const ot of ots) {
  const nuevo = nombreNuevo(ot, ot.x_order_id ? ordenes.get(ot.x_order_id[0]) : null, partners, entregasDe);
  if (nuevo !== String(ot.x_name || "")) cambios.push({ id: ot.id, antes: String(ot.x_name || ""), nuevo });
}

// Lo que importa no es cuántos nombres cambian sino en cuántas pantallas cambia LO QUE SE
// LEE: la cola es lo único que la app muestra en la columna de la obra.
const ganan = cambios.filter((c) => principal(c.antes) !== principal(c.nuevo));

console.log(`\nOTs: ${ots.length}`);
console.log(`  cambian de nombre:                       ${cambios.length}`);
console.log(`  cambia lo que se ve en la columna obra:  ${ganan.length}`);

// Son dos causas distintas y conviene verlas separadas: una es la venta sin contacto de
// obra, la otra es el recorte que se comía la dirección por la cola.
const recortadas = ganan.filter((c) => c.antes.split(" · ").slice(2).join(" · ").length >= LARGO);
const sinContacto = ganan.filter((c) => !recortadas.includes(c));

function muestra(titulo, lista, n) {
  console.log(`\n--- ${titulo} (${lista.length}) ---`);
  for (const c of lista.slice(0, n)) {
    console.log(`  #${c.id}`);
    console.log(`     antes: ${JSON.stringify(principal(c.antes))}`);
    console.log(`     ahora: ${JSON.stringify(principal(c.nuevo))}`);
  }
}
muestra("la venta fue al cliente, sin contacto de obra → ahora cae a street", sinContacto, 12);
muestra("el recorte a 72 se comía la dirección → ahora recorta al cliente", recortadas, 12);

// LAS ADIVINADAS. Acá la venta no eligió contacto de entrega y la dirección sale del único
// que tiene el cliente. Es la mejor apuesta disponible —un contacto `delivery` existe para
// enviar a una obra, el street del cliente es su oficina— pero sigue siendo una apuesta: si
// ese cliente tiene dos obras y sólo cargó una, las dos OTs van a mostrar la misma. Se
// listan para que se puedan mirar de a una, y se arreglan de raíz eligiendo la dirección de
// entrega en el presupuesto: con el depends nuevo el nombre se actualiza solo.
const adivinadas = [];
for (const ot of ots) {
  const o = ot.x_order_id ? ordenes.get(ot.x_order_id[0]) : null;
  if (!o) continue;
  const s = partners.get(o.partner_shipping_id?.[0]);
  if (!s || s.parent_id) continue;
  const hijos = entregasDe.get(s.id) ?? [];
  const cli = (s.name || "").split(",")[0].trim();
  const calle = (s.street || "").split(/\s+/).filter(Boolean).join(" ");
  if (seLlamaComoLaCalle(cli, calle)) continue; // el cliente es el edificio, no se adivina
  if (hijos.length === 1) adivinadas.push(`  ${o.name}  cliente=${JSON.stringify(s.name)}  street=${JSON.stringify(s.street)}  →  ${JSON.stringify(hijos[0].name)}`);
  else if (hijos.length > 1) adivinadas.push(`  ${o.name}  cliente=${JSON.stringify(s.name)}  tiene ${hijos.length} contactos de obra, NO se adivina → queda el street`);
}
console.log(`\nDirecciones adivinadas del único contacto de obra sin usar: ${adivinadas.length}`);
adivinadas.forEach((a) => console.log(a));

// Red de seguridad: ninguna OT tiene que PERDER la altura que hoy muestra. Si antes se
// leía algo con número y ahora no, el cambio empeoró esa fila y hay que mirarla.
const empeoran = ganan.filter((c) => /\d/.test(principal(c.antes)) && !/\d/.test(principal(c.nuevo)));
console.log(`\nFilas que pierden la altura que hoy muestran: ${empeoran.length}`);
for (const c of empeoran.slice(0, 10)) {
  console.log(`  #${c.id}  ${JSON.stringify(principal(c.antes))} → ${JSON.stringify(principal(c.nuevo))}`);
}

const sinArreglo = ots.filter((ot) => {
  const nuevo = nombreNuevo(ot, ot.x_order_id ? ordenes.get(ot.x_order_id[0]) : null, partners, entregasDe);
  return !nuevo.includes(" — ");
});
console.log(`\nQuedan sin dirección (no hay calle en ningún lado): ${sinArreglo.length}`);
for (const ot of sinArreglo.slice(0, 10)) console.log(`  #${ot.id}  ${ot.x_name}`);

if (!APLICAR) {
  console.log("\nNo se escribió nada. Para aplicar: --aplicar");
  process.exit(0);
}

// ── Aplicar ─────────────────────────────────────────────────────────────────

await executeKw("ir.model.fields", "write", [[campo.id], { compute: CODIGO_COMPUTE, depends: DEPENDS }]);
console.log("\n✓ compute y depends actualizados");

// Cambiar el compute no recalcula lo guardado: Odoo sólo recalcula lo que tiene marcado
// como sucio. Marcarlo es código del lado del servidor, de ahí la acción temporal.
const [modelo] = await searchRead("ir.model", [["model", "=", MODELO]], ["id"]);
const accion = await create("ir.actions.server", {
  name: "AndamiosOS — recálculo temporal de x_name",
  model_id: modelo.id,
  state: "code",
  code: `recs = env['${MODELO}'].search([])
env.add_to_compute(recs._fields['${CAMPO}'], recs)
env.flush_all()`,
});
try {
  await executeKw("ir.actions.server", "run", [[accion]], {
    context: { active_model: MODELO, active_id: 0, active_ids: [] },
  });
  console.log("✓ recálculo disparado");
} finally {
  await executeKw("ir.actions.server", "unlink", [[accion]]);
  console.log("✓ acción temporal borrada");
}

// ── Verificación: lo guardado tiene que coincidir con lo simulado ───────────
const despues = await searchRead(MODELO, [], ["id", "x_name", "x_tipo", "x_order_id"], { limit: 5000 });
let discrepan = 0;
let conDireccion = 0;
for (const ot of despues) {
  const esperado = nombreNuevo(ot, ot.x_order_id ? ordenes.get(ot.x_order_id[0]) : null, partners, entregasDe);
  if (String(ot.x_name || "") !== esperado) {
    if (discrepan < 5) console.log(`  ≠ #${ot.id}\n      Odoo: ${ot.x_name}\n      sim:  ${esperado}`);
    discrepan++;
  }
  if (String(ot.x_name || "").includes(" — ")) conDireccion++;
}
console.log(`\nDESPUÉS — ${despues.length} OTs`);
console.log(`  con dirección propia: ${conDireccion}`);
console.log(`  sin dirección:        ${despues.length - conDireccion}`);
console.log(
  discrepan === 0
    ? "\nListo: el recálculo llegó a todas."
    : `\nOJO: ${discrepan} no coinciden con lo simulado. El recálculo no llegó a todo.`,
);
