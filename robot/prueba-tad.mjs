// Prueba del robot (fase 0) — TAD con cuenta miBA, SÓLO LECTURA.
//
// TAD ya no se entra desde AGIP: pide cuenta miBA. Recorrido: login miBA → representar a
// EMPRENDIMIENTOS Y ESTRUCTURAS → Mis trámites → Notificaciones. No inicia, no subsana, no
// descarga nada.
//
// UN SOLO INTENTO de login: si aparece algo inesperado (código por mail/celular, captcha,
// clave incorrecta) se detiene y deja captura. Reintentar a ciegas puede bloquear la cuenta.
//
// Correr: node --env-file=robot/.env.robot robot/prueba-tad.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const dir = "robot/capturas";
mkdirSync(dir, { recursive: true });
let paso = 0;

async function foto(page, nombre, espera = 3000) {
  paso += 1;
  const base = `${dir}/tad-${paso}-${nombre}`;
  await page.waitForTimeout(espera);
  await page.screenshot({ path: `${base}.png`, fullPage: true });
  const info = await page.evaluate(() => ({
    url: location.href,
    titulo: document.title,
    texto: document.body.innerText.slice(0, 5000),
    campos: [...document.querySelectorAll("input,select,button")].map((e) => `${e.tagName} name=${e.name} id=${e.id} type=${e.type} text=${(e.innerText || e.value || "").trim().slice(0, 40)}`).slice(0, 50),
  }));
  writeFileSync(`${base}.json`, JSON.stringify(info, null, 2));
  console.log(`\n== ${paso} ${nombre}\n${info.url}\n${info.texto.slice(0, 1500)}`);
  return info;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: "es-AR",
  viewport: { width: 1440, height: 900 },
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
});
const page = await context.newPage();
try {
  await page.goto("https://tad.buenosaires.gob.ar/tramitesadistancia/", { waitUntil: "domcontentloaded" });
  await page.locator("#email").waitFor({ state: "visible", timeout: 20000 });
  await page.fill("#email", process.env.MIBA_USUARIO);
  await page.fill("#password-text-field", process.env.MIBA_CLAVE);
  await page.click("#login");
  await page.waitForURL(/tad\.buenosaires\.gob\.ar/, { timeout: 30000 }).catch(() => {});
  const post = await foto(page, "post-login", 8000);

  if (!/tad\.buenosaires\.gob\.ar/.test(post.url)) {
    console.log("\nNo volvió a TAD después del login (¿código, captcha o clave?). Me detengo.");
    process.exit(0);
  }

  // Representar a Emprendimientos y Estructuras (desplegable arriba a la izquierda).
  const desplegable = page.getByText(/Seleccione a qui[eé]n representar/i).first();
  if (await desplegable.count()) {
    await desplegable.click();
    await page.waitForTimeout(1500);
    const emp = page.getByText(/EMPRENDIMIENTOS Y ESTRUCTURAS/i).first();
    if (await emp.count()) {
      await emp.click();
      await foto(page, "representado", 5000);
    } else {
      await foto(page, "sin-emprendimientos");
      console.log("\nNo aparece EMPRENDIMIENTOS en el desplegable. Me detengo.");
      process.exit(0);
    }
  } else {
    console.log("\nNo encontré el desplegable de representado; sigo a Mis trámites igual.");
  }

  const mis = page.getByText(/MIS TR[ÁA]MITES/i).first();
  if (await mis.count()) {
    await mis.click();
    await foto(page, "mis-tramites", 8000);
  } else {
    console.log("\nNo aparece MIS TRÁMITES.");
  }

  const notif = page.getByText(/NOTIFICACIONES/i).first();
  if (await notif.count()) {
    await notif.click();
    await foto(page, "notificaciones", 8000);
  }
} finally {
  await browser.close();
}
