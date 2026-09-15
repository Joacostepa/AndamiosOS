// Borra en TAD SÓLO los borradores cuyo id se pasa por argumento (los que crearon nuestros
// mapeos). Los borradores de la cuenta son de todos (142 al 15/09, la mayoría de Tamara).
//
// TRABA: todo pedido que no sea GET se deja pasar únicamente si su URL o su cuerpo contiene
// uno de los ids indicados; cualquier otro se bloquea y se registra. Así, aunque se toque el
// "delete" de la fila equivocada, TAD no recibe el borrado.
//
// Cómo elige filas: la lista viene ordenada por fecha de alta (la API la devuelve con fechaAlta
// en milisegundos). Se toca "delete" en las filas cuya fecha coincide con la de algún id
// pedido, se confirma "Eliminar" y se vuelve a leer la lista por la API para ver qué quedó.
//
// Correr (con el robot de launchd PARADO):
//   node --env-file=robot/.env.robot robot/borrar-tad-borrador.mjs 12975549 12977405
import { abrir, entrar, ir } from "./tad-comun.mjs";

const ids = process.argv.slice(2).map(Number).filter((x) => x > 0);
if (!ids.length) throw new Error("Pasá los ids de los borradores a borrar");

const { browser, context, page } = await abrir();
const registro = [];
await context.route("**/*", (route) => {
  const req = route.request();
  if (req.method() === "GET" || req.method() === "OPTIONS") return route.continue();
  const texto = `${req.url()} ${req.postData() ?? ""}`;
  const esNuestro = ids.some((id) => texto.includes(String(id)));
  // Sesión y latidos de TAD no llevan id de trámite y son necesarios para seguir logueado.
  const esSesion = /tad2-rest\/sesion\//.test(req.url()) || /login\.buenosaires\.gob\.ar/.test(req.url());
  const permitido = esNuestro || esSesion;
  if (!esSesion) registro.push({ metodo: req.method(), url: req.url(), cuerpo: (req.postData() ?? "").slice(0, 500), permitido });
  return permitido ? route.continue() : route.abort("blockedbyclient");
});

let ultimaLista = null;
page.on("response", async (res) => {
  if (!/misTramites\/sinEE\/persona\/.+\/paginado/.test(res.url())) return;
  try { ultimaLista = JSON.parse(await res.text()).respuesta; } catch { /* nada */ }
});

const hora = (ms) => new Date(ms).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hourCycle: "h23" });

async function abrirBorradores() {
  await ir(page, "Mis trámites");
  ultimaLista = null;
  await page.getByText("Borradores", { exact: true }).first().click();
  const fin = Date.now() + 120000;
  while (Date.now() < fin && !ultimaLista) await page.waitForTimeout(1000);
  await page.waitForTimeout(3000);
  if (!ultimaLista) throw new Error("La lista de borradores no cargó");
  return ultimaLista.content;
}

try {
  await entrar(page);
  let lista = await abrirBorradores();
  const objetivo = lista.filter((b) => ids.includes(b.id));
  const faltan = ids.filter((id) => !lista.some((b) => b.id === id));
  console.log(`Borradores en la primera página: ${lista.map((b) => `${b.id} (${hora(b.fechaAlta)})`).join(", ")}`);
  if (faltan.length) console.log(`No están en la primera página (ya borrados o más viejos): ${faltan.join(", ")}`);

  for (const b of objetivo) {
    lista = await abrirBorradores();
    const pos = lista.findIndex((x) => x.id === b.id);
    if (pos < 0) { console.log(`${b.id}: ya no está`); continue; }
    const filas = page.locator("tr:visible").filter({ hasText: /BORRADOR/i });
    const fila = filas.nth(pos);
    console.log(`${b.id} (${hora(b.fechaAlta)}): fila ${pos + 1} → "${(await fila.innerText()).replace(/\s+/g, " ").slice(0, 120)}"`);
    await fila.getByText("delete", { exact: true }).click();
    await page.waitForTimeout(2000);
    await page.locator("button:visible", { hasText: /^\s*Eliminar\s*$/ }).first().click();
    await page.waitForTimeout(5000);
  }

  lista = await abrirBorradores();
  const quedan = ids.filter((id) => lista.some((b) => b.id === id));
  console.log(`\nDespués: ${quedan.length ? `siguen ${quedan.join(", ")}` : "ninguno de los pedidos sigue en la lista"} · total de borradores ${ultimaLista.totalElements}`);
} catch (e) {
  console.log(`!! ${e.message.split("\n")[0]}`);
} finally {
  console.log(`\nEscrituras (sin contar sesión): ${registro.length}`);
  for (const r of registro) console.log(`  ${r.permitido ? "permitida" : "BLOQUEADA"} ${r.metodo} ${r.url} ${r.cuerpo.replace(/\s+/g, " ").slice(0, 200)}`);
  await browser.close();
}
