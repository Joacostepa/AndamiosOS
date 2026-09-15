// SÓLO LECTURA: por qué la solapa "Borradores" de TAD queda en "Cargando...".
//
// Registra las llamadas a la API de TAD mientras se abre la solapa (URL, estado HTTP y el
// comienzo de la respuesta) y espera hasta 3 minutos a que el texto "Cargando..." de la
// tabla visible desaparezca. Sirve para saber si el backend devuelve un error (roto del lado
// del Gobierno) o si sólo tarda. No toca ningún botón de las filas.
//
// Correr (con el robot de launchd PARADO):
//   node --env-file=robot/.env.robot robot/revisar-tad-borradores-red.mjs
import { writeFileSync } from "node:fs";
import { abrir, entrar, ir, fotografo, DIR } from "./tad-comun.mjs";

const foto = fotografo("borradores-red");
const { browser, page } = await abrir();
const llamadas = [];
let registrando = false;

page.on("response", async (res) => {
  if (!registrando) return;
  const req = res.request();
  if (!["xhr", "fetch"].includes(req.resourceType())) return;
  let cuerpo = "";
  // La lista de borradores se guarda entera (fecha y hora de alta de cada uno); el resto, el comienzo.
  try { const txt = await res.text(); cuerpo = /paginado/.test(res.url()) ? txt : txt.slice(0, 400); } catch { cuerpo = "(sin cuerpo)"; }
  llamadas.push({ t: new Date().toISOString().slice(11, 19), metodo: req.method(), estado: res.status(), url: res.url().replace(/\?.*$/, (q) => q.slice(0, 120)), cuerpo });
});
page.on("requestfailed", (req) => {
  if (registrando) llamadas.push({ t: new Date().toISOString().slice(11, 19), metodo: req.method(), estado: "FALLÓ", url: req.url(), cuerpo: req.failure()?.errorText ?? "" });
});

// El "Cargando..." es un indicador que tapa la página, fuera de la tabla: se busca en
// cualquier elemento hoja visible.
const cargandoVisible = () => page.evaluate(() =>
  [...document.querySelectorAll("body *")].some((e) => e.childElementCount === 0 && e.offsetParent && e.textContent.trim() === "Cargando..."),
);

try {
  await entrar(page);
  await ir(page, "Mis trámites");
  registrando = true;
  await page.getByText("Borradores", { exact: true }).first().click();

  const inicio = Date.now();
  let cargo = false;
  while (Date.now() - inicio < 180000) {
    await page.waitForTimeout(3000);
    if (!(await cargandoVisible())) { cargo = true; break; }
  }
  registrando = false;
  console.log(`Borradores: ${cargo ? `cargó en ${Math.round((Date.now() - inicio) / 1000)} s` : "sigue en Cargando... después de 3 min"}`);

  const t = await foto(page, "solapa", 1000);
  const filas = (await page.locator("tr:visible").allInnerTexts()).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
  console.log(`Filas visibles:\n${filas.join("\n")}`);

  writeFileSync(`${DIR}/borradores-red.json`, JSON.stringify(llamadas, null, 2));
  console.log(`\nLlamadas a la API desde que se tocó la solapa (${llamadas.length}):`);
  for (const l of llamadas) console.log(`${l.t} ${l.metodo} ${l.estado} ${l.url}\n    ${String(l.cuerpo).replace(/\s+/g, " ").slice(0, 200)}`);
  void t;
} catch (e) {
  console.log(`!! ${e.message.split("\n")[0]}`);
  await foto(page, "error", 500).catch(() => {});
} finally {
  await browser.close();
}
