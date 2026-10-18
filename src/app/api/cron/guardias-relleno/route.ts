import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { OdooError } from "@/lib/odoo/client";
import { feriadosDelRango } from "@/lib/feriados/argentina";
import {
  activasDelDia,
  avisarA,
  cerrarPasadasComoDeposito,
  destinatariosPlanificacion,
  leerGrilla,
} from "@/lib/planificacion/guardias";
import { hoyBA, instanteBA, siguienteDiaHabil, sumarDias } from "@/lib/tablero/dias-habiles";
import { candidatosRelleno, siglaCuadrilla, textoAvisoRelleno } from "@/lib/tablero/guardias";
import { HORA_RELLENO } from "@/lib/tablero/guardias-tipos";

// GET/POST /api/cron/guardias-relleno — la corrida de las 13 h de Argentina (16 UTC), de lunes
// a sábado (ver vercel.json). Contrato: guardias-contrato.md §1.5 y §2. Dos cosas, en este
// orden:
//
//   1. Las guardias activas de días que YA PASARON no las usó nadie: la cuadrilla fue al
//      depósito. Quedan "rellenada · depósito" (en el tablero se ven como el "Depósito" que
//      fueron). Antes de que pase el día la guardia sigue activa y protegida: confirmar el
//      depósito a las 13 h dejaría una celda sin candado donde se podría apilar cualquier cosa.
//   2. Para cada guardia activa del día hábil siguiente: un aviso a Planificación, "Mañana:
//      guardia C3 libre. Para rellenar: …", con los candidatos en el orden de la regla (apoyo a
//      un armado atrasado, comodín —las obras que Planificación marcó, la marcada hace más
//      tiempo primero—, tentativa que se puede adelantar, depósito). Desde este momento soltar
//      un comodín sobre esa guardia no pide autorización.
//
// HASTA EL 18/10 HABÍA UN TERCER PASO: avisar los "comodines vencidos" (desarmes que pasaban
// 7 días hábiles esperando). JS decidió ese día que un comodín es una marca manual sin fecha
// ni vencimiento (contrato §2), así que no hay nada que vencer y el paso se sacó. Las alertas
// `comodin_vencido` que ya se crearon quedan en la campanita; no se crean más.
//
// Sin IA: el orden lo da la regla (candidatosRelleno). Los avisos son idempotentes por clave.
// `?hoy=AAAA-MM-DD` (sólo con el secreto) para probarla "como si hoy fuera". EL PASO 1 NO LO
// MIRA: cierra siempre contra el hoy REAL. Con un `?hoy` futuro (correr a mano la del 28/10
// antes del 28) cerraría como "depósito" guardias de días que todavía no pasaron, que
// dejarían de proteger y quedarían en la historia como "nadie la usó".
//
// Protegido por CRON_SECRET, falla cerrado (como /api/cron/personal-odoo).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
/** Hasta dónde se miran las tentativas que se podrían adelantar. */
const DIAS_ADELANTE = 21;

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
  const ahora = pedido ? instanteBA(hoy, HORA_RELLENO) : new Date().toISOString();

  try {
    const adm = createAdminClient();

    // 1. Las de días pasados DE VERDAD, a depósito (ver el encabezado: nunca con el `?hoy`).
    const cerradas = await cerrarPasadasComoDeposito(adm, real);

    // Los feriados van aparte y para atrás también: "la urgencia se cargó hace 3 días hábiles"
    // y el día hábil anterior a una guardia los necesitan, y un feriado en el medio no cuenta.
    const [feriadosLista, grilla, planificacion] = await Promise.all([
      feriadosDelRango(sumarDias(hoy, -60), sumarDias(hoy, DIAS_ADELANTE + 10)),
      leerGrilla(hoy, sumarDias(hoy, DIAS_ADELANTE)),
      destinatariosPlanificacion(adm),
    ]);
    const feriados = new Set(feriadosLista.map((f) => f.fecha));
    const manana = siguienteDiaHabil(hoy, feriados);
    const sigla = (id: number) => {
      const c = grilla.cuadrillas.find((x) => x.id === id);
      return c ? siglaCuadrilla(c) : `cuadrilla #${id}`;
    };

    // 2. Las guardias de mañana que siguen libres.
    const activas = await activasDelDia(adm, manana);
    let avisosRelleno = 0;
    for (const g of activas) {
      const candidatos = candidatosRelleno({
        guardia: g,
        ahora,
        feriados,
        asignaciones: grilla.asignaciones,
        ots: grilla.ots,
        progreso: grilla.progreso,
        cuadrillas: grilla.cuadrillas,
        duracionDe: grilla.duracionDe,
        marcados: grilla.marcados,
      });
      const texto = textoAvisoRelleno(g, sigla(g.cuadrillaId), candidatos, hoy);
      avisosRelleno += await avisarA(adm, "guardia_relleno", planificacion, {
        claveBase: `guardia_relleno:${g.id}`,
        titulo: texto.titulo,
        descripcion: texto.descripcion,
        enlace: `/planificacion?fecha=${g.fecha}`,
        prioridad: "media",
      });
    }

    console.log(`[cron guardias-relleno] ${hoy}: ${cerradas} a depósito, ${activas.length} libres mañana (${manana}), ${grilla.marcados.size} comodines marcados`);
    return NextResponse.json({ hoy, manana, cerradas, libresManana: activas.map((g) => g.id), avisosRelleno });
  } catch (e) {
    const msg = e instanceof OdooError ? e.message : e instanceof Error ? e.message : String(e);
    console.error("[cron guardias-relleno]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export const GET = correr;
export const POST = correr;
