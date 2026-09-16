// Mapeo de la COMPRA de la encomienda en la tienda del CPAU, SIN PAGAR.
//
// Instructivo de Tamara: Compras online → "Encomienda de hab. de cartel o estructuras
// transitorias" → Comprar → Siguiente → Visa → datos de la tarjeta, DNI, domicilio, nacimiento,
// mail → Aceptar. En la tienda de hoy (16/09): producto 51 de perfil.cpau.org ($50.000) →
// "Comprar Ahora" → /store/carrito (vive en el navegador) → "Finalizar Compra" → /store/checkout
// ("Visa Crédito" ya viene elegida) → "Procesar Pago" → formulario de pago (probablemente de la
// pasarela) → "Aceptar", que es lo que cobra.
//
// Este script recorre ese camino con la cuenta del matriculado hasta VER el formulario de pago y
// guarda captura, campos (también los de iframes), botones y el tráfico de red de cada paso. La
// API de la tienda es cpauorgapi.azurewebsites.net.
//
// GARANTÍAS (autorizado por JS el 16/09: puede quedar un carrito o una intención de pago pendiente):
//   - Antes de "Procesar Pago" se permite escribir en *.cpau.org y en la API de la tienda sólo si
//     el pedido no habla de pago; toda escritura a otros sitios se bloquea.
//   - "Procesar Pago" se toca UNA vez. Mientras dura ese clic se permite el pedido a la API de la
//     tienda y la NAVEGACIÓN a la pasarela (abrir su página). Las escrituras en segundo plano
//     (xhr/fetch) a sitios que no son del CPAU siguen bloqueadas.
//   - En el formulario de pago NO se toca nada y NO se completa ningún campo: sólo se registra.
//   - El script no lee los datos de la tarjeta de robot/.env.robot: no puede haber un cobro.
//
// Correr (sin tareas del CPAU en curso en el robot):
//   node --env-file=.env.local --env-file=robot/.env.robot robot/mapear-cpau-compra.mjs
import { chromium } from "playwright";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const DIR = "robot/capturas/cpau-compra";
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

const PRODUCTO = "https://perfil.cpau.org/store/productos/51";
const API_TIENDA = "cpauorgapi.azurewebsites.net";
const PAGO_EN_PEDIDO = /pag[oa]|payment|tarjeta|card|token|cobr|confirm/i;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: "es-AR", viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const red = [];
let enLogin = false;
let procesando = false;
const delCpau = (host) => /(^|\.)cpau\.org$/.test(host) || host === API_TIENDA;
await context.route("**/*", (route) => {
  const req = route.request();
  if (req.method() === "GET" || req.method() === "OPTIONS") return route.continue();
  const url = req.url();
  const host = new URL(url).host;
  if (/google|doubleclick|clarity\.ms/.test(host)) return route.abort("blockedbyclient"); // analytics
  const cuerpo = (req.postData() ?? "").slice(0, 3000);
  const esPago = PAGO_EN_PEDIDO.test(url) || PAGO_EN_PEDIDO.test(cuerpo);
  const navegacion = req.resourceType() === "document";
  let permitido;
  let motivo = null;
  if (enLogin) permitido = true;
  else if (procesando && (host === API_TIENDA || navegacion)) { permitido = true; motivo = "Procesar Pago (autorizado)"; }
  else if (delCpau(host) && !esPago) permitido = true;
  else { permitido = false; motivo = delCpau(host) ? "habla de pago" : "escritura a un sitio que no es del CPAU"; }
  red.push({ metodo: req.method(), tipo: req.resourceType(), url, cuerpo: enLogin ? "(login)" : cuerpo, permitido, motivo });
  console.log(`  ${permitido ? "→" : "⛔"} ${req.method()} ${url}${motivo ? ` (${motivo})` : ""}`);
  return permitido ? route.continue() : route.abort("blockedbyclient");
});
context.on("response", async (res) => {
  const req = res.request();
  if (!["xhr", "fetch", "document"].includes(req.resourceType()) || /ModalHome|Categorias|productos\?nocache|\.js$|\.css$/.test(res.url())) return;
  if (req.resourceType() === "document" && req.method() === "GET" && /perfil\.cpau\.org/.test(res.url())) return;
  let cuerpo = "";
  try { cuerpo = (await res.text()).slice(0, 3000); } catch { /* sin cuerpo */ }
  red.push({ respuesta: res.status(), metodo: req.method(), tipo: req.resourceType(), url: res.url(), cuerpo: /Auth\/login/.test(res.url()) ? "(login)" : cuerpo });
});

