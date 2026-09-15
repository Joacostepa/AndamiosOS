// Mapeo del formulario "Datos del trámite" de TAD (el que termina en la carátula), SIN GUARDAR.
//
// El formulario vive en un IFRAME (/render/formulario/display?ffcc=FFCC_Carátula Variable_CSGEP_V7)
// hecho con ZK: cada tecla, desplegable o botón manda un evento al servidor (POST /zkau). Esos
// eventos no guardan el trámite (lo guarda "Guardar", que nunca se toca), así que se dejan pasar;
// sin ellos ni Autocompletar ni los desplegables funcionan (verificado 15/09).
//
// Esta pasada: elige "Persona Juridica" (lista los casilleros que agrega), lee las opciones de
// los desplegables, prueba "Autocompletar" con Trelles y el formato de las fechas.
//
// CREA UN BORRADOR (llegar al paso 1 lo crea): su id queda en el log; se borra con
// robot/borrar-tad-borrador.mjs.
//
// TRABA: desde el paso 2 se bloquea todo pedido que no sea GET salvo los eventos /zkau del
// formulario, y se registra. Nunca se toca "Guardar" ni "Confirmar trámite".
//
// Correr (con el robot de launchd PARADO):
//   node --env-file=robot/.env.robot robot/mapear-tad-formulario.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { abrir, entrar, ir, cuerpo } from "./tad-comun.mjs";

const DIR = "robot/capturas/tad-formulario";
mkdirSync(DIR, { recursive: true });
const { browser, context, page } = await abrir();

let bloquear = false;
const escrituras = [];
await context.route("**/*", (route) => {
  const req = route.request();
  if (req.method() === "GET" || req.method() === "OPTIONS") return route.continue();
  const eventoZk = /\/zkau/.test(req.url());
  const bloqueada = bloquear && !eventoZk;
  escrituras.push({ t: new Date().toISOString().slice(11, 19), metodo: req.method(), url: req.url(), zk: eventoZk, bloqueada, cuerpo: (req.postData() ?? "").slice(0, 800) });
  return bloqueada ? route.abort("blockedbyclient") : route.continue();
});

let borradorId = null;
page.on("response", (res) => {
  const m = res.url().match(/tad2-rest\/tramite\/(\d{6,})$/);
  if (m && res.request().method() === "GET") borradorId = Number(m[1]);
});

let n = 0;
async function foto(nombre, espera = 1500) {
  n += 1;
  await page.waitForTimeout(espera);
  await page.screenshot({ path: `${DIR}/${String(n).padStart(2, "0")}-${nombre}.png`, fullPage: true });
  console.log(`\n== ${n} ${nombre}`);
}

async function hasta(fn, ms = 30000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    const r = await fn().catch(() => null);
    if (r) return r;
    await page.waitForTimeout(1000);
  }
  return null;
}

