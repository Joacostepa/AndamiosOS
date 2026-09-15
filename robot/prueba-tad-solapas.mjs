// Prueba del robot (fase 0) — solapas de Mis trámites, SÓLO LECTURA.
//
// Lista completa de En curso (tamaño de página "Todos") y el contenido de Tareas
// pendientes, Pagos pendientes, Pagados, Borradores, Finalizados y Trámites externos. En
// Tareas pendientes guarda el HTML de la columna de acciones para saber cómo se abre
// "Subsanar", pero no lo abre.
//
// Correr: node --env-file=robot/.env.robot robot/prueba-tad-solapas.mjs
import { writeFileSync } from "node:fs";
import { abrir, entrar, ir, fotografo, cuerpo, DIR } from "./tad-comun.mjs";

const foto = fotografo("sol");
const { browser, page } = await abrir();

async function todos() {
  // "Todos" es una <option> del selector de tamaño de página, no un botón.
  // Sólo el visible: cada solapa tiene su propio selector y los de las otras quedan ocultos.
  const sel = page.locator("select:visible").filter({ has: page.locator("option", { hasText: "Todos" }) }).first();
  if (await sel.count()) {
    await sel.selectOption({ label: "Todos" }, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(5000);
  }
}

try {
  await entrar(page);
  await ir(page, "Mis trámites");
  await todos();
  const encurso = await foto(page, "en-curso");
  console.log(`--- En curso ---\n${cuerpo(encurso.texto).replace(/content_copy|visibility/g, "").replace(/\n{2,}/g, "\n").slice(0, 5000)}`);

  for (const solapa of ["Tareas pendientes", "Pagos pendientes", "Pagados", "Borradores", "Finalizados", "Trámites externos"]) {
    try {
      await page.getByText(solapa, { exact: true }).first().click({ timeout: 10000 });
      await page.waitForTimeout(6000);
      await todos();
      const t = await foto(page, solapa.toLowerCase().replace(/\s+/g, "-"), 1500);
      console.log(`\n--- ${solapa} ---\n${cuerpo(t.texto).replace(/\n{2,}/g, "\n").slice(0, 3500)}`);
      if (solapa === "Tareas pendientes") {
        const html = await page.locator("table").first().evaluate((t) => t.outerHTML).catch(() => "(sin tabla)");
        writeFileSync(`${DIR}/sol-tareas-tabla.html`, html);
        console.log(`(HTML de la tabla guardado, ${html.length} caracteres)`);
      }
    } catch (e) {
      console.log(`!! ${solapa}: ${e.message.split("\n")[0]}`);
    }
  }
} finally {
  await browser.close();
}
