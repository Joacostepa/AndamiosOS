import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FaltanDatos } from "@/lib/permisos-via-publica/generacion";
import { aprobarEncomienda, descartarEncomienda, pedirEncomienda } from "@/lib/permisos-via-publica/encomienda";

// POST /api/permisos-via-publica/tramites/:id/encomienda — la encomienda del CPAU del trámite.
//   { accion: "pedir" }      deja la tarea al robot (completa todo y frena en Confirmar)
//   { accion: "finalizar" }  una persona revisó el resumen: el robot toca Finalizar
//   { accion: "descartar" }  tira la que espera aprobación, para volver a pedirla
// El proxy exige nivel "editar". No espera al robot: la ficha se entera sola.

export const dynamic = "force-dynamic";

const schema = z.object({ accion: z.enum(["pedir", "finalizar", "descartar"]) });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Acción inválida" }, { status: 400 });

  const { data: auth } = await (await createClient()).auth.getUser();
  const userId = auth.user?.id ?? null;
  const db = createAdminClient();

  try {
    if (parsed.data.accion === "pedir") return NextResponse.json(await pedirEncomienda(db, id, { userId }));
    if (parsed.data.accion === "finalizar") await aprobarEncomienda(db, id, userId);
    else await descartarEncomienda(db, id, userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof FaltanDatos) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
