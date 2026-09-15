// Prueba del robot (fase 0) — CPAU por dentro, SÓLO LECTURA.
//
// 1. Histórico: columnas "ver" y "Certificado" de una encomienda visada (descarga el PDF).
// 2. Nuevo RETP: recorre el asistente con "Siguiente" para ver cada pantalla, pero NO
//    guarda borrador ni finaliza, y sale con "Salir" / cerrando la sesión.
// 3. tramites.cpau.org: portada de carga de encomiendas (sin ingresar datos).
//
// Correr: node --env-file=robot/.env.robot robot/prueba-cpau-lectura.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const DIR = "robot/capturas";
mkdirSync(DIR, { recursive: true });
let n = 0;
async function foto(page, nombre, espera = 2500) {
  n += 1;
  const base = `${DIR}/cpau-${String(n).padStart(2, "0")}-${nombre}`;
  await page.waitForTimeout(espera);
  await page.screenshot({ path: `${base}.png`, fullPage: true });
  const info = await page.evaluate(() => ({
    url: location.href,
    texto: document.body.innerText,
    campos: [...document.querySelectorAll("input,select,textarea")]
      .filter((e) => e.type !== "hidden")
      .map((e) => ({ tag: e.tagName, id: e.id, type: e.type, valor: e.value, opciones: e.tagName === "SELECT" ? [...e.options].map((o) => o.text) : undefined })),
  }));
  writeFileSync(`${base}.json`, JSON.stringify(info, null, 2));
  console.log(`\n== cpau ${n} ${nombre} — ${info.url}\n${info.texto.replace(/©.*$/s, "").trim().slice(0, 2500)}`);
  console.log("campos:", JSON.stringify(info.campos));
  return info;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: "es-AR", viewport: { width: 1366, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
try {
  await page.goto("https://retp.cpau.org/FrmMain.aspx?ReturnUrl=/", { waitUntil: "domcontentloaded" });
  await page.fill("#ctl05_usernameTextBox", process.env.CPAU_USUARIO);
  await page.fill("#ctl05_passwordTextBox", process.env.CPAU_CLAVE);
  await Promise.all([page.waitForLoadState("domcontentloaded"), page.click("#ctl05_loginButton")]);

  // 1. Histórico: primera fila visada.
  await page.goto("https://retp.cpau.org/FrmHisto.aspx", { waitUntil: "domcontentloaded" });
  await foto(page, "historico");
  const fila = page.locator("tr").filter({ hasText: /Habilitación\s+\d{8,}/ }).first();
  const html = await fila.evaluate((tr) => tr.outerHTML);
  writeFileSync(`${DIR}/cpau-fila-historico.html`, html);
  console.log("\nFila histórico (html guardado). Links/inputs:", await fila.locator("a, input").evaluateAll((es) => es.map((e) => `${e.tagName} ${e.id} ${e.title || e.alt || e.innerText || e.value}`)));

  const cert = fila.locator("a, input[type=image]").last();
  const [descarga, popup] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }).catch(() => null),
    context.waitForEvent("page", { timeout: 20000 }).catch(() => null),
    cert.click(),
  ]);
  if (descarga) {
    await descarga.saveAs(`${DIR}/encomienda-ejemplo-${descarga.suggestedFilename()}`);
    console.log("Certificado descargado:", descarga.suggestedFilename());
  } else if (popup) {
    await popup.waitForLoadState("domcontentloaded").catch(() => {});
    await foto(popup, "certificado-popup", 5000);
    await popup.close();
  } else {
    await foto(page, "certificado-click");
  }

  // 2. Nuevo RETP: sólo recorrer con Siguiente, tipo Habilitación / Estructura Transitoria.
  await page.goto("https://retp.cpau.org/FrmNewRetp.aspx", { waitUntil: "domcontentloaded" });
  const selects = page.locator("select");
  if ((await selects.count()) >= 2) {
    await selects.nth(0).selectOption({ label: "Habilitación" }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.locator("select").nth(1).selectOption({ label: "Habilitación Estructura Transitoria" }).catch(() => {});
    await page.waitForTimeout(1500);
  }
  await foto(page, "nuevo-1-datos-basicos");
  for (let i = 2; i <= 4; i++) {
    // Los botones del Wizard ASP.NET tienen espacios en el value (" Siguiente ").
    const sig = page.locator("input[id$='NextButton']").first();
    if (!(await sig.count())) break;
    await Promise.all([page.waitForLoadState("domcontentloaded").catch(() => {}), sig.click()]);
    const info = await foto(page, `nuevo-${i}`);
    // Pantallas con datos obligatorios vacíos no avanzan: se corta ahí, sin cargar nada.
    if (/Comitente|Inmueble|Frentes/i.test(info.texto) && i >= 3) break;
  }
  // Salir sin guardar.
  await page.goto("https://retp.cpau.org/FrmHisto.aspx", { waitUntil: "domcontentloaded" });
  await foto(page, "historico-despues", 1500);

  // 3. tramites.cpau.org
  await page.goto("https://tramites.cpau.org/", { waitUntil: "domcontentloaded" });
  await foto(page, "tramites-portada", 4000);
} finally {
  await browser.close();
}
