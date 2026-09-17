// Cierre de la encomienda del CPAU, sin personas (JS, 16/09): lo que se hacía a mano después de
// "Finalizar" en el RETP. Lo encadena robot/cpau-encomienda.mjs (atenderEncomienda).
//
//   1. REGISTRO SIN FIRMAS: Histórico del RETP → botón "ver" de la fila del R.Nro. Se baja apenas
//      se finaliza: cuando el CPAU procesa la encomienda, "ver" devuelve otra versión (usuario del
//      CPAU y el propietario con el DNI del comitente), que no es la que se firma.
//   2. FIRMAS: JS como comitente y Hougassian ("Firma 01") como matriculado, en las 3 hojas. La
//      columna "Firma CPAU" la completa el Consejo al visar: NUNCA se agrega acá.
//   3. PAGO: tienda de perfil.cpau.org, producto 51 ($50.000), Visa crédito → formulario de Decidir
//      con la tarjeta de robot/.env.robot. Una sola vez por trámite: antes de "Aceptar" queda
//      anotado en la tarea, y un pago intentado sin confirmar frena todo hasta que lo mire una persona.
//   4. CARGA: tramites.cpau.org/Plataforma (matrícula + DNI → "Habilitación de estructuras
//      transitoria" + R.Nro + registro firmado → "Pago Electrónico" + n° de operación + comprobante →
//      Enviar). Una sola vez, con la misma traba que el pago.
//   5. CERTIFICADO: el CPAU visa (30-40 min, en horario de oficina) y le manda a Hougassian el PDF
//      final (<RETP Nro>.pdf: registro firmado y sellado + certificación + comprobante). Él lo
//      reenvía a permisos-andamio@andamiosbuenosaires.com.ar y el robot lo busca por IMAP.
//
// Mapeos: robot/mapear-cpau-cierre.mjs, mapear-cpau-compra.mjs y mapear-cpau-historico.mjs;
// detalle en docs/modulo-gestoria-permisos.md § "Cierre de la encomienda — mapeo 16/09".
import { readFileSync } from "node:fs";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { PDFDocument } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";

const RETP = "https://retp.cpau.org";
const BUCKET = "permisos-via-publica";
const PRODUCTO = "https://perfil.cpau.org/store/productos/51";
const PLATAFORMA = "https://tramites.cpau.org/Plataforma";
const MATRICULA = "12658";
const DNI_MATRICULADO = "11816203"; // Hougassian: "Datos Matrícula" del RETP y el registro
const MONTO_CENTAVOS = "5000000"; // $50.000,00
const COMERCIO_DECIDIR = "00050711";
const MAX_PLATAFORMA = 3_000_000; // la Plataforma rechaza archivos de más de 3 MB

/** Un paso que no se puede reintentar solo (pago o carga intentados sin confirmar). */
export class CierreFrenado extends Error {}

/** El CPAU pega HTML detrás del PDF: se corta en el último %%EOF. */
export function hastaElFinal(bytes) {
  const b = Buffer.from(bytes);
  const fin = b.lastIndexOf("%%EOF");
  return fin > 0 ? b.subarray(0, fin + 5) : b;
}

/** R.Nro sin ceros adelante, como lo imprime el registro ("Número de Registro 329522116"). */
export const registroCorto = (registro) => String(registro).replace(/\D/g, "").replace(/^0+/, "");

async function textoPdf(bytes) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  return { paginas: text.map((t) => t.replace(/\s+/g, " ")), pdf };
}

// ── 1. Registro sin firmas ─────────────────────────────────────────────────

