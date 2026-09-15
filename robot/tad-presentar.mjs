// Robot de TAD — presenta el permiso de andamio: formulario, adjuntos y "Confirmar trámite".
//
// LO TOMA EL WORKER (worker-tad.mjs) como tarea `tad_presentar`, con la MISMA sesión de TAD
// (dos sesiones de la cuenta miBA se pisan). El payload lo arma la app
// (src/lib/permisos-via-publica/presentacion.ts).
//
// AUTOMÁTICO, SIN APROBACIÓN (JS, 2026-09-15). En lugar del clic de una persona, frena ante
// cualquier cosa que no coincide:
//   - la dirección tiene que dar en TAD la sección/manzana/parcela del catastro;
//   - el formulario tiene que quedar guardado (casillero "Datos del Trámite" con "Editar");
//   - cada adjunto tiene que terminar bien (personaDocumento/save sin error). NO se reintenta:
//     cada adjunto crea un IF oficial en GDE;
//   - si después de "Confirmar trámite" no aparece un EX, error (revisar TAD a mano).
// Nada de esto se reintenta solo: la tarea queda en error y el trámite "trabado".
//
// PRUEBA (payload.es_prueba): llena y guarda el formulario, verifica la dirección y BORRA el
// borrador. No elige Persona Jurídica, no adjunta, no presenta.
//
// Todo lo aprendido del formulario: docs/modulo-gestoria-permisos.md § "Presentación en TAD".
import os from "node:os";
import path from "node:path";
import { mkdirSync, writeFileSync, statSync, readFileSync, existsSync, renameSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PDFDocument } from "pdf-lib";
import { ir, esperarCarga } from "./tad-comun.mjs";

const BUCKET = "permisos-via-publica";
const TMP = path.join(os.tmpdir(), "andamios-tad-presentar");
const MAX_BYTES = 20 * 1024 * 1024; // "Peso máximo: 20MB" del diálogo de TAD

// Datos de ABA tal cual la carátula presentada de EX-2026-30158135.
const ABA = {
  razon_social: "EMPRENDIMIENTOS Y ESTRUCTURAS S.A.",
  cuit_razon_social: "30711116504",
  nombre_1_legal: "JOAQUIN",
  apellido_1_legal: "STEPANSKY",
  num_docum_legal: "36684541",
  tipo_societario: "APODERADO",
  actividad_principal: "ANDAMIO",
  cuit_legal: "20366845411",
  telefono_legal: "1156257054",
  nombre_1_contacto: "JOAQUIN",
  apellido_1_contacto: "STEPANSKY",
  num_docum_contacto: "36684541",
  cuit_contacto: "20366845411",
  telefono_contacto: "1156257054",
  email_contacto: "tam@andamiosbuenosaires.com.ar",
  dom_fiscal_cp: "1416",
};
const DOMICILIO_COMERCIAL = { buscar: "MATURIN", calle: "MATURIN", altura: 2570, smp: "059-100-041B" };

// Etiqueta que muestra "Verifique los datos ingresados en el campo: X" → campos con esa
// etiqueta. Varias se repiten (representante legal y contacto): se fuerzan todos. Las más
// largas primero, para que "CUIT/CUIL" no caiga en "CUIT".
const ETIQUETA_A_CAMPOS = {
  "CUIT/CUIL": ["cuit_legal", "cuit_contacto"],
  "Razón social": ["razon_social"],
  "Tipo Societario": ["tipo_societario"],
  "Actividad Principal": ["actividad_principal"],
  "Código postal": ["dom_fiscal_cp"],
  "E-mail": ["email_contacto"],
  "N° de documento": ["num_docum_legal", "num_docum_contacto"],
  "Teléfono": ["telefono_legal", "telefono_contacto"],
  "Primer nombre": ["nombre_1_legal", "nombre_1_contacto"],
  "Primer apellido": ["apellido_1_legal", "apellido_1_contacto"],
  "Compañía": ["compania_seguro"],
  CUIT: ["cuit_razon_social"],
};

const normal = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const mayus = (s) => normal(s).toUpperCase();
const dd = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ex = (texto) => texto.match(/EX-(\d{4})-(\d{6,})-\s*-GCABA-([A-Z]+)/);

export class Trabado extends Error {}

// ── Archivos ────────────────────────────────────────────────────────────────

async function unirEnPdf(partes) {
  const salida = await PDFDocument.create();
  for (const { bytes, nombre } of partes) {
    const ext = nombre.toLowerCase().split(".").pop();
    if (ext === "pdf") {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      for (const pagina of await salida.copyPages(doc, doc.getPageIndices())) salida.addPage(pagina);
    } else if (["jpg", "jpeg", "png"].includes(ext)) {
      const img = ext === "png" ? await salida.embedPng(bytes) : await salida.embedJpg(bytes);
      const escala = Math.min(1, 595 / img.width, 842 / img.height);
      const hoja = salida.addPage([595, 842]);
      hoja.drawImage(img, { x: (595 - img.width * escala) / 2, y: (842 - img.height * escala) / 2, width: img.width * escala, height: img.height * escala });
    } else {
      throw new Trabado(`No se puede unir "${nombre}" en un PDF (formato ${ext})`);
    }
  }
  return salida.save();
}

