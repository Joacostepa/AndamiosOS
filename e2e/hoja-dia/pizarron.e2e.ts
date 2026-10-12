// El Pizarrón en el navegador (Playwright), con las APIs interceptadas (servidor-falso.ts) y
// el escenario del martes 13 precargado. Corre con `npm run test:e2e` (levanta `next dev` en
// el puerto 3217, o usa E2E_URL). Lo que se mira:
// - arrastrar una persona y un camión: la ficha se ve en el destino en menos de 100 ms con el
//   POST demorado 1,5 s (optimista);
// - teclado (1–5) y tocar ficha → tocar destino (con Esc para cancelar);
// - "No vienen" pide el motivo;
// - 1366 y 390 px sin scroll horizontal del body; modo oscuro; reduced-motion.
// E2E_CAPTURAS=<carpeta> guarda capturas para mirarlas.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContextOptions, type Locator, type Page } from "playwright";
import { levantarNext, type Next } from "./servidor-next.ts";
import { MARTES, servirHojaDia, type Opciones, type Servidor } from "./servidor-falso.ts";

let next: Next;
let browser: Browser;

before(async () => {
  next = await levantarNext();
  browser = await chromium.launch();
}, { timeout: 300_000 });
after(async () => {
  await browser?.close();
  await next?.cerrar();
});

async function abrir(o: Opciones & { ancho?: number; alto?: number; contexto?: BrowserContextOptions } = {}): Promise<{ page: Page; srv: Servidor }> {
  const ctx = await browser.newContext({ viewport: { width: o.ancho ?? 1366, height: o.alto ?? 1100 }, colorScheme: "dark", ...o.contexto });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date("2026-10-12T18:30:00-03:00"));
  // Nada de afuera: ni los mapas ni el Supabase de mentira.
  await ctx.route(/openfreemap\.org|127\.0\.0\.1:54399/, (r) => r.abort());
  const srv = await servirHojaDia(ctx, o);
  await page.goto(`${next.url}/prueba/pizarron?dia=${MARTES}`);
  await page.locator('[data-col="1"]').waitFor({ timeout: 60_000 });
  return { page, srv };
}

/** Cuánto tarda (en el navegador) en aparecer `selector` desde el último `evento`. */
async function medir(page: Page, selector: string, evento: "mouseup" | "keydown" | "click", accion: () => Promise<void>): Promise<number> {
  await page.evaluate(({ sel, ev }) => {
    const w = window as unknown as { __t0: number | null; __t1: number | null };
    w.__t0 = null;
    w.__t1 = null;
    window.addEventListener(ev, () => { w.__t0 = performance.now(); }, { capture: true });
    const obs = new MutationObserver(() => {
      if (w.__t0 != null && w.__t1 == null && document.querySelector(sel)) {
        w.__t1 = performance.now();
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true });
  }, { sel: selector, ev: evento });
  await accion();
  await page.waitForFunction(() => (window as unknown as { __t1: number | null }).__t1 != null, null, { timeout: 5000 });
  const ms = await page.evaluate(() => {
    const w = window as unknown as { __t0: number; __t1: number };
    return w.__t1 - w.__t0;
  });
  console.log(`${selector}: ${ms.toFixed(0)} ms`);
  return ms;
}

/** `arriba`: agarrar por el encabezado (en un camión, el medio es el botón del chofer). */
async function arrastrarHasta(page: Page, de: Locator, a: Locator, arriba = false) {
  await de.scrollIntoViewIfNeeded();
  const b1 = (await de.boundingBox())!;
  const y0 = arriba ? b1.y + 10 : b1.y + b1.height / 2;
  await page.mouse.move(b1.x + b1.width / 2, y0);
  await page.mouse.down();
  await page.mouse.move(b1.x + b1.width / 2 + 12, y0 + 8, { steps: 4 });
  const b2 = (await a.boundingBox())!;
  await page.mouse.move(b2.x + b2.width / 2, b2.y + Math.min(b2.height / 2, 24), { steps: 14 });
  await page.waitForTimeout(120);
}

async function sinScrollHorizontal(page: Page) {
  const r = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, ancho: window.innerWidth }));
  assert.ok(r.doc <= r.ancho && r.body <= r.ancho, `scroll horizontal del body: ${JSON.stringify(r)}`);
}

