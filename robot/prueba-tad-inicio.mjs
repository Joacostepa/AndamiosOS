// Prueba del robot (fase 0) — pantallas del formulario de inicio. NO SE GUARDA NI PRESENTA.
//
// Inicio → buscar "andamios" → ficha → Iniciar trámite → representación: elegir
// EMPRENDIMIENTOS Y ESTRUCTURAS → Confirmar → capturar la pantalla del formulario (lista de
// casilleros, botón "Completar" de Datos del trámite). No abre "Completar", no adjunta, no
// confirma. Puede quedar un borrador vacío: se registra en el log.
//
// Correr: node --env-file=robot/.env.robot robot/prueba-tad-inicio.mjs
import { abrir, entrar, ir, fotografo, cuerpo } from "./tad-comun.mjs";

const foto = fotografo("inicio");
const { browser, page } = await abrir();
const limpio = (t) => cuerpo(t).replace(/\n{2,}/g, "\n");

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

  // Modal "Seleccionar representación".
  const modal = await foto(page, "representacion", 1000);
  const desplegable = page.locator(":visible", { hasText: /^\s*Elegir persona a representar/i }).last();
  await desplegable.click();
  await page.waitForTimeout(2000);
  const opciones = await foto(page, "representacion-opciones", 1000);
  console.log(`--- Opciones de representación ---\n${limpio(opciones.texto).split("Seleccionar representación")[1]?.slice(0, 800)}`);
  await page.locator(":visible", { hasText: /^\s*EMPRENDIMIENTOS Y ESTRUCTURAS/i }).last().click();
  await page.waitForTimeout(1500);
  await page.locator("button:visible", { hasText: /^\s*Confirmar\s*$/ }).first().click();

  const f = await foto(page, "formulario", 10000);
  console.log(`\n--- Formulario (sin completar) ---\n${limpio(f.texto).slice(0, 7000)}`);
  console.log("\nBotones:", f.botones.filter((b) => !/Preguntas|Contacto|Manual|Términos|Tutoriales|Facebook|Instagram|Twitter|YouTube|LinkedIn|^A \d{3}/i.test(b)).join(" | "));
  void modal;
} catch (e) {
  console.log(`!! ${e.message.split("\n")[0]}`);
  await foto(page, "error", 500).catch(() => {});
} finally {
  await browser.close();
}
