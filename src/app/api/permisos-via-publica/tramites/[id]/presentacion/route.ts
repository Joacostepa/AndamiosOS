import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FaltanDatos } from "@/lib/permisos-via-publica/generacion";
import { descartarBorrador, pedirPresentacion } from "@/lib/permisos-via-publica/presentacion";

// POST /api/permisos-via-publica/tramites/:id/presentacion — la presentación en TAD.
//   (sin cuerpo) o { accion: "pedir" }  pide la presentación. Normalmente se pide sola cuando el
//     trámite queda listo; el botón es para volver a pedirla después de un error o para la prueba
//     (que llena y guarda el formulario y borra el borrador, sin adjuntar ni presentar).
//   { accion: "descartar_borrador" }  deja de seguir el borrador de TAD (ya borrado a mano) para
//     que la próxima presentación arme uno nuevo.
// El proxy exige nivel "editar". No espera al robot.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({ accion: z.enum(["pedir", "descartar_borrador"]).default("pedir") });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  const parsed = schema.safeParse((await req.json().catch(() => null)) ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Acción inválida" }, { status: 400 });

  const { data: auth } = await (await createClient()).auth.getUser();
  const userId = auth.user?.id ?? null;
  const db = createAdminClient();
  try {
    if (parsed.data.accion === "descartar_borrador") return NextResponse.json({ borrador: await descartarBorrador(db, id, userId) });
    return NextResponse.json(await pedirPresentacion(db, id, { userId }));
  } catch (e) {
    if (e instanceof FaltanDatos) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
