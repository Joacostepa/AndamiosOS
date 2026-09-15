// Mapeo de "Guardar" (formulario Datos del trámite) y "Adjuntar" en TAD, con un borrador de
// prueba. NO PRESENTA: "Confirmar trámite" no se toca nunca.
//
// Qué hace:
//   1. Crea un borrador (llegar al paso 1 lo crea), elige Persona Jurídica.
//   2. Llena el formulario completo con los valores de la carátula presentada de
//      EX-2026-30158135 (datos de ABA) y la obra de Trelles 1086; carga la dirección de la obra y
//      el domicilio comercial con Autocompletar y verifica sección/manzana/parcela.
//   3. Toca "Guardar" y registra qué pasa (mensaje "Formulario guardado!", errores, pedidos).
//   4. Adjunta un PDF de PRUEBA ("PRUEBA — NO PRESENTAR") en "Nota de solicitud" y registra el
//      flujo (selector de archivo, diálogos, cómo queda el casillero, pedidos).
//   El borrador se borra después con robot/borrar-tad-borrador.mjs <id>.
//
// TRABA: desde el paso 2 sólo pasan los eventos del formulario (/zkau) y las escrituras a TAD
// que llevan el id del borrador en la URL o el cuerpo. Cualquier URL con confirmar, caratular,
// presentar o finalizar se bloquea igual. Todo queda registrado.
//
// Correr (con el robot de launchd PARADO):
//   node --env-file=robot/.env.robot robot/mapear-tad-adjuntar.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { abrir, entrar, ir } from "./tad-comun.mjs";

const DIR = "robot/capturas/tad-adjuntar";
mkdirSync(DIR, { recursive: true });

// PDF de prueba, sin datos de nadie.
const pdf = await PDFDocument.create();
const hoja = pdf.addPage([595, 842]);
const fuente = await pdf.embedFont(StandardFonts.HelveticaBold);
hoja.drawText("PRUEBA — NO PRESENTAR", { x: 90, y: 480, size: 36, font: fuente, color: rgb(0.8, 0, 0) });
hoja.drawText("Documento de prueba del robot de AndamiosOS (borrador que se elimina).", { x: 70, y: 440, size: 12, font: fuente });
const ARCHIVO_PRUEBA = `${DIR}/prueba-no-presentar.pdf`;
writeFileSync(ARCHIVO_PRUEBA, await pdf.save());

const { browser, context, page } = await abrir();

