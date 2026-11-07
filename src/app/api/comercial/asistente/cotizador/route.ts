import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Render } from "@/lib/parametros-cotizacion/tipos";
import { abrirConversacion } from "@/lib/asistente/nueva-conversacion";
import { guardarBorrador, leerBorrador } from "@/lib/asistente/datos";
import { recalcular } from "@/lib/asistente/borrador";
import { aplicarFormulario, formularioDesdeBorrador } from "@/lib/cotizador-rapido/formulario";
import { hoyBA, leerTarifas } from "@/lib/cotizador-rapido/servidor";
import { errorResponse, exigirModulo, invalido } from "../../_comun";

// GET  /api/comercial/asistente/cotizador — lo que la pantalla necesita para calcular al
//      instante (las tarifas vigentes) y la biblioteca de renders con URLs para verlos.
// POST /api/comercial/asistente/cotizador { tipo? } — un presupuesto nuevo del cotizador rápido:
//      una conversación del asistente (para que el chat trabaje sobre el mismo borrador) con su
//      borrador, ya en el tipo elegido. No llama al modelo.

export const dynamic = "force-dynamic";

export async function GET() {
  const quien = await exigirModulo("asistente-comercial", "ver");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    const [tarifas, { data: filas }] = await Promise.all([
      leerTarifas(db),
      db.from("cotizacion_renders").select("id, tipo, nombre, path, por_defecto").order("tipo").order("created_at"),
    ]);
    const renders = filas ?? [];
    let urls: Record<string, string> = {};
    if (renders.length) {
      const { data: firmadas } = await db.storage.from("comercial").createSignedUrls(renders.map((r) => r.path), 3600);
      urls = Object.fromEntries((firmadas ?? []).filter((f) => f.signedUrl).map((f) => [f.path, f.signedUrl]));
    }
    return NextResponse.json({ tarifas, renders: renders.map((r) => ({ ...r, url: urls[r.path] ?? null })) as Render[] });
  } catch (e) {
    return errorResponse(e);
  }
}

const schema = z.object({ tipo: z.enum(["bandeja", "fachada", "desglosado"]).optional() });

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return invalido(parsed.error);
  const quien = await exigirModulo("asistente-comercial", "editar");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    const [conv, tarifas] = await Promise.all([abrirConversacion(db, quien.userId), leerTarifas(db)]);
    await db.from("asistente_conversaciones").update({ titulo: "Cotizador" }).eq("id", conv.id);
    const b = await leerBorrador(db, conv.borrador_id!);
    if (!b) throw new Error("No se pudo crear el presupuesto.");
    const f = formularioDesdeBorrador(b.datos);
    f.tipo = parsed.data.tipo ?? "bandeja";
    const datos = aplicarFormulario(b.datos, f, { tarifas });
    const resultado = recalcular(datos, { tarifas, lista: null, hoy: hoyBA() });
    await guardarBorrador(db, b, { datos, resultado, origen: "panel", patch: { cotizador: { nuevo: f.tipo } }, autorId: quien.userId });
    return NextResponse.json({ conversacion: { id: conv.id } });
  } catch (e) {
    return errorResponse(e);
  }
}