const ejecutar = promisify(execFile);
const QPDF = existsSync("/opt/homebrew/bin/qpdf") ? "/opt/homebrew/bin/qpdf" : "qpdf";

/**
 * TAD NO acepta PDFs encriptados, ni siquiera los que sólo tienen protección de permisos (se
 * abren sin clave): "Error generando documento PDF, en importación: PdfReader not opened with
 * owner password" (S02466, póliza de La Mercantil Andina, 15/09). Se les saca la protección con
 * qpdf (`brew install qpdf`); el contenido no cambia. Devuelve si hubo que hacerlo.
 */
async function sinProteccion(archivo) {
  if (!/\/Encrypt\b/.test(readFileSync(archivo).toString("latin1"))) return false;
  const salida = archivo.replace(/\.pdf$/i, "") + "-sin-proteccion.pdf";
  try {
    await ejecutar(QPDF, ["--decrypt", archivo, salida]);
  } catch (e) {
    // qpdf sale con código 3 cuando sólo hubo advertencias: el archivo igual se escribe.
    if (!existsSync(salida)) {
      throw new Trabado(`"${path.basename(archivo)}" está encriptado y TAD no lo acepta; no se le pudo sacar la protección (${e.code === "ENOENT" ? "falta qpdf en la Mac: brew install qpdf" : String(e.message).split("\n")[0]})`);
    }
  }
  renameSync(salida, archivo);
  return true;
}

/** Baja del bucket los archivos de cada casillero. Uno va tal cual; varios se unen en un PDF. */
async function prepararAdjuntos(db, payload, tareaId) {
  const dir = path.join(TMP, String(tareaId));
  mkdirSync(dir, { recursive: true });
  const listos = [];
  for (const [i, a] of payload.adjuntos.entries()) {
    if (!a.archivos.length) throw new Trabado(`El casillero "${a.casillero}" no tiene archivo`);
    const partes = [];
    for (const [k, f] of a.archivos.entries()) {
      const { data, error } = await db.storage.from(BUCKET).download(f.path);
      if (error || !data) throw new Trabado(`No se pudo bajar ${f.nombre}: ${error?.message ?? "sin datos"}`);
      let bytes = new Uint8Array(await data.arrayBuffer());
      const nombre = f.nombre || f.path;
      // Un PDF protegido se desprotege antes de adjuntarlo o de unirlo con otros.
      if (/\.pdf$/i.test(nombre)) {
        const tmp = path.join(dir, `parte-${i + 1}-${k + 1}.pdf`);
        writeFileSync(tmp, bytes);
        if (await sinProteccion(tmp)) bytes = new Uint8Array(readFileSync(tmp));
      }
      partes.push({ bytes, nombre });
    }
    let destino;
    if (partes.length === 1) {
      const ext = (partes[0].nombre.split(".").pop() || "pdf").toLowerCase();
      destino = path.join(dir, `${String(i + 1).padStart(2, "0")}-${a.archivos[0].clave}.${ext}`);
      writeFileSync(destino, partes[0].bytes);
    } else {
      destino = path.join(dir, `${String(i + 1).padStart(2, "0")}-${a.archivos.map((f) => f.clave).join("+")}.pdf`);
      writeFileSync(destino, await unirEnPdf(partes));
    }
    if (statSync(destino).size > MAX_BYTES) throw new Trabado(`"${a.casillero}" pesa más de 20 MB`);
    listos.push({ casillero: a.casillero, archivo: destino });
  }
  return listos;
}

// ── Formulario (iframe ZK) ──────────────────────────────────────────────────

async function hasta(page, fn, ms) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    const r = await fn().catch(() => null);
    if (r) return r;
    await page.waitForTimeout(1000);
  }
  return null;
}

// Tecla por tecla: con fill() el formulario no registró "Razón social" (15/09).
async function texto(page, f, name, valor) {
  const input = f.locator(`input[name="${name}"]`).first();
  await input.click({ timeout: 10000 });
  await input.press("ControlOrMeta+a");
  await input.press("Backspace");
  await input.pressSequentially(String(valor), { delay: 25 });
  await input.press("Tab");
  await page.waitForTimeout(500);
}

/**
 * Compara lo que el formulario ZK tiene REGISTRADO en cada campo de texto con lo esperado y
 * corrige por la API de ZK (setValue + fireOnChange) lo que no coincide. Hace falta porque a
 * veces el campo muestra el texto tipeado pero el widget no lo tomó: el 15/09 "Razón social" y
 * "CUIT/CUIL" quedaron en rojo "No se permite vacío" con el valor a la vista, y reescribirlos
 * con el teclado no alcanzó (el clic caía en otro campo). Devuelve los campos corregidos.
 */
