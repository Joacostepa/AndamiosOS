import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sincronizarTodos } from "@/lib/personal/sync-odoo-servidor";
import { OdooError } from "@/lib/odoo/client";

// GET/POST /api/cron/personal-odoo — el control diario de Legajos contra Odoo (05:30 BA,
// ver vercel.json).
//
// RESPALDO DEL WEBHOOK (/api/odoo/webhooks/empleados): si un aviso de Odoo se perdió (deploy
// caído, Vercel lento, la regla desactivada un rato), esto lo arregla a la mañana siguiente.
// Recorre TODOS los empleados de Odoo, activos y archivados, con la misma lógica
// (src/lib/personal/sync-odoo.ts). Además desactiva los legajos cuyo empleado se borró de
// Odoo. Lo que no pudo cruzar o es dudoso va a la campanita de quien tiene Legajos en editar,
// una sola vez (clave).
//
// Protegido por CRON_SECRET, falla cerrado (como /api/alertas/barrido). GET porque Vercel
// Cron dispara con GET.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  try {
    const r = await sincronizarTodos(createAdminClient());
    console.log(`[cron personal-odoo] ${r.log.join(" · ") || "todo al día"}`);
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof OdooError ? e.message : e instanceof Error ? e.message : String(e);
    console.error("[cron personal-odoo]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export const GET = correr;
export const POST = correr;
