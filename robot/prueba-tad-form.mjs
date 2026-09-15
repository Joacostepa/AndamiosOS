// Prueba del robot (fase 0) — pasos internos de subsanación e inicio. NADA SE CONFIRMA.
//
// 1. Tarea de subsanación: paso 1 → "Continuar" → captura del paso 2 (qué documentos pide
//    re-adjuntar). NO avanza al paso 3 (confirmación) ni adjunta nada.
// 2. Inicio: busca "andamios", abre la ficha del trámite (requisitos) y toca "Iniciar
//    trámite" para capturar la primera pantalla. No elige opciones ni completa datos.
//
// Correr: node --env-file=robot/.env.robot robot/prueba-tad-form.mjs
import { abrir, entrar, ir, fotografo, cuerpo } from "./tad-comun.mjs";

const foto = fotografo("form");
const { browser, page } = await abrir();
const limpio = (t) => cuerpo(t).replace(/\n{2,}/g, "\n");

try {
  await entrar(page);

  try {
    await ir(page, "Mis trámites");
    await page.getByText("Tareas pendientes", { exact: true }).first().click();
    await page.waitForTimeout(6000);
    const fila = page.locator("tr:visible").filter({ hasText: /SUBSANACI/i }).first();
    await fila.getByText("build").click();
    await page.waitForTimeout(9000);
    // Hay varios "Continuar" en el DOM (uno es del aviso de sesión): sólo el visible.
    await page.locator("button:visible", { hasText: /^\s*Continuar\s*$/ }).first().click();
    const s2 = await foto(page, "subsanar-paso-2", 8000);
    console.log(`--- Subsanación paso 2 (sin adjuntar ni confirmar) ---\n${limpio(s2.texto).slice(0, 5000)}`);
    console.log("Botones:", s2.botones.filter((b) => !/Preguntas|Contacto|Manual|Términos|Tutoriales|Facebook|Instagram/i.test(b)).join(" | "));
  } catch (e) {
    console.log(`!! subsanación: ${e.message.split("\n")[0]}`);
  }

  try {
    await ir(page, "Inicio");
    const buscador = page.getByPlaceholder(/Busc[aá] un tr[aá]mite/i).first();
    await buscador.waitFor({ state: "visible", timeout: 30000 });
    await buscador.fill("andamios");
    await buscador.press("Enter");
    await page.waitForTimeout(7000);
    // El título de la tarjeta no es link ni botón y trae espacios alrededor: texto parcial.
    await page.locator(":visible", { hasText: /Solicitud de permiso para la instalaci[oó]n de andamios/i }).last().click();
    const ficha = await foto(page, "ficha-tramite", 8000);
    console.log(`\n--- Ficha del trámite ---\n${limpio(ficha.texto).slice(0, 7000)}`);

    const iniciar = page.getByRole("button", { name: /Iniciar tr[aá]mite/i }).first();
    if (await iniciar.count()) {
      await iniciar.click();
      const f = await foto(page, "iniciar-1", 9000);
      console.log(`\n--- Primera pantalla al iniciar (sin completar) ---\n${limpio(f.texto).slice(0, 5000)}`);
    } else {
      console.log("(no aparece el botón Iniciar trámite en la ficha)");
    }
  } catch (e) {
    console.log(`!! inicio: ${e.message.split("\n")[0]}`);
    await foto(page, "error-inicio", 500).catch(() => {});
  }
} finally {
  await browser.close();
}
