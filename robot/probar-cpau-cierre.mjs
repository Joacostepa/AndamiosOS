// Prueba del cierre de la encomienda del CPAU SIN PAGAR NI ENVIAR NADA (robot/cpau-cierre.mjs).
//
//   firma <R.Nro>                  baja el registro ("ver") del Histórico y lo firma → robot/capturas/cpau-cierre-prueba/
//   plataforma <R.Nro> <operación>  completa los 3 pasos de tramites.cpau.org con ese registro firmado y un
//                                  comprobante de prueba, y NO toca «Enviar»
//   pago                           completa la compra hasta el formulario de Decidir con la tarjeta y NO toca
//                                  «Aceptar» (deja una intención de pago sin pagar en la tienda, como el mapeo)
//   mail <R.Nro>                   busca el certificado de ese R.Nro en permisos-andamio@ (últimos 30 días).
//                                  Saca el frente de la tarea cpau_encomienda con ese R.Nro (sólo lee la
//                                  base): el certificado nuevo (11/2026) no trae el R.Nro y se reconoce
//                                  por el inmueble. No carga nada.
//
// Correr (sin tareas del CPAU en curso en el robot):
//   node --env-file=.env.local --env-file=robot/.env.robot robot/probar-cpau-cierre.mjs firma 00329522116
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { bajarRegistro, buscarCertificadoEnMail, cargarEnPlataforma, firmarRegistro, pagarEncomienda } from "./cpau-cierre.mjs";

const [modo, registro, operacion] = process.argv.slice(2);
const DIR = "robot/capturas/cpau-cierre-prueba";
mkdirSync(DIR, { recursive: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let n = 0;
const fotoDe = (page) => async (nombre) => {
  n += 1;
  await page.screenshot({ path: `${DIR}/${String(n).padStart(2, "0")}-${nombre.replace(/\W+/g, "-")}.png`, fullPage: true }).catch(() => {});
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: "es-AR", viewport: { width: 1366, height: 900 }, acceptDownloads: true });
try {
  if (modo === "firma") {
    const page = await context.newPage();
    await page.goto("https://retp.cpau.org/FrmMain.aspx?ReturnUrl=/", { waitUntil: "domcontentloaded" });
    await page.fill("#ctl05_usernameTextBox", process.env.CPAU_USUARIO);
    await page.fill("#ctl05_passwordTextBox", process.env.CPAU_CLAVE);
    await Promise.all([page.waitForLoadState("domcontentloaded"), page.click("#ctl05_loginButton")]);
    const sinFirmas = await bajarRegistro({ page, registro });
    writeFileSync(`${DIR}/registro-${registro}.pdf`, sinFirmas);
    const firmado = await firmarRegistro({ db, registro: sinFirmas });
    writeFileSync(`${DIR}/registro-${registro}-firmado.pdf`, firmado);
    console.log(`registro ${sinFirmas.length} bytes → firmado ${firmado.length} bytes en ${DIR}`);
  } else if (modo === "plataforma") {
    const ruta = `${DIR}/registro-${registro}-firmado.pdf`;
    if (!existsSync(ruta)) throw new Error(`Primero: firma ${registro}`);
    const prueba = await PDFDocument.create();
    const hoja = prueba.addPage([595, 842]);
    hoja.drawText("COMPROBANTE DE PRUEBA - NO ENVIAR", { x: 60, y: 780, size: 18, font: await prueba.embedFont(StandardFonts.Helvetica) });
    const r = await cargarEnPlataforma({
      context, registro, registroFirmado: readFileSync(ruta), operacion: operacion ?? "292118",
      comprobante: Buffer.from(await prueba.save()), enviar: false,
      foto: async (nombre) => { const p = context.pages().at(-1); if (p) await fotoDe(p)(nombre); },
    });
    console.log("plataforma:", r);
  } else if (modo === "pago") {
    const r = await pagarEncomienda({
      context, pagar: false,
      foto: async (nombre) => { const p = context.pages().at(-1); if (p) await fotoDe(p)(nombre); },
    });
    console.log("pago (sin Aceptar):", r);
  } else if (modo === "mail") {
    const largo = String(registro ?? "").replace(/\D/g, "").padStart(11, "0");
    const { data: tarea, error } = await db.from("pvp_tareas").select("id, payload, resultado")
      .eq("tipo", "cpau_encomienda").eq("resultado->>registro", largo).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(`No se pudo leer la tarea del R.Nro ${largo}: ${error.message}`);
    if (!tarea) console.log(`No hay tarea cpau_encomienda con R.Nro ${largo}: sólo se reconoce el formato viejo.`);
    const encomienda = { registro: largo, frente: tarea?.payload?.frente ?? null, calle_cpau: tarea?.resultado?.calle_cpau ?? null };
    console.log(`tarea ${tarea?.id ?? "—"} · frente`, encomienda.frente, "· calle CPAU", encomienda.calle_cpau);
    const r = await buscarCertificadoEnMail({ encomienda, desde: new Date(Date.now() - 30 * 86_400_000), log: console.log });
    console.log("mail:", r ? { nombre: r.nombre, mail: r.mail, formato: r.formato, retp: r.retp, inmueble: r.inmueble, chequeos: r.chequeos, bytes: r.pdf.length } : "no llegó");
  } else {
    console.log("Modos: firma <R.Nro> · plataforma <R.Nro> [operación] · pago · mail <R.Nro>");
  }
} finally {
  await browser.close();
}
