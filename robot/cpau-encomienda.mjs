// Robot del CPAU — completa la encomienda profesional (RETP) de un trámite de permiso.
//
// LO TOMA EL WORKER DE LA MAC (worker-tad.mjs) como tarea `cpau_encomienda` de pvp_tareas.
// El payload lo arma la app (src/lib/permisos-via-publica/encomienda.ts) con el titular del
// lote, el frente del catastro, la superficie y la descripción.
//
// DOS PASADAS, SUPERVISADO:
//   1. Completa las 11 pantallas del asistente y FRENA en Confirmar. Sale sin tocar nada:
//      la tarea queda `esperando_aprobacion` con el resumen y las capturas.
//   2. Cuando una persona aprueba en la ficha (payload.finalizar), vuelve a completar todo
//      —la sesión ASP.NET no aguanta horas esperando— y recién ahí toca Finalizar. Captura lo
//      que aparece después sin tocar nada más: firma, pago y carga todavía no se conocen.
//   Un trámite de prueba nunca pasa de la primera.
//
// GARANTÍAS (aprendidas en el mapeo del 15/09, ver docs/modulo-gestoria-permisos.md):
//   - "Siguiente" sólo si el id termina en NextButton y el texto dice Siguiente. Desde la
//     pantalla 4 el botón de salir dice "Guardar Borrador": nunca se toca, se sale por URL.
//   - Finalizar se toca UNA vez y sólo en la segunda pasada. Si algo falla después, el error
//     lo dice (finalizado: true) y la tarea no se reintenta sola: duplicaría la encomienda.
//   - Antes de finalizar se compara el resumen del CPAU con el payload (CUIT, m², calle).
//   - Histórico antes y después contando por R.Nro (los intentos sin terminar no tienen
//     RETP Nro): en la primera pasada no puede aparecer ninguna fila.
import { chromium } from "playwright";

const RETP = "https://retp.cpau.org";
const P = "#ContentPlaceHolder1_Wizard1_";
const BUCKET = "permisos-via-publica";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const MATRICULA = "12658";

// ABA como comitente, tal cual figura en las encomiendas presentadas (certificado de Trelles).
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

const PROHIBIDO = /finish|finalizar|guardar|borrador|save|confirmar|comprar|pagar|aceptar/i;
const RELLENO = new Set(["AV", "AVDA", "AVENIDA", "DR", "GRAL", "ING", "PJE", "PASAJE", "DE", "DEL", "LA", "LOS", "LAS"]);

/** Mayúsculas, sin tildes ni puntuación: "TRELLES, MANUEL R." → "TRELLES MANUEL R". */
const plano = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * La palabra que se escribe en "Calle a Buscar": la primera que no sea "AV", "DR"… El
 * catastro y el CPAU empiezan igual ("TRELLES, MANUEL R." / "TRELLES MANUEL RICARDO"), así
 * que sirve aunque el buscador sea "empieza con".
 */
export function palabraParaBuscar(calle) {
  return plano(calle).split(" ").find((p) => p.length > 2 && !RELLENO.has(p)) ?? plano(calle);
}

/**
 * Elige la calle del catálogo del CPAU que corresponde al nombre del catastro. El catastro
 * abrevia ("TRELLES, MANUEL R.") y el CPAU no ("TRELLES MANUEL RICARDO"): cada palabra del
 * catastro tiene que ser el comienzo de alguna palabra de la opción. Entre varias que
 * cumplen gana la exacta o la de menos palabras; si sigue empatado, null (que decida una
 * persona: una calle equivocada es una encomienda equivocada).
 */