const manana = () => {
  const d = new Date(Date.now() + 86_400_000);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

async function filaDelHistorico(page, registro) {
  const largo = String(registro).replace(/\D/g, "").padStart(11, "0");
  await page.goto(`${RETP}/FrmHisto.aspx`, { waitUntil: "domcontentloaded" });
  // El "hasta" viene en hoy a las 0 h: lo del día no aparece.
  await page.fill("#ContentPlaceHolder1_txtHastaFecha", manana());
  await Promise.all([page.waitForLoadState("domcontentloaded").catch(() => {}), page.press("#ContentPlaceHolder1_txtHastaFecha", "Enter")]);
  await page.waitForTimeout(2500);
  let fila = page.locator("tr").filter({ hasText: largo }).first();
  for (let pagina = 2; !(await fila.count()) && pagina <= 15; pagina++) {
    const link = page.locator("a").filter({ hasText: new RegExp(`^\\s*${pagina}\\s*$`) }).first();
    if (!(await link.count())) break;
    await Promise.all([page.waitForLoadState("domcontentloaded").catch(() => {}), link.click()]);
    await page.waitForTimeout(2000);
    fila = page.locator("tr").filter({ hasText: largo }).first();
  }
  return (await fila.count()) ? fila : null;
}

/**
 * Baja el registro de 3 hojas ("ver") de un R.Nro, con la sesión del RETP ya abierta en `page`.
 * Verifica que sea el de ese registro, con el CUIT del propietario y todavía sin procesar por el CPAU.
 */
export async function bajarRegistro({ page, registro, cuitPropietario }) {
  const fila = await filaDelHistorico(page, registro);
  if (!fila) throw new Error(`No aparece el R.Nro ${registro} en el Histórico del CPAU`);
  const [descarga] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    fila.locator('input[type=image][src*="popup-window"]').first().click(),
  ]);
  const bytes = hastaElFinal(readFileSync(await descarga.path()));
  const { paginas } = await textoPdf(bytes);
  const todo = paginas.join(" ");
  if (!todo.includes(`Número de Registro ${registroCorto(registro)}`)) throw new Error(`El registro bajado del CPAU no es el ${registro}`);
  if (cuitPropietario && !todo.includes(`Nro Doc. Prop. ${cuitPropietario}`)) {
    throw new Error(`El registro del CPAU no trae el CUIT del propietario ${cuitPropietario} (${todo.match(/Tipo Doc\. Prop\.[^A-Z]*\S+ \S+/)?.[0] ?? "sin dato"})`);
  }
  if (paginas.length !== 3) throw new Error(`El registro del CPAU tiene ${paginas.length} hojas y se esperaban 3`);
  return bytes;
}

// ── 2. Firmas ──────────────────────────────────────────────────────────────

/** Posición del texto de cada columna de firma en una hoja (medido el 16/09: y=24, x=44/215/386). */
async function columnasDeFirma(pdfProxy, numero) {
  const pagina = await pdfProxy.getPage(numero);
  const { items } = await pagina.getTextContent();
  const buscar = (re) => items.find((i) => re.test(i.str ?? ""))?.transform;
  const com = buscar(/Firma Comitente/i);
  const mat = buscar(/Firma Matriculado/i);
  const cpau = buscar(/Firma CPAU/i);
  if (com && mat && cpau) return { y: com[5], comitente: [com[4], mat[4]], matriculado: [mat[4], cpau[4]] };
  return { y: 24, comitente: [44, 215], matriculado: [215, 386] };
}

/**
 * Estampa las firmas de JS (comitente) y Hougassian (matriculado) en las 3 hojas, centradas en su
 * columna y a 40 pt de alto dentro del cuadro de firmas (de y+9 a y+54).
 */
export async function firmarRegistro({ db, registro }) {
  const bajar = async (path) => {
    const { data, error } = await db.storage.from(BUCKET).download(path);
    if (error || !data) throw new Error(`No se pudo bajar la firma ${path}: ${error?.message ?? "sin datos"}`);
    return new Uint8Array(await data.arrayBuffer());
  };
  const [firmaJs, firmaHougassian] = await Promise.all([
    bajar("plantillas/comun/firma-js.png"),
    bajar("plantillas/comun/firma-hougassian-encomienda.png"),
  ]);
  const doc = await PDFDocument.load(registro, { ignoreEncryption: true });
  const imgJs = await doc.embedPng(firmaJs);
  const imgHou = await doc.embedPng(firmaHougassian);
  const proxy = await getDocumentProxy(new Uint8Array(registro));
  for (const [i, hoja] of doc.getPages().entries()) {
    const col = await columnasDeFirma(proxy, i + 1);
    for (const [img, [x0, x1]] of [[imgJs, col.comitente], [imgHou, col.matriculado]]) {
      const ancho = x1 - x0 - 8;
      const escala = Math.min(40 / img.height, ancho / img.width);
      const w = img.width * escala;
      const h = img.height * escala;
      hoja.drawImage(img, { x: x0 + (x1 - x0 - w) / 2, y: col.y + 9 + (45 - h) / 2, width: w, height: h });
    }
  }
  return Buffer.from(await doc.save());
}

