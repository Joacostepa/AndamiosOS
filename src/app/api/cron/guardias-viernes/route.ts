import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { OdooError } from "@/lib/odoo/client";
import {
  avisarA,
  destinatariosAutoriza,
  destinatariosPlanificacion,
  guardiasDeSemanas,
  leerGrillaLiviana,
  ponerGuardias,
  rotacionEntre,
  semanaMas,
} from "@/lib/planificacion/guardias";
import { hoyBA, sumarDias } from "@/lib/tablero/dias-habiles";
import { planearGuardiasSemana, siglaCuadrilla, textoAvisoColocacion } from "@/lib/tablero/guardias";
import { SEMANAS_ROTACION, type ResultadoColocacion } from "@/lib/tablero/guardias-tipos";

// GET/POST /api/cron/guardias-viernes — la corrida que pone las guardias (viernes 10 h de
// Argentina = 13 UTC, ver vercel.json). Contrato: guardias-contrato.md §1.2.
//
// Cubre la semana SIGUIENTE y la otra (+1 y +2), nunca la que está en curso. Por cada semana,
// en orden: VUELVE A LEER la grilla (no confía en lo que leyó antes, y la +2 tiene que ver lo
// que acaba de poner en la +1), arma la rotación (guardias no sacadas por cuadrilla en las 4
// semanas anteriores) y llama a la regla pura (planearGuardiasSemana). Escribe con la service
// role y es IDEMPOTENTE: la base no deja dos guardias en la misma semana y ranura, así que
// volver a correrla no duplica nada. NUNCA MUEVE UNA OBRA: si no hay lugar, la guardia no se
// pone y el aviso dice por qué.
//
// Al final, un aviso a Planificación y a JS ("Puse 2 guardias para la semana del 02/11: mar
// 03/11 C2, jue 05/11 C3"), una vez por semana cubierta (la clave lo hace idempotente).
//
// `?hoy=AAAA-MM-DD` (sólo con el secreto): "como si hoy fuera". El arranque del 18/10 se
// corre con ?hoy=2026-10-23 y cubre las semanas del 26/10 y del 02/11. Nunca pone nada en un
// día que ya pasó de verdad, aunque `hoy` diga otra cosa.
//
// Protegido por CRON_SECRET, falla cerrado (como /api/cron/personal-odoo). GET porque Vercel
// Cron dispara con GET.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function autorizado(req: NextRequest): boolean {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) return false;
  return (
    req.headers.get("authorization") === `Bearer ${esperado}` ||
    req.headers.get("x-cron-secret") === esperado
  );
}

async function correr(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const pedido = req.nextUrl.searchParams.get("hoy");
  if (pedido && !FECHA.test(pedido)) return NextResponse.json({ error: "'hoy' va como AAAA-MM-DD" }, { status: 400 });
  const real = hoyBA();
  const hoy = pedido ?? real;
  // La regla mira `hoy` para "la semana en curso nunca" y "nada en un día pasado": con un
  // `hoy` simulado hacia atrás no puede terminar poniendo guardias en el pasado real.
  const hoyEfectivo = hoy > real ? hoy : real;

  try {
    const adm = createAdminClient();
    const semanas: ResultadoColocacion[] = [];
    let puestas = 0;
    const siglas = new Map<number, string>();

    for (const n of [1, 2]) {
      const semana = semanaMas(hoy, n);
      // Del sábado anterior al lunes siguiente: para saber si un lunes o un sábado quedan "en
      // medio de una obra de varios días" hay que ver el día hábil de cada lado.
      const [grilla, guardiasSemana, rotacion] = await Promise.all([
        leerGrillaLiviana(adm, sumarDias(semana, -2), sumarDias(semana, 7)),
        guardiasDeSemanas(adm, [semana]),
        rotacionEntre(adm, sumarDias(semana, -7 * SEMANAS_ROTACION), semana),
      ]);
      for (const c of grilla.cuadrillas) siglas.set(c.id, siglaCuadrilla(c));
      const resultado = planearGuardiasSemana({ ...grilla, hoy: hoyEfectivo, semana, guardiasSemana, rotacion });
      const { creadas, puestas: escritas } = await ponerGuardias(adm, semana, resultado);
      puestas += creadas.length;
      // Lo que se escribió de verdad: si otra corrida ganó una ranura en el medio, no se avisa
      // como propia (la base ya la tiene, así que cuenta como "ya estaba").
      const yaEstaban = [...resultado.yaEstaban, ...resultado.poner.filter((g) => !escritas.includes(g)).map((g) => g.ranura)];
      semanas.push({ ...resultado, poner: escritas, yaEstaban });
      console.log(`[cron guardias-viernes] semana ${semana}: puso ${creadas.length}, faltan ${resultado.faltan.length}, ya estaban ${yaEstaban.length}`);
    }

    // El aviso, a Planificación y a JS. La clave lleva la semana +1 Y EL DÍA REAL DE LA
    // CORRIDA: volver a correrla el mismo día no repite el aviso, pero el arranque (18/10, con
    // ?hoy=2026-10-23) y la corrida real del viernes 23/10 cubren la misma semana +1, y con la
    // clave sola el aviso del viernes —por ejemplo, una ranura que el arranque no pudo poner y
    // ahora sí— se descartaba en silencio por duplicado.
    const [planificacion, autoriza] = await Promise.all([destinatariosPlanificacion(adm), destinatariosAutoriza(adm)]);
    const texto = textoAvisoColocacion(semanas, (id) => siglas.get(id) ?? `cuadrilla #${id}`);
    const faltan = semanas.reduce((s, r) => s + r.faltan.length, 0);
    await avisarA(adm, "guardia_puesta", [...planificacion, ...autoriza], {
      claveBase: `guardia_puesta:${semanas[0].semana}:${real}`,
      titulo: texto.titulo,
      descripcion: texto.descripcion,
      enlace: `/planificacion?fecha=${semanas[0].semana}`,
      prioridad: faltan > 0 ? "media" : "baja",
    });

    return NextResponse.json({ semanas, puestas });
  } catch (e) {
    const msg = e instanceof OdooError ? e.message : e instanceof Error ? e.message : String(e);
    console.error("[cron guardias-viernes]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export const GET = correr;
export const POST = correr;
