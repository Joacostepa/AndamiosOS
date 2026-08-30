// La OT dice QUÉ HAY QUE ARMAR — agrega x_detalle_tecnico en la OT y x_alcance_tecnico
// en la orden de alquiler.
//
// EL PROBLEMA: el formulario de Comercial no tiene ningún campo de detalle técnico. El
// único texto libre de la OT es x_observaciones, y su placeholder dice literalmente
// "El detalle tecnico esta en la propuesta". La propuesta existe —es el HTML de
// sale.order.x_studio_propuesta— pero no se lee desde ningún lado de la app. Resultado:
// la cuadrilla llega a la obra sabiendo la dirección y nada más.
//
// SON DOS PREGUNTAS DISTINTAS y quedan en dos campos distintos:
//   x_detalle_tecnico → qué estructura hay que montar o bajar
//   x_observaciones   → restricciones de acceso, horarios, permisos
// Por eso también se corrige el placeholder de observaciones, que hoy manda a buscar el
// detalle a otro lado.
//
// DE DÓNDE SALE EL TEXTO, en orden de precedencia:
//
//   1. venta.x_alcance_tecnico  — lo que Comercial escribió a mano en la orden. Manda.
//   2. el párrafo técnico de la propuesta (x_studio_propuesta). Medido sobre las 400
//      últimas ventas tipo "Obra ": 334 tienen una descripción útil, de 277 caracteres de
//      mediana, y es exactamente lo que necesita la cuadrilla — "pantalla de protección
//      peatonal con bandeja a 45°, de 9 m lineales, con esferas de seguridad".
//   3. las líneas de la orden, filtradas. Cubre el 100% restante, pero flaco: da el
//      producto y la cantidad ("10 x PANTALLA / BANDEJA DE PROTECCIÓN POR M/L").
//
// POR QUÉ COMPUTADO-EDITABLE Y NO UN CAMPO VACÍO: si Comercial tiene que tipear la
// estructura en cada alta, en dos semanas está todo en blanco. Mismo patrón que
// odoo-contacto-obra-desde-cliente.mjs: store=True + readonly=False, se precarga al elegir
// la venta y se escribe encima. Un botón no sirve: guarda el registro antes de ejecutarse
// y en el diálogo "Nueva OT" todavía no existe.
//
// POR QUÉ EL PARSEO DEL HTML VIVE EN EL COMPUTE DE LA OT Y NO EN sale.order: un compute
// roto en sale.order rompe el módulo de ventas entero. En un modelo custom el radio de
// daño es la OT. Por eso x_alcance_tecnico es un campo de texto común, sin compute: es
// sólo el override manual, y el que trabaja es el de la OT.
//
// EL DESARME LO COMPLETA odoo-estructura-armada.mjs, que reescribe este mismo compute
// agregando el as-built por delante de todo, para que las OTs de desarme nazcan
// describiendo lo que Operaciones dejó armado y no lo que se vendió.
//
// GOTCHA (aprendido a los golpes): convertir un campo YA CREADO en computado NO recalcula
// los registros existentes — quedan todos vacíos y sin ningún error. El compute sólo corre
// de ahí en más, cuando cambia algo de lo que depende. Por eso acá se hacen dos cosas:
//   · el campo se crea CON el compute puesto desde el arranque, en el mismo create
//   · y las OTs viejas se llenan con un backfill desde Node, con el gemelo en JS de la
//     misma lógica. Que los dos coincidan es, además, la verificación de que el compute
//     hace lo que se espera.
//
// Idempotente. Por defecto NO escribe: mostrá qué haría. Para aplicar, pasar --aplicar.
// Correr: node --env-file=.env.local scripts/odoo-detalle-tecnico-ot.mjs [--aplicar]
import { version, authenticate, searchRead, read, create, write, fieldsGet, executeKw } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");
// El backfill sólo toca las OTs vacías: lo que alguien escribió a mano no se pisa nunca.
// --rehacer levanta esa protección y recalcula TODAS. Sirve para arrastrar una corrección
// de la lógica, y sólo se justifica antes de que alguien haya editado el campo a mano.
const REHACER = process.argv.includes("--rehacer");
const OT = "x_aba_orden_trabajo";
const VENTA = "sale.order";