async function sincronizarZk(f, valores) {
  return f.evaluate((vals) => {
    const corregidos = [];
    for (const [name, valor] of Object.entries(vals)) {
      const el = document.querySelector(`input[name="${name}"]`);
      const w = el && window.zk ? window.zk.Widget.$(el) : null;
      if (!w || String(w.getValue() ?? "") === valor) continue;
      w.setValue(valor);
      if (typeof w.clearErrorMessage === "function") w.clearErrorMessage(true);
      if (typeof w.fireOnChange === "function") w.fireOnChange({});
      else w.fire("onChange", { value: valor }, { toServer: true });
      corregidos.push(name);
    }
    return corregidos;
  }, valores);
}

async function desplegable(page, f, name, patron) {
  const input = f.locator(`input[name="${name}"]`).first();
  const uuid = (await input.getAttribute("id", { timeout: 10000 })).replace(/-real$/, "");
  await f.locator(`#${uuid}-btn`).click({ timeout: 10000 });
  await page.waitForTimeout(1500);
  const items = f.locator(`#${uuid}-pp .z-comboitem`);
  const textos = (await items.allInnerTexts()).map(normal);
  const i = textos.findIndex((x) => patron.test(x));
  if (i < 0) throw new Trabado(`"${name}": ninguna opción coincide (${textos.join(" | ")})`);
  await items.nth(i).click({ timeout: 10000 });
  await page.waitForTimeout(1200);
}

/** Primera palabra → sugerencia con el rango de la altura → altura verificada → Tab → Autocompletar. */
async function direccionUnaVez(page, f, base, d) {
  const input = f.locator(`input[name="${base}"]`).first();
  const uuid = (await input.getAttribute("id")).replace(/-real$/, "");
  await input.click({ timeout: 10000 });
  await input.fill("");
  await input.pressSequentially(d.buscar, { delay: 120 });
  await page.waitForTimeout(4000);
  const items = f.locator(`#${uuid}-pp .z-comboitem`);
  const sugerencias = (await items.allInnerTexts()).map(normal);
  const i = sugerencias.findIndex((s) => {
    const m = s.match(/^(.*?)\s*\[(\d+)-(\d+)\]$/);
    return m && mayus(m[1]) === mayus(d.calle) && d.altura >= Number(m[2]) && d.altura <= Number(m[3]);
  });
  if (i < 0) throw new Trabado(`TAD no ofrece "${d.calle}" con la altura ${d.altura} (${sugerencias.join(" | ") || "sin sugerencias"})`);
  await items.nth(i).click({ timeout: 10000 });
  await page.waitForTimeout(2500);
  // Al elegir la sugerencia el campo queda "CALLE " (con espacio). La altura se escribe PEGADA,
  // sin Backspace: borrar hace que el formulario vuelva a filtrar y puede perder la calle
  // elegida (el 15/09 la prueba por la cola quedó bien escrita y Autocompletar respondió "No se
  // obtuvieron resultados"). Sólo si no quedó igual se reescribe todo.
  const actual = await input.inputValue();
  const calle = actual.replace(/\s+$/, "");
  const esperado = `${calle} ${d.altura}`;
  await input.click();
  await input.press("End");
  await input.pressSequentially(`${actual.endsWith(" ") ? "" : " "}${d.altura}`, { delay: 150 });
  await page.waitForTimeout(2000);
  if (normal(await input.inputValue()) !== esperado) {
    await input.press("ControlOrMeta+a");
    await input.pressSequentially(esperado, { delay: 120 });
    await page.waitForTimeout(2500);
  }
  if (normal(await input.inputValue()) !== esperado) return null;
  await input.press("Tab");
  await page.waitForTimeout(3000);

  const leer = (s) => f.locator(`input[name="${base}_${s}"]`).first().inputValue().then(normal);
  const autocompletar = () => input.evaluate((e) => {
    let p = e.parentElement;
    for (let k = 0; k < 6 && p; k++, p = p.parentElement) {
      const b = [...p.querySelectorAll("button")].find((x) => /Autocompletar/i.test(x.innerText));
      if (b) { b.click(); return; }
    }
  });
  const sinResultados = () => f.locator(".z-errorbox:visible").filter({ hasText: /No se obtuvieron resultados/ });
  // Autocompletar consulta al servidor: se espera hasta 15 s a que aparezca la sección y, si
  // responde "No se obtuvieron resultados", se cierra el aviso y se prueba una vez más.
  for (let vez = 1; vez <= 2; vez++) {
    await autocompletar();
    await hasta(page, async () => (await leer("seccion")) || (await sinResultados().count()), 15000);
    if (await leer("seccion")) break;
    await sinResultados().locator(".z-errorbox-close").first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(3000);
  }
  return { calle: normal(await input.inputValue()), comuna: await leer("comuna"), barrio: await leer("barrio"), smp: `${await leer("seccion")}-${await leer("manzana")}-${await leer("parcela")}`.toUpperCase() };
}

async function direccion(page, f, base, d) {
  let r = null;
  for (let intento = 1; intento <= 2 && !(r && r.smp === d.smp); intento++) r = await direccionUnaVez(page, f, base, d);
  if (!r || r.smp !== d.smp) {
    throw new Trabado(`La dirección ${d.calle} ${d.altura} no dio en TAD la parcela del catastro (esperada ${d.smp}, TAD dijo ${r ? `${r.smp} · ${r.barrio}` : "nada"})`);
  }
  return r;
}

