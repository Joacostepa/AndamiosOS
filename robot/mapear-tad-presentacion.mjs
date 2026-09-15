// Mapeo de la presentación en TAD (pasos 1 y 2 y el formulario "Completar"), SIN PRESENTAR.
//
// Llegar al paso 1 del asistente CREA UN BORRADOR (verificado 15/09: el borrador 12975549 se
// creó a las 20:37:00 del 14/09, cuando la prueba de inicio llegó al paso 1). Lo decidió JS:
// se mapea con un borrador de prueba y después se borra (robot/borrar-tad-borrador.mjs).
//
// TRABA DE SEGURIDAD: todos los pedidos a la API de TAD pasan por page.route. Hasta llegar al
// paso 2 se dejan pasar (crear el borrador y "Continuar" son escrituras); desde ahí se
// BLOQUEA cualquier pedido que no sea GET y se registra. Ni un clic equivocado puede guardar,
// adjuntar ni confirmar nada. Además nunca se toca un botón "Confirmar trámite".
//
// Correr (con el robot de launchd PARADO):
//   node --env-file=robot/.env.robot robot/mapear-tad-presentacion.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { abrir, entrar, ir, cuerpo } from "./tad-comun.mjs";

const DIR = "robot/capturas/tad-presentacion";
mkdirSync(DIR, { recursive: true });
const { browser, page } = await abrir();

let bloquear = false;
const escrituras = [];
await page.route("**/tad2-rest/**", (route) => {
  const req = route.request();
  if (req.method() === "GET") return route.continue();
  escrituras.push({ t: new Date().toISOString().slice(11, 19), metodo: req.method(), url: req.url(), bloqueada: bloquear, cuerpo: (req.postData() ?? "").slice(0, 1500) });
  return bloquear ? route.abort("blockedbyclient") : route.continue();
});

// Las respuestas de la API también dicen cosas (id del borrador, catálogos del formulario).
const respuestas = [];
page.on("response", async (res) => {
  if (!/tad2-rest/.test(res.url()) || res.request().method() !== "GET") return;
  let txt = "";
  try { txt = await res.text(); } catch { return; }
  respuestas.push({ url: res.url(), estado: res.status(), cuerpo: txt.slice(0, 20000) });
});

let n = 0;
async function foto(nombre, espera = 2000) {
  n += 1;
  await page.waitForTimeout(espera);
  const base = `${DIR}/${String(n).padStart(2, "0")}-${nombre}`;
  await page.screenshot({ path: `${base}.png`, fullPage: true });
  const texto = cuerpo(await page.locator("body").innerText()).replace(/\n{2,}/g, "\n");
  writeFileSync(`${base}.txt`, texto);
  console.log(`\n== ${n} ${nombre} — ${page.url()}`);
  return texto;
}

/** Campos visibles dentro de `raiz` (o de toda la página) con su etiqueta y opciones. */
async function campos(raiz = "body") {
  return page.locator(raiz).first().evaluate((r) => {
    const visible = (e) => !!(e.offsetParent || e.getClientRects().length);
    const etiqueta = (e) => {
      if (e.labels?.[0]) return e.labels[0].innerText.trim();
      if (e.getAttribute("aria-label")) return e.getAttribute("aria-label");
      let p = e.parentElement;
      for (let i = 0; i < 4 && p; i++, p = p.parentElement) {
        const l = p.querySelector("label, .label, legend, p, span");
        if (l && l !== e && l.innerText.trim()) return l.innerText.trim().slice(0, 120);
      }
      return null;
    };
    return [...r.querySelectorAll("input, select, textarea, ng-select, mat-select, [role=combobox], [role=radio], [role=checkbox]")]
      .filter(visible)
      .filter((e) => e.type !== "hidden")
      .map((e) => ({
        tag: e.tagName.toLowerCase(), id: e.id || null, name: e.getAttribute("name") || e.getAttribute("formcontrolname") || null,
        type: e.type || e.getAttribute("role") || null, etiqueta: etiqueta(e), placeholder: e.placeholder || null,
        requerido: e.required || e.getAttribute("aria-required") === "true" || null, valor: e.value || null,
        opciones: e.tagName === "SELECT" ? [...e.options].map((o) => o.text.trim()) : undefined,
      }));
  });
}

const botonesVisibles = () => page.locator("button:visible, a.btn:visible").evaluateAll((es) => es.map((e) => e.innerText.trim().replace(/\s+/g, " ")).filter(Boolean));