// ── El compute, en el sandbox de Odoo (safe_eval: sin regex, sin def, sin imports) ──
//
// El HTML se limpia partiendo por '<' y descartando hasta el '>' de cada fragmento: son
// splits de C, no un recorrido carácter por carácter, así que corre rápido sobre las
// ~10 KB de una propuesta y sobre las 1003 OTs del recálculo inicial.
//
// EL str() DE x_studio_propuesta NO ES DECORATIVO. Un campo html de Odoo devuelve un
// markupsafe.Markup, y Markup.replace() ESCAPA SUS ARGUMENTOS: pedirle que reemplace
// '&nbsp;' hace que busque '&amp;nbsp;', no lo encuentra, y devuelve el texto intacto sin
// error alguno. El síntoma es "&nbsp;Provisión en alquiler..." llegando a la obra. Como
// Markup contagia por concatenación, hay que volver a str ANTES de tocar nada.
//
// Las líneas de la orden se filtran así, medido sobre 400 ventas confirmadas:
//   · line_section              → "Anticipos": no es material
//   · line_note                 → SE CONSERVA: es donde alguien escribió el detalle bueno
//                                 ("equipos sistema multidireccional de 2 torres moviles
//                                 de 2.50m x 1.25m x 2.40m")
//   · sin producto              → líneas de anticipo de factura
//   · RENOVACI / SERVICIO / COSTO FINANCIERO / ADICIONAL VARIOS / MANO DE OBRA /
//     VENTA DE MATERIAL         → se venden, pero no se arman
//   · fragmentos "del ... al ..." → el período que el módulo de alquiler pega al nombre
//   · "OBRA; <dirección>"        → la dirección ya está en la ficha
//
// OJO con filtrar por product.type: en los contratos tipo "Obra " TODAS las líneas son
// 'service' (se vende "alquiler y montaje", no material), así que ese filtro dejaría el
// texto vacío justo en las OTs que importan.
const COMPUTE_DETALLE = `
for rec in self:
    val = ''
    o = rec['x_order_id']
    if o:
        val = (o['x_alcance_tecnico'] or '').strip()
        if not val:
            t = ''
            primero = True
            for frag in str(o['x_studio_propuesta'] or '').split('<'):
                if primero:
                    t = t + frag
                    primero = False
                else:
                    j = frag.find('>')
                    if j >= 0:
                        t = t + ' ' + frag[j + 1:]
            t = t.replace('&amp;', '&').replace('&nbsp;', ' ').replace('&quot;', '"').replace('&#39;', "'")
            t = ' '.join(t.split())
            lo = t.lower()
            i = -1
            for a in ['descripción del servicio', 'descripcion del servicio', 'provisión en alquiler', 'provision en alquiler']:
                j = lo.find(a)
                if j >= 0:
                    if a[:4] == 'desc':
                        j = j + len(a)
                    if i < 0 or j < i:
                        i = j
            if i >= 0:
                cuerpo = t[i:].lstrip(': )0123456789.-').strip()
                cl = cuerpo.lower()
                fin = len(cuerpo)
                for f in ['costo del servicio', 'costo de renovación', 'costo de renovacion', 'costo total', 'opcionales', 'validez de la oferta', 'forma de pago', 'aclaraciones', 'no incluye']:
                    j = cl.find(f)
                    if j > 20 and j < fin:
                        fin = j
                cuerpo = cuerpo[:fin].strip()
                if len(cuerpo) > 40:
                    val = cuerpo[:700]
        if not val:
            partes = []
            for l in o['order_line']:
                dt = l['display_type'] or ''
                if dt != 'line_section':
                    p = l['product_id']
                    sirve = True
                    if dt != 'line_note':
                        if not p:
                            sirve = False
                        else:
                            up = (p['name'] or '').upper()
                            for e in ['RENOVACI', 'SERVICIO', 'COSTO FINANCIERO', 'ADICIONAL VARIOS', 'MANO DE OBRA', 'VENTA DE MATERIAL']:
                                if up.find(e) >= 0:
                                    sirve = False
                    if sirve:
                        frags = []
                        for f in (l['name'] or '').split('\\n'):
                            f = f.strip()
                            if f and f[:4].lower() != 'del ' and f[:5].upper() != 'OBRA;':
                                frags.append(f)
                        if frags:
                            linea = ' — '.join(frags)
                            q = l['product_uom_qty'] or 0
                            if dt != 'line_note' and q and q != 1:
                                n = int(q)
                                if n == q:
                                    linea = str(n) + ' x ' + linea
                                else:
                                    linea = str(q) + ' x ' + linea
                            partes.append(linea)
            val = '\\n'.join(partes)
    rec['x_detalle_tecnico'] = val
`.trim();

