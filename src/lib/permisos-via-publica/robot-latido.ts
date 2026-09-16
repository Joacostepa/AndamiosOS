import type { SupabaseClient } from "@supabase/supabase-js";
import { crearAlertas } from "@/lib/alertas/servicio";

// El robot de TAD corre en la Mac de la oficina (robot/worker-tad.mjs): si se apaga, se corta
// internet o macOS se reinicia y queda en la pantalla de login, las tareas esperan en la cola y
// nadie se entera hasta que alguien pregunta por un expediente (JS, 2026-09-15). Esto lo mira
// desde la app y avisa al canal de permisos.
//
// CUÁNDO SE LO DA POR CAÍDO: el robot deja en cada vuelta cuándo va a ser la próxima
// (`proxima_revision_at`: 30 min en horario hábil, 2 h fuera). Si esa hora ya pasó hace más de
// MARGEN_MIN, no está dando señales. El umbral sigue solo a la cadencia del robot, así que no
// hay que repetir acá su horario ni avisar de madrugada por una vuelta de 2 h.
//
// UN AVISO POR CAÍDA: la clave lleva la hora de la última vuelta buena, que no cambia mientras
// está caído, y el índice único de `alertas.clave` hace el resto. Puede correr cada 30 minutos
// sin repetir el aviso; cuando el robot vuelve, la caída siguiente tiene otra clave.
//
// NUNCA TIRA: es un chequeo de salud; si falla, no puede voltear al cron que lo llama.

const MARGEN_MIN = 20;

type Latido = {
  ultimo_ok_at: string | null;
  proxima_revision_at: string | null;
  ultimo_error: string | null;
  equipo: string | null;
};

export type ResultadoLatido = { estado: "ok" | "sin_datos" | "sin_senales"; avisado: number; desde?: string };

export async function revisarLatidoRobot(db: SupabaseClient): Promise<ResultadoLatido> {
  try {
    const { data } = await db.from("pvp_robot").select("ultimo_ok_at, proxima_revision_at, ultimo_error, equipo").eq("id", "tad").maybeSingle();
    const robot = data as Latido | null;
    // Sin ninguna vuelta buena todavía no hay contra qué comparar (robot recién instalado).
    if (!robot?.ultimo_ok_at) return { estado: "sin_datos", avisado: 0 };

    const vencimiento = (robot.proxima_revision_at ? Date.parse(robot.proxima_revision_at) : Date.parse(robot.ultimo_ok_at)) + MARGEN_MIN * 60_000;
    if (Date.now() <= vencimiento) return { estado: "ok", avisado: 0 };

    const desde = Date.parse(robot.ultimo_ok_at);
    const minutos = Math.round((Date.now() - desde) / 60_000);
    const cuanto = minutos >= 120 ? `${Math.floor(minutos / 60)} h` : `${minutos} min`;
    const hora = new Date(desde).toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });

    const avisado = await crearAlertas(db, [{
      tipo: "permiso_robot",
      clave: `permiso_robot:sin_senales:${robot.ultimo_ok_at}`,
      titulo: `El robot de TAD no da señales hace ${cuanto}`,
      descripcion: `La última vuelta terminó el ${hora} en ${robot.equipo ?? "la Mac"}. Mientras no vuelva, las presentaciones y la revisión de expedientes esperan en la cola: revisar que la Mac esté prendida, con internet y con la sesión iniciada.${robot.ultimo_error ? ` Último error: ${robot.ultimo_error.slice(0, 160)}` : ""}`,
      prioridad: "alta",
      enlace: "/permisos-via-publica",
    }]);
    return { estado: "sin_senales", avisado, desde: robot.ultimo_ok_at };
  } catch (e) {
    console.error("[robot-latido] no se pudo revisar el latido", e instanceof Error ? e.message : e);
    return { estado: "sin_datos", avisado: 0 };
  }
}
