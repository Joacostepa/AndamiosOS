import { NextRequest, NextResponse } from "next/server";
import { generarInformes } from "@/lib/informes-obra/servicio";
import { cronAutorizado, errorResponse, servicio } from "../_comun";

// POST/GET /api/informes-obra/generar — el cron diario Y el backfill.
//
// UNA SOLA IMPLEMENTACIÓN. El backfill es el mismo endpoint con `?backfill=1`, que saltea
// el filtro de "ya tiene informe" y regenera todo como versión nueva.
//
// POR QUÉ CRON Y NO WEBHOOK: el disparador es un cambio en `sale.order`, no en la OT, así
// que habría que crear una automatización sobre un modelo que hoy no tiene ninguna. Y el
// informe no es urgente: que aparezca a la mañana siguiente no cambia nada. Lo decisivo
// es que un webhook perdido deja la obra sin informe para siempre y en silencio, mientras
// que un cron que barre es idempotente — lo que no se generó ayer se genera hoy.
//
// GET además de POST porque Vercel Cron dispara con GET.

export const dynamic = "force-dynamic";
// El backfill recorre ~278 obras. La lectura es en lote (~6 RPCs), pero cada insert a
// Supabase suma, y las OTs y partes de 278 obras son varios miles de filas.
export const maxDuration = 300;

async function correr(req: NextRequest) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const backfill = req.nextUrl.searchParams.get("backfill") === "1";

  try {
    // Service role: la tabla no tiene política de insert para `authenticated`.
    const resultado = await generarInformes(servicio(), { backfill });
    return NextResponse.json(resultado);
  } catch (e) {
    return errorResponse(e);
  }
}

export const GET = correr;
export const POST = correr;
