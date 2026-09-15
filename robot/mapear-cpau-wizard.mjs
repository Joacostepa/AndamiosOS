// Mapeo del asistente "Nuevo RETP" del CPAU más allá de "Datos Comitente", SIN FINALIZAR.
//
// Para automatizar la encomienda hace falta ver las pantallas que siguen (inmueble, frentes,
// clasificación, actividades, descripción). Llegar ahí obliga a completar los pasos
// anteriores: se cargan los datos de ABA tal cual figuran en un certificado real
// (EX-2026-38891134) y se avanza sólo con "Siguiente".
//
// GARANTÍAS:
//   - Sólo se hace clic en botones cuyo id termina en "NextButton". Nunca Finalizar,
//     Guardar, Confirmar, Comprar ni Pagar.
//   - Si una pantalla tiene obligatorios vacíos que no sabemos completar, se corta ahí.
//   - Cuenta las filas del Histórico ANTES y DESPUÉS: si cambian, lo dice en grande.
//   - Sale con "Cancelar" y cierra la sesión.
//
// ⚠️ Entra con la cuenta del matriculado (Hougassian). Correr sólo con el OK de JS.
//
// Correr: node --env-file=robot/.env.robot robot/mapear-cpau-wizard.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const DIR = "robot/capturas/cpau-mapeo";
mkdirSync(DIR, { recursive: true });

// Datos de ABA como comitente, copiados del certificado de Trelles.
const COMITENTE = {
  ddlComTipoDocId: "Documento Unico",
  txtComNroDoc: "36684541",
  txtComNom: "Joaquin Stepansky",
  txtComDom: "Maturin 2570",
  txtComLoca: "CABA",
  txtComEmpresa: "Emprendimientos y Estructuras S.A.",
  ddlComTipoAcreID: "Reg.Insp.Gral.Just.",
  txtComAcreFecha: "08/10/2008",
  txtComAcreNro: "1809609",
  txtComTelefono: "08103621555",
  txtComCelular: "08103621555",
  txtComMail: "tam@andamiosbuenosaires.com.ar",
};

const PROHIBIDO = /finish|finalizar|guardar|save|confirmar|comprar|pagar|aceptar/i;
let n = 0;

async function foto(page, nombre) {
  n += 1;
  const base = `${DIR}/${String(n).padStart(2, "0")}-${nombre}`;
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${base}.png`, fullPage: true });
  const info = await page.evaluate(() => ({
    url: location.href,
    texto: document.body.innerText,
    campos: [...document.querySelectorAll("input,select,textarea")]
      .filter((e) => e.type !== "hidden")
      .map((e) => ({ id: e.id, type: e.type, valor: e.value, requerido: !!e.closest("tr")?.innerText.trim().startsWith("*"), opciones: e.tagName === "SELECT" ? [...e.options].map((o) => o.text) : undefined })),
    botones: [...document.querySelectorAll("input[type=submit],input[type=button],button,a[id]")].map((b) => `${b.id} "${(b.value || b.innerText || "").trim()}"`),
  }));
  writeFileSync(`${base}.json`, JSON.stringify(info, null, 2));
  console.log(`\n== ${n} ${nombre}\n${info.texto.replace(/©.*$/s, "").replace(/\s*\n\s*/g, "\n").trim().slice(0, 1800)}`);
  console.log("campos:", info.campos.map((c) => `${c.id}${c.valor ? `=${c.valor}` : ""}${c.opciones ? `[${c.opciones.slice(0, 8).join("|")}]` : ""}`).join(", "));
  console.log("botones:", info.botones.join(" · "));
  return info;
}

async function filasHistorico(page) {
  await page.goto("https://retp.cpau.org/FrmHisto.aspx", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  return page.locator("tr").filter({ hasText: /Habilitación\s+\d{8,}/ }).count();
}

async function siguiente(page) {
  const boton = page.locator("input[id$='NextButton']").first();
  const id = (await boton.count()) ? await boton.getAttribute("id") : null;
  if (!id || PROHIBIDO.test(id)) return false;
  await Promise.all([page.waitForLoadState("domcontentloaded").catch(() => {}), boton.click()]);
  return true;
}

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ locale: "es-AR", viewport: { width: 1366, height: 900 } })).newPage();
try {
  await page.goto("https://retp.cpau.org/FrmMain.aspx?ReturnUrl=/", { waitUntil: "domcontentloaded" });
  await page.fill("#ctl05_usernameTextBox", process.env.CPAU_USUARIO);
  await page.fill("#ctl05_passwordTextBox", process.env.CPAU_CLAVE);
  await Promise.all([page.waitForLoadState("domcontentloaded"), page.click("#ctl05_loginButton")]);

  const antes = await filasHistorico(page);
  console.log(`Histórico ANTES: ${antes} encomiendas`);

  await page.goto("https://retp.cpau.org/FrmNewRetp.aspx", { waitUntil: "domcontentloaded" });
  await page.selectOption("#ContentPlaceHolder1_Wizard1_ddlTipoRetpId", { label: "Habilitación" });
  await page.waitForTimeout(2500);
  await page.selectOption("#ContentPlaceHolder1_Wizard1_ddlTipoEncoId", { label: "Habilitación Estructura Transitoria" });
  await foto(page, "1-datos-basicos");
  if (!(await siguiente(page))) throw new Error("No hay Siguiente en Datos Básicos");

  const matricula = await foto(page, "2-datos-matricula");
  if (!matricula.campos.find((c) => c.id.endsWith("txtMatNro"))?.valor) {
    throw new Error("La matrícula no viene cargada: se corta acá para no inventar datos del matriculado");
  }
  if (!(await siguiente(page))) throw new Error("No hay Siguiente en Datos Matrícula");

  await page.waitForTimeout(1500);
  for (const [campo, valor] of Object.entries(COMITENTE)) {
    const sel = `#ContentPlaceHolder1_Wizard1_${campo}`;
    if (campo.startsWith("ddl")) await page.selectOption(sel, { label: valor }).catch((e) => console.log("!!", campo, e.message));
    else await page.fill(sel, valor).catch((e) => console.log("!!", campo, e.message));
  }
  await foto(page, "3-datos-comitente");

  for (let paso = 4; paso <= 10; paso++) {
    if (!(await siguiente(page))) {
      console.log("\nNo hay más 'Siguiente' (probablemente la pantalla final): se corta sin tocar nada.");
      break;
    }
    const info = await foto(page, `${paso}-pantalla`);
    // Un error de validación deja la misma pantalla con un mensaje: ahí se corta.
    if (/obligatorio|requerido|debe ingresar|inválid/i.test(info.texto)) {
      console.log("\nLa pantalla pide datos que este mapeo no completa: se corta acá.");
      break;
    }
  }

  const cancelar = page.locator("input[id$='CancelButton']").first();
  if (await cancelar.count()) await cancelar.click().catch(() => {});
  await page.waitForTimeout(2000);

  const despues = await filasHistorico(page);
  console.log(`\nHistórico DESPUÉS: ${despues} encomiendas`);
  if (despues !== antes) console.log("\n⚠️⚠️⚠️  EL HISTÓRICO CAMBIÓ: revisar en retp.cpau.org si quedó un borrador o un registro  ⚠️⚠️⚠️");
  else console.log("✓ No se creó nada.");
} finally {
  await page.locator("a", { hasText: /Logout/i }).first().click().catch(() => {});
  await browser.close();
}
