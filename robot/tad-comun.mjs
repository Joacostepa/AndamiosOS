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
  const TAD = "https://tad.buenosaires.gob.ar/tramitesadistancia/";
  const formulario = page.locator("#email");
  const representando = page.getByText(/Representando a:/i).first();
  const elegir = page.getByText(/Seleccione a qui[eé]n representar/i).first();
  // Tres pantallas posibles después de ir a TAD: el login de miBA, TAD pidiendo a quién
  // representar (miBA ya tenía la sesión y redirigió solo) o TAD ya representando. El 15/09,
  // después de que TAD cortara la sesión, miBA redirigió directo y el robot esperaba un
  // formulario que nunca apareció.
  const pantalla = async () => {
    if (await representando.isVisible().catch(() => false)) return "adentro";
    if (await elegir.isVisible().catch(() => false)) return "elegir";
    if (await formulario.isVisible().catch(() => false)) return "login";
    return null;
  };
  const esperarPantalla = async (ms) => {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      const p = await pantalla();
      if (p) return p;
      await page.waitForTimeout(1000);
    }
    return null;
  };

  await page.goto(TAD, { waitUntil: "domcontentloaded" });
  let donde = await esperarPantalla(60000);
  if (!donde) {
    await page.goto(TAD, { waitUntil: "domcontentloaded" });
    donde = await esperarPantalla(60000);
  }
  if (!donde) throw new Error("TAD no mostró ni el login de miBA ni su página de inicio");

  if (donde === "login") {
    await page.fill("#email", process.env.MIBA_USUARIO);
    await page.fill("#password-text-field", process.env.MIBA_CLAVE);
    await page.click("#login");
    await page.waitForURL(/tad\.buenosaires\.gob\.ar/, { timeout: 30000 });
    await page.waitForTimeout(6000);
    donde = await esperarPantalla(60000);
    if (donde === "login" || !donde) throw new Error("miBA no dejó entrar (sigue en el login)");
  }

  if (donde === "adentro") {
    const texto = await representando.evaluate((e) => e.closest("button, div")?.innerText ?? e.innerText).catch(() => "");
    if (/EMPRENDI/i.test(texto)) {
      await page.waitForTimeout(2000);
      return;
    }
    throw new Error(`TAD está representando a otra persona (${texto.replace(/\s+/g, " ").trim()})`);
  }

  await elegir.click({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.getByText(/EMPRENDIMIENTOS Y ESTRUCTURAS/i).first().click({ timeout: 15000 });
  await representando.waitFor({ timeout: 15000 });
  await page.waitForTimeout(3000);
}

/**
 * Espera a que TAD termine de cargar: mientras hay un "Cargando..." visible la página queda
 * gris y los clics no llegan (15/09: más de 30 s, y la lista de En curso se leyó con 5 filas
 * porque no se pudo elegir "Todos"). Devuelve false si a los `ms` sigue cargando.
 */
export async function esperarCarga(page, ms = 90000) {
  const cargando = () => page.evaluate(() =>
    [...document.querySelectorAll("body *")].some((e) => e.childElementCount === 0 && e.offsetParent && e.textContent.trim() === "Cargando..."),
  ).catch(() => false);
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (!(await cargando())) return true;
    await page.waitForTimeout(1500);
  }
  return false;
}

/** El total de la tabla visible según "Mostrando X a Y de Z" (null si no hay paginado a la vista). */
export async function totalDeLista(page) {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll("body *")].find((e) => e.childElementCount === 0 && e.offsetParent && /Mostrando \d+ a \d+ de \d+/.test(e.textContent));
    const m = el?.textContent.match(/de (\d+)/);
    return m ? Number(m[1]) : null;
  }).catch(() => null);
}

/**
 * Navega con el menú de arriba. TAD es una SPA: entrar por URL directa (/misTramites,
 * /notificaciones) rebota a /nuevo-tramite, así que siempre se va haciendo click.
 */
export async function ir(page, seccion) {
  await esperarCarga(page);
  await abandonarSiPregunta(page);
  // Sin anclar: el botón del menú trae pegado el contador ("Mis trámites\n2").
  await page.getByText(new RegExp(seccion, "i")).first().click();
  await page.waitForTimeout(3000);
  // Salir del asistente de un trámite pregunta si se lo abandona; si nadie contesta, la ventana
  // queda abierta tapando la página y la vuelta siguiente no puede hacer clic (15/09). El
  // borrador queda guardado igual, así que se acepta.
  if (await abandonarSiPregunta(page)) await page.getByText(new RegExp(seccion, "i")).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  await esperarCarga(page);
}

/** Si TAD pregunta "¿abandonar el trámite?", toca "Sí, abandonar". Devuelve si lo tocó. */
export async function abandonarSiPregunta(page) {
  const boton = page.locator(".modal.show button:visible", { hasText: /S[ií],\s*abandonar/i }).first();
  if (!(await boton.count().catch(() => 0))) return false;
  await boton.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(3000);
  return true;
}
