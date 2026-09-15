// Baja de TAD los documentos que presentó ABA en UN expediente (informe técnico, croquis,
// encomienda, póliza, nota), para usarlos de modelo al generarlos automáticamente.
// SÓLO LECTURA: no toca nada del trámite.
//
// ⚠️ Abrir el detalle agrega una "Constancia de Consulta" al expediente. Por eso es UN
// expediente, ya archivado con permiso, y todo en una sola visita.
//
// ⚠️ Parar antes el robot (robot/instalar-launchd.sh --desinstalar): dos sesiones miBA con la
// misma cuenta se pueden cortar entre sí. Volver a instalarlo al terminar.
//
// Correr: node --env-file=robot/.env.robot robot/bajar-documentos-aba.mjs 2026-38891134
import { mkdirSync } from "node:fs";
import { abrir, entrar, ir, DIR } from "./tad-comun.mjs";

const numero = process.argv[2] ?? "2026-38891134";
const digitos = numero.split("-")[1];
const destino = `${DIR}/documentos-EX-${numero}`;
mkdirSync(destino, { recursive: true });

const DE_ABA = /Informe T[eé]cnico|Croquis|Encomienda|Seguro de Responsabilidad|Nota de solicitud|Otra documentaci/i;

const { browser, page } = await abrir();
try {
  await entrar(page);
  await ir(page, "Mis trámites");

  // Primero en curso; si no está, en Finalizados.
  const buscar = async () => {
    const sel = page.locator("select:visible").filter({ has: page.locator("option", { hasText: "Todos" }) }).first();
    if (await sel.count()) {
      await sel.selectOption({ label: "Todos" }, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(4000);
    }
    return page.locator("tr:visible").filter({ hasText: digitos }).first();
  };
  let fila = await buscar();
  if (!(await fila.count())) {
    await page.getByText("Finalizados", { exact: true }).first().click();
    await page.waitForTimeout(6000);
    fila = await buscar();
  }
  if (!(await fila.count())) throw new Error(`No encontré EX-${numero} en Mis trámites`);

  console.log("Expediente:", (await fila.innerText()).replace(/\s+/g, " "));
  await fila.getByText("visibility").click();
  await page.waitForTimeout(7000);

  const vistos = new Set();
  for (let pag = 1; pag <= 8; pag++) {
    const filas = page.locator("tr:visible").filter({ hasText: /^\s*(IF|PV|RE|RS|DI)-\d{4}-/ });
    const n = await filas.count();
    for (let i = 0; i < n; i++) {
      const f = filas.nth(i);
      const txt = (await f.innerText()).replace(/\s+/g, " ").replace(/file_download|visibility/g, "").trim();
      if (vistos.has(txt)) continue;
      vistos.add(txt);
      console.log(`  doc: ${txt}`);
      if (!DE_ABA.test(txt)) continue;
      const [d] = await Promise.all([
        page.waitForEvent("download", { timeout: 30000 }).catch(() => null),
        f.getByText("file_download").click(),
      ]);
      if (!d) { console.log("    (no se descargó)"); continue; }
      const archivo = `${destino}/${d.suggestedFilename()}`;
      await d.saveAs(archivo);
      console.log(`    → ${archivo}`);
    }
    const sig = page.getByText(/^Siguiente$/).first();
    if (!(await sig.count()) || !(await sig.isEnabled().catch(() => false))) break;
    await sig.click().catch(() => {});
    await page.waitForTimeout(3000);
  }
} finally {
  await browser.close();
}
