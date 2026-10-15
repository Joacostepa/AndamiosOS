import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calcularSinCache } from "@/lib/direccion/servidor";
import { guardarSnapshot } from "@/lib/direccion/snapshot";
import { invalidarPantalla } from "@/lib/direccion/cache";
import { PANTALLAS_IDS } from "@/lib/direccion/tipos";

// GET/POST /api/cron/direccion — el snapshot nocturno de Dirección (04:30 BA, después del
// cron de USD de Odoo de las 04:00; ver vercel.json, en UTC).
//
// Calcula cada pantalla SIN caché (lee Odoo, sólo lectura), guarda el resultado en
// direccion_snapshots (respaldo cuando Odoo no responde + historia para comparar) y deja la
// caché fresca. La Semana va al final: usa las demás. Si la tabla no existe todavía, igual
// calcula (sirve de calentamiento) y lo dice en la respuesta.
//
// Protegido por CRON_SECRET, falla cerrado (como /api/cron/personal-odoo). GET porque
// Vercel Cron dispara con GET. Público en el proxy (sin sesión).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Comparación en tiempo constante (no deja adivinar el secreto midiendo cuánto tarda). */
function igual(a: string | null, b: string): boolean {
  if (a == null) return false;
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

function autorizado(req: NextRequest): boolean {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) return false;
  return igual(req.headers.get("authorization"), `Bearer ${esperado}`) || igual(req.headers.get("x-cron-secret"), esperado);
}

async function correr(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const db = createAdminClient();
  const orden = [...PANTALLAS_IDS.filter((p) => p !== "semana"), "semana" as const];
  const log: Record<string, string> = {};
  for (const p of orden) {
    try {
      const r = await calcularSinCache(p);
      const g = await guardarSnapshot(db, r);
      log[p] = g.ok ? `ok (${r.cifras.length} cifras)` : `calculado, sin guardar: ${g.motivo}`;
    } catch (e) {
      log[p] = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  invalidarPantalla("semana"); // todas
  console.log(`[cron direccion] ${Object.entries(log).map(([k, v]) => `${k}: ${v}`).join(" · ")}`);
  return NextResponse.json({ log });
}

export const GET = correr;
export const POST = correr;
