// Sólo lectura: entra al RETP, captura el Histórico completo (texto + HTML + foto) para ver si
// quedó un borrador. No hace clic en nada salvo login y Logout.
//
// Correr: node --env-file=robot/.env.robot robot/revisar-cpau-historico.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const DIR = "robot/capturas/cpau-mapeo";
mkdirSync(DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ locale: "es-AR", viewport: { width: 1366, height: 900 } })).newPage();
try {
  await page.goto("https://retp.cpau.org/FrmMain.aspx?ReturnUrl=/", { waitUntil: "domcontentloaded" });
  await page.fill("#ctl05_usernameTextBox", process.env.CPAU_USUARIO);
  await page.fill("#ctl05_passwordTextBox", process.env.CPAU_CLAVE);
  await Promise.all([page.waitForLoadState("domcontentloaded"), page.click("#ctl05_loginButton")]);

  await page.goto("https://retp.cpau.org/FrmHisto.aspx", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const sello = new Date().toISOString().replace(/[:.]/g, "-");
  await page.screenshot({ path: `${DIR}/historico-${sello}.png`, fullPage: true });
  writeFileSync(`${DIR}/historico-${sello}.html`, await page.content());
  const filas = await page.locator("tr").evaluateAll((trs) => trs.map((t) => t.innerText.replace(/\s+/g, " ").trim()).filter(Boolean));
  writeFileSync(`${DIR}/historico-${sello}.json`, JSON.stringify(filas, null, 2));
  console.log(filas.join("\n"));
  console.log(`\nFilas con "borrador": ${filas.filter((f) => /borrador/i.test(f)).length}`);
} finally {
  await page.locator("a", { hasText: /Logout/i }).first().click().catch(() => {});
  await browser.close();
}
