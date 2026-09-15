import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/permisos-via-publica/revisar
//
// "Revisar ahora": deja una tarea en la cola y el robot la toma en la próxima vuelta (cada
// ~20 s mientras está prendido). No espera el resultado: la revisión tarda un par de
// minutos y la pantalla se entera sola cuando termina.
//
// Diez clics son UNA revisión: el índice único de pvp_tareas sobre las abiertas rechaza la
// segunda, y eso acá no es un error.

export const dynamic = "force-dynamic";

export async function POST() {
  const db = await createClient();
  const { error } = await db.from("pvp_tareas").insert({ tipo: "tad_revisar" });
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, yaPedida: error?.code === "23505" });
}
