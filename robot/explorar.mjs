// Prueba del robot (fase 0) — SÓLO LECTURA.
//
// Abre una URL, saca captura y vuelca el texto visible, los links y los campos del
// formulario, para ir descubriendo el camino en TAD y el CPAU sin presentar nada.
//
// Correr: node --env-file=robot/.env.robot robot/explorar.mjs <url> <nombre>
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const [url, nombre = "pagina"] = process.argv.slice(2);
if (!url) throw new Error("Falta la URL");

const dir = process.env.CAPTURAS_DIR ?? "robot/capturas";
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ headless: true });
// El firewall de AGIP bloquea el user agent "HeadlessChrome": se presenta como un Chrome común.
const page = await browser.newPage({
  locale: "es-AR",
  viewport: { width: 1366, height: 900 },
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
});
try {
  const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${dir}/${nombre}.png`, fullPage: true });
  const info = await page.evaluate(() => ({
    titulo: document.title,
    url: location.href,
    texto: document.body.innerText.slice(0, 3000),
    links: [...document.querySelectorAll("a")].map((a) => `${a.innerText.trim().slice(0, 60)} -> ${a.href}`).filter((l) => !l.startsWith(" ->")).slice(0, 80),
    campos: [...document.querySelectorAll("input,select,button,textarea")].map((e) => `${e.tagName} name=${e.name} id=${e.id} type=${e.type} text=${(e.innerText || e.value || "").slice(0, 40)}`).slice(0, 60),
    iframes: [...document.querySelectorAll("iframe")].map((f) => f.src),
  }));
  writeFileSync(`${dir}/${nombre}.json`, JSON.stringify({ status: resp?.status(), ...info }, null, 2));
  console.log(JSON.stringify({ status: resp?.status(), ...info }, null, 2));
} finally {
  await browser.close();
}