// ── El gemelo en JS del compute ─────────────────────────────────────────────
//
// Misma lógica, mismo orden de precedencia. Se usa para la corrida en seco y para el
// backfill de las OTs viejas. Si un día los dos se separan, el que manda es el de Odoo:
// es el que corre en el alta.
const ANCLAS = ["descripción del servicio", "descripcion del servicio", "provisión en alquiler", "provision en alquiler"];
const FIN = ["costo del servicio", "costo de renovación", "costo de renovacion", "costo total", "opcionales", "validez de la oferta", "forma de pago", "aclaraciones", "no incluye"];
const EXCLUIDOS = ["RENOVACI", "SERVICIO", "COSTO FINANCIERO", "ADICIONAL VARIOS", "MANO DE OBRA", "VENTA DE MATERIAL"];

function desdePropuesta(html) {
  let t = "", primero = true;
  for (const frag of String(html || "").split("<")) {
    if (primero) { t += frag; primero = false; }
    else { const j = frag.indexOf(">"); if (j >= 0) t += " " + frag.slice(j + 1); }
  }
  // El &amp; primero: en el HTML guardado hay entidades doble-escapadas ("&amp;nbsp;") y
  // desescapar en el otro orden deja "&nbsp;" literal en el texto que lee la cuadrilla.
  t = t.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  t = t.split(/\s+/).join(" ").trim();
  const lo = t.toLowerCase();
  let i = -1;
  for (const a of ANCLAS) {
    let j = lo.indexOf(a);
    if (j >= 0) { if (a.slice(0, 4) === "desc") j += a.length; if (i < 0 || j < i) i = j; }
  }
  if (i < 0) return "";
  let cuerpo = t.slice(i).replace(/^[:)\d.\-\s]+/, "").trim();
  const cl = cuerpo.toLowerCase();
  let fin = cuerpo.length;
  for (const f of FIN) { const j = cl.indexOf(f); if (j > 20 && j < fin) fin = j; }
  cuerpo = cuerpo.slice(0, fin).trim();
  return cuerpo.length > 40 ? cuerpo.slice(0, 700) : "";
}

function desdeLineas(lineas, nombreProducto) {
  const partes = [];
  for (const l of lineas) {
    const dt = l.display_type || "";
    if (dt === "line_section") continue;
    if (dt !== "line_note") {
      const pid = Array.isArray(l.product_id) ? l.product_id[0] : null;
      if (!pid) continue;
      const up = String(nombreProducto.get(pid) || "").toUpperCase();
      if (EXCLUIDOS.some((e) => up.includes(e))) continue;
    }
    const frags = String(l.name || "").split("\n")
      .map((f) => f.trim())
      .filter((f) => f && f.slice(0, 4).toLowerCase() !== "del " && f.slice(0, 5).toUpperCase() !== "OBRA;");
    if (!frags.length) continue;
    let linea = frags.join(" — ");
    const q = l.product_uom_qty || 0;
    if (dt !== "line_note" && q && q !== 1) linea = `${q} x ${linea}`;
    partes.push(linea);
  }
  return partes.join("\n");
}

/** El detalle de una OT según su venta, con la misma precedencia que el compute. */
function detalleDe(venta, lineas, nombreProducto) {
  if (!venta) return "";
  const manual = String(venta.x_alcance_tecnico || "").trim();
  if (manual) return manual;
  const prop = desdePropuesta(venta.x_studio_propuesta);
  if (prop) return prop;
  return desdeLineas(lineas, nombreProducto);
}

const v = await version();
console.log(`Odoo ${v.server_version} · uid=${await authenticate()}\n`);

async function idModelo(model) {
  const [m] = await searchRead("ir.model", [["model", "=", model]], ["id"]);
  if (!m) throw new Error(`No existe el modelo ${model}`);
  return m.id;
}

/**
 * Crea el campo si falta. `extra` lleva el compute, y va en el MISMO create a propósito:
 * un campo que nace computado se calcula para todos los registros; uno convertido después,
 * no (ver el gotcha del encabezado).
 */
