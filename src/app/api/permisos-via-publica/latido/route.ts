import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { revisarLatidoRobot } from "@/lib/permisos-via-publica/robot-latido";

// GET/POST /api/permisos-via-publica/latido — el cron que avisa cuando el robot de TAD deja de
// dar señales (cada 30 minutos, ver vercel.json).
//
// El robot vive en la Mac de la oficina: un corte de luz, de internet o un reinicio de macOS lo
// dejan afuera sin que nadie se entere. Acá sólo se mira su latido en `pvp_robot`; el aviso va
// a la campanita y al canal #permisos-de-andamio-.
//
// Es idempotente: avisa una sola vez por caída (ver robot-latido.ts). GET además de POST porque
// Vercel Cron dispara con GET.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Service role: el cron no trae cookies y este endpoint escribe avisos. */
function servicio() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function autorizado(req: NextRequest): boolean {
  const esperado = process.env.CRON_SECRET;
  // Fallar cerrado: sin secreto configurado no corre nadie.
  if (!esperado) return false;
  return (
    req.headers.get("authorization") === `Bearer ${esperado}` ||
    req.headers.get("x-cron-secret") === esperado
  );
}

async function correr(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json(await revisarLatidoRobot(servicio()));
}

export const GET = correr;
export const POST = correr;