export function elegirCalle(opciones, calle) {
  const palabras = plano(calle).split(" ").filter(Boolean);
  const cumple = (req) => opciones.filter((o) => {
    const t = plano(o.text).split(" ");
    return req.every((q) => t.some((x) => x.startsWith(q)));
  });
  let candidatas = cumple(palabras);
  if (!candidatas.length) candidatas = cumple(palabras.filter((p) => !RELLENO.has(p)));
  if (candidatas.length <= 1) return candidatas[0] ?? null;
  const exacta = candidatas.filter((o) => plano(o.text) === plano(calle));
  if (exacta.length === 1) return exacta[0];
  const largo = (o) => plano(o.text).split(" ").length;
  const menor = Math.min(...candidatas.map(largo));
  const cortas = candidatas.filter((o) => largo(o) === menor);
  return cortas.length === 1 ? cortas[0] : null;
}

const texto = (page) => page.locator("body").innerText();

async function tituloPantalla(page) {
  return ((await texto(page)).match(/Nuevo RETP\s*\n\s*([^\n]+)/)?.[1] ?? "").trim();
}

async function postback(page, accion) {
  await Promise.all([page.waitForLoadState("domcontentloaded").catch(() => {}), accion()]);
  await page.waitForTimeout(2000);
}

async function entrar(page) {
  await page.goto(`${RETP}/FrmMain.aspx?ReturnUrl=/`, { waitUntil: "domcontentloaded" });
  await page.fill("#ctl05_usernameTextBox", process.env.CPAU_USUARIO);
  await page.fill("#ctl05_passwordTextBox", process.env.CPAU_CLAVE);
  await postback(page, () => page.click("#ctl05_loginButton"));
  if (!(await page.locator("a", { hasText: /Logout/i }).count())) throw new Error("No se pudo entrar al CPAU con la cuenta del matriculado");
}

