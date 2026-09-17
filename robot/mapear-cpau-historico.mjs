// Mapeo del Histórico del RETP para encomiendas YA VISADAS, SÓLO LECTURA.
//
// Lo que va a TAD son 5 hojas: registro firmado por JS y Hougassian y sellado por el CPAU (3),
// certificación y comprobante de pago. JS (16/09): la certificación aparece apenas se carga todo
// en la Plataforma y la encomienda final 30-40 minutos después, las dos en el Histórico. El "Show"
// que se bajó de S02128 en el mapeo anterior era el registro regenerado por el CPAU, sin firmas.
// Este script vuelca la fila completa de cada R.Nro pedido (botones, links, columnas) y baja lo que
// descarga cada botón de imagen, para ver cuál es cada PDF.
//
// GARANTÍAS: sólo se tocan los botones de imagen de las filas pedidas (descargas por postback);
// nunca "Select" si lleva a editar, ni nada fuera de la grilla.
//
// Correr (sin tareas del CPAU en curso en el robot):
//   node --env-file=.env.local --env-file=robot/.env.robot robot/mapear-cpau-historico.mjs 00329522116 00329521985
import { chromium } from "playwright";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const REGISTROS = process.argv.slice(2).map((r) => r.replace(/\D/g, "").padStart(11, "0"));
if (!REGISTROS.length) throw new Error("Pasá los R.Nro");
const DIR = "robot/capturas/cpau-historico";
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: "es-AR", viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();

const manana = () => {
  const d = new Date(Date.now() + 86_400_000);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

async function historico() {
  await page.goto("https://retp.cpau.org/FrmHisto.aspx", { waitUntil: "domcontentloaded" });
  await page.fill("#ContentPlaceHolder1_txtHastaFecha", manana());
  await Promise.all([page.waitForLoadState("domcontentloaded").catch(() => {}), page.press("#ContentPlaceHolder1_txtHastaFecha", "Enter")]);
  await page.waitForTimeout(2500);
}

async function buscarFila(registro) {
  await historico();
  let fila = page.locator("tr").filter({ hasText: registro }).first();
  for (let pagina = 2; !(await fila.count()) && pagina <= 15; pagina++) {
    const link = page.locator("a").filter({ hasText: new RegExp(`^\\s*${pagina}\\s*$`) }).first();
    if (!(await link.count())) break;
    await Promise.all([page.waitForLoadState("domcontentloaded").catch(() => {}), link.click()]);
    await page.waitForTimeout(2000);
    fila = page.locator("tr").filter({ hasText: registro }).first();
  }
  return (await fila.count()) ? fila : null;
}

try {
  await page.goto("https://retp.cpau.org/FrmMain.aspx?ReturnUrl=/", { waitUntil: "domcontentloaded" });
  await page.fill("#ctl05_usernameTextBox", process.env.CPAU_USUARIO);
  await page.fill("#ctl05_passwordTextBox", process.env.CPAU_CLAVE);
  await Promise.all([page.waitForLoadState("domcontentloaded"), page.click("#ctl05_loginButton")]);

  await historico();
  await page.screenshot({ path: `${DIR}/historico.png`, fullPage: true });
  const encabezado = await page.locator("tr").first().innerText().catch(() => "");
  const tabla = await page.locator("table").evaluateAll((ts) => ts.map((t) => t.id || t.className).filter(Boolean));
  writeFileSync(`${DIR}/historico.json`, JSON.stringify({ encabezado, tabla }, null, 2));
  writeFileSync(`${DIR}/historico.html`, await page.content());

  for (const registro of REGISTROS) {
    const fila = await buscarFila(registro);
    if (!fila) { console.log(`${registro}: no aparece`); continue; }
    const html = await fila.evaluate((e) => e.outerHTML);
    writeFileSync(`${DIR}/fila-${registro}.html`, html);
    const celdas = await fila.locator("td").evaluateAll((tds) => tds.map((td) => ({
      texto: td.innerText.replace(/\s+/g, " ").trim(),
      controles: [...td.querySelectorAll("input, a, img")].map((e) => ({ tag: e.tagName, type: e.getAttribute("type"), id: e.id, name: e.getAttribute("name"), src: e.getAttribute("src"), href: e.getAttribute("href"), title: e.getAttribute("title"), alt: e.getAttribute("alt"), value: e.getAttribute("value") })),
    })));
    writeFileSync(`${DIR}/fila-${registro}.json`, JSON.stringify(celdas, null, 2));
    console.log(`${registro}: ${celdas.map((c) => c.texto).join(" | ")}`);

    // Los botones de imagen no tienen id ni name: se tocan por su imagen dentro de la fila.
    const botones = celdas.flatMap((c) => c.controles).filter((c) => c.tag === "INPUT" && c.type === "image" && c.src);
    for (const b of botones) {
      if (/arrow/i.test(b.src)) { console.log(`  ${b.src}: Select, no se toca`); continue; }
      const f = await buscarFila(registro);
      const control = f.locator(`input[type=image][src="${b.src}"]`).first();
      const [descarga, popup] = await Promise.all([
        page.waitForEvent("download", { timeout: 30000 }).catch(() => null),
        context.waitForEvent("page", { timeout: 8000 }).catch(() => null),
        control.click().catch((e) => console.log(`  ${b.src}: no se pudo (${e.message.split("\n")[0]})`)),
      ]);
      const nombre = `${registro}-${b.src.split("/").pop().replace(/\W+/g, "_")}`;
      if (descarga) {
        const destino = `${DIR}/${nombre}-${descarga.suggestedFilename()}`;
        await descarga.saveAs(destino);
        console.log(`  ${b.src} → ${destino}`);
      } else if (popup) {
        await popup.waitForLoadState("domcontentloaded").catch(() => {});
        console.log(`  ${b.src} → pestaña ${popup.url()}`);
        await popup.screenshot({ path: `${DIR}/${nombre}-popup.png`, fullPage: true }).catch(() => {});
        await popup.close().catch(() => {});
      } else {
        console.log(`  ${b.src} → nada`);
        await page.screenshot({ path: `${DIR}/${nombre}-despues.png`, fullPage: true }).catch(() => {});
      }
    }
    const links = celdas.flatMap((c) => c.controles).filter((c) => c.tag === "A" && c.href);
    for (const l of links) console.log(`  link: ${l.href}`);
  }
} finally {
  await browser.close();
}
