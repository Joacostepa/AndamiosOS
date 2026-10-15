// Actualización diaria del robot desde GitHub (pedido de JS, 15/10).
//
// El 15/10 TAD cambió la pantalla de "a quién representar" y el arreglo quedó en main, pero el
// robot siguió fallando hasta que alguien hiciera `git pull` y reinstalara en la Mac mini. Ahora,
// una vez por día después de las 8 (fuera del horario de presentación de 19 a 7) y entre tareas,
// el robot baja main y, si cambió, se cierra: launchd lo vuelve a arrancar con el código nuevo
// (KeepAlive en robot/instalar-launchd.sh).
//
// Trabas, para que nunca quede peor de lo que estaba:
//   - sólo avanza (`--ff-only`) y sólo en main con el árbol limpio (no pisa cambios locales);
//   - si cambian package.json o package-lock.json no actualiza: hay que instalar dependencias a mano;
//   - después de bajar, `node --check` de cada robot/*.mjs; si alguno no compila vuelve al commit
//     anterior y no se reinicia.

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const HORA_DESDE = 8;
const HORA_HASTA = 18;

const git = (...args) => execFileSync("git", args, { encoding: "utf8", timeout: 60_000 }).trim();

let diaRevisado = null;

function horaBA() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date());
  const v = (t) => p.find((x) => x.type === t).value;
  return { dia: `${v("year")}-${v("month")}-${v("day")}`, hora: Number(v("hour")) };
}

/**
 * Devuelve `{ reiniciar: true, desde, hasta }` si bajó código nuevo y hay que cerrar el proceso,
 * `{ problema }` si no pudo (para avisar) o null si no le tocaba o no había nada nuevo.
 */
export function actualizarSiToca(log) {
  const { dia, hora } = horaBA();
  if (diaRevisado === dia || hora < HORA_DESDE || hora >= HORA_HASTA) return null;
  diaRevisado = dia;

  try {
    if (git("rev-parse", "--abbrev-ref", "HEAD") !== "main") return { problema: "la copia del robot no está en main" };
    if (git("status", "--porcelain", "--untracked-files=no")) return { problema: "la copia del robot tiene cambios locales sin subir" };

    git("fetch", "--quiet", "origin", "main");
    const desde = git("rev-parse", "HEAD");
    const hasta = git("rev-parse", "origin/main");
    if (desde === hasta) {
      log("Actualización: el robot ya tiene el último código");
      return null;
    }
    const cambiados = git("diff", "--name-only", desde, hasta).split("\n");
    if (cambiados.some((f) => f === "package.json" || f === "package-lock.json")) {
      return { problema: "cambiaron las dependencias (package.json): hay que hacer git pull, npm install y reinstalar a mano" };
    }

    git("merge", "--ff-only", "--quiet", "origin/main");
    const dir = path.resolve("robot");
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".mjs"))) {
      try {
        execFileSync(process.execPath, ["--check", path.join(dir, f)], { stdio: "pipe", timeout: 30_000 });
      } catch (e) {
        git("reset", "--hard", "--quiet", desde);
        return { problema: `el código nuevo no compila (${f}); se volvió al anterior` };
      }
    }
    log(`Actualización: ${desde.slice(0, 7)} → ${hasta.slice(0, 7)}; se reinicia con el código nuevo`);
    return { reiniciar: true, desde, hasta };
  } catch (e) {
    return { problema: `no se pudo actualizar: ${e.message.split("\n")[0]}` };
  }
}