let n = 0;
/** Registra una página y TODOS sus frames (el formulario de tarjeta suele estar en un iframe). */
async function registrar(nombre, p = page) {
  n += 1;
  const base = `${DIR}/${String(n).padStart(2, "0")}-${nombre}`;
  await p.waitForTimeout(4000);
  await p.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
  writeFileSync(`${base}.html`, await p.content().catch(() => ""));
  const frames = [];
  for (const f of p.frames()) {
    const datos = await f.evaluate(() => {
      const visible = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
      const texto = (e) => (e.innerText || e.value || e.getAttribute("aria-label") || e.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 80);
      const etiqueta = (e) => (e.id && document.querySelector(`label[for="${e.id}"]`)?.innerText) || e.closest("label, .form-group, mat-form-field, div")?.innerText?.split("\n")[0] || "";
      return {
        campos: [...document.querySelectorAll("input, select, textarea, mat-select")].filter(visible).map((e) => ({
          tag: e.tagName, type: e.getAttribute("type"), name: e.getAttribute("name"), id: e.id,
          formcontrol: e.getAttribute("formcontrolname"), placeholder: e.getAttribute("placeholder"),
          autocomplete: e.getAttribute("autocomplete"), maxlength: e.getAttribute("maxlength"),
          etiqueta: String(etiqueta(e)).trim().slice(0, 60),
        })),
        botones: [...document.querySelectorAll("button, [role=button], input[type=submit]")].filter(visible).map((e) => texto(e)).filter(Boolean),
        texto: document.body?.innerText.replace(/\s+/g, " ").slice(0, 2500) ?? "",
      };
    }).catch((e) => ({ error: String(e).slice(0, 200) }));
    frames.push({ url: f.url(), principal: f === p.mainFrame(), ...datos });
  }
  writeFileSync(`${base}.json`, JSON.stringify({ url: p.url(), frames }, null, 2));
  console.log(`[${n}] ${nombre} → ${p.url()}`);
  for (const f of frames) {
    if (!f.principal && !f.campos?.length) continue;
    console.log(`     ${f.principal ? "página" : `iframe ${f.url.slice(0, 90)}`}: ${f.campos?.length ?? 0} campos · botones: ${(f.botones ?? []).join(" | ").slice(0, 200)}`);
  }
}

async function login() {
  const clave = page.locator("#password, input[type=password]").first();
  if (!(await clave.isVisible().catch(() => false))) return false;
  const usuario = page.locator("#username, input[formcontrolname=username], input[type=email]").first();
  await usuario.click();
  await usuario.pressSequentially(process.env.CPAU_USUARIO, { delay: 30 });
  await clave.click();
  await clave.pressSequentially(process.env.CPAU_CLAVE, { delay: 30 });
  enLogin = true;
  await page.locator("button:visible").filter({ hasText: /ingresar/i }).first().click({ timeout: 15000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(5000);
  enLogin = false;
  return true;
}

async function tocarExacto(texto) {
  const boton = page.locator("button:visible, a:visible").filter({ hasText: new RegExp(`^\\s*${texto}\\s*$`, "i") }).first();
  if (!(await boton.count())) throw new Error(`No apareció «${texto}»`);
  console.log(`  clic en «${texto}»`);
  await boton.click({ timeout: 15000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
}

try {
  await page.goto(PRODUCTO, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  if (await login()) await page.goto(PRODUCTO, { waitUntil: "domcontentloaded" });
  await registrar("producto");

  await tocarExacto("Comprar Ahora");
  await registrar("carrito");

  await tocarExacto("Finalizar Compra");
  await registrar("checkout");

  const visaElegida = await page.locator("mat-radio-button.mat-mdc-radio-checked").filter({ hasText: /visa cr[eé]dito/i }).count();
  if (!visaElegida) throw new Error("En el checkout no está elegida «Visa Crédito»: no se toca Procesar Pago");
  console.log("  «Visa Crédito» ya está elegida");

  // Procesar Pago, UNA vez. Puede navegar en la misma pestaña, abrir otra o mostrar un iframe.
  procesando = true;
  const nueva = context.waitForEvent("page", { timeout: 25000 }).catch(() => null);
  await tocarExacto("Procesar Pago");
  const otraPestana = await nueva;
  await page.waitForTimeout(8000);
  procesando = false;

  await registrar("despues-procesar-pago");
  if (otraPestana) {
    await otraPestana.waitForLoadState("domcontentloaded").catch(() => {});
    console.log(`  abrió otra pestaña → ${otraPestana.url()}`);
    await registrar("pestana-de-pago", otraPestana);
  }
  console.log("  fin del mapeo: no se completa ni se toca nada en el formulario de pago");
} catch (e) {
  procesando = false;
  console.log("!! se frenó:", e.message.split("\n")[0]);
  await registrar("error").catch(() => {});
} finally {
  writeFileSync(`${DIR}/red.json`, JSON.stringify(red, null, 2));
  const escrituras = red.filter((r) => r.permitido !== undefined);
  console.log(`Escrituras: ${escrituras.filter((r) => r.permitido).length} permitidas · ${escrituras.filter((r) => !r.permitido).length} bloqueadas (sin analytics)`);
  for (const r of escrituras) console.log(`  ${r.permitido ? "→" : "⛔"} ${r.metodo} [${r.tipo}] ${r.url}${r.motivo ? ` (${r.motivo})` : ""}`);
  await browser.close();
}