/** Los R.Nro de la primera página del Histórico (los más nuevos). */
async function filasHistorico(page) {
  await page.goto(`${RETP}/FrmHisto.aspx`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const filas = await page.locator("tr").evaluateAll((trs) => trs.map((t) => t.innerText.replace(/\s+/g, " ").trim()));
  return filas.map((t) => t.match(/^(\d{11}) /)?.[1]).filter(Boolean);
}

async function siguiente(page) {
  const boton = page.locator("input[id$='NextButton']").first();
  if (!(await boton.count())) throw new Error("No hay botón Siguiente en esta pantalla");
  const id = (await boton.getAttribute("id")) ?? "";
  const valor = (await boton.getAttribute("value")) ?? "";
  if (PROHIBIDO.test(id) || PROHIBIDO.test(valor) || !/siguiente/i.test(valor)) {
    throw new Error(`Se evitó tocar el botón ${id} "${valor.trim()}"`);
  }
  await postback(page, () => boton.click());
}

async function completar(page, titulo, p) {
  switch (titulo) {
    case "Datos Básicos":
      await postback(page, () => page.selectOption(`${P}ddlTipoRetpId`, { label: "Habilitación" }));
      await page.selectOption(`${P}ddlTipoEncoId`, { label: "Habilitación Estructura Transitoria" });
      return;
    case "Datos Matrícula": {
      const mat = await page.inputValue(`${P}txtMatNro`);
      if (mat.trim() !== MATRICULA) throw new Error(`La cuenta del CPAU no es la de Hougassian (matrícula "${mat}")`);
      return;
    }
    case "Datos Comitente":
      for (const [campo, valor] of Object.entries(COMITENTE)) {
        if (campo.startsWith("ddl")) await page.selectOption(`${P}${campo}`, { label: valor });
        else await page.fill(`${P}${campo}`, valor);
      }
      return;
    case "Otros Comitentes":
    case "Otros Propietarios":
      return;
    case "Datos Inmueble":
      await page.selectOption(`${P}ddlPropietarioTipoDocId`, { label: "CUIT/CUIL" });
      await page.fill(`${P}txtPropietarioNroDoc`, p.propietario.cuit);
      await page.fill(`${P}txtPropietarioNombre`, p.propietario.nombre);
      // Así va en las encomiendas presentadas: el CPAU lo pide y el lote no tiene uno propio.
      await page.fill(`${P}txtInmCP`, "0");
      return;
    case "Frentes": {
      if ((await texto(page)).includes("A.Desde")) return; // ya tiene la fila
      await page.fill(`${P}txttexttofindcalles`, palabraParaBuscar(p.frente.calle));
      await postback(page, () => page.click(`${P}cmdFindCalle`));
      const opciones = await page.locator(`${P}ddlCalleId option`).evaluateAll((os) => os.map((o) => ({ value: o.value, text: o.textContent.trim() })).filter((o) => o.value));
      const calle = elegirCalle(opciones, p.frente.calle);
      if (!calle) {
        throw new Error(`La calle "${p.frente.calle}" no aparece o hay más de una en el catálogo del CPAU (${opciones.map((o) => o.text).join(" · ") || "sin resultados"})`);
      }
      await page.selectOption(`${P}ddlCalleId`, calle.value);
      await page.fill(`${P}txtAlturaDesde`, String(p.frente.desde));
      await page.fill(`${P}txtAlturaHasta`, String(p.frente.hasta));
      await postback(page, () => page.click(`${P}cmdAddCalle`));
      if (!(await texto(page)).includes("A.Desde")) throw new Error("El CPAU no agregó el frente");
      p.frente.calle_cpau = calle.text;
      return;
    }
    case "Clasificación":
      await page.selectOption(`${P}ddlDestinoObraId`, { label: "Administrativo" });
      await page.selectOption(`${P}ddlClaseObraId`, { label: "Habilitación" });
      await page.selectOption(`${P}ddlZonaId`, { label: "Corredor alto" });
      await page.fill(`${P}txtSuperficie`, p.superficie);
      return;
    case "Actividades":
      if ((await texto(page)).includes("Det.Serv.Nombre")) return; // ya tiene la fila
      await page.fill(`${P}txtValor`, p.superficie);
      await postback(page, () => page.click(`${P}cmdAddActividades`));
      if (!(await texto(page)).includes("Det.Serv.Nombre")) throw new Error("El CPAU no agregó la actividad");
      return;
    case "Descripción Tareas":
      await page.fill(`${P}txtTareasDes`, p.descripcion);
      return;
    default:
      throw new Error(`Pantalla desconocida en el asistente del CPAU: "${titulo}"`);
  }
}

/** El resumen de Confirmar tiene que decir lo que se quiso cargar. */
function verificarResumen(resumen, p) {
  const fallas = [];
  if (!resumen.includes(p.propietario.cuit)) fallas.push(`CUIT del propietario ${p.propietario.cuit}`);
  const sup = resumen.match(/Superficie M2\s+([\d.,]+)/)?.[1];
  if (sup !== p.superficie) fallas.push(`superficie ${p.superficie} (dice ${sup ?? "nada"})`);
  const frente = new RegExp(`${p.frente.desde}\\s+${p.frente.hasta}`);
  if (!frente.test(resumen)) fallas.push(`frente ${p.frente.desde}–${p.frente.hasta}`);
  if (!plano(resumen).includes(plano(p.descripcion))) fallas.push("descripción");
  if (fallas.length) throw new Error(`El resumen del CPAU no coincide con lo pedido: ${fallas.join(", ")}`);
}

const recortar = (t) => t.replace(/^[\s\S]*?\nConfirmar\n/, "").replace(/©[\s\S]*$/, "").trim().slice(0, 4000);

export async function hacerEncomienda({ db, tarea, log }) {
  const p = structuredClone(tarea.payload);
  const finalizar = !!p.finalizar && !p.es_prueba;
  const capturas = [];
  let n = 0;
  let finalizado = false;

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ locale: "es-AR", viewport: { width: 1366, height: 900 }, userAgent: UA })).newPage();
  const foto = async (nombre) => {
    n += 1;
    const slug = plano(nombre).toLowerCase().replace(/ /g, "-") || "pantalla";
    const path = `tramites/${tarea.tramite_id}/cpau/${tarea.id}-${finalizar ? "f" : "c"}${String(n).padStart(2, "0")}-${slug}.png`;
    const buffer = await page.screenshot({ fullPage: true });
    const { error } = await db.storage.from(BUCKET).upload(path, buffer, { contentType: "image/png", upsert: true });
    if (error) log("!! captura del CPAU", error.message);
    else capturas.push(path);
  };

  try {
    await entrar(page);
    const antes = await filasHistorico(page);
    await page.goto(`${RETP}/FrmNewRetp.aspx`, { waitUntil: "domcontentloaded" });

    let resumen = null;
    for (let vuelta = 0; vuelta < 16 && !resumen; vuelta++) {
      await page.waitForTimeout(1000);
      if (await page.locator("input[id$='FinishButton']").count()) {
        resumen = await texto(page);
        await foto("confirmar");
        break;
      }
      const titulo = await tituloPantalla(page);
      await completar(page, titulo, p);
      await foto(titulo);
      await siguiente(page);
      // Una validación deja la misma pantalla con el aviso.
      const aviso = (await texto(page)).match(/El (Dato|Campo) es Obligatorio|La encomienda requiere[^\n]*|debe ingresar[^\n]*/i);
      if (aviso && (await tituloPantalla(page)) === titulo) {
        await foto(`${titulo} validacion`);
        throw new Error(`El CPAU no dejó pasar "${titulo}": ${aviso[0]}`);
      }
    }
    if (!resumen) throw new Error("El asistente del CPAU no llegó a la pantalla Confirmar");
    verificarResumen(resumen, p);
    log(`CPAU: resumen OK (${p.superficie} m², ${p.frente.calle_cpau ?? p.frente.calle} ${p.frente.desde}-${p.frente.hasta})`);

    if (!finalizar) {
      const despues = await filasHistorico(page); // salir sin tocar "Guardar Borrador"
      const nuevas = despues.filter((r) => !antes.includes(r));
      if (nuevas.length) throw new Error(`Aparecieron filas en el Histórico del CPAU sin haber finalizado (${nuevas.join(", ")}): revisar retp.cpau.org`);
      return { etapa: "confirmar", resumen: recortar(resumen), calle_cpau: p.frente.calle_cpau ?? null, capturas };
    }

    finalizado = true;
    await postback(page, () => page.locator("input[id$='FinishButton']").first().click());
    await page.waitForTimeout(3000);
    const textoFinal = await texto(page);
    await foto("despues de finalizar");
    const despues = await filasHistorico(page);
    await foto("historico");
    const nuevas = despues.filter((r) => !antes.includes(r));
    return {
      etapa: "finalizada", resumen: recortar(resumen), calle_cpau: p.frente.calle_cpau ?? null,
      texto_final: textoFinal.replace(/©[\s\S]*$/, "").trim().slice(0, 4000),
      registro: nuevas[0] ?? null, historico_nuevas: nuevas, capturas,
    };
  } catch (e) {
    await foto("error").catch(() => {});
    throw Object.assign(e instanceof Error ? e : new Error(String(e)), { finalizado, capturas });
  } finally {
    await page.locator("a", { hasText: /Logout/i }).first().click().catch(() => {});
    await browser.close().catch(() => {});
  }
}