let borradorId = null;
let bloquear = false;
const pedidos = [];
const PROHIBIDO = /confirm|caratul|presentar|finaliz/i;
await context.route("**/*", (route) => {
  const req = route.request();
  if (req.method() === "GET" || req.method() === "OPTIONS") return route.continue();
  const url = req.url();
  const cuerpo = req.postData() ?? "";
  const zk = /\/zkau/.test(url);
  const conId = !!borradorId && (url.includes(String(borradorId)) || cuerpo.includes(String(borradorId)));
  const tad = /tad\.buenosaires\.gob\.ar/.test(url);
  let permitido = true;
  if (bloquear && tad) permitido = !PROHIBIDO.test(url) && (zk || conId || /tad2-rest\/sesion\//.test(url));
  if (tad) pedidos.push({ t: new Date().toISOString().slice(11, 19), metodo: req.method(), url, zk, permitido, cuerpo: cuerpo.slice(0, 1200) });
  return permitido ? route.continue() : route.abort("blockedbyclient");
});
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
const normal = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const dd = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

// ── Carga de campos del formulario ZK ──────────────────────────────────────
// Tecla por tecla: con fill() el formulario ZK a veces no registra el valor (15/09: Razón
// social quedó en rojo "No se permite vacío" aunque se veía escrita).
async function texto(frame, name, valor) {
  const input = frame.locator(`input[name="${name}"]`).first();
  await input.click({ timeout: 8000 });
  await input.press("ControlOrMeta+a");
  await input.press("Backspace");
  await input.pressSequentially(valor, { delay: 25 });
  await input.press("Tab");
  await page.waitForTimeout(500);
}
async function desplegable(frame, name, patron) {
  const input = frame.locator(`input[name="${name}"]`).first();
  const uuid = (await input.getAttribute("id", { timeout: 8000 })).replace(/-real$/, "");
  await frame.locator(`#${uuid}-btn`).click({ timeout: 8000 });
  await page.waitForTimeout(1500);
  const items = frame.locator(`#${uuid}-pp .z-comboitem`);
  const textos = (await items.allInnerTexts()).map(normal);
  const i = textos.findIndex((x) => patron.test(x));
  if (i < 0) throw new Error(`${name}: ninguna opción coincide con ${patron} (${textos.join(" | ")})`);
  await items.nth(i).click({ timeout: 8000 });
  await page.waitForTimeout(1200);
  return textos[i];
}
async function fecha(frame, name, valor) {
  const input = frame.locator(`input[name="${name}"]`).first();
  await input.click({ timeout: 8000 });
  await input.fill(valor);
  await input.press("Tab");
  await page.waitForTimeout(800);
}
/**
 * Secuencia verificada el 15/09: primera palabra → sugerencia con el rango → altura → Tab →
 * Autocompletar. Si Autocompletar no llena la sección (p. ej. se perdió una tecla), se repite
 * la dirección entera una vez.
 */
async function direccion(frame, base, buscar, calle, altura) {
  for (let intento = 1; intento <= 2; intento++) {
    const r = await direccionUnaVez(frame, base, buscar, calle, altura);
    if (r.seccion) return r;
    console.log(`${base}: Autocompletar no llenó la sección (intento ${intento}, campo "${r.calle}")`);
  }
  return direccionUnaVez(frame, base, buscar, calle, altura);
}

async function direccionUnaVez(frame, base, buscar, calle, altura) {
  const input = frame.locator(`input[name="${base}"]`).first();
  const uuid = (await input.getAttribute("id")).replace(/-real$/, "");
  await input.click({ timeout: 8000 });
  await input.fill("");
  await input.pressSequentially(buscar, { delay: 120 });
  await page.waitForTimeout(4000);
  const items = frame.locator(`#${uuid}-pp .z-comboitem`);
  const sugerencias = (await items.allInnerTexts()).map(normal);
  const i = sugerencias.findIndex((s) => {
    const m = s.match(/^(.*?)\s*\[(\d+)-(\d+)\]$/);
    return m && calle.test(m[1]) && altura >= Number(m[2]) && altura <= Number(m[3]);
  });
  if (i < 0) throw new Error(`${base}: no hay sugerencia para ${calle} ${altura} (${sugerencias.join(" | ")})`);
  await items.nth(i).click({ timeout: 8000 });
  await page.waitForTimeout(2500);
  // La altura se escribe pegada a "CALLE " y se VERIFICA: el 15/09 se perdió la primera tecla
  // ("TRELLES, MANUEL R. 086") y Autocompletar no encontró nada.
  const calleElegida = (await input.inputValue()).replace(/\s+$/, "");
  const esperado = `${calleElegida} ${altura}`;
  for (let k = 1; k <= 3; k++) {
    await input.click();
    await input.press("End");
    const actual = await input.inputValue();
    if (normal(actual) === esperado) break;
    // Borra lo que sobra después de la calle y reescribe la altura.
    const sobra = actual.length - calleElegida.length;
    for (let b = 0; b < sobra; b++) await input.press("Backspace");
    await page.waitForTimeout(600);
    await input.pressSequentially(` ${altura}`, { delay: 150 });
    await page.waitForTimeout(1500);
  }
  if (normal(await input.inputValue()) !== esperado) {
    return { calle: normal(await input.inputValue()), comuna: "", barrio: "", seccion: "", manzana: "", parcela: "" };
  }
  await input.press("Tab");
  await page.waitForTimeout(2000);
  await input.evaluate((e) => {
    let p = e.parentElement;
    for (let k = 0; k < 6 && p; k++, p = p.parentElement) {
      const b = [...p.querySelectorAll("button")].find((x) => /Autocompletar/i.test(x.innerText));
      if (b) { b.click(); return; }
    }
  });
  await page.waitForTimeout(7000);
  const leer = (s) => frame.locator(`input[name="${base}_${s}"]`).first().inputValue().then(normal);
  return { calle: normal(await input.inputValue()), comuna: await leer("comuna"), barrio: await leer("barrio"), seccion: await leer("seccion"), manzana: await leer("manzana"), parcela: await leer("parcela") };
}

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

  // ── Paso 2: traba puesta ──
  bloquear = true;
  if (!borradorId) throw new Error("No se vio el id del borrador: se corta antes de escribir nada");
  console.log(`Borrador de prueba: ${borradorId}`);

  // Elegir Persona Jurídica genera en TAD un documento por cada casillero nuevo (4 POST
  // generarDocumento). Si se toca "Completar" antes de que terminen, el formulario queda en
  // blanco (15/09): se espera a los 4 y a que la página se calme.
  const generados = () => pedidos.filter((p) => /generarDocumento/.test(p.url)).length;
  await page.getByText("Persona Juridica", { exact: true }).first().click();
  await hasta(async () => generados() >= 4, 60000);
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log(`Documentos generados por Persona Jurídica: ${generados()}`);
  await foto("persona-juridica");

  // El formulario: hasta 60 s; si no dibuja los campos, se vuelve a tocar Completar una vez.
  let f = null;
  for (let intento = 1; intento <= 2 && !f; intento++) {
    await page.locator("button:visible", { hasText: /Completar/i }).first().click();
    f = await hasta(async () => {
      const frame = page.frames().find((x) => /render\/formulario\/display/.test(x.url()) && !x.isDetached());
      return frame && (await frame.locator("input[name]").count()) > 30 ? frame : null;
    }, 60000);
    if (!f) {
      console.log(`Completar (intento ${intento}): el formulario no dibujó los campos`);
      await foto(`formulario-en-blanco-${intento}`, 500);
    }
  }
  if (!f) throw new Error("El formulario Datos del trámite no cargó después de dos intentos");
  // Después de guardar Persona Jurídica, TAD redibuja el iframe y no le recalcula la altura
  // (quedó en ~250 px mostrando sólo "Solicitud"): los clics a los campos de arriba no llegan.
  // Se lo agranda a mano, como estaba antes (3711 px).
  await page.evaluate(() => {
    const iframe = document.querySelector("iframe[id^='caratulaVariable']");
    if (iframe) { iframe.style.height = "4200px"; iframe.style.width = "800px"; }
  });
  await page.waitForTimeout(2000);

  console.log("carácter:", await desplegable(f, "caracter", /Representante\s+T/i));
  console.log("solicitud:", await desplegable(f, "solicitud", /^Andamio$/i));
  console.log("personería:", await desplegable(f, "personeria", /Jur[ií]dica/i));

  const obra = await direccion(f, "dom_caba_calle", "TRELLES", /^TRELLES, MANUEL R\.$/, 1086);
  console.log("obra:", JSON.stringify(obra));
  if (`${obra.seccion}-${obra.manzana}-${obra.parcela}`.toUpperCase() !== "057-035-001A") throw new Error(`La obra no quedó en 057-035-001A: ${JSON.stringify(obra)}`);

  await texto(f, "razon_social", "EMPRENDIMIENTOS Y ESTRUCTURAS S.A.");
  await texto(f, "cuit_razon_social", "30711116504");
  await texto(f, "nombre_1_legal", "JOAQUIN");
  await texto(f, "apellido_1_legal", "STEPANSKY");
  console.log("doc legal:", await desplegable(f, "tipo_docum_legal", /^DU\b/));
  await texto(f, "num_docum_legal", "36684541");
  await texto(f, "tipo_societario", "APODERADO");
  await texto(f, "actividad_principal", "ANDAMIO");
  await texto(f, "cuit_legal", "20366845411");
  await texto(f, "telefono_legal", "1156257054");

  const fiscal = await direccion(f, "dom_fiscal_calle", "MATURIN", /^MATURIN$/, 2570);
  console.log("domicilio comercial:", JSON.stringify(fiscal));
  await texto(f, "dom_fiscal_cp", "1416");

  await texto(f, "nombre_1_contacto", "JOAQUIN");
  await texto(f, "apellido_1_contacto", "STEPANSKY");
  console.log("doc contacto:", await desplegable(f, "tipo_docum_contacto", /^DU\b/));
  await texto(f, "num_docum_contacto", "36684541");
  await texto(f, "cuit_contacto", "20366845411");
  await texto(f, "telefono_contacto", "1156257054");
  await texto(f, "email_contacto", "tam@andamiosbuenosaires.com.ar");

  const hoy = new Date();
  const hasta6 = new Date(hoy); hasta6.setMonth(hasta6.getMonth() + 6);
  await fecha(f, "fecha_desde_instalado", dd(hoy));
  await fecha(f, "fecha_hasta_instalado", dd(hasta6));
  await texto(f, "compania_seguro", "MERCANTIL ANDINA");
  await fecha(f, "vigencia_seguro", "30/06/2027");
  console.log("declaración:", await desplegable(f, "importante", /^S[ií]$/i));
  await foto("formulario-completo", 1000);

  const errores = await f.locator(".z-errorbox:visible").allInnerTexts().catch(() => []);
  if (errores.length) console.log(`Errores antes de guardar: ${errores.map(normal).join(" | ")}`);

  // ── Guardar ──
  // Si el formulario dice "Verifique los datos ingresados en el campo: X", se reescribe X y se
  // vuelve a guardar (hasta 3 veces). La declaración jurada se revisa antes de cada intento.
  const TEXTOS = {
    "Razón social": ["razon_social", "EMPRENDIMIENTOS Y ESTRUCTURAS S.A."],
    CUIT: ["cuit_razon_social", "30711116504"],
    "Tipo Societario": ["tipo_societario", "APODERADO"],
    "Actividad Principal": ["actividad_principal", "ANDAMIO"],
    "Código postal": ["dom_fiscal_cp", "1416"],
    "E-mail": ["email_contacto", "tam@andamiosbuenosaires.com.ar"],
    Compañía: ["compania_seguro", "MERCANTIL ANDINA"],
  };
  const antesGuardar = pedidos.length;
  let guardado = false;
  for (let intento = 1; intento <= 3 && !guardado; intento++) {
    const dj = normal(await f.locator('input[name="importante"]').first().inputValue());
    if (dj !== "Si") console.log(`Declaración jurada vacía ("${dj}"): se vuelve a elegir → ${await desplegable(f, "importante", /^S[ií]$/i)}`);
    await f.locator("button.btn-guardar").first().click({ timeout: 10000 });
    await page.waitForTimeout(8000);
    guardado = await f.locator(".ffcc-guardado").first().isVisible().catch(() => false);
    const pagina = normal(await f.locator("body").innerText());
    const campoMal = pagina.match(/Verifique los datos ingresados en el campo:\s*([^.\n]+?)(?:\s{2,}|$|Guardar)/)?.[1]?.trim();
    const avisos = await f.locator(".z-errorbox:visible, .z-messagebox-window:visible").allInnerTexts().catch(() => []);
    console.log(`Guardar (intento ${intento}) → ${guardado ? "«Formulario guardado!»" : "no guardó"}${campoMal ? ` · campo: ${campoMal}` : ""}${avisos.length ? ` · avisos: ${avisos.map(normal).join(" | ")}` : ""}`);
    if (guardado) break;
    const corregir = campoMal && Object.entries(TEXTOS).find(([etiqueta]) => campoMal.startsWith(etiqueta));
    if (!corregir) break;
    await texto(f, corregir[1][0], corregir[1][1]);
    console.log(`  reescrito ${corregir[1][0]} → "${normal(await f.locator(`input[name="${corregir[1][0]}"]`).first().inputValue())}"`);
  }
  await foto("guardar", 500);
  console.log(`\nGuardar → ${guardado ? "«Formulario guardado!»" : "sin mensaje de guardado"}`);
  const casilleroDatos = normal(await page.locator("body").innerText()).match(/Datos del Trámite.{0,120}/)?.[0];
  console.log(`Casillero Datos del Trámite en la página: ${casilleroDatos}`);
  for (const p of pedidos.slice(antesGuardar).filter((x) => !x.zk)) console.log(`  ${p.permitido ? "permitido" : "BLOQUEADO"} ${p.metodo} ${p.url} ${normal(p.cuerpo).slice(0, 250)}`);

  // ── Adjuntar un PDF de prueba en "Nota de solicitud" ──
  const antesAdjuntar = pedidos.length;
  const fila = page.locator("div.row, li, .documento, div").filter({ has: page.locator(".refiere-doc", { hasText: /^\s*Nota de solicitud dirigida/ }) }).filter({ has: page.locator("button", { hasText: /Adjuntar/ }) }).last();
  // "Adjuntar" abre un diálogo (15/09): «Adjuntá documentación · Nuevo documento | Mis documentos ·
  // Elegí un archivo o arrastrá y soltá · Peso máximo: 20MB · Adjuntar». El archivo va al
  // <input type=file> del diálogo abierto y después se toca su botón Adjuntar.
  const boton = fila.locator("button", { hasText: /Adjuntar/ }).first();
  await boton.click({ timeout: 10000 });
  const dialogo = page.locator(".modal.show").filter({ hasText: /Adjunt[aá] documentaci[oó]n/ }).last();
  await dialogo.waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(1500);
  console.log(`Diálogo abierto: ${normal(await dialogo.innerText()).slice(0, 600)}`);
  const entradas = dialogo.locator("input[type=file]");
  console.log(`Campos de archivo en el diálogo: ${await entradas.count()}`);
  await entradas.first().setInputFiles(ARCHIVO_PRUEBA);
  await page.waitForTimeout(4000);
  await foto("adjuntar-archivo-elegido", 500);
  console.log(`Con el archivo elegido: ${normal(await dialogo.innerText()).slice(0, 600)}`);
  const confirmarAdjunto = dialogo.locator("button:visible").filter({ hasText: /^\s*Adjuntar\s*$/ }).last();
  console.log(`Botón Adjuntar del diálogo: ${(await confirmarAdjunto.count()) ? `habilitado=${await confirmarAdjunto.isEnabled()}` : "no está"}`);
  if (await confirmarAdjunto.count()) {
    await confirmarAdjunto.click({ timeout: 10000 });
    await page.waitForTimeout(10000);
    await foto("adjuntar-despues", 500);
    const abiertos = await page.locator(".modal.show").allInnerTexts().catch(() => []);
    if (abiertos.length) console.log(`Diálogos después: ${abiertos.map(normal).join(" || ").slice(0, 800)}`);
  }
  console.log(`Casillero después: ${normal(await fila.innerText().catch(() => "(no se pudo leer)")).slice(0, 400)}`);
  for (const p of pedidos.slice(antesAdjuntar).filter((x) => !x.zk)) console.log(`  ${p.permitido ? "permitido" : "BLOQUEADO"} ${p.metodo} ${p.url} ${normal(p.cuerpo).slice(0, 250)}`);
  writeFileSync(`${DIR}/paso-2-final.html`, await page.content());
} catch (e) {
  console.log(`!! ${e.message.split("\n")[0]}`);
  await foto("error", 500).catch(() => {});
} finally {
  writeFileSync(`${DIR}/pedidos.json`, JSON.stringify(pedidos, null, 2));
  const bloqueados = pedidos.filter((p) => !p.permitido);
  console.log(`\nBorrador de prueba: ${borradorId ?? "(no se vio)"} — borrarlo con: node --env-file=robot/.env.robot robot/borrar-tad-borrador.mjs ${borradorId ?? "<id>"}`);
  console.log(`Pedidos a TAD: ${pedidos.length} · bloqueados ${bloqueados.length}`);
  for (const p of bloqueados) console.log(`  BLOQUEADO ${p.metodo} ${p.url}\n    ${normal(p.cuerpo).slice(0, 300)}`);
  await browser.close();
}
