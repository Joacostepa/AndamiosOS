import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { resumirUso, type AccionUso, type ConversacionUso, type FeedbackUso, type FilaUso, type RespuestaUso } from "@/lib/asistente/uso";
import { errorResponse, exigirModulo } from "../../_comun";

// GET /api/comercial/parametros/uso?meses=6 — cuánto se usa el asistente y cuánto cuesta, por
// persona y por mes, más el gasto de hoy contra el tope diario y los últimos «estuvo mal».
//
// SÓLO ADMIN O QUIEN EDITA PARÁMETROS: muestra lo que gasta cada uno. Lee con service role
// (las conversaciones de todos) después de exigirModulo. Las cuentas se hacen acá, no en el
// navegador: no viaja ni una fila de mensajes.

export const dynamic = "force-dynamic";

const PAGINA = 1000;

/** PostgREST corta en 1000 filas: se pide de a páginas hasta que venga una incompleta. */
async function todas<T>(pedir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await pedir(desde, desde + PAGINA - 1);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    filas.push(...(data ?? []));
    if ((data ?? []).length < PAGINA) return filas;
  }
}

/** La tabla de feedback llega con la migración 20261012000004: sin ella, «—» en vez de un error. */
async function feedbackDesde(db: SupabaseClient, desde: string): Promise<FeedbackUso[] | null> {
  try {
    return await todas<FeedbackUso>((a, b) => db.from("asistente_feedback").select("usuario_id, motivo, created_at").gte("created_at", desde).order("id").range(a, b));
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "42P01" || code === "PGRST205") return null;
    throw e;
  }
}

export async function GET(req: NextRequest) {
  const quien = await exigirModulo("parametros-cotizacion", "editar");
  if (quien instanceof NextResponse) return quien;
  const meses = Math.min(24, Math.max(1, Number(req.nextUrl.searchParams.get("meses")) || 6));
  // Desde el primer día del mes, (meses - 1) meses atrás. Con un día de margen por el huso: lo
  // que cae fuera de los meses pedidos lo descarta el filtro de abajo.
  const hoy = new Date();
  const inicio = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - (meses - 1), 1));
  const desde = new Date(inicio.getTime() - 86_400_000).toISOString();
  const mesDesde = inicio.toISOString().slice(0, 7);

  try {
    const db = createAdminClient();
    const [mensajes, conversaciones, acciones, feedback, perfiles, tope] = await Promise.all([
      todas<FilaUso>((a, b) =>
        db.from("asistente_mensajes").select("conversacion_id, turno_id, created_at, uso").gte("created_at", desde).order("id").range(a, b),
      ),
      todas<ConversacionUso>((a, b) => db.from("asistente_conversaciones").select("id, usuario_id, modelo").order("id").range(a, b)),
      todas<AccionUso>((a, b) =>
        db.from("asistente_acciones").select("usuario_id, tipo, estado, confirmada_at, created_at").eq("estado", "ok").gte("created_at", desde).order("id").range(a, b),
      ),
      feedbackDesde(db, desde),
      db.from("user_profiles").select("id, nombre, apellido, email"),
      db.from("cotizacion_parametros").select("valor").eq("clave", "asistente_tope_diario_usd").maybeSingle(),
    ]);
    const nombres = new Map(
      (perfiles.data ?? []).map((p) => [p.id as string, [p.nombre, p.apellido].filter(Boolean).join(" ") || (p.email as string) || "—"]),
    );
    const nombre = (id: string) => nombres.get(id) ?? "—";
    const r = resumirUso({ mensajes, conversaciones, acciones, feedback, ahora: hoy });

    let ultimosEstuvoMal: RespuestaUso["ultimosEstuvoMal"] = null;
    if (feedback) {
      const { data } = await db
        .from("asistente_feedback")
        .select("id, usuario_id, motivo, texto, conversacion_id, created_at, conversacion:asistente_conversaciones(titulo)")
        .order("created_at", { ascending: false })
        .limit(20);
      ultimosEstuvoMal = (data ?? []).map((f) => ({
        id: f.id as number,
        nombre: nombre(f.usuario_id as string),
        motivo: f.motivo as string,
        texto: (f.texto as string | null) ?? null,
        conversacionId: f.conversacion_id as string,
        titulo: (f.conversacion as unknown as { titulo: string | null } | null)?.titulo ?? null,
        fecha: f.created_at as string,
      }));
    }

    const respuesta: RespuestaUso = {
      meses: r.meses.filter((m) => m.mes >= mesDesde).map((m) => ({ ...m, nombre: nombre(m.usuarioId) })),
      hoy: r.hoy.map((h) => ({ ...h, nombre: nombre(h.usuarioId) })),
      tope: tope.data?.valor === null || tope.data?.valor === undefined ? null : Number(tope.data.valor),
      ultimosEstuvoMal,
      desde: mesDesde,
    };
    return NextResponse.json(respuesta);
  } catch (e) {
    return errorResponse(e);
  }
}
