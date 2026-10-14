import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { esAdmin } from "@/lib/auth/acceso";
import { createAdminClient } from "@/lib/supabase/admin";
import { MOTIVOS_FEEDBACK } from "@/lib/asistente/feedback";
import { errorResponse, exigirModulo, invalido } from "../../_comun";

// POST /api/comercial/asistente/feedback { turnoId, motivo, texto? } — «esto estuvo mal».
//
// La marca queda atada al turno (turno_id de asistente_mensajes): así se puede ir a mirar
// exactamente qué pasó. Una por persona y por turno: marcar de nuevo la reemplaza. La
// conversación se saca del turno, no del body, y tiene que ser de quien marca (o ser admin,
// que revisa las de todos).

export const dynamic = "force-dynamic";

const Marca = z.object({
  turnoId: z.string().uuid(),
  motivo: z.enum(MOTIVOS_FEEDBACK),
  texto: z.string().trim().max(2000).nullish(),
});

export async function POST(req: NextRequest) {
  const parsed = Marca.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const quien = await exigirModulo("asistente-comercial", "ver");
  if (quien instanceof NextResponse) return quien;
  const { turnoId, motivo, texto } = parsed.data;
  try {
    const db = createAdminClient();
    const { data: fila } = await db
      .from("asistente_mensajes")
      .select("conversacion:asistente_conversaciones!inner(id, usuario_id)")
      .eq("turno_id", turnoId)
      .limit(1)
      .maybeSingle();
    const conv = fila?.conversacion as unknown as { id: string; usuario_id: string } | null | undefined;
    if (!conv || (conv.usuario_id !== quien.userId && !esAdmin(quien.acceso))) {
      return NextResponse.json({ error: "No existe esa respuesta." }, { status: 404 });
    }
    const { error } = await db.from("asistente_feedback").upsert(
      { conversacion_id: conv.id, turno_id: turnoId, usuario_id: quien.userId, motivo, texto: texto || null, updated_at: new Date().toISOString() },
      { onConflict: "turno_id,usuario_id" },
    );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
