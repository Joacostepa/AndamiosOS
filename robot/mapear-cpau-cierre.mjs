// Mapeo de lo que falta para cerrar la encomienda del CPAU, SIN PAGAR NI CARGAR NADA.
//
// Después de "Finalizar" en el RETP (eso ya lo hace robot/cpau-encomienda.mjs) quedan, a mano
// (instructivo de Tamara, "INSTRUCTIVO ENCOMIENDA"):
//   1. Histórico del RETP → "imprimir" la encomienda (3 hojas) para firmar: JS como comitente y
//      Hougassian como matriculado, en cada hoja.
//   2. perfil.cpau.org → Compras online → "Encomienda de hab. de cartel o estructuras
//      transitorias" → Comprar → Siguiente → Visa → tarjeta, DNI, domicilio, nacimiento, mail →
//      Aceptar. El comprobante llega por mail.
//   3. tramites.cpau.org → Ingresar trámite → "Habilitación de Est. Trans." → n° de encomienda +
//      encomienda firmada → Siguiente → Pago electrónico → n° de comprobante + PDF → Enviar.
// Este script recorre esas pantallas con la cuenta del matriculado y guarda captura, HTML y la
// lista de campos/botones/links de cada una, para construir el robot sobre lo que muestran.
//
// GARANTÍAS:
//   - En perfil.cpau.org y tramites.cpau.org se bloquea TODO pedido que no sea GET, salvo el del
//     login. Lo bloqueado queda en bloqueados.json (sirve para ver qué API usa cada paso).
//   - Nunca se hace clic en: pagar, aceptar, confirmar, enviar, cargar, subir, finalizar,
//     guardar, eliminar, anular, borrar. En la tienda sí se prueban "Comprar", "Siguiente" y
//     "Visa" (con la escritura bloqueada) para ver hasta dónde llega el formulario.
//   - Nunca se completa ningún dato de tarjeta. Además los campos de tarjeta de .env.robot están
//     vacíos hasta que JS los cargue: no puede haber un cobro.
//   - En el Histórico del RETP sólo se toca el botón de imprimir de la fila pedida.
//
// Correr (sin tareas del CPAU en curso en el robot):
//   node --env-file=.env.local --env-file=robot/.env.robot robot/mapear-cpau-cierre.mjs 0329522116
import { chromium } from "playwright";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const REGISTRO = (process.argv[2] ?? "0329522116").replace(/\D/g, "").replace(/^0+/, "");
const DIR = "robot/capturas/cpau-cierre";
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

const NUNCA = /pagar|aceptar|confirmar|enviar|cargar|subir|finalizar|guardar|eliminar|anular|borrar/i;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: "es-AR", viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage();

const bloqueados = [];
let permitirEscritura = false;
await context.route("**/*", (route) => {
  const req = route.request();
  const host = new URL(req.url()).host;
  if (req.method() === "GET" || permitirEscritura || !/perfil\.cpau\.org|tramites\.cpau\.org/.test(host)) return route.continue();
  bloqueados.push({ metodo: req.method(), url: req.url(), cuerpo: (req.postData() ?? "").slice(0, 800) });
  console.log(`  ⛔ bloqueado ${req.method()} ${req.url()}`);
  return route.abort("blockedbyclient");
});

