// SÓLO LECTURA: la solapa "Borradores" de Mis trámites en TAD.
//
// Antes de mapear el paso 2 de la presentación (que probablemente crea un borrador) hay que
// saber si esa solapa carga y si ofrece borrar. El 14/09 quedó en "Cargando..." tres veces
// con 30 s de espera; acá se espera hasta 2 minutos y se prueba también con "Todos".
//
// No toca ningún botón de las filas. Guarda captura, texto y el HTML de la tabla (para ver
// qué acciones trae cada borrador: continuar, eliminar…).
//
// Correr (con el robot de launchd PARADO, para no tener dos sesiones de la misma cuenta):
//   node --env-file=robot/.env.robot robot/revisar-tad-borradores.mjs
import { writeFileSync } from "node:fs";
import { abrir, entrar, ir, fotografo, cuerpo, DIR } from "./tad-comun.mjs";

const foto = fotografo("borradores");
const { browser, page } = await abrir();

try {
  await entrar(page);
  await ir(page, "Mis trámites");
  await page.getByText("Borradores", { exact: true }).first().click();

  const inicio = Date.now();
  const cargo = await page
    .waitForFunction(() => {
      const visibles = [...document.querySelectorAll("td, div")].filter((e) => e.offsetParent && /^\s*Cargando\.\.\.\s*$/.test(e.textContent));
      return visibles.length === 0;
    }, null, { timeout: 120000, polling: 2000 })
    .then(() => true)
    .catch(() => false);
  console.log(`Borradores: ${cargo ? `cargó en ${Math.round((Date.now() - inicio) / 1000)} s` : "sigue en Cargando... después de 2 min"}`);

  // "Todos" en el tamaño de página de esta solapa, si existe.
  const sel = page.locator("select:visible").filter({ has: page.locator("option", { hasText: "Todos" }) }).first();
  if (await sel.count()) {
    await sel.selectOption({ label: "Todos" }, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(5000);
  }

  const t = await foto(page, "solapa", 2000);
  const texto = cuerpo(t.texto).replace(/\n{2,}/g, "\n");
  console.log(`\n--- Borradores ---\n${texto.slice(texto.indexOf("Borradores\nContinuá") >= 0 ? texto.indexOf("Borradores\nContinuá") : 0).slice(0, 3000)}`);

  const filas = page.locator("tr:visible");
  const n = await filas.count();
  const textos = (await filas.allInnerTexts()).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
  console.log(`\nFilas visibles: ${n}\n${textos.join("\n")}`);

  const html = await page.locator("table:visible").first().evaluate((x) => x.outerHTML).catch(() => "(sin tabla visible)");
  writeFileSync(`${DIR}/borradores-tabla.html`, html);
  // Íconos / botones de acción dentro de las filas (material icons: delete, edit, visibility…).
  const acciones = await page.locator("tr:visible button, tr:visible a").evaluateAll((es) => [...new Set(es.map((e) => (e.innerText || e.getAttribute("aria-label") || e.title || "").trim()).filter(Boolean))]);
  console.log(`\nAcciones en las filas: ${acciones.join(" | ") || "(ninguna)"}`);
  console.log(`HTML de la tabla: ${DIR}/borradores-tabla.html (${html.length} caracteres)`);
} catch (e) {
  console.log(`!! ${e.message.split("\n")[0]}`);
  await foto(page, "error", 500).catch(() => {});
} finally {
  await browser.close();
}