async function abrirFormulario(page) {
  let f = null;
  for (let intento = 1; intento <= 2 && !f; intento++) {
    await page.locator("button:visible", { hasText: /Completar|Editar/i }).first().click({ timeout: 15000 });
    f = await hasta(page, async () => {
      const frame = page.frames().find((x) => /render\/formulario\/display/.test(x.url()) && !x.isDetached());
      return frame && (await frame.locator("input[name]").count()) > 30 ? frame : null;
    }, 60000);
  }
  if (!f) throw new Trabado("El formulario Datos del trámite no cargó");
  // Después de Persona Jurídica el iframe queda de ~250 px y los clics no llegan.
  await page.evaluate(() => {
    const i = document.querySelector("iframe[id^='caratulaVariable']");
    if (i) { i.style.height = "4200px"; i.style.width = "800px"; }
  });
  await page.waitForTimeout(2000);
  return f;
}

async function llenarYGuardar(page, f, p, log) {
  await desplegable(page, f, "caracter", /Representante\s+T/i);
  await desplegable(page, f, "solicitud", /^Andamio$/i);
  await desplegable(page, f, "personeria", /Jur[ií]dica/i);
  const obra = await direccion(page, f, "dom_caba_calle", p.obra);
  log(`TAD: obra ${obra.calle} → ${obra.barrio}, ${obra.comuna}, ${obra.smp}`);

  for (const campo of ["razon_social", "cuit_razon_social", "nombre_1_legal", "apellido_1_legal"]) await texto(page, f, campo, ABA[campo]);
  await desplegable(page, f, "tipo_docum_legal", /^DU\b/);
  for (const campo of ["num_docum_legal", "tipo_societario", "actividad_principal", "cuit_legal", "telefono_legal"]) await texto(page, f, campo, ABA[campo]);
  await direccion(page, f, "dom_fiscal_calle", DOMICILIO_COMERCIAL);
  await texto(page, f, "dom_fiscal_cp", ABA.dom_fiscal_cp);
  for (const campo of ["nombre_1_contacto", "apellido_1_contacto"]) await texto(page, f, campo, ABA[campo]);
  await desplegable(page, f, "tipo_docum_contacto", /^DU\b/);
  for (const campo of ["num_docum_contacto", "cuit_contacto", "telefono_contacto", "email_contacto"]) await texto(page, f, campo, ABA[campo]);
  await texto(page, f, "fecha_desde_instalado", dd(new Date()));
  await texto(page, f, "fecha_hasta_instalado", p.hasta);
  await texto(page, f, "compania_seguro", p.seguro.compania);
  await texto(page, f, "vigencia_seguro", p.seguro.vencimiento);
  await desplegable(page, f, "importante", /^S[ií]$/i);

  const textos = { ...ABA, compania_seguro: p.seguro.compania };
  let campoMal = null;
  for (let intento = 1; intento <= 3; intento++) {
    const corregidos = await sincronizarZk(f, textos);
    if (corregidos.length) log(`TAD: el formulario no tenía registrados ${corregidos.join(", ")}: corregidos por ZK`);
    if (normal(await f.locator('input[name="importante"]').first().inputValue()) !== "Si") await desplegable(page, f, "importante", /^S[ií]$/i);
    await page.waitForTimeout(1500);
    await f.locator("button.btn-guardar").first().click({ timeout: 10000 });
    await page.waitForTimeout(8000);
    // Guardado = el casillero "Datos del Trámite" pasa a ✓ "Editar" (el aviso del iframe no se llega a ver).
    if (/Datos del Tr[aá]mite.{0,40}Editar/.test(normal(await page.locator("body").innerText()))) return obra;
    campoMal = normal(await f.locator("body").innerText()).match(/Verifique los datos ingresados en el campo:\s*(.+?)(?:\s{2,}|Guardar|$)/)?.[1]?.trim() ?? null;
    log(`TAD: Guardar no quedó (intento ${intento})${campoMal ? `, TAD marca ${campoMal}` : ""}`);
    // Los campos con esa etiqueta (puede haber dos: legal y contacto) se vacían por ZK para que
    // la vuelta siguiente los vuelva a cargar y dispare onChange aunque "ya tuvieran" el valor.
    if (campoMal) await f.evaluate((nombres) => {
      for (const name of nombres) {
        const el = document.querySelector(`input[name="${name}"]`);
        const w = el && window.zk ? window.zk.Widget.$(el) : null;
        if (w) w.setValue(""); // vacío: sincronizarZk lo vuelve a cargar y dispara onChange
      }
    }, Object.entries(ETIQUETA_A_CAMPOS).filter(([et]) => campoMal.startsWith(et)).flatMap(([, n]) => n));
  }
  throw new Trabado(`El formulario no se pudo guardar después de tres intentos${campoMal ? `: TAD marca el campo "${campoMal}"` : ""}`);
}

