// Prueba del robot (fase 0) — buscar el acceso a TAD desde AGIP, SÓLO LECTURA.
//
// La tarjeta "TAD - Jefatura de Gabinete" del instructivo (2023) ya no aparece en los
// servicios de Emprendimientos y Estructuras. Acá se prueba: (1) el buscador de servicios
// con "TAD" para cada representado y (2) adónde lleva la tarjeta MiBA. No se adhiere ni se
// inicia nada.
//
// Correr: node --env-file=robot/.env.robot robot/prueba-tad-acceso.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const dir = "robot/capturas";
mkdirSync(dir, { recursive: true });

async function foto(page, nombre) {
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${dir}/acceso-${nombre}.png`, fullPage: true });
  const info = await page.evaluate(() => ({
    url: location.href,
    texto: document.body.innerText.slice(0, 6000),
  }));
  writeFileSync(`${dir}/acceso-${nombre}.json`, JSON.stringify(info, null, 2));
  return info;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: "es-AR",
  viewport: { width: 1366, height: 900 },
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
});
const page = await context.newPage();
try {
  await page.goto("https://claveciudad.agip.gob.ar/", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Clave Ciudad", exact: true }).click();
  await page.locator("#cuit").waitFor({ state: "visible", timeout: 10000 });
  await page.fill("#cuit", process.env.CLAVE_CIUDAD_CUIT);
  await page.fill("#clave", process.env.CLAVE_CIUDAD_CLAVE);
  await page.press("#clave", "Enter");
  await page.waitForURL(/menu_principal/, { timeout: 20000 });

  const opciones = await page.locator("select#cuit_representado option").evaluateAll((os) => os.map((o) => ({ value: o.value, text: o.text })));
  for (const op of opciones) {
    await page.selectOption("select#cuit_representado", op.value);
    await page.waitForTimeout(2500);
    await page.fill("#filtro_app", "TAD");
    await page.waitForTimeout(2000);
    const clave = op.text.split(" ")[0].toLowerCase();
    const info = await foto(page, `buscar-tad-${clave}`);
    // Con palabra completa: "represenTADo" daba falso positivo.
    const tiene = /\bTAD\b|Tr[áa]mites a Distancia|Jefatura de Gabinete/i.test(info.texto.split("Mis aplicativos")[1] ?? "");
    console.log(`\n== ${op.text}: ${tiene ? "APARECE TAD" : "no aparece TAD"}`);
    console.log((info.texto.split("Mis aplicativos")[1] ?? "").slice(0, 600));
    await page.fill("#filtro_app", "");
  }

  // Tarjeta MiBA con Emprendimientos seleccionado: ver adónde lleva, sin operar.
  const emp = opciones.find((o) => /EMPRENDIMIENTOS/i.test(o.text));
  await page.selectOption("select#cuit_representado", emp.value);
  await page.waitForTimeout(2500);
  const miba = page.locator("text=Acceso al portal de Identificación de GCBA").first();
  const [nueva] = await Promise.all([
    context.waitForEvent("page", { timeout: 15000 }).catch(() => null),
    miba.click(),
  ]);
  const destino = nueva ?? page;
  await destino.waitForLoadState("domcontentloaded").catch(() => {});
  await destino.waitForTimeout(6000);
  const m = await foto(destino, "miba");
  console.log(`\n== MiBA -> ${m.url}\n${m.texto.slice(0, 1500)}`);
} finally {
  await browser.close();
}