const valores = (frame) => frame.evaluate(() =>
  Object.fromEntries([...document.querySelectorAll("input[name]")].map((e) => [e.name, e.value]).filter(([, v]) => v)));

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
  await page.locator(":visible", { hasText: /^\s*Elegir persona a representar/i }).last().click();
  await page.waitForTimeout(2000);
  await page.locator(":visible", { hasText: /^\s*EMPRENDIMIENTOS Y ESTRUCTURAS/i }).last().click();
  await page.waitForTimeout(1500);
  await page.locator("button:visible", { hasText: /^\s*Confirmar\s*$/ }).first().click();
  await page.waitForTimeout(10000);
  await page.locator("button:visible", { hasText: /^\s*Continuar\s*$/ }).first().click();
  await page.waitForTimeout(10000);

  // ── Paso 2: desde acá sólo pasan los eventos del formulario ──
  bloquear = true;
  console.log(`Borrador creado: ${borradorId ?? "(no se vio el id)"}`);

  await page.locator("button:visible", { hasText: /Completar/i }).first().click();
  const iframe = await hasta(async () => page.frames().find((f) => /render\/formulario\/display/.test(f.url())), 30000);
  if (!iframe) throw new Error("No apareció el iframe del formulario");
  await hasta(async () => (await iframe.locator("input[name]").count()) > 30, 30000);
  await page.waitForTimeout(3000);
  await foto("formulario", 500);

  // Desplegables ZK: el input visible es "<uuid>-real", el botón "<uuid>-btn" y la lista "<uuid>-pp".
  // Se eligen como en un trámite real (según la carátula de los presentados): algunos se
  // habilitan recién cuando se elige el anterior. Elegir sólo manda eventos del formulario.
  const ELEGIR = {
    caracter: /Representante\s+T/i,
    solicitud: /andamio/i,
    personeria: /jur[ií]dica/i,
    tipo_docum_contacto: /^DU|DOCUMENTO UNICO|DNI/i,
    importante: /^S[ií]$/i,
  };
  const opciones = {};
  // --solo-direccion: saltea desplegables, campos y fechas (ya mapeados el 15/09) y prueba sólo la dirección.
  const SOLO_DIRECCION = process.argv.includes("--solo-direccion");
  for (const [name, elegir] of Object.entries(SOLO_DIRECCION ? {} : ELEGIR)) {
    try {
      const input = iframe.locator(`input[name="${name}"]`).first();
      const id = await input.getAttribute("id", { timeout: 5000 });
      const uuid = id.replace(/-real$/, "");
      const boton = iframe.locator(`#${uuid}-btn`);
      await ((await boton.count()) ? boton : input).click({ timeout: 8000 });
      await page.waitForTimeout(2500);
      const items = iframe.locator(`#${uuid}-pp .z-comboitem`);
      opciones[name] = (await items.allInnerTexts()).map((o) => o.trim()).filter(Boolean);
      console.log(`${name}: ${opciones[name].join(" | ") || "(sin opciones)"}`);
      await foto(`desplegable-${name}`, 300);
      const elegida = opciones[name].find((o) => elegir.test(o));
      if (elegida) {
        await items.filter({ hasText: elegida }).first().click({ timeout: 8000 });
        await page.waitForTimeout(2500);
        console.log(`  → elegido "${elegida}" (queda "${await input.inputValue()}")`);
      } else {
        await page.keyboard.press("Escape");
        console.log("  → ninguna coincide: se cierra sin elegir");
      }
    } catch (e) {
      console.log(`${name}: !! ${e.message.split("\n")[0]}`);
      await page.keyboard.press("Escape").catch(() => {});
    }
    // Un clic en el título del formulario cierra cualquier lista que haya quedado abierta.
    await iframe.locator("body").click({ position: { x: 5, y: 5 }, timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1000);
  }
  await foto("desplegables-elegidos", 500);

  // Todos los campos después de elegir (Persona Jurídica agrega secciones).
  const campos = await iframe.evaluate(() => {
    const visible = (e) => !!(e.offsetParent || e.getClientRects().length);
    const etiqueta = (e) => {
      let p = e.parentElement;
      for (let k = 0; k < 6 && p; k++, p = p.parentElement) {
        const l = [...p.querySelectorAll("label, .z-label")].find((x) => x.innerText.trim());
        if (l) return l.innerText.trim().replace(/\s+/g, " ");
      }
      return null;
    };
    return [...document.querySelectorAll("input[name]")].filter(visible).map((e) => ({
      name: e.name, etiqueta: etiqueta(e), combo: /-real$/.test(e.id), soloLectura: e.readOnly || e.disabled, valor: e.value.trim() || null,
    }));
  });
  if (!SOLO_DIRECCION) {
    writeFileSync(`${DIR}/campos-final.json`, JSON.stringify(campos, null, 2));
    console.log(`\nCampos después de elegir (${campos.length}):`);
    for (const c of campos) console.log(`  ${c.name}${c.combo ? " (desplegable)" : ""}${c.soloLectura ? " (se llena solo)" : ""} · ${c.etiqueta ?? ""}${c.valor ? ` = ${c.valor}` : ""}`);
  }

  // Fechas (datebox ZK): se prueba un valor y se ve si lo acepta o marca error.
  for (const name of SOLO_DIRECCION ? [] : ["fecha_desde_instalado", "fecha_hasta_instalado", "vigencia_seguro"]) {
    const f = iframe.locator(`input[name="${name}"]`).first();
    await f.click({ timeout: 5000 }).catch(() => {});
    await f.fill("15/09/2026").catch(() => {});
    await f.press("Tab").catch(() => {});
    await page.waitForTimeout(1500);
    const error = await iframe.locator(".z-errorbox:visible, .z-errbox:visible").allInnerTexts().catch(() => []);
    console.log(`${name}: queda "${await f.inputValue().catch(() => "")}"${error.length ? ` · error: ${error.join(" | ")}` : ""}`);
  }

  // Calle y Altura también es un desplegable ZK. Las sugerencias son SÓLO calles
  // ("TRELLES, MANUEL R. [601-2300]") y al elegir una el campo queda sin altura (15/09): se elige
  // la calle del catastro y se le agrega la altura después, antes de tocar Autocompletar.
  // Variantes (15/09, tercera ronda): al elegir la sugerencia el campo queda "TRELLES, MANUEL R. "
  // con un espacio al final; agregar " 1086" dejaba doble espacio y Escape revertía el valor.
  const pruebas = [
    { buscar: "TRELLES", calle: /^TRELLES, MANUEL R\./, altura: "1086", modo: "elegir+altura+Tab" },
    { buscar: "TRELLES", calle: /^TRELLES, MANUEL R\./, altura: "1086", modo: "elegir+altura+Enter" },
    { buscar: "TRELLES, MANUEL R. 1086", calle: null, altura: "1086", modo: "tipear-completa+Tab" },
  ];
  const cerrarAvisos = async () => {
    for (const b of await iframe.locator(".z-messagebox-window:visible button, .z-window-modal:visible button").all()) await b.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(800);
  };
  for (const prueba of pruebas) {
    const direccion = `${prueba.buscar} → ${prueba.modo}`;
    try {
      await cerrarAvisos();
      const calle = iframe.locator('input[name="dom_caba_calle"]').first();
      const uuid = (await calle.getAttribute("id")).replace(/-real$/, "");
      const zkAntes = escrituras.length;
      await calle.click({ timeout: 5000 });
      await calle.fill("");
      await calle.pressSequentially(prueba.buscar, { delay: 120 });
      await page.waitForTimeout(4000);
      if (!prueba.calle) {
        await iframe.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
        await calle.press("Tab").catch(() => {});
        await page.waitForTimeout(2000);
        console.log(`\n[${prueba.modo}] antes de Autocompletar el campo dice "${await calle.inputValue()}"`);
        await calle.evaluate((e) => {
          let p = e.parentElement;
          for (let k = 0; k < 6 && p; k++, p = p.parentElement) {
            const b = [...p.querySelectorAll("button")].find((x) => /Autocompletar/i.test(x.innerText));
            if (b) { b.click(); return; }
          }
        });
        await page.waitForTimeout(7000);
        await foto(`direccion-${prueba.modo}`, 300);
        const v = Object.fromEntries(Object.entries(await valores(iframe)).filter(([k]) => k.startsWith("dom_caba")).map(([k, x]) => [k, x.trim()]));
        const avisos = await iframe.locator(".z-messagebox-window:visible").allInnerTexts().catch(() => []);
        console.log(`[${prueba.modo}] ${JSON.stringify(v)}${avisos.length ? ` · aviso: ${avisos.join(" | ").replace(/\s+/g, " ")}` : ""}`);
        for (const w of escrituras.slice(zkAntes).filter((x) => x.zk)) console.log(`   zkau: ${decodeURIComponent(w.cuerpo).slice(0, 300)}`);
        continue;
      }
      const items = iframe.locator(`#${uuid}-pp .z-comboitem`);
      // Las sugerencias traen espacios no comunes (como "Representante Técnico"): se normalizan.
      const sugerencias = (await items.allInnerTexts().catch(() => [])).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
      console.log(`\nSugerencias para "${prueba.buscar}": ${sugerencias.slice(0, 10).join(" | ") || "(ninguna)"}`);
      // Hay dos Trelles ("TRELLES, MANUEL R. [601-2300]" y "… AV. [2301-2800]"): gana la calle
      // cuyo rango de alturas incluye la de la obra.
      const altura = Number(prueba.altura);
      const indice = sugerencias.findIndex((s) => {
        const m = s.match(/^(.*?)\s*\[(\d+)-(\d+)\]$/);
        return m && prueba.calle.test(m[1]) && altura >= Number(m[2]) && altura <= Number(m[3]);
      });
      if (indice < 0) throw new Error("no aparece la calle con ese rango de alturas en las sugerencias");
      const elegida = sugerencias[indice];
      await items.nth(indice).click({ timeout: 5000 });
      await page.waitForTimeout(2500);
      console.log(`Elegida "${elegida}" → el campo queda "${await calle.inputValue()}"`);
      // El campo queda "CALLE " (con espacio): se escribe la altura pegada, sin espacio extra y sin
      // Escape (Escape volvía al texto de la sugerencia).
      await calle.click();
      await calle.press("End");
      const actual = await calle.inputValue();
      await calle.pressSequentially(`${actual.endsWith(" ") ? "" : " "}${prueba.altura}`, { delay: 120 });
      await page.waitForTimeout(2500);
      const tras = (await items.allInnerTexts().catch(() => [])).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
      if (tras.length) console.log(`Sugerencias con la altura: ${tras.slice(0, 5).join(" | ")}`);
      await calle.press(prueba.modo.endsWith("Enter") ? "Enter" : "Tab");
      await page.waitForTimeout(2500);
      console.log(`[${prueba.modo}] antes de Autocompletar el campo dice "${await calle.inputValue()}"`);
      await foto(`direccion-${prueba.modo.replace(/\W+/g, "-")}`, 300);
      await calle.evaluate((e) => {
        let p = e.parentElement;
        for (let k = 0; k < 6 && p; k++, p = p.parentElement) {
          const b = [...p.querySelectorAll("button")].find((x) => /Autocompletar/i.test(x.innerText));
          if (b) { b.click(); return; }
        }
      });
      await page.waitForTimeout(7000);
      await foto(`autocompletar-${direccion.replace(/\W+/g, "-")}`, 300);
      const v = await valores(iframe);
      const dom = Object.fromEntries(Object.entries(v).filter(([k]) => k.startsWith("dom_caba")).map(([k, x]) => [k, x.trim()]));
      const avisos = await iframe.locator(".z-messagebox:visible, .z-window-modal:visible, .z-errorbox:visible").allInnerTexts().catch(() => []);
      console.log(`Autocompletar "${direccion}": ${JSON.stringify(dom)}${avisos.length ? ` · aviso: ${avisos.map((x) => x.replace(/\s+/g, " ").slice(0, 300)).join(" | ")}` : ""}`);
      if (dom.dom_caba_calle_seccion) break;
    } catch (e) {
      console.log(`Autocompletar "${direccion}": !! ${e.message.split("\n")[0]}`);
    }
  }

  writeFileSync(`${DIR}/opciones.json`, JSON.stringify(opciones, null, 2));
  writeFileSync(`${DIR}/iframe-final.html`, await iframe.content());
  void cuerpo;
} catch (e) {
  console.log(`!! ${e.message.split("\n")[0]}`);
  await foto("error", 500).catch(() => {});
} finally {
  writeFileSync(`${DIR}/escrituras-3.json`, JSON.stringify(escrituras, null, 2));
  console.log(`\nBorrador de esta corrida: ${borradorId ?? "(no se vio)"}`);
  const noZk = escrituras.filter((w) => !w.zk && w.bloqueada);
  console.log(`Escrituras: ${escrituras.length} (eventos ZK ${escrituras.filter((w) => w.zk).length}, bloqueadas ${noZk.length})`);
  for (const w of noZk) console.log(`  BLOQUEADA ${w.metodo} ${w.url}\n    ${w.cuerpo.replace(/\s+/g, " ").slice(0, 300)}`);
  await browser.close();
}
