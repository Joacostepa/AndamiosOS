// Prueba del robot (fase 0) — TAD por dentro, SÓLO LECTURA.
//
// 1. Mis trámites: todas las solapas, lista completa.
// 2. Detalle de un expediente en Subsanación (ícono ver).
// 3. Tareas pendientes: abrir la tarea y leer la observación — SIN confirmar.
// 4. Notificaciones: ver y descargar una "NOTIFICACION PERMISO".
//
// Correr: node --env-file=robot/.env.robot robot/prueba-tad-lectura.mjs
import { abrir, entrar, ir, fotografo, cuerpo, DIR } from "./tad-comun.mjs";

const foto = fotografo("lect");
const { browser, page } = await abrir();

async function paso(nombre, fn) {
  try {
    await fn();
  } catch (e) {
    console.log(`!! ${nombre} falló: ${e.message.split("\n")[0]}`);
    await foto(page, `error-${nombre}`, 500).catch(() => {});
  }
}

try {
  await entrar(page);

  await paso("mis-tramites", async () => {
    await ir(page, "Mis trámites");
    const todos = page.getByText(/^Todos$/).first();
    if (await todos.count()) { await todos.click(); await page.waitForTimeout(4000); }
    const i = await foto(page, "en-curso-todos");
    console.log(cuerpo(i.texto).slice(0, 6000));

    for (const solapa of ["Tareas pendientes", "Pagos pendientes", "Borradores", "Finalizados", "Trámites externos"]) {
      const s = page.getByText(new RegExp(`^${solapa}$`)).first();
      if (!(await s.count())) { console.log(`(no hay solapa ${solapa})`); continue; }
      await s.click();
      await page.waitForTimeout(5000);
      const t = await foto(page, solapa.toLowerCase().replace(/\s+/g, "-"));
      console.log(`\n--- ${solapa} ---\n${cuerpo(t.texto).slice(0, 2500)}`);
    }
  });

  await paso("detalle-subsanacion", async () => {
    await ir(page, "Mis trámites");
    const fila = page.locator("tr").filter({ hasText: /SUBSANACI/i }).first();
    await fila.getByText("visibility").click();
    await page.waitForTimeout(6000);
    const d = await foto(page, "detalle-subsanacion");
    console.log(`\n--- Detalle expediente en subsanación ---\n${cuerpo(d.texto).slice(0, 5000)}`);
    // Solapas internas del expediente (documentos, movimientos…): sólo mirar.
    for (const s of ["Documentos", "Detalle de movimientos", "Movimientos", "Trámites asociados", "Tramitación conjunta"]) {
      const tab = page.getByText(new RegExp(`^${s}$`, "i")).first();
      if (await tab.count()) {
        await tab.click();
        const t = await foto(page, `detalle-${s.toLowerCase().replace(/\s+/g, "-")}`, 4000);
        console.log(`\n--- ${s} ---\n${cuerpo(t.texto).slice(0, 3000)}`);
      }
    }
  });

  await paso("tarea-pendiente", async () => {
    await ir(page, "Mis trámites");
    await page.getByText(/^Tareas pendientes$/).first().click();
    await page.waitForTimeout(5000);
    const fila = page.locator("tr").filter({ hasText: /EX-/ }).first();
    const acciones = await fila.evaluate((tr) => tr.innerText);
    console.log(`\nFila tarea: ${acciones.replace(/\s+/g, " ")}`);
    // Abrir la tarea (ícono de la fila) para leer la observación. NO se toca "Confirmar".
    const icono = fila.locator("button, a, [role=button], i, span").filter({ hasText: /edit|build|visibility|more_vert|arrow_forward|subsanar/i }).first();
    if (await icono.count()) {
      await icono.click();
      await page.waitForTimeout(3000);
      const menu = page.getByText(/Subsanar/i).first();
      if (await menu.count()) { await menu.click(); }
      await page.waitForTimeout(7000);
      const t = await foto(page, "tarea-subsanar");
      console.log(`\n--- Pantalla de subsanación ---\n${cuerpo(t.texto).slice(0, 5000)}`);
    } else {
      await foto(page, "tarea-fila-sin-icono");
      console.log("No encontré el ícono de la tarea.");
    }
  });

  await paso("notificacion-permiso", async () => {
    await ir(page, "Notificaciones");
    const fila = page.locator("tr").filter({ hasText: /NOTIFICACION PERMISO/i }).first();
    console.log(`\nFila notificación: ${(await fila.innerText()).replace(/\s+/g, " ")}`);
    const [descarga] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }).catch(() => null),
      fila.getByText("file_download").click(),
    ]);
    if (descarga) {
      const destino = `${DIR}/permiso-ejemplo-${descarga.suggestedFilename()}`;
      await descarga.saveAs(destino);
      console.log(`Descargado: ${destino}`);
    } else {
      await foto(page, "descarga-sin-evento");
      console.log("El click en descargar no disparó una descarga.");
    }
    await fila.getByText("visibility").click();
    await page.waitForTimeout(6000);
    const v = await foto(page, "notificacion-ver");
    console.log(`\n--- Ver notificación ---\n${cuerpo(v.texto).slice(0, 3000)}`);
  });
} finally {
  await browser.close();
}