// ── Adjuntar y confirmar ────────────────────────────────────────────────────

const IF_ADJUNTO = /IF-\d{4}-\d+-GCABA-[A-Z]+/;

function filaDeCasillero(page, casillero) {
  return page.locator("div.row, li, .documento, div")
    .filter({ has: page.locator(".refiere-doc", { hasText: new RegExp(`^\\s*${escapar(casillero)}`) }) })
    .filter({ has: page.locator("button", { hasText: /Adjuntar/ }) })
    .last();
}

/**
 * Adjunta un archivo en un casillero. ÉXITO = el casillero muestra el número de IF del documento.
 * Los avisos generales de la página NO cuentan: el 15/09 (S02466) TAD mostró "Error al obtener los
 * documentos vinculados. No se pudo establecer comunicación con el servicio" con el adjunto bien
 * hecho (IF-2026-41611319 en el casillero), y el robot frenó por ese texto. Si el casillero ya
 * tiene un IF (se sigue desde un borrador), no se vuelve a adjuntar: cada adjunto es un IF oficial.
 */
async function adjuntar(page, { casillero, archivo }) {
  const fila = filaDeCasillero(page, casillero);
  if (!(await fila.count())) throw new Trabado(`No aparece el casillero "${casillero}" en TAD`);
  const previo = normal(await fila.innerText().catch(() => "")).match(IF_ADJUNTO)?.[0];
  if (previo) return { yaEstaba: true, if: previo };

  await fila.locator("button", { hasText: /Adjuntar/ }).first().click({ timeout: 15000 });
  const dialogo = page.locator(".modal.show").filter({ hasText: /Adjunt[aá] documentaci[oó]n/ }).last();
  await dialogo.waitFor({ state: "visible", timeout: 20000 });
  await dialogo.locator("input[type=file]").first().setInputFiles(archivo);
  const nombre = path.basename(archivo);
  await hasta(page, async () => normal(await dialogo.innerText()).includes(nombre), 20000);

  const guardado = page.waitForResponse((r) => r.request().method() === "PUT" && /personaDocumento\/save/.test(r.url()), { timeout: 120000 }).catch(() => null);
  await dialogo.locator("button:visible").filter({ hasText: /^\s*Adjuntar\s*$/ }).last().click({ timeout: 15000 });
  const res = await guardado;
  let cuerpo = null;
  try { cuerpo = res ? await res.json() : null; } catch { /* sin cuerpo */ }

  const numero = await hasta(page, async () => normal(await fila.innerText()).match(IF_ADJUNTO)?.[0], 45000);
  if (numero) return { yaEstaba: false, if: numero };
  const enDialogo = normal(await dialogo.innerText().catch(() => "")).match(/(?:Error|No se pudo)[^.]{0,160}\./)?.[0];
  throw new Trabado(`"${casillero}": el documento no quedó en el casillero (${enDialogo ?? (res ? cuerpo?.mensaje ?? `HTTP ${res.status()}` : "TAD no respondió")}). Puede haber quedado un IF: revisar el borrador`);
}

/**
 * Abre un borrador existente desde Mis trámites → Borradores (para seguir una presentación que
 * se frenó) y deja la página en el paso 2. Verifica que TAD haya abierto ESE borrador.
 */
async function abrirBorrador(page, id, listo, estado) {
  await ir(page, "Mis trámites");
  const lista = page.waitForResponse((r) => /misTramites\/sinEE\/persona\/.+\/paginado/.test(r.url()), { timeout: 120000 });
  await page.getByText("Borradores", { exact: true }).first().click();
  const borradores = JSON.parse(await (await lista).text()).respuesta.content;
  await listo("borradores");
  await page.waitForTimeout(3000);
  const pos = borradores.findIndex((b) => b.id === id);
  if (pos < 0) throw new Trabado(`El borrador ${id} no aparece en Borradores (¿se presentó o se borró a mano?)`);

  estado.borrador = null;
  await page.locator("tr:visible").filter({ hasText: /BORRADOR/i }).nth(pos).getByText("file_open", { exact: true }).click({ timeout: 15000 });
  await page.waitForTimeout(10000);
  await listo("borrador abierto");
  if (/Paso 1 de 3/.test(normal(await page.locator("body").innerText()))) {
    await page.locator("button:visible", { hasText: /^\s*Continuar\s*$/ }).first().click({ timeout: 15000 });
    await page.waitForTimeout(10000);
    await listo("paso 2");
  }
  if (!/Paso 2 de 3/.test(normal(await page.locator("body").innerText()))) throw new Trabado(`Al abrir el borrador ${id} TAD no mostró el paso de documentación`);
  if (estado.borrador !== id) throw new Trabado(`Se pidió seguir el borrador ${id} y TAD abrió ${estado.borrador ?? "otro"}: se frena`);
}

