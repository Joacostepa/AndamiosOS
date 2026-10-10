import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { leerBandeja, yoEnElPanol } from "@/lib/panol/bandeja-servidor";

// GET /api/panol/bandeja — la bandeja de la oficina del pañol, ya armada.
//
// Pasa por el servidor (y no directo a Supabase como el resto del pañol) por Odoo: la
// bandeja nombra obras ("OT 4812 · Av. Corrientes 1847") y Odoo sólo se lee de este lado.
// Lee con la sesión del usuario: la RLS del pañol es la que decide qué ve. El proxy ya
// exige el módulo `panol` para /api/panol/*.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await createClient();
    const { data } = await db.auth.getUser();
    if (!data.user) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
    const yo = await yoEnElPanol(db, data.user.id);
    return NextResponse.json(await leerBandeja(db, yo));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