// ── 3. Pago ────────────────────────────────────────────────────────────────

const tarjeta = () => {
  const campos = {
    NOMBREENTARJETA: process.env.CPAU_TARJETA_TITULAR,
    NROTARJETA: process.env.CPAU_TARJETA_NUMERO,
    VENCTARJETA: process.env.CPAU_TARJETA_VENCIMIENTO,
    CODSEGURIDAD: process.env.CPAU_TARJETA_CODIGO,
    EMAILCLIENTE: process.env.CPAU_TARJETA_MAIL,
    NRODOC: process.env.CPAU_TARJETA_DNI,
    CALLE: process.env.CPAU_TARJETA_CALLE,
    NROPUERTA: process.env.CPAU_TARJETA_NRO_PUERTA,
    FECHANACIMIENTO: process.env.CPAU_TARJETA_NACIMIENTO,
  };
  const faltan = Object.entries(campos).filter(([, v]) => !v?.trim()).map(([k]) => k);
  if (faltan.length) throw new CierreFrenado(`Faltan datos de la tarjeta en robot/.env.robot (${faltan.join(", ")})`);
  return campos;
};

async function loginTienda(page) {
  const clave = page.locator("#password, input[type=password]").first();
  if (!(await clave.isVisible().catch(() => false))) return;
  const usuario = page.locator("#username, input[formcontrolname=username], input[type=email]").first();
  await usuario.click();
  await usuario.pressSequentially(process.env.CPAU_USUARIO, { delay: 30 });
  await clave.click();
  await clave.pressSequentially(process.env.CPAU_CLAVE, { delay: 30 });
  await page.locator("button:visible").filter({ hasText: /ingresar/i }).first().click({ timeout: 15000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(4000);
}

async function tocarExacto(page, texto) {
  const boton = page.locator("button:visible, a:visible").filter({ hasText: new RegExp(`^\\s*${texto}\\s*$`, "i") }).first();
  if (!(await boton.count())) throw new Error(`No apareció «${texto}» en la tienda del CPAU`);
  await boton.click({ timeout: 15000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);
}

const APROBADO = /aprobad|exitos|[eé]xito|pago (realizado|confirmado|acreditado)|gracias por su (compra|pago)|operaci[oó]n (realizada|aprobada)/i;
const RECHAZADO = /rechazad|denegad|no autorizad|no (fue|ha sido|pudo ser) (aprobad|procesad|realizad|acreditad)|sin [eé]xito|no exitos|fondos insuficientes|tarjeta inv[aá]lid|datos inv[aá]lidos/i;

/**
 * Qué dice la pantalla después de "Aceptar". Sólo es "rechazado" si no hay ninguna señal de
 * aprobación: un rechazo libera la traba del pago y "Reanudar" vuelve a cobrar. Si dice las dos
 * cosas o ninguna es "dudoso" y frena con la traba puesta.
 */
export function leerResultadoPago(texto) {
  const aprobado = APROBADO.test(texto);
  const rechazado = RECHAZADO.test(texto);
  if (aprobado && !rechazado) return "aprobado";
  if (rechazado && !aprobado) return "rechazado";
  return "dudoso";
}

/**
 * Compra el producto 51 y paga con la tarjeta. `alIntentar({ operacion })` se llama ANTES de tocar
 * "Aceptar" y tiene que dejar anotado el intento. `pagar: false` completa el formulario y no toca
 * "Aceptar" (prueba). Devuelve el n° de operación de Pago Seguro, el texto de la pantalla final y
 * un PDF de esa pantalla como comprobante.
 */
export async function pagarEncomienda({ context, foto = async () => {}, alIntentar = async () => {}, alComprobante = async () => {}, pagar = true, log = () => {} }) {
  const datos = tarjeta();
  const page = await context.newPage();
  let decidir = null;
  const alPedir = (req) => {
    if (req.method() === "POST" && /sps\.decidir\.com\/sps-ar\/Validar/.test(req.url())) decidir = Object.fromEntries(new URLSearchParams(req.postData() ?? ""));
  };
  context.on("request", alPedir);
  try {
    await page.goto(PRODUCTO, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    await loginTienda(page);
    if (!/\/store\/productos\/51/.test(page.url())) await page.goto(PRODUCTO, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    if (!(await page.getByText(/estructuras transitorias/i).count())) throw new Error("La tienda del CPAU no muestra el producto de estructuras transitorias");
    await tocarExacto(page, "Comprar Ahora");
    await tocarExacto(page, "Finalizar Compra");
    const visa = await page.locator("mat-radio-button.mat-mdc-radio-checked").filter({ hasText: /visa cr[eé]dito/i }).count();
    if (!visa) throw new Error("En el checkout del CPAU no está elegida «Visa Crédito»");
    await foto("tienda checkout");

    await tocarExacto(page, "Procesar Pago");
    await page.waitForURL(/decidir\.com\/forms\/Validar/, { timeout: 60000 });
    await page.waitForTimeout(2000);
    if (!decidir) throw new Error("No se vio el pedido a Decidir: no se sabe el n° de operación");
    if (decidir.MONTO !== MONTO_CENTAVOS) throw new Error(`El monto que manda el CPAU a Decidir no es $50.000 (MONTO=${decidir.MONTO})`);
    if (decidir.NROCOMERCIO !== COMERCIO_DECIDIR) throw new Error(`El comercio de Decidir no es el del CPAU (${decidir.NROCOMERCIO})`);
    const operacion = decidir.NROOPERACION;
    if (!/^\d+$/.test(operacion ?? "")) throw new Error("Decidir no trajo un n° de operación");

    // Sin capturas desde acá hasta dejar Decidir: la pantalla muestra el número y el código de la
    // tarjeta, y las capturas del robot se suben al bucket y se ven desde la ficha.
    await foto("decidir antes de completar");
    for (const [campo, valor] of Object.entries(datos)) await page.fill(`input[name=${campo}]`, valor.trim());
    await page.selectOption("select[name=TIPODOC]", { label: "DNI" });
    const completos = await page.evaluate((nombres) => nombres.every((n) => document.querySelector(`input[name=${n}]`)?.value), Object.keys(datos));
    if (!completos) throw new Error("El formulario de Decidir no tomó todos los datos de la tarjeta");
    if (!pagar) return { operacion, probado: true };

    await alIntentar({ operacion });
    log(`CPAU: pagando la encomienda (operación ${operacion})`);
    await Promise.all([
      page.waitForURL((u) => !/forms\/Validar/.test(String(u)), { timeout: 120000 }).catch(() => {}),
      page.locator("input[name=ok]").click(),
    ]);
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(10000);
    const texto = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    // Si sigue en el formulario de Decidir tiene la tarjeta a la vista: ni captura ni PDF.
    const enFormulario = /decidir\.com\/forms\/Validar/.test(page.url());
    if (!enFormulario) await foto("despues de pagar");
    const comprobante = enFormulario ? null : await page.pdf({ format: "A4", printBackground: true }).catch(() => null);
    // Se guarda antes de decidir: si la pantalla es dudosa, una persona sigue con este PDF.
    if (comprobante) await alComprobante(Buffer.from(comprobante)).catch((e) => log("!! comprobante del CPAU", e.message));
    const resultado = leerResultadoPago(texto);
    if (resultado === "rechazado") return { operacion, aprobado: false, texto: texto.slice(0, 1500), url: page.url() };
    if (resultado === "dudoso") {
      throw new CierreFrenado(`Se tocó «Aceptar» en el pago (operación ${operacion}) pero la pantalla no dice claro si se aprobó: revisar la compra en perfil.cpau.org y el resumen de la tarjeta antes de seguir. Pantalla: ${texto.slice(0, 300)}`);
    }
    return { operacion, aprobado: true, texto: texto.slice(0, 1500), url: page.url(), comprobante: comprobante ? Buffer.from(comprobante) : null };
  } finally {
    context.off("request", alPedir);
    await page.close().catch(() => {});
  }
}

// ── 4. Plataforma ──────────────────────────────────────────────────────────

const ENVIADO = /gracias|recibid|registrad|ingresad|correctamente|con [eé]xito|exitosamente|n[uú]mero de tr[aá]mite/i;
// "El número ingresado no existe" también dice "ingresad": con cualquiera de estas no se da por cargada.
const NO_ENVIADO = /error|no existe|inexistente|inv[aá]lid|incorrect|no se pudo|no corresponde|ya (fue|ha sido|se encuentra|est[aá]) (cargad|registrad|ingresad|informad|presentad)|duplicad|regrese haciendo click|debe (completar|adjuntar|ingresar|seleccionar)/i;

/** La pantalla después de "Enviar" confirma la carga y no trae ningún error. */
export const cargaConfirmada = (texto) => ENVIADO.test(texto) && !NO_ENVIADO.test(texto);

/**
 * Carga la encomienda firmada y el pago en la Plataforma. `alIntentar()` se llama ANTES de "Enviar".
 * `enviar: false` llega hasta el paso 3 completo y no envía (prueba).
 */
export async function cargarEnPlataforma({ context, registro, registroFirmado, operacion, comprobante, foto = async () => {}, alIntentar = async () => {}, enviar = true }) {
  if (registroFirmado.length > MAX_PLATAFORMA) throw new Error(`El registro firmado pesa ${registroFirmado.length} bytes: la Plataforma acepta hasta 3 MB`);
  if (comprobante.length > MAX_PLATAFORMA) throw new Error(`El comprobante pesa ${comprobante.length} bytes: la Plataforma acepta hasta 3 MB`);
  const page = await context.newPage();
  const avisos = [];
  page.on("dialog", async (d) => { avisos.push(d.message()); await d.dismiss().catch(() => {}); });
  try {
    await page.goto(PLATAFORMA, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    await page.fill("#matricula", MATRICULA);
    await page.fill("#dni", DNI_MATRICULADO);
    await page.check("#tyc");
    await page.click("#validarPaso1");
    const paso2 = await page.locator("#tipoEnco").waitFor({ state: "visible", timeout: 30000 }).then(() => true).catch(() => false);
    if (!paso2) throw new Error(`La Plataforma no aceptó la matrícula y el DNI de Hougassian: ${(await page.locator(".ui-dialog").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 200)}`);

    await page.selectOption("#tipoEnco", "HE"); // Habilitación de estructuras transitoria
    await page.fill("#nroForm", registroCorto(registro));
    await page.setInputFiles("#enco", { name: `encomienda-${registroCorto(registro)}.pdf`, mimeType: "application/pdf", buffer: registroFirmado });
    await foto("plataforma paso 2");
    if (avisos.length) throw new Error(`La Plataforma rechazó la encomienda: ${avisos.join(" · ")}`);
    await page.locator("fieldset:has(#enco) input.next").click();
    await page.locator("#tipopago").waitFor({ state: "visible", timeout: 15000 });

    await page.selectOption("#tipopago", "PAGO"); // Pago Electronico - Sitio CPAU
    await page.fill("#pagoseguro", String(operacion));
    await page.setInputFiles("#comprobante", { name: `comprobante-${operacion}.pdf`, mimeType: "application/pdf", buffer: comprobante });
    await foto("plataforma paso 3");
    if (avisos.length) throw new Error(`La Plataforma rechazó el comprobante: ${avisos.join(" · ")}`);
    if (!enviar) return { probado: true };

    await alIntentar();
    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: 120000 }).catch(() => {}),
      page.click("#submit_data"),
    ]);
    await page.waitForTimeout(6000);
    const texto = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    await foto("plataforma enviada");
    if (avisos.length && !cargaConfirmada(texto)) throw new CierreFrenado(`Se tocó «Enviar» en la Plataforma y mostró: ${avisos.join(" · ")}. Revisar antes de volver a cargar.`);
    if (!cargaConfirmada(texto)) throw new CierreFrenado(`Se tocó «Enviar» en la Plataforma pero la pantalla no confirma la carga: revisar antes de volver a cargar. Pantalla: ${texto.slice(0, 300)}`);
    return { texto: texto.slice(0, 1500), url: page.url() };
  } finally {
    await page.close().catch(() => {});
  }
}

// ── 5. Certificado por mail ────────────────────────────────────────────────

/** El PDF final: el registro de ese R.Nro, la certificación y el comprobante. */
export async function verificarCertificado(bytes, registro) {
  const { paginas } = await textoPdf(bytes);
  const todo = paginas.join(" ");
  const corto = registroCorto(registro);
  return [
    { clave: "registro", ok: todo.includes(`Número de Registro ${corto}`), bloquea: true, detalle: `Trae el registro ${corto}.` },
    { clave: "certificacion", ok: /CERTIFICA QUE/i.test(todo), bloquea: true, detalle: "Trae la certificación del CPAU." },
    { clave: "comprobante", ok: new RegExp(`Enc N\\S*:\\s*\\d+/${corto}`).test(todo) || /Sistema Pago Seguro/i.test(todo), bloquea: false, detalle: "Trae el comprobante de pago." },
    { clave: "hojas", ok: paginas.length >= 4, bloquea: true, detalle: `${paginas.length} hojas.` },
  ];
}

async function adjuntosPdf(mail, profundidad = 0) {
  const lista = [];
  for (const a of mail.attachments ?? []) {
    if (/pdf/i.test(a.contentType) || /\.pdf$/i.test(a.filename ?? "")) lista.push({ nombre: a.filename ?? "encomienda.pdf", bytes: a.content });
    else if (/message\/rfc822/i.test(a.contentType) && profundidad < 2) lista.push(...(await adjuntosPdf(await simpleParser(a.content), profundidad + 1)));
  }
  return lista;
}

/**
 * Busca en permisos-andamio@ un mail desde `desde` con el PDF final del R.Nro. Devuelve el PDF, su
 * nombre, el mail (asunto, remitente, fecha) y los chequeos, o null si todavía no llegó.
 */
export async function buscarCertificadoEnMail({ registro, desde, log = () => {} }) {
  const user = process.env.PERMISOS_BUZON;
  const pass = process.env.PERMISOS_BUZON_CLAVE;
  if (!user || !pass) throw new CierreFrenado("Faltan PERMISOS_BUZON y PERMISOS_BUZON_CLAVE en robot/.env.robot");
  const cliente = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
  await cliente.connect();
  try {
    // Todo el correo (lo archivado también) y Spam, no sólo Recibidos: el primer reenvío real de
    // Hougassian (17/09, S01826) cayó en Spam y el robot no lo vio hasta que alguien lo movió.
    const cajas = await cliente.list();
    const todo = cajas.find((b) => b.specialUse === "\\All")?.path ?? "INBOX";
    const spam = cajas.find((b) => b.specialUse === "\\Junk")?.path;
    for (const caja of [todo, spam].filter(Boolean)) {
      const candado = await cliente.getMailboxLock(caja);
      try {
        const uids = (await cliente.search({ since: new Date(new Date(desde).getTime() - 86_400_000) }, { uid: true })) || [];
        for (const uid of [...uids].reverse()) {
          const mensaje = await cliente.fetchOne(String(uid), { source: true }, { uid: true });
          if (!mensaje?.source) continue;
          const mail = await simpleParser(mensaje.source);
          for (const adjunto of await adjuntosPdf(mail)) {
            const chequeos = await verificarCertificado(adjunto.bytes, registro).catch(() => null);
            if (!chequeos?.find((c) => c.clave === "registro")?.ok) continue;
            const enSpam = caja === spam;
            log(`CPAU: llegó el certificado de ${registro} por mail (${adjunto.nombre}${enSpam ? ", estaba en Spam" : ""})`);
            return {
              pdf: Buffer.from(adjunto.bytes), nombre: adjunto.nombre, chequeos,
              mail: { asunto: mail.subject ?? null, de: mail.from?.text ?? null, fecha: mail.date?.toISOString() ?? null, en_spam: enSpam },
            };
          }
        }
      } finally {
        candado.release();
      }
    }
    return null;
  } finally {
    await cliente.logout().catch(() => {});
  }
}