/** "Confirmar trámite" y lo que venga (Resumen o diálogo) hasta ver el EX. */
async function confirmar(page, foto, expedienteDeRed) {
  await page.locator("button:visible", { hasText: /^\s*Confirmar tr[aá]mite\s*$/ }).last().click({ timeout: 15000 });
  for (let paso = 1; paso <= 5; paso++) {
    await page.waitForTimeout(8000);
    await foto(`confirmar-${paso}`);
    const t = normal(await page.locator("body").innerText());
    const numero = expedienteDeRed() ?? ex(t)?.[0];
    if (numero) return numero;
    // Pantalla intermedia: se toca un único botón de confirmar/aceptar, visible.
    const seguir = page.locator(".modal.show button:visible, button:visible").filter({ hasText: /^\s*(Confirmar tr[aá]mite|Confirmar|Aceptar)\s*$/ });
    if (await seguir.count()) {
      await seguir.last().click({ timeout: 15000 });
      continue;
    }
    const aviso = t.match(/(?:Deb[eé]s|Falta|Complet[aá]|Error)[^.]{0,160}\./)?.[0];
    if (aviso) throw new Trabado(`TAD no dejó confirmar: ${aviso}`);
  }
  return expedienteDeRed();
}

/**
 * Borra un borrador por id desde la solapa Borradores, con traba: sólo pasa el DELETE de ese id.
 * Devuelve true si TAD confirmó el borrado; si no, tira con el motivo (no apareció en la lista,
 * TAD rechazó el borrado…). Si no aparece a la primera, recarga la lista una vez.
 */
