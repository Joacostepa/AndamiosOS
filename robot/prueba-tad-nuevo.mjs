// Prueba del robot (fase 0) — borradores, pantalla de subsanación y formulario de inicio.
// NADA SE PRESENTA NI SE CONFIRMA.
//
// 1. Borradores: espera a que termine "Cargando..." y cuenta.
// 2. Tareas pendientes: abre la primera tarea (ícono "build") y captura qué pide subsanar.
//    No adjunta ni confirma.
// 3. Inicio: busca el trámite de andamios, abre sus detalles y toca "Iniciar trámite";
//    captura la primera pantalla sin completar nada.
// 4. Borradores otra vez: registra si abrir el formulario creó uno. No borra nada.
//
// Correr: node --env-file=robot/.env.robot robot/prueba-tad-nuevo.mjs
import { abrir, entrar, ir, fotografo, cuerpo } from "./tad-comun.mjs";

const foto = fotografo("nuevo");
const { browser, page } = await abrir();
const limpio = (t) => cuerpo(t).replace(/\n{2,}/g, "\n");

async function contarBorradores(etiqueta) {
  await ir(page, "Mis trámites");
  await page.getByText("Borradores", { exact: true }).first().click();
  // En las dos corridas anteriores quedó en "Cargando..." más de un minuto: se espera 30 s y se sigue.
  await page.waitForFunction(() => !document.body.innerText.includes("Cargando..."), null, { timeout: 30000 }).catch(() => {});
  const b = await foto(page, `borradores-${etiqueta}`, 2000);
  const m = b.texto.match(/Mostrando \d+ a \d+ de (\d+)/);
  const n = m ? Number(m[1]) : b.texto.includes("Cargando...") ? null : 0;
  console.log(`\nBorradores ${etiqueta}: ${n ?? "sigue cargando"}\n${limpio(b.texto).slice(0, 1500)}`);
  return n;
}

try {
  await entrar(page);
  const antes = await contarBorradores("antes");

  // 2. Subsanación: sólo mirar.
  try {
    await page.getByText("Tareas pendientes", { exact: true }).first().click();
    await page.waitForTimeout(6000);
    // Las tablas de todas las solapas conviven en el DOM: sólo la fila visible es de esta.
    const fila = page.locator("tr:visible").filter({ hasText: /SUBSANACI/i }).first();
    console.log(`\nTarea: ${(await fila.innerText()).replace(/\s+/g, " ")}`);
    await fila.getByText("build").click();
    const s = await foto(page, "subsanar", 9000);
    console.log(`\n--- Pantalla de subsanación (sin confirmar) ---\n${limpio(s.texto).slice(0, 5000)}`);
  } catch (e) {
    console.log(`!! subsanar: ${e.message.split("\n")[0]}`);
  }

  // 3. Formulario de inicio.
  try {
    await ir(page, "Inicio");
    // El buscador tarda en renderizar: esperarlo por placeholder, no leer inputs de entrada.
    const buscador = page.getByPlaceholder(/Busc[aá] un tr[aá]mite/i).first();
    await buscador.waitFor({ state: "visible", timeout: 30000 });
    await buscador.fill("andamios");
    await buscador.press("Enter");
    await page.waitForTimeout(7000);
    const r = await foto(page, "busqueda");
    console.log(`\n--- Resultados ---\n${limpio(r.texto).slice(0, 2500)}`);

    const tarjeta = page.locator("div").filter({ hasText: /^.{0,40}Solicitud de permiso para la instalaci[oó]n de andamios/i }).last();
    const botones = await tarjeta.locator("button, a").evaluateAll((es) => es.map((e) => e.innerText.trim()).filter(Boolean));
    console.log("Botones de la tarjeta:", botones);

    const detalles = tarjeta.getByText(/detalle|requisito|m[aá]s info/i).first();
    if (await detalles.count()) {
      await detalles.click();
      const d = await foto(page, "detalles", 6000);
      console.log(`\n--- Detalles ---\n${limpio(d.texto).slice(0, 6000)}`);
    }

    const iniciar = page.getByText(/Iniciar tr[aá]mite/i).last();
    if (await iniciar.count()) {
      await iniciar.click();
      const f = await foto(page, "formulario-1", 9000);
      console.log(`\n--- Primera pantalla del formulario (sin completar) ---\n${limpio(f.texto).slice(0, 5000)}`);
    } else {
      console.log("(no aparece Iniciar trámite)");
    }
  } catch (e) {
    console.log(`!! formulario: ${e.message.split("\n")[0]}`);
    await foto(page, "error-formulario", 500).catch(() => {});
  }

  const despues = await contarBorradores("despues");
  console.log(`\nRESULTADO: borradores antes=${antes} después=${despues}`);
} finally {
  await browser.close();
}
