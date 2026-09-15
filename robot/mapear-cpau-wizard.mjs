// Mapeo del asistente "Nuevo RETP" del CPAU más allá de "Datos Comitente", SIN FINALIZAR.
//
// Para automatizar la encomienda hace falta ver las pantallas que siguen (inmueble, frentes,
// clasificación, actividades, descripción). Llegar ahí obliga a completar los pasos
// anteriores: se cargan los datos tal cual figuran en un certificado real
// (EX-2026-38891134, Trelles) y se avanza sólo con "Siguiente".
//
// GARANTÍAS:
//   - Sólo se hace clic en botones cuyo id termina en "NextButton" Y cuyo texto no es
//     Finalizar, Guardar, Confirmar, Comprar, Pagar ni Aceptar.
//   - Desde "Otros Comitentes" el botón CancelButton dice "Guardar Borrador": NUNCA se toca.
//     Para salir se abandona la página yendo al Histórico.
//   - Si una pantalla tiene obligatorios vacíos que no sabemos completar, se corta ahí.
//   - Compara el Histórico (TODAS las filas por R.Nro, también las que no tienen RETP Nro,
//     que son los intentos sin confirmar) ANTES y DESPUÉS.
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

// Datos Inmueble del mismo certificado (el propietario es el titular del lote).
const INMUEBLE = {
  ddlPropietarioTipoDocId: "CUIT/CUIL",
  txtPropietarioNroDoc: "30641067950",
  txtPropietarioNombre: "CONS PROP TRELLES 1084 86 88 GAONA 2402",
  txtInmCP: "0",
};

// Frente del certificado: calle del catálogo del CPAU (sus ids no son los de USIG).
const FRENTE = { buscar: "TRELLES", calleId: "1478", nombre: "TRELLES MANUEL RICARDO", desde: "1084", hasta: "1088" };

// Pantallas que sabemos completar, por el título que muestra el asistente.
// Clasificación: Tipo SRP, Destino ADM, Clase HA y Zona G1 vienen preseleccionados; sólo la
// superficie (Trelles: 8 ml × 4 = 32 m²).
const COMPLETAR = {
  "Datos Inmueble": INMUEBLE,
  "Clasificación": { txtSuperficie: "32" },
  "Descripción Tareas": { txtTareasDes: "Pantalla de protección peatonal de 8 mts lineales." },
};

const PROHIBIDO = /finish|finalizar|guardar|borrador|save|confirmar|comprar|pagar|aceptar/i;
let n = 0;