try {
  await entrar(page);
  await ir(page, "Inicio");
  const buscador = page.getByPlaceholder(/Busc[aá] un tr[aá]mite/i).first();
  await buscador.waitFor({ state: "visible", timeout: 30000 });
  await buscador.fill("andamios");
  await buscador.press("Enter");
  await page.waitForTimeout(7000);
  await page.locator(":visible", { hasText: /Solicitud de permiso para la instalaci[oó]n de andamios/i }).last().click();
  await page.waitForTimeout(8000);
  await page.locator("button:visible", { hasText: /Iniciar tr[aá]mite/i }).first().click();
  await page.waitForTimeout(5000);

  // Representación: Emprendimientos y Estructuras.
  await page.locator(":visible", { hasText: /^\s*Elegir persona a representar/i }).last().click();
  await page.waitForTimeout(2000);
  await page.locator(":visible", { hasText: /^\s*EMPRENDIMIENTOS Y ESTRUCTURAS/i }).last().click();
  await page.waitForTimeout(1500);
  await page.locator("button:visible", { hasText: /^\s*Confirmar\s*$/ }).first().click();
  await page.waitForTimeout(10000);

  // ── Paso 1: datos del solicitante ──
  for (const ver of await page.locator("button:visible", { hasText: /Ver completo/i }).all()) await ver.click().catch(() => {});
  const p1 = await foto("paso-1-solicitante");
  console.log(p1.slice(p1.indexOf("Datos del solicitante")).slice(0, 2500));

  await page.locator("button:visible", { hasText: /^\s*Continuar\s*$/ }).first().click();
  await page.waitForTimeout(10000);

  // ── Paso 2: desde acá no se escribe NADA ──
  bloquear = true;
  const p2 = await foto("paso-2-documentacion");
  console.log(p2.slice(p2.indexOf("Adjuntá") >= 0 ? p2.indexOf("Adjuntá") : 0).slice(0, 5000));
  console.log("Botones:", (await botonesVisibles()).join(" | "));
  writeFileSync(`${DIR}/paso-2.html`, await page.content());

  // ── Formulario "Completar" (Datos del trámite) ──
  const completar = page.locator("button:visible", { hasText: /Completar/i }).first();
  if (!(await completar.count())) throw new Error("No aparece el botón Completar en el paso 2");
  await completar.click();
  await page.waitForTimeout(8000);
  const modal = await foto("completar-formulario", 1000);
  console.log(modal.slice(0, 6000));
  const raiz = (await page.locator(".modal.show, [role=dialog]:visible, mat-dialog-container").count()) ? ".modal.show, [role=dialog]:visible, mat-dialog-container" : "body";
  const lista = await campos(raiz);
  writeFileSync(`${DIR}/completar-campos.json`, JSON.stringify(lista, null, 2));
  writeFileSync(`${DIR}/completar.html`, await page.content());
  console.log(`\nCampos del formulario (${lista.length}):`);
  for (const c of lista) console.log(`- ${c.etiqueta ?? "(sin etiqueta)"} · ${c.tag}${c.type ? `/${c.type}` : ""}${c.id ? ` #${c.id}` : ""}${c.name ? ` [${c.name}]` : ""}${c.requerido ? " *" : ""}${c.opciones ? ` → ${c.opciones.slice(0, 15).join(" | ")}` : ""}`);
  console.log("Botones:", (await botonesVisibles()).join(" | "));

  // Recorre el formulario hacia abajo por si es largo (capturas por tramos).
  for (let i = 1; i <= 6; i++) {
    const bajo = await page.evaluate((i) => {
      const cont = document.querySelector(".modal.show .modal-body, [role=dialog] .modal-body, mat-dialog-content") ?? document.scrollingElement;
      const antes = cont.scrollTop;
      cont.scrollTop = antes + cont.clientHeight * 0.9;
      return cont.scrollTop > antes;
    }, i);
    if (!bajo) break;
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${DIR}/completar-tramo-${i}.png` });
  }
} catch (e) {
  console.log(`!! ${e.message.split("\n")[0]}`);
  await foto("error", 500).catch(() => {});
} finally {
  writeFileSync(`${DIR}/escrituras.json`, JSON.stringify(escrituras, null, 2));
  writeFileSync(`${DIR}/respuestas.json`, JSON.stringify(respuestas, null, 2));
  console.log(`\nEscrituras a la API (${escrituras.length}):`);
  for (const w of escrituras) console.log(`${w.t} ${w.metodo} ${w.bloqueada ? "BLOQUEADA" : "permitida"} ${w.url}\n    ${w.cuerpo.replace(/\s+/g, " ").slice(0, 300)}`);
  await browser.close();
}