let n = 0;
async function registrar(nombre, p = page) {
  n += 1;
  const base = `${DIR}/${String(n).padStart(2, "0")}-${nombre}`;
  await p.waitForTimeout(3000);
  await p.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
  writeFileSync(`${base}.html`, await p.content().catch(() => ""));
  const elementos = await p.evaluate(() => {
    const visible = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    const texto = (e) => (e.innerText || e.value || e.getAttribute("aria-label") || e.getAttribute("title") || e.getAttribute("alt") || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const etiqueta = (e) => (e.id && document.querySelector(`label[for="${e.id}"]`)?.innerText) || e.closest("mat-form-field, .form-group, label, td, div")?.innerText?.split("\n")[0] || "";
    return {
      url: location.href,
      titulo: document.title,
      campos: [...document.querySelectorAll("input, select, textarea, mat-select")].filter(visible).map((e) => ({
        tag: e.tagName, type: e.type, name: e.getAttribute("name"), id: e.id, placeholder: e.getAttribute("placeholder"),
        formcontrol: e.getAttribute("formcontrolname"), etiqueta: String(etiqueta(e)).trim().slice(0, 60),
      })),
      botones: [...document.querySelectorAll("button, input[type=submit], input[type=button], input[type=image]")].filter(visible).map((e) => ({ texto: texto(e), id: e.id })),
      links: [...document.querySelectorAll("a")].filter(visible).map((e) => ({ texto: texto(e), href: e.getAttribute("href") })).filter((l) => l.texto || l.href),
      texto: document.body.innerText.replace(/\s+/g, " ").slice(0, 1500),
    };
  }).catch((e) => ({ error: String(e) }));
  writeFileSync(`${base}.json`, JSON.stringify(elementos, null, 2));
  console.log(`[${n}] ${nombre} → ${elementos.url ?? "?"}`);
  return elementos;
}

/** Clic en el primer botón o link visible con ese texto, si no es de los prohibidos. */
async function tocar(patron, nombre) {
  const candidato = page.locator("button:visible, a:visible, [role=button]:visible, mat-radio-button:visible, label:visible").filter({ hasText: patron }).first();
  if (!(await candidato.count())) { console.log(`  no aparece «${patron}»`); return false; }
  const texto = (await candidato.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  if (NUNCA.test(texto)) { console.log(`  «${texto}» no se toca en el mapeo`); return false; }
  await candidato.click({ timeout: 15000 }).catch((e) => console.log(`  no se pudo tocar «${texto}»: ${e.message.split("\n")[0]}`));
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await registrar(nombre);
  return true;
}

/** Login de las apps Angular del CPAU (perfil / trámites): #username, #password, "Ingresar". */
async function loginCpau(nombre) {
  const usuario = page.locator("#username, input[formcontrolname=username], input[type=email]").first();
  const clave = page.locator("#password, input[type=password]").first();
  if (!(await clave.isVisible().catch(() => false))) return false;
  await usuario.click();
  await usuario.pressSequentially(process.env.CPAU_USUARIO, { delay: 30 });
  await clave.click();
  await clave.pressSequentially(process.env.CPAU_CLAVE, { delay: 30 });
  permitirEscritura = true;
  const ingresar = page.locator("button:visible").filter({ hasText: /ingresar|iniciar sesi[oó]n|entrar/i }).first();
  if (await ingresar.count()) await ingresar.click({ timeout: 15000 }).catch(() => clave.press("Enter"));
  else await clave.press("Enter");
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(5000);
  permitirEscritura = false;
  await registrar(`${nombre}-despues-login`);
  return true;
}

const manana = () => {
  const d = new Date(Date.now() + 86_400_000);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

try {
  // ── 1. Histórico del RETP: la encomienda sin firmas ──────────────────────
  await page.goto("https://retp.cpau.org/FrmMain.aspx?ReturnUrl=/", { waitUntil: "domcontentloaded" });
  await page.fill("#ctl05_usernameTextBox", process.env.CPAU_USUARIO);
  await page.fill("#ctl05_passwordTextBox", process.env.CPAU_CLAVE);
  await Promise.all([page.waitForLoadState("domcontentloaded"), page.click("#ctl05_loginButton")]);
  await page.goto("https://retp.cpau.org/FrmHisto.aspx", { waitUntil: "domcontentloaded" });

  // El "hasta" por defecto es hoy a las 0 h: lo de hoy no aparece. Se lleva a mañana.
  await page.fill("#ContentPlaceHolder1_txtHastaFecha", manana());
  await Promise.all([page.waitForLoadState("domcontentloaded").catch(() => {}), page.press("#ContentPlaceHolder1_txtHastaFecha", "Enter")]);
  await registrar("retp-historico-hasta-manana");

  let fila = page.locator("tr").filter({ hasText: REGISTRO }).first();
  for (let pagina = 2; !(await fila.count()) && pagina <= 15; pagina++) {
    const link = page.locator("a").filter({ hasText: new RegExp(`^\\s*${pagina}\\s*$`) }).first();
    if (!(await link.count())) break;
    await Promise.all([page.waitForLoadState("domcontentloaded").catch(() => {}), link.click()]);
    await page.waitForTimeout(2000);
    fila = page.locator("tr").filter({ hasText: REGISTRO }).first();
    if (await fila.count()) console.log(`  la fila ${REGISTRO} está en la página ${pagina}`);
  }

  if (await fila.count()) {
    writeFileSync(`${DIR}/retp-fila-${REGISTRO}.html`, await fila.evaluate((e) => e.outerHTML));
    console.log(`  fila: ${(await fila.innerText()).replace(/\s+/g, " ").trim()}`);
    const imprimir = fila.locator('input[type=image][src*="imprimir" i]').first();
    if (await imprimir.count()) {
      const [descarga, popup] = await Promise.all([
        page.waitForEvent("download", { timeout: 30000 }).catch(() => null),
        context.waitForEvent("page", { timeout: 30000 }).catch(() => null),
        imprimir.click(),
      ]);
      if (descarga) {
        const destino = `${DIR}/retp-${REGISTRO}-${descarga.suggestedFilename()}`;
        await descarga.saveAs(destino);
        console.log(`  descargado → ${destino}`);
      }
      if (popup) {
        await popup.waitForLoadState("domcontentloaded").catch(() => {});
        console.log(`  abrió otra pestaña → ${popup.url()}`);
        await registrar("retp-imprimir-popup", popup);
        // Si la pestaña es el PDF, se guarda tal cual.
        const pdf = await popup.evaluate(async () => {
          const r = await fetch(location.href);
          return r.headers.get("content-type")?.includes("pdf") ? Array.from(new Uint8Array(await r.arrayBuffer())) : null;
        }).catch(() => null);
        if (pdf) {
          writeFileSync(`${DIR}/retp-${REGISTRO}-encomienda.pdf`, Buffer.from(pdf));
          console.log("  PDF de la encomienda guardado");
        }
      }
      if (!descarga && !popup) await registrar("retp-despues-imprimir");
    } else {
      console.log("  la fila no tiene botón de imprimir");
    }
  } else {
    console.log(`  no aparece la fila del Registro Web ${REGISTRO} en el Histórico`);
  }

  // ── 2. Tienda de perfil.cpau.org ─────────────────────────────────────────
  await page.goto("https://perfil.cpau.org/store/productos", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await registrar("perfil-ingreso");
  if (await loginCpau("perfil")) {
    await page.goto("https://perfil.cpau.org/store/productos", { waitUntil: "domcontentloaded" });
    await registrar("perfil-productos");
  }
  const producto = page.getByText(/cartel o estructuras transitorias/i).first();
  if (await producto.count()) {
    await producto.scrollIntoViewIfNeeded().catch(() => {});
    const tarjeta = producto.locator("xpath=ancestor::*[.//button or .//a][1]");
    writeFileSync(`${DIR}/perfil-producto.html`, await tarjeta.evaluate((e) => e.outerHTML).catch(() => ""));
    const comprar = tarjeta.locator("button, a").filter({ hasText: /comprar|agregar|ver|detalle/i }).first();
    if (await comprar.count()) {
      console.log(`  en la tarjeta del producto: «${(await comprar.innerText()).trim()}»`);
      await comprar.click({ timeout: 15000 }).catch((e) => console.log(`  no se pudo: ${e.message.split("\n")[0]}`));
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await registrar("perfil-despues-comprar");
      if (await tocar(/siguiente|continuar/i, "perfil-siguiente")) {
        await tocar(/visa/i, "perfil-visa");
      }
    }
  } else {
    console.log("  no se encontró el producto de cartel o estructuras transitorias");
  }

  // ── 3. Plataforma de trámites ────────────────────────────────────────────
  await page.goto("https://tramites.cpau.org/Plataforma", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await registrar("tramites-inicio");
  if (!(await loginCpau("tramites"))) {
    // El instructivo dice "bajar y poner ingresar trámite": puede haber un botón antes del login.
    if (await tocar(/ingresar tr[aá]mite|ingresar/i, "tramites-ingresar")) await loginCpau("tramites");
  }
  await tocar(/ingresar tr[aá]mite|nuevo tr[aá]mite/i, "tramites-ingresar-tramite");
  const tipo = page.locator("select:visible, mat-select:visible").first();
  if (await tipo.count()) {
    writeFileSync(`${DIR}/tramites-tipo.html`, await tipo.evaluate((e) => e.outerHTML).catch(() => ""));
    await tipo.click().catch(() => {});
    await registrar("tramites-tipos-de-tramite");
  }
} finally {
  writeFileSync(`${DIR}/bloqueados.json`, JSON.stringify(bloqueados, null, 2));
  console.log(`Pedidos bloqueados (escritura en perfil/tramites): ${bloqueados.length}`);
  await browser.close();
}
