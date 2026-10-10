import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sincronizarEmpleado } from "@/lib/personal/sync-odoo-servidor";

// POST /api/odoo/webhooks/empleados?secret=...
//
// Receptor del automatismo "AndamiosOS sync empleados" (scripts/odoo-webhook-empleados.mjs):
// Odoo avisa cuando se crea un hr.employee o cambia su nombre, archivado, celular, tarea,
// régimen o DNI. Decisión del dueño (10/10): Legajos se actualiza solo desde Odoo, en un
// solo sentido. La regla de qué se crea, qué se actualiza y qué se avisa está en
// src/lib/personal/sync-odoo.ts.
//
// Como los demás webhooks de Odoo: el secret va en el query string (Odoo no manda headers
// custom), el webhook corre DENTRO del guardado del empleado en Odoo, así que se contesta
// apenas se valida el secret y el trabajo va en after(). Del payload sólo se usa el id: el
// empleado se relee fresco de Odoo. Es idempotente (repetirlo no cambia nada; dos altas a la
// vez chocan con el UNIQUE de personal.odoo_employee_id). Lo dudoso va a la campanita de
// quien tiene Legajos en editar; el resto queda en el log de Vercel.
//
// Pública en el proxy por el prefijo /api/odoo/webhooks (src/lib/supabase/proxy.ts).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function ids(body: unknown): number[] {
  const pick = (r: unknown) => Number((r as { id?: unknown })?.id ?? r) || 0;
  if (Array.isArray(body)) return body.map(pick).filter(Boolean);
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (Array.isArray(b.records)) return b.records.map(pick).filter(Boolean);
    if (Array.isArray(b.ids)) return b.ids.map((x) => Number(x)).filter(Boolean);
    const id = Number(b.id ?? b._id ?? b.record_id) || 0;
    return id ? [id] : [];
  }
  return [];
}

export async function POST(req: NextRequest) {
  const secreto = process.env.ODOO_SYNC_SECRET;
  if (!secreto || req.nextUrl.searchParams.get("secret") !== secreto) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const empleados = ids(await req.json().catch(() => ({})));
  if (empleados.length === 0) return NextResponse.json({ error: "Sin id en el payload" }, { status: 400 });

  after(async () => {
    const db = createAdminClient();
    for (const id of empleados) {
      try {
        const r = await sincronizarEmpleado(db, id);
        console.log(`[webhook empleado ${id}] ${r.log.join(" · ") || "al día"}${r.errores.length ? ` · ERRORES: ${r.errores.join(" · ")}` : ""}`);
      } catch (e) {
        console.error(`[webhook empleado ${id}] falló la sincronización`, e);
      }
    }
  });
  return NextResponse.json({ ok: true, encolados: empleados }, { status: 202 });
}
