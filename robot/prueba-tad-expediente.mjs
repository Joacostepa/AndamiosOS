// Prueba del robot (fase 0) — un expediente en Subsanación por dentro, SÓLO LECTURA.
//
// Abre el primer expediente en Subsanación de Mis trámites, recorre todas las páginas de
// "Tus documentos" y descarga el documento de SUBSANACIÓN (la observación del GCBA) y la
// Carátula. Mira "Detalle de Movimientos". No toca nada más.
//
// Correr: node --env-file=robot/.env.robot robot/prueba-tad-expediente.mjs
import { abrir, entrar, ir, fotografo, cuerpo, DIR } from "./tad-comun.mjs";

const foto = fotografo("exp");
const { browser, page } = await abrir();

async function bajar(fila, prefijo) {
  const [d] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }).catch(() => null),
    fila.getByText("file_download").click(),
  ]);
  if (!d) return console.log(`(sin descarga para ${prefijo})`);
  const destino = `${DIR}/${prefijo}-${d.suggestedFilename()}`;
  await d.saveAs(destino);
  console.log(`Descargado: ${destino}`);
}

try {
  await entrar(page);
  await ir(page, "Mis trámites");
  const fila = page.locator("tr").filter({ hasText: /SUBSANACI/i }).first();
  console.log("Expediente:", (await fila.innerText()).replace(/\s+/g, " "));
  await fila.getByText("visibility").click();
  await page.waitForTimeout(7000);

  const vistos = new Set();
  for (let pag = 1; pag <= 6; pag++) {
    const d = await foto(page, `documentos-p${pag}`, 2500);
    const filas = page.locator("tr").filter({ hasText: /-GCABA-|-GEDO|IF-|RE-|PV-/ });
    const n = await filas.count();
    for (let i = 0; i < n; i++) {
      const f = filas.nth(i);
      const txt = (await f.innerText()).replace(/\s+/g, " ").replace("file_download", "").trim();
      if (vistos.has(txt)) continue;
      vistos.add(txt);
      console.log(`  doc: ${txt}`);
      if (/SUBSANACION|Car[aá]tula|Notificaci/i.test(txt)) {
        await bajar(f, `exp-${txt.match(/^(\S+)/)[1]}`);
      }
    }
    const sig = page.getByText(/^Siguiente$/).first();
    if (!(await sig.count()) || !(await sig.isEnabled().catch(() => false))) break;
    await sig.click().catch(() => {});
    await page.waitForTimeout(3000);
    if (pag > 1 && d.texto === (await page.evaluate(() => document.body.innerText))) break;
  }

  const mov = page.getByText(/Detalle de Movimientos/i).first();
  if (await mov.count()) {
    await mov.click();
    const m = await foto(page, "movimientos", 5000);
    console.log(`\n--- Detalle de movimientos ---\n${cuerpo(m.texto).slice(0, 4000)}`);
  }
} finally {
  await browser.close();
}
