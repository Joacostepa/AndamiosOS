import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FaltanDatos } from "@/lib/permisos-via-publica/generacion";
import { descartarBorrador, empezarDeCero, manejarReintento, pedirPresentacion } from "@/lib/permisos-via-publica/presentacion";
import { rechazoIrreversible } from "@/lib/permisos-via-publica/guardia";

// POST /api/permisos-via-publica/tramites/:id/presentacion — la presentación en TAD.
//   (sin cuerpo) o { accion: "pedir" }  pide la presentación. Normalmente se pide sola cuando el
//     trámite queda listo; el botón es para volver a pedirla después de un error o para la prueba
//     (que llena y guarda el formulario y borra el borrador, sin adjuntar ni presentar).
//   { accion: "descartar_borrador" }  deja de seguir el borrador de TAD (ya borrado a mano) para
//     que la próxima presentación arme uno nuevo.
//   { accion: "probar_ahora" | "dejar_de_reintentar" }  el reintento automático cuando TAD no
//     respondía: adelantarlo o cortarlo.
//   { accion: "empezar_de_cero" }  en un paso: corta el reintento, descarta el borrador y pide una
//     presentación nueva (rediseño 09/10).
// Presentar, adelantar y empezar de cero no se deshacen: además del proxy, gestores o admin.
// El proxy exige nivel "editar". No espera al robot.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({ accion: z.enum(["pedir", "descartar_borrador", "probar_ahora", "dejar_de_reintentar", "empezar_de_cero"]).default("pedir") });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  const parsed = schema.safeParse((await req.json().catch(() => null)) ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Acción inválida" }, { status: 400 });

  const { data: auth } = await (await createClient()).auth.getUser();
  const userId = auth.user?.id ?? null;
  const db = createAdminClient();
  try {
    const { accion } = parsed.data;
    if (accion === "pedir" || accion === "probar_ahora" || accion === "empezar_de_cero") {
      const { data: t } = await db.from("pvp_tramites").select("es_prueba").eq("id", id).maybeSingle();
      if (!t?.es_prueba) {
        const rechazo = await rechazoIrreversible();
        if (rechazo) return rechazo;
      }
    }
    if (accion === "empezar_de_cero") return NextResponse.json(await empezarDeCero(db, id, userId));
    if (accion === "descartar_borrador") return NextResponse.json({ borrador: await descartarBorrador(db, id, userId) });
    if (accion === "probar_ahora" || accion === "dejar_de_reintentar") {
      await manejarReintento(db, id, accion, userId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(await pedirPresentacion(db, id, { userId }));
  } catch (e) {
    if (e instanceof FaltanDatos) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
