import type { SupabaseClient } from "@supabase/supabase-js";
import { crearAlertas } from "@/lib/alertas/servicio";

// El robot de TAD corre en la Mac de la oficina (robot/worker-tad.mjs): si se apaga, se corta
// internet o macOS se reinicia y queda en la pantalla de login, las tareas esperan en la cola y
// nadie se entera hasta que alguien pregunta por un expediente (JS, 2026-09-15). Esto lo mira
// desde la app y avisa al canal de permisos: cuando deja de dar señales Y cuando vuelve.
//
// CUÁNDO SE LO DA POR CAÍDO: el robot deja en cada vuelta cuándo va a ser la próxima
// (`proxima_revision_at`: 30 min en horario hábil, 2 h fuera). Si esa hora ya pasó hace más de
// MARGEN_MIN, no está dando señales. El umbral sigue solo a la cadencia del robot, así que no
// hay que repetir acá su horario ni avisar de madrugada por una vuelta de 2 h.
//
// CÓMO SABE QUE VOLVIÓ, SIN GUARDAR ESTADO: el aviso de la caída ya es el registro. Se mira el
// último aviso `permiso_robot:sin_senales:<hora>` y, si el robot tuvo una vuelta buena después
// de esa hora, es que volvió. Así no hace falta una columna nueva ni que el robot avise nada.
//
// UN AVISO POR EPISODIO: las dos claves llevan la hora de la última vuelta buena ANTES de la
// caída, que no cambia mientras está caído, y el índice único de `alertas.clave` hace el resto.
// Puede correr cada 30 minutos sin repetir nada.
//
// NUNCA TIRA: es un chequeo de salud; si falla, no puede voltear al cron que lo llama.

const MARGEN_MIN = 20;
const CLAVE_CAIDA = "permiso_robot:sin_senales:";

type Latido = {
  ultimo_ok_at: string | null;
  proxima_revision_at: string | null;
  ultimo_error: string | null;
  equipo: string | null;
};

export type ResultadoLatido = { estado: "ok" | "sin_datos" | "sin_senales" | "volvio"; avisado: number; desde?: string };

/** "2 h 10" / "45 min", para que el aviso diga cuánto estuvo caído sin hacer cuentas. */
function duracion(ms: number): string {
  const minutos = Math.round(ms / 60_000);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas} h ${resto}` : `${horas} h`;
}

const horaDe = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });

export async function revisarLatidoRobot(db: SupabaseClient): Promise<ResultadoLatido> {
  try {
    const { data } = await db.from("pvp_robot").select("ultimo_ok_at, proxima_revision_at, ultimo_error, equipo").eq("id", "tad").maybeSingle();
    const robot = data as Latido | null;
    // Sin ninguna vuelta buena todavía no hay contra qué comparar (robot recién instalado).
    if (!robot?.ultimo_ok_at) return { estado: "sin_datos", avisado: 0 };

    const vencimiento = (robot.proxima_revision_at ? Date.parse(robot.proxima_revision_at) : Date.parse(robot.ultimo_ok_at)) + MARGEN_MIN * 60_000;

    if (Date.now() > vencimiento) {
      const avisado = await crearAlertas(db, [{
        tipo: "permiso_robot",
        clave: `${CLAVE_CAIDA}${robot.ultimo_ok_at}`,
        titulo: `El robot de TAD no da señales hace ${duracion(Date.now() - Date.parse(robot.ultimo_ok_at))}`,
        descripcion: `La última vuelta terminó el ${horaDe(robot.ultimo_ok_at)} en ${robot.equipo ?? "la Mac"}. Mientras no vuelva, las presentaciones y la revisión de expedientes esperan en la cola: revisar que la Mac esté prendida, con internet y con la sesión iniciada.${robot.ultimo_error ? ` Último error: ${robot.ultimo_error.slice(0, 160)}` : ""}`,
        prioridad: "alta",
        enlace: "/permisos-via-publica",
      }]);
      return { estado: "sin_senales", avisado, desde: robot.ultimo_ok_at };
    }

    // Al día. Si la última caída se avisó y después hubo una vuelta buena, avisar que volvió:
    // el aviso de caída sin el de vuelta obliga a entrar a mirar igual.
    const { data: ultima } = await db
      .from("alertas")
      .select("clave")
      .eq("tipo", "permiso_robot")
      .like("clave", `${CLAVE_CAIDA}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const desde = (ultima?.clave as string | undefined)?.slice(CLAVE_CAIDA.length);
    if (!desde || Date.parse(desde) >= Date.parse(robot.ultimo_ok_at)) return { estado: "ok", avisado: 0 };

    const avisado = await crearAlertas(db, [{
      tipo: "permiso_robot",
      clave: `permiso_robot:volvio:${desde}`,
      titulo: "El robot de TAD volvió",
      descripcion: `Estuvo ${duracion(Date.parse(robot.ultimo_ok_at) - Date.parse(desde))} sin dar señales, desde el ${horaDe(desde)}. Las tareas que quedaron esperando se ejecutan solas.`,
      prioridad: "media",
      enlace: "/permisos-via-publica",
    }]);
    return { estado: "volvio", avisado, desde };
  } catch (e) {
    console.error("[robot-latido] no se pudo revisar el latido", e instanceof Error ? e.message : e);
    return { estado: "sin_datos", avisado: 0 };
  }
}