/**
 * Atiende una tarea `cpau_encomienda` de punta a punta: corre el robot y deja el resultado en
 * la tarea, el documento `encomienda_cpau` del trámite, el historial y los avisos.
 */
export async function atenderEncomienda({ db, tarea, log, avisar }) {
  const p = tarea.payload ?? {};
  const ahora = () => new Date().toISOString();
  const enlace = `/permisos-via-publica/tramites/${tarea.tramite_id}`;
  const obra = p.direccion ?? "trámite";
  const doc = (cambios) => db.from("pvp_documentos").update({ ...cambios, updated_at: ahora() }).eq("tramite_id", tarea.tramite_id).eq("clave", "encomienda_cpau");
  const evento = async (detalle, datos = {}) => {
    const { error } = await db.from("pvp_eventos").insert({ tramite_id: tarea.tramite_id, tipo: "encomienda_cpau", detalle, datos, actor: "robot" });
    if (error) log("!! evento de la encomienda", error.message);
  };
  const aviso = (a) => (p.es_prueba ? Promise.resolve() : avisar([{ enlace, ...a }]));

  log(`CPAU: encomienda de ${obra}${p.finalizar && !p.es_prueba ? " — FINALIZAR" : ""}${p.es_prueba ? " (prueba)" : ""}`);
  try {
    const r = await hacerEncomienda({ db, tarea, log });
    if (r.etapa === "confirmar") {
      await db.from("pvp_tareas").update({ estado: "esperando_aprobacion", resultado: r }).eq("id", tarea.id);
      await doc({
        estado: "pedido",
        observacion: p.es_prueba
          ? "Prueba: el robot completó la encomienda hasta Confirmar. En una prueba nunca se finaliza."
          : "Completa en el CPAU: falta que alguien revise el resumen y toque «Finalizar en el CPAU».",
      });
      await evento(`El robot completó la encomienda hasta Confirmar: ${p.superficie} m², ${r.calle_cpau ?? p.frente?.calle} ${p.frente?.desde}–${p.frente?.hasta}.`, { tarea_id: tarea.id });
      await aviso({
        tipo: "permiso_novedad",
        clave: `permiso_novedad:tramite:${tarea.tramite_id}:encomienda:${tarea.id}`,
        titulo: `Encomienda del CPAU lista para finalizar — ${obra}`,
        descripcion: `${p.superficie} m² · ${r.calle_cpau ?? p.frente?.calle} ${p.frente?.desde}–${p.frente?.hasta}. Revisá el resumen en la ficha y tocá Finalizar.`,
      });
      log("CPAU: esperando aprobación");
      return;
    }

    await db.from("pvp_tareas").update({ estado: "ok", resultado: r, terminada_at: ahora() }).eq("id", tarea.id);
    await doc({
      estado: "pedido",
      observacion: `Registrada en el CPAU${r.registro ? ` (R.Nro ${r.registro})` : ""}. Falta firmar, pagar con tarjeta y cargarla en tramites.cpau.org: por ahora a mano (mirá las capturas de lo que apareció después de Finalizar).`,
    });
    await evento(`Encomienda finalizada en el CPAU${r.registro ? ` (R.Nro ${r.registro})` : " (no apareció la fila nueva en el Histórico: revisar)"}.`, { tarea_id: tarea.id, registro: r.registro });
    await aviso({
      tipo: "permiso_novedad",
      clave: `permiso_novedad:tramite:${tarea.tramite_id}:encomienda-finalizada:${tarea.id}`,
      titulo: `Encomienda finalizada en el CPAU — ${obra}`,
      descripcion: `${r.registro ? `R.Nro ${r.registro}. ` : ""}Falta firma, pago y carga en tramites.cpau.org.`,
    });
    log(`CPAU: finalizada ${r.registro ?? "(sin R.Nro)"}`);
  } catch (e) {
    const msg = (e?.message ?? String(e)).slice(0, 500);
    const despuesDeFinalizar = !!e?.finalizado;
    log("!! CPAU", msg);
    await db.from("pvp_tareas").update({
      estado: "error", error: msg, terminada_at: ahora(),
      resultado: { capturas: e?.capturas ?? [], finalizado: despuesDeFinalizar },
    }).eq("id", tarea.id);
    const cartel = despuesDeFinalizar ? "Falló DESPUÉS de tocar Finalizar: revisar el Histórico del CPAU antes de volver a pedirla. " : "";
    await doc({ estado: "observado", observacion: `${cartel}${msg}` });
    await evento(`La encomienda del CPAU no se pudo completar: ${cartel}${msg}`, { tarea_id: tarea.id, finalizado: despuesDeFinalizar });
    await aviso({
      tipo: "permiso_robot",
      clave: `permiso_robot:tramite:${tarea.tramite_id}:encomienda:${tarea.id}`,
      titulo: `${despuesDeFinalizar ? "⚠️ " : ""}No se pudo completar la encomienda del CPAU — ${obra}`,
      descripcion: `${cartel}${msg}`,
      prioridad: "alta",
    });
  }
}
