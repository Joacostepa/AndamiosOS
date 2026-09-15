// Piezas compartidas de las pruebas contra TAD: navegador, login miBA, representado y
// capturas. SÓLO LECTURA — nada acá confirma, subsana ni inicia trámites.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

export const DIR = "robot/capturas";
mkdirSync(DIR, { recursive: true });

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export async function abrir() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "es-AR", viewport: { width: 1440, height: 900 }, userAgent: UA, acceptDownloads: true });
  const page = await context.newPage();
  return { browser, context, page };
}

export function fotografo(prefijo) {
  let paso = 0;
  return async function foto(page, nombre, espera = 3000) {
    paso += 1;
    const base = `${DIR}/${prefijo}-${String(paso).padStart(2, "0")}-${nombre}`;
    await page.waitForTimeout(espera);
    await page.screenshot({ path: `${base}.png`, fullPage: true });
    const info = await page.evaluate(() => ({
      url: location.href,
      texto: document.body.innerText,
      botones: [...document.querySelectorAll("button,a,[role=button],[role=tab]")]
        .map((e) => `${e.tagName} ${(e.innerText || e.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 50)}`)
        .filter((s) => s.length > 3)
        .slice(0, 120),
    }));
    writeFileSync(`${base}.json`, JSON.stringify(info, null, 2));
    console.log(`\n== ${prefijo} ${paso} ${nombre} — ${info.url}`);
    return info;
  };
}

/** Recorta el texto de la página a la parte útil, sin encabezado ni pie. */
export function cuerpo(texto) {
  const desde = texto.search(/Jorge Patricio Riveros Zanetta \(Nivel 3\)\s*expand_more/);
  const hasta = texto.search(/Preguntas Frecuentes/);
  return texto.slice(desde >= 0 ? desde + 45 : 0, hasta > 0 ? hasta : undefined).trim();
}

/**
 * Login miBA (un intento) + representar a Emprendimientos y Estructuras.
 *
 * La redirección de TAD al login pasa por varios realms de login.buenosaires.gob.ar (desde
 * el 15/09 termina en "realms/mail", misma pantalla y mismos ids) y a veces tarda más de 20 s
 * (07:39 del 15/09). Se espera hasta 60 s y, si el formulario no aparece, se recarga UNA vez.
 * La clave se manda una sola vez: reintentar el envío puede bloquear la cuenta miBA.
 */
export async function entrar(page) {
  const formulario = page.locator("#email");
  await page.goto("https://tad.buenosaires.gob.ar/tramitesadistancia/", { waitUntil: "domcontentloaded" });
  try {
    await formulario.waitFor({ state: "visible", timeout: 60000 });
  } catch {
    await page.goto("https://tad.buenosaires.gob.ar/tramitesadistancia/", { waitUntil: "domcontentloaded" });
    await formulario.waitFor({ state: "visible", timeout: 60000 });
  }
  await page.fill("#email", process.env.MIBA_USUARIO);
  await page.fill("#password-text-field", process.env.MIBA_CLAVE);
  await page.click("#login");
  await page.waitForURL(/tad\.buenosaires\.gob\.ar/, { timeout: 30000 });
  await page.waitForTimeout(6000);
  await page.getByText(/Seleccione a qui[eé]n representar/i).first().click();
  await page.waitForTimeout(1500);
  await page.getByText(/EMPRENDIMIENTOS Y ESTRUCTURAS/i).first().click();
  await page.getByText(/Representando a:/i).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(3000);
}

/**
 * Navega con el menú de arriba. TAD es una SPA: entrar por URL directa (/misTramites,
 * /notificaciones) rebota a /nuevo-tramite, así que siempre se va haciendo click.
 */
export async function ir(page, seccion) {
  // Sin anclar: el botón del menú trae pegado el contador ("Mis trámites\n2").
  await page.getByText(new RegExp(seccion, "i")).first().click();
  await page.waitForTimeout(7000);
}