async function crearCampo(model, name, descripcion, extra = {}) {
  const existentes = await fieldsGet(model, ["type"]);
  const [f] = await searchRead("ir.model.fields", [["model", "=", model], ["name", "=", name]], ["id"]);
  if (name in existentes && f) {
    console.log(`· ${model}.${name} ya existe`);
    // Re-correr el script arrastra una corrección de la lógica del compute.
    if (Object.keys(extra).length && APLICAR) await write("ir.model.fields", [f.id], extra);
    return f.id;
  }
  if (!APLICAR) {
    console.log(`· ${model}.${name} se crearía (text)${extra.compute ? " + compute" : ""}`);
    return null;
  }
  const id = await create("ir.model.fields", {
    model_id: await idModelo(model), model, state: "manual", name,
    field_description: descripcion, ttype: "text", ...extra,
  });
  console.log(`✓ ${model}.${name} creado (text)${extra.compute ? ", computado-editable" : ""}`);
  return id;
}

// ── Datos de las ventas, una sola vez: los usan la simulación y el backfill ──
async function cargarVentas(dominio) {
  const ventas = await searchRead(VENTA, dominio,
    ["name", "x_alcance_tecnico", "x_studio_propuesta", "order_line"], { limit: 3000 });
  const idsLinea = ventas.flatMap((s) => s.order_line);
  const lineas = idsLinea.length
    ? await read("sale.order.line", idsLinea, ["name", "display_type", "product_uom_qty", "product_id", "order_id"])
    : [];
  const pids = [...new Set(lineas.map((l) => (Array.isArray(l.product_id) ? l.product_id[0] : null)).filter(Boolean))];
  const productos = pids.length ? await read("product.product", pids, ["name"]) : [];
  const nombreProducto = new Map(productos.map((p) => [p.id, p.name]));
  const porVenta = new Map();
  for (const l of lineas) {
    const k = l.order_id[0];
    if (!porVenta.has(k)) porVenta.set(k, []);
    porVenta.get(k).push(l);
  }
  return { ventas, porVenta, nombreProducto };
}

// ── Corrida en seco ─────────────────────────────────────────────────────────
if (!APLICAR) {
  await crearCampo(VENTA, "x_alcance_tecnico", "Alcance técnico (qué hay que armar)");
  await crearCampo(OT, "x_detalle_tecnico", "Qué hay que ejecutar", { compute: COMPUTE_DETALLE });

  const dominio = [["state", "in", ["sale", "done"]], ["x_studio_tipo_de_contrato", "=", "Obra "]];
  const { ventas, porVenta, nombreProducto } = await cargarVentas(dominio);
  let dePropuesta = 0, deLineas = 0, vacias = 0;
  const ejemplos = [];
  for (const s of ventas) {
    const prop = desdePropuesta(s.x_studio_propuesta);
    const txt = detalleDe(s, porVenta.get(s.id) || [], nombreProducto);
    if (prop) dePropuesta++;
    else if (txt) deLineas++;
    else vacias++;
    if (prop && ejemplos.length < 3) ejemplos.push(`[${s.name}] ${txt.slice(0, 240)}`);
    if (!prop && txt && ejemplos.length < 5) ejemplos.push(`[${s.name}] (de líneas) ${txt.replace(/\n/g, " | ").slice(0, 240)}`);
  }
  console.log(`\n── simulación sobre ${ventas.length} ventas confirmadas tipo "Obra " ──`);
  console.log(`  detalle sacado de la propuesta: ${dePropuesta}`);
  console.log(`  detalle armado desde las líneas: ${deLineas}`);
  console.log(`  sin nada que decir: ${vacias}`);
  for (const e of ejemplos) console.log(`\n  ${e}`);
  console.log("\nCorrida en seco. Para aplicar:");
  console.log("  node --env-file=.env.local scripts/odoo-detalle-tecnico-ot.mjs --aplicar");
  process.exit(0);
}

// ── 1) Los campos ───────────────────────────────────────────────────────────
await crearCampo(VENTA, "x_alcance_tecnico", "Alcance técnico (qué hay que armar)");
// readonly=False es lo que lo hace EDITABLE: se precarga y se escribe encima.
const idDetalle = await crearCampo(OT, "x_detalle_tecnico", "Qué hay que ejecutar", {
  compute: COMPUTE_DETALLE, depends: "x_order_id,x_tipo", store: true, readonly: false,
});

