import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarEvento } from "@/lib/permisos-via-publica/endosos";

// POST /api/permisos-via-publica/tramites/:id/borradores — "Ya los borré": los borradores de TAD
// que se descartaron al empezar de cero ya se borraron a mano (o con robot/borrar-tad-borrador.mjs).
// Sólo saca el aviso "Para limpiar en TAD" de la ficha. El proxy exige "editar".

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  const db = createAdminClient();
  const { data } = await db.from("pvp_tareas").select("id, resultado").eq("tramite_id", id).eq("tipo", "tad_presentar");
  const ahora = new Date().toISOString();
  const borrados: number[] = [];
  for (const t of data ?? []) {
    const r = (t.resultado ?? {}) as { borrador_descartado?: number; borrador_limpiado_at?: string };
    if (!r.borrador_descartado || r.borrador_limpiado_at) continue;
    const { error } = await db.from("pvp_tareas").update({ resultado: { ...r, borrador_limpiado_at: ahora } }).eq("id", t.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    borrados.push(r.borrador_descartado);
  }
  if (borrados.length) await registrarEvento(db, id, "presentacion_tad", `Se borraron en TAD los borradores ${borrados.join(", ")}.`, { borradores: borrados }, "persona");
  return NextResponse.json({ ok: true });
}