async function borrarBorrador(page, id, foto) {
  const traba = (route) => {
    const req = route.request();
    if (req.method() === "GET" || /tad2-rest\/sesion\//.test(req.url())) return route.continue();
    return req.url().includes(String(id)) || (req.postData() ?? "").includes(String(id)) ? route.continue() : route.abort("blockedbyclient");
  };
  const leerLista = async () => {
    const lista = page.waitForResponse((r) => /misTramites\/sinEE\/persona\/.+\/paginado/.test(r.url()), { timeout: 120000 });
    await page.getByText("Borradores", { exact: true }).first().click();
    const borradores = JSON.parse(await (await lista).text()).respuesta.content;
    await esperarCarga(page);
    await page.waitForTimeout(3000);
    return borradores;
  };
  await page.route("**/tad2-rest/**", traba);
  try {
    await ir(page, "Mis trámites");
    let borradores = await leerLista();
    let pos = borradores.findIndex((b) => b.id === id);
    if (pos < 0) {
      await page.getByText("En curso", { exact: true }).first().click().catch(() => {});
      await page.waitForTimeout(4000);
      borradores = await leerLista();
      pos = borradores.findIndex((b) => b.id === id);
    }
    if (pos < 0) throw new Error(`el borrador ${id} no aparece en la primera página de Borradores (${borradores.map((b) => b.id).join(", ")})`);
    const borrado = page.waitForResponse((r) => r.request().method() === "DELETE" && r.url().includes(String(id)), { timeout: 30000 });
    await page.locator("tr:visible").filter({ hasText: /BORRADOR/i }).nth(pos).getByText("delete", { exact: true }).click({ timeout: 15000 });
    await page.locator("button:visible", { hasText: /^\s*Eliminar\s*$/ }).first().click({ timeout: 15000 });
    const res = await borrado;
    if (!res.ok()) throw new Error(`TAD rechazó el borrado del borrador ${id} (HTTP ${res.status()})`);
    return true;
  } catch (e) {
    if (foto) await foto("borrar-borrador");
    throw e;
  } finally {
    await page.unroute("**/tad2-rest/**", traba);
  }
}

// ── La presentación ─────────────────────────────────────────────────────────

export async function presentarEnTad({ db, tarea, page, log }) {
  const p = tarea.payload;
  const prueba = !!p.es_prueba;
  const capturas = [];
  const estado = { borrador: null, adjuntados: 0, confirmado: false, expediente: null };
  let n = 0;

  const foto = async (nombre) => {
    n += 1;
    try {
      const destino = `tramites/${tarea.tramite_id}/tad/${tarea.id}-${String(n).padStart(2, "0")}-${nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      const { error } = await db.storage.from(BUCKET).upload(destino, await page.screenshot({ fullPage: true }), { contentType: "image/png", upsert: true });
      if (!error) capturas.push(destino);
    } catch { /* una captura que falla no frena la presentación */ }
  };
  const alResponder = async (res) => {
    const url = res.url();
    const m = url.match(/tad2-rest\/tramite\/(\d{6,})$/);
    if (m && res.request().method() === "GET") estado.borrador = Number(m[1]);
    if (estado.confirmado && !estado.expediente && /tad2-rest/.test(url)) {
      try { const e = ex(await res.text()); if (e) estado.expediente = e[0]; } catch { /* nada */ }
    }
  };
  page.on("response", alResponder);

  try {
    const adjuntos = prueba ? [] : await prepararAdjuntos(db, p, tarea.id);

    // TAD a veces queda "Cargando..." con la página gris y los clics no llegan: antes de cada
    // paso se espera a que termine (hasta 90 s); si no termina, se frena.
    const listo = async (paso) => { if (!(await esperarCarga(page))) throw new Trabado(`TAD siguió cargando más de 90 s (${paso})`); };
    if (p.continuar_borrador && !prueba) {
      // Se sigue una presentación que se frenó: mismo borrador, sin rehacer lo que ya está.
      await abrirBorrador(page, p.continuar_borrador, listo, estado);
      log(`TAD: sigue el borrador ${estado.borrador}`);
    } else {
    await ir(page, "Inicio");
    const buscador = page.getByPlaceholder(/Busc[aá] un tr[aá]mite/i).first();
    await buscador.waitFor({ state: "visible", timeout: 30000 });
    await buscador.fill("andamios");
    await buscador.press("Enter");
    await page.waitForTimeout(7000);
    await listo("búsqueda del trámite");
    await page.locator(":visible", { hasText: /Solicitud de permiso para la instalaci[oó]n de andamios/i }).last().click();
    await page.waitForTimeout(8000);
    await listo("ficha del trámite");
    await page.locator("button:visible", { hasText: /Iniciar tr[aá]mite/i }).first().click();
    await page.waitForTimeout(5000);
    await listo("inicio");
    await page.locator(":visible", { hasText: /^\s*Elegir persona a representar/i }).last().click();
    await page.waitForTimeout(2000);
    await page.locator(":visible", { hasText: /^\s*EMPRENDIMIENTOS Y ESTRUCTURAS/i }).last().click();
    await page.waitForTimeout(1500);
    await page.locator("button:visible", { hasText: /^\s*Confirmar\s*$/ }).first().click();
    await page.waitForTimeout(10000);
    await listo("paso 1");
    await page.locator("button:visible", { hasText: /^\s*Continuar\s*$/ }).first().click();
    await page.waitForTimeout(10000);
    await listo("paso 2");
    if (!estado.borrador) throw new Trabado("TAD no creó el borrador del trámite");
    log(`TAD: borrador ${estado.borrador}${prueba ? " (prueba)" : ""}`);
    }

    // Persona Jurídica se elige si faltan SUS casilleros. Al reabrir un borrador TAD muestra el
    // radio sin marcar y sin los 4 casilleros de persona jurídica (S02466, 15/09).
    const casillerosJuridica = async () => /Copia del DNI del apoderado/i.test(normal(await page.locator("body").innerText()));
    if (!prueba && !(await casillerosJuridica())) {
      // Genera documentos en TAD y redibuja la página: esperar antes de tocar Completar.
      const generado = page.waitForResponse((r) => /requisitosExternos\/generarDocumento/.test(r.url()), { timeout: 60000 }).catch(() => null);
      await page.getByText("Persona Juridica", { exact: true }).first().click();
      await generado;
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(5000);
    }

    // En un borrador que se sigue, el formulario ya puede estar guardado (✓ "Editar").
    let obra = null;
    if (/Datos del Tr[aá]mite.{0,40}Editar/.test(normal(await page.locator("body").innerText()))) {
      log("TAD: el formulario ya estaba guardado en el borrador");
    } else {
      const f = await abrirFormulario(page);
      obra = await llenarYGuardar(page, f, p, log);
      await foto("formulario-guardado");
    }

    if (prueba) {
      // El formulario ya se guardó: si lo que falla es borrar el borrador, la prueba igual pasó
      // y queda anotado el motivo para borrarlo a mano.
      let motivo = null;
      const borrado = await borrarBorrador(page, estado.borrador, foto).catch((e) => { motivo = e.message.split("\n")[0]; return false; });
      return { etapa: "prueba", borrador: estado.borrador, borrador_borrado: borrado, borrador_error: motivo, obra, capturas };
    }

    for (const a of adjuntos) {
      const r = await adjuntar(page, a);
      estado.adjuntados += 1;
      log(`TAD: ${r.yaEstaba ? "ya estaba" : "adjunto"} ${estado.adjuntados}/${adjuntos.length} — ${a.casillero} (${r.if})`);
    }
    await foto("adjuntos");

    estado.confirmado = true;
    const numero = await confirmar(page, foto, () => estado.expediente);
    if (!numero) throw new Trabado("Se tocó «Confirmar trámite» pero no apareció el número de expediente: revisar en TAD si se presentó");
    estado.expediente = numero;
    await foto("presentado");
    return { etapa: "presentado", expediente: normal(numero), borrador: estado.borrador, obra, capturas };
  } catch (e) {
    await foto("error");
    // Una prueba no deja borradores aunque falle (nunca adjuntó nada). Una real sí: el borrador
    // puede tener adjuntos (IF) y es la base para seguir a mano.
    if (prueba && estado.borrador) {
      const borrado = await borrarBorrador(page, estado.borrador, foto).catch(() => false);
      Object.assign(estado, { borrador_borrado: borrado });
    }
    throw Object.assign(e instanceof Error ? e : new Error(String(e)), { capturas, ...estado });
  } finally {
    page.off("response", alResponder);
    await ir(page, "Mis trámites").catch(() => {});
  }
}

/**
 * Atiende una tarea `tad_presentar` de punta a punta: robot, expediente vinculado a la venta,
 * estado del trámite, historial y avisos. `sincronizar` es sincronizarOdoo del worker.
 */
export async function atenderPresentacion({ db, tarea, page, log, avisar, sincronizar }) {
  const p = tarea.payload ?? {};
  const ahora = () => new Date().toISOString();
  const enlace = `/permisos-via-publica/tramites/${tarea.tramite_id}`;
  const evento = async (detalle, datos = {}, expedienteId = null) => {
    const { error } = await db.from("pvp_eventos").insert({ tramite_id: tarea.tramite_id, expediente_id: expedienteId, tipo: "presentacion_tad", detalle, datos, actor: "robot" });
    if (error) log("!! evento de la presentación", error.message);
  };

  log(`TAD: presentar ${p.direccion}${p.es_prueba ? " (prueba)" : ""}`);
  try {
    const r = await presentarEnTad({ db, tarea, page, log });

    if (r.etapa === "prueba") {
      await db.from("pvp_tareas").update({ estado: "ok", resultado: r, terminada_at: ahora() }).eq("id", tarea.id);
      await evento(`Prueba en TAD: formulario llenado y guardado (${r.obra.calle}, ${r.obra.barrio}, ${r.obra.smp}). ${r.borrador_borrado ? "El borrador se borró." : `No se pudo borrar el borrador ${r.borrador}${r.borrador_error ? ` (${r.borrador_error})` : ""}: borrarlo a mano.`} No se adjuntó ni se presentó nada.`, { tarea_id: tarea.id });
      return;
    }

    const m = ex(r.expediente);
    const numero = `${m[1]}-${m[2]}`;
    const fila = {
      expediente: `EX-${m[1]}-${m[2]}- -GCABA-${m[3]}`, numero, organismo: m[3],
      nombre: "Solicitud de permiso para la instalación de andamios en el espacio publico",
      titular: "EMPRENDIMIENTOS Y ESTRUCTURAS S.A.", estado_tad: "INICIACION", solapa: "en_curso",
      creado_tad: ahora().slice(0, 10), direccion: p.direccion, cliente: p.cliente_nombre ?? null,
      odoo_venta_id: p.odoo_venta_id ?? null, odoo_venta_nombre: p.odoo_venta_nombre ?? null,
      odoo_vinculo_por: p.odoo_venta_id ? "numero" : null,
    };
    const { data: exp, error } = await db.from("pvp_expedientes").upsert(fila, { onConflict: "numero" }).select("*").single();
    if (error) throw new Error(`Se presentó ${fila.expediente} pero no se pudo guardar el expediente: ${error.message}`);
    await db.from("pvp_tramites").update({ expediente_id: exp.id, estado: "presentado", updated_at: ahora() }).eq("id", tarea.tramite_id);
    await db.from("pvp_tareas").update({ estado: "ok", resultado: r, terminada_at: ahora() }).eq("id", tarea.id);
    await evento(`Presentado en TAD: ${fila.expediente}.`, { tarea_id: tarea.id, expediente: fila.expediente }, exp.id);
    await avisar([{ tipo: "permiso_novedad", clave: `permiso_novedad:${numero}:presentado`, titulo: `Presentado en TAD — ${p.direccion}`, descripcion: `${fila.expediente}${p.odoo_venta_nombre ? ` · ${p.odoo_venta_nombre}` : ""}`, enlace: `/permisos-via-publica/${exp.id}` }]);
    log(`TAD: presentado ${fila.expediente}`);
    await sincronizar([exp]).catch((e) => log("!! Odoo después de presentar", e.message));
  } catch (e) {
    const msg = (e?.message ?? String(e)).slice(0, 500);
    const cartel = e?.confirmado
      ? "Se tocó «Confirmar trámite»: revisar en TAD si salió el expediente antes de volver a pedirla. "
      : e?.adjuntados
        ? `Quedaron ${e.adjuntados} adjuntos en el borrador ${e.borrador} (cada uno es un IF oficial): seguir desde ese borrador, no volver a presentar de cero. `
        : "";
    log("!! TAD presentar", msg);
    await db.from("pvp_tareas").update({
      estado: "error", error: msg, terminada_at: ahora(),
      resultado: { capturas: e?.capturas ?? [], borrador: e?.borrador ?? null, borrador_borrado: e?.borrador_borrado ?? null, adjuntados: e?.adjuntados ?? 0, confirmado: !!e?.confirmado },
    }).eq("id", tarea.id);
    if (!p.es_prueba) await db.from("pvp_tramites").update({ estado: "trabado", updated_at: ahora() }).eq("id", tarea.tramite_id);
    await evento(`La presentación en TAD se frenó: ${cartel}${msg}`, { tarea_id: tarea.id });
    if (!p.es_prueba) {
      await avisar([{ tipo: "permiso_robot", clave: `permiso_robot:tramite:${tarea.tramite_id}:presentar:${tarea.id}`, titulo: `No se pudo presentar en TAD — ${p.direccion}`, descripcion: `${cartel}${msg}`, prioridad: "alta", enlace }]);
    }
  }
}