// ── 2) Verificar leyendo, y revertir si revienta ────────────────────────────
//
// Un compute que falla no da error al guardarlo: da error al LEER, y a esa altura ya está
// roto para todo el mundo. Por eso se lee acá mismo y se deja el campo como texto común si
// algo sale mal, en vez de dejar la instancia inutilizable.
// Con reintentos: crear el campo dispara el recálculo de las 1003 OTs, cada una parseando
// el HTML de su propuesta, y mientras eso corre la instancia contesta 429. Un 429 NO es un
// compute roto — revertir por eso sería tirar trabajo bueno.
async function leerConReintentos(intentos = 6) {
  for (let i = 1; ; i++) {
    try {
      return await searchRead(OT, [], ["x_name", "x_tipo", "x_detalle_tecnico"], { limit: 10 });
    } catch (e) {
      const ocupado = /429|503|Too Many Requests|Service Unavailable/i.test(e.message);
      if (!ocupado || i >= intentos) throw e;
      const espera = 5000 * i;
      console.log(`  · Odoo ocupado recalculando (${e.message}); reintento ${i}/${intentos} en ${espera / 1000}s`);
      await new Promise((r) => setTimeout(r, espera));
    }
  }
}

try {
  await leerConReintentos();
  console.log("✓ el campo se lee sin errores");
} catch (e) {
  console.error(`\n✗ el compute de x_detalle_tecnico falla: ${e.message}`);
  await write("ir.model.fields", [idDetalle], { compute: false, depends: false, store: true, readonly: false });
  console.error("↩ revertido a campo de texto común. La instancia queda sana.");
  process.exit(1);
}

// ── 3) Backfill de las OTs que quedaron vacías ──────────────────────────────
//
// El compute cubre de acá en adelante. Las que ya existían se llenan desde Node con el
// gemelo en JS: es una escritura manual sobre un campo computado-editable, que es
// exactamente para lo que sirve que sea editable.
const pendientes = await searchRead(OT, REHACER ? [] : [["x_detalle_tecnico", "in", [false, ""]]],
  ["x_order_id", "x_detalle_tecnico"], { limit: 3000 });
console.log(`\n── backfill ${REHACER ? "(--rehacer: TODAS)" : "(sólo las vacías)"} ── OTs a revisar: ${pendientes.length}`);

if (pendientes.length) {
  const idsVenta = [...new Set(pendientes.map((t) => (Array.isArray(t.x_order_id) ? t.x_order_id[0] : null)).filter(Boolean))];
  const { ventas, porVenta, nombreProducto } = await cargarVentas([["id", "in", idsVenta]]);
  const porId = new Map(ventas.map((s) => [s.id, s]));

  // Se agrupan las OTs por texto: 1003 writes de a uno son 1003 round-trips.
  const porTexto = new Map();
  let sinVenta = 0, sinTexto = 0, yaIguales = 0;
  for (const t of pendientes) {
    const vid = Array.isArray(t.x_order_id) ? t.x_order_id[0] : null;
    const venta = vid ? porId.get(vid) : null;
    if (!venta) { sinVenta++; continue; }
    const txt = detalleDe(venta, porVenta.get(vid) || [], nombreProducto);
    if (!txt) { sinTexto++; continue; }
    if (txt === (t.x_detalle_tecnico || "")) { yaIguales++; continue; }
    if (!porTexto.has(txt)) porTexto.set(txt, []);
    porTexto.get(txt).push(t.id);
  }
  let escritas = 0;
  for (const [txt, ids] of porTexto) {
    await executeKw(OT, "write", [ids, { x_detalle_tecnico: txt }]);
    escritas += ids.length;
  }
  console.log(`  escritas: ${escritas} · ya estaban bien: ${yaIguales} · sin venta vinculada: ${sinVenta} · sin texto derivable: ${sinTexto}`);
}

// ── 3) El formulario de Comercial ───────────────────────────────────────────
//
// Patch por reemplazo de ancla sobre el arch de la vista primaria, igual que
// odoo-duracion-estimada-todos-los-tipos.mjs y odoo-contacto-obra-desde-cliente.mjs. Si
// alguien editó la vista en Studio el ancla puede haber desaparecido: se aborta con
// mensaje claro en vez de escribir cualquier cosa.
const [vistaOt] = await searchRead("ir.ui.view", [["name", "=", `${OT}.form.comercial`]], ["id", "arch_db"]);
if (!vistaOt) throw new Error(`No existe la vista ${OT}.form.comercial`);

let arch = vistaOt.arch_db;
let tocada = false;