async function foto(page, nombre) {
  n += 1;
  const base = `${DIR}/${String(n).padStart(2, "0")}-${nombre}`;
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${base}.png`, fullPage: true });
  const info = await page.evaluate(() => ({
    url: location.href,
    titulo: document.querySelector("[id*='Wizard1'] h1, [id*='Wizard1'] h2, [id*='Wizard1'] h3, .titulo, legend + * b")?.innerText?.trim() ?? null,
    texto: document.body.innerText,
    campos: [...document.querySelectorAll("input,select,textarea")]
      .filter((e) => e.type !== "hidden")
      .map((e) => ({ id: e.id, type: e.type, valor: e.value, opciones: e.tagName === "SELECT" ? [...e.options].map((o) => `${o.value}=${o.text}`) : undefined })),
    botones: [...document.querySelectorAll("input[type=submit],input[type=button],input[type=image],button,a[id]")].map((b) => `${b.id} "${(b.value || b.innerText || "").trim()}"`),
  }));
  writeFileSync(`${base}.json`, JSON.stringify(info, null, 2));
  writeFileSync(`${base}.html`, await page.content());
  console.log(`\n== ${n} ${nombre}\n${info.texto.replace(/©.*$/s, "").replace(/\s*\n\s*/g, "\n").trim().slice(0, 2500)}`);
  console.log("campos:", info.campos.map((c) => `${c.id}${c.valor ? `=${c.valor}` : ""}${c.opciones ? `[${c.opciones.slice(0, 12).join("|")}${c.opciones.length > 12 ? `|…(${c.opciones.length})` : ""}]` : ""}`).join(", "));
  console.log("botones:", info.botones.join(" · "));
  return info;
}

async function filasHistorico(page) {
  await page.goto("https://retp.cpau.org/FrmHisto.aspx", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const textos = await page.locator("tr").evaluateAll((trs) => trs.map((t) => t.innerText.replace(/\s+/g, " ").trim()));
  return textos.map((t) => t.match(/^(\d{11}) /)?.[1]).filter(Boolean);
}

async function siguiente(page) {
  const boton = page.locator("input[id$='NextButton']").first();
  if (!(await boton.count())) return false;
  const id = await boton.getAttribute("id");
  const texto = (await boton.getAttribute("value")) ?? "";
  if (PROHIBIDO.test(id) || PROHIBIDO.test(texto) || !/siguiente/i.test(texto)) {
    console.log(`\n(no se toca el botón ${id} "${texto.trim()}")`);
    return false;
  }
  await Promise.all([page.waitForLoadState("domcontentloaded").catch(() => {}), boton.click()]);
  return true;
}

async function completar(page, valores) {
  for (const [campo, valor] of Object.entries(valores)) {
    const sel = `#ContentPlaceHolder1_Wizard1_${campo}`;
    if (campo.startsWith("ddl")) await page.selectOption(sel, { label: valor }).catch((e) => console.log("!!", campo, e.message));
    else await page.fill(sel, valor).catch((e) => console.log("!!", campo, e.message));
    await page.waitForTimeout(300);
  }
}

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ locale: "es-AR", viewport: { width: 1366, height: 900 } })).newPage();
let antes = null;
try {
  await page.goto("https://retp.cpau.org/FrmMain.aspx?ReturnUrl=/", { waitUntil: "domcontentloaded" });
  await page.fill("#ctl05_usernameTextBox", process.env.CPAU_USUARIO);
  await page.fill("#ctl05_passwordTextBox", process.env.CPAU_CLAVE);
  await Promise.all([page.waitForLoadState("domcontentloaded"), page.click("#ctl05_loginButton")]);

  antes = await filasHistorico(page);
  console.log(`Histórico ANTES: ${antes.length} filas, la más nueva ${antes[0]}`);

  await page.goto("https://retp.cpau.org/FrmNewRetp.aspx", { waitUntil: "domcontentloaded" });
  await page.selectOption("#ContentPlaceHolder1_Wizard1_ddlTipoRetpId", { label: "Habilitación" });
  await page.waitForTimeout(2500);
  await page.selectOption("#ContentPlaceHolder1_Wizard1_ddlTipoEncoId", { label: "Habilitación Estructura Transitoria" });
  await foto(page, "datos-basicos");
  if (!(await siguiente(page))) throw new Error("No hay Siguiente en Datos Básicos");

  const matricula = await foto(page, "datos-matricula");
  if (!matricula.campos.find((c) => c.id.endsWith("txtMatNro"))?.valor) {
    throw new Error("La matrícula no viene cargada: se corta acá para no inventar datos del matriculado");
  }
  if (!(await siguiente(page))) throw new Error("No hay Siguiente en Datos Matrícula");

  await page.waitForTimeout(1500);
  await completar(page, COMITENTE);
  await foto(page, "datos-comitente");

  for (let paso = 4; paso <= 12; paso++) {
    if (!(await siguiente(page))) {
      console.log("\nNo hay más 'Siguiente' permitido: se corta sin tocar nada.");
      break;
    }
    await page.waitForTimeout(1500);
    const cuerpo = await page.locator("body").innerText();
    if (/es Obligatorio|debe ingresar|inválid|requiere/i.test(cuerpo)) {
      await foto(page, `${paso}-validacion`);
      console.log("\nLa pantalla pide datos que este mapeo no completa: se corta acá.");
      break;
    }
    // La pantalla Confirmar repite todos los títulos en el resumen: ahí no se completa nada.
    const esConfirmar = (await page.locator("input[id$='FinishButton']").count()) > 0;
    const titulo = esConfirmar ? null : Object.keys(COMPLETAR).find((t) => cuerpo.includes(t));
    await foto(page, `${paso}-pantalla`);
    if (titulo) {
      await completar(page, COMPLETAR[titulo]);
      await foto(page, `${paso}-completada`);
    }
    // Frentes: "Buscar" llena el desplegable de calles del catálogo del CPAU y "Agregar" suma
    // la fila a la grilla del asistente (no guarda nada fuera de la sesión).
    if (cuerpo.includes("Calle a Buscar")) {
      await page.fill("#ContentPlaceHolder1_Wizard1_txttexttofindcalles", FRENTE.buscar);
      await Promise.all([page.waitForLoadState("domcontentloaded").catch(() => {}), page.click("#ContentPlaceHolder1_Wizard1_cmdFindCalle")]);
      await page.waitForTimeout(2500);
      const calles = await foto(page, `${paso}-calles-encontradas`);
      const opciones = calles.campos.find((c) => c.id.endsWith("ddlCalleId"))?.opciones ?? [];
      const opcion = opciones.find((o) => o.startsWith(`${FRENTE.calleId}=`) || o.includes(FRENTE.nombre));
      if (!opcion) {
        console.log(`\nNo aparece la calle ${FRENTE.calleId} ${FRENTE.nombre}: se corta acá.`);
        break;
      }
      await page.selectOption("#ContentPlaceHolder1_Wizard1_ddlCalleId", opcion.split("=")[0]);
      await page.fill("#ContentPlaceHolder1_Wizard1_txtAlturaDesde", FRENTE.desde);
      await page.fill("#ContentPlaceHolder1_Wizard1_txtAlturaHasta", FRENTE.hasta);
      await Promise.all([page.waitForLoadState("domcontentloaded").catch(() => {}), page.click("#ContentPlaceHolder1_Wizard1_cmdAddCalle")]);
      await page.waitForTimeout(2500);
      await foto(page, `${paso}-frente-agregado`);
    }
    // Actividades: HAB / HET / M2 vienen elegidos; se carga la superficie y "Agregar" suma la fila.
    if (cuerpo.includes("Detalle de Servicio")) {
      await page.fill("#ContentPlaceHolder1_Wizard1_txtValor", "32");
      await Promise.all([page.waitForLoadState("domcontentloaded").catch(() => {}), page.click("#ContentPlaceHolder1_Wizard1_cmdAddActividades")]);
      await page.waitForTimeout(2500);
      await foto(page, `${paso}-actividad-agregada`);
    }
  }
} finally {
  // Salir SIN tocar CancelButton (a esta altura dice "Guardar Borrador").
  const despues = await filasHistorico(page).catch(() => null);
  if (despues && antes) {
    console.log(`\nHistórico DESPUÉS: ${despues.length} filas, la más nueva ${despues[0]}`);
    const nuevas = despues.filter((r) => !antes.includes(r));
    if (nuevas.length) console.log(`\n⚠️⚠️⚠️  FILAS NUEVAS EN EL HISTÓRICO: ${nuevas.join(", ")} — revisar en retp.cpau.org  ⚠️⚠️⚠️`);
    else console.log("✓ No se creó nada.");
  } else console.log("\n⚠️ No se pudo comparar el Histórico: revisar a mano.");
  await page.locator("a", { hasText: /Logout/i }).first().click().catch(() => {});
  await browser.close();
}
