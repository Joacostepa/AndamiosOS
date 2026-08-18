import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchOTById, mapOTToApp, odooOTObraId } from "@/lib/odoo/ordenes-trabajo";

// POST /api/odoo/webhooks/ordenes-trabajo?secret=...
//
// Receptor del webhook de Odoo (Automated Action on_create_or_write sobre x_aba_orden_trabajo).
// Odoo manda el/los id(s); re-leemos fresco y hacemos upsert por odoo_ot_id. La obra se
// resuelve del espejo de obras; si la Obra no está espejada aún, se omite (Obras sincroniza
// primero). En el update NO se pisa `estado` ni la habilitación (app-owned). AUTH: secret en query.
//
// RENDIMIENTO (crítico): el webhook de Odoo es SÍNCRONO — corre dentro de la transacción
// que guarda la OT, así que el usuario que aprieta "Guardar" en Odoo espera todo lo que
// tarde este handler. Y este handler lee de vuelta contra Odoo (~800 ms) más 2-3 queries
// a Supabase: eran varios segundos pegados a cada guardado.
//
// Por eso se contesta apenas se valida el secret y el espejado se hace en `after()`, que
// en Vercel mantiene viva la invocación (waitUntil) después de mandar la respuesta. La
// sincronización es igual de confiable; lo único que se pierde es el detalle en el body,
// que Odoo descarta.

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function extractIds(body: unknown): number[] {
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

async function resolveObraId(obraOdooId: number | null): Promise<string | null> {
  if (!obraOdooId) return null;
  const { data } = await supabase
    .from("obras").select("id").eq("odoo_obra_id", obraOdooId).maybeSingle();
  return (data?.id as string) ?? null;
}

/** El espejado propiamente dicho. Corre fuera del camino crítico del guardado en Odoo. */
async function espejar(id: number): Promise<string> {
  const now = new Date().toISOString();
  const ot = await fetchOTById(id);
  if (!ot) return "no_encontrada_en_odoo";

  const obraId = await resolveObraId(odooOTObraId(ot));
  const values = mapOTToApp(ot, obraId);
  if (!values) return "omitida_sin_obra";

  // Buscar la OT en la app por odoo_ot_id; si no, por x_andamios_id (echo de una
  // adicional creada en la app que aún no tenía odoo_ot_id) → evita duplicar.
  let existing = (await supabase
    .from("ordenes_trabajo").select("id").eq("odoo_ot_id", id).maybeSingle()).data;
  if (!existing && ot.x_andamios_id) {
    existing = (await supabase
      .from("ordenes_trabajo").select("id").eq("id", ot.x_andamios_id).maybeSingle()).data;
  }
  if (existing) {
    const refresh = { ...values, odoo_synced_at: now }; // estado/habilitación app-owned → no se pisan
    delete (refresh as { estado?: unknown }).estado;
    await supabase.from("ordenes_trabajo").update(refresh).eq("id", existing.id);
    return "actualizada";
  }
  await supabase.from("ordenes_trabajo").insert({ ...values, odoo_synced_at: now });
  return "insertada";
}

export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get("secret") !== process.env.ODOO_SYNC_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const ids = extractIds(body);
  if (ids.length === 0) {
    return NextResponse.json({ error: "Sin id en el payload" }, { status: 400 });
  }

  // Un fallo acá no puede tirar abajo el guardado en Odoo (ya se respondió 202): se
  // registra en los logs de la función y la próxima escritura de esa OT lo reintenta.
  after(async () => {
    for (const id of ids) {
      try {
        console.log(`[webhook OT ${id}] ${await espejar(id)}`);
      } catch (e) {
        console.error(`[webhook OT ${id}] falló el espejado`, e);
      }
    }
  });

  return NextResponse.json({ ok: true, encolados: ids }, { status: 202 });
}