const ANCLA = `<separator string="Observaciones para Operaciones"/>`;
const BLOQUE = `<separator string="Qué hay que ejecutar"/>
  <div class="text-muted">
    <p>La estructura concreta que la cuadrilla tiene que montar o bajar: sistema, medidas, altura, sectores. Se precarga con lo que dice la propuesta; corregilo si el alcance real es otro. Es lo primero que ve Operaciones al abrir la tarjeta en el tablero.</p>
  </div>
  <field name="x_detalle_tecnico" nolabel="1" required="x_tipo in ('armado','desarme','ampliacion','desmonte_parcial')" placeholder="Andamio de fachada, 12 m de frente x 9 m de altura, con bandeja de proteccion en PB y mediasombra."/>
  ${ANCLA}`;

if (arch.includes(`name="x_detalle_tecnico"`)) {
  console.log("\n· el detalle técnico ya estaba en el formulario de Comercial");
} else if (!arch.includes(ANCLA)) {
  throw new Error(`No se encontró el ancla en ${OT}.form.comercial: revisar el arch a mano`);
} else {
  arch = arch.replace(ANCLA, BLOQUE);
  tocada = true;
  console.log("\n✓ bloque 'Qué hay que ejecutar' agregado al formulario de Comercial");
}

// El placeholder viejo mandaba el detalle técnico a la propuesta. Ya no hace falta.
const PH_VIEJO = "Restricciones de horario, accesos, permisos, lo que Operaciones necesite saber. El detalle tecnico esta en la propuesta.";
const PH_NUEVO = "Restricciones de horario, accesos, contactos, permisos: lo que Operaciones necesite saber para llegar y trabajar.";
if (arch.includes(PH_VIEJO)) {
  arch = arch.replace(PH_VIEJO, PH_NUEVO);
  tocada = true;
  console.log("✓ placeholder de observaciones corregido");
}

if (tocada) await write("ir.ui.view", [vistaOt.id], { arch_db: arch });

// ── 4) El override, en la orden de alquiler ─────────────────────────────────
//
// Va sobre sale.order.form (la vista raíz) y no sobre rental.order.form: la de alquiler es
// una vista primaria que hereda de ésta, así que aparece en las dos. Verificado que 298 de
// las últimas 300 ventas confirmadas son órdenes de alquiler.
const [raiz] = await searchRead("ir.ui.view",
  [["model", "=", VENTA], ["name", "=", "sale.order.form"], ["mode", "=", "primary"]], ["id"]);
if (!raiz) throw new Error("No se encontró la vista raíz sale.order.form");

const NOMBRE_VISTA = "sale.order.form.aba.alcance.tecnico";
const [yaEsta] = await searchRead("ir.ui.view", [["name", "=", NOMBRE_VISTA]], ["id"]);
if (yaEsta) {
  console.log(`· la vista ${NOMBRE_VISTA} ya existe`);
} else {
  await create("ir.ui.view", {
    name: NOMBRE_VISTA, model: VENTA, inherit_id: raiz.id, mode: "extension", priority: 30,
    arch_db: `<data>
  <xpath expr="//notebook" position="inside">
    <page string="Alcance técnico" name="aba_alcance">
      <div class="text-muted">
        <p>Sólo hace falta si el alcance real NO es el que dice la propuesta. Cada Orden de Trabajo se precarga con el párrafo técnico de la propuesta; lo que se escriba acá lo pisa, para el armado y para el desarme.</p>
      </div>
      <field name="x_alcance_tecnico" nolabel="1" placeholder="Andamio de fachada, 12 m de frente x 9 m de altura, con bandeja de proteccion en PB y mediasombra."/>
    </page>
  </xpath>
</data>`,
  });
  console.log(`✓ vista ${NOMBRE_VISTA} creada (pestaña "Alcance técnico" en la orden de alquiler)`);
}

// ── 5) Verificación final ───────────────────────────────────────────────────
console.log("\n── verificación ──");
const vivas = await searchRead(OT, [["x_estado", "in", ["pendiente", "en_proceso"]]], ["x_detalle_tecnico"], { limit: 300 });
const conDetalle = vivas.filter((t) => t.x_detalle_tecnico).length;
console.log(`  OTs vivas: ${vivas.length} · con detalle técnico: ${conDetalle}`);

const todas = await searchRead(OT, [], ["x_detalle_tecnico"], { limit: 2000 });
console.log(`  OTs totales: ${todas.length} · con detalle técnico: ${todas.filter((t) => t.x_detalle_tecnico).length}`);

console.log("\n✅ Detalle técnico listo en Odoo. Siguiente: mostrarlo en el panel del tablero.");