async function captura(page: Page, nombre: string) {
  if (process.env.E2E_CAPTURAS) await page.screenshot({ path: join(process.env.E2E_CAPTURAS, `${nombre}.png`), fullPage: true });
}

describe("Pizarrón", { timeout: 120_000 }, () => {
  test("arrastrar una persona: se ve en la columna en < 100 ms con el POST demorado 1,5 s", async () => {
    const { page, srv } = await abrir();
    await captura(page, "1366-oscuro");
    const paz = page.locator('[data-caja="sin"] [data-flip="p:paz"]');
    await arrastrarHasta(page, paz, page.locator('[data-col="4"] [data-zona="gente"]'));
    const ms = await medir(page, '[data-col="4"] [data-flip="p:paz"]', "mouseup", () => page.mouse.up());
    assert.ok(ms < 100, `tardó ${ms.toFixed(0)} ms`);
    // Aterriza con la animación (use-flip), no salta.
    const aterriza = await page.locator('[data-col="4"] [data-flip="p:paz"]').evaluate((el) => el.getAnimations().length);
    assert.ok(aterriza > 0, "la ficha aterriza animada");
    await page.waitForTimeout(1700);
    assert.deepEqual(srv.posts.map((p) => (p.body as { accion: string }).accion), ["agregar"]);
    assert.equal(await page.locator('[data-col="4"] [data-flip="p:paz"]').count(), 1, "sigue ahí después de que contestó el servidor");
    await page.context().close();
  });

  test("arrastrar un camión libre a una columna: entra 'Todo el día' al instante", async () => {
    // Alto: la columna y los camiones libres (abajo) tienen que verse a la vez.
    const { page, srv } = await abrir({ alto: 1800 });
    const camion = page.locator('[data-caja="libres"] [data-camion="ab497"]');
    await arrastrarHasta(page, camion, page.locator('[data-col="4"] [data-zona="camiones"]'), true);
    const ms = await medir(page, '[data-col="4"] [data-camion="ab497"]', "mouseup", () => page.mouse.up());
    assert.ok(ms < 100, `tardó ${ms.toFixed(0)} ms`);
    assert.match(await page.locator('[data-col="4"] [data-camion="ab497"]').innerText(), /Todo el día/);
    await page.waitForTimeout(1700);
    assert.equal((srv.posts[0].body as { accion: string }).accion, "vehiculo_sumar");
    await page.context().close();
  });

  test("teclado: con foco en una ficha, 3 la manda a la Cuadrilla 3", async () => {
    const { page } = await abrir();
    await page.locator('[data-caja="sin"] [data-flip="p:paz"]').focus();
    const ms = await medir(page, '[data-col="3"] [data-flip="p:paz"]', "keydown", () => page.keyboard.press("3"));
    assert.ok(ms < 100, `tardó ${ms.toFixed(0)} ms`);
    await page.context().close();
  });

  test("tocar ficha → tocar destino, con la barra de ayuda; Esc cancela", async () => {
    const { page } = await abrir();
    const paz = page.locator('[data-caja="sin"] [data-flip="p:paz"]');
    await paz.click();
    await page.getByText("Tocá adónde va Paz").waitFor();
    await page.keyboard.press("Escape");
    await page.getByText("Tocá adónde va Paz").waitFor({ state: "detached" });
    await paz.click();
    const ms = await medir(page, '[data-col="2"] [data-flip="p:paz"]', "click", () => page.locator('[data-col="2"] header').click({ position: { x: 12, y: 18 } }));
    assert.ok(ms < 100, `tardó ${ms.toFixed(0)} ms`);
    await page.context().close();
  });

  test("No vienen: pide el motivo y queda ahí", async () => {
    const { page, srv } = await abrir();
    // La bandeja va abajo de las columnas: primero a la vista (con las dos cajas adentro).
    await page.locator('[data-caja="no"]').scrollIntoViewIfNeeded();
    await arrastrarHasta(page, page.locator('[data-caja="sin"] [data-flip="p:paz"]'), page.locator('[data-caja="no"]'));
    await page.mouse.up();
    await page.getByRole("menuitem", { name: "Enfermedad" }).click();
    await page.locator('[data-caja="no"] [data-flip="p:paz"]').waitFor({ timeout: 500 });
    await page.waitForTimeout(1700);
    assert.equal(srv.posts.at(-1)!.url, "/api/hoja-dia/ausencias");
    await page.context().close();
  });

  test("⋯ de la columna: lo de la cuadrilla; el encuentro se cambia en el lugar", async () => {
    const { page, srv } = await abrir();
    await page.locator('[data-col="1"] [aria-label^="Más opciones de la"]').click();
    for (const item of ["Copiar como hoy", "Instrucciones", "Historial"]) await page.getByRole("menuitem", { name: item }).waitFor();
    await captura(page, "menu-columna");
    await page.keyboard.press("Escape");
    await page.locator('[data-col="1"] header').getByText(/en la obra|en el depósito/).click();
    await page.getByLabel("Lugar del encuentro").selectOption("deposito");
    await page.waitForTimeout(1700);
    const enc = srv.posts.find((x) => (x.body as { accion: string }).accion === "encuentro")?.body as { cuadrilla: number; lugar: string } | undefined;
    assert.deepEqual(enc && { c: enc.cuadrilla, lugar: enc.lugar }, { c: 1, lugar: "deposito" });
    await page.context().close();
  });

  test("⋯ de una persona: Pasar a otra cuadrilla", async () => {
    const { page, srv } = await abrir();
    await page.locator('[data-col="1"] [data-zona="gente"] [aria-label^="Opciones de"]').first().click();
    await page.getByRole("menuitem", { name: "Pasar a…" }).click();
    await page.getByRole("menuitem", { name: /Cuadrilla 2/ }).click();
    await page.waitForTimeout(1700);
    const ag = srv.posts.at(-1)!.body as { accion: string; cuadrilla: number };
    assert.deepEqual({ accion: ag.accion, c: ag.cuadrilla }, { accion: "agregar", c: 2 });
    await page.context().close();
  });

  test("Ausencias y Camiones están en la barra", async () => {
    const { page } = await abrir();
    assert.match((await page.getByTitle(/el despacho del día/).getAttribute("href")) ?? "", /^\/planificacion\/hoja\/camiones\?dia=2026-10-13$/);
    await page.getByRole("button", { name: /Ausencias/ }).click();
    await page.getByRole("dialog").waitFor();
    await captura(page, "ausencias");
    await page.context().close();
  });

  test("Depósito: columna D al final; con la tecla D la persona entra al instante", async () => {
    const { page, srv } = await abrir();
    const dep = page.locator('[data-col="0"]');
    await dep.scrollIntoViewIfNeeded();
    assert.match(await dep.innerText(), /depósito/i);
    assert.equal(await dep.locator('[data-zona="camiones"]').count(), 0, "el depósito no tiene franja de camiones");
    await page.locator('[data-caja="sin"] [data-flip="p:paz"]').focus();
    const ms = await medir(page, '[data-col="0"] [data-flip="p:paz"]', "keydown", () => page.keyboard.press("d"));
    assert.ok(ms < 100, `tardó ${ms.toFixed(0)} ms`);
    await page.waitForTimeout(1700);
    const ag = srv.posts.at(-1)!.body as { accion: string; cuadrilla: number };
    assert.deepEqual({ accion: ag.accion, c: ag.cuadrilla }, { accion: "agregar", c: 0 });
    await captura(page, "deposito");
    await page.context().close();
  });

  test("Recorrido: se abre desde el camión, muestra las paradas y suma una en Sanz", async () => {
    const { page, srv } = await abrir();
    await page.locator('[data-col="2"] [data-camion="af669"]').getByRole("button", { name: /Recorrido/ }).click();
    const hoja = page.getByRole("dialog", { name: /Recorrido · Iveco AF 669 ZL/ });
    await hoja.waitFor();
    assert.ok(await hoja.locator("[data-parada]").count() >= 2, "las paradas del camión");
    assert.match(await hoja.innerText(), /Lleva gente/);
    await captura(page, "recorrido");
    await hoja.getByRole("button", { name: "Parada", exact: true }).click();
    await page.getByLabel("Buscar el lugar").fill("sanz");
    await page.getByLabel("Buscar el lugar").press("Enter");
    await page.waitForTimeout(1700);
    const c = srv.posts.at(-1)!.body as { accion: string; tipo: string; queHace: string; horaAprox: boolean; vehiculoId: string };
    assert.deepEqual({ accion: c.accion, tipo: c.tipo, queHace: c.queHace, aprox: c.horaAprox, veh: c.vehiculoId }, { accion: "crear", tipo: "compra", queHace: "compra", aprox: true, veh: "af669" });
    await hoja.locator("[data-parada]").filter({ hasText: "Galvanizados Sanz" }).waitFor();
    await captura(page, "recorrido-sanz");
    await page.context().close();
  });

  test("390 px: sin scroll horizontal del body, y tocar-tocar anda", async () => {
    const { page } = await abrir({ ancho: 390, alto: 844 });
    await sinScrollHorizontal(page);
    await captura(page, "390-oscuro");
    const paz = page.locator('[data-caja="sin"] [data-flip="p:paz"]');
    await paz.scrollIntoViewIfNeeded();
    await paz.click();
    await page.locator('[data-col="1"] header').click({ position: { x: 12, y: 18 } });
    await page.locator('[data-col="1"] [data-flip="p:paz"]').waitFor({ timeout: 500 });
    await sinScrollHorizontal(page);
    await page.context().close();
  });

  test("1366 px: sin scroll horizontal; modo oscuro con fondo oscuro", async () => {
    const { page } = await abrir();
    await sinScrollHorizontal(page);
    const r = await page.evaluate(() => ({ dark: document.documentElement.classList.contains("dark"), fondo: getComputedStyle(document.body).backgroundColor }));
    assert.ok(r.dark, "html.dark");
    const nums = (r.fondo.match(/[\d.]+/g) ?? []).map(Number);
    // rgb(…) o oklch(L …): oscuro = poca luz.
    const oscuro = r.fondo.startsWith("oklch") ? nums[0] < 0.4 : nums.slice(0, 3).every((x) => x < 90);
    assert.ok(oscuro, `fondo ${r.fondo}`);
    await page.context().close();
  });

  test("reduced-motion: el arrastre anda igual (sin animaciones)", async () => {
    const { page } = await abrir({ contexto: { reducedMotion: "reduce" } });
    await arrastrarHasta(page, page.locator('[data-caja="sin"] [data-flip="p:paz"]'), page.locator('[data-col="5"] [data-zona="gente"]'));
    const ms = await medir(page, '[data-col="5"] [data-flip="p:paz"]', "mouseup", () => page.mouse.up());
    assert.ok(ms < 100, `tardó ${ms.toFixed(0)} ms`);
    // Las de las fichas (use-flip): ninguna. (El esqueleto del mapa sigue latiendo: no es nuestro.)
    const anim = await page.evaluate(() => document.getAnimations().filter((a) => {
      const t = (a.effect as KeyframeEffect | null)?.target;
      // Sólo las de la Web Animations API (use-flip); las transiciones de CSS (hover) no cuentan.
      return !(a instanceof CSSTransition) && !(a instanceof CSSAnimation) && a.playState === "running" && t instanceof Element && !!t.closest("[data-flip]");
    }).length);
    assert.equal(anim, 0, "no hay animaciones de fichas");
    await page.context().close();
  });
});
