// Prueba del robot (fase 0) — CPAU, SÓLO LECTURA.
//
// Entra al RETP con el usuario del matriculado y mira el menú y el histórico. No toca
// "Nuevo RETP" ni compra nada.
//
// Correr: node --env-file=robot/.env.robot robot/prueba-cpau.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const dir = "robot/capturas";
mkdirSync(dir, { recursive: true });

const volcar = (page) =>
  page.evaluate(() => ({
    url: location.href,
    texto: document.body.innerText.slice(0, 2500),
    links: [...document.querySelectorAll("a")].map((a) => `${a.innerText.trim().slice(0, 50)} -> ${a.href}`).filter((l) => !l.startsWith(" ->")).slice(0, 40),
  }));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: "es-AR", viewport: { width: 1366, height: 900 } });
try {
  await page.goto("https://retp.cpau.org/FrmMain.aspx?ReturnUrl=/", { waitUntil: "domcontentloaded" });
  await page.fill("#ctl05_usernameTextBox", process.env.CPAU_USUARIO);
  await page.fill("#ctl05_passwordTextBox", process.env.CPAU_CLAVE);
  await Promise.all([page.waitForLoadState("domcontentloaded"), page.click("#ctl05_loginButton")]);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${dir}/cpau-1-post-login.png`, fullPage: true });
  const post = await volcar(page);
  console.log("== post login", JSON.stringify(post, null, 2));

  const historico = page.getByText("HISTÓRICO RETP", { exact: false }).first();
  if (await historico.count()) {
    await Promise.all([page.waitForLoadState("domcontentloaded"), historico.click()]);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${dir}/cpau-2-historico.png`, fullPage: true });
    const h = await volcar(page);
    writeFileSync(`${dir}/cpau-2-historico.json`, JSON.stringify(h, null, 2));
    console.log("== historico", h.url, "\n", h.texto.slice(0, 1500));
  } else {
    console.log("No aparece HISTÓRICO RETP: el login probablemente falló.");
  }
} finally {
  await browser.close();
}
